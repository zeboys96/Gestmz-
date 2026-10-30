# Estado dos requisitos (28/10/2026) — comparação com o código do ramo `desenvolvimento/atualizacoes`

Legenda: **FEITO** = código no ramo + testes; **PARCIAL** = falta algo para ter efeito real; **FALTA** = só desenho/documentação. «Simulação» = Chromium com cliente Supabase simulado ou Postgres local, **não** o Supabase real nem um telefone/PC real.

| # | Requisito | Estado | Evidência e limites |
|---|---|---|---|
| 1 | Regras de trabalho | Cumpridas | Só o ramo de desenvolvimento; `main`, `backup/*` intactos; sem merge/Release; nenhuma migração em produção; nenhum dado/conta tocado; gatilho `push:` mantido; sem chaves criadas. Código da câmara (`lerCamera`, `criarLeitor`, `carregarZXing`, `erroCamera`) **idêntico** ao de `main` (comparação por hash); `www/recibo.js` não alterado. |
| 2 | Caixa sem stock/esgotados/inventário | **PARCIAL** | Interface e leituras por função no cliente (commit `283f08f`) + **migração 12** que fecha o `SELECT` direto em produtos (custo/mínimo), lotes, vendas e lojas e filtra por papel no servidor (74 verificações na réplica). **Em produção só passa a valer quando a migração 12 for aplicada**: hoje um caixa com a API direta ainda lê `lotes`. |
| 3 | Gerente sem lucros | **PARCIAL** | Idem: sem `custo`/`custo_un`/lucro/valor de stock na interface; servidor: migração 12 (custos nulos, `custo_un` removido das vendas, só o dono grava custos). Mesma condição. |
| 4 | Planos/subscrição só para o dono e o administrador | **PARCIAL** | Interface sem plano/teste/validade/avisos para gerente e caixa («loja indisponível» apenas); servidor: `plataforma` e campos de plano só para dono e `super` (migração 12). Mesma condição. |
| 5 | Crédito e seleção de cliente | **FEITO (simulação)** | Cliente, pagamento e desconto só se limpam depois de a venda gravada/guardada ou cancelada com autorização (`c001838`); `tests/pdv-cliente.test.js`: dinheiro, crédito, falha de gravação (nada se limpa), offline, cancelamento com/sem autorização, falha posterior de leitura. Não testado em telefone. |
| 6 | Autorização temporária | **FALTA (desenho)** | `docs/AUTORIZACAO-TEMPORARIA-DESENHO.md`. Achado importante: só `anular_venda` é imposta no servidor; retirar item/cancelar venda em curso são apenas JavaScript e **não podem** ser impedidas por um código. Hoje as credenciais do gerente são digitadas no aparelho do caixa. |
| 7 | Gestão dos donos pelo superadministrador | **PARCIAL / desenho** | Já existe suspender/reativar a **loja** (reversível). Falta suspender a **conta do dono** (a API não o permite) — `docs/GESTAO-DONOS-DESENHO.md`: efeitos nos dados, 15 relações `on delete cascade` (eliminar loja = apagar tudo; não expor), só existe o papel `super`. Nada alterado em contas reais. |
| 8 | Alteração normal de senha | **PARCIAL** | Novo: pede **senha atual** (reautenticação), confirmação e nova diferente; para super, dono, gerente e caixa (`tests/senha-normal.test.js`, simulação). Limite: é uma barreira da app; quem tiver uma sessão pode chamar o Supabase diretamente — impedi-lo exige a definição do Supabase Auth «exigir senha atual», que **não** alterei. Senhas nunca são guardadas nem registadas por este código. |
| 9 | Recuperação A + C | **FALTA (desenho)** | `docs/RECUPERACAO-A-C-DESENHO.md`: prova de identidade, ameaças, limites, atraso de 1 h avaliado (1 h para C; 24 h para A), MFA, perda de códigos, testes. Migração 11 depende da 10; Edge Function **não criada**. |
| 10 | Verificação facial | **FALTA (opções)** | `docs/VERIFICACAO-FACIAL-OPCOES.md`: AWS Face Liveness $0,015/verificação + $0,001/comparação; Sumsub $1,35/verificação com mínimo $149/mês; várias linhas «a confirmar». Nada integrado. |
| 11 | Ecrã de login | **FEITO** | O texto foi removido (`baa123d`); campos de e-mail e senha, botão Entrar e a opção condicional do dono continuam; teste em `tests/dono-cliente.test.js` (6 respostas do servidor + offline). Papéis e permissões não foram tocados por esta alteração. |
| 12 | Migração 10 | **Documentada** | `docs/MIGRACAO-10-REVISAO.md` (efeitos, backup, reversão, riscos); testes de atualização (15) e reversão. Limites: réplica Postgres 16 ≠ Supabase real; **precisa de um projeto Supabase de teste**. Não foi executada nem combinada com outras. |
| 13 | Testes | ver §2 | |
| 14 | Relatório | este documento + resposta | |

## 1. Migração 12 (nova para a sua revisão; **não aplicada**)
Altera: funções novas `produtos_loja`, `lotes_loja`, `vendas_loja`, `minha_loja_info`, `admin_listar_lojas`, `_itens_visiveis`, `sinais_loja`, `_sinal_loja`; `registar_venda` passa a embrulhar a função **que existir em produção** (renomeia-a para `_registar_venda_interna`; só a renomeia se ainda não estiver embrulhada) em vez de a reescrever; fecha `SELECT` direto em `produtos`, `lotes`, `vendas`, `lojas`; política de `plataforma` só para dono e `super`; trigger de custos só para o dono; retira produtos/lotes/vendas da publicação em tempo real. Reversão testada (`reverter_migracao_12.sql`).
**Dependência crítica:** as apps já instaladas fazem `select('*')` nestas tabelas e **deixam de funcionar** depois da migração 12. Ordem obrigatória: (1) APK/PC novos distribuídos e instalados em todos os aparelhos (a app nova funciona antes e depois da 12), (2) só então aplicar a 12. Como a atualização por cima do APK atual depende da assinatura (ver `ANDROID-ASSINATURA.md`), isto exige a reinstalação planeada **sem perder vendas por sincronizar**.
Compatibilidade com produção: a migração não substitui as funções de produção pela do repositório; a comparação de definições feita antes (41/41 iguais, exceto comentários) foi antes das migrações 10–12 e **tem de ser repetida contra produção imediatamente antes de qualquer aplicação**.

## 2. Testes (todos em simulação local; nenhum telefone Android nem Windows real)
| Suite | Resultado hoje |
|---|---|
| `node --test tests/*.test.js` | ver relatório final (inclui db, navegador, desktop, versões) |
| `tests/db/correr.sh` (inicialização, isolamento, IDOR, PIN, concorrência, papéis) | 83/83 |
| `tests/db/atualizacao.sh` (migração 10 sobre dono existente) / `reversao.sh` | 15/15 / 2/2 |
| `tests/db/permissoes.sh` (migração 12) / `reversao12.sh` | 74/74 / 2/2 |
| `tests/pdv-cliente`, `papeis-ui`, `senha-normal`, `dono-cliente`, `barra-nav` | passam (simulação de navegador) |
Em falta: autorizações temporárias, recuperação (A e C), facial, gestão de donos — **não implementados, portanto sem testes**. Câmara/recibos: sem teste automático do leitor (só comparação de código inalterado); precisam de teste real em telefone.

## 3. Itens fora do repositório (exigem a sua autorização/ação)
Migrações 10, 11, 12, 13, 14 (produção); Edge Function de recuperação; MFA do superadministrador; definições do Supabase Auth (senha atual, limites de login, proteção de senhas vazadas); criação da chave Android e variáveis; fornecedor facial e conta; proteção de `main`; remoção do gatilho `push:` depois do merge.

## Atualização 28/10/2026 — despesas e lucro só para o dono
- **Decisão confirmada:** só o `dono` vê despesas e lucro; gerente e caixa não, nem pela API/base de dados.
- **Servidor (migração 12, por aplicar):** políticas `p_despesas_sel/ins/del` só para `meu_papel()='dono'` (sem UPDATE concedido); custos já escondidos por `produtos_loja()`/`vendas_loja()`; nenhuma função devolve lucro ao gerente. Reversão em `reverter_migracao_12.sql`.
- **Interface:** menu Despesas só para o dono; vista bloqueada; relatórios sem despesas/lucro/resultado para gerente e caixa (nem pedem `despesas`).
- **Testes locais:** `permissoes.sh` 90/90 (+15 novos; controlo negativo com a política antiga falha 7), `correr.sh` 83/83 (também com migração 12), `atualizacao.sh` 15/15, reversões 10 e 12 passam, `node --test` 19 ok + 1 saltado (o de BD sem variáveis PG; corre à parte). Interface em Chromium com cliente simulado.
- **Desenho TOTP:** `docs/TOTP-DESENHO.md`. **Assinatura APK:** `docs/ANDROID-ASSINATURA.md` secção 6.

## Atualização 31/10/2026 — TOTP, cópia das vendas pendentes, certificado do APK de teste
- **TOTP (1A/2A/3A):** implementado só em desenvolvimento — `docs/TOTP-IMPLEMENTACAO.md`. Migração 15, Edge Function e interruptor NÃO aplicados/publicados; obrigatório do super continua DESLIGADO e protegido por trava.
- **Cópia/restauro das vendas pendentes:** `www/copia.js` (Conta → «Cópia das vendas por enviar»); só na mesma conta/loja, resumo SHA-256, validação campo a campo, tudo-ou-nada, sem custos; o servidor continua idempotente (`vendas_ref_cliente_uq`). Testado em Node e Chromium simulado; **não em telemóvel real**.
- **Certificado do APK de teste:** passo informativo em `versao.yml` (SHA-256 no resumo da execução e no ficheiro `.certificado.txt`); falta correr o workflow duas vezes para ver valores diferentes.
- Chave Android: **não criada**.

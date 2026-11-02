# GestMZ — revisão técnica da fase final e plano de execução (28/10/2026)

Âmbito: **só revisão e plano**. Não foi implementado TOTP nem verificação facial, não foi executada nenhuma migração, não foi alterado nenhum dado/configuração de produção, sem merge nem versão. Produção foi consultada **apenas por leitura**. Ramo: `desenvolvimento/atualizacoes` (HEAD `6c911a8` + este documento).

## 1. Migrações: o que existe, o que não existe, dependências reais
| Nº | Ficheiro | Estado | Em produção |
|---|---|---|---|
| base + 05–09 | `schema.sql`, `migracao_05…09` | aplicadas | Sim (14 migrações registadas no Supabase, até `m09c`) |
| **10** | `migracao_10_inicializacao_segura.sql` (+ `reverter_`) | escrita, testada em réplica | **Não** (colunas `dono_inicializado`/`inicializacao_aberta` e `auditoria_plataforma` inexistentes) |
| **11** | — | **NÃO EXISTE** (número reservado à recuperação A+C; só desenho) | Não |
| **12** | `migracao_12_permissoes_por_papel.sql` (+ `reverter_`) | escrita, testada em réplica | **Não** (`produtos_loja`, `sinais_loja` inexistentes) |
| 13 | — | **NÃO EXISTE** (autorização temporária; só desenho) | Não |
| **14** | — | **NÃO EXISTE** (gestão de donos; só desenho) | Não |
Prova de que produção é a base que as migrações assumem (leitura, 28/10): as **41 funções** públicas, as **28 políticas RLS**, os **26 privilégios de tabela**, os **80 de coluna**, os **6 triggers** e o RLS das **19 tabelas** têm resumos idênticos aos obtidos do repositório (`schema.sql` + 05–09) na réplica (as funções comparadas sem comentários nem espaços). A publicação em tempo real tem as 6 tabelas que a migração 12 espera. Dados atuais: 1 dono do sistema ativo, 2 lojas, 6 perfis, 11 vendas, 4 produtos.

Dependências reais:
- **10 ↔ 12:** independentes no SQL — aplicam sem erro em qualquer ordem e a 12 é idempotente (testado). Não aplicar na mesma janela.
- **12 → aparelhos:** as apps já instaladas fazem `select('*')` em `produtos`, `lotes`, `vendas`, `lojas` e **deixam de funcionar** após a 12. A app nova funciona antes e depois (testado em simulação). Logo: **app nova em todos os aparelhos primeiro**, só depois a 12.
- **11 → 10:** precisa de `auditoria_plataforma` e da proteção do `super`; e do **MFA do superadministrador** (verificação `aal2`) e de uma **Edge Function**.
- **13:** independente das anteriores; nova RPC para anular vendas com código.
- **14 → 10:** usa a auditoria da plataforma e a proteção do `super`; beneficia do `aal2`.
Sequência proposta de base de dados: **10 → (app nova distribuída) → 12 → [TOTP na app] → 11 → 13 → 14**, uma por janela, cada uma com cópia prévia e verificação.

## 2. Estado de cada melhoria
| Melhoria | Código | Servidor (produção) |
|---|---|---|
| Dono do sistema: inicialização segura | feito (`www/core.js`) | **migração 10 por aplicar** — hoje o botão falha fechado mas o servidor ainda é o antigo |
| Caixa sem stock / gerente sem lucro / plano só para dono | feito (UI + funções) | **migração 12 por aplicar** — **hoje a API direta ainda devolve esses dados** (prova estrutural: as políticas de produção são as do `schema.sql`, `loja_id = minha_loja()` sem filtrar o papel) |
| Cliente limpo depois da venda | feito (simulação) | — |
| Barra inferior, login sem texto | feito (simulação) | — |
| Alteração normal de senha com senha atual | feito (simulação) | barreira só na app (ver §4) |
| TOTP | **não iniciado** (avaliado §3) | — |
| Recuperação A+C | só desenho | migração 11 + Edge Function |
| Autorização temporária | só desenho | migração 13 |
| Gestão dos donos | só desenho | migração 14 |
| Assinatura Android | verificação do certificado no CI feita; **chave por criar** | — |
| Verificação facial | **fora de âmbito** | — |

## 3. TOTP (Google Authenticator) — avaliação
- **Suporte:** o Supabase Auth tem MFA por TOTP, «gratuito e ativo em todos os projetos por omissão» ([docs](https://supabase.com/docs/guides/auth/auth-mfa/totp)): `mfa.enroll` devolve QR e segredo (URI `otpauth://totp/…`), `challenge`/`verify`, `listFactors`, `getAuthenticatorAssuranceLevel`. Código de 30 s, tolerância de um intervalo. É TOTP padrão (RFC 6238): **espera-se** compatibilidade com o Google Authenticator; **não foi testado** com a app real.
- **Imposição no servidor:** o nível `aal2` vai no JWT (`aal`); as funções do dono do sistema podem exigir `auth.jwt()->>'aal' = 'aal2'` e as tabelas podem ter política `restrictive` ([docs](https://supabase.com/docs/guides/auth/auth-mfa)). Sem `aal` o JWT é `aal1`. Cuidado: após desativar o fator, um JWT antigo continua `aal2` até renovar.
- **Recuperação e códigos:** **o Supabase não fornece códigos de recuperação** e a documentação não descreve recuperação de autenticador perdido. É preciso construir:
  1. **Códigos de recuperação próprios** (8, de uso único, 80 bits, só o hash guardado), gerados após o primeiro fator verificado.
  2. Um código **não eleva o JWT a `aal2`**. Usá-lo serve para **repor o fator**: apagar o fator perdido e inscrever outro. Isso exige a API de administração (Edge Function, chave interna do Supabase) ou SQL de administração sobre `auth.mfa_factors` (tabela interna, **não suportado**). A mesma Edge Function serviria a recuperação A+C.
  3. **Rede de segurança final:** o proprietário do projeto Supabase (login separado, no painel) remove o fator. Se o painel oferece isso diretamente **não verifiquei**; o SQL Editor existe sempre.
- **Quem:** obrigatório para o `super` (a recuperação A e a gestão de donos exigem `aal2`); recomendado depois para donos de loja; opcional por omissão para os restantes.
- **Limites de quem trabalha só no telemóvel:** a app e o autenticador no mesmo aparelho protegem contra roubo/phishing da senha, não contra perda ou roubo do telemóvel desbloqueado. Guardar os códigos fora do telemóvel de trabalho e, se possível, registar um segundo autenticador.
- **Trabalho:** UI (inscrição com QR, desafio ao iniciar sessão, gestão de fatores), verificações `aal2` na migração 11/14, códigos de recuperação, testes. **Testável em réplica:** a lógica `aal2` com JWT simulado e os códigos. **Só testável com um projeto Supabase de teste:** o ciclo TOTP real e a reposição do fator. Fora de questão antes disso: ativar a exigência em produção sem os códigos já gerados (risco de **bloquear o único dono do sistema**).

## 4. Segurança dos papéis (provado vs. por provar)
Provado em réplica (83 + 15 + 74 verificações, ver §5): isolamento entre lojas com IDs trocados (20+ ações), sem escalada para `super`, sem 2.º dono, `super` não se altera pela API, caixa sem stock/custos/plano, gerente sem custos/lucro/plano, só o dono vê o plano, PIN bloqueia 5 falhas, RPCs administrativas só para o `super`.
**Hoje em produção (sem 10 e 12):** o caixa e o gerente, usando a API diretamente, ainda leem `lotes`, `produtos.custo`, `vendas.itens[].custo_un` e `lojas`/`plataforma` (plano); `nome_de()` ainda revela nomes entre lojas; `reivindicar_super` ainda não é atómica (mas só atua sem dono; há 1 ativo).
Pontos em aberto que exigem **decisão**:
- **Despesas visíveis ao gerente**: com as vendas, permitem calcular um resultado aproximado. Esconder o «lucro» na interface não impede isso; decidir se as despesas passam a ser só do dono.
- A alteração de senha com senha atual é uma **barreira da app**; quem tenha uma sessão pode chamar o Supabase diretamente. O fecho real é a definição do Supabase Auth «exigir senha atual», que não foi alterada.
- Autorização do gerente: credenciais digitadas no aparelho do caixa até existir a migração 13; e retirar item/cancelar venda em curso **não são impedíveis** no servidor.
- Auth: registo público aberto (cria contas sem acesso), limites de login do Supabase por confirmar, proteção de senhas vazadas desligada.

## 5. Testes
Comprovados hoje (28/10): `node --test tests/*.test.js` = **20/20**; `correr.sh` 83/83 (também com a 12); `atualizacao.sh` 15/15; `permissoes.sh` 74/74; reversões 10 e 12 passam; `verificar-versoes.js` consistente (1.1.0, versionCode 10100).
Faltam (nada disto existe):
1. TOTP: `aal2` aceite/recusado, códigos de recuperação (válido, inválido, usado, regenerado), perda do autenticador.
2. Recuperação A+C (aprovada, rejeitada, expirada, repetida, segredo errado, sem MFA, pedidos para e-mails inexistentes).
3. Autorização temporária (válida, expirada, reutilizada, outro caixa/loja/objeto, auto-aprovação, tentativas).
4. Gestão de donos (só `super`, alvo `super` recusado, reversibilidade).
5. **Câmara e recibos**: sem teste automático; possível com o Chromium (câmara falsa) e impressão/PDF. Só o código está inalterado (comparação).
6. Fila offline e sincronização (`gestmz_fila`) com falhas e repetições.
7. **Teste da app antiga contra o servidor migrado** (para provar o que parte) e da nova contra os dois.
8. Todos os testes contra um **projeto Supabase de teste** (PostgREST/Auth reais, tempo real, migrações aplicadas pelo mesmo caminho que em produção).
9. Dispositivos reais: vários Android (barra, câmara, instalação, atualização) e Windows (instalador, atualização).
10. Última construção em CI do APK/instalador é **anterior** às alterações de interface (o gatilho temporário só dispara quando `versao.yml` muda): as alterações recentes ainda **não foram compiladas em CI**.

## 6. Assinatura e atualização do APK
- Identidade: `mz.gestmz.app`; `versionName` = `package.json` (1.1.0); `versionCode` = 10100 (major×10000+minor×100+patch); o CI falha se o APK não corresponder.
- O APK instalado vem de `apk.yml` (**debug**, chave efémera por execução). Não consegui inspecionar o ficheiro instalado nem descarregar artefactos; a incompatibilidade com uma versão assinada é a **expectativa**, não um facto verificado. Atualizar por cima falhará (sem apagar dados); a transição exige reinstalar uma vez, **depois de sincronizar todas as vendas pendentes**.
- `versao.yml` (modo `candidata`): exige os 4 segredos, compila `assembleRelease`, verifica `apksigner` e agora **falha se a impressão digital não for a de `ANDROID_CERT_SHA256`**; cria só rascunho, no ambiente `aprovacao-release` (configuração do ambiente **não verificável** daqui). Segredos de repositório podem ser lidos por qualquer workflow de quem tenha escrita: mover para o ambiente protegido (ver `ANDROID-ASSINATURA.md`).
- Chave: gerar num Codespace no navegador do telemóvel, colar nos segredos, 2 cópias cifradas fora do telemóvel, impressão digital como variável pública, apagar o Codespace — **ainda não feito; precisa da sua autorização**. Perder a chave obriga a nova reinstalação geral.
- Atualização na app: abre o URL da Release (`github.com/zeboys96/Gestmz-/releases/download/vX.Y.Z/…`, regex rígida) no navegador; mostra o SHA-256 de `versions.json`; a integridade real é HTTPS + verificação de assinatura pelo Android. `versions.json` vazio ⇒ atualizações **desativadas**.
- Ordem proposta: chave → candidata assinada → instalar num 2.º aparelho → plano de transição (sync, reinstalar) → só então ativar `versions.json`.

## 7. Web e computador
- **Web:** publica-se com o merge em `main` (`publicar.yml` → GitHub Pages; a ligação à Vercel não é verificável daqui e não há `vercel.json`). Merge = nova app para todos os utilizadores web de imediato; a app nova é compatível com o servidor antigo e o migrado. Service worker `gestmz-v8`, rede primeiro (cache como reserva): ficheiros novos têm de entrar em `FILES`. Sem política CSP no `index.html`.
- **Computador (Electron 33):** protocolo `app://`, `contextIsolation`, sem `nodeIntegration`, só permissão de câmara, navegação externa controlada, updater (`autoDownload=false`, `allowDowngrade=false`, sem pré-lançamentos), NSIS por utilizador, `deleteAppDataOnUninstall=false`. A construção em CI funcionou; **não foi instalado num Windows real**.
- Riscos: instalador **sem assinatura de código** (aviso SmartScreen; o updater verifica o hash do `latest.yml` mas não o editor); **sem `package-lock.json`** (versões flutuantes nas compilações de lançamento); a ligação das atualizações do computador à Release não está validada de ponta a ponta.

## 8. Backups, riscos e recuperação
Antes de **cada** migração: (1) confirmar no painel do Supabase se há cópia automática do seu plano (não vi o plano); (2) cópia manual do que a migração toca (definições de funções, linha de `plataforma`, `perfis`, e exportação CSV de `perfis`, `lojas`, `vendas`); (3) repetir a comparação de estrutura de §1 imediatamente antes; (4) correr entre `begin;` e `commit;`; (5) verificações pós-aplicação do `MIGRACAO-10-REVISAO.md`; (6) reversão preparada (`reverter_migracao_10/12.sql`, testadas só em réplica).
Riscos principais: bloqueio do único dono do sistema (se o MFA for exigido sem códigos); apps antigas partidas pela 12; perda de chave Android; reinstalação a apagar vendas por sincronizar; atacante com acesso ao repositório (sem proteção de `main`, sem lockfiles, segredos ao nível do repositório); falsos positivos de testes em réplica.
Recuperação: reversões SQL; processo documentado de recuperação do dono (`SEGURANCA.md`); códigos de recuperação TOTP; painel do Supabase como rede de segurança.

## 9. Sequência recomendada
1. Decidir: despesas do gerente; atraso/MFA obrigatório; âmbito do TOTP (só `super`?).
2. Criar **projeto Supabase de teste** (cópia do esquema) e repetir lá os testes de 10 e 12 com PostgREST/Auth reais.
3. Proteger `main`, adicionar lockfiles, `.gitignore` (já feito), mover segredos para o ambiente protegido.
4. Implementar **TOTP + códigos + `aal2`** (cliente e testes) — depois da sua autorização.
5. Gerar a chave Android (método do `ANDROID-ASSINATURA.md`) e a variável de impressão digital; compilar a candidata a partir do ramo; verificar a assinatura.
6. Testar em 2.º telemóvel e num Windows real (instalar, atualizar, câmara, recibos, barra).
7. Merge (com autorização) → web publicada; remover o gatilho temporário em commit separado.
8. Distribuir o APK assinado (reinstalação planeada, vendas sincronizadas).
9. Aplicar **migração 10**, depois **12** só quando todos os aparelhos tiverem a versão nova.
10. Implementar e aplicar 11, 13, 14 por ordem, cada uma com testes, cópia e janela própria.
11. Só então ativar `versions.json` (atualizações) com a primeira Release.

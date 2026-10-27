# Migração 10 — revisão final para aprovação (NÃO executada em produção)

Ficheiros: `supabase/migracao_10_inicializacao_segura.sql` (aplicar), `supabase/reverter_migracao_10.sql` (reverter). Ramo `desenvolvimento/atualizacoes`. Estado verificado em produção **só por leitura** (PostgreSQL 17.11, projeto `vziaaqadoapstjumitor`).

## 1. O que altera

**Tabelas**
| Tabela | Alteração | Dados existentes |
|---|---|---|
| `plataforma` | + colunas `dono_inicializado` e `inicializacao_aberta` (boolean, `not null`, default `false`). Retira o UPDATE ao nível da tabela a `authenticated`/`anon` e dá UPDATE só às colunas titular, numero, metodo, preco_mensal, preco_trimestral, preco_anual, teste_dias (as que a app já usa). | 1 linha: único `update` = `dono_inicializado = true, inicializacao_aberta = false` **porque já existe 1 dono** |
| `auditoria_plataforma` | **Nova** (id, em, acao, ator, papel_bd, detalhe). RLS ligado; só o dono do sistema lê; ninguém escreve pela API. | vazia |
| `perfis`, `lojas` | **Sem alteração de linhas ou colunas.** Apenas triggers novos (abaixo). | nenhuma |
| `auth.users`, `vendas`, `produtos`, `clientes`, `lotes`, … | **Não tocadas.** | nenhuma |

**Funções**
| Função | Alteração |
|---|---|
| `estado_inicializacao()` | Nova. Devolve `'aberta'` só se autorização ligada, trinco aberto e nenhum dono; senão `'fechada'`. Executável por `anon`/`authenticated`. |
| `reivindicar_super(text)` | Substituída: bloqueio de linha, exige autorização + sem dono + trinco aberto; fecha o trinco e regista auditoria. Revogada a `anon` (já não tinha); só `authenticated`. |
| `nome_de(uuid)` | Substituída: só devolve o nome do próprio, de colegas da mesma loja ou (dono do sistema) de qualquer um. Todas as chamadas internas usam `auth.uid()`. |
| `perfis_super_guard()` + trigger `perfis_super_guard_trg` (insert/update/delete em `perfis`) | Nova. Quem vem da API (`anon`/`authenticated`) não cria, promove, apaga, desativa nem altera papel/loja/e-mail de um `super`. SQL de administração não é afetado. |
| `_audit_plat()`, `_plat_audit_trg()` + triggers `plat_audit_trg`, `perfis_audit_super_trg`, `lojas_audit_plat_trg` | Novas. Registam alterações a `plataforma`, a perfis `super` e ao `estado`/`valido_ate` de lojas. Revogadas a todos os papéis da API. |
| `existe_super()`, `perfis_guard()`, `sou_super()` e as restantes | **Inalteradas** (`existe_super` fica para as apps já instaladas). |

Efeito colateral a conhecer: cada alteração de `estado`/`valido_ate` numa loja (confirmar pagamento, suspender) passa a gravar uma linha em `auditoria_plataforma`; se essa gravação falhasse, a operação falharia. Testado (confirmar pagamento/alterar loja funcionam).

## 2. Como protege o superadministrador `zeboys96@gmail.com`
- A migração não faz `insert/update/delete` em `perfis` nem em `auth.users` (comprovado: resumo MD5 de perfis, lojas, vendas, produtos, clientes, lotes, categorias, tickets e auth.users **idêntico** antes e depois, aplicando a migração duas vezes — `tests/db/atualizacao.sh`).
- Depois dela, pela API: desativar-se, mudar papel/loja/e-mail, ser apagado, ser alterado por um dono de loja ou por outro utilizador — tudo recusado (testes 02).
- Caso real simulado: dono com e-mail `zeboys96@gmail.com` já existente ⇒ continua `super / ativo / sem loja`.
- Só o SQL Editor/administração do Supabase consegue alterá-lo (como hoje), e fica na `auditoria_plataforma`.

## 3. Como impede um 2.º dono e a atribuição indevida de privilégios
1. `reivindicar_super` recusa se existir qualquer perfil `super`, se o trinco estiver fechado ou se o servidor não tiver autorizado — verificação e inserção na mesma transação, com `for update` na linha de `plataforma` (3 pedidos simultâneos ⇒ 1 só dono).
2. As duas colunas de estado não são escritas pela API (permissão por coluna); nem o dono do sistema as altera pela app.
3. `insert/update` direto em `perfis` com `papel='super'` é recusado por trigger (não depende da interface); `perfis_guard` (já existente) impede mudar o próprio papel.
4. Mesmo com a autorização ligada por engano e já existindo dono: continua `fechada` e a RPC recusa.
5. `criar_perfil` só cria `gerente`/`caixa` (testado); `cadastrar_lojista`, `confirmar_pagamento`, etc. só para o dono do sistema (testado).
6. App: falha fechada; nunca chama `signUp` se o servidor não disser «aberta».

## 4. Testes e resultados (todos em réplica local; nada contra produção)
| Suite | Resultado |
|---|---|
| `tests/db/correr.sh` — base nova, ataques, isolamento entre lojas (IDs trocados), papéis, PIN, concorrência, auditoria | **83/83** |
| `tests/db/atualizacao.sh` — estado de produção com dono existente → migração aplicada 2× (idempotente), dados idênticos, backfill do trinco, 2.º dono recusado mesmo com autorização ligada, preços/lojas/vendas/equipa a funcionar | **15/15** |
| `tests/db/reversao.sh` — a reversão repõe funções, permissões e triggers (hash idêntico ao anterior) | **2/2** |
| `tests/dono-cliente.test.js` — navegador, 6 respostas do servidor + offline | passa (e falha com o código antigo) |
| Todos os testes Node (`node --test tests/*.test.js`) | **16/16** |
Limites: réplica Postgres 16 com simulação do Supabase (papéis, `auth.uid()`); produção é 17.11 com PostgREST/Auth reais. Não foram testados: PostgREST real, Auth real, o telemóvel.

## 5. Backup e recuperação
Antes (obrigatório):
1. Supabase → Database → Backups: se existir cópia automática/PITR no seu plano, confirmar que há uma recente e anotar a hora. **Não consegui ver o plano nem as cópias.** Se não houver, não aplicar sem a cópia manual seguinte.
2. Cópia manual do que a migração toca (só leitura; guardar o resultado fora do repositório): `select * from public.plataforma;` e `select id, papel, ativo, loja_id from public.perfis where papel='super';` e `select proname, pg_get_functiondef(oid) from pg_proc where proname in ('reivindicar_super','nome_de','existe_super','perfis_guard');` e exportar (Table Editor → Export CSV) `perfis`.
3. Escolher um momento de pouco uso; avisar que durante ~1 minuto não se deve criar equipa.
Recuperação:
- Falha a meio: o ficheiro corre numa só transação do SQL Editor (se falhar, nada fica aplicado). Confirmar com as verificações abaixo.
- Se algo correr mal depois: executar `supabase/reverter_migracao_10.sql` (testado), que repõe funções, triggers e permissões; não apaga dados.
- Se o dono ficasse inacessível (não esperado: a migração não o toca): processo de recuperação em `docs/SEGURANCA.md`.

## 6. Riscos conhecidos e verificações
Riscos:
1. **Permissões por coluna em `plataforma`:** qualquer ecrã/ação que escrevesse outras colunas deixaria de poder (não encontrei nenhum no código; a app só edita preços e dados de pagamento). Verificar no ecrã «Preços e conta» depois de aplicar.
2. **Triggers de auditoria em `lojas`/`perfis`** acrescentam escrita em cada alteração relevante. Verificar «confirmar pagamento» com um comprovativo de teste de uma loja de teste, não de um cliente real.
3. **App instalada antiga** continua a usar `existe_super()` (mantida); a nova usa `estado_inicializacao()`. A ordem não importa: sem a migração, a app nova esconde a opção.
4. Aplicar é uma alteração de **esquema de produção**; a reversão é testada mas só em réplica.
5. Não consegui provar contra o PostgREST real; por isso a verificação pós-aplicação abaixo é obrigatória.
Verificações ANTES (só leitura, com resultado esperado): 1 `super` ativo com `loja_id` nulo; `plataforma` sem as colunas novas; `auditoria_plataforma`, `estado_inicializacao`, `perfis_super_guard` inexistentes; triggers de `perfis` = só `perfis_guard_trg`.
Verificações DEPOIS: `select dono_inicializado, inicializacao_aberta from plataforma` ⇒ `true,false`; `select estado_inicializacao()` ⇒ `fechada`; o mesmo `super` ativo e com o mesmo `id`; abrir a app instalada: o botão «Configurar o dono do sistema» **desapareceu**; entrar como dono do sistema e como um lojista; abrir «Preços e conta» e gravar sem alterar; `get_advisors` sem novos alertas.
Decisão pedida: **autorizar ou não** a execução da migração 10 em produção. Nada será executado sem essa resposta.

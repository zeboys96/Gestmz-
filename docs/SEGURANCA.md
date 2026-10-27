# GestMZ — segurança: dono do sistema e auditoria

Estado: **código e migração prontos no ramo `desenvolvimento/atualizacoes`; a migração 10 NÃO foi aplicada em produção.**

## 1. «Configurar o dono do sistema» — o que se passava

| Camada | Problema encontrado | Gravidade |
|---|---|---|
| App (`www/core.js`, `vLogin`) | O botão aparecia sempre que a consulta `existe_super()` falhava ou devolvia `null` (offline, erro, resposta vazia): o código fazia `temSuper = true` e depois `!!data`, mas o `catch` só cobria exceções, não `{error}` do Supabase. **Falhava aberto.** Um erro de rede/RPC mostrava o formulário mesmo com dono existente. | Média (só interface) |
| Servidor (`reivindicar_super`) | A única barreira era `exists(perfil super)`. Sem trinco, sem autorização do servidor, sem bloqueio de linha: (a) duas chamadas simultâneas com nenhum dono podiam criar dois; (b) se o perfil do dono desaparecesse (apagado por administração, migração, erro) a porta reabria para **qualquer pessoa com uma conta nova** (o registo no Supabase Auth é público). | Alta (condicional) |
| Produção hoje | Existe **1** dono ativo; `reivindicar_super` recusa («já foi configurado»). **Um utilizador não autenticado não consegue criar um segundo dono hoje** (precisa de sessão; `anon` não tem permissão de execução). O risco é latente, não explorável agora. Verificado só por leitura. | — |

Escalada própria (`update perfis set papel='super'`): já estava bloqueada por `perfis_guard` (testado de novo, ver abaixo).

## 2. Solução (migração 10 + app)

- `plataforma.dono_inicializado` (trinco) e `plataforma.inicializacao_aberta` (autorização). **A API não pode escrever nestas colunas** (permissões por coluna); só administração em SQL.
- `reivindicar_super` bloqueia a linha de `plataforma` (`for update`), exige autorização aberta **e** nenhum dono **e** trinco aberto; cria o dono, fecha o trinco, desliga a autorização e regista na auditoria — tudo numa transação.
- Trigger `perfis_super_guard`: pela API (`anon`/`authenticated`) ninguém cria, promove, apaga, desativa ou muda o papel/loja/e-mail de um `super`.
- `estado_inicializacao()` devolve `'aberta'` ou `'fechada'`. A app só mostra a opção com `'aberta'`; erro, offline, resposta estranha ⇒ **bloqueado**, sem formulário e sem `signUp`. O estado é confirmado de novo antes do formulário e antes do envio.
- `auditoria_plataforma` (só o dono do sistema lê; ninguém altera pela API): criação/alteração do dono, preços/contas de pagamento, estado/validade de lojas.
- Extra: `nome_de()` deixava ler o nome de qualquer perfil de outras lojas; agora só o próprio, colegas da loja ou o dono do sistema.

### Segurança da conta existente
A migração **não toca** em perfis nem em `auth.users`. Faz apenas `update plataforma set dono_inicializado = true` quando já existe um dono (é o caso). Não desativa nem substitui `zeboys96@gmail.com`.

### Riscos de aplicar a migração em produção
1. **Compatibilidade:** a app já instalada chama `existe_super()` (mantida). A app nova chama `estado_inicializacao()`; sem a migração ela falha fechada (esconde a opção) — nunca pior que hoje.
2. **Permissões por coluna em `plataforma`:** o dono do sistema continua a poder editar preços/contas (testado). Qualquer ecrã que escrevesse `inicializacao_aberta`/`dono_inicializado` deixaria de poder (não existe nenhum).
3. **Triggers novos** em `perfis`, `plataforma`, `lojas`: acrescentam uma linha de auditoria por alteração relevante; têm custo desprezável. Se falharem, a operação original falha — por isso foram testados (83 verificações) antes.
4. **Reversão:** `drop trigger perfis_super_guard_trg/ plat_audit_trg/ perfis_audit_super_trg/ lojas_audit_plat_trg`, repor `reivindicar_super` e `nome_de` do `schema.sql` anterior. Os dados não são alterados.
5. Faça uma cópia (Supabase → Database → Backups) antes de aplicar. Aplicar só em produção com a sua autorização.

### Recuperação administrativa (processo separado)
Só se o dono for perdido de verdade (conta apagada). No SQL Editor (credenciais de administração do projeto Supabase, com início de sessão e 2FA da sua conta):
```sql
-- 1. confirmar que não há dono
select count(*) from public.perfis where papel = 'super';
-- 2. só se for 0: autorizar e fechar o trinco
update public.plataforma set dono_inicializado = false, inicializacao_aberta = true where id = 1;
-- 3. criar a conta na app (uma vez) e confirmar que a autorização voltou a desligar
select dono_inicializado, inicializacao_aberta from public.plataforma;
```
Cada passo fica na `auditoria_plataforma`. Com um dono existente, `reivindicar_super` recusa mesmo que a autorização seja ligada por engano.

## 3. Testes (todos locais; nenhum contra produção)
- `tests/db/correr.sh` (via `node --test tests/db.test.js`): réplica Postgres 16 com stubs do Supabase, esquema real + migrações 05–10. **83/83 passam**: inicialização fechada por omissão, 3 pedidos simultâneos ⇒ 1 dono, API não abre a autorização, 2.º dono recusado (formulário, RPC, insert direto), dono não se desativa/apaga/rebaixa, escalada de papéis, isolamento entre lojas (IDs trocados em mais de 20 ações), permissões por papel, bloqueio de PIN após 5 falhas, auditoria.
- `tests/dono-cliente.test.js`: Chromium com cliente Supabase simulado; 6 respostas do servidor + offline. Com o código antigo falha (confirma o defeito).
- Limites: o Postgres local replica o esquema, não o serviço Supabase Auth/PostgREST real. Antes de produção, repetir os ataques 2.º dono/IDOR contra um projeto Supabase de teste.

## 4. Auditoria (leitura apenas)
| Área | Resultado | Evidência |
|---|---|---|
| RLS | 0 tabelas públicas sem RLS (produção e réplica). `contadores`, `perfis_pin`, `pin_sessoes` com RLS e sem políticas = inacessíveis pela API, só via funções (intencional; o aviso «INFO» do Supabase é esperado). | `get_advisors`, SQL só-leitura |
| `anon` | 0 privilégios de tabela. Funções executáveis por `anon`: `existe_super`, `estado_inicializacao` (apenas booleano/estado). | idem |
| Funções `SECURITY DEFINER` | Todas com `search_path` fixo. As 33 executáveis por `authenticated` verificam papel/loja dentro (testado com IDs trocados). Aviso do Supabase 0029 é esperado. | testes 03 |
| Força bruta de PIN | 5 falhas ⇒ bloqueio 10 min (servidor); testado. | teste 03 |
| Força bruta de login (e-mail/senha) | **Não verificável a partir daqui.** Depende dos limites do Supabase Auth (painel → Authentication → Rate limits). Confirme-os. | pendente (ação sua) |
| Proteção de palavras-passe vazadas | **Desativada** (aviso do Supabase). Ativar no painel (Auth → Passwords) pode exigir plano pago. | ação sua |
| `service_role` | Não existe no código, no histórico (só num comentário a dizer para não a usar), nem nos pacotes. A chave em `www/config.js` é JWT com `role: anon`. | `git grep`, decodificação do JWT |
| Segredos/keystores no repositório | Nenhum encontrado (padrões de tokens, chaves PEM, .jks/.p12/.env). `.gitignore` não lista keystores — ver recomendação. | `git grep`/`git ls-files` |
| `main` | **Sem proteção de ramo** (a API devolve «Branch not protected»). Quem tiver escrita pode empurrar para `main`. | `gh api` |
| Ambiente `aprovacao-release`, segredos | A API de ambientes/segredos está bloqueada neste ambiente: **não verificado**. | ver `docs/ANDROID-ASSINATURA.md` |
| CORS/sessões | O cliente usa a chave anon pública e sessões do Supabase Auth; CORS é do Supabase (não configurável aqui). Electron: ver testes `desktop.test.js`. | — |
| Registos de auditoria | Por loja (`auditoria`) já existiam; da plataforma: novos (migração 10). | — |

### Recomendações (sem executar)
1. Proteger `main` (exigir PR, bloquear force-push).
2. Acrescentar `*.jks`, `*.keystore`, `*.p12`, `*.pem`, `.env*` ao `.gitignore`.
3. Rever Supabase Auth: rate limits, confirmação de e-mail, desativar registos públicos se não forem necessários (os lojistas são criados pelo dono do sistema; o registo aberto só cria contas sem acesso a nada).

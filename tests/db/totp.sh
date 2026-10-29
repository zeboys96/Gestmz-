#!/usr/bin/env bash
# TOTP (migração 15) numa réplica LOCAL descartável: aplica 10, 12 e 15 (duas vezes, para provar a idempotência) e corre os testes 05,
# mais um teste de CONCORRÊNCIA (dois pedidos simultâneos com o mesmo código: só um pode ter sucesso). Nunca toca em produção.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."; H="${PGHOST:-/tmp/pg}"; P="${PGPORT:-5544}"; U="${PGUSER:-postgres}"; DB="gestmz_totp_$$"
ps() { psql -X -q -v ON_ERROR_STOP=1 -h "$H" -p "$P" -U "$U" "$@"; }
ps -d postgres -c "create database $DB" >/dev/null || exit 2; [ "${GESTMZ_MANTER:-}" = 1 ] || trap 'ps -d postgres -c "drop database if exists $DB with (force)" >/dev/null 2>&1' EXIT
Q() { ps -d "$DB" "$@"; }
Q -f "$D/stub-supabase.sql" >/dev/null; Q -f "$R/supabase/schema.sql" >/dev/null 2>&1
for m in 05 06 07 08 09; do Q -f "$R"/supabase/migracao_${m}_*.sql >/dev/null 2>&1 || { echo "migração $m falhou"; exit 3; }; done
Q -c "create publication supabase_realtime for table public.produtos, public.lotes, public.vendas" >/dev/null
Q -f "$D/ajuda.sql" >/dev/null
Q -f "$R/supabase/migracao_10_inicializacao_segura.sql" >/dev/null || { echo "migração 10 falhou"; exit 3; }
Q -f "$R/supabase/migracao_12_permissoes_por_papel.sql" >/dev/null || { echo "migração 12 falhou"; exit 3; }
Q -f "$R/supabase/migracao_15_totp_recuperacao.sql" >/dev/null || { echo "migração 15 falhou"; exit 3; }
Q -f "$R/supabase/migracao_15_totp_recuperacao.sql" >/dev/null || { echo "migração 15 falhou na 2.ª execução (idempotência)"; exit 3; }
Q -c "insert into auth.users(id,email,created_at) values ('00000000-0000-0000-0000-0000000000a0','dono-sistema@teste.local',now()-interval '3 days'); update public.plataforma set inicializacao_aberta=true;" >/dev/null
Q -c "insert into public.perfis(id,loja_id,nome,papel) values ('00000000-0000-0000-0000-0000000000a0',null,'Dono','super')" >/dev/null
Q -f "$D/fixtures.sql" >/dev/null
Q -f "$D/05_totp.sql" >/dev/null || { echo "05_totp.sql falhou a executar"; exit 3; }
# concorrência: o mesmo código em 6 sessões ao mesmo tempo
A1=00000000-0000-0000-0000-0000000000a1
Q -c "insert into auth.mfa_factors(user_id,status) values ('$A1','verified')" >/dev/null
COD=$(Q -At -c "select (public.mfa_gerar_codigos())[1] from (select set_config('request.jwt.claim.sub','$A1',true), set_config('request.jwt.claims','{\"sub\":\"$A1\",\"aal\":\"aal2\"}',true)) s" 2>/dev/null | head -1)
[ -n "$COD" ] || COD=$(Q -At -c "select t.como_aal('$A1','aal2',\$\$select (public.mfa_gerar_codigos())[1]\$\$)" | sed 's/^ok://')
for i in 1 2 3 4 5 6; do ( Q -At -c "select t.svc(\$\$select public.mfa_consumir_codigo('$A1', '$COD')->>'estado'\$\$)" > "$D/.m$i" ) & done; wait
OKS=$(cat "$D"/.m? | grep -c '^ok:ok$'); INV=$(cat "$D"/.m? | grep -cE '^ok:(invalido|bloqueado)$'); [ "$OKS/$INV" = "1/5" ] || { echo "saídas da concorrência:"; cat "$D"/.m? ; }; rm -f "$D"/.m?
Q -c "select t.chk('concorrência: 6 pedidos simultâneos com o mesmo código → exatamente 1 sucesso, os outros inválidos ou bloqueados ($OKS ok, $INV recusados)', '$OKS/$INV', '^1/5\$')" >/dev/null
Q -At -F ' | ' -c "select case when ok then 'PASSA' else 'FALHA' end, nome, case when ok then '' else obtido end from t.res order by n"
F=$(Q -At -c "select count(*) from t.res where not ok"); T=$(Q -At -c "select count(*) from t.res"); echo "---- $((T-F))/$T testes passaram"; [ "$F" = 0 ]

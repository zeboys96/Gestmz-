#!/usr/bin/env bash
# Permissões por papel (migração 12) numa réplica local. Aplica 10 e 12 (a ordem prevista) e corre os testes 04.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."; H="${PGHOST:-/tmp/pg}"; P="${PGPORT:-5544}"; U="${PGUSER:-postgres}"; DB="gestmz_perm_$$"
ps() { psql -X -q -v ON_ERROR_STOP=1 -h "$H" -p "$P" -U "$U" "$@"; }
ps -d postgres -c "create database $DB" >/dev/null || exit 2; [ "${GESTMZ_MANTER:-}" = 1 ] || trap 'ps -d postgres -c "drop database if exists $DB with (force)" >/dev/null 2>&1' EXIT
Q() { ps -d "$DB" "$@"; }
Q -f "$D/stub-supabase.sql" >/dev/null; Q -f "$R/supabase/schema.sql" >/dev/null 2>&1
for m in 05 06 07 08 09; do Q -f "$R"/supabase/migracao_${m}_*.sql >/dev/null 2>&1 || { echo "migração $m falhou"; exit 3; }; done
Q -c "create publication supabase_realtime for table public.produtos, public.lotes, public.vendas" >/dev/null
Q -f "$D/ajuda.sql" >/dev/null
Q -f "$R/supabase/migracao_10_inicializacao_segura.sql" >/dev/null || { echo "migração 10 falhou"; exit 3; }
if [ "${GESTMZ_SEM12:-}" != 1 ]; then   # GESTMZ_SEM12=1: controlo negativo (mostra o que falha sem a migração 12)
  Q -f "$R/supabase/migracao_12_permissoes_por_papel.sql" >/dev/null || { echo "migração 12 falhou"; exit 3; }
  Q -f "$R/supabase/migracao_12_permissoes_por_papel.sql" >/dev/null || { echo "migração 12 falhou na 2.ª execução (idempotência)"; exit 3; }
fi
Q -c "insert into auth.users(id,email,created_at) values ('00000000-0000-0000-0000-0000000000a0','dono-sistema@teste.local',now()-interval '3 days'); update public.plataforma set inicializacao_aberta=true; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a0',true)" >/dev/null
Q -c "insert into public.perfis(id,loja_id,nome,papel) values ('00000000-0000-0000-0000-0000000000a0',null,'Dono','super')" >/dev/null
Q -f "$D/fixtures.sql" >/dev/null
# dois utilizadores extra de vendas (para "gerente vê vendas de vários")
Q -f "$D/04_permissoes_papeis.sql" >/dev/null
Q -At -F ' | ' -c "select case when ok then 'PASSA' else 'FALHA' end, nome, case when ok then '' else obtido end from t.res order by n"
F=$(Q -At -c "select count(*) from t.res where not ok"); T=$(Q -At -c "select count(*) from t.res"); echo "---- $((T-F))/$T testes passaram"; [ "$F" = 0 ]

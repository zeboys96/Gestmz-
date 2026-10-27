#!/usr/bin/env bash
# Corre os testes da base de dados numa réplica LOCAL descartável (Postgres 16 + stubs do Supabase).
# Nunca toca no Supabase de produção. Uso: tests/db/correr.sh [--sem-migracao-10]
set -u
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."
H="${PGHOST:-/tmp/pg}"; P="${PGPORT:-5544}"; U="${PGUSER:-postgres}"; DB="gestmz_teste_$$"
psql_() { psql -X -q -v ON_ERROR_STOP=1 -h "$H" -p "$P" -U "$U" "$@"; }
psql_ -d postgres -c "create database $DB" >/dev/null || { echo "Sem Postgres local em $H:$P"; exit 2; }
trap 'psql_ -d postgres -c "drop database if exists $DB with (force)" >/dev/null 2>&1' EXIT
Q() { psql_ -d "$DB" "$@"; }
Q -f "$D/stub-supabase.sql" >/dev/null
Q -f "$R/supabase/schema.sql" >/dev/null 2>"$D/.err" || { echo "schema.sql falhou"; head -5 "$D/.err"; exit 3; }
for m in 05 06 07 08 09; do Q -f "$R"/supabase/migracao_${m}_*.sql >/dev/null 2>"$D/.err" || { echo "migração $m falhou"; head -5 "$D/.err"; exit 3; }; done
rm -f "$D/.err"
Q -f "$D/ajuda.sql" >/dev/null
if [ "${1:-}" != "--sem-migracao-10" ]; then Q -f "$R/supabase/migracao_10_inicializacao_segura.sql" >/dev/null || { echo "migração 10 falhou"; exit 3; }; fi
Q -f "$D/01_inicializacao.sql" >/dev/null
# Inicialização legítima: o administrador autoriza (SQL de administração) e o dono configura-se uma vez.
Q -c "insert into auth.users(id,email,created_at) values ('00000000-0000-0000-0000-0000000000a0','dono-sistema@teste.local',now()-interval '3 days')" >/dev/null
Q -c "update public.plataforma set inicializacao_aberta = true" >/dev/null
Q -c "select t.chk('inicialização autorizada fica aberta', t.como(null,'select public.estado_inicializacao()'), 'ok:aberta')" >/dev/null
# concorrência: duas sessões em simultâneo tentam ser dono (só uma pode ganhar)
Q -c "insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000e1','e1@teste.local'),('00000000-0000-0000-0000-0000000000e2','e2@teste.local')" >/dev/null
( Q -At -c "select t.faz('00000000-0000-0000-0000-0000000000a0', \$\$select public.reivindicar_super('Dono')\$\$)" > "$D/.c1" ) &
( Q -At -c "select t.faz('00000000-0000-0000-0000-0000000000e1', \$\$select public.reivindicar_super('Rival 1')\$\$)" > "$D/.c2" ) &
( Q -At -c "select t.faz('00000000-0000-0000-0000-0000000000e2', \$\$select public.reivindicar_super('Rival 2')\$\$)" > "$D/.c3" ) &
wait
OKS=$(cat "$D"/.c1 "$D"/.c2 "$D"/.c3 | grep -c '^ok$'); rm -f "$D"/.c1 "$D"/.c2 "$D"/.c3
Q -c "select t.chk('concorrência: 3 pedidos simultâneos → exatamente 1 dono', (select count(*)::text from public.perfis where papel='super'), '^1\$')" >/dev/null
Q -c "select t.chk('concorrência: só 1 pedido teve sucesso ($OKS)', '$OKS', '^1\$')" >/dev/null
# os testes seguintes assumem que o dono é a0; se um rival ganhou a corrida, normaliza-se (administração, só na réplica)
Q -c "delete from public.perfis where papel='super' and id <> '00000000-0000-0000-0000-0000000000a0'; insert into public.perfis(id,loja_id,nome,papel) select '00000000-0000-0000-0000-0000000000a0',null,'Dono','super' where not exists (select 1 from public.perfis where papel='super')" >/dev/null
Q -c "select t.chk('o trinco fechou e a autorização desligou', (select dono_inicializado::text||'/'||inicializacao_aberta::text from public.plataforma), '^true/false\$')" >/dev/null
Q -f "$D/fixtures.sql" >/dev/null
Q -f "$D/02_depois_do_dono.sql" >/dev/null
Q -f "$D/03_isolamento.sql" >/dev/null
Q -At -F ' | ' -c "select case when ok then 'PASSA' else 'FALHA' end, nome, case when ok then '' else obtido end from t.res order by n"
F=$(Q -At -c "select count(*) from t.res where not ok"); T=$(Q -At -c "select count(*) from t.res")
echo "---- $((T-F))/$T testes passaram"; [ "$F" = 0 ]

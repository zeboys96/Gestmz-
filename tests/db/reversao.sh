#!/usr/bin/env bash
# Prova que reverter_migracao_10.sql devolve funções e permissões ao estado anterior (réplica local).
set -u
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."; H="${PGHOST:-/tmp/pg}"; P="${PGPORT:-5544}"; U="${PGUSER:-postgres}"; DB="gestmz_rev_$$"
ps() { psql -X -q -v ON_ERROR_STOP=1 -h "$H" -p "$P" -U "$U" "$@"; }
ps -d postgres -c "create database $DB" >/dev/null || exit 2; trap 'ps -d postgres -c "drop database if exists $DB with (force)" >/dev/null 2>&1' EXIT
Q() { ps -d "$DB" "$@"; }
Q -f "$D/stub-supabase.sql" >/dev/null; Q -f "$R/supabase/schema.sql" >/dev/null 2>&1; for m in 05 06 07 08 09; do Q -f "$R"/supabase/migracao_${m}_*.sql >/dev/null 2>&1; done
EST="select md5(string_agg(proname||pg_get_functiondef(p.oid), '|' order by proname)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public' and proname in ('reivindicar_super','nome_de','existe_super','perfis_guard','sou_super')
 union all select md5(string_agg(grantee||privilege_type, '|' order by grantee, privilege_type)) from information_schema.role_table_grants where table_schema='public' and table_name='plataforma'
 union all select string_agg(tgname, ',' order by tgname) from pg_trigger where not tgisinternal and tgrelid::regclass::text in ('perfis','lojas','plataforma')"
Q -At -c "$EST" > "$D/.e0"
Q -f "$R/supabase/migracao_10_inicializacao_segura.sql" >/dev/null; Q -At -c "$EST" > "$D/.e1"
Q -f "$R/supabase/reverter_migracao_10.sql" >/dev/null || { echo "reversão falhou"; exit 3; }; Q -At -c "$EST" > "$D/.e2"
RC=0
cmp -s "$D/.e0" "$D/.e2" && echo "PASSA | reversão devolve funções, permissões e triggers ao estado anterior" || { echo "FALHA | reversão difere"; diff "$D/.e0" "$D/.e2"; RC=1; }
cmp -s "$D/.e0" "$D/.e1" && { echo "FALHA | a migração não alterou nada?"; RC=1; } || echo "PASSA | a migração altera de facto o estado (controlo)"
rm -f "$D"/.e0 "$D"/.e1 "$D"/.e2; exit $RC

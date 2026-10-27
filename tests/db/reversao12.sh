#!/usr/bin/env bash
# Prova que reverter_migracao_12.sql repõe funções, permissões, políticas, triggers e publicação (réplica local).
set -u
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."; H="${PGHOST:-/tmp/pg}"; P="${PGPORT:-5544}"; U="${PGUSER:-postgres}"; DB="gestmz_rev12_$$"
ps() { psql -X -q -v ON_ERROR_STOP=1 -h "$H" -p "$P" -U "$U" "$@"; }
ps -d postgres -c "create database $DB" >/dev/null || exit 2; trap 'ps -d postgres -c "drop database if exists $DB with (force)" >/dev/null 2>&1' EXIT
Q() { ps -d "$DB" "$@"; }
Q -f "$D/stub-supabase.sql" >/dev/null; Q -f "$R/supabase/schema.sql" >/dev/null 2>&1; for m in 05 06 07 08 09; do Q -f "$R"/supabase/migracao_${m}_*.sql >/dev/null 2>&1; done
Q -c "create publication supabase_realtime for table public.produtos, public.lotes, public.vendas" >/dev/null 2>&1
EST="select md5(string_agg(proname||pg_get_functiondef(p.oid), '|' order by proname, p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public' and proname in ('registar_venda','minha_loja','meu_papel','gestor','loja_ativa','anular_venda','entrada_stock')
 union all select md5(string_agg(table_name||grantee||privilege_type, '|' order by table_name, grantee, privilege_type)) from information_schema.role_table_grants where table_schema='public' and table_name in ('produtos','lotes','vendas','lojas','plataforma') and grantee in ('authenticated','anon')
 union all select md5(string_agg(table_name||column_name||grantee||privilege_type, '|' order by table_name, column_name, grantee)) from information_schema.column_privileges where table_schema='public' and table_name in ('produtos','lojas') and grantee in ('authenticated') and privilege_type='SELECT'
 union all select md5(string_agg(tablename||policyname||coalesce(qual,''), '|' order by tablename, policyname)) from pg_policies where schemaname='public' and tablename in ('plataforma','produtos','lotes','vendas','lojas')
 union all select string_agg(tgname, ',' order by tgname) from pg_trigger where not tgisinternal and tgrelid::regclass::text in ('produtos','lotes','vendas')
 union all select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname='supabase_realtime'
 union all select string_agg(has_function_privilege('authenticated', p.oid, 'execute')::text || has_function_privilege('anon', p.oid, 'execute')::text, ',') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public' and proname='registar_venda'"
Q -At -c "$EST" > "$D/.f0"
Q -f "$R/supabase/migracao_12_permissoes_por_papel.sql" >/dev/null; Q -At -c "$EST" > "$D/.f1"
Q -f "$R/supabase/reverter_migracao_12.sql" >/dev/null || { echo "reversão falhou"; exit 3; }; Q -At -c "$EST" > "$D/.f2"
RC=0
if cmp -s "$D/.f0" "$D/.f2"; then echo "PASSA | a reversão da migração 12 repõe funções, permissões, políticas, triggers e publicação"; else echo "FALHA | reversão difere"; diff "$D/.f0" "$D/.f2"; RC=1; fi
cmp -s "$D/.f0" "$D/.f1" && { echo "FALHA | a migração 12 não alterou nada?"; RC=1; } || echo "PASSA | a migração 12 altera de facto o estado (controlo)"
rm -f "$D"/.f0 "$D"/.f1 "$D"/.f2; exit $RC

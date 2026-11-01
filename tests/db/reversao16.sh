#!/usr/bin/env bash
# Variante GESTMZ_SEM12=1: sem a migração 12 (estado atual da produção).
# Prova que reverter_migracao_16.sql devolve a base ao estado anterior à migração 16 (funções, gatilhos, tabelas) numa réplica local.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."; H="${PGHOST:-/tmp/pg}"; P="${PGPORT:-5544}"; U="${PGUSER:-postgres}"; DB="gestmz_rev16_$$"
ps() { psql -X -q -v ON_ERROR_STOP=1 -h "$H" -p "$P" -U "$U" "$@"; }
ps -d postgres -c "create database $DB" >/dev/null || exit 2; trap 'ps -d postgres -c "drop database if exists $DB with (force)" >/dev/null 2>&1' EXIT
Q() { ps -d "$DB" "$@"; }
Q -f "$D/stub-supabase.sql" >/dev/null; Q -f "$R/supabase/schema.sql" >/dev/null 2>&1; for m in 05 06 07 08 09; do Q -f "$R"/supabase/migracao_${m}_*.sql >/dev/null 2>&1; done
Q -c "create publication supabase_realtime for table public.produtos, public.lotes, public.vendas" >/dev/null 2>&1
Q -f "$R/supabase/migracao_10_inicializacao_segura.sql" >/dev/null 2>&1; [ "${GESTMZ_SEM12:-}" = 1 ] || Q -f "$R/supabase/migracao_12_permissoes_por_papel.sql" >/dev/null 2>&1
EST="select md5(string_agg(proname||pg_get_functiondef(p.oid), '|' order by proname, p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public'
 union all select string_agg(tgname||':'||tgrelid::regclass::text, ',' order by tgname, tgrelid::regclass::text) from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%' or (not tgisinternal and tgrelid::regclass::text in ('lojas','perfis','plataforma','pagamentos_assinatura','produtos','lotes','vendas'))
 union all select string_agg(tablename, ',' order by tablename) from pg_tables where schemaname='public'
 union all select md5(string_agg(tablename||policyname, '|' order by tablename, policyname)) from pg_policies where schemaname='public'"
Q -At -c "$EST" > "$D/.g0"
Q -f "$R/supabase/migracao_16_stock_fotos_notificacoes_caixa.sql" >/dev/null; Q -At -c "$EST" > "$D/.g1"
Q -f "$R/supabase/reverter_migracao_16.sql" >/dev/null 2>&1 || { echo "reversão falhou"; exit 3; }; Q -At -c "$EST" > "$D/.g2"
RC=0
if cmp -s "$D/.g0" "$D/.g2"; then echo "PASSA | a reversão da migração 16 repõe funções, gatilhos, tabelas e políticas"; else echo "FALHA | reversão difere"; diff "$D/.g0" "$D/.g2"; RC=1; fi
cmp -s "$D/.g0" "$D/.g1" && { echo "FALHA | a migração 16 não alterou nada?"; RC=1; } || echo "PASSA | a migração 16 altera de facto o estado (controlo)"
rm -f "$D"/.g0 "$D"/.g1 "$D"/.g2; exit $RC

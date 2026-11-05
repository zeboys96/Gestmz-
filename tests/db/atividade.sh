#!/usr/bin/env bash
# Migração 17 (atividade das lojas) numa réplica LOCAL descartável. Nunca toca na produção.
# Variantes: GESTMZ_SEM12=1 (estado atual da produção) · por omissão aplica 10, 12, 16 e 17. GESTMZ_DUAS=1 aplica a 17 duas vezes.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."; H="${PGHOST:-/tmp/pg}"; P="${PGPORT:-5544}"; U="${PGUSER:-postgres}"; DB="gestmz_n17_$$"
ps() { psql -X -q -v ON_ERROR_STOP=1 -h "$H" -p "$P" -U "$U" "$@"; }
ps -d postgres -c "create database $DB" >/dev/null || exit 2; trap 'ps -d postgres -c "drop database if exists $DB with (force)" >/dev/null 2>&1' EXIT
Q() { ps -d "$DB" "$@"; }
Q -f "$D/stub-supabase.sql" >/dev/null; Q -f "$R/supabase/schema.sql" >/dev/null 2>&1
for m in 05 06 07 08 09; do Q -f "$R"/supabase/migracao_${m}_*.sql >/dev/null 2>&1 || { echo "migração $m falhou"; exit 3; }; done
Q -c "create publication supabase_realtime for table public.produtos, public.lotes, public.vendas" >/dev/null
Q -f "$D/ajuda.sql" >/dev/null
Q -f "$R/supabase/migracao_10_inicializacao_segura.sql" >/dev/null || { echo "migração 10 falhou"; exit 3; }
if [ "${GESTMZ_SEM12:-}" != 1 ]; then Q -f "$R/supabase/migracao_12_permissoes_por_papel.sql" >/dev/null || { echo "migração 12 falhou"; exit 3; }; fi
Q -c "insert into auth.users(id,email,created_at) values ('00000000-0000-0000-0000-0000000000a0','dono-sistema@teste.local',now()-interval '3 days'); update public.plataforma set inicializacao_aberta=true; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a0',false)" >/dev/null 2>&1
Q -c "insert into public.perfis(id,loja_id,nome,papel) values ('00000000-0000-0000-0000-0000000000a0',null,'Dono','super')" >/dev/null
Q -f "$D/fixtures.sql" >/dev/null
Q -f "$R/supabase/migracao_16_stock_fotos_notificacoes_caixa.sql" >/dev/null || { echo "migração 16 falhou"; exit 3; }
ANTES=$(Q -At -c "select (select count(*) from public.lojas)||'/'||(select count(*) from public.vendas)||'/'||(select count(*) from public.produtos)||'/'||(select count(*) from public.perfis)||'/'||(select count(*) from public.clientes)")
Q -f "$R/supabase/migracao_17_atividade_lojas.sql" >/dev/null || { echo "migração 17 falhou"; exit 3; }
[ "${GESTMZ_DUAS:-}" = 1 ] && { Q -f "$R/supabase/migracao_17_atividade_lojas.sql" >/dev/null || { echo "migração 17 falhou na 2.ª execução (idempotência)"; exit 3; }; }
DEPOIS=$(Q -At -c "select (select count(*) from public.lojas)||'/'||(select count(*) from public.vendas)||'/'||(select count(*) from public.produtos)||'/'||(select count(*) from public.perfis)||'/'||(select count(*) from public.clientes)")
Q -f "$D/07_atividade.sql" >/dev/null
Q -At -F ' | ' -c "select case when ok then 'PASSA' else 'FALHA' end, nome, case when ok then '' else obtido end from t.res order by n"
[ "$ANTES" = "$DEPOIS" ] && echo "PASSA | a migração não alterou lojas/vendas/produtos/perfis/clientes ($ANTES)" || { echo "FALHA | dados alterados: $ANTES -> $DEPOIS"; exit 1; }
# reverter e voltar a aplicar
Q -f "$R/supabase/reverter_migracao_17.sql" >/dev/null || { echo "FALHA | reverter"; exit 1; }
[ "$(Q -At -c "select count(*) from pg_proc where proname in ('registar_atividade','super_atividade','super_versoes_em_uso')")" = 0 ] && echo "PASSA | reverter remove funções" || { echo "FALHA | reverter deixou funções"; exit 1; }
[ "$(Q -At -c "select (select count(*) from public.lojas)||'/'||(select count(*) from public.vendas)||'/'||(select count(*) from public.produtos)||'/'||(select count(*) from public.perfis)||'/'||(select count(*) from public.clientes)")" = "$ANTES" ] && echo "PASSA | reverter não toca nos dados" || { echo "FALHA | reverter alterou dados"; exit 1; }
F=$(Q -At -c "select count(*) from t.res where not ok"); T=$(Q -At -c "select count(*) from t.res"); echo "---- $((T-F))/$T testes passaram"; [ "$F" = 0 ]

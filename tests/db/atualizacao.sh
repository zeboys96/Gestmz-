#!/usr/bin/env bash
# Caminho de ATUALIZAÇÃO: simula a produção (dono já existente + dados) ANTES da migração 10, aplica-a duas vezes
# e prova que nenhum dado existente mudou. Só numa réplica local descartável.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; R="$D/../.."
H="${PGHOST:-/tmp/pg}"; P="${PGPORT:-5544}"; U="${PGUSER:-postgres}"; DB="gestmz_upg_$$"
ps() { psql -X -q -v ON_ERROR_STOP=1 -h "$H" -p "$P" -U "$U" "$@"; }
ps -d postgres -c "create database $DB" >/dev/null || exit 2
trap 'ps -d postgres -c "drop database if exists $DB with (force)" >/dev/null 2>&1' EXIT
Q() { ps -d "$DB" "$@"; }
Q -f "$D/stub-supabase.sql" >/dev/null; Q -f "$R/supabase/schema.sql" >/dev/null 2>&1
for m in 05 06 07 08 09; do Q -f "$R"/supabase/migracao_${m}_*.sql >/dev/null 2>&1 || { echo "migração $m falhou"; exit 3; }; done
Q -f "$D/ajuda.sql" >/dev/null
# estado "produção antes da migração 10": dono + loja com dados (inserido como administração)
Q -c "insert into auth.users(id,email,created_at) values ('00000000-0000-0000-0000-0000000000a0','zeboys96@gmail.com',now()-interval '30 days')" >/dev/null
Q -c "insert into public.perfis(id,loja_id,nome,papel) values ('00000000-0000-0000-0000-0000000000a0',null,'Dono','super')" >/dev/null
Q -f "$D/fixtures.sql" >/dev/null
SNAP="select md5(string_agg(t::text, '|' order by t::text)) from (select * from public.perfis) t"
SN() { for t in perfis lojas vendas produtos clientes lotes categorias suporte_tickets; do Q -At -c "select '$t', count(*), coalesce(md5(string_agg(x::text,'|' order by x::text)),'') from public.$t x"; done; Q -At -c "select 'auth.users', count(*), md5(string_agg(x::text,'|' order by x::text)) from auth.users x"; }
SN > "$D/.antes"
Q -f "$R/supabase/migracao_10_inicializacao_segura.sql" >/dev/null || { echo "migração 10 falhou (1.ª)"; exit 3; }
Q -f "$R/supabase/migracao_10_inicializacao_segura.sql" >/dev/null || { echo "migração 10 falhou (2.ª, idempotência)"; exit 3; }
SN > "$D/.depois"
Q -c "select t.chk('dados existentes idênticos antes/depois (perfis, lojas, vendas, produtos, clientes, lotes, categorias, tickets, auth.users)', case when (select count(*) from (select 1) x where true) = 1 and '$(md5sum < "$D/.antes" | cut -c1-32)' = '$(md5sum < "$D/.depois" | cut -c1-32)' then 'igual' else 'DIFERENTE' end, '^igual$')" >/dev/null
Q -c "select t.chk('dono existente: trinco fechado e autorização desligada (backfill)', (select dono_inicializado::text||'/'||inicializacao_aberta::text from public.plataforma), '^true/false$')" >/dev/null
Q -c "select t.chk('dono existente: continua super, ativo, sem loja, mesmo e-mail', (select p.papel||'/'||p.ativo||'/'||coalesce(p.loja_id::text,'-')||'/'||u.email from public.perfis p join auth.users u on u.id=p.id where p.papel='super'), '^super/true/-/zeboys96@gmail.com$')" >/dev/null
Q -c "select t.chk('estado_inicializacao = fechada', t.como(null,'select public.estado_inicializacao()'), 'ok:fechada')" >/dev/null
Q -c "select t.chk('migração não cria registos de auditoria nem altera dados (0 linhas na auditoria)', (select count(*)::text from public.auditoria_plataforma), '^0\$')" >/dev/null
Q -c "insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000c9','intruso@teste.local')" >/dev/null
Q -c "select t.chk('intruso não vira dono (RPC)', t.faz('00000000-0000-0000-0000-0000000000c9', \$\$select public.reivindicar_super('X')\$\$), 'ERRO')" >/dev/null
Q -c "update public.plataforma set inicializacao_aberta = true" >/dev/null
Q -c "select t.chk('autorização ligada com dono existente → continua fechada', t.como(null,'select public.estado_inicializacao()'), 'ok:fechada')" >/dev/null
Q -c "select t.chk('autorização ligada com dono existente → RPC recusa', t.faz('00000000-0000-0000-0000-0000000000c9', \$\$select public.reivindicar_super('X')\$\$), 'ERRO')" >/dev/null
Q -c "select t.chk('autorização ligada: continua a haver 1 só dono', (select count(*)::text from public.perfis where papel='super'), '^1\$')" >/dev/null
Q -c "update public.plataforma set inicializacao_aberta = false" >/dev/null
# funcionalidades de todos os dias continuam a funcionar com a migração aplicada
Q -c "select t.chk('o dono do sistema ainda edita preços', t.faz('00000000-0000-0000-0000-0000000000a0', \$\$update public.plataforma set preco_mensal = preco_mensal\$\$), '^ok\$')" >/dev/null
Q -c "select t.chk('dono do sistema ainda altera estado/validade de uma loja', t.faz('00000000-0000-0000-0000-0000000000a0', \$\$update public.lojas set estado='suspensa' where id='11111111-1111-1111-1111-111111111111'\$\$), '^ok\$')" >/dev/null
Q -c "select t.chk('...e fica registado na auditoria', (select count(*)::text from public.auditoria_plataforma where acao='loja_alterada'), '^1\$')" >/dev/null
Q -c "update public.lojas set estado='ativa' where id='11111111-1111-1111-1111-111111111111'" >/dev/null
Q -c "select t.chk('lojista (dono A) continua a conseguir vender', t.como('00000000-0000-0000-0000-0000000000a2', \$\$select (public.registar_venda('[{\"produto_id\":\"f0000000-0000-0000-0000-00000000000a\",\"qtd\":1}]'::jsonb,'Numerário'))->>'total'\$\$), '^ok:10')" >/dev/null
Q -c "select t.chk('dono da loja continua a gerir a equipa (criar_perfil caixa)', t.faz('00000000-0000-0000-0000-0000000000a1', \$\$select public.criar_perfil('00000000-0000-0000-0000-0000000000d1','Novo','novo@teste.local','caixa','123456')\$\$), '^ok\$')" >/dev/null
Q -c "select t.chk('a conta de funcionário nova NÃO afeta o dono do sistema', (select count(*)::text from public.perfis where papel='super' and ativo), '^1\$')" >/dev/null
rm -f "$D/.antes" "$D/.depois"
Q -At -F ' | ' -c "select case when ok then 'PASSA' else 'FALHA' end, nome, case when ok then '' else obtido end from t.res order by n"
F=$(Q -At -c "select count(*) from t.res where not ok"); T=$(Q -At -c "select count(*) from t.res"); echo "---- $((T-F))/$T testes passaram"; [ "$F" = 0 ]

-- Migração 18: personalização do recibo (réplica local; nada toca na produção).
\set A0 '00000000-0000-0000-0000-0000000000a0'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set A3 '00000000-0000-0000-0000-0000000000a3'
\set B1 '00000000-0000-0000-0000-0000000000b1'
\set B2 '00000000-0000-0000-0000-0000000000b2'
\set LA '11111111-1111-1111-1111-111111111111'
\set LB '22222222-2222-2222-2222-222222222222'
create or replace function t.chk(nome text, obtido boolean, esperado text) returns void language sql as $$ select t.chk(nome, obtido::text, esperado) $$;

select t.chk('dono guarda a configuração', t.faz(:'A1', $$select public.guardar_recibo_config('{"msg":"Obrigado!","mostrar":{"qr":true}}'::jsonb)$$), '^ok');
select t.chk('fica na loja do dono', (select (loja_id = :'LA')::text || '/' || (cfg->>'msg') from public.recibo_config), '^true/Obrigado!$');
select t.faz(:'A1', $$select public.guardar_recibo_config('{"msg":"Muito obrigado"}'::jsonb)$$);
select t.chk('guardar de novo substitui (uma linha por loja)', (select count(*)::text || '/' || max(cfg->>'msg') from public.recibo_config), '^1/Muito obrigado$');
select t.chk('caixa não personaliza', t.faz(:'A2', $$select public.guardar_recibo_config('{"msg":"x"}'::jsonb)$$), 'ERRO');
select t.chk('gerente não personaliza', t.faz(:'A3', $$select public.guardar_recibo_config('{"msg":"x"}'::jsonb)$$), 'ERRO');
select t.chk('dono do sistema (sem loja) não escreve por esta função', t.faz(:'A0', $$select public.guardar_recibo_config('{"msg":"x"}'::jsonb)$$), 'ERRO');
select t.chk('sem sessão não escreve', t.faz(null, $$select public.guardar_recibo_config('{"msg":"x"}'::jsonb)$$), 'ERRO');
select t.chk('configuração que não é objeto é recusada', t.faz(:'A1', $$select public.guardar_recibo_config('[1,2]'::jsonb)$$), 'ERRO');
select t.chk('logótipo que não é imagem PNG/JPEG é recusado', t.faz(:'A1', $$select public.guardar_recibo_config('{"logo":"javascript:alert(1)"}'::jsonb)$$), 'ERRO');
select t.chk('logótipo PNG válido é aceite', t.faz(:'A1', $$select public.guardar_recibo_config('{"logo":"data:image/png;base64,iVBORw0KGgo="}'::jsonb)$$), '^ok');
select t.chk('configuração enorme é recusada', t.faz(:'A1', $$select public.guardar_recibo_config(jsonb_build_object('extra', repeat('x', 120000)))$$), 'ERRO');
select t.chk('só dono: escrita direta na tabela é negada', t.faz(:'A1', $$insert into public.recibo_config(loja_id, cfg) values ('22222222-2222-2222-2222-222222222222','{}')$$), 'ERRO');
select t.chk('caixa da mesma loja lê a configuração', t.como(:'A2', 'select count(*) from public.recibo_config'), '^ok:1$');
select t.faz(:'B1', $$select public.guardar_recibo_config('{"msg":"Loja B"}'::jsonb)$$);
select t.chk('isolamento: A só vê a sua', t.como(:'A1', 'select count(*) || ''/'' || bool_and(loja_id = ''11111111-1111-1111-1111-111111111111'')::text from public.recibo_config'), '^ok:1/true$');
select t.chk('isolamento: B só vê a sua', t.como(:'B2', 'select string_agg(cfg->>''msg'', '','') from public.recibo_config'), '^ok:Loja B$');
select t.chk('dono do sistema vê todas', t.como(:'A0', 'select count(*) from public.recibo_config'), '^ok:2$');
select t.chk('anónimo não lê', t.como(null, 'select count(*) from public.recibo_config'), 'ERRO');
select t.chk('utilizador não apaga por SQL direto', t.faz(:'A1', 'delete from public.recibo_config'), 'ERRO');
select t.chk('vendas e numeração intactas (a função não lhes toca)', (select (count(*) = (select count(*) from public.vendas))::text from public.vendas), '^true$');

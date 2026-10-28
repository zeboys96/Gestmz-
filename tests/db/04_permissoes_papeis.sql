-- Fase 5: o servidor aplica as permissões por papel (caixa sem stock/custos; gerente sem custos/lucro; plano só ao dono).
\set A0 '00000000-0000-0000-0000-0000000000a0'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set A3 '00000000-0000-0000-0000-0000000000a3'
\set B1 '00000000-0000-0000-0000-0000000000b1'
\set PA 'f0000000-0000-0000-0000-00000000000a'
-- vendas feitas por cada papel (o custo fica gravado nos itens: o dono precisa dele para o lucro)
select t.chk('controlo: o caixa vende e recebe a venda', t.como(:'A2', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":2}]'::jsonb,'Numerário'))->>'total'$$), '^ok:20');
select t.chk('a venda devolvida ao caixa NÃO traz custo nem lotes', t.como(:'A2', $$select ((public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário'))->'itens'->0) ?| array['custo_un','baixas']$$), '^ok:false$');
select t.chk('a venda devolvida ao gerente NÃO traz custo', t.como(:'A3', $$select ((public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário'))->'itens'->0) ? 'custo_un'$$), '^ok:false$');
select t.chk('a venda devolvida ao dono traz custo (lucro)', t.como(:'A1', $$select ((public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário'))->'itens'->0) ? 'custo_un'$$), '^ok:true$');
select t.chk('o custo continua gravado na venda (administração vê)', (select count(*)::text from public.vendas v, jsonb_array_elements(v.itens) i where v.loja_id = '11111111-1111-1111-1111-111111111111' and i ? 'custo_un'), '^4$');
select t.chk('a venda repetida (mesmo ref) também sai sem custo ao caixa', (select r1 || '/' || r2 from (select t.como('00000000-0000-0000-0000-0000000000a2', $$select ((public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário',null,0,0,'99999999-9999-9999-9999-999999999999'))->'itens'->0) ?| array['custo_un','baixas']$$) r1, t.como('00000000-0000-0000-0000-0000000000a2', $$select ((public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário',null,0,0,'99999999-9999-9999-9999-999999999999'))->'itens'->0) ?| array['custo_un','baixas']$$) r2) x), '^ok:false/ok:false$');
select t.chk('a repetição não duplicou a venda', (select count(*)::text from public.vendas where ref_cliente = '99999999-9999-9999-9999-999999999999'), '^1$');
select t.chk('a função interna de venda não é chamável pela API (caixa)', t.faz(:'A2', $$select public._registar_venda_interna('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário')$$), 'ERRO.*(permission|permiss)');
select t.chk('a função interna de venda não é chamável pela API (dono)', t.faz(:'A1', $$select public._registar_venda_interna('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário')$$), 'ERRO.*(permission|permiss)');
-- CAIXA: leituras diretas (API) bloqueadas
select t.chk('caixa: SELECT * em produtos recusado', t.como(:'A2', 'select count(*) from (select * from public.produtos) x'), 'ERRO.*(permission|permiss)');
select t.chk('caixa: custo (produtos) recusado', t.como(:'A2', 'select count(custo) from public.produtos'), 'ERRO.*(permission|permiss)');
select t.chk('caixa: custo_caixa recusado', t.como(:'A2', 'select count(custo_caixa) from public.produtos'), 'ERRO.*(permission|permiss)');
select t.chk('caixa: stock mínimo recusado', t.como(:'A2', 'select count(minimo) from public.produtos'), 'ERRO.*(permission|permiss)');
select t.chk('caixa: lotes (quantidades, validades) recusados', t.como(:'A2', 'select count(*) from public.lotes'), 'ERRO.*(permission|permiss)');
select t.chk('caixa: lotes por qtd recusados', t.como(:'A2', 'select qtd from public.lotes limit 1'), 'ERRO.*(permission|permiss)');
select t.chk('caixa: vendas diretas recusadas (itens com custo)', t.como(:'A2', 'select count(*) from public.vendas'), 'ERRO.*(permission|permiss)');
select t.chk('caixa: movimentos de stock continuam proibidos', t.como(:'A2', 'select count(*) from public.movimentos'), '^ok:0$');
select t.chk('caixa: ainda lê nome/preço/código dos produtos (para vender)', t.como(:'A2', 'select count(*) from (select id, nome, preco, codigo, preco_caixa from public.produtos) x'), '^ok:1$');
select t.chk('caixa: produtos_loja() sem custos e sem mínimo', t.como(:'A2', 'select count(*) from public.produtos_loja() where custo is not null or custo_caixa is not null or minimo is not null'), '^ok:0$');
select t.chk('caixa: produtos_loja() devolve os produtos para vender', t.como(:'A2', 'select count(*) from public.produtos_loja() where preco = 10'), '^ok:1$');
select t.chk('caixa: lotes_loja() não devolve nada', t.como(:'A2', 'select count(*) from public.lotes_loja()'), '^ok:0$');
select t.chk('caixa: só vê as suas vendas e sem custo/lotes', t.como(:'A2', $$select count(*) from public.vendas_loja() v, jsonb_array_elements(v.itens) i where i ?| array['custo_un','baixas'] or v.usuario_id <> auth.uid()$$), '^ok:0$');
select t.chk('caixa: vê as suas vendas', t.como(:'A2', 'select count(*) from public.vendas_loja()'), '^ok:[1-9]');
select t.chk('caixa: stock insuficiente → mensagem genérica (não revela quantidades)', t.faz(:'A2', $$select public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":9999}]'::jsonb,'Numerário')$$), 'ERRO: Não é possível vender este produto neste momento\. Fale com o gerente\.$');
select t.chk('stock intacto após a falha', (select sum(qtd)::text from public.lotes where produto_id = :'PA'), '^(4[0-9])$');
-- GERENTE
select t.chk('gerente: custo recusado (API direta)', t.como(:'A3', 'select count(custo) from public.produtos'), 'ERRO.*(permission|permiss)');
select t.chk('gerente: produtos_loja() sem custos mas com mínimo', t.como(:'A3', 'select count(*) from public.produtos_loja() where custo is not null or custo_caixa is not null or minimo is null'), '^ok:0$');
select t.chk('gerente: vendas_loja() sem custo_un (lucro não calculável)', t.como(:'A3', $$select count(*) from public.vendas_loja() v, jsonb_array_elements(v.itens) i where i ? 'custo_un'$$), '^ok:0$');
select t.chk('gerente: vê as vendas de todos', t.como(:'A3', 'select count(distinct usuario_id) from public.vendas_loja()'), '^ok:[3-9]');
select t.chk('gerente: vendas diretas recusadas (API)', t.como(:'A3', 'select count(*) from public.vendas'), 'ERRO.*(permission|permiss)');
select t.chk('gerente: lotes diretos recusados mas lotes_loja() funciona', t.como(:'A3', 'select count(*) from public.lotes') || '|' || t.como(:'A3', 'select count(*) from public.lotes_loja()'), 'ERRO.*\|ok:[1-9]');
select t.chk('gerente: continua a ver movimentos de stock', t.como(:'A3', 'select count(*) from public.movimentos'), '^ok:[1-9]');
select t.chk('gerente: dá entrada de stock', t.faz(:'A3', $$select public.entrada_stock('f0000000-0000-0000-0000-00000000000a', 5, 'L9', null, 99, 'teste', null)$$), '^ok$');
select t.chk('gerente: a entrada NÃO altera o custo do produto', (select custo::text from public.produtos where id = :'PA'), '^5\.00$');
select t.chk('gerente: dá baixa de stock', t.faz(:'A3', $$select public.baixa_stock((select id from public.lotes_loja() limit 1), 1, 'teste')$$), '^ok$');
select t.faz(:'A3', $$insert into public.produtos(loja_id, nome, custo, preco) values ('11111111-1111-1111-1111-111111111111', 'Novo G', 77, 12)$$) as r \gset
select t.chk('gerente: cria produto (custo fica a 0)', :'r' || ':' || (select custo::text from public.produtos where nome = 'Novo G'), '^ok:0');
select t.faz(:'A3', $$update public.produtos set custo = 1, preco = 11 where id = 'f0000000-0000-0000-0000-00000000000a'$$) as r \gset
select t.chk('gerente: alterar o custo é ignorado (o preço altera-se)', :'r' || ':' || (select custo || '/' || preco from public.produtos where id = :'PA'), '^ok:5\.00/11\.00$');
select t.chk('gerente: continua a anular vendas', t.faz(:'A3', $$select public.anular_venda((select id from public.vendas_loja() where not anulada limit 1), 'engano')$$), '^ok$');
-- DONO
select t.chk('dono: produtos_loja() com custos', t.como(:'A1', 'select count(*) from public.produtos_loja() where custo is not null'), '^ok:[1-9]');
select t.chk('dono: vendas_loja() com custo_un (lucro)', t.como(:'A1', $$select count(*) from public.vendas_loja() v, jsonb_array_elements(v.itens) i where i ? 'custo_un'$$), '^ok:[1-9]');
select t.chk('dono: lotes_loja()', t.como(:'A1', 'select count(*) from public.lotes_loja()'), '^ok:[1-9]');
select t.faz(:'A1', $$update public.produtos set custo = 6 where id = 'f0000000-0000-0000-0000-00000000000a'$$) as r \gset
select t.chk('dono: altera o custo', :'r' || ':' || (select custo::text from public.produtos where id = :'PA'), '^ok:6\.00$');
select t.faz(:'A1', $$select public.entrada_stock('f0000000-0000-0000-0000-00000000000a', 1, 'L10', null, 7, 'teste', null)$$) as r \gset
select t.chk('dono: a entrada de stock com custo atualiza o custo', :'r' || ':' || (select custo::text from public.produtos where id = :'PA'), '^ok:7\.00$');
select t.faz(:'A1', $$insert into public.produtos(loja_id, nome, custo, preco) values ('11111111-1111-1111-1111-111111111111', 'Novo D', 3, 9)$$) as r \gset
select t.chk('dono: cria produto com custo', :'r' || ':' || (select custo::text from public.produtos where nome = 'Novo D'), '^ok:3\.00$');
select t.chk('dono: não vê as vendas da outra loja', t.como(:'A1', $$select count(*) from public.vendas_loja() where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^ok:0$');
select t.chk('loja B: produtos_loja() do dono B não mostra os da loja A', t.como(:'B1', $$select count(*) from public.produtos_loja() where loja_id = '11111111-1111-1111-1111-111111111111'$$), '^ok:0$');
-- PLANO / SUBSCRIÇÃO
select t.chk('caixa: estado/validade da loja recusados (API)', t.como(:'A2', 'select estado from public.lojas'), 'ERRO.*(permission|permiss)');
select t.chk('gerente: validade da loja recusada (API)', t.como(:'A3', 'select valido_ate from public.lojas'), 'ERRO.*(permission|permiss)');
select t.chk('caixa: ainda lê nome/NUIT/endereço da loja (recibos)', t.como(:'A2', 'select count(*) from (select id, nome, nuit, endereco, tel from public.lojas) x'), '^ok:1$');
select t.chk('caixa: minha_loja_info() sem plano', t.como(:'A2', $$select (public.minha_loja_info()) ?| array['estado','valido_ate']$$), '^ok:false$');
select t.chk('gerente: minha_loja_info() sem plano', t.como(:'A3', $$select (public.minha_loja_info()) ?| array['estado','valido_ate']$$), '^ok:false$');
select t.chk('caixa/gerente: minha_loja_info() diz só se a loja está operacional', t.como(:'A3', $$select (public.minha_loja_info())->>'operacional'$$), '^ok:true$');
select t.chk('dono: minha_loja_info() com plano', t.como(:'A1', $$select (public.minha_loja_info()) ?& array['estado','valido_ate','operacional']$$), '^ok:true$');
select t.chk('caixa: preços da plataforma recusados', t.como(:'A2', 'select count(*) from public.plataforma'), '^ok:0$');
select t.chk('gerente: preços da plataforma recusados', t.como(:'A3', 'select count(*) from public.plataforma'), '^ok:0$');
select t.chk('dono da loja: vê preços para subscrever', t.como(:'A1', 'select count(*) from public.plataforma'), '^ok:1$');
select t.chk('dono do sistema: vê preços', t.como(:'A0', 'select count(*) from public.plataforma'), '^ok:1$');
select t.chk('caixa: não vê pagamentos de subscrição', t.como(:'A2', 'select count(*) from public.pagamentos_assinatura'), '^ok:0$');
select t.chk('gerente: não vê pagamentos de subscrição', t.como(:'A3', 'select count(*) from public.pagamentos_assinatura'), '^ok:0$');
select t.chk('dono do sistema: admin_listar_lojas() devolve todas com plano', t.como(:'A0', $$select count(*) from public.admin_listar_lojas() where estado is not null and valido_ate is not null$$), '^ok:2$');
select t.chk('dono do sistema: lê lojas só por admin_listar_lojas (API direta recusada)', t.como(:'A0', 'select estado from public.lojas'), 'ERRO.*(permission|permiss)');
select t.chk('dono da loja: admin_listar_lojas() vazio', t.como(:'A1', 'select count(*) from public.admin_listar_lojas()'), '^ok:0$');
select t.chk('caixa: admin_listar_lojas() vazio', t.como(:'A2', 'select count(*) from public.admin_listar_lojas()'), '^ok:0$');
select t.chk('dono do sistema: suspende e reativa uma loja (UPDATE direto)', t.faz(:'A0', $$update public.lojas set estado = 'suspensa' where id = '22222222-2222-2222-2222-222222222222'$$) || t.faz(:'A0', $$update public.lojas set estado = 'ativa', valido_ate = public.hoje() + 40 where id = '22222222-2222-2222-2222-222222222222'$$), '^okok$');
select t.chk('caixa suspende? não (UPDATE direto recusado)', t.faz(:'A2', $$update public.lojas set estado = 'suspensa' where id = '11111111-1111-1111-1111-111111111111'$$) || ':' || (select estado from public.lojas where id = '11111111-1111-1111-1111-111111111111'), ':ativa$');
-- caixas que o dono atualiza: operações que já funcionavam
select t.chk('dono: configura/atualiza os dados da loja', t.faz(:'A1', $$select public.atualizar_loja('Loja A', 'Mercearia', '123', '84', 'Rua 1')$$), '^ok$');
select t.chk('dono: cria categoria e cliente', t.faz(:'A1', $$insert into public.categorias(loja_id, nome) values ('11111111-1111-1111-1111-111111111111', 'Nova')$$) || t.faz(:'A1', $$insert into public.clientes(loja_id, nome) values ('11111111-1111-1111-1111-111111111111', 'Cli')$$), '^okok$');
select t.chk('caixa: continua a vender a fiado a cliente da sua loja', t.como(:'A2', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Fiado','d0000000-0000-0000-0000-00000000000a'))->>'pagamento'$$), '^ok:Fiado$');
select t.chk('caixa: os itens da sua venda têm o necessário para o recibo (nome, qtd, preço, total)', t.como('00000000-0000-0000-0000-0000000000a2', $$select (select count(*) from public.vendas_loja() v, jsonb_array_elements(v.itens) i where i ?& array['nome','qtd','preco','total']) > 0$$), '^ok:true$');
-- tempo real
select t.chk('sinal: as vendas/stock atualizam sinais_loja da loja A', (select (versao > 0)::text from public.sinais_loja where loja_id = '11111111-1111-1111-1111-111111111111'), '^true$');
select t.chk('sinal: o caixa lê o sinal da sua loja', t.como(:'A2', 'select count(*) from public.sinais_loja'), '^ok:1$');
select t.chk('sinal: só tem versão, sem dados de negócio', (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name = 'sinais_loja'), '^loja_id,versao,atualizado_em$');
select t.chk('sinal: ninguém escreve em sinais_loja pela API', t.faz(:'A1', $$update public.sinais_loja set versao = 0$$), 'ERRO');
select t.chk('tempo real: produtos/lotes/vendas fora da publicação, sinais_loja dentro', (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'), '^sinais_loja$');

-- ---------- despesas e lucros: só o dono ----------
insert into public.despesas(loja_id, data, descricao, categoria, valor) values ('11111111-1111-1111-1111-111111111111', current_date, 'Renda', 'Renda', 500), ('22222222-2222-2222-2222-222222222222', current_date, 'Renda B', 'Renda', 700);
select t.chk('despesas: o dono vê as da sua loja (só 1)', t.como(:'A1', 'select count(*) from public.despesas'), '^ok:1$');
select t.chk('despesas: o dono regista uma despesa', t.faz(:'A1', $$insert into public.despesas(loja_id, data, descricao, categoria, valor) values ('11111111-1111-1111-1111-111111111111', current_date, 'Luz', 'Serviços', 50)$$), '^ok$');
select t.chk('despesas: gerente NÃO lê (API direta)', t.como(:'A3', 'select count(*) from public.despesas'), '^ok:0$');
select t.chk('despesas: gerente NÃO lê nem filtrando por valor/data/loja', t.como(:'A3', $$select count(*) from public.despesas where loja_id = '11111111-1111-1111-1111-111111111111' or valor > 0$$), '^ok:0$');
select t.chk('despesas: gerente NÃO regista', t.faz(:'A3', $$insert into public.despesas(loja_id, data, descricao, categoria, valor) values ('11111111-1111-1111-1111-111111111111', current_date, 'Intruso', 'X', 1)$$), 'ERRO');
select t.chk('despesas: gerente NÃO apaga (nada é apagado)', t.faz(:'A3', $$delete from public.despesas$$) || ':' || (select count(*)::text from public.despesas where loja_id = '11111111-1111-1111-1111-111111111111'), ':2$');
select t.chk('despesas: gerente NÃO altera (nada muda)', t.faz(:'A3', $$update public.despesas set valor = 1$$) || ':' || (select sum(valor)::text from public.despesas where loja_id = '11111111-1111-1111-1111-111111111111'), ':550');
select t.chk('despesas: caixa NÃO lê', t.como(:'A2', 'select count(*) from public.despesas'), '^ok:0$');
select t.chk('despesas: caixa NÃO regista', t.faz(:'A2', $$insert into public.despesas(loja_id, data, descricao, categoria, valor) values ('11111111-1111-1111-1111-111111111111', current_date, 'Intruso', 'X', 1)$$), 'ERRO');
select t.chk('despesas: caixa NÃO apaga', t.faz(:'A2', $$delete from public.despesas$$) || ':' || (select count(*)::text from public.despesas where loja_id = '11111111-1111-1111-1111-111111111111'), ':2$');
select t.chk('despesas: anónimo recusado', t.como(null, 'select count(*) from public.despesas'), 'ERRO');
select t.chk('despesas: o dono de outra loja não vê as desta', t.como(:'B1', 'select count(*) from public.despesas') , '^ok:1$');
select t.chk('despesas: o dono da loja A não regista na loja B', t.faz(:'A1', $$insert into public.despesas(loja_id, data, descricao, categoria, valor) values ('22222222-2222-2222-2222-222222222222', current_date, 'Intruso', 'X', 1)$$), 'ERRO');
select t.faz(:'A1', $$delete from public.despesas where descricao = 'Luz'$$) as r \gset
select t.chk('despesas: o dono apaga uma despesa sua', :'r' || ':' || (select count(*)::text from public.despesas where loja_id = '11111111-1111-1111-1111-111111111111'), '^ok:1$');
select t.chk('lucro: nenhuma função devolve lucro/custo ao gerente (itens, produtos, resposta da venda)', t.como(:'A3', $$select (select count(*) from public.vendas_loja() v, jsonb_array_elements(v.itens) i where i ? 'custo_un' or i ? 'lucro') + (select count(*) from public.produtos_loja() where custo is not null or custo_caixa is not null)$$), '^ok:0$');
select t.chk('lucro: o dono continua a ver custos e lucro (custo_un)', t.como(:'A1', $$select count(*) from public.vendas_loja() v, jsonb_array_elements(v.itens) i where i ? 'custo_un'$$), '^ok:[1-9]');

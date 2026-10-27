-- Fase 4: isolamento entre lojas (acesso por IDs alterados), escalada de privilégios, permissões por papel e código de acesso.
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set A3 '00000000-0000-0000-0000-0000000000a3'
\set A4 '00000000-0000-0000-0000-0000000000a4'
\set B1 '00000000-0000-0000-0000-0000000000b1'
\set B2 '00000000-0000-0000-0000-0000000000b2'
\set D1 '00000000-0000-0000-0000-0000000000d1'
\set LB '22222222-2222-2222-2222-222222222222'
-- controlos positivos: o que é legítimo continua a funcionar
select t.chk('controlo: o dono A vê a sua loja', t.como(:'A1', 'select count(*) from public.lojas'), '^ok:1$');
select t.chk('controlo: o caixa A vende um produto da sua loja', t.como(:'A2', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário'))->>'total'$$), '^ok:10');
-- leitura de dados de outra loja (RLS)
select t.chk('RLS: o dono A não vê produtos da loja B', t.como(:'A1', $$select count(*) from public.produtos where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^ok:0$');
select t.chk('RLS: o dono A não vê vendas da loja B (0 linhas ou acesso direto recusado)', t.como(:'A1', $$select count(*) from public.vendas where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^(ok:0|ERRO.*permission)');
select t.chk('RLS: o dono A não vê clientes da loja B', t.como(:'A1', $$select count(*) from public.clientes where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^ok:0$');
select t.chk('RLS: o dono A não vê lotes da loja B (0 linhas ou acesso direto recusado)', t.como(:'A1', $$select count(*) from public.lotes where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^(ok:0|ERRO.*permission)');
select t.chk('RLS: o dono A não vê a equipa da loja B', t.como(:'A1', $$select count(*) from public.perfis where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^ok:0$');
select t.chk('RLS: o dono A não vê pedidos de suporte da loja B', t.como(:'A1', $$select count(*) from public.suporte_tickets where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^ok:0$');
select t.chk('RLS: o caixa A não vê a equipa (dono/gerente)', t.como(:'A2', $$select count(*) from public.perfis where id <> auth.uid()$$), '^ok:0$');
select t.chk('RLS: o caixa A não vê o dono do sistema', t.como(:'A2', $$select count(*) from public.perfis where papel = 'super'$$), '^ok:0$');
select t.chk('RLS: o gerente A não vê o dono do sistema', t.como(:'A3', $$select count(*) from public.perfis where papel = 'super'$$), '^ok:0$');
select t.chk('RLS: o anónimo não lê nada', t.como(null, 'select count(*) from public.produtos'), 'ERRO');
-- escrita/RPC com IDs de outra loja
select t.chk('IDOR: anular venda da loja B', t.faz(:'A1', $$select public.anular_venda('a0000000-0000-0000-0000-00000000000b', 'teste')$$), 'ERRO');
select t.chk('IDOR: baixa de stock de lote da loja B', t.faz(:'A1', $$select public.baixa_stock('e0000000-0000-0000-0000-00000000000b', 5, 'x')$$), 'ERRO');
select t.chk('IDOR: stock da loja B intacto', (select qtd::text from public.lotes where id = 'e0000000-0000-0000-0000-00000000000b'), '^50$');
select t.chk('IDOR: entrada de stock em produto da loja B', t.faz(:'A1', $$select public.entrada_stock('f0000000-0000-0000-0000-00000000000b', 5, 'L', null, 1, null, 0)$$), 'ERRO');
select t.chk('IDOR: renomear categoria da loja B', t.faz(:'A1', $$select public.renomear_categoria('c0000000-0000-0000-0000-00000000000b', 'Hackeada')$$) || ':' || (select nome from public.categorias where id = 'c0000000-0000-0000-0000-00000000000b'), ':Cat B$');
select t.chk('IDOR: receber fiado de cliente da loja B', t.faz(:'A1', $$select public.receber_fiado('d0000000-0000-0000-0000-00000000000b', 50, 'Numerário')$$) || ':' || (select divida::text from public.clientes where id = 'd0000000-0000-0000-0000-00000000000b'), ':100');
select t.chk('IDOR: mudar o código de acesso de funcionário da loja B', t.faz(:'A1', $$select public.definir_pin('00000000-0000-0000-0000-0000000000b2', '999999')$$), 'ERRO');
select t.chk('IDOR: remover funcionário da loja B', t.faz(:'A1', $$select public.remover_funcionario('00000000-0000-0000-0000-0000000000b2')$$) || ':' || (select count(*)::text from public.perfis where id = '00000000-0000-0000-0000-0000000000b2'), ':1$');
select t.chk('IDOR: responder a pedido de suporte da loja B', t.faz(:'A1', $$select public.responder_ticket('b0000000-0000-0000-0000-00000000000b', 'olá')$$), 'ERRO');
select t.chk('IDOR: fechar pedido de suporte da loja B', t.faz(:'A1', $$select public.fechar_ticket('b0000000-0000-0000-0000-00000000000b')$$) || ':' || (select estado from public.suporte_tickets where id = 'b0000000-0000-0000-0000-00000000000b'), ':(?!fechado)');
select t.chk('IDOR: vender produto da loja B', t.faz(:'A2', $$select public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000b","qtd":1}]'::jsonb,'Numerário')$$), 'ERRO');
select t.chk('IDOR: vender a fiado a cliente da loja B', t.faz(:'A2', $$select public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Fiado','d0000000-0000-0000-0000-00000000000b')$$), 'ERRO');
select t.chk('IDOR: ligar um utilizador de outra loja à minha (criar_perfil)', t.faz(:'A1', $$select public.criar_perfil('00000000-0000-0000-0000-0000000000b1','x','b1@teste.local','caixa','123456')$$), 'ERRO');
-- escalada de privilégios por RPC
select t.chk('escalada: criar_perfil com papel super', t.faz(:'A1', $$select public.criar_perfil('00000000-0000-0000-0000-0000000000d1','x','novo@teste.local','super','123456')$$), 'ERRO');
select t.chk('escalada: criar_perfil com papel dono', t.faz(:'A1', $$select public.criar_perfil('00000000-0000-0000-0000-0000000000d1','x','novo@teste.local','dono','123456')$$), 'ERRO');
select t.chk('escalada: o gerente não cria gerentes', t.faz(:'A3', $$select public.criar_perfil('00000000-0000-0000-0000-0000000000d1','x','novo@teste.local','gerente','123456')$$), 'ERRO');
select t.chk('escalada: o caixa não cria utilizadores', t.faz(:'A2', $$select public.criar_perfil('00000000-0000-0000-0000-0000000000d1','x','novo@teste.local','caixa','123456')$$), 'ERRO');
select t.chk('escalada: o dono da loja não cadastra lojistas', t.faz(:'A1', $$select public.cadastrar_lojista('00000000-0000-0000-0000-0000000000d1','novo@teste.local','Loja X')$$), 'ERRO');
select t.chk('escalada: o dono da loja não confirma pagamentos', t.faz(:'A1', $$select public.confirmar_pagamento('00000000-0000-0000-0000-000000000001')$$), 'ERRO');
select t.chk('escalada: o dono da loja não rejeita pagamentos', t.faz(:'A1', $$select public.rejeitar_pagamento('00000000-0000-0000-0000-000000000001', 'x')$$), 'ERRO');
select t.chk('escalada: o dono da loja não edita a loja B', t.faz(:'A1', $$update public.lojas set nome = 'X', valido_ate = '2099-01-01' where id = '22222222-2222-2222-2222-222222222222'$$) || ':' || (select nome from public.lojas where id = '22222222-2222-2222-2222-222222222222'), ':Loja B$');
select t.chk('escalada: o dono da loja não prolonga a própria assinatura', t.faz(:'A1', $$update public.lojas set valido_ate = '2099-01-01', estado = 'ativa' where id = '11111111-1111-1111-1111-111111111111'$$) || ':' || (select valido_ate::text from public.lojas where id = '11111111-1111-1111-1111-111111111111'), ':(?!2099)');
-- permissões por papel
select t.chk('papel: o caixa não dá desconto', t.faz(:'A2', $$select public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário',null,5)$$), 'ERRO');
select id as vid from public.vendas where loja_id = '11111111-1111-1111-1111-111111111111' and not anulada limit 1 \gset
select t.chk('papel: o caixa não anula vendas', t.faz(:'A2', format($$select public.anular_venda(%L, 'x')$$, :'vid')), 'ERRO');
select t.chk('papel: o gerente anula vendas da sua loja', t.faz(:'A3', format($$select public.anular_venda(%L, 'engano')$$, :'vid')), '^ok$');
select t.chk('papel: o caixa não remove o gerente', t.faz(:'A2', $$select public.remover_funcionario('00000000-0000-0000-0000-0000000000a3')$$), 'ERRO');
-- nomes de outras lojas não se consultam por ID
select t.chk('IDOR: nome_de() não revela nomes de outra loja', t.como(:'A1', $$select public.nome_de('00000000-0000-0000-0000-0000000000b1')$$), '^ok$');
select t.chk('nome_de() continua a devolver o próprio nome e o da equipa', t.como(:'A1', $$select public.nome_de('00000000-0000-0000-0000-0000000000a2')$$), '^ok:Caixa A$');
-- auditoria de loja
select t.chk('RLS: o dono A não lê a auditoria da loja B', t.como(:'A1', $$select count(*) from public.auditoria where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^ok:0$');
-- código de acesso (PIN) e força bruta
select t.chk('PIN: sem validar o código a conta não acede à loja', t.como(:'A4', 'select public.minha_loja()'), '^ok$');
select t.chk('PIN: errado 1', t.como(:'A4', $$select public.verificar_pin('000000')$$), '^ok:false$');
select t.chk('PIN: errado 2', t.como(:'A4', $$select public.verificar_pin('000001')$$), '^ok:false$');
select t.chk('PIN: errado 3', t.como(:'A4', $$select public.verificar_pin('000002')$$), '^ok:false$');
select t.chk('PIN: errado 4', t.como(:'A4', $$select public.verificar_pin('000003')$$), '^ok:false$');
select t.chk('PIN: errado 5 (bloqueia)', t.como(:'A4', $$select public.verificar_pin('000004')$$), '^ok:false$');
select t.chk('PIN: depois de 5 falhas, mesmo o código certo é recusado (força bruta)', t.como(:'A4', $$select public.verificar_pin('123456')$$), 'ERRO.*tentativas');
select t.chk('PIN: continua sem acesso à loja durante o bloqueio', t.como(:'A4', 'select public.minha_loja()'), '^ok$');
update public.perfis_pin set bloqueado_ate = null, falhas = 0 where user_id = '00000000-0000-0000-0000-0000000000a4';
select t.chk('PIN: após o bloqueio, o código certo funciona', t.como(:'A4', $$select public.verificar_pin('123456')$$), '^ok:true$');
select t.chk('PIN: e a loja fica acessível', t.como(:'A4', 'select public.minha_loja()'), '^ok:11111111');
select t.chk('PIN: um funcionário não lê os códigos de acesso de ninguém', t.como(:'A1', 'select count(*) from public.perfis_pin'), '^(ok:0|ERRO)');

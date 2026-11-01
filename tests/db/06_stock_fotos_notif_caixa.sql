-- Migração 16: lista de venda do caixa, fotografias, notificações e fecho de caixa (réplica local; nada toca na produção).
\set A0 '00000000-0000-0000-0000-0000000000a0'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set A3 '00000000-0000-0000-0000-0000000000a3'
\set A5 '00000000-0000-0000-0000-0000000000a5'
\set A6 '00000000-0000-0000-0000-0000000000a6'
\set B1 '00000000-0000-0000-0000-0000000000b1'
\set B2 '00000000-0000-0000-0000-0000000000b2'
\set LA '11111111-1111-1111-1111-111111111111'
\set LB '22222222-2222-2222-2222-222222222222'
\set PA 'f0000000-0000-0000-0000-00000000000a'
\set PZ 'f0000000-0000-0000-0000-0000000000a1'
\set PX 'f0000000-0000-0000-0000-0000000000a2'
\set PB 'f0000000-0000-0000-0000-00000000000b'

create or replace function t.chk(nome text, obtido boolean, esperado text) returns void language sql as $$ select t.chk(nome, obtido::text, esperado) $$;
create or replace function t.erra(sql text) returns boolean language plpgsql as $$ begin execute sql; return false; exception when others then return true; end $$;
\set A7 '00000000-0000-0000-0000-0000000000a7'
-- caixas novos e um produto novo (administração; só na réplica)
insert into auth.users(id, email, created_at) values (:'A5', 'a5@teste.local', now() - interval '3 days'), (:'A6', 'a6@teste.local', now() - interval '3 days'), (:'A7', 'a7@teste.local', now() - interval '3 days');
insert into public.perfis(id, loja_id, nome, papel, email) values (:'A5', :'LA', 'Caixa Cinco', 'caixa', 'a5@teste.local'), (:'A6', :'LA', 'Caixa Seis', 'caixa', 'a6@teste.local'), (:'A7', :'LA', 'Caixa Sete', 'caixa', 'a7@teste.local');
insert into public.produtos(id, loja_id, nome, codigo, codigo_caixa, un_por_caixa, preco, preco_caixa, custo, minimo, ativo) values
  (:'PZ', :'LA', 'Produto Z', '7000001', '7000002', 10, 5, 45, 2, 5, true),
  (:'PX', :'LA', 'Produto X (lote vencido)', '7000009', null, null, 5, null, 2, 0, true);
insert into public.lotes(loja_id, produto_id, qtd, soltas) values (:'LA', :'PZ', 20, 0);   -- 2 caixas fechadas de 10
insert into public.lotes(loja_id, produto_id, qtd, soltas, validade) values (:'LA', :'PX', 30, 30, public.hoje() - 1);   -- só stock vencido
delete from public.notificacoes;   -- parte-se de zero (as vendas de preparação, se houver, não contam)

-- ================== 1. LISTA DE VENDA DO CAIXA (servidor) ==================
select t.chk('caixa: produtos_venda() lista produtos com stock', t.como(:'A2', $$select count(*) from public.produtos_venda() where nome in ('Produto A','Produto Z')$$), '^ok:2$');
select t.chk('caixa: as colunas devolvidas não incluem custo/mínimo/lotes', (select count(*)::text from (select unnest(proargnames) n from pg_proc where proname = 'produtos_venda') x where n ~ '^(custo|custo_caixa|minimo|lotes|validade)$'), '^0$');
select t.chk('caixa: produto só com stock vencido não aparece (não se pode vender)', t.como(:'A2', $$select count(*) from public.produtos_venda() where nome like 'Produto X%'$$), '^ok:0$');
select t.chk('caixa: disponibilidade em unidades e em embalagens fechadas', t.como(:'A2', $$select disp_un || '/' || disp_cx from public.produtos_venda() where nome = 'Produto Z'$$), '^ok:20/2$');
select t.chk('outra loja não vê os produtos desta', t.como(:'B2', $$select count(*) from public.produtos_venda() where nome like 'Produto %' and nome <> 'Produto B'$$), '^ok:0$');
select t.chk('dono do sistema (super) não recebe lista de venda de nenhuma loja', t.como(:'A0', 'select count(*) from public.produtos_venda()'), '^ok:0$');
select t.chk('sem sessão: produtos_venda recusado', t.como(null, 'select count(*) from public.produtos_venda()'), 'ERRO');
-- esgotar o produto Z (vende tudo) → desaparece da lista do caixa, mas o produto não é apagado e o dono continua a vê-lo
select t.chk('caixa vende todo o stock do produto Z', t.como(:'A2', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-0000000000a1","qtd":20}]'::jsonb,'Numerário'))->>'total'$$), '^ok:100');
select t.chk('stock zero: desaparece da lista do caixa', t.como(:'A2', $$select count(*) from public.produtos_venda() where nome = 'Produto Z'$$), '^ok:0$');
select t.chk('stock zero: o código de barras diz "indisponível" (não "não registado")', t.como(:'A2', $$select ((public.produto_por_codigo('7000001'))->>'encontrado') || '/' || ((public.produto_por_codigo('7000001'))->>'disponivel')$$), '^ok:true/false$');
select t.chk('stock zero: o código da embalagem também', t.como(:'A2', $$select ((public.produto_por_codigo('7000002'))->>'caixa') || '/' || ((public.produto_por_codigo('7000002'))->>'disponivel')$$), '^ok:true/false$');
select t.chk('stock zero: o servidor recusa a venda mesmo por API direta', t.faz(:'A2', $$select public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-0000000000a1","qtd":1}]'::jsonb,'Numerário')$$), 'ERRO');
select t.chk('stock zero: o produto NÃO foi apagado (continua ativo)', (select ativo::text from public.produtos where id = :'PZ'), '^true$');
select t.chk('stock zero: o dono continua a consultar o produto', t.como(:'A1', $$select count(*) from public.produtos where nome = 'Produto Z'$$), '^ok:1$');
select t.chk('stock zero: o gerente continua a consultar o produto', t.como(:'A3', $$select count(*) from public.produtos where nome = 'Produto Z'$$), '^ok:1$');
-- reposição → reaparece sozinho
select t.chk('reposição pelo gerente (entrada de stock)', t.faz(:'A3', $$select public.entrada_stock('f0000000-0000-0000-0000-0000000000a1', 12, 'R1', null, 0, 'reposição', 2)$$), '^ok$');
select t.chk('reposição: o produto reaparece na lista do caixa', t.como(:'A2', $$select disp_un from public.produtos_venda() where nome = 'Produto Z'$$), '^ok:12$');
select t.chk('reposição: o código volta a estar disponível', t.como(:'A2', $$select (public.produto_por_codigo('7000001'))->>'disponivel'$$), '^ok:true$');
select t.chk('código de barras lido devolve foto_ver, nome e preço (sem custo)', t.como(:'A2', $$select ((public.produto_por_codigo('7000001')) ? 'nome') || '/' || ((public.produto_por_codigo('7000001')) ? 'custo') || '/' || ((public.produto_por_codigo('7000001')) ? 'minimo')$$), '^ok:true/false/false$');
select t.chk('código lido na embalagem aplica o preço da embalagem', t.como(:'A2', $$select (public.produto_por_codigo('7000002'))->>'preco'$$), '^ok:45');
select t.chk('código desconhecido: não encontrado', t.como(:'A2', $$select (public.produto_por_codigo('0000000'))->>'encontrado'$$), '^ok:false$');
select t.chk('código de outra loja não é reconhecido', t.como(:'B2', $$select (public.produto_por_codigo('7000001'))->>'encontrado'$$), '^ok:false$');
select t.chk('produto sem stock só por lote vencido: código diz indisponível', t.como(:'A2', $$select (public.produto_por_codigo('7000009'))->>'disponivel'$$), '^ok:false$');

-- ================== 2. FOTOGRAFIAS (Storage) ==================
select t.chk('contentor de fotografias é privado, com limite e tipos', (select (not public)::text || '/' || file_size_limit || '/' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'produtos-fotos'), '^true/307200/image/jpeg,image/webp,image/png$');
select t.chk('dono: carrega a fotografia do seu produto', t.faz(:'A1', $$insert into storage.objects(bucket_id, name, owner) values ('produtos-fotos', '11111111-1111-1111-1111-111111111111/f0000000-0000-0000-0000-0000000000a1/abc123xy-t.jpg', auth.uid())$$), '^ok$');
select t.chk('dono: carrega a versão grande', t.faz(:'A1', $$insert into storage.objects(bucket_id, name, owner) values ('produtos-fotos', '11111111-1111-1111-1111-111111111111/f0000000-0000-0000-0000-0000000000a1/abc123xy-f.jpg', auth.uid())$$), '^ok$');
select t.chk('caixa: não pode carregar fotografias', t.faz(:'A2', $$insert into storage.objects(bucket_id, name, owner) values ('produtos-fotos', '11111111-1111-1111-1111-111111111111/f0000000-0000-0000-0000-0000000000a1/zzz999aa-t.jpg', auth.uid())$$), 'ERRO');
select t.chk('gerente: não pode carregar fotografias', t.faz(:'A3', $$insert into storage.objects(bucket_id, name, owner) values ('produtos-fotos', '11111111-1111-1111-1111-111111111111/f0000000-0000-0000-0000-0000000000a1/zzz999aa-t.jpg', auth.uid())$$), 'ERRO');
select t.chk('dono: não pode escrever na pasta de outra loja', t.faz(:'A1', $$insert into storage.objects(bucket_id, name, owner) values ('produtos-fotos', '22222222-2222-2222-2222-222222222222/f0000000-0000-0000-0000-00000000000b/abc123xy-t.jpg', auth.uid())$$), 'ERRO');
select t.chk('dono: não pode ligar fotografia a produto de outra loja', t.faz(:'A1', $$insert into storage.objects(bucket_id, name, owner) values ('produtos-fotos', '11111111-1111-1111-1111-111111111111/f0000000-0000-0000-0000-00000000000b/abc123xy-t.jpg', auth.uid())$$), 'ERRO');
select t.chk('dono: nome de ficheiro fora do padrão é recusado', t.faz(:'A1', $$insert into storage.objects(bucket_id, name, owner) values ('produtos-fotos', '11111111-1111-1111-1111-111111111111/f0000000-0000-0000-0000-0000000000a1/virus.exe', auth.uid())$$), 'ERRO');
select t.chk('caixa da mesma loja lê as fotografias', t.como(:'A2', $$select count(*) from storage.objects where bucket_id = 'produtos-fotos'$$), '^ok:2$');
select t.chk('outra loja NÃO lê as fotografias desta', t.como(:'B2', $$select count(*) from storage.objects where bucket_id = 'produtos-fotos'$$), '^ok:0$');
select t.chk('outra loja (dono) NÃO lê as fotografias desta', t.como(:'B1', $$select count(*) from storage.objects where bucket_id = 'produtos-fotos'$$), '^ok:0$');
select t.chk('caixa não apaga fotografias', t.como(:'A2', $$with d as (delete from storage.objects where bucket_id = 'produtos-fotos' returning 1) select count(*) from d$$), '^ok:0$');
select t.chk('dono de outra loja não apaga fotografias desta', t.como(:'B1', $$with d as (delete from storage.objects where bucket_id = 'produtos-fotos' returning 1) select count(*) from d$$), '^ok:0$');
select t.chk('sem sessão: não lê fotografias', t.como(null, $$select count(*) from storage.objects where bucket_id = 'produtos-fotos'$$), '^ok:0$|ERRO');
select t.faz(:'A1', $$update public.produtos set foto_ver = 'abc123xy' where id = 'f0000000-0000-0000-0000-0000000000a1'$$) as r \gset
select t.chk('dono: associa a fotografia ao produto', :'r' || ':' || (select foto_ver from public.produtos where id = :'PZ'), '^ok:abc123xy$');
select t.faz(:'A3', $$update public.produtos set foto_ver = 'hack0000', nome = 'Produto Z' where id = 'f0000000-0000-0000-0000-0000000000a1'$$) as r \gset
select t.chk('gerente: alterar a fotografia é ignorado', :'r' || ':' || (select foto_ver from public.produtos where id = :'PZ'), '^ok:abc123xy$');
select t.chk('foto_ver inválida é recusada', t.faz(:'A1', $$update public.produtos set foto_ver = '../../x' where id = 'f0000000-0000-0000-0000-0000000000a1'$$), 'ERRO');
select t.chk('o caixa lê foto_ver na lista de venda', t.como(:'A2', $$select foto_ver from public.produtos_venda() where nome = 'Produto Z'$$), '^ok:abc123xy$');
select t.chk('a fotografia não é guardada na tabela (só a versão, texto curto)', (select max(length(foto_ver))::text from public.produtos), '^[0-9]$|^1[0-9]$');
select t.chk('dono: remove a fotografia (foto_ver vazio) e apaga os ficheiros', t.como(:'A1', $$with d as (delete from storage.objects where bucket_id = 'produtos-fotos' and name like '%abc123xy-%' returning 1) select count(*) from d$$), '^ok:2$');
select t.faz(:'A1', $$update public.produtos set foto_ver = null where id = 'f0000000-0000-0000-0000-0000000000a1'$$) as r \gset
select t.chk('dono: produto fica sem fotografia', :'r' || ':' || coalesce((select foto_ver from public.produtos where id = :'PZ'), 'nulo'), '^ok:nulo$');
-- limite de stock baixo: só o dono
select t.faz(:'A3', $$update public.produtos set minimo = 99, preco = 6 where id = 'f0000000-0000-0000-0000-0000000000a1'$$) as r \gset
select t.chk('gerente: alterar o limite de stock baixo é ignorado (o preço altera-se)', :'r' || ':' || (select minimo || '/' || preco from public.produtos where id = :'PZ'), '^ok:5/6\.00$');
select t.faz(:'A1', $$update public.produtos set minimo = 8, preco = 5 where id = 'f0000000-0000-0000-0000-0000000000a1'$$) as r \gset
select t.chk('dono: define o limite de stock baixo', :'r' || ':' || (select minimo::text from public.produtos where id = :'PZ'), '^ok:8$');

-- ================== 3. NOTIFICAÇÕES ==================
delete from public.notificacoes;
-- venda concluída (caixa) → 1 notificação, repetida (mesmo ref) não duplica
select t.chk('caixa vende (para gerar notificação)', t.como(:'A2', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'M-Pesa', null, 0, 0, '77777777-7777-7777-7777-777777777777'))->>'total'$$), '^ok:10');
select t.chk('a repetição da mesma venda (sincronização) também devolve a venda', t.como(:'A2', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'M-Pesa', null, 0, 0, '77777777-7777-7777-7777-777777777777'))->>'total'$$), '^ok:10');
select t.chk('venda concluída gera UMA notificação (sem duplicados na repetição)', (select count(*)::text from public.notificacoes where tipo = 'venda'), '^1$');
select t.chk('a notificação da venda traz venda, funcionário, valor, pagamento e data', (select (dados ? 'num')::text || (dados->>'funcionario') || '/' || (dados->>'total') || '/' || (dados->>'pagamento') || '/' || (dados ? 'data')::text from public.notificacoes where tipo = 'venda'), '^trueCaixa A/10\.00/M-Pesa/true$');
select t.chk('dono vê a notificação da venda', t.como(:'A1', $$select count(*) from public.minhas_notificacoes() where tipo = 'venda'$$), '^ok:1$');
select t.chk('dono: 1 por ler', t.como(:'A1', 'select public.notificacoes_nao_lidas()'), '^ok:1$');
select t.chk('gerente vê a notificação da venda', t.como(:'A3', $$select count(*) from public.minhas_notificacoes() where tipo = 'venda'$$), '^ok:1$');
select t.chk('CAIXA não tem acesso ao centro de notificações (lista vazia)', t.como(:'A2', 'select count(*) from public.minhas_notificacoes()'), '^ok:0$');
select t.chk('CAIXA: contador a zero', t.como(:'A2', 'select public.notificacoes_nao_lidas()'), '^ok:0$');
select t.chk('CAIXA: não lê a tabela diretamente (RLS)', t.como(:'A2', 'select count(*) from public.notificacoes'), '^ok:0$');
select t.chk('CAIXA: não marca notificações', t.faz(:'A2', 'select public.marcar_todas_lidas()'), 'ERRO');
select t.chk('outra loja não vê estas notificações', t.como(:'B1', 'select count(*) from public.minhas_notificacoes()'), '^ok:0$');
select t.chk('outra loja não lê a tabela diretamente', t.como(:'B1', 'select count(*) from public.notificacoes'), '^ok:0$');
select id as notif_a from public.notificacoes where tipo = 'venda' limit 1 \gset
select t.faz(:'B1', format($$select public.marcar_notificacao_lida(%L)$$, :'notif_a')) as r \gset
select t.chk('outra loja não consegue marcar notificações desta (nada é gravado)', (select count(*)::text from public.notificacoes_lidas where usuario_id = :'B1'), '^0$');
select t.chk('dono: não escreve diretamente em notificacoes', t.faz(:'A1', $$insert into public.notificacoes(loja_id, tipo, titulo) values ('11111111-1111-1111-1111-111111111111', 'venda', 'falsa')$$), 'ERRO');
select t.chk('dono: não apaga notificações diretamente', t.faz(:'A1', 'delete from public.notificacoes'), 'ERRO');
select t.chk('ninguém lê a tabela de lidas', t.como(:'A1', 'select count(*) from public.notificacoes_lidas'), 'ERRO');
select t.chk('dono marca uma como lida', t.faz(:'A1', $$select public.marcar_notificacao_lida((select id from public.minhas_notificacoes() limit 1))$$), '^ok$');
select t.chk('dono: contador desce para 0', t.como(:'A1', 'select public.notificacoes_nao_lidas()'), '^ok:0$');
select t.chk('ler no dono não altera o contador do gerente', t.como(:'A3', 'select public.notificacoes_nao_lidas()'), '^ok:1$');
select t.chk('marcar a mesma duas vezes é inofensivo', t.faz(:'A1', $$select public.marcar_notificacao_lida((select id from public.minhas_notificacoes() limit 1))$$), '^ok$');
-- stock baixo e zero (produto Z: mínimo 8, stock 12)
delete from public.notificacoes;
\set VZ '[{"produto_id":"f0000000-0000-0000-0000-0000000000a1","qtd":%s}]'
select t.como(:'A1', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-0000000000a1","qtd":3}]'::jsonb,'Numerário'))->>'total'$$) as r \gset
select t.chk('vender 3: 12→9 (acima do limite) não notifica stock', :'r' || '/' || (select count(*)::text from public.notificacoes where tipo like 'stock%'), '^ok:15\.00/0$');
select t.como(:'A1', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-0000000000a1","qtd":2}]'::jsonb,'Numerário'))->>'total'$$) as r \gset
select t.chk('vender 2: 9→7 (cruza o limite 8) gera 1 aviso de stock baixo', (select count(*)::text from public.notificacoes where tipo = 'stock_baixo'), '^1$');
select t.chk('stock baixo identifica o produto, o stock e o limite', (select (dados->>'produto') || '/' || (dados->>'stock') || '/' || (dados->>'minimo') from public.notificacoes where tipo = 'stock_baixo'), '^Produto Z/7/8$');
select t.como(:'A1', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-0000000000a1","qtd":1}]'::jsonb,'Numerário'))->>'total'$$) as r \gset
select t.chk('vender mais 1 (7→6) não repete o aviso', (select count(*)::text from public.notificacoes where tipo = 'stock_baixo'), '^1$');
select t.como(:'A1', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-0000000000a1","qtd":6}]'::jsonb,'Numerário'))->>'total'$$) as r \gset
select t.chk('vender o resto (6→0) gera 1 aviso de stock zero', (select count(*)::text from public.notificacoes where tipo = 'stock_zero'), '^1$');
select t.chk('stock zero identifica o produto e o momento', (select (dados->>'produto') || '/' || (dados ? 'em')::text from public.notificacoes where tipo = 'stock_zero'), '^Produto Z/true$');
select t.chk('a mesma queda não gera mais avisos de stock', (select count(*)::text from public.notificacoes where tipo in ('stock_baixo', 'stock_zero')), '^2$');
select t.faz(:'A3', $$select public.entrada_stock('f0000000-0000-0000-0000-0000000000a1', 20, 'R2', null, 0, 'reposição', 20)$$) as r \gset
select t.chk('a reposição não gera aviso', (select count(*)::text from public.notificacoes where tipo in ('stock_baixo', 'stock_zero')), '^2$');
select t.como(:'A1', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-0000000000a1","qtd":20}]'::jsonb,'Numerário'))->>'total'$$) as r \gset
select t.chk('novo episódio (20→0): novo aviso de stock zero', (select count(*)::text from public.notificacoes where tipo = 'stock_zero'), '^2$');
select t.faz(:'A3', $$select public.entrada_stock('f0000000-0000-0000-0000-0000000000a1', 3, 'R3', null, 0, 'reposição', 3)$$) as r \gset
select id as lote_r3 from public.lotes where produto_id = :'PZ' and qtd > 0 limit 1 \gset
select t.faz(:'A3', format($$select public.baixa_stock(%L, 3, 'perda')$$, :'lote_r3')) as r \gset
select t.chk('a baixa de stock (perda) do gerente que zera também avisa', :'r' || '/' || (select count(*)::text from public.notificacoes where tipo = 'stock_zero'), '^ok/3$');
-- produto com limite 0: nunca "baixo"
select t.chk('limite 0: só avisa quando chega a zero', (select count(*)::text from public.notificacoes where tipo = 'stock_baixo' and dados->>'produto' = 'Produto A'), '^0$');
-- anulação
select id as venda_77 from public.vendas where ref_cliente = '77777777-7777-7777-7777-777777777777' \gset
select t.chk('gerente anula uma venda (precisa de motivo)', t.faz(:'A3', format($$select public.anular_venda(%L, 'cliente desistiu')$$, :'venda_77')), '^ok$');
select t.chk('a anulação gera notificação com venda, funcionário e motivo', (select (dados->>'funcionario') || '/' || (dados->>'anulada_por') || '/' || (dados->>'motivo') from public.notificacoes where tipo = 'venda_anulada'), '^Caixa A/Gerente A/cliente desistiu$');
select t.chk('a anulação não gera duplicados', (select count(*)::text from public.notificacoes where tipo = 'venda_anulada'), '^1$');
-- o gerente nunca recebe custos, lucros, margens ou despesas
select t.chk('gerente: nenhuma notificação traz custo, lucro, margem ou despesa', t.como(:'A3', $$select count(*) from public.minhas_notificacoes() where dados::text ~* '(custo|lucro|margem|despesa)'$$), '^ok:0$');
select t.chk('nenhuma notificação (em toda a base) tem custo/lucro/margem/despesa', (select count(*)::text from public.notificacoes where dados::text ~* '(custo|lucro|margem|despesa)'), '^0$');
select t.chk('gerente vê venda, stock e anulação', t.como(:'A3', $$select string_agg(distinct tipo, ',' order by tipo) from public.minhas_notificacoes(100)$$), '^ok:stock_baixo,stock_zero,venda_anulada$|^ok:stock_baixo,stock_zero,venda,venda_anulada$');
select t.chk('dono vê todos os tipos de stock e anulação', t.como(:'A1', $$select count(distinct tipo) from public.minhas_notificacoes(100)$$), '^ok:[34]$');
select public._notificar(:'LA', 'venda', 'duplicada?', '{}', 'chave-teste-1'), public._notificar(:'LA', 'venda', 'duplicada?', '{}', 'chave-teste-1') \gset
select t.chk('a mesma chave de notificação (repetição de pedido) grava só uma vez', (select count(*)::text from public.notificacoes where chave = 'chave-teste-1'), '^1$');
select t.chk('marcar todas como lidas (dono)', t.como(:'A1', 'select public.marcar_todas_lidas() >= 0'), '^ok:true$');
select t.chk('depois de marcar todas, contador 0', t.como(:'A1', 'select public.notificacoes_nao_lidas()'), '^ok:0$');
select t.chk('paginação: limite respeitado', t.como(:'A1', 'select count(*) from public.minhas_notificacoes(2)'), '^ok:2$');

-- ================== 4. FECHO DE CAIXA ==================
delete from public.notificacoes;
-- movimento do caixa A5: 3 vendas ativas (50 dinheiro, 30 M-Pesa, 20 fiado) e 1 anulada (10 dinheiro)
select t.como(:'A5', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":5}]'::jsonb,'Numerário'))->>'id'$$) as v1 \gset
select t.como(:'A5', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":3}]'::jsonb,'M-Pesa'))->>'id'$$) as v2 \gset
select t.como(:'A5', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":2}]'::jsonb,'Fiado','d0000000-0000-0000-0000-00000000000a'))->>'id'$$) as v3 \gset
select substr(t.como(:'A5', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário'))->>'id'$$), 4) as v4 \gset
select t.chk('gerente anula a 4.ª venda do caixa A5', t.faz(:'A3', format($$select public.anular_venda(%L, 'erro de digitação')$$, :'v4')), '^ok$');
select t.chk('pré-visualização: vendas, total, dinheiro, outros, fiado, anuladas', t.como(:'A5', $$select (r->>'n_vendas') || '/' || (r->>'total_vendido') || '/' || (r->>'dinheiro') || '/' || (r->>'outros') || '/' || (r->>'fiado') || '/' || (r->>'n_anuladas') || '/' || (r->>'total_anuladas') from (select public.resumo_caixa() r) x$$), '^ok:3/100\.00/50\.00/30\.00/20\.00/1/10\.00$');
select t.chk('pré-visualização identifica o caixa e o funcionário', t.como(:'A5', $$select ((public.resumo_caixa())->>'caixa_nome') || '/' || ((public.resumo_caixa())->>'usuario_nome')$$), '^ok:Caixa de Caixa Cinco/Caixa Cinco$');
select t.chk('pré-visualização não grava nada', (select count(*)::text from public.caixa_fechos), '^0$');
select t.chk('o resumo de um caixa não inclui as vendas de outro', t.como(:'A6', $$select (public.resumo_caixa())->>'n_vendas'$$), '^ok:0$');
select t.chk('super não pode fechar caixa', t.faz(:'A0', 'select public.fechar_caixa(10)'), 'ERRO');
select t.chk('sem sessão não fecha caixa', t.como(null, 'select public.fechar_caixa(10)'), 'ERRO');
select t.chk('contagem em falta é recusada', t.faz(:'A5', 'select public.fechar_caixa(null)'), 'ERRO');
select t.chk('contagem negativa é recusada', t.faz(:'A5', 'select public.fechar_caixa(-1)'), 'ERRO');
select t.chk('valor inicial negativo é recusado', t.faz(:'A5', 'select public.fechar_caixa(10, null, -5)'), 'ERRO');
select t.chk('nada foi gravado pelas recusas', (select count(*)::text from public.caixa_fechos), '^0$');
-- fecho certo: fundo 20 + dinheiro 50 = esperado 70; contado 70 → diferença 0
select t.como(:'A5', $$select (public.fechar_caixa(70, 'tudo certo', 20, 'c1111111-1111-1111-1111-111111111111'))::text$$) as f1 \gset
select t.chk('fecho com valores corretos: esperado, contado e diferença', (select esperado || '/' || contado || '/' || diferenca || '/' || n_vendas || '/' || total_vendido || '/' || dinheiro || '/' || outros || '/' || fiado from public.caixa_fechos), '^70\.00/70\.00/0\.00/3/100\.00/50\.00/30\.00/20\.00$');
select t.chk('o fecho guarda funcionário, caixa, data/hora, valor inicial e observação', (select usuario_nome || '/' || caixa_nome || '/' || fundo_inicial || '/' || obs || '/' || (fim is not null)::text || '/' || (data_mov is not null)::text || '/' || estado from public.caixa_fechos), '^Caixa Cinco/Caixa de Caixa Cinco/20\.00/tudo certo/true/true/fechado$');
select t.chk('o fecho guarda as anuladas', (select n_anuladas || '/' || total_anuladas from public.caixa_fechos), '^1/10\.00$');
select t.chk('o fecho guarda o total por método de pagamento', (select por_metodo::text from public.caixa_fechos), 'M-Pesa');
select t.chk('o dono recebe "Caixa fechado com sucesso."', t.como(:'A1', $$select titulo from public.minhas_notificacoes() where tipo = 'caixa_fechado'$$), '^ok:Caixa fechado com sucesso\.$');
select t.chk('a notificação traz caixa, funcionário, data, totais, contado e diferença', (select (dados ? 'caixa')::text || (dados ? 'funcionario')::text || (dados ? 'fim')::text || (dados->>'total_vendido') || '/' || (dados->>'dinheiro') || '/' || (dados->>'outros') || '/' || (dados->>'contado') || '/' || (dados->>'diferenca') from public.notificacoes where tipo = 'caixa_fechado'), '^truetruetrue100\.00/50\.00/30\.00/70\.00/0\.00$');
select t.chk('o gerente NÃO recebe notificações de fecho de caixa', t.como(:'A3', $$select count(*) from public.minhas_notificacoes(100) where tipo like 'caixa%'$$), '^ok:0$');
select t.chk('o caixa não recebe notificações', t.como(:'A5', 'select count(*) from public.minhas_notificacoes()'), '^ok:0$');
select t.chk('outra loja não vê o fecho nem a notificação', t.como(:'B1', $$select (select count(*) from public.caixa_fechos) || '/' || (select count(*) from public.minhas_notificacoes())$$), '^ok:0/0$');
-- fecho duplicado
select t.chk('o mesmo pedido repetido (mesma referência) devolve o fecho, sem duplicar', t.como(:'A5', $$select (public.fechar_caixa(70, 'tudo certo', 20, 'c1111111-1111-1111-1111-111111111111'))->>'repetido'$$), '^ok:true$');
select t.chk('… e continua a existir só 1 fecho e 1 notificação', (select count(*)::text from public.caixa_fechos) || '/' || (select count(*)::text from public.notificacoes where tipo = 'caixa_fechado'), '^1/1$');
select t.chk('segundo fecho sem movimento novo (outra referência) é recusado', t.faz(:'A5', 'select public.fechar_caixa(70, null, 20, ''c2222222-2222-2222-2222-222222222222'')'), 'ERRO.*já está fechado');
select t.chk('a recusa não gravou nada', (select count(*)::text from public.caixa_fechos), '^1$');
select t.chk('o resumo diz que o caixa está fechado', t.como(:'A5', $$select (public.resumo_caixa())->>'ja_fechado'$$), '^ok:true$');
-- imutabilidade
select t.chk('caixa: não altera o fecho', t.faz(:'A5', $$update public.caixa_fechos set contado = 999$$), 'ERRO');
select t.chk('caixa: não apaga o fecho', t.faz(:'A5', 'delete from public.caixa_fechos'), 'ERRO');
select t.chk('caixa: não cria fechos à mão', t.faz(:'A5', $$insert into public.caixa_fechos(loja_id, usuario_id, caixa_nome, usuario_nome, data_mov, inicio, fim, n_vendas, total_vendido, dinheiro, outros, fiado, esperado, contado, diferenca) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a5', 'x', 'x', current_date, now(), now(), 0, 0, 0, 0, 0, 0, 0, 0)$$), 'ERRO');
select t.chk('dono: não altera o fecho diretamente', t.faz(:'A1', $$update public.caixa_fechos set contado = 999$$), 'ERRO');
select t.chk('dono: não apaga o fecho', t.faz(:'A1', 'delete from public.caixa_fechos'), 'ERRO');
select t.chk('mesmo a administração não altera valores do fecho (gatilho)', t.erra($$update public.caixa_fechos set contado = 999$$), 'true');
select t.chk('mesmo a administração não apaga o fecho (gatilho)', t.erra($$delete from public.caixa_fechos$$), 'true');
select t.chk('o fecho continua intacto', (select contado::text from public.caixa_fechos), '^70\.00$');
-- histórico
select t.chk('dono: consulta o histórico de fechos', t.como(:'A1', 'select count(*) from public.caixa_fechos'), '^ok:1$');
select t.chk('dono: vê quem fechou', t.como(:'A1', 'select usuario_nome from public.caixa_fechos'), '^ok:Caixa Cinco$');
select t.chk('o próprio funcionário vê o seu fecho', t.como(:'A5', 'select count(*) from public.caixa_fechos'), '^ok:1$');
select t.chk('outro caixa NÃO vê o fecho de A5', t.como(:'A6', 'select count(*) from public.caixa_fechos'), '^ok:0$');
select t.chk('gerente NÃO vê fechos de outros', t.como(:'A3', 'select count(*) from public.caixa_fechos'), '^ok:0$');
-- falta de dinheiro
select t.como(:'A5', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":4}]'::jsonb,'Numerário'))->>'id'$$) as v5 \gset
select t.como(:'A5', $$select (public.fechar_caixa(35, 'troco dado a mais', 0, 'c3333333-3333-3333-3333-333333333333'))::text$$) as f2 \gset
select t.chk('fecho com falta: esperado 40, contado 35, diferença -5', (select esperado || '/' || contado || '/' || diferenca || '/' || obs from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), '^40\.00/35\.00/-5\.00/troco dado a mais$');
select t.chk('o segundo fecho só conta o movimento depois do primeiro', (select n_vendas || '/' || total_vendido from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), '^1/40\.00$');
select t.chk('a notificação destaca a diferença', (select (dados->>'diferenca') from public.notificacoes where tipo = 'caixa_fechado' order by criada_em desc limit 1), '^-5\.00$');
-- reabertura
select t.chk('caixa não reabre', t.faz(:'A5', $$select public.reabrir_caixa((select id from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), 'quero mais vendas')$$), 'ERRO');
select t.chk('gerente não reabre', t.faz(:'A3', $$select public.reabrir_caixa((select id from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), 'quero mais vendas')$$), 'ERRO');
select t.chk('dono de outra loja não reabre', t.faz(:'B1', $$select public.reabrir_caixa((select id from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), 'x')$$), 'ERRO');
select t.chk('dono: reabrir exige motivo', t.faz(:'A1', $$select public.reabrir_caixa((select id from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), '  ')$$), 'ERRO');
select t.chk('dono: só reabre o fecho mais recente', t.faz(:'A1', $$select public.reabrir_caixa((select id from public.caixa_fechos where ref_cliente = 'c1111111-1111-1111-1111-111111111111'), 'antigo')$$), 'ERRO.*mais recente');
select t.chk('dono: reabre o fecho mais recente', t.faz(:'A1', $$select public.reabrir_caixa((select id from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), 'contagem errada')$$), '^ok$');
select t.chk('a reabertura NÃO apaga o fecho: valores e histórico mantêm-se', (select estado || '/' || contado || '/' || diferenca || '/' || reaberto_por || '/' || reaberto_motivo from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), '^reaberto/35\.00/-5\.00/Dono A/contagem errada$');
select t.chk('o dono é notificado da reabertura', t.como(:'A1', $$select count(*) from public.minhas_notificacoes() where tipo = 'caixa_reaberto'$$), '^ok:1$');
select t.chk('não se reabre duas vezes', t.faz(:'A1', $$select public.reabrir_caixa((select id from public.caixa_fechos where ref_cliente = 'c3333333-3333-3333-3333-333333333333'), 'outra vez')$$), 'ERRO.*já foi reaberto');
select t.chk('a reabertura fica na auditoria', (select count(*)::text from public.auditoria where acao = 'reabrir_caixa'), '^1$');
select t.chk('depois de reaberto, o caixa já não está "fechado"', t.como(:'A5', $$select (public.resumo_caixa())->>'ja_fechado'$$), '^ok:false$');
select t.chk('depois de reaberto, o movimento volta a contar desde o fecho anterior', t.como(:'A5', $$select (public.resumo_caixa())->>'n_vendas'$$), '^ok:1$');
select t.como(:'A5', $$select (public.fechar_caixa(45, 'recontei', 0, 'c4444444-4444-4444-4444-444444444444'))::text$$) as f3 \gset
select t.chk('novo fecho depois da reabertura: excesso +5', (select esperado || '/' || contado || '/' || diferenca from public.caixa_fechos where ref_cliente = 'c4444444-4444-4444-4444-444444444444'), '^40\.00/45\.00/5\.00$');
select t.chk('o historico tem o fecho original (reaberto) e o novo', (select string_agg(estado, ',' order by criado_em) from public.caixa_fechos), '^fechado,reaberto,fechado$');
-- caixas independentes
select t.chk('o fecho de A5 não fechou o caixa de A6', t.como(:'A6', $$select (public.resumo_caixa())->>'ultimo_fecho_em' is null$$), '^ok:true$');
select t.como(:'A6', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":2}]'::jsonb,'Numerário'))->>'id'$$) as v6 \gset
select t.chk('A6 fecha o seu caixa sem afetar A5', t.faz(:'A6', $$select public.fechar_caixa(20, null, 0, 'c5555555-5555-5555-5555-555555555555')$$), '^ok$');
select t.chk('o fecho de A6 só conta as suas vendas', (select n_vendas || '/' || total_vendido from public.caixa_fechos where usuario_id = :'A6'), '^1/20\.00$');
select t.chk('o último fecho de A5 continua o mesmo', (select count(*)::text from public.caixa_fechos where usuario_id = :'A5'), '^3$');
-- sincronização depois de ficar offline: o fecho feito com a hora do aparelho (há 1 min) conta as vendas offline anteriores, enviadas só agora
select t.como(:'A7', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário', null, 0, 0, 'e0000000-0000-0000-0000-0000000000e1', now() - interval '3 minutes'))->>'id'$$) as v7 \gset
select t.como(:'A7', $$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":2}]'::jsonb,'Numerário', null, 0, 0, 'e0000000-0000-0000-0000-0000000000e2', now() - interval '2 minutes'))->>'id'$$) as v8 \gset
select t.chk('fecho offline (hora do aparelho há 1 min) enviado agora', t.faz(:'A7', $$select public.fechar_caixa(30, 'feito sem internet', 0, 'c6666666-6666-6666-6666-666666666666', now() - interval '1 minute')$$), '^ok$');
select t.chk('o fecho offline foi calculado no servidor: 2 vendas, 30 em dinheiro, diferença 0', (select n_vendas || '/' || dinheiro || '/' || diferenca from public.caixa_fechos where ref_cliente = 'c6666666-6666-6666-6666-666666666666'), '^2/30\.00/0\.00$');
select t.chk('o fecho offline guarda a hora do aparelho', (select (fim < now() - interval '50 seconds')::text from public.caixa_fechos where ref_cliente = 'c6666666-6666-6666-6666-666666666666'), '^true$');
select t.chk('reenvio do fecho offline após reconexão: sem duplicar', t.como(:'A7', $$select (public.fechar_caixa(30, 'feito sem internet', 0, 'c6666666-6666-6666-6666-666666666666', now() - interval '1 minute'))->>'repetido'$$), '^ok:true$');
select t.chk('… continua 1 só fecho com essa referência', (select count(*)::text from public.caixa_fechos where ref_cliente = 'c6666666-6666-6666-6666-666666666666'), '^1$');
select t.chk('fecho com hora anterior ao último fecho é recusado', t.faz(:'A7', $$select public.fechar_caixa(0, null, 0, 'c7777777-7777-7777-7777-777777777777', now() - interval '2 minutes')$$), 'ERRO');
-- recebimentos de dívidas em dinheiro entram no esperado (por quem os recebeu)
select t.faz(:'A3', $$select public.receber_fiado('d0000000-0000-0000-0000-00000000000a', 5, 'Numerário')$$) as r \gset
select t.chk('gerente recebe uma dívida em dinheiro', :'r', '^ok$');
select t.chk('o recebimento regista quem o recebeu', (select usuario_id::text from public.recebimentos order by data desc limit 1), :'A3');
select t.chk('o recebimento em dinheiro conta no esperado do gerente', t.como(:'A3', $$select (public.resumo_caixa())->>'recebimentos_dinheiro'$$), '^ok:5\.00$');
-- vendas (e outras tabelas) não foram tocadas pelas notificações
select t.chk('as vendas mantêm-se (só se leram); contador consistente', (select (count(*) > 0)::text from public.vendas), '^true$');
-- RLS/privilégios das tabelas novas
select t.chk('anon não lê notificações', t.como(null, 'select count(*) from public.notificacoes'), 'ERRO|ok:0');
select t.chk('anon não lê fechos', t.como(null, 'select count(*) from public.caixa_fechos'), 'ERRO|ok:0');
select t.chk('as funções internas não são chamáveis pela API', t.faz(:'A1', $$select public._notificar('11111111-1111-1111-1111-111111111111','venda','x','{}',null)$$), 'ERRO');
select t.chk('o cálculo interno do caixa não é chamável pela API', t.faz(:'A1', $$select public._caixa_calc('00000000-0000-0000-0000-0000000000a5','11111111-1111-1111-1111-111111111111', now())$$), 'ERRO');

-- Duas lojas (A e B) e utilizadores de cada uma, mais o dono do sistema (a0). Criado como administrador (sem RLS).
insert into auth.users(id, email, created_at) values
 ('00000000-0000-0000-0000-0000000000a1', 'a1@teste.local', now() - interval '3 days'),
 ('00000000-0000-0000-0000-0000000000a2', 'a2@teste.local', now() - interval '3 days'),
 ('00000000-0000-0000-0000-0000000000a3', 'a3@teste.local', now() - interval '3 days'),
 ('00000000-0000-0000-0000-0000000000a4', 'a4@teste.local', now() - interval '3 days'),
 ('00000000-0000-0000-0000-0000000000b1', 'b1@teste.local', now() - interval '3 days'),
 ('00000000-0000-0000-0000-0000000000b2', 'b2@teste.local', now() - interval '3 days'),
 ('00000000-0000-0000-0000-0000000000d1', 'novo@teste.local', now());
insert into public.lojas(id, codigo, nome, tipo, estado, valido_ate, configurada) values
 ('11111111-1111-1111-1111-111111111111', '11111', 'Loja A', 'Mercearia', 'ativa', public.hoje() + 30, true),
 ('22222222-2222-2222-2222-222222222222', '22222', 'Loja B', 'Mercearia', 'ativa', public.hoje() + 30, true);
insert into public.contadores(loja_id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.perfis(id, loja_id, nome, papel, email) values
 ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Dono A', 'dono', 'a1@teste.local'),
 ('00000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'Caixa A', 'caixa', 'a2@teste.local'),
 ('00000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'Gerente A', 'gerente', 'a3@teste.local'),
 ('00000000-0000-0000-0000-0000000000a4', '11111111-1111-1111-1111-111111111111', 'Caixa A com código', 'caixa', 'a4@teste.local'),
 ('00000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'Dono B', 'dono', 'b1@teste.local'),
 ('00000000-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'Caixa B', 'caixa', 'b2@teste.local');
select public._definir_pin('00000000-0000-0000-0000-0000000000a4', '123456');
insert into public.categorias(id, loja_id, nome) values ('c0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Cat A'), ('c0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Cat B');
insert into public.produtos(id, loja_id, nome, custo, preco, ativo) values
 ('f0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Produto A', 5, 10, true),
 ('f0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Produto B', 5, 10, true);
insert into public.lotes(id, loja_id, produto_id, qtd, soltas) values
 ('e0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-00000000000a', 50, 50),
 ('e0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-00000000000b', 50, 50);
insert into public.clientes(id, loja_id, nome, divida) values
 ('d0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Cliente A', 0),
 ('d0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Cliente B', 100);
insert into public.vendas(id, loja_id, num, pagamento, subtotal, total, itens) values
 ('a0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 1, 'Numerário', 10, 10, '[]');
insert into public.suporte_tickets(id, loja_id, assunto) values ('b0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'Ticket B');

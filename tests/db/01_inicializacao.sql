-- Fase 1: base vazia (ainda sem dono do sistema). Utilizadores novos X1..X3 (sem perfil), como quem se registou na app.
insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-0000000000c1', 'x1@teste.local'), ('00000000-0000-0000-0000-0000000000c2', 'x2@teste.local'), ('00000000-0000-0000-0000-0000000000c3', 'x3@teste.local');

select t.chk('anónimo vê a inicialização FECHADA por omissão', t.como(null, 'select public.estado_inicializacao()'), 'ok:fechada');
select t.chk('utilizador novo NÃO consegue tornar-se dono com a inicialização fechada', t.faz('00000000-0000-0000-0000-0000000000c1', $$select public.reivindicar_super('Intruso')$$), 'ERRO');
select t.chk('anónimo NÃO pode chamar reivindicar_super', t.faz(null, $$select public.reivindicar_super('Anon')$$), 'ERRO');
select t.chk('utilizador NÃO consegue abrir a inicialização pela API (plataforma)', t.faz('00000000-0000-0000-0000-0000000000c1', $$update public.plataforma set inicializacao_aberta = true$$) || ':' || (select inicializacao_aberta::text from public.plataforma where id = 1), ':false$');
select t.chk('ainda não existe nenhum dono', (select count(*)::text from public.perfis where papel = 'super'), '^0$');

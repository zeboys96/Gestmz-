-- Fase 3: já existe um dono (criado pela fase de inicialização). Ataques contra o dono e a inicialização.
select t.chk('inicialização fechada depois de criado o dono', t.como(null, 'select public.estado_inicializacao()'), 'ok:fechada');
select t.chk('existe exatamente 1 dono e está ativo', (select count(*) || '/' || count(*) filter (where ativo) from public.perfis where papel = 'super'), '^1/1$');
select t.chk('2.º utilizador NÃO consegue ser dono (formulário público / RPC direto)', t.faz('00000000-0000-0000-0000-0000000000c2', $$select public.reivindicar_super('Segundo')$$), 'ERRO');
select t.chk('o próprio dono NÃO consegue criar outro dono para outra conta', t.faz('00000000-0000-0000-0000-0000000000a0', $$select public.reivindicar_super('Outro')$$), 'ERRO');
select t.chk('perfis: ninguém insere um perfil super pela API (X2)', t.faz('00000000-0000-0000-0000-0000000000c2', $$insert into public.perfis(id, loja_id, nome, papel) values ('00000000-0000-0000-0000-0000000000c2', null, 'x', 'super')$$), 'ERRO');
select t.chk('perfis: o dono NÃO consegue desativar-se', t.faz('00000000-0000-0000-0000-0000000000a0', $$update public.perfis set ativo = false where id = '00000000-0000-0000-0000-0000000000a0'$$), 'ERRO');
select t.chk('perfis: o dono NÃO consegue mudar o próprio papel', t.faz('00000000-0000-0000-0000-0000000000a0', $$update public.perfis set papel = 'caixa', loja_id = (select id from public.lojas limit 1) where id = '00000000-0000-0000-0000-0000000000a0'$$), 'ERRO');
select t.chk('perfis: o dono NÃO pode ser apagado pela API', t.faz('00000000-0000-0000-0000-0000000000a0', $$delete from public.perfis where id = '00000000-0000-0000-0000-0000000000a0'$$), 'ERRO');
select t.chk('perfis: dono da loja NÃO se promove a super', t.faz('00000000-0000-0000-0000-0000000000a1', $$update public.perfis set papel = 'super', loja_id = null where id = '00000000-0000-0000-0000-0000000000a1'$$), 'ERRO');
select t.chk('perfis: dono da loja NÃO promove um caixa a super', t.faz('00000000-0000-0000-0000-0000000000a1', $$update public.perfis set papel = 'super', loja_id = null where id = '00000000-0000-0000-0000-0000000000a2'$$), 'ERRO');
select t.chk('perfis: caixa NÃO se promove a dono/gerente/super', t.faz('00000000-0000-0000-0000-0000000000a2', $$update public.perfis set papel = 'dono' where id = '00000000-0000-0000-0000-0000000000a2'$$), 'ERRO');
select t.chk('perfis: caixa NÃO muda de loja', t.faz('00000000-0000-0000-0000-0000000000a2', $$update public.perfis set loja_id = '22222222-2222-2222-2222-222222222222' where id = '00000000-0000-0000-0000-0000000000a2'$$), 'ERRO');
select t.chk('perfis: o dono da loja NÃO altera o e-mail/papel do dono do sistema', t.faz('00000000-0000-0000-0000-0000000000a1', $$update public.perfis set papel = 'caixa' where papel = 'super'$$) || ':' || (select count(*)::text from public.perfis where papel = 'super'), ':1$');
select t.chk('o dono do sistema continua ativo e com o mesmo papel', (select papel || '/' || ativo from public.perfis where id = '00000000-0000-0000-0000-0000000000a0'), '^super/true$');
-- plataforma: estado da inicialização só muda por administração
select t.chk('o dono do sistema NÃO reabre a inicialização pela API', t.faz('00000000-0000-0000-0000-0000000000a0', $$update public.plataforma set inicializacao_aberta = true, dono_inicializado = false$$), 'ERRO');
select t.chk('o dono do sistema pode continuar a editar preços', t.faz('00000000-0000-0000-0000-0000000000a0', $$update public.plataforma set preco_mensal = preco_mensal + 1$$), '^ok$');
select t.chk('perfis normais NÃO editam preços', t.faz('00000000-0000-0000-0000-0000000000a1', $$update public.plataforma set preco_mensal = 1$$) || ':' || (select (preco_mensal > 1)::text from public.plataforma), ':true$');
-- auditoria da plataforma
select t.chk('auditoria da plataforma: só o dono do sistema a lê', t.como('00000000-0000-0000-0000-0000000000a1', 'select count(*) from public.auditoria_plataforma'), '^(ok:0|ERRO)');
select t.chk('auditoria da plataforma: o dono do sistema vê registos', t.como('00000000-0000-0000-0000-0000000000a0', 'select count(*) from public.auditoria_plataforma'), '^ok:[1-9]');
select t.chk('auditoria da plataforma: ninguém a altera pela API', t.faz('00000000-0000-0000-0000-0000000000a0', $$delete from public.auditoria_plataforma$$) || ':' || (select (count(*) > 0)::text from public.auditoria_plataforma), '(ERRO.*|ok):true$');
select t.chk('auditoria: foi registada a criação do dono do sistema', (select count(*)::text from public.auditoria_plataforma where acao = 'dono_inicializado'), '^1$');
select t.chk('auditoria: foi registada a alteração de preços', (select (count(*) > 0)::text from public.auditoria_plataforma where acao = 'plataforma_alterada'), '^true$');

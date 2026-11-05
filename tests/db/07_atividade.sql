-- Migração 17: atividade das lojas (réplica local; nada toca na produção).
\set A0 '00000000-0000-0000-0000-0000000000a0'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set A3 '00000000-0000-0000-0000-0000000000a3'
\set B1 '00000000-0000-0000-0000-0000000000b1'
\set B2 '00000000-0000-0000-0000-0000000000b2'
\set LA '11111111-1111-1111-1111-111111111111'
\set LB '22222222-2222-2222-2222-222222222222'
create or replace function t.chk(nome text, obtido boolean, esperado text) returns void language sql as $$ select t.chk(nome, obtido::text, esperado) $$;

-- 1. registar (cada ação corre num comando próprio; a verificação vem depois, no comando seguinte)
select t.chk('caixa regista atividade', t.faz(:'A2', $$select public.registar_atividade('1.1.7','android')$$), '^ok');
select t.chk('regista última vez, versão e plataforma', (select (loja_id = :'LA')::text || '/' || versao || '/' || plataforma from public.atividade_utilizador where user_id = :'A2'), '^true/1\.1\.7/android$');
select t.faz(:'A2', $$select public.registar_atividade('1.1.7','android')$$);
select t.chk('um dia por utilizador (repetir não duplica)', (select count(*)::text from public.atividade_dia where user_id = :'A2'), '^1$');
select t.faz(:'A1', $$select public.registar_atividade('1.1.6','web')$$);
select t.chk('segundo utilizador da mesma loja conta como outro', (select count(*)::text from public.atividade_dia where loja_id = :'LA'), '^2$');
select t.faz(:'A3', $$select public.registar_atividade('<script>x</script>','linux')$$);
select t.chk('versão e plataforma com formato estranho são ignoradas (não grava lixo)', coalesce((select versao from public.atividade_utilizador where user_id = :'A3'), 'nula') || '/' || coalesce((select plataforma from public.atividade_utilizador where user_id = :'A3'), 'nula'), '^nula/nula$');
select t.faz(:'A0', $$select public.registar_atividade('1.1.7','android')$$);
select t.chk('o dono do sistema não conta como atividade de loja', (select count(*)::text from public.atividade_utilizador where user_id = :'A0'), '^0$');
select t.faz(null, $$select public.registar_atividade('1.1.7','android')$$);
select t.chk('sem sessão não regista', (select count(*)::text from public.atividade_utilizador), '^3$');
insert into public.atividade_dia(loja_id, user_id, dia) values (:'LA', :'A2', current_date - 120);
select t.faz(:'A2', $$select public.registar_atividade('1.1.7','android')$$);
select t.chk('registo com mais de 90 dias mantém-se até haver um novo dia', (select count(*)::text from public.atividade_dia where user_id = :'A2' and dia < current_date - 90), '^1$');
delete from public.atividade_dia where user_id = :'A2' and dia = (now() at time zone 'Africa/Maputo')::date;
select t.faz(:'A2', $$select public.registar_atividade('1.1.7','android')$$);
select t.chk('ao abrir num novo dia, o registo com mais de 90 dias é apagado', (select count(*)::text from public.atividade_dia where user_id = :'A2' and dia < current_date - 90), '^0$');

-- 2. acesso direto às tabelas é negado a todos os utilizadores da app
select t.chk('lojista não lê as tabelas de atividade', t.como(:'A1', 'select count(*) from public.atividade_utilizador'), 'ERRO');
select t.chk('lojista não escreve diretamente', t.faz(:'A1', $$insert into public.atividade_dia(loja_id,user_id,dia) values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000a1', current_date - 3)$$), 'ERRO');
select t.chk('anónimo não lê', t.como(null, 'select count(*) from public.atividade_dia'), 'ERRO');

-- 3. resumo do dono do sistema
select t.chk('dono do sistema vê uma linha por loja', t.como(:'A0', 'select count(*) from public.super_atividade()'), '^ok:2$');
select t.chk('Loja A: 2 online (visto há instantes), 2+ utilizadores, 1 dia', t.como(:'A0', $$select online || '/' || (utilizadores >= 2)::text || '/' || dias_7 from public.super_atividade() where loja_id = '11111111-1111-1111-1111-111111111111'$$), '^ok:3/true/1$');
select t.chk('Loja B sem atividade: 0 online, nunca visto', t.como(:'A0', $$select online || '/' || coalesce(ultimo_visto::text, 'nunca') || '/' || dias_30 from public.super_atividade() where loja_id = '22222222-2222-2222-2222-222222222222'$$), '^ok:0/nunca/0$');
update public.atividade_utilizador set ultimo_visto = now() - interval '10 minutes' where user_id = :'A2';
select t.chk('depois de 3 minutos sem sinal deixa de contar como online', t.como(:'A0', $$select online from public.super_atividade() where loja_id = '11111111-1111-1111-1111-111111111111'$$), '^ok:2$');
select t.chk('a lista de dias vem em formato de datas', t.como(:'A0', $$select jsonb_array_length(dias)::text from public.super_atividade() where loja_id = '11111111-1111-1111-1111-111111111111'$$), '^ok:1$');
select t.chk('resumo não inclui nomes nem e-mails', (select count(*)::text from (select unnest(proargnames) n from pg_proc where proname = 'super_atividade') x where n ~ '(nome|email|user)'), '^0$');
select t.chk('lojista não vê o resumo (vazio)', t.como(:'A1', 'select count(*) from public.super_atividade()'), '^ok:0$');
select t.chk('caixa não vê o resumo (vazio)', t.como(:'B2', 'select count(*) from public.super_atividade()'), '^ok:0$');
select t.chk('anónimo não chama o resumo', t.como(null, 'select count(*) from public.super_atividade()'), 'ERRO');
select t.chk('versões em uso: super vê', t.como(:'A0', 'select count(*) from public.super_versoes_em_uso()'), '^ok:[1-9]');
select t.chk('versões em uso: lojista não vê', t.como(:'A1', 'select count(*) from public.super_versoes_em_uso()'), '^ok:0$');
select t.chk('versões em uso agrupa por versão', t.como(:'A0', $$select string_agg(versao || '=' || utilizadores, ',' order by versao) from public.super_versoes_em_uso()$$), '1\.1\.6=1.*1\.1\.7=1');
-- 4. isolamento: a atividade de uma loja não aparece noutra
select t.faz(:'B1', $$select public.registar_atividade('1.1.7','windows')$$);
select t.chk('B regista e só aparece em B', t.como(:'A0', $$select online || '/' || plataforma from public.super_atividade() where loja_id = '22222222-2222-2222-2222-222222222222'$$), '1/windows');
select t.chk('A não ganhou a atividade de B', t.como(:'A0', $$select (plataforma is distinct from 'windows')::text from public.super_atividade() where loja_id = '11111111-1111-1111-1111-111111111111'$$), '^ok:true$');

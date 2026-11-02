-- Migração 15: TOTP — códigos de recuperação, limites, auditoria e interruptor do dono do sistema (réplica local; JWT simulado aal1/aal2).
\set A0 '00000000-0000-0000-0000-0000000000a0'
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set A3 '00000000-0000-0000-0000-0000000000a3'
\set B1 '00000000-0000-0000-0000-0000000000b1'

-- ---------- estado e geração ----------
select t.chk('estado: o dono da loja pode usar o autenticador, ainda sem fator', t.como_aal(:'A1','aal1',$$select (public.mfa_estado()->>'permitido') || '/' || (public.mfa_estado()->>'tem_fator')$$), '^ok:true/false$');
select t.chk('estado: o caixa não pode', t.como_aal(:'A2','aal1',$$select public.mfa_estado()->>'permitido'$$), '^ok:false$');
select t.chk('estado: sem sessão recusado', t.como_aal(null,'aal1',$$select public.mfa_estado()$$), 'ERRO');
select t.chk('gerar códigos sem fator ativo: recusado', t.como_aal(:'A1','aal2',$$select public.mfa_gerar_codigos()$$), 'ERRO.*Ative primeiro');
insert into auth.mfa_factors(user_id, status) values (:'A1', 'unverified');
select t.chk('gerar códigos com fator NÃO verificado: recusado', t.como_aal(:'A1','aal2',$$select public.mfa_gerar_codigos()$$), 'ERRO.*Ative primeiro');
update auth.mfa_factors set status = 'verified' where user_id = :'A1';
select t.chk('gerar códigos só com senha (aal1): recusado', t.como_aal(:'A1','aal1',$$select public.mfa_gerar_codigos()$$), 'ERRO.*MFA_NECESSARIO');
insert into auth.mfa_factors(user_id, status) values (:'A2','verified'), (:'A3','verified');
select t.chk('caixa com fator e aal2: recusado', t.como_aal(:'A2','aal2',$$select public.mfa_gerar_codigos()$$), 'ERRO.*Só o dono');
select t.chk('gerente com fator e aal2: recusado', t.como_aal(:'A3','aal2',$$select public.mfa_gerar_codigos()$$), 'ERRO.*Só o dono');
select t.chk('anónimo: recusado', t.como_aal(null,'aal2',$$select public.mfa_gerar_codigos()$$), 'ERRO');
select t.como_aal(:'A1','aal2',$$select array_to_string(public.mfa_gerar_codigos(), ',')$$) as r1 \gset
select t.chk('o dono com TOTP e aal2 recebe 8 códigos no formato xxxx-xxxx-xxxx-xxxx-xxxx', (select count(*)::text from regexp_split_to_table(substr(:'r1', 4), ',') c where c ~ '^[0-9a-f]{4}(-[0-9a-f]{4}){4}$'), '^8$');
select t.chk('os 8 códigos são distintos', (select count(distinct c)::text from regexp_split_to_table(substr(:'r1', 4), ',') c), '^8$');
select split_part(substr(:'r1', 4), ',', 1) as c1, split_part(substr(:'r1', 4), ',', 2) as c2, split_part(substr(:'r1', 4), ',', 3) as c3 \gset
select t.chk('na base de dados só há hashes (nenhum código em claro)', (select count(*)::text from public.mfa_recuperacao m, regexp_split_to_table(substr(:'r1', 4), ',') c where m.hash = c or m.hash = replace(c, '-', '')), '^0$');
select t.chk('há 8 hashes por usar', (select count(*)::text from public.mfa_recuperacao where user_id = :'A1' and usado_em is null), '^8$');
select t.chk('o estado mostra 8 códigos restantes', t.como_aal(:'A1','aal1',$$select public.mfa_estado()->>'codigos_restantes'$$), '^ok:8$');

-- ---------- a API não lê nem chama o que é só da Edge Function ----------
select t.chk('a API não lê mfa_recuperacao (dono)', t.como_aal(:'A1','aal2','select count(*) from public.mfa_recuperacao'), 'ERRO');
select t.chk('a API não lê mfa_recuperacao (dono do sistema)', t.como_aal(:'A0','aal2','select count(*) from public.mfa_recuperacao'), 'ERRO');
select t.chk('a API não lê mfa_recuperacao (anónimo)', t.como_aal(null,'aal1','select count(*) from public.mfa_recuperacao'), 'ERRO');
select t.chk('a API não lê as tentativas', t.como_aal(:'A0','aal2','select count(*) from public.mfa_tentativas'), 'ERRO');
select t.chk('a API não lê a configuração de segurança', t.como_aal(:'A0','aal2','select * from public.config_seguranca'), 'ERRO');
select t.chk('a API não escreve na configuração (interruptor)', t.faz(:'A0',$$update public.config_seguranca set valor='true'$$), 'ERRO');
select t.chk('a API não apaga códigos', t.faz(:'A1','delete from public.mfa_recuperacao'), 'ERRO');
select t.chk('a API não consegue consumir códigos (dono)', t.como_aal(:'A1','aal2',format($$select public.mfa_consumir_codigo(%L, %L)$$, :'A1', :'c1')), 'ERRO.*(permission|permiss)');
select t.chk('a API não consegue consumir códigos de OUTRA conta', t.como_aal(:'B1','aal2',format($$select public.mfa_consumir_codigo(%L, %L)$$, :'A1', :'c1')), 'ERRO.*(permission|permiss)');
select t.chk('a API não consegue devolver códigos', t.como_aal(:'A1','aal2',format($$select public.mfa_devolver_codigo(%L, 1)$$, :'A1')), 'ERRO.*(permission|permiss)');
select t.chk('a API não consegue autorizar remoções', t.como_aal(:'A0','aal2',format($$select public.mfa_autorizar_remocao(%L, %L, 'aal2')$$, :'A0', :'A1')), 'ERRO.*(permission|permiss)');
select t.chk('a API não escreve na auditoria por mfa_auditar', t.como_aal(:'A1','aal2',format($$select public.mfa_auditar(%L, 'mfa_falso', '{}')$$, :'A1')), 'ERRO.*(permission|permiss)');
select t.chk('a API não liga o interruptor', t.como_aal(:'A0','aal2','select public.mfa_ativar_obrigatorio_super()'), 'ERRO.*(permission|permiss)');
select t.chk('a API não desliga o interruptor', t.como_aal(:'A0','aal2','select public.mfa_desativar_obrigatorio_super()'), 'ERRO.*(permission|permiss)');

-- ---------- consumir códigos (service_role) ----------
select t.chk('código válido: aceite', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'c1')), '^ok:ok$');
select t.chk('o mesmo código não se usa duas vezes', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'c1')), '^ok:invalido$');
select t.chk('o estado mostra 7 restantes depois de usar um', t.como_aal(:'A1','aal1',$$select public.mfa_estado()->>'codigos_restantes'$$), '^ok:7$');
select t.chk('maiúsculas e sem hífenes também valem (normalização)', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', upper(replace(:'c2', '-', '')))), '^ok:ok$');
select t.chk('código de outra conta não vale', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'B1', :'c3')), '^ok:(invalido|sem_permissao)$');
select t.chk('o código de A não foi gasto pela tentativa de B', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'c3')), '^ok:ok$');
select t.chk('funcionário (caixa) não tem recuperação', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A2', :'c1')), '^ok:sem_permissao$');
select t.chk('utilizador inexistente', t.svc($$select public.mfa_consumir_codigo('99999999-9999-9999-9999-999999999999', 'aaaa-bbbb-cccc-dddd-eeee')->>'estado'$$), '^ok:sem_permissao$');
select t.chk('sem utilizador', t.svc($$select public.mfa_consumir_codigo(null, 'aaaa-bbbb-cccc-dddd-eeee')->>'estado'$$), '^ok:invalido$');
select t.chk('lixo e tentativas de injeção são inválidos', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', $q$' or 1=1 --$q$)), '^ok:invalido$');

-- ---------- gerar de novo invalida os anteriores ----------
select t.como_aal(:'A1','aal2',$$select array_to_string(public.mfa_gerar_codigos(), ',')$$) as r2 \gset
select split_part(substr(:'r2', 4), ',', 1) as n1 \gset
select t.chk('depois de gerar de novo há 8 por usar (os velhos foram apagados)', (select count(*)::text from public.mfa_recuperacao where user_id = :'A1' and usado_em is null), '^8$');
select t.chk('um código antigo já não serve', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'c3')), '^ok:invalido$');
select t.chk('um código novo serve', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'n1')), '^ok:ok$');

-- ---------- limite de tentativas ----------
delete from public.mfa_tentativas;
select string_agg(t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', 'aaaa-bbbb-cccc-dddd-000' || i)), ',') as falhas from generate_series(1, 5) i \gset
select t.chk('5 códigos errados: todos inválidos', :'falhas', '^(ok:invalido,?){5}$');
select split_part(substr(:'r2', 4), ',', 3) as n3 \gset
select t.chk('à 6.ª tentativa fica bloqueado, mesmo com um código VÁLIDO', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'n3')), '^ok:bloqueado$');
select t.chk('o bloqueio não gastou o código válido', (select count(*)::text from public.mfa_recuperacao where user_id = :'A1' and usado_em is null), '^7$');
select t.chk('tentativas bloqueadas não se registam (não prolongam o bloqueio)', (select count(*)::text from public.mfa_tentativas where user_id = :'A1'), '^5$');
select t.chk('o bloqueio de uma conta não afeta outra (dono B)', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'B1', 'aaaa-bbbb-cccc-dddd-eeee')), '^ok:invalido$');
update public.mfa_tentativas set em = now() - interval '16 minutes' where user_id = :'A1';
select t.chk('passados 15 minutos o bloqueio termina e o código válido serve', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'n3')), '^ok:ok$');

-- ---------- devolver (se a remoção do fator falhar) ----------
select split_part(substr(:'r2', 4), ',', 4) as n4 \gset
select t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'id'$$, :'A1', :'n4')) as cid \gset
select t.chk('consumir devolve o id do código', :'cid', '^ok:[0-9]+$');
select substr(:'cid', 4)::bigint as cid_n \gset
select t.chk('devolver repõe o código', t.svc(format($$select public.mfa_devolver_codigo(%L, %s)::text$$, :'A1', :'cid_n')), '^ok');
select t.chk('o código devolvido volta a servir', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'n4')), '^ok:ok$');
select t.chk('devolver o código de outra conta não faz nada', t.svc(format($$select public.mfa_devolver_codigo(%L, %s)::text$$, :'B1', :'cid_n')), '^ok');
select t.chk('… e o código continua gasto', t.svc(format($$select public.mfa_consumir_codigo(%L, %L)->>'estado'$$, :'A1', :'n4')), '^ok:invalido$');

-- ---------- auditoria: existe e nunca contém códigos ----------
select t.chk('auditoria: gerar, usar, falhar, bloquear e devolver ficam registados', (select count(distinct acao)::text from public.auditoria_plataforma where acao in ('mfa_codigos_gerados','mfa_recuperacao_usada','mfa_recuperacao_falhada','mfa_recuperacao_bloqueada','mfa_recuperacao_devolvida')), '^5$');
select t.chk('auditoria: nenhum código (nem o hash) aparece', (select count(*)::text from public.auditoria_plataforma a, regexp_split_to_table(substr(:'r1', 4) || ',' || substr(:'r2', 4), ',') c where a.detalhe::text ilike '%' || replace(c, '-', '') || '%' or a.detalhe::text ilike '%' || c || '%'), '^0$');
select t.chk('auditoria: o ator das ações do titular é o titular', (select count(*)::text from public.auditoria_plataforma where acao = 'mfa_codigos_gerados' and ator = :'A1'::uuid), '^[1-9]');
select t.chk('só o dono do sistema lê a auditoria', t.como_aal(:'A1','aal2','select count(*) from public.auditoria_plataforma'), 'ERRO|ok:0$');
select t.chk('mfa_auditar só aceita ações «mfa_…»', t.svc(format($$select public.mfa_auditar(%L, 'apagar_tudo', '{}')::text$$, :'A1')), 'ERRO.*inválida');
select t.chk('mfa_auditar aceita uma ação mfa_…', t.svc(format($$select public.mfa_auditar(%L, 'mfa_fator_removido', '{"x":1}')::text$$, :'A1')), '^ok');

-- ---------- remoção do fator de OUTRA conta: só o dono do sistema, com aal2, a um dono de loja ----------
select t.chk('dono do sistema + aal2 → dono de loja: autorizado', t.svc(format($$select public.mfa_autorizar_remocao(%L, %L, 'aal2')->>'estado'$$, :'A0', :'A1')), '^ok:ok$');
select t.chk('dono do sistema SEM aal2: recusado', t.svc(format($$select public.mfa_autorizar_remocao(%L, %L, 'aal1')->>'estado'$$, :'A0', :'A1')), '^ok:recusado$');
select t.chk('aal em falta: recusado', t.svc(format($$select public.mfa_autorizar_remocao(%L, %L, null)->>'estado'$$, :'A0', :'A1')), '^ok:recusado$');
select t.chk('dono de loja a remover o de outro dono: recusado', t.svc(format($$select public.mfa_autorizar_remocao(%L, %L, 'aal2')->>'estado'$$, :'A1', :'B1')), '^ok:recusado$');
select t.chk('gerente: recusado', t.svc(format($$select public.mfa_autorizar_remocao(%L, %L, 'aal2')->>'estado'$$, :'A3', :'A1')), '^ok:recusado$');
select t.chk('alvo funcionário: recusado', t.svc(format($$select public.mfa_autorizar_remocao(%L, %L, 'aal2')->>'estado'$$, :'A0', :'A2')), '^ok:recusado$');
select t.chk('alvo é o dono do sistema: recusado', t.svc(format($$select public.mfa_autorizar_remocao(%L, %L, 'aal2')->>'estado'$$, :'A1', :'A0')), '^ok:recusado$');
select t.chk('o dono do sistema não usa esta via em si próprio', t.svc(format($$select public.mfa_autorizar_remocao(%L, %L, 'aal2')->>'estado'$$, :'A0', :'A0')), '^ok:recusado$');
select t.chk('alvo inexistente: recusado', t.svc(format($$select public.mfa_autorizar_remocao(%L, '99999999-9999-9999-9999-999999999999', 'aal2')->>'estado'$$, :'A0')), '^ok:recusado$');
select t.chk('autorizações e recusas ficam na auditoria', (select (count(*) filter (where acao = 'mfa_remocao_autorizada') > 0 and count(*) filter (where acao = 'mfa_remocao_recusada') > 5)::text from public.auditoria_plataforma), '^true$');

insert into public.pagamentos_assinatura(id, loja_id, plano, meses, valor) values ('abababab-abab-4bab-8bab-abababababab', '11111111-1111-1111-1111-111111111111', 'mensal', 1, 500);
\set PG 'abababab-abab-4bab-8bab-abababababab'
-- ---------- interruptor: desligado por omissão, nada muda ----------
select t.chk('por omissão o MFA do dono do sistema NÃO é obrigatório', (select valor from public.config_seguranca where chave = 'mfa_super_obrigatorio'), '^false$');
select t.chk('desligado: o dono do sistema escreve com aal1', t.faz(:'A0',$$update public.plataforma set teste_dias = teste_dias$$), '^ok$');
select t.chk('desligado: o estado diz «não obrigatório»', t.como_aal(:'A0','aal1',$$select public.mfa_estado()->>'super_obrigatorio'$$), '^ok:false$');
select t.chk('o dono de loja não vê o interruptor no estado', t.como_aal(:'A1','aal1',$$select coalesce(public.mfa_estado()->>'super_obrigatorio', 'nulo')$$), '^ok:nulo$');
-- trava de segurança (não se pode ligar sem provar a recuperação)
do $$ begin begin perform public.mfa_ativar_obrigatorio_super(); insert into t.res(ok, nome, obtido) values (false, 'ligar sem a recuperação testada: recusado (administração)', 'ligou'); exception when others then insert into t.res(ok, nome, obtido) values (sqlerrm ~ 'não foi testada', 'ligar sem a recuperação testada: recusado (administração)', sqlerrm); end; end $$;
update public.config_seguranca set valor = 'true' where chave = 'mfa_recuperacao_testada';
do $$ begin begin perform public.mfa_ativar_obrigatorio_super(); insert into t.res(ok, nome, obtido) values (false, 'ligar sem TOTP no dono do sistema: recusado', 'ligou'); exception when others then insert into t.res(ok, nome, obtido) values (sqlerrm ~ 'autenticador ativo', 'ligar sem TOTP no dono do sistema: recusado', sqlerrm); end; end $$;
insert into auth.mfa_factors(user_id, status) values (:'A0', 'verified');
do $$ begin begin perform public.mfa_ativar_obrigatorio_super(); insert into t.res(ok, nome, obtido) values (false, 'ligar sem códigos de recuperação: recusado', 'ligou'); exception when others then insert into t.res(ok, nome, obtido) values (sqlerrm ~ 'códigos de recuperação', 'ligar sem códigos de recuperação: recusado', sqlerrm); end; end $$;
select t.chk('o dono do sistema gera os seus códigos (aal2)', t.como_aal(:'A0','aal2',$$select count(*) from unnest(public.mfa_gerar_codigos())$$), '^ok:8$');
select t.chk('desligado até agora', (select valor from public.config_seguranca where chave = 'mfa_super_obrigatorio'), '^false$');
select public.mfa_ativar_obrigatorio_super() as lig \gset
select t.chk('com tudo provado, liga', :'lig', '^ligado$');
select t.chk('auditoria do interruptor', (select count(*)::text from public.auditoria_plataforma where acao = 'mfa_super_obrigatorio_ligado'), '^1$');
-- efeito: o dono do sistema só escreve com aal2
select t.chk('ligado: dono do sistema com aal1 NÃO escreve em plataforma', t.faz(:'A0',$$update public.plataforma set teste_dias = teste_dias$$), 'ERRO.*MFA_NECESSARIO');
select t.chk('ligado: dono do sistema com aal2 escreve', t.como_aal(:'A0','aal2',$$update public.plataforma set teste_dias = teste_dias returning teste_dias::text$$), '^ok');
select t.chk('ligado: sem claim aal (= aal1) também é recusado', t.como(:'A0',$$update public.plataforma set teste_dias = teste_dias$$), 'ERRO.*MFA_NECESSARIO');
select t.chk('ligado: aal1 não altera lojas', t.faz(:'A0',$$update public.lojas set nome = nome$$), 'ERRO.*MFA_NECESSARIO');
select t.chk('ligado: aal1 não altera perfis', t.faz(:'A0',$$update public.perfis set nome = nome where id = '00000000-0000-0000-0000-0000000000a1'$$), 'ERRO.*MFA_NECESSARIO');
select t.chk('ligado: aal1 não confirma pagamentos (confirmar_pagamento)', t.como(:'A0',format($$select public.confirmar_pagamento(%L)$$, :'PG')), 'ERRO.*MFA_NECESSARIO');
select t.chk('ligado: o pagamento continuou pendente', (select estado from public.pagamentos_assinatura where id = :'PG'), '^pendente$');
select t.chk('ligado: com aal2 confirma', t.como_aal(:'A0','aal2',format($$select public.confirmar_pagamento(%L)$$, :'PG')), '^ok');
select t.chk('ligado: aal1 não cadastra lojistas', t.como(:'A0',$$select public.cadastrar_lojista('00000000-0000-0000-0000-0000000000d1','novo@teste.local','Loja X')$$), 'ERRO.*MFA_NECESSARIO');
select t.chk('ligado: o dono do sistema lê com aal1 (entra e vê)', t.como_aal(:'A0','aal1',$$select count(*) >= 2 from public.lojas$$), '^ok:true$');
select t.chk('ligado: o estado mostra obrigatório', t.como_aal(:'A0','aal1',$$select public.mfa_estado()->>'super_obrigatorio'$$), '^ok:true$');
select t.chk('ligado: a recuperação do dono do sistema (Edge Function, service_role) não é bloqueada', t.svc(format($$select public.mfa_consumir_codigo(%L, 'aaaa-bbbb-cccc-dddd-eeee')->>'estado'$$, :'A0')), '^ok:invalido$');
-- o resto do sistema não é afetado pelo interruptor
select t.chk('ligado: o dono da loja continua a editar o seu perfil', t.faz(:'A1',$$update public.perfis set nome = nome where id = '00000000-0000-0000-0000-0000000000a1'$$), '^ok$');
select t.chk('ligado: o dono da loja continua a vender', t.como(:'A1',$$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário'))->>'total'$$), '^ok:');
select t.chk('ligado: o caixa continua a vender', t.como(:'A2',$$select (public.registar_venda('[{"produto_id":"f0000000-0000-0000-0000-00000000000a","qtd":1}]'::jsonb,'Numerário'))->>'total'$$), '^ok:');
select t.chk('ligado: o dono da loja cria um funcionário', t.como(:'A1',$$select public.criar_perfil('00000000-0000-0000-0000-0000000000d1','Novo Caixa','novo@teste.local','caixa','123456')$$), '^ok');
-- desligar de emergência
select public.mfa_desativar_obrigatorio_super() as desl \gset
select t.chk('desligar de emergência funciona (administração)', :'desl', '^desligado$');
select t.chk('desligado outra vez: o dono do sistema escreve com aal1', t.faz(:'A0',$$update public.plataforma set teste_dias = teste_dias$$), '^ok$');

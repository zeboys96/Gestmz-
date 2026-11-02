-- =====================================================================
-- GestMZ — migração 15: apoio ao TOTP (Google Authenticator): códigos de recuperação, limites, auditoria e
--                       interruptor "MFA obrigatório para o dono do sistema" (DESLIGADO por omissão).
-- NÃO aplicar em produção sem autorização expressa. Só foi testada numa réplica local (tests/db/totp.sh).
-- Depende da migração 10 (auditoria_plataforma, proteção do super). Pode correr mais de uma vez.
-- Não altera contas, perfis, lojas, vendas, produtos nem clientes. Não altera a configuração do Supabase Auth.
--
-- O que acrescenta:
--  1. mfa_recuperacao  — códigos de recuperação de uso único (só o hash SHA-256; 80 bits de entropia cada).
--  2. mfa_tentativas   — tentativas de usar códigos (limite: 5 falhadas em 15 min por conta).
--  3. config_seguranca — mfa_super_obrigatorio = 'false' (interruptor) e mfa_recuperacao_testada = 'false' (trava de segurança).
--  4. exigir_mfa_super() + gatilhos em lojas/perfis/pagamentos_assinatura/plataforma: com o interruptor LIGADO, o dono do sistema
--     só escreve nestas tabelas com sessão aal2. Com o interruptor desligado (omissão) nada muda.
--  5. mfa_ativar_obrigatorio_super(): só o administrador da base de dados, e só se a trava de recuperação estiver confirmada,
--     todos os donos do sistema tiverem fator verificado e códigos por usar. Impede o auto-bloqueio.
--  6. RPCs para a app (mfa_estado, mfa_gerar_codigos) e RPCs SÓ para a Edge Function (service_role).
-- A Edge Function (supabase/functions/recuperar-totp) NÃO é criada nem publicada por este ficheiro.
-- =====================================================================

-- ---------- tabelas (fechadas: nenhum acesso direto pela API) ----------
create table if not exists public.mfa_recuperacao (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  hash text not null,
  criado_em timestamptz not null default now(),
  usado_em timestamptz,
  unique (user_id, hash)
);
create index if not exists mfa_recuperacao_user_idx on public.mfa_recuperacao(user_id) where usado_em is null;
create table if not exists public.mfa_tentativas (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  em timestamptz not null default now(),
  ok boolean not null
);
create index if not exists mfa_tentativas_user_idx on public.mfa_tentativas(user_id, em);
create table if not exists public.config_seguranca (
  chave text primary key,
  valor text not null,
  alterado_em timestamptz not null default now()
);
insert into public.config_seguranca(chave, valor) values ('mfa_super_obrigatorio', 'false'), ('mfa_recuperacao_testada', 'false') on conflict (chave) do nothing;
do $$ declare t text; begin
  foreach t in array array['mfa_recuperacao', 'mfa_tentativas', 'config_seguranca'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists p_%I_nada on public.%I', t, t);
    execute format('create policy p_%I_nada on public.%I for all to authenticated using (false) with check (false)', t, t);
  end loop;
end $$;

-- ---------- utilitários internos ----------
create or replace function public._mfa_norm(p text) returns text language sql immutable as $$ select lower(regexp_replace(coalesce(p, ''), '[^0-9a-fA-F]', '', 'g')) $$;
create or replace function public._mfa_hash(p text) returns text language sql immutable set search_path = public, extensions as $$ select encode(digest(public._mfa_norm(p), 'sha256'), 'hex') $$;
revoke all on function public._mfa_norm(text), public._mfa_hash(text) from public, anon, authenticated;

create or replace function public._mfa_audit(p_ator uuid, p_acao text, p_detalhe jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.auditoria_plataforma(acao, ator, detalhe) values (p_acao, p_ator, coalesce(p_detalhe, '{}'::jsonb))
$$;
revoke all on function public._mfa_audit(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public._mfa_tem_fator(p_user uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.factor_type::text = 'totp' and f.status::text = 'verified')
$$;
revoke all on function public._mfa_tem_fator(uuid) from public, anon, authenticated;

-- ---------- interruptor e verificação aal2 do dono do sistema ----------
create or replace function public.mfa_super_obrigatorio() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select valor = 'true' from public.config_seguranca where chave = 'mfa_super_obrigatorio'), false)
$$;
revoke all on function public.mfa_super_obrigatorio() from public, anon;
grant execute on function public.mfa_super_obrigatorio() to authenticated;

create or replace function public.exigir_mfa_super() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.sou_super() and public.mfa_super_obrigatorio()
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'MFA_NECESSARIO: confirme com o código do autenticador (Google Authenticator) para continuar.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.exigir_mfa_super() from public, anon;
grant execute on function public.exigir_mfa_super() to authenticated;

create or replace function public._mfa_super_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.exigir_mfa_super(); return null; end $$;
revoke all on function public._mfa_super_trg() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['lojas', 'perfis', 'pagamentos_assinatura', 'plataforma'] loop
    execute format('drop trigger if exists mfa_super_trg on public.%I', t);
    execute format('create trigger mfa_super_trg before insert or update or delete on public.%I for each statement execute function public._mfa_super_trg()', t);
  end loop;
end $$;

-- ---------- estado (para a app) ----------
create or replace function public.mfa_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_papel text;
begin
  if v_uid is null then raise exception 'Sem sessão' using errcode = '42501'; end if;
  select papel into v_papel from public.perfis where id = v_uid;
  return jsonb_build_object(
    'tem_fator', public._mfa_tem_fator(v_uid),
    'codigos_restantes', (select count(*) from public.mfa_recuperacao where user_id = v_uid and usado_em is null),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'permitido', coalesce(v_papel in ('dono', 'super'), false),
    'super_obrigatorio', case when v_papel = 'super' then public.mfa_super_obrigatorio() else null end);
end $$;
revoke all on function public.mfa_estado() from public, anon;
grant execute on function public.mfa_estado() to authenticated;

-- ---------- gerar códigos de recuperação (dono da loja ou dono do sistema; exige TOTP já verificado e sessão aal2) ----------
create or replace function public.mfa_gerar_codigos() returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_papel text; v_ativo boolean; v_cod text[] := '{}'; v_c text; i int;
begin
  if v_uid is null then raise exception 'Sem sessão' using errcode = '42501'; end if;
  select papel, ativo into v_papel, v_ativo from public.perfis where id = v_uid;
  if coalesce(v_papel, '') not in ('dono', 'super') or not coalesce(v_ativo, false) then raise exception 'Só o dono da loja e o dono do sistema usam o autenticador' using errcode = '42501'; end if;
  if not public._mfa_tem_fator(v_uid) then raise exception 'Ative primeiro o autenticador (TOTP).' using errcode = '42501'; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then raise exception 'MFA_NECESSARIO: confirme com o código do autenticador antes de gerar códigos de recuperação.' using errcode = '42501'; end if;
  delete from public.mfa_recuperacao where user_id = v_uid;   -- gerar de novo invalida os anteriores
  for i in 1..8 loop
    v_c := encode(gen_random_bytes(10), 'hex');             -- 80 bits
    insert into public.mfa_recuperacao(user_id, hash) values (v_uid, public._mfa_hash(v_c));
    v_cod := v_cod || (substr(v_c, 1, 4) || '-' || substr(v_c, 5, 4) || '-' || substr(v_c, 9, 4) || '-' || substr(v_c, 13, 4) || '-' || substr(v_c, 17, 4));
  end loop;
  perform public._mfa_audit(v_uid, 'mfa_codigos_gerados', jsonb_build_object('papel', v_papel, 'n', 8));   -- nunca os códigos
  return v_cod;
end $$;
revoke all on function public.mfa_gerar_codigos() from public, anon;
grant execute on function public.mfa_gerar_codigos() to authenticated;

-- ---------- SÓ para a Edge Function (service_role) ----------
-- Valida e consome (uma única vez) um código de recuperação do utilizador p_user. Limite: 5 falhas em 15 min.
create or replace function public.mfa_consumir_codigo(p_user uuid, p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_papel text; v_ativo boolean; v_id bigint; v_falhas int; v_h text := public._mfa_hash(p_codigo); v_ok boolean := false;
begin
  if p_user is null then return jsonb_build_object('estado', 'invalido'); end if;
  select papel, ativo into v_papel, v_ativo from public.perfis where id = p_user;
  if coalesce(v_papel, '') not in ('dono', 'super') or not coalesce(v_ativo, false) then
    return jsonb_build_object('estado', 'sem_permissao');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mfa:' || p_user::text, 0));   -- serializa tentativas da mesma conta
  select count(*) into v_falhas from public.mfa_tentativas where user_id = p_user and not ok and em > now() - interval '15 minutes';
  if v_falhas >= 5 then
    perform public._mfa_audit(p_user, 'mfa_recuperacao_bloqueada', jsonb_build_object('papel', v_papel));
    return jsonb_build_object('estado', 'bloqueado');   -- tentativas bloqueadas não se registam (não prolongam o bloqueio)
  end if;
  if length(public._mfa_norm(p_codigo)) = 20 then
    update public.mfa_recuperacao set usado_em = now() where user_id = p_user and hash = v_h and usado_em is null returning id into v_id;
    v_ok := v_id is not null;
  end if;
  insert into public.mfa_tentativas(user_id, ok) values (p_user, v_ok);
  perform public._mfa_audit(p_user, case when v_ok then 'mfa_recuperacao_usada' else 'mfa_recuperacao_falhada' end,
                            jsonb_build_object('papel', v_papel, 'codigo_id', v_id, 'falhas_na_janela', v_falhas + case when v_ok then 0 else 1 end));
  return case when v_ok then jsonb_build_object('estado', 'ok', 'id', v_id) else jsonb_build_object('estado', 'invalido') end;
end $$;

-- Se a remoção do fator falhar depois de consumir o código, a Edge Function devolve-o (para o titular não ficar sem código).
create or replace function public.mfa_devolver_codigo(p_user uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.mfa_recuperacao set usado_em = null where id = p_id and user_id = p_user and usado_em is not null;
  perform public._mfa_audit(p_user, 'mfa_recuperacao_devolvida', jsonb_build_object('codigo_id', p_id));
end $$;

-- Autoriza o dono do sistema (com aal2, verificado pela Edge Function a partir do token) a remover o fator de UM dono de loja.
-- Nunca de outro dono do sistema, nunca de funcionários, nunca de si próprio por esta via.
create or replace function public.mfa_autorizar_remocao(p_ator uuid, p_alvo uuid, p_aal text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_motivo text;
begin
  if p_ator is null or p_alvo is null then v_motivo := 'pedido inválido';
  elsif p_ator = p_alvo then v_motivo := 'não pode usar esta via na própria conta';
  elsif coalesce(p_aal, '') <> 'aal2' then v_motivo := 'sessão sem MFA (aal2)';
  elsif not exists (select 1 from public.perfis where id = p_ator and papel = 'super' and ativo) then v_motivo := 'só o dono do sistema';
  elsif not exists (select 1 from public.perfis where id = p_alvo and papel = 'dono' and ativo) then v_motivo := 'o alvo não é um dono de loja ativo';
  end if;
  v_ok := v_motivo is null;
  perform public._mfa_audit(p_ator, case when v_ok then 'mfa_remocao_autorizada' else 'mfa_remocao_recusada' end, jsonb_build_object('alvo', p_alvo, 'motivo', v_motivo));
  return jsonb_build_object('estado', case when v_ok then 'ok' else 'recusado' end, 'motivo', v_motivo);
end $$;

create or replace function public.mfa_auditar(p_ator uuid, p_acao text, p_detalhe jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_acao !~ '^mfa_[a-z_]{3,40}$' then raise exception 'ação de auditoria inválida'; end if;
  perform public._mfa_audit(p_ator, p_acao, p_detalhe);
end $$;

do $$ declare f text; begin
  foreach f in array array['mfa_consumir_codigo(uuid,text)', 'mfa_devolver_codigo(uuid,bigint)', 'mfa_autorizar_remocao(uuid,uuid,text)', 'mfa_auditar(uuid,text,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------- interruptor (só administração da base de dados) ----------
-- Só liga se: (a) a trava «mfa_recuperacao_testada» foi posta a 'true' à mão depois de um ensaio real de recuperação;
-- (b) todos os donos do sistema têm TOTP verificado; (c) cada um tem pelo menos 1 código por usar.
create or replace function public.mfa_ativar_obrigatorio_super() returns text
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not exists (select 1 from public.perfis where papel = 'super') then raise exception 'Não existe dono do sistema'; end if;
  if coalesce((select valor from public.config_seguranca where chave = 'mfa_recuperacao_testada'), 'false') <> 'true' then
    raise exception 'Recusado: a recuperação ainda não foi testada de ponta a ponta (config_seguranca.mfa_recuperacao_testada).';
  end if;
  for r in select id from public.perfis where papel = 'super' loop
    if not public._mfa_tem_fator(r.id) then raise exception 'Recusado: um dono do sistema ainda não tem o autenticador ativo.'; end if;
    if not exists (select 1 from public.mfa_recuperacao where user_id = r.id and usado_em is null) then raise exception 'Recusado: um dono do sistema não tem códigos de recuperação por usar.'; end if;
  end loop;
  update public.config_seguranca set valor = 'true', alterado_em = now() where chave = 'mfa_super_obrigatorio';
  perform public._mfa_audit(null, 'mfa_super_obrigatorio_ligado', '{}'::jsonb);
  return 'ligado';
end $$;
create or replace function public.mfa_desativar_obrigatorio_super() returns text
language plpgsql security definer set search_path = public as $$
begin
  update public.config_seguranca set valor = 'false', alterado_em = now() where chave = 'mfa_super_obrigatorio';
  perform public._mfa_audit(null, 'mfa_super_obrigatorio_desligado', '{}'::jsonb);
  return 'desligado';
end $$;
revoke all on function public.mfa_ativar_obrigatorio_super(), public.mfa_desativar_obrigatorio_super() from public, anon, authenticated;

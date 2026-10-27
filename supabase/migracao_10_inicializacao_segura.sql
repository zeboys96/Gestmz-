-- =====================================================================
-- GestMZ — migração 10: inicialização segura do "dono do sistema"
-- NÃO aplicar em produção sem rever docs/SEGURANCA-DONO-DO-SISTEMA.md.
-- Pode correr mais de uma vez. Não apaga nem altera contas, perfis, lojas ou vendas.
--
-- O que muda:
--  1. plataforma ganha dois estados controlados SÓ pelo servidor:
--       dono_inicializado   (trinco: depois de verdadeiro nunca mais abre pela app)
--       inicializacao_aberta (autorização explícita, só ligada por administração em SQL)
--  2. reivindicar_super() passa a ser atómica (bloqueio de linha) e só funciona se
--     a inicialização estiver autorizada E ainda não existir dono.
--  3. estado_inicializacao() devolve 'aberta' ou 'fechada' (a app bloqueia se não conseguir ler).
--  4. Ninguém, pela API (anon/authenticated), cria, apaga ou degrada um perfil 'super'.
--  5. A API deixa de poder alterar os dois estados (permissões por coluna em plataforma).
--  6. Registo de auditoria da plataforma (auditoria_plataforma), só legível pelo dono do sistema.
-- =====================================================================

alter table public.plataforma add column if not exists dono_inicializado boolean not null default false;
alter table public.plataforma add column if not exists inicializacao_aberta boolean not null default false;

-- Se já existe um dono, o trinco fica fechado de vez (e a autorização desligada).
update public.plataforma
   set dono_inicializado = true, inicializacao_aberta = false
 where id = 1 and exists (select 1 from public.perfis where papel = 'super');

-- A API só pode editar os dados de pagamento/preços; nunca os dois estados.
revoke update on public.plataforma from authenticated, anon;
grant update (titular, numero, metodo, preco_mensal, preco_trimestral, preco_anual, teste_dias) on public.plataforma to authenticated;

-- ---------- Auditoria da plataforma ----------
create table if not exists public.auditoria_plataforma (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  acao text not null,
  ator uuid,
  papel_bd text not null default current_user,
  detalhe jsonb not null default '{}'::jsonb
);
alter table public.auditoria_plataforma enable row level security;
revoke all on public.auditoria_plataforma from anon, authenticated;
grant select on public.auditoria_plataforma to authenticated;
drop policy if exists p_audplat_sel on public.auditoria_plataforma;
create policy p_audplat_sel on public.auditoria_plataforma for select to authenticated using (public.sou_super());

create or replace function public._audit_plat(p_acao text, p_detalhe jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.auditoria_plataforma(acao, ator, detalhe) values (p_acao, auth.uid(), coalesce(p_detalhe, '{}'::jsonb))
$$;
revoke all on function public._audit_plat(text, jsonb) from public, anon, authenticated;

-- ---------- Estado da inicialização ----------
create or replace function public.estado_inicializacao() returns text
language sql stable security definer set search_path = public as $$
  select case when p.inicializacao_aberta and not p.dono_inicializado
                   and not exists (select 1 from public.perfis where papel = 'super')
              then 'aberta' else 'fechada' end
    from public.plataforma p where p.id = 1
$$;
revoke all on function public.estado_inicializacao() from public;
grant execute on function public.estado_inicializacao() to anon, authenticated;

-- ---------- Criação atómica do dono ----------
create or replace function public.reivindicar_super(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare v public.plataforma%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicie sessão primeiro'; end if;
  -- bloqueio de linha: duas tentativas simultâneas ficam em fila, a segunda já encontra o trinco fechado
  select * into v from public.plataforma where id = 1 for update;
  if not found or v.dono_inicializado or exists (select 1 from public.perfis where papel = 'super') then
    raise exception 'A configuração inicial não está disponível';
  end if;
  if not v.inicializacao_aberta then
    raise exception 'A configuração inicial não está autorizada pelo servidor';
  end if;
  if exists (select 1 from public.perfis where id = auth.uid()) then
    raise exception 'Esta conta já tem perfil';
  end if;
  perform set_config('gestmz.criar_super', auth.uid()::text, true);
  insert into public.perfis(id, loja_id, nome, papel)
  values (auth.uid(), null, coalesce(nullif(trim(p_nome), ''), 'Dono do sistema'), 'super');
  perform set_config('gestmz.criar_super', '', true);
  update public.plataforma set dono_inicializado = true, inicializacao_aberta = false where id = 1;
  perform public._audit_plat('dono_inicializado', jsonb_build_object('utilizador', auth.uid()));
end $$;
revoke all on function public.reivindicar_super(text) from public, anon;
grant execute on function public.reivindicar_super(text) to authenticated;

-- ---------- Proteção do perfil 'super' (não depende do botão da app) ----------
-- Função SEM security definer: current_user é o papel de quem executa (anon/authenticated vindos da API).
create or replace function public.perfis_super_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.papel = 'super' and coalesce(current_setting('gestmz.criar_super', true), '') <> new.id::text then
      raise exception 'Não é permitido criar o dono do sistema por este caminho';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.papel = 'super' and old.papel <> 'super' then
      raise exception 'Não é permitido promover uma conta a dono do sistema';
    end if;
    if old.papel = 'super' and (new.papel <> old.papel or new.ativo <> old.ativo or new.id <> old.id
        or new.loja_id is distinct from old.loja_id or new.email is distinct from old.email) then
      raise exception 'O dono do sistema não pode ser alterado por este caminho';
    end if;
    return new;
  else
    if old.papel = 'super' then raise exception 'O dono do sistema não pode ser apagado por este caminho'; end if;
    return old;
  end if;
end $$;
revoke all on function public.perfis_super_guard() from public, anon, authenticated;
drop trigger if exists perfis_super_guard_trg on public.perfis;
create trigger perfis_super_guard_trg before insert or update or delete on public.perfis
  for each row execute function public.perfis_super_guard();

-- ---------- Auditoria automática ----------
create or replace function public._plat_audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if tg_table_name = 'plataforma' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('antes', o.value, 'depois', n.value)), '{}'::jsonb) into v
      from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key) where n.value is distinct from o.value;
    if v <> '{}'::jsonb then perform public._audit_plat('plataforma_alterada', v); end if;
    return new;
  elsif tg_table_name = 'perfis' then
    if tg_op = 'DELETE' then
      if old.papel = 'super' then perform public._audit_plat('super_apagado', jsonb_build_object('id', old.id)); end if;
      return old;
    elsif tg_op = 'INSERT' then
      if new.papel = 'super' then perform public._audit_plat('super_criado', jsonb_build_object('id', new.id)); end if;
      return new;
    else
      if old.papel = 'super' or new.papel = 'super' then
        if new.papel <> old.papel or new.ativo <> old.ativo or new.loja_id is distinct from old.loja_id then
          perform public._audit_plat('super_alterado', jsonb_build_object('id', new.id, 'papel', jsonb_build_array(old.papel, new.papel), 'ativo', jsonb_build_array(old.ativo, new.ativo)));
        end if;
      end if;
      return new;
    end if;
  else  -- lojas
    if new.estado is distinct from old.estado or new.valido_ate is distinct from old.valido_ate then
      perform public._audit_plat('loja_alterada', jsonb_build_object('loja', new.id, 'estado', jsonb_build_array(old.estado, new.estado), 'valido_ate', jsonb_build_array(old.valido_ate, new.valido_ate)));
    end if;
    return new;
  end if;
end $$;
revoke all on function public._plat_audit_trg() from public, anon, authenticated;
drop trigger if exists plat_audit_trg on public.plataforma;
create trigger plat_audit_trg after update on public.plataforma for each row execute function public._plat_audit_trg();
drop trigger if exists perfis_audit_super_trg on public.perfis;
create trigger perfis_audit_super_trg after insert or update or delete on public.perfis for each row execute function public._plat_audit_trg();
drop trigger if exists lojas_audit_plat_trg on public.lojas;
create trigger lojas_audit_plat_trg after update on public.lojas for each row execute function public._plat_audit_trg();

-- existe_super() mantém-se (apps já instaladas ainda a usam); a app nova usa estado_inicializacao().

-- ---------- nome_de(): deixava qualquer utilizador autenticado ler o nome de QUALQUER perfil (inclusive de outras lojas)
-- Agora só devolve o próprio nome, o de colegas da mesma loja, ou (dono do sistema) qualquer um.
create or replace function public.nome_de(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select nome from public.perfis
   where id = p_id
     and (id = auth.uid() or public.sou_super() or (loja_id is not null and loja_id = public.minha_loja()))
$$;

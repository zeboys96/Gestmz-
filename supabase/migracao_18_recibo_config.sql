-- ============================================================================
-- GestMZ — Migração 18: personalização do recibo por loja (logótipo, mensagens, o que mostrar).
-- SÓ ACRESCENTA: uma tabela nova e uma função. Não altera nem apaga nada que já exista (vendas, numeração, valores, contas, lojas). Idempotente.
-- Só o DONO da loja escreve (pela função); os utilizadores da loja leem. Reverter: supabase/reverter_migracao_18.sql
-- ============================================================================

create table if not exists public.recibo_config (
  loja_id uuid primary key references public.lojas(id) on delete cascade,
  cfg jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.recibo_config enable row level security;
revoke all on public.recibo_config from public, anon, authenticated;
grant select on public.recibo_config to authenticated;
drop policy if exists p_recibo_cfg_sel on public.recibo_config;
create policy p_recibo_cfg_sel on public.recibo_config for select to authenticated using (public.sou_super() or loja_id = public.minha_loja());

create or replace function public.guardar_recibo_config(p_cfg jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja();
begin
  if auth.uid() is null or v_loja is null then raise exception 'Sem sessão de loja'; end if;
  if public.meu_papel() <> 'dono' then raise exception 'Só o dono da loja pode personalizar o recibo'; end if;
  if not public.loja_ativa() then raise exception 'A subscrição da loja expirou'; end if;
  if p_cfg is null or jsonb_typeof(p_cfg) <> 'object' then raise exception 'Configuração inválida'; end if;
  if octet_length(p_cfg::text) > 100000 then raise exception 'Configuração demasiado grande'; end if;
  if p_cfg ? 'logo' and jsonb_typeof(p_cfg->'logo') = 'string' and (p_cfg->>'logo') !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$' then raise exception 'Logótipo inválido'; end if;
  insert into public.recibo_config(loja_id, cfg, atualizado_em, atualizado_por) values (v_loja, p_cfg, now(), auth.uid())
    on conflict (loja_id) do update set cfg = excluded.cfg, atualizado_em = now(), atualizado_por = auth.uid();
end $$;
revoke all on function public.guardar_recibo_config(jsonb) from public, anon;
grant execute on function public.guardar_recibo_config(jsonb) to authenticated;

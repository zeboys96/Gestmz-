-- ============================================================================
-- GestMZ — Migração 18: a atividade deixa de guardar o tipo de aparelho (só «quando» e a versão da app).
-- Só mexe nos objetos criados pela migração 17 (tabelas de atividade, ainda sem dados). Não toca em lojas, vendas, produtos, clientes nem contas.
-- Idempotente. Reverter: supabase/reverter_migracao_17.sql (remove tudo o que a 17 e a 18 criaram).
-- ============================================================================
alter table public.atividade_utilizador drop column if exists plataforma;

drop function if exists public.registar_atividade(text, text);
create or replace function public.registar_atividade(p_versao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_loja uuid; v_papel text; v_ver text := left(nullif(trim(coalesce(p_versao, '')), ''), 20); v_hoje date := (now() at time zone 'Africa/Maputo')::date;
begin
  if auth.uid() is null then return; end if;
  select loja_id, papel into v_loja, v_papel from public.perfis where id = auth.uid() and ativo;
  if v_loja is null or v_papel = 'super' then return; end if;   -- só utilizadores de loja (o dono do sistema não conta)
  if v_ver is not null and v_ver !~ '^[0-9]+(\.[0-9]+){0,3}$' then v_ver := null; end if;
  insert into public.atividade_utilizador(user_id, loja_id, ultimo_visto, versao) values (auth.uid(), v_loja, now(), v_ver)
    on conflict (user_id) do update set loja_id = excluded.loja_id, ultimo_visto = now(), versao = coalesce(excluded.versao, public.atividade_utilizador.versao);
  insert into public.atividade_dia(loja_id, user_id, dia) values (v_loja, auth.uid(), v_hoje) on conflict do nothing;
  if found then delete from public.atividade_dia where user_id = auth.uid() and dia < v_hoje - 90; end if;
end $$;

drop function if exists public.super_atividade();
create or replace function public.super_atividade() returns table (
  loja_id uuid, online int, utilizadores int, ultimo_visto timestamptz, dias_7 int, dias_30 int, dias jsonb, versao text
) language plpgsql stable security definer set search_path = public as $$
declare v_hoje date := (now() at time zone 'Africa/Maputo')::date;
begin
  if not public.sou_super() then return; end if;
  return query
  select l.id,
    coalesce((select count(*) from public.atividade_utilizador a where a.loja_id = l.id and a.ultimo_visto > now() - interval '3 minutes'), 0)::int,
    coalesce((select count(*) from public.perfis p where p.loja_id = l.id and p.ativo and p.papel <> 'super'), 0)::int,
    (select max(a.ultimo_visto) from public.atividade_utilizador a where a.loja_id = l.id),
    coalesce((select count(distinct d.dia) from public.atividade_dia d where d.loja_id = l.id and d.dia > v_hoje - 7), 0)::int,
    coalesce((select count(distinct d.dia) from public.atividade_dia d where d.loja_id = l.id and d.dia > v_hoje - 30), 0)::int,
    coalesce((select jsonb_agg(x.dia order by x.dia) from (select distinct d.dia from public.atividade_dia d where d.loja_id = l.id and d.dia > v_hoje - 14) x), '[]'::jsonb),
    (select a.versao from public.atividade_utilizador a where a.loja_id = l.id order by a.ultimo_visto desc limit 1)
  from public.lojas l order by l.criado_em desc;
end $$;

do $$ declare f text; begin
  foreach f in array array['registar_atividade(text)', 'super_atividade()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

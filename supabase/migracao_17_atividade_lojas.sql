-- ============================================================================
-- GestMZ — Migração 17: atividade das lojas (online agora, último acesso, dias de uso, versão da app).
-- SÓ ACRESCENTA: duas tabelas novas e três funções. Não altera nem apaga nada que já exista. Idempotente.
-- Privacidade: guarda APENAS «quando» e «com que versão/plataforma» cada utilizador abriu a app (nada de vendas, produtos, clientes ou valores).
-- O dono do sistema vê um resumo por loja (nunca nomes de funcionários). Os registos diários são apagados passados 90 dias.
-- Reverter: supabase/reverter_migracao_17.sql
-- ============================================================================

create table if not exists public.atividade_utilizador (
  user_id uuid primary key,
  loja_id uuid not null,
  ultimo_visto timestamptz not null default now(),
  versao text,
  plataforma text
);
create index if not exists atividade_utilizador_loja_idx on public.atividade_utilizador(loja_id, ultimo_visto desc);

create table if not exists public.atividade_dia (
  loja_id uuid not null,
  user_id uuid not null,
  dia date not null,
  primary key (loja_id, user_id, dia)
);
create index if not exists atividade_dia_dia_idx on public.atividade_dia(dia);

alter table public.atividade_utilizador enable row level security;
alter table public.atividade_dia enable row level security;
revoke all on public.atividade_utilizador, public.atividade_dia from public, anon, authenticated;   -- sem acesso direto: só pelas funções abaixo

-- A app (utilizador de loja com sessão) avisa que está aberta. Pode ser chamada com frequência: só escreve o necessário.
create or replace function public.registar_atividade(p_versao text default null, p_plataforma text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_loja uuid; v_papel text; v_ver text := left(nullif(trim(coalesce(p_versao, '')), ''), 20); v_pl text := left(nullif(trim(coalesce(p_plataforma, '')), ''), 20); v_hoje date := (now() at time zone 'Africa/Maputo')::date;
begin
  if auth.uid() is null then return; end if;
  select loja_id, papel into v_loja, v_papel from public.perfis where id = auth.uid() and ativo;
  if v_loja is null or v_papel = 'super' then return; end if;   -- só utilizadores de loja (o dono do sistema não conta)
  if v_pl is not null and v_pl not in ('android', 'windows', 'web') then v_pl := null; end if;
  if v_ver is not null and v_ver !~ '^[0-9]+(\.[0-9]+){0,3}$' then v_ver := null; end if;
  insert into public.atividade_utilizador(user_id, loja_id, ultimo_visto, versao, plataforma) values (auth.uid(), v_loja, now(), v_ver, v_pl)
    on conflict (user_id) do update set loja_id = excluded.loja_id, ultimo_visto = now(), versao = coalesce(excluded.versao, public.atividade_utilizador.versao), plataforma = coalesce(excluded.plataforma, public.atividade_utilizador.plataforma);
  insert into public.atividade_dia(loja_id, user_id, dia) values (v_loja, auth.uid(), v_hoje) on conflict do nothing;
  if found then delete from public.atividade_dia where user_id = auth.uid() and dia < v_hoje - 90; end if;   -- limpeza: no máximo uma vez por dia e por utilizador
end $$;

-- Resumo para o dono do sistema: uma linha por loja. Sem nomes de pessoas, sem vendas.
create or replace function public.super_atividade() returns table (
  loja_id uuid, online int, utilizadores int, ultimo_visto timestamptz, dias_7 int, dias_30 int, dias jsonb, versao text, plataforma text
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
    (select a.versao from public.atividade_utilizador a where a.loja_id = l.id order by a.ultimo_visto desc limit 1),
    (select a.plataforma from public.atividade_utilizador a where a.loja_id = l.id order by a.ultimo_visto desc limit 1)
  from public.lojas l order by l.criado_em desc;
end $$;

-- Versões da app em uso (quantos utilizadores ativos nos últimos 30 dias em cada versão): diz quando é seguro avançar com mudanças que exigem a app nova.
create or replace function public.super_versoes_em_uso() returns table (versao text, utilizadores int, lojas int, ultimo_visto timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_super() then return; end if;
  return query select coalesce(a.versao, 'desconhecida'), count(*)::int, count(distinct a.loja_id)::int, max(a.ultimo_visto)
    from public.atividade_utilizador a where a.ultimo_visto > now() - interval '30 days' group by 1 order by max(a.ultimo_visto) desc;
end $$;

do $$ declare f text; begin
  foreach f in array array['registar_atividade(text,text)', 'super_atividade()', 'super_versoes_em_uso()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

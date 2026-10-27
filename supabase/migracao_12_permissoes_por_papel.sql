-- =====================================================================
-- GestMZ — migração 12: permissões por papel aplicadas NO SERVIDOR
-- (NÃO aplicada em produção; a numeração 11 fica reservada para a recuperação de senha.)
-- Independente da migração 10, mas não deve ser aplicada na mesma janela. Não apaga nem altera dados.
--
-- Objetivos:
--  * caixa: não consegue ler quantidades de stock, lotes, validades, mínimo, esgotados nem custos;
--  * gerente: não consegue ler custos nem lucro (custo_un nas vendas), mantém as operações de stock;
--  * caixa e gerente: não leem plano, período de teste, validade da subscrição nem preços de subscrição;
--  * o tempo real deixa de publicar linhas de produtos/lotes/vendas (só um sinal sem dados).
-- ATENÇÃO (compatibilidade): apps já instaladas que fazem select('*') em produtos/lotes/vendas/lojas
-- deixam de funcionar depois desta migração. Aplicar só depois de todos os aparelhos terem a versão nova.
-- =====================================================================

-- ---------- filtros de itens de venda por papel ----------
create or replace function public._itens_visiveis(p_itens jsonb, p_papel text) returns jsonb
language sql immutable set search_path = public as $$
  select case
    when p_itens is null or jsonb_typeof(p_itens) <> 'array' then p_itens
    when p_papel = 'dono' then p_itens
    when p_papel = 'gerente' then coalesce((select jsonb_agg(i - 'custo_un') from jsonb_array_elements(p_itens) i), '[]'::jsonb)
    else coalesce((select jsonb_agg(i - 'custo_un' - 'baixas') from jsonb_array_elements(p_itens) i), '[]'::jsonb)
  end
$$;
revoke all on function public._itens_visiveis(jsonb, text) from public, anon;
grant execute on function public._itens_visiveis(jsonb, text) to authenticated;

-- ---------- leituras filtradas por papel ----------
create or replace function public.produtos_loja(p_so_ativos boolean default true) returns setof public.produtos
language plpgsql stable security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); v_papel text := public.meu_papel();
begin
  if v_loja is null or v_papel is null or v_papel = 'super' then return; end if;
  if v_papel = 'dono' then
    return query select p.* from public.produtos p where p.loja_id = v_loja and (p.ativo or not p_so_ativos) order by p.nome;
  elsif v_papel = 'gerente' then      -- sem custos
    return query select (jsonb_populate_record(p, jsonb_build_object('custo', null, 'custo_caixa', null))).*
                   from public.produtos p where p.loja_id = v_loja and (p.ativo or not p_so_ativos) order by p.nome;
  else                                -- caixa: sem custos nem mínimo de stock
    return query select (jsonb_populate_record(p, jsonb_build_object('custo', null, 'custo_caixa', null, 'minimo', null))).*
                   from public.produtos p where p.loja_id = v_loja and (p.ativo or not p_so_ativos) order by p.nome;
  end if;
end $$;

create or replace function public.lotes_loja() returns setof public.lotes
language plpgsql stable security definer set search_path = public as $$
begin
  if public.minha_loja() is null or coalesce(public.meu_papel(), '') not in ('dono', 'gerente') then return; end if;   -- o caixa não vê stock
  return query select l.* from public.lotes l where l.loja_id = public.minha_loja() and l.qtd > 0;
end $$;

create or replace function public.vendas_loja(p_desde timestamptz default null, p_ate timestamptz default null) returns setof public.vendas
language plpgsql stable security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); v_papel text := public.meu_papel();
begin
  if v_loja is null or v_papel is null or v_papel = 'super' then return; end if;
  return query
    select (jsonb_populate_record(v, jsonb_build_object('itens', public._itens_visiveis(v.itens, v_papel)))).*
      from public.vendas v
     where v.loja_id = v_loja and (v_papel in ('dono', 'gerente') or v.usuario_id = auth.uid())
       and (p_desde is null or v.data >= p_desde) and (p_ate is null or v.data < p_ate)
     order by v.data desc;
end $$;

-- dados da própria loja; o plano só é devolvido ao dono
create or replace function public.minha_loja_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l public.lojas%rowtype; v_papel text := public.meu_papel();
begin
  select * into l from public.lojas where id = public.minha_loja();
  if not found then return null; end if;
  if v_papel = 'dono' then return to_jsonb(l) || jsonb_build_object('operacional', public.loja_ativa()); end if;
  return (to_jsonb(l) - 'estado' - 'valido_ate') || jsonb_build_object('operacional', public.loja_ativa());
end $$;

create or replace function public.admin_listar_lojas() returns setof public.lojas
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_super() then return; end if;
  return query select * from public.lojas order by criado_em desc;
end $$;

do $$ declare f text; begin
  foreach f in array array['produtos_loja(boolean)', 'lotes_loja()', 'vendas_loja(timestamptz,timestamptz)', 'minha_loja_info()', 'admin_listar_lojas()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- fechar as leituras diretas pela API ----------
revoke select on public.produtos from authenticated, anon;
grant select (id, loja_id, nome, codigo, categoria, unidade, preco, iva, controlado, codigo_caixa, un_por_caixa, preco_caixa, ativo, criado_em, categoria_id, embalagem, descricao)
  on public.produtos to authenticated;
revoke select on public.lotes from authenticated, anon;
revoke select on public.vendas from authenticated, anon;
revoke select on public.lojas from authenticated, anon;
grant select (id, codigo, nome, tipo, nuit, tel, endereco, criado_em, configurada) on public.lojas to authenticated;

-- preços/contas de subscrição: só o dono da loja e o dono do sistema
drop policy if exists p_plataforma_sel on public.plataforma;
create policy p_plataforma_sel on public.plataforma for select to authenticated using (public.sou_super() or public.meu_papel() = 'dono');

-- ---------- custos: só o dono os altera (gerente mantém as operações de stock, sem tocar nos custos) ----------
create or replace function public.produtos_custo_so_dono() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'dono' then
    if tg_op = 'INSERT' then new.custo := 0; new.custo_caixa := null;
    else new.custo := old.custo; new.custo_caixa := old.custo_caixa; end if;
  end if;
  return new;
end $$;
drop trigger if exists produtos_custo_so_dono_trg on public.produtos;
create trigger produtos_custo_so_dono_trg before insert or update on public.produtos for each row execute function public.produtos_custo_so_dono();

-- ---------- venda: a resposta e as mensagens de erro não revelam custos nem stock ----------
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'registar_venda'
                and pg_get_functiondef(p.oid) not like '%_registar_venda_interna%')
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_registar_venda_interna') then
    alter function public.registar_venda(jsonb, text, uuid, numeric, numeric, uuid, timestamptz) rename to _registar_venda_interna;
  end if;
end $$;
revoke all on function public._registar_venda_interna(jsonb, text, uuid, numeric, numeric, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.registar_venda(p_itens jsonb, p_pagamento text, p_cliente uuid default null,
                                                 p_desconto numeric default 0, p_recebido numeric default 0,
                                                 p_ref uuid default null, p_data timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_papel text := public.meu_papel(); r jsonb;
begin
  begin
    r := public._registar_venda_interna(p_itens, p_pagamento, p_cliente, p_desconto, p_recebido, p_ref, p_data);
  exception when others then
    if v_papel = 'caixa' and (sqlerrm like 'Stock insuficiente%' or sqlerrm like 'Não há caixas fechadas suficientes%') then
      raise exception 'Não é possível vender este produto neste momento. Fale com o gerente.';
    end if;
    raise;
  end;
  if r is not null and r ? 'itens' then r := jsonb_set(r, '{itens}', public._itens_visiveis(r->'itens', v_papel)); end if;
  return r;
end $$;
revoke all on function public.registar_venda(jsonb, text, uuid, numeric, numeric, uuid, timestamptz) from public, anon;
grant execute on function public.registar_venda(jsonb, text, uuid, numeric, numeric, uuid, timestamptz) to authenticated;

-- ---------- tempo real sem dados sensíveis ----------
create table if not exists public.sinais_loja (
  loja_id uuid primary key references public.lojas(id) on delete cascade,
  versao bigint not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table public.sinais_loja enable row level security;
revoke all on public.sinais_loja from anon, authenticated;
grant select on public.sinais_loja to authenticated;
drop policy if exists p_sinais_sel on public.sinais_loja;
create policy p_sinais_sel on public.sinais_loja for select to authenticated using (loja_id = public.minha_loja());

create or replace function public._sinal_loja() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.sinais_loja(loja_id, versao) select distinct loja_id, 1 from antigas
    on conflict (loja_id) do update set versao = public.sinais_loja.versao + 1, atualizado_em = now();
  else
    insert into public.sinais_loja(loja_id, versao) select distinct loja_id, 1 from novas
    on conflict (loja_id) do update set versao = public.sinais_loja.versao + 1, atualizado_em = now();
  end if;
  return null;
end $$;
revoke all on function public._sinal_loja() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['lotes', 'produtos'] loop
    execute format('drop trigger if exists sinal_ins_%1$s on public.%1$s', t);
    execute format('drop trigger if exists sinal_upd_%1$s on public.%1$s', t);
    execute format('drop trigger if exists sinal_del_%1$s on public.%1$s', t);
    execute format('create trigger sinal_ins_%1$s after insert on public.%1$s referencing new table as novas for each statement execute function public._sinal_loja()', t);
    execute format('create trigger sinal_upd_%1$s after update on public.%1$s referencing old table as antigas new table as novas for each statement execute function public._sinal_loja()', t);
    execute format('create trigger sinal_del_%1$s after delete on public.%1$s referencing old table as antigas for each statement execute function public._sinal_loja()', t);
  end loop;
end $$;
drop trigger if exists sinal_ins_vendas on public.vendas;
drop trigger if exists sinal_upd_vendas on public.vendas;
create trigger sinal_ins_vendas after insert on public.vendas referencing new table as novas for each statement execute function public._sinal_loja();
create trigger sinal_upd_vendas after update on public.vendas referencing old table as antigas new table as novas for each statement execute function public._sinal_loja();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.sinais_loja; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime drop table public.produtos; exception when undefined_object then null; end;
    begin alter publication supabase_realtime drop table public.lotes; exception when undefined_object then null; end;
    begin alter publication supabase_realtime drop table public.vendas; exception when undefined_object then null; end;
  end if;
end $$;

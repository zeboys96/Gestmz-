-- Reverte a migração 12 (NÃO executar sem necessidade). Repõe leituras diretas, política de plataforma, registar_venda original
-- e a publicação em tempo real. Não apaga dados; a tabela sinais_loja fica (inofensiva).
-- Repõe também os acessos que as apps antigas esperam. (Voltam a ser possíveis as leituras de custos/stock pela API.)

-- registar_venda original
drop function if exists public.registar_venda(jsonb, text, uuid, numeric, numeric, uuid, timestamptz);
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_registar_venda_interna') then
    alter function public._registar_venda_interna(jsonb, text, uuid, numeric, numeric, uuid, timestamptz) rename to registar_venda;
  end if;
end $$;
revoke all on function public.registar_venda(jsonb, text, uuid, numeric, numeric, uuid, timestamptz) from public, anon;
grant execute on function public.registar_venda(jsonb, text, uuid, numeric, numeric, uuid, timestamptz) to authenticated;

-- triggers e funções novas
drop trigger if exists produtos_custo_so_dono_trg on public.produtos;
drop function if exists public.produtos_custo_so_dono();
do $$ declare t text; begin
  foreach t in array array['lotes', 'produtos'] loop
    execute format('drop trigger if exists sinal_ins_%1$s on public.%1$s', t);
    execute format('drop trigger if exists sinal_upd_%1$s on public.%1$s', t);
    execute format('drop trigger if exists sinal_del_%1$s on public.%1$s', t);
  end loop;
end $$;
drop trigger if exists sinal_ins_vendas on public.vendas;
drop trigger if exists sinal_upd_vendas on public.vendas;
drop function if exists public._sinal_loja();
drop function if exists public.produtos_loja(boolean);
drop function if exists public.lotes_loja();
drop function if exists public.vendas_loja(timestamptz, timestamptz);
drop function if exists public.minha_loja_info();
drop function if exists public.admin_listar_lojas();
drop function if exists public._itens_visiveis(jsonb, text);

-- permissões de leitura e política originais
revoke select (id, loja_id, nome, codigo, categoria, unidade, preco, iva, controlado, codigo_caixa, un_por_caixa, preco_caixa, ativo, criado_em, categoria_id, embalagem, descricao) on public.produtos from authenticated;
revoke select (id, codigo, nome, tipo, nuit, tel, endereco, criado_em, configurada) on public.lojas from authenticated;
grant select on public.produtos, public.lotes, public.vendas, public.lojas to authenticated;
drop policy if exists p_plataforma_sel on public.plataforma;
create policy p_plataforma_sel on public.plataforma for select to authenticated using (true);

-- tempo real original
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.produtos; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.lotes; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.vendas; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime drop table public.sinais_loja; exception when undefined_object then null; end;
  end if;
end $$;

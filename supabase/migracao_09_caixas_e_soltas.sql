-- =====================================================================
-- GestMZ — migração 09: stock por caixas fechadas e unidades soltas.
-- lotes.qtd continua a ser o total em unidades; lotes.soltas diz quantas
-- dessas unidades estão soltas (as restantes estão em caixas fechadas).
-- Unidades soltas vendem-se primeiro; só se abre caixa quando faltam soltas.
-- Não apaga dados. Segura para correr de novo.
-- =====================================================================
alter table public.lotes add column if not exists soltas int not null default 0 check (soltas >= 0);

-- mantém a conta certa: produto sem embalagem → tudo solto; com embalagem → o resto é sempre caixas inteiras
create or replace function public.lotes_norm() returns trigger
language plpgsql security definer set search_path = public as $$
declare u int;
begin
  select un_por_caixa into u from public.produtos where id = new.produto_id;
  if u is null then new.soltas := new.qtd;
  else new.soltas := new.qtd - ((new.qtd - least(new.soltas, new.qtd)) / u) * u; end if;
  return new;
end $$;
drop trigger if exists lotes_norm_t on public.lotes;
create trigger lotes_norm_t before insert or update of qtd, soltas, produto_id on public.lotes for each row execute function public.lotes_norm();

create or replace function public.produtos_reajusta_lotes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.un_por_caixa is distinct from old.un_por_caixa then update public.lotes set soltas = soltas where produto_id = new.id; end if;
  return null;
end $$;
drop trigger if exists produtos_reajusta_t on public.produtos;
create trigger produtos_reajusta_t after update of un_por_caixa on public.produtos for each row execute function public.produtos_reajusta_lotes();

-- stock já existente: o que não completa uma caixa conta como solto
update public.lotes l set soltas = case when p.un_por_caixa is null then l.qtd else l.qtd % p.un_por_caixa end
  from public.produtos p where p.id = l.produto_id;

-- ---------- entrada de stock (p_soltas = quantas das unidades entradas são soltas) ----------
drop function if exists public.entrada_stock(uuid, int, text, date, numeric, text);
create or replace function public.entrada_stock(p_produto uuid, p_qtd int, p_lote text, p_validade date, p_custo numeric, p_nota text, p_soltas int default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); p public.produtos%rowtype; v_lote uuid;
begin
  if not public.gestor() then raise exception 'Só o gerente ou o dono podem dar entrada de stock'; end if;
  if not public.loja_ativa() then raise exception 'A subscrição da loja expirou'; end if;
  if p_qtd is null or p_qtd <= 0 then raise exception 'Quantidade inválida'; end if;
  if p_soltas is not null and (p_soltas < 0 or p_soltas > p_qtd) then raise exception 'Unidades soltas inválidas'; end if;
  select * into p from public.produtos where id = p_produto and loja_id = v_loja;
  if not found then raise exception 'Produto não encontrado'; end if;
  select id into v_lote from public.lotes
   where produto_id = p.id and coalesce(lote, '') = coalesce(p_lote, '') and validade is not distinct from p_validade limit 1 for update;
  if v_lote is null then
    insert into public.lotes(loja_id, produto_id, lote, validade, qtd, soltas) values (v_loja, p.id, nullif(p_lote, ''), p_validade, p_qtd, coalesce(p_soltas, 0));
  else
    update public.lotes set qtd = qtd + p_qtd, soltas = soltas + coalesce(p_soltas, 0) where id = v_lote;
  end if;
  if coalesce(p_custo, 0) > 0 then update public.produtos set custo = p_custo where id = p.id; end if;
  insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome)
  values (v_loja, p.id, p.nome, 'entrada', p_qtd, p_nota, public.nome_de(auth.uid()));
end $$;

-- ---------- baixa de stock: soltas primeiro, depois abre caixa ----------
create or replace function public.baixa_stock(p_lote uuid, p_qtd int, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.lotes%rowtype; p public.produtos%rowtype; k int := 0;
begin
  if not public.gestor() then raise exception 'Só o gerente ou o dono podem dar baixa de stock'; end if;
  select * into l from public.lotes where id = p_lote and loja_id = public.minha_loja() for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if p_qtd is null or p_qtd <= 0 or p_qtd > l.qtd then raise exception 'Quantidade inválida'; end if;
  select * into p from public.produtos where id = l.produto_id;
  if p_qtd <= l.soltas or p.un_por_caixa is null then
    update public.lotes set qtd = qtd - p_qtd, soltas = soltas - least(soltas, p_qtd) where id = l.id;
  else
    k := ceil((p_qtd - l.soltas)::numeric / p.un_por_caixa)::int;
    update public.lotes set qtd = qtd - p_qtd, soltas = soltas + k * p.un_por_caixa - p_qtd where id = l.id;
    insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome)
    values (l.loja_id, p.id, p.nome, 'abertura', 0, 'Abriu ' || k || ' caixa(s) para dar baixa (stock total inalterado)', public.nome_de(auth.uid()));
  end if;
  insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome)
  values (l.loja_id, p.id, p.nome, 'baixa', -p_qtd, p_motivo, public.nome_de(auth.uid()));
  perform public._audit('baixa_stock', p.nome || ' x' || p_qtd || ' (' || coalesce(p_motivo, '') || ')');
end $$;

-- ---------- anular venda: devolve caixas como caixas e unidades como soltas ----------
create or replace function public.anular_venda(p_venda uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v public.vendas%rowtype; it jsonb; b jsonb;
begin
  if not public.gestor() then raise exception 'Só o gerente ou o dono podem anular vendas'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indique o motivo da anulação'; end if;
  select * into v from public.vendas where id = p_venda and loja_id = public.minha_loja() for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v.anulada then raise exception 'Esta venda já foi anulada'; end if;
  for it in select value from jsonb_array_elements(v.itens) loop
    for b in select value from jsonb_array_elements(it->'baixas') loop
      if b->>'tipo' = 'solta' then
        update public.lotes set qtd = qtd + (b->>'qtd')::int, soltas = soltas + (b->>'qtd')::int where id = (b->>'lote')::uuid;
      else
        update public.lotes set qtd = qtd + (b->>'qtd')::int where id = (b->>'lote')::uuid;
      end if;
    end loop;
    insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome)
    values (v.loja_id, (it->>'produto_id')::uuid, it->>'nome', 'anulacao', (it->>'un')::int, 'Venda ' || v.num, public.nome_de(auth.uid()));
  end loop;
  if v.pagamento = 'Fiado' and v.cliente_id is not null then
    update public.clientes set divida = greatest(0, divida - v.total) where id = v.cliente_id;
  end if;
  update public.vendas set anulada = true, anulada_por = public.nome_de(auth.uid()), anulada_motivo = trim(p_motivo), anulada_em = now() where id = v.id;
  perform public._audit('anular_venda', 'Venda V-' || lpad(v.num::text, 5, '0') || ' de ' || coalesce(v.usuario_nome, '?') || ': ' || trim(p_motivo));
end $$;

-- ---------- venda ----------
create or replace function public.registar_venda(p_itens jsonb, p_pagamento text, p_cliente uuid default null,
                                                 p_desconto numeric default 0, p_recebido numeric default 0,
                                                 p_ref uuid default null, p_data timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.minha_loja(); v_papel text := public.meu_papel();
  it jsonb; p public.produtos%rowtype; l record;
  v_qtd numeric; v_un int; v_linha numeric; v_sub numeric := 0; v_iva numeric := 0; v_desc numeric; v_total numeric;
  v_data timestamptz := now(); v_caixa boolean; v_out jsonb := '[]'::jsonb; v_baixas jsonb; v_falta int; t int; k int; v_num int; v_id uuid; v_res jsonb;
begin
  if v_loja is null or v_papel = 'super' then raise exception 'Sem acesso'; end if;
  if p_ref is not null then   -- repetição do mesmo pedido (ex.: venda feita sem internet): devolve a venda já registada
    select to_jsonb(v) into v_res from public.vendas v where v.loja_id = v_loja and v.ref_cliente = p_ref;
    if found then return v_res; end if;
  end if;
  if p_data is not null and p_data <= now() + interval '5 minutes' and p_data >= now() - interval '7 days' then v_data := p_data; end if;
  if not public.loja_ativa() then raise exception 'A subscrição desta loja expirou. Renove para continuar a vender.'; end if;
  if p_pagamento not in ('Numerário','M-Pesa','e-Mola','mKesh','Cartão/POS','Transferência','Fiado') then raise exception 'Forma de pagamento inválida'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Venda sem itens'; end if;
  if v_papel = 'caixa' and coalesce(p_desconto, 0) > 0 then raise exception 'Só o gerente pode dar desconto'; end if;
  if p_pagamento = 'Fiado' and p_cliente is null then raise exception 'Escolha o cliente para venda a fiado'; end if;
  if p_cliente is not null and not exists (select 1 from public.clientes where id = p_cliente and loja_id = v_loja) then raise exception 'Cliente inválido'; end if;

  for it in select x.value from jsonb_array_elements(p_itens) with ordinality as x(value, n)
            order by coalesce((x.value->>'caixa')::boolean, false) desc, x.n loop
    select * into p from public.produtos where id = (it->>'produto_id')::uuid and loja_id = v_loja and ativo;
    if not found then raise exception 'Produto não encontrado'; end if;
    v_qtd := (it->>'qtd')::numeric;
    if v_qtd is null or v_qtd <= 0 or v_qtd <> trunc(v_qtd) then raise exception 'Quantidade inválida'; end if;
    v_caixa := coalesce((it->>'caixa')::boolean, false);
    v_baixas := '[]'::jsonb;
    if v_caixa then   -- embalagem: só sai de caixas fechadas
      if p.un_por_caixa is null or p.preco_caixa is null then raise exception 'O produto % não tem venda por embalagem', p.nome; end if;
      v_un := v_qtd * p.un_por_caixa; v_linha := v_qtd * p.preco_caixa; v_falta := v_qtd;
      for l in select id, qtd, soltas from public.lotes
                where produto_id = p.id and (qtd - soltas) >= p.un_por_caixa and (validade is null or validade >= public.hoje())
                order by validade nulls last, id for update loop
        exit when v_falta <= 0;
        t := least((l.qtd - l.soltas) / p.un_por_caixa, v_falta);
        update public.lotes set qtd = qtd - t * p.un_por_caixa where id = l.id;
        v_falta := v_falta - t;
        v_baixas := v_baixas || jsonb_build_object('lote', l.id, 'qtd', t * p.un_por_caixa, 'tipo', 'caixa');
      end loop;
      if v_falta > 0 then raise exception 'Não há caixas fechadas suficientes de %: faltam % (venda unidades soltas ou dê entrada de caixas)', p.nome, v_falta; end if;
    else   -- unidades: primeiro as soltas; só depois se abrem caixas
      v_un := v_qtd; v_linha := v_qtd * p.preco; v_falta := v_un;
      for l in select id, soltas from public.lotes
                where produto_id = p.id and soltas > 0 and (validade is null or validade >= public.hoje())
                order by validade nulls last, id for update loop
        exit when v_falta <= 0;
        t := least(l.soltas, v_falta);
        update public.lotes set qtd = qtd - t, soltas = soltas - t where id = l.id;
        v_falta := v_falta - t;
        v_baixas := v_baixas || jsonb_build_object('lote', l.id, 'qtd', t, 'tipo', 'solta');
      end loop;
      if v_falta > 0 and p.un_por_caixa is not null then
        for l in select id, qtd, soltas from public.lotes
                  where produto_id = p.id and (qtd - soltas) >= p.un_por_caixa and (validade is null or validade >= public.hoje())
                  order by validade nulls last, id for update loop
          exit when v_falta <= 0;
          k := least((l.qtd - l.soltas) / p.un_por_caixa, ceil(v_falta::numeric / p.un_por_caixa)::int);
          t := least(k * p.un_por_caixa, v_falta);
          update public.lotes set qtd = qtd - t, soltas = soltas + k * p.un_por_caixa - t where id = l.id;
          v_falta := v_falta - t;
          v_baixas := v_baixas || jsonb_build_object('lote', l.id, 'qtd', t, 'tipo', 'solta', 'caixas_abertas', k);
          insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome, data)
          values (v_loja, p.id, p.nome, 'abertura', 0, 'Abriu ' || k || ' ' || lower(coalesce(p.embalagem, 'caixa')) || '(s) de ' || p.un_por_caixa || ' para vender unidades (stock total inalterado)', public.nome_de(auth.uid()), v_data);
        end loop;
      end if;
      if v_falta > 0 then raise exception 'Stock insuficiente: %', p.nome; end if;
    end if;
    v_sub := v_sub + v_linha;
    v_iva := v_iva + v_linha * coalesce(p.iva, 0) / (100 + coalesce(p.iva, 0));
    v_out := v_out || jsonb_build_object('produto_id', p.id, 'nome', p.nome, 'codigo', case when v_caixa then p.codigo_caixa else p.codigo end, 'qtd', v_qtd, 'caixa', v_caixa,
        'apresentacao', case when v_caixa then coalesce(p.embalagem, 'Caixa') else 'Unidade' end, 'un_por_caixa', p.un_por_caixa,
        'un', v_un, 'preco', case when v_caixa then p.preco_caixa else p.preco end, 'custo_un', p.custo,
        'total', round(v_linha, 2), 'iva', p.iva, 'baixas', v_baixas);
    insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome, data)
    values (v_loja, p.id, p.nome, 'venda', -v_un, case when v_caixa then v_qtd || ' ' || lower(coalesce(p.embalagem, 'caixa')) || '(s) de ' || p.un_por_caixa else null end, public.nome_de(auth.uid()), v_data);
  end loop;

  v_sub := round(v_sub, 2);
  v_desc := least(v_sub, greatest(0, coalesce(p_desconto, 0)));
  v_total := round(v_sub - v_desc, 2);
  if v_sub > 0 then v_iva := round(v_iva * (v_total / v_sub), 2); end if;
  if p_pagamento = 'Numerário' and coalesce(p_recebido, 0) > 0 and p_recebido < v_total then raise exception 'Valor recebido insuficiente'; end if;

  insert into public.contadores(loja_id, venda) values (v_loja, 1)
  on conflict (loja_id) do update set venda = public.contadores.venda + 1
  returning venda into v_num;

  insert into public.vendas(loja_id, num, usuario_id, usuario_nome, cliente_id, pagamento, subtotal, desconto, iva, total, recebido, troco, itens, data, ref_cliente)
  values (v_loja, v_num, auth.uid(), public.nome_de(auth.uid()), p_cliente, p_pagamento, v_sub, v_desc, v_iva, v_total,
          case when p_pagamento = 'Numerário' then coalesce(p_recebido, 0) else 0 end,
          case when p_pagamento = 'Numerário' and coalesce(p_recebido, 0) > 0 then p_recebido - v_total else 0 end, v_out, v_data, p_ref)
  returning id into v_id;

  if p_pagamento = 'Fiado' then
    update public.clientes set divida = divida + v_total where id = p_cliente and loja_id = v_loja;
  end if;
  select to_jsonb(v) into v_res from public.vendas v where v.id = v_id;
  return v_res;
end $$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.existe_super() to anon;
revoke execute on function public._audit(text, text) from authenticated;
revoke execute on function public._semear_categorias(uuid) from authenticated;
revoke execute on function public._pin_hash(uuid, text) from authenticated;
revoke execute on function public._definir_pin(uuid, text) from authenticated;
revoke execute on function public.produtos_valida() from authenticated;
revoke execute on function public.lotes_norm() from authenticated;
revoke execute on function public.produtos_reajusta_lotes() from authenticated;

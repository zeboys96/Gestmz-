-- =====================================================================
-- GestMZ — migração 06: produtos com embalagem/unidade, categoria por
-- identificador, códigos sem ambiguidade e vendas com a apresentação.
-- Não apaga nem altera dados existentes. Segura para correr de novo.
-- =====================================================================

alter table public.produtos add column if not exists categoria_id uuid references public.categorias(id) on delete set null;
alter table public.produtos add column if not exists embalagem text;                 -- nome da embalagem: Caixa, Pacote, Fardo…
alter table public.produtos add column if not exists custo_caixa numeric(12,2);      -- custo de aquisição da embalagem
alter table public.produtos add column if not exists descricao text;
create index if not exists produtos_categoria_idx on public.produtos(categoria_id);

-- produtos antigos: liga a categoria (texto) ao identificador da categoria
update public.produtos p set categoria_id = c.id
from public.categorias c
where p.categoria_id is null and p.categoria is not null and c.loja_id = p.loja_id and c.nome = p.categoria;
update public.produtos set embalagem = 'Caixa' where embalagem is null and un_por_caixa is not null;

-- Regras dos produtos no servidor: categoria coerente, códigos sem ambiguidade, valores válidos
create or replace function public.produtos_valida() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record; c text;
begin
  new.nome := trim(new.nome);
  if new.nome is null or new.nome = '' then raise exception 'O nome do produto é obrigatório'; end if;
  new.codigo := nullif(trim(coalesce(new.codigo, '')), '');
  new.codigo_caixa := nullif(trim(coalesce(new.codigo_caixa, '')), '');
  if coalesce(new.preco, 0) < 0 or coalesce(new.custo, 0) < 0 or coalesce(new.preco_caixa, 0) < 0 or coalesce(new.custo_caixa, 0) < 0 then
    raise exception 'Os preços não podem ser negativos';
  end if;
  if new.preco > 99999999 or coalesce(new.preco_caixa, 0) > 99999999 then raise exception 'Preço demasiado grande'; end if;
  if new.un_por_caixa is not null and new.un_por_caixa < 2 then raise exception 'Unidades por embalagem: indique 2 ou mais'; end if;
  if new.un_por_caixa is null then new.codigo_caixa := null; new.preco_caixa := null; new.custo_caixa := null; new.embalagem := null; end if;
  if new.codigo is not null and new.codigo = new.codigo_caixa then
    raise exception 'O código da unidade e o da embalagem têm de ser diferentes';
  end if;
  -- categoria: o identificador manda; o nome acompanha
  if new.categoria_id is not null then
    select nome into c from public.categorias where id = new.categoria_id and loja_id = new.loja_id;
    if c is null then raise exception 'Categoria inválida'; end if;
    new.categoria := c;
  elsif new.categoria is not null then
    select id into new.categoria_id from public.categorias where loja_id = new.loja_id and nome = new.categoria;
  end if;
  -- um código não pode identificar duas apresentações diferentes (nem de produtos diferentes)
  if new.ativo then
    for o in select nome from public.produtos
              where loja_id = new.loja_id and ativo and id is distinct from new.id
                and ((new.codigo is not null and (codigo = new.codigo or codigo_caixa = new.codigo))
                  or (new.codigo_caixa is not null and (codigo = new.codigo_caixa or codigo_caixa = new.codigo_caixa)))
              limit 1 loop
      raise exception 'Este código de barras já está registado em «%». Cada código identifica uma só apresentação.', o.nome;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists produtos_valida_trg on public.produtos;
create trigger produtos_valida_trg before insert or update on public.produtos for each row execute function public.produtos_valida();

-- Renomear uma categoria (actualiza também os produtos que a usam)
create or replace function public.renomear_categoria(p_id uuid, p_nome text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_nome, ''));
begin
  if not public.gestor() then raise exception 'Só o dono ou o gerente podem editar categorias'; end if;
  if n = '' then raise exception 'Escreva o nome da categoria'; end if;
  if not exists (select 1 from public.categorias where id = p_id and loja_id = public.minha_loja()) then raise exception 'Categoria não encontrada'; end if;
  if exists (select 1 from public.categorias where loja_id = public.minha_loja() and nome = n and id <> p_id) then raise exception 'Já existe uma categoria com esse nome'; end if;
  update public.categorias set nome = n where id = p_id;
  update public.produtos set categoria = n where categoria_id = p_id;
end $$;

-- Vendas: guardam também o nome da apresentação e as unidades por embalagem (histórico fiel)
create or replace function public.registar_venda(p_itens jsonb, p_pagamento text, p_cliente uuid default null,
                                                 p_desconto numeric default 0, p_recebido numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.minha_loja(); v_papel text := public.meu_papel();
  it jsonb; p public.produtos%rowtype; l record;
  v_qtd numeric; v_un int; v_linha numeric; v_sub numeric := 0; v_iva numeric := 0; v_desc numeric; v_total numeric;
  v_caixa boolean; v_out jsonb := '[]'::jsonb; v_baixas jsonb; v_falta int; t int; v_num int; v_id uuid; v_res jsonb;
begin
  if v_loja is null or v_papel = 'super' then raise exception 'Sem acesso'; end if;
  if not public.loja_ativa() then raise exception 'A subscrição desta loja expirou. Renove para continuar a vender.'; end if;
  if p_pagamento not in ('Numerário','M-Pesa','e-Mola','mKesh','Cartão/POS','Transferência','Fiado') then raise exception 'Forma de pagamento inválida'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Venda sem itens'; end if;
  if v_papel = 'caixa' and coalesce(p_desconto, 0) > 0 then raise exception 'Só o gerente pode dar desconto'; end if;
  if p_pagamento = 'Fiado' and p_cliente is null then raise exception 'Escolha o cliente para venda a fiado'; end if;
  if p_cliente is not null and not exists (select 1 from public.clientes where id = p_cliente and loja_id = v_loja) then raise exception 'Cliente inválido'; end if;

  for it in select value from jsonb_array_elements(p_itens) loop
    select * into p from public.produtos where id = (it->>'produto_id')::uuid and loja_id = v_loja and ativo;
    if not found then raise exception 'Produto não encontrado'; end if;
    v_qtd := (it->>'qtd')::numeric;
    if v_qtd is null or v_qtd <= 0 or v_qtd <> trunc(v_qtd) then raise exception 'Quantidade inválida'; end if;
    v_caixa := coalesce((it->>'caixa')::boolean, false);
    if v_caixa then
      if p.un_por_caixa is null or p.preco_caixa is null then raise exception 'O produto % não tem venda por embalagem', p.nome; end if;
      v_un := v_qtd * p.un_por_caixa; v_linha := v_qtd * p.preco_caixa;
    else
      v_un := v_qtd; v_linha := v_qtd * p.preco;
    end if;
    v_falta := v_un; v_baixas := '[]'::jsonb;
    for l in select id, qtd from public.lotes
              where produto_id = p.id and qtd > 0 and (validade is null or validade >= public.hoje())
              order by validade nulls last, id for update loop
      exit when v_falta <= 0;
      t := least(l.qtd, v_falta);
      update public.lotes set qtd = qtd - t where id = l.id;
      v_falta := v_falta - t;
      v_baixas := v_baixas || jsonb_build_object('lote', l.id, 'qtd', t);
    end loop;
    if v_falta > 0 then raise exception 'Stock insuficiente: %', p.nome; end if;
    v_sub := v_sub + v_linha;
    v_iva := v_iva + v_linha * coalesce(p.iva, 0) / (100 + coalesce(p.iva, 0));
    v_out := v_out || jsonb_build_object('produto_id', p.id, 'nome', p.nome, 'codigo', case when v_caixa then p.codigo_caixa else p.codigo end, 'qtd', v_qtd, 'caixa', v_caixa,
        'apresentacao', case when v_caixa then coalesce(p.embalagem, 'Caixa') else 'Unidade' end, 'un_por_caixa', p.un_por_caixa,
        'un', v_un, 'preco', case when v_caixa then p.preco_caixa else p.preco end, 'custo_un', p.custo,
        'total', round(v_linha, 2), 'iva', p.iva, 'baixas', v_baixas);
    insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome)
    values (v_loja, p.id, p.nome, 'venda', -v_un, case when v_caixa then v_qtd || ' ' || lower(coalesce(p.embalagem, 'caixa')) || '(s) de ' || p.un_por_caixa else null end, public.nome_de(auth.uid()));
  end loop;

  v_sub := round(v_sub, 2);
  v_desc := least(v_sub, greatest(0, coalesce(p_desconto, 0)));
  v_total := round(v_sub - v_desc, 2);
  if v_sub > 0 then v_iva := round(v_iva * (v_total / v_sub), 2); end if;
  if p_pagamento = 'Numerário' and coalesce(p_recebido, 0) > 0 and p_recebido < v_total then raise exception 'Valor recebido insuficiente'; end if;

  insert into public.contadores(loja_id, venda) values (v_loja, 1)
  on conflict (loja_id) do update set venda = public.contadores.venda + 1
  returning venda into v_num;

  insert into public.vendas(loja_id, num, usuario_id, usuario_nome, cliente_id, pagamento, subtotal, desconto, iva, total, recebido, troco, itens)
  values (v_loja, v_num, auth.uid(), public.nome_de(auth.uid()), p_cliente, p_pagamento, v_sub, v_desc, v_iva, v_total,
          case when p_pagamento = 'Numerário' then coalesce(p_recebido, 0) else 0 end,
          case when p_pagamento = 'Numerário' and coalesce(p_recebido, 0) > 0 then p_recebido - v_total else 0 end, v_out)
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

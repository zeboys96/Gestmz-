-- =====================================================================
-- GestMZ — migração 07: venda só por embalagem, código de acesso verificado
-- no servidor, vendas sem internet (sem duplicados) e etiquetas.
-- Não apaga dados. Segura para correr de novo.
-- =====================================================================

alter table public.produtos add column if not exists vende_unidade boolean not null default true;
alter table public.vendas add column if not exists ref_cliente uuid;
create unique index if not exists vendas_ref_cliente_uq on public.vendas(loja_id, ref_cliente) where ref_cliente is not null;

-- regra do produto: venda só por embalagem exige embalagem
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
  if new.un_por_caixa is null then new.codigo_caixa := null; new.preco_caixa := null; new.custo_caixa := null; new.embalagem := null; new.vende_unidade := true; end if;
  if not new.vende_unidade and (new.preco_caixa is null or new.preco_caixa <= 0) then raise exception 'Para vender só por embalagem indique o preço da embalagem'; end if;
  if new.codigo is not null and new.codigo = new.codigo_caixa then
    raise exception 'O código da unidade e o da embalagem têm de ser diferentes';
  end if;
  if new.categoria_id is not null then
    select nome into c from public.categorias where id = new.categoria_id and loja_id = new.loja_id;
    if c is null then raise exception 'Categoria inválida'; end if;
    new.categoria := c;
  elsif new.categoria is not null then
    select id into new.categoria_id from public.categorias where loja_id = new.loja_id and nome = new.categoria;
  end if;
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

-- ---------- Código de acesso verificado no servidor ----------
create table if not exists public.pin_sessoes (
  user_id uuid not null references auth.users(id) on delete cascade,
  sessao text not null,
  ate timestamptz not null,
  primary key (user_id, sessao)
);
alter table public.pin_sessoes enable row level security;
revoke all on public.pin_sessoes from anon, authenticated;

create or replace function public.pin_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.perfis p join public.perfis_pin k on k.user_id = p.id
                     where p.id = auth.uid() and p.ativo and p.papel in ('gerente','caixa'))
      or exists (select 1 from public.pin_sessoes s where s.user_id = auth.uid()
                 and s.sessao = coalesce(auth.jwt() ->> 'session_id', '') and s.ate > now())
$$;

-- sem o código de acesso confirmado nesta sessão, gerente e caixa não pertencem a nenhuma loja (não veem nem alteram nada)
create or replace function public.minha_loja() returns uuid
language sql stable security definer set search_path = public as $$
  select loja_id from public.perfis where id = auth.uid() and ativo and public.pin_ok()
$$;

create or replace function public.pin_exigido() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not public.pin_ok()
$$;

create or replace function public.verificar_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
declare k public.perfis_pin%rowtype; v_sess text := coalesce(auth.jwt() ->> 'session_id', '');
begin
  if auth.uid() is null then raise exception 'Inicie sessão primeiro'; end if;
  select * into k from public.perfis_pin where user_id = auth.uid() for update;
  if not found then return true; end if;
  if v_sess = '' then raise exception 'Sessão inválida. Saia e entre de novo.'; end if;
  if k.bloqueado_ate is not null and k.bloqueado_ate > now() then
    raise exception 'Demasiadas tentativas. Espere alguns minutos ou peça um novo código ao seu responsável.';
  end if;
  if k.hash = public._pin_hash(auth.uid(), coalesce(p_pin, '')) then
    update public.perfis_pin set falhas = 0, bloqueado_ate = null where user_id = auth.uid();
    insert into public.pin_sessoes(user_id, sessao, ate) values (auth.uid(), v_sess, now() + interval '12 hours')
    on conflict (user_id, sessao) do update set ate = excluded.ate;
    delete from public.pin_sessoes where ate < now() - interval '1 day';
    return true;
  end if;
  update public.perfis_pin set
    bloqueado_ate = case when falhas + 1 >= 5 then now() + interval '10 minutes' else null end,
    falhas = case when falhas + 1 >= 5 then 0 else falhas + 1 end
  where user_id = auth.uid();
  return false;
end $$;

-- dados mínimos da loja, para mostrar no ecrã do código de acesso (antes de o código ser confirmado)
create or replace function public.loja_basica() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(x) from (select l.id, l.nome, l.tipo, l.configurada from public.lojas l
                           join public.perfis p on p.loja_id = l.id where p.id = auth.uid() and p.ativo) x
$$;

-- ---------- Venda (com repetição segura e hora original, para vendas feitas sem internet) ----------
drop function if exists public.registar_venda(jsonb, text, uuid, numeric, numeric);
create or replace function public.registar_venda(p_itens jsonb, p_pagamento text, p_cliente uuid default null,
                                                 p_desconto numeric default 0, p_recebido numeric default 0,
                                                 p_ref uuid default null, p_data timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.minha_loja(); v_papel text := public.meu_papel();
  it jsonb; p public.produtos%rowtype; l record;
  v_qtd numeric; v_un int; v_linha numeric; v_sub numeric := 0; v_iva numeric := 0; v_desc numeric; v_total numeric;
  v_data timestamptz := now(); v_caixa boolean; v_out jsonb := '[]'::jsonb; v_baixas jsonb; v_falta int; t int; v_num int; v_id uuid; v_res jsonb;
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

  for it in select value from jsonb_array_elements(p_itens) loop
    select * into p from public.produtos where id = (it->>'produto_id')::uuid and loja_id = v_loja and ativo;
    if not found then raise exception 'Produto não encontrado'; end if;
    v_qtd := (it->>'qtd')::numeric;
    if v_qtd is null or v_qtd <= 0 or v_qtd <> trunc(v_qtd) then raise exception 'Quantidade inválida'; end if;
    v_caixa := coalesce((it->>'caixa')::boolean, false);
    if not v_caixa and not coalesce(p.vende_unidade, true) then raise exception 'O produto % só se vende por embalagem', p.nome; end if;
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

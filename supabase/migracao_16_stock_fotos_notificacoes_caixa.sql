-- =====================================================================
-- GestMZ — migração 16: lista de venda do caixa só com produtos disponíveis, fotografias dos produtos,
-- centro de notificações e fecho de caixa (tudo validado no servidor).
-- (NÃO aplicada em produção. Reversível: supabase/reverter_migracao_16.sql.)
--
-- Independente das migrações 10, 12 e 15: funciona com ou sem elas e NÃO substitui nenhuma função existente
-- (nem registar_venda, nem anular_venda, nem receber_fiado). Só acrescenta; não apaga nem altera dados.
-- Acrescenta apenas: 1 coluna em produtos (foto_ver), 1 coluna em recebimentos (usuario_id), 3 tabelas novas
-- (notificacoes, notificacoes_lidas, caixa_fechos), funções novas, gatilhos novos e o contentor de fotografias.
-- Os gatilhos novos só criam notificações (inserem linhas em notificacoes); não alteram vendas nem stock.
--
-- Aviso de compatibilidade: a migração 12 (se vier a ser aplicada) limita as colunas de produtos que a API deixa ler;
-- por isso esta migração concede também a leitura da nova coluna foto_ver.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas novas (nada é apagado)
-- ---------------------------------------------------------------------
alter table public.produtos add column if not exists foto_ver text;
alter table public.recebimentos add column if not exists usuario_id uuid;
grant select (foto_ver) on public.produtos to authenticated;

-- o recebimento de dívida passa a registar quem o recebeu (para o fecho de caixa); não substitui receber_fiado
create or replace function public.recebimentos_usuario() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.usuario_id is null and auth.uid() is not null then new.usuario_id := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists recebimentos_usuario_trg on public.recebimentos;
create trigger recebimentos_usuario_trg before insert on public.recebimentos for each row execute function public.recebimentos_usuario();

-- só o dono altera o limite de stock baixo e a fotografia (o gerente continua a gerir produtos e stock)
create or replace function public.produtos_campos_dono() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.meu_papel(), '') <> 'dono' then
    if tg_op = 'INSERT' then new.foto_ver := null;
    else new.minimo := old.minimo; new.foto_ver := old.foto_ver; end if;
  end if;
  if new.foto_ver is not null and new.foto_ver !~ '^[a-z0-9]{6,24}$' then raise exception 'Versão da fotografia inválida'; end if;
  return new;
end $$;
drop trigger if exists produtos_campos_dono_trg on public.produtos;
create trigger produtos_campos_dono_trg before insert or update on public.produtos for each row execute function public.produtos_campos_dono();

-- ---------------------------------------------------------------------
-- 2. Lista de venda: só produtos que se podem vender agora (stock fora de validade > 0)
--    Devolve apenas o necessário para vender: sem custos, sem mínimo, sem lotes nem validades.
-- ---------------------------------------------------------------------
create or replace function public.produtos_venda() returns table (
  id uuid, nome text, codigo text, codigo_caixa text, categoria text, preco numeric, preco_caixa numeric,
  un_por_caixa int, embalagem text, iva int, controlado boolean, foto_ver text, disp_un int, disp_cx int)
language plpgsql stable security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja();
begin
  if v_loja is null or coalesce(public.meu_papel(), 'super') = 'super' then return; end if;
  return query
    select p.id, p.nome, p.codigo, p.codigo_caixa, p.categoria, p.preco, p.preco_caixa, p.un_por_caixa, p.embalagem, p.iva, p.controlado, p.foto_ver,
           s.un::int, s.cx::int
      from public.produtos p
      join lateral (
        select coalesce(sum(l.qtd), 0) as un,
               coalesce(sum(case when p.un_por_caixa is not null then (l.qtd - l.soltas) / p.un_por_caixa else 0 end), 0) as cx
          from public.lotes l
         where l.produto_id = p.id and l.qtd > 0 and (l.validade is null or l.validade >= public.hoje())
      ) s on true
     where p.loja_id = v_loja and p.ativo and s.un > 0
     order by p.nome;
end $$;

-- leitura de um código de barras: diz se existe, se é a embalagem ou a unidade e se há para vender (nunca devolve custos nem lotes)
create or replace function public.produto_por_codigo(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); p public.produtos%rowtype; v_cx boolean := false; v_un int; v_cxn int; v_cod text := trim(coalesce(p_codigo, ''));
begin
  if v_loja is null or coalesce(public.meu_papel(), 'super') = 'super' then raise exception 'Sem acesso'; end if;
  if v_cod = '' then return jsonb_build_object('encontrado', false); end if;
  select * into p from public.produtos where loja_id = v_loja and ativo and codigo = v_cod limit 1;
  if not found then
    select * into p from public.produtos where loja_id = v_loja and ativo and codigo_caixa = v_cod limit 1;
    if not found then return jsonb_build_object('encontrado', false); end if;
    v_cx := true;
  end if;
  select coalesce(sum(l.qtd), 0), coalesce(sum(case when p.un_por_caixa is not null then (l.qtd - l.soltas) / p.un_por_caixa else 0 end), 0)
    into v_un, v_cxn
    from public.lotes l where l.produto_id = p.id and l.qtd > 0 and (l.validade is null or l.validade >= public.hoje());
  return jsonb_build_object('encontrado', true, 'id', p.id, 'nome', p.nome, 'caixa', v_cx, 'embalagem', p.embalagem, 'un_por_caixa', p.un_por_caixa,
    'preco', case when v_cx then p.preco_caixa else p.preco end, 'foto_ver', p.foto_ver,
    'disp_un', v_un, 'disp_cx', v_cxn, 'disponivel', case when v_cx then v_cxn > 0 else v_un > 0 end);
end $$;

-- ---------------------------------------------------------------------
-- 3. Fotografias: contentor privado; cada loja só lê/escreve a sua pasta; só o dono escreve
--    Caminho: <loja>/<produto>/<versão>-t.jpg (miniatura) e <versão>-f.jpg (grande).
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('produtos-fotos', 'produtos-fotos', false, 307200, array['image/jpeg', 'image/webp', 'image/png'])
    on conflict (id) do update set public = false, file_size_limit = 307200, allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png'];

    drop policy if exists fotos_produtos_sel on storage.objects;
    create policy fotos_produtos_sel on storage.objects for select to authenticated
      using (bucket_id = 'produtos-fotos' and (storage.foldername(name))[1] = public.minha_loja()::text);
    drop policy if exists fotos_produtos_ins on storage.objects;
    create policy fotos_produtos_ins on storage.objects for insert to authenticated
      with check (bucket_id = 'produtos-fotos' and public.meu_papel() = 'dono' and public.loja_ativa()
        and (storage.foldername(name))[1] = public.minha_loja()::text
        and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9]{6,24}-[tf]\.jpg$'
        and exists (select 1 from public.produtos p where p.id::text = (storage.foldername(name))[2] and p.loja_id = public.minha_loja()));
    drop policy if exists fotos_produtos_upd on storage.objects;
    create policy fotos_produtos_upd on storage.objects for update to authenticated
      using (bucket_id = 'produtos-fotos' and public.meu_papel() = 'dono' and (storage.foldername(name))[1] = public.minha_loja()::text)
      with check (bucket_id = 'produtos-fotos' and public.meu_papel() = 'dono' and (storage.foldername(name))[1] = public.minha_loja()::text);
    drop policy if exists fotos_produtos_del on storage.objects;
    create policy fotos_produtos_del on storage.objects for delete to authenticated
      using (bucket_id = 'produtos-fotos' and public.meu_papel() = 'dono' and (storage.foldername(name))[1] = public.minha_loja()::text);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Notificações (guardadas na base de dados; o dono vê tudo, o gerente só o operacional; o caixa nada)
-- ---------------------------------------------------------------------
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  tipo text not null check (tipo in ('venda', 'stock_baixo', 'stock_zero', 'venda_anulada', 'caixa_fechado', 'caixa_reaberto')),
  titulo text not null,
  dados jsonb not null default '{}'::jsonb,
  chave text,
  criada_em timestamptz not null default now()
);
create unique index if not exists notificacoes_chave_uq on public.notificacoes(loja_id, chave) where chave is not null;
create index if not exists notificacoes_loja_idx on public.notificacoes(loja_id, criada_em desc);
create table if not exists public.notificacoes_lidas (
  notificacao_id uuid not null references public.notificacoes(id) on delete cascade,
  usuario_id uuid not null,
  lida_em timestamptz not null default now(),
  primary key (notificacao_id, usuario_id)
);
alter table public.notificacoes enable row level security;
alter table public.notificacoes_lidas enable row level security;
revoke all on public.notificacoes, public.notificacoes_lidas from anon, authenticated;
grant select on public.notificacoes to authenticated;   -- só para o tempo real; a política abaixo limita por papel

-- tipos que cada papel pode ver (o gerente nunca vê fecho de caixa; nenhum payload contém custos, lucros ou margens)
create or replace function public._notif_tipos(p_papel text) returns text[]
language sql immutable set search_path = public as $$
  select case p_papel
    when 'dono' then array['venda', 'stock_baixo', 'stock_zero', 'venda_anulada', 'caixa_fechado', 'caixa_reaberto']
    when 'gerente' then array['venda', 'stock_baixo', 'stock_zero', 'venda_anulada']
    else array[]::text[] end
$$;
drop policy if exists p_notif_sel on public.notificacoes;
create policy p_notif_sel on public.notificacoes for select to authenticated
  using (loja_id = public.minha_loja() and tipo = any (public._notif_tipos(public.meu_papel())));

create or replace function public._notificar(p_loja uuid, p_tipo text, p_titulo text, p_dados jsonb, p_chave text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificacoes(loja_id, tipo, titulo, dados, chave) values (p_loja, p_tipo, p_titulo, coalesce(p_dados, '{}'::jsonb), p_chave)
  on conflict (loja_id, chave) where chave is not null do nothing;
end $$;
revoke all on function public._notificar(uuid, text, text, jsonb, text) from public, anon, authenticated;

create or replace function public.minhas_notificacoes(p_limite int default 40, p_antes timestamptz default null) returns table (
  id uuid, tipo text, titulo text, dados jsonb, criada_em timestamptz, lida boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); v_tipos text[] := public._notif_tipos(public.meu_papel());
begin
  if v_loja is null or cardinality(v_tipos) = 0 then return; end if;
  return query
    select n.id, n.tipo, n.titulo, n.dados, n.criada_em, (l.notificacao_id is not null)
      from public.notificacoes n
      left join public.notificacoes_lidas l on l.notificacao_id = n.id and l.usuario_id = auth.uid()
     where n.loja_id = v_loja and n.tipo = any (v_tipos) and (p_antes is null or n.criada_em < p_antes)
     order by n.criada_em desc, n.id
     limit least(greatest(coalesce(p_limite, 40), 1), 100);
end $$;

create or replace function public.notificacoes_nao_lidas() returns int
language plpgsql stable security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); v_tipos text[] := public._notif_tipos(public.meu_papel()); n int;
begin
  if v_loja is null or cardinality(v_tipos) = 0 then return 0; end if;
  select count(*) into n from public.notificacoes x
   where x.loja_id = v_loja and x.tipo = any (v_tipos) and x.criada_em > now() - interval '30 days'
     and not exists (select 1 from public.notificacoes_lidas l where l.notificacao_id = x.id and l.usuario_id = auth.uid());
  return n;
end $$;

create or replace function public.marcar_notificacao_lida(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); v_tipos text[] := public._notif_tipos(public.meu_papel());
begin
  if v_loja is null or cardinality(v_tipos) = 0 then raise exception 'Sem acesso'; end if;
  insert into public.notificacoes_lidas(notificacao_id, usuario_id)
  select x.id, auth.uid() from public.notificacoes x where x.id = p_id and x.loja_id = v_loja and x.tipo = any (v_tipos)
  on conflict do nothing;
end $$;

create or replace function public.marcar_todas_lidas() returns int
language plpgsql security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); v_tipos text[] := public._notif_tipos(public.meu_papel()); n int;
begin
  if v_loja is null or cardinality(v_tipos) = 0 then raise exception 'Sem acesso'; end if;
  with ins as (
    insert into public.notificacoes_lidas(notificacao_id, usuario_id)
    select x.id, auth.uid() from public.notificacoes x where x.loja_id = v_loja and x.tipo = any (v_tipos)
    on conflict do nothing returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- 4.1 venda concluída e venda anulada
create or replace function public.vendas_notifica() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_num text;
begin
  v_num := 'V-' || lpad(new.num::text, 5, '0');
  if tg_op = 'INSERT' then
    perform public._notificar(new.loja_id, 'venda', 'Venda ' || v_num || ' concluída',
      jsonb_build_object('venda_id', new.id, 'num', v_num, 'funcionario', new.usuario_nome, 'total', new.total, 'pagamento', new.pagamento, 'data', new.data),
      'venda:' || new.id);
  elsif tg_op = 'UPDATE' and new.anulada and not old.anulada then
    perform public._notificar(new.loja_id, 'venda_anulada', 'Venda ' || v_num || ' anulada',
      jsonb_build_object('venda_id', new.id, 'num', v_num, 'funcionario', new.usuario_nome, 'anulada_por', new.anulada_por, 'motivo', new.anulada_motivo,
                         'total', new.total, 'pagamento', new.pagamento, 'data', coalesce(new.anulada_em, now())),
      'anul:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists vendas_notifica_ins on public.vendas;
create trigger vendas_notifica_ins after insert on public.vendas for each row execute function public.vendas_notifica();
drop trigger if exists vendas_notifica_upd on public.vendas;
create trigger vendas_notifica_upd after update of anulada on public.vendas for each row when (new.anulada and not old.anulada) execute function public.vendas_notifica();

-- 4.2 stock baixo e stock zero: só quando o total CRUZA o limite (uma notificação por episódio, não uma por venda)
create or replace function public.lotes_notifica() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prod uuid; v_delta int; v_depois int; v_antes int; p public.produtos%rowtype;
begin
  if tg_op = 'DELETE' then v_prod := old.produto_id; v_delta := - old.qtd;
  else v_prod := new.produto_id; v_delta := new.qtd - old.qtd; end if;
  if v_delta >= 0 then return null; end if;
  select * into p from public.produtos where id = v_prod;
  if not found or not p.ativo then return null; end if;
  select coalesce(sum(qtd), 0) into v_depois from public.lotes where produto_id = v_prod;
  v_antes := v_depois - v_delta;
  if v_depois = 0 and v_antes > 0 then
    perform public._notificar(p.loja_id, 'stock_zero', 'Sem stock: ' || p.nome,
      jsonb_build_object('produto_id', p.id, 'produto', p.nome, 'em', now()), null);
  elsif v_depois > 0 and p.minimo > 0 and v_depois <= p.minimo and v_antes > p.minimo then
    perform public._notificar(p.loja_id, 'stock_baixo', 'Stock baixo: ' || p.nome,
      jsonb_build_object('produto_id', p.id, 'produto', p.nome, 'stock', v_depois, 'minimo', p.minimo, 'em', now()), null);
  end if;
  return null;
end $$;
drop trigger if exists lotes_notifica_upd on public.lotes;
create trigger lotes_notifica_upd after update of qtd on public.lotes for each row when (new.qtd < old.qtd) execute function public.lotes_notifica();
drop trigger if exists lotes_notifica_del on public.lotes;
create trigger lotes_notifica_del after delete on public.lotes for each row execute function public.lotes_notifica();

-- ---------------------------------------------------------------------
-- 5. Fecho de caixa (cada funcionário fecha o seu caixa; atómico; imutável depois de confirmado)
-- ---------------------------------------------------------------------
create table if not exists public.caixa_fechos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  usuario_id uuid not null,
  caixa_nome text not null,
  usuario_nome text not null,
  data_mov date not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  n_vendas int not null,
  total_vendido numeric(12,2) not null,
  dinheiro numeric(12,2) not null,
  outros numeric(12,2) not null,
  fiado numeric(12,2) not null,
  recebimentos_dinheiro numeric(12,2) not null default 0,
  por_metodo jsonb not null default '{}'::jsonb,
  n_anuladas int not null default 0,
  total_anuladas numeric(12,2) not null default 0,
  fundo_inicial numeric(12,2) not null default 0 check (fundo_inicial >= 0),
  esperado numeric(12,2) not null,
  contado numeric(12,2) not null check (contado >= 0),
  diferenca numeric(12,2) not null,
  obs text,
  estado text not null default 'fechado' check (estado in ('fechado', 'reaberto')),
  ref_cliente uuid,
  criado_em timestamptz not null default now(),
  reaberto_em timestamptz,
  reaberto_por text,
  reaberto_motivo text
);
create index if not exists caixa_fechos_loja_idx on public.caixa_fechos(loja_id, fim desc);
create index if not exists caixa_fechos_user_idx on public.caixa_fechos(usuario_id, fim desc);
create unique index if not exists caixa_fechos_ref_uq on public.caixa_fechos(loja_id, ref_cliente) where ref_cliente is not null;
alter table public.caixa_fechos enable row level security;
revoke all on public.caixa_fechos from anon, authenticated;
grant select on public.caixa_fechos to authenticated;   -- leitura (RLS); nenhuma escrita direta: só as funções abaixo
drop policy if exists p_fechos_sel on public.caixa_fechos;
create policy p_fechos_sel on public.caixa_fechos for select to authenticated
  using (loja_id = public.minha_loja() and (public.meu_papel() = 'dono' or usuario_id = auth.uid()));

-- um fecho confirmado não se apaga nem se altera; só a reabertura (feita por função do dono) muda o estado
create or replace function public.caixa_fechos_imutavel() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Um fecho de caixa confirmado não pode ser apagado'; end if;
  if (to_jsonb(new) - 'estado' - 'reaberto_em' - 'reaberto_por' - 'reaberto_motivo') is distinct from
     (to_jsonb(old) - 'estado' - 'reaberto_em' - 'reaberto_por' - 'reaberto_motivo')
     or old.estado <> 'fechado' or new.estado <> 'reaberto' then
    raise exception 'Um fecho de caixa confirmado não pode ser alterado';
  end if;
  return new;
end $$;
drop trigger if exists caixa_fechos_imutavel_trg on public.caixa_fechos;
create trigger caixa_fechos_imutavel_trg before update or delete on public.caixa_fechos for each row execute function public.caixa_fechos_imutavel();

-- cálculo único usado pela pré-visualização e pelo fecho (os números mostrados são os que ficam gravados)
create or replace function public._caixa_calc(p_user uuid, p_loja uuid, p_fim timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare prev public.caixa_fechos%rowtype; v_ini timestamptz; v_n int; v_tot numeric; v_din numeric; v_fia numeric; v_na int; v_ta numeric; v_rec numeric; v_met jsonb; v_dia date;
begin
  v_dia := (p_fim at time zone 'Africa/Maputo')::date;
  select * into prev from public.caixa_fechos where usuario_id = p_user and loja_id = p_loja and estado = 'fechado' order by fim desc limit 1;
  v_ini := coalesce(prev.fim, v_dia::timestamp at time zone 'Africa/Maputo');
  select count(*) filter (where not anulada), coalesce(sum(total) filter (where not anulada), 0),
         coalesce(sum(total) filter (where not anulada and pagamento = 'Numerário'), 0), coalesce(sum(total) filter (where not anulada and pagamento = 'Fiado'), 0),
         count(*) filter (where anulada), coalesce(sum(total) filter (where anulada), 0)
    into v_n, v_tot, v_din, v_fia, v_na, v_ta
    from public.vendas where loja_id = p_loja and usuario_id = p_user and data > v_ini and data <= p_fim;
  select coalesce(jsonb_object_agg(pagamento, s), '{}'::jsonb) into v_met
    from (select pagamento, sum(total) s from public.vendas where loja_id = p_loja and usuario_id = p_user and data > v_ini and data <= p_fim and not anulada group by 1) x;
  select coalesce(sum(valor), 0) into v_rec from public.recebimentos
   where loja_id = p_loja and usuario_id = p_user and metodo = 'Numerário' and data > v_ini and data <= p_fim;
  return jsonb_build_object('inicio', v_ini, 'fim', p_fim, 'data_mov', v_dia, 'n_vendas', v_n, 'total_vendido', v_tot, 'dinheiro', v_din,
    'outros', v_tot - v_din - v_fia, 'fiado', v_fia, 'recebimentos_dinheiro', v_rec, 'por_metodo', v_met, 'n_anuladas', v_na, 'total_anuladas', v_ta,
    'ultimo_fecho_em', prev.fim, 'ultimo_fecho_id', prev.id,
    'ja_fechado', (prev.id is not null and (prev.fim at time zone 'Africa/Maputo')::date = v_dia and v_n = 0 and v_na = 0 and v_rec = 0));
end $$;
revoke all on function public._caixa_calc(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.resumo_caixa() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); v_nome text := public.nome_de(auth.uid());
begin
  if v_loja is null or coalesce(public.meu_papel(), 'super') = 'super' then raise exception 'Sem acesso'; end if;
  return public._caixa_calc(auth.uid(), v_loja, now()) || jsonb_build_object('caixa_nome', 'Caixa de ' || v_nome, 'usuario_nome', v_nome);
end $$;

create or replace function public.fechar_caixa(p_contado numeric, p_obs text default null, p_fundo numeric default 0, p_ref uuid default null, p_data timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.minha_loja(); v_uid uuid := auth.uid(); v_nome text := public.nome_de(auth.uid());
  v_fim timestamptz := now(); c jsonb; prev public.caixa_fechos%rowtype; f public.caixa_fechos%rowtype; v_esp numeric; v_res jsonb;
begin
  if v_loja is null or coalesce(public.meu_papel(), 'super') = 'super' then raise exception 'Sem acesso'; end if;
  perform pg_advisory_xact_lock(hashtextextended('caixa:' || v_uid::text, 0));   -- dois fechos simultâneos do mesmo caixa esperam um pelo outro
  if p_ref is not null then   -- o mesmo pedido repetido (ex.: fecho feito sem internet que voltou a ser enviado) devolve o fecho já registado
    select * into f from public.caixa_fechos where loja_id = v_loja and ref_cliente = p_ref;
    if found then return to_jsonb(f) || jsonb_build_object('repetido', true); end if;
  end if;
  if p_contado is null or p_contado < 0 then raise exception 'Indique o dinheiro contado na gaveta'; end if;
  if coalesce(p_fundo, 0) < 0 then raise exception 'Valor inicial inválido'; end if;
  if p_obs is not null and length(p_obs) > 500 then raise exception 'A observação é demasiado longa (máx. 500 caracteres)'; end if;
  if p_data is not null and p_data <= now() + interval '5 minutes' and p_data >= now() - interval '7 days' then v_fim := p_data; end if;
  select * into prev from public.caixa_fechos where usuario_id = v_uid and loja_id = v_loja and estado = 'fechado' order by fim desc limit 1;
  if found and prev.fim >= v_fim then raise exception 'Este caixa já foi fechado depois desse momento'; end if;
  c := public._caixa_calc(v_uid, v_loja, v_fim);
  if (c->>'ja_fechado')::boolean then raise exception 'Este caixa já está fechado. Não há movimento novo desde o último fecho.'; end if;
  v_esp := round(coalesce(p_fundo, 0) + (c->>'dinheiro')::numeric + (c->>'recebimentos_dinheiro')::numeric, 2);
  insert into public.caixa_fechos(loja_id, usuario_id, caixa_nome, usuario_nome, data_mov, inicio, fim, n_vendas, total_vendido, dinheiro, outros, fiado, recebimentos_dinheiro,
                                  por_metodo, n_anuladas, total_anuladas, fundo_inicial, esperado, contado, diferenca, obs, ref_cliente)
  values (v_loja, v_uid, 'Caixa de ' || v_nome, v_nome, (c->>'data_mov')::date, (c->>'inicio')::timestamptz, v_fim, (c->>'n_vendas')::int, (c->>'total_vendido')::numeric,
          (c->>'dinheiro')::numeric, (c->>'outros')::numeric, (c->>'fiado')::numeric, (c->>'recebimentos_dinheiro')::numeric, c->'por_metodo',
          (c->>'n_anuladas')::int, (c->>'total_anuladas')::numeric, round(coalesce(p_fundo, 0), 2), v_esp, round(p_contado, 2), round(p_contado, 2) - v_esp,
          nullif(trim(coalesce(p_obs, '')), ''), p_ref)
  returning * into f;
  perform public._notificar(v_loja, 'caixa_fechado', 'Caixa fechado com sucesso.',
    jsonb_build_object('fecho_id', f.id, 'caixa', f.caixa_nome, 'funcionario', f.usuario_nome, 'fim', f.fim, 'n_vendas', f.n_vendas, 'total_vendido', f.total_vendido,
                       'dinheiro', f.dinheiro, 'outros', f.outros, 'fiado', f.fiado, 'esperado', f.esperado, 'contado', f.contado, 'diferenca', f.diferenca, 'obs', f.obs),
    'fecho:' || f.id);
  perform public._audit('fechar_caixa', f.caixa_nome || ': vendido ' || f.total_vendido || ', esperado ' || f.esperado || ', contado ' || f.contado || ', diferença ' || f.diferenca);
  return to_jsonb(f) || jsonb_build_object('repetido', false);
end $$;

-- só o dono reabre, só o fecho mais recente de cada caixa, e o fecho original fica guardado (muda apenas o estado)
create or replace function public.reabrir_caixa(p_fecho uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); f public.caixa_fechos%rowtype; v_nome text := public.nome_de(auth.uid());
begin
  if v_loja is null or public.meu_papel() <> 'dono' then raise exception 'Só o dono da loja pode reabrir um caixa'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indique o motivo da reabertura'; end if;
  select * into f from public.caixa_fechos where id = p_fecho and loja_id = v_loja for update;
  if not found then raise exception 'Fecho não encontrado'; end if;
  perform pg_advisory_xact_lock(hashtextextended('caixa:' || f.usuario_id::text, 0));
  if f.estado <> 'fechado' then raise exception 'Este caixa já foi reaberto'; end if;
  if exists (select 1 from public.caixa_fechos x where x.usuario_id = f.usuario_id and x.loja_id = v_loja and x.estado = 'fechado' and x.fim > f.fim) then
    raise exception 'Só se pode reabrir o fecho mais recente deste caixa';
  end if;
  update public.caixa_fechos set estado = 'reaberto', reaberto_em = now(), reaberto_por = v_nome, reaberto_motivo = trim(p_motivo) where id = f.id;
  perform public._notificar(v_loja, 'caixa_reaberto', 'Caixa reaberto: ' || f.caixa_nome,
    jsonb_build_object('fecho_id', f.id, 'caixa', f.caixa_nome, 'funcionario', f.usuario_nome, 'reaberto_por', v_nome, 'motivo', trim(p_motivo), 'em', now()), 'reab:' || f.id);
  perform public._audit('reabrir_caixa', f.caixa_nome || ' (fecho de ' || to_char(f.fim at time zone 'Africa/Maputo', 'DD/MM/YYYY HH24:MI') || '): ' || trim(p_motivo));
end $$;

-- ---------------------------------------------------------------------
-- 6. Permissões de execução (as funções do Supabase ficam, por omissão, abertas a anon: fechar explicitamente)
-- ---------------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array['produtos_venda()', 'produto_por_codigo(text)', 'minhas_notificacoes(int,timestamptz)', 'notificacoes_nao_lidas()', 'marcar_notificacao_lida(uuid)',
                           'marcar_todas_lidas()', 'resumo_caixa()', 'fechar_caixa(numeric,text,numeric,uuid,timestamptz)', 'reabrir_caixa(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['vendas_notifica()', 'lotes_notifica()', 'caixa_fechos_imutavel()', 'recebimentos_usuario()', 'produtos_campos_dono()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
-- _notif_tipos é usada na política (corre como o utilizador): precisa de execução
grant execute on function public._notif_tipos(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Tempo real: novas notificações chegam à app aberta (a política acima filtra por loja e papel)
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.notificacoes; exception when duplicate_object then null; end;
  end if;
end $$;

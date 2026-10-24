-- =====================================================================
-- GestMZ — banco de dados (Supabase / PostgreSQL)
-- Cole este ficheiro inteiro no SQL Editor do Supabase e carregue em RUN.
-- Pode correr mais de uma vez sem estragar nada.
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists public.plataforma (
  id int primary key default 1 check (id = 1),
  titular text not null default 'Valentina',
  numero text not null default '+258 86 004 6410',
  metodo text not null default 'e-Mola',
  preco_mensal numeric(12,2) not null default 500,
  preco_trimestral numeric(12,2) not null default 1350,
  preco_anual numeric(12,2) not null default 4800,
  teste_dias int not null default 7
);
insert into public.plataforma (id) values (1) on conflict (id) do nothing;

create table if not exists public.lojas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome text not null,
  tipo text not null default 'Farmácia',
  nuit text, tel text, endereco text,
  estado text not null default 'teste' check (estado in ('teste','ativa','suspensa')),
  valido_ate date not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  loja_id uuid references public.lojas(id) on delete cascade,
  nome text not null,
  usuario text,
  papel text not null check (papel in ('super','dono','gerente','caixa')),
  foto text,
  ativo boolean not null default true,
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now(),
  check ((papel = 'super' and loja_id is null) or (papel <> 'super' and loja_id is not null))
);
create index if not exists perfis_loja_idx on public.perfis(loja_id);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  unique (loja_id, nome)
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  codigo text,
  categoria text,
  unidade text not null default 'un',
  custo numeric(12,2) not null default 0,
  preco numeric(12,2) not null default 0,
  minimo int not null default 0,
  iva int not null default 0,
  controlado boolean not null default false,
  codigo_caixa text,
  un_por_caixa int check (un_por_caixa is null or un_por_caixa > 1),
  preco_caixa numeric(12,2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists produtos_codigo_uq on public.produtos(loja_id, codigo) where codigo is not null and codigo <> '' and ativo;
create unique index if not exists produtos_codigo_caixa_uq on public.produtos(loja_id, codigo_caixa) where codigo_caixa is not null and codigo_caixa <> '' and ativo;
create index if not exists produtos_loja_idx on public.produtos(loja_id);

create table if not exists public.lotes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  lote text,
  validade date,
  qtd int not null default 0 check (qtd >= 0)
);
create index if not exists lotes_prod_idx on public.lotes(produto_id);
create index if not exists lotes_loja_idx on public.lotes(loja_id);

create table if not exists public.movimentos (
  id bigint generated always as identity primary key,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  produto_id uuid,
  produto_nome text,
  tipo text not null,
  qtd int not null,
  nota text,
  usuario_nome text,
  data timestamptz not null default now()
);
create index if not exists movimentos_loja_idx on public.movimentos(loja_id, data desc);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  tel text,
  divida numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists clientes_loja_idx on public.clientes(loja_id);

create table if not exists public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  valor numeric(12,2) not null,
  metodo text,
  usuario_nome text,
  data timestamptz not null default now()
);

create table if not exists public.contadores (
  loja_id uuid primary key references public.lojas(id) on delete cascade,
  venda int not null default 0
);

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  num int not null,
  data timestamptz not null default now(),
  usuario_id uuid,
  usuario_nome text,
  cliente_id uuid references public.clientes(id) on delete set null,
  pagamento text not null,
  subtotal numeric(12,2) not null,
  desconto numeric(12,2) not null default 0,
  iva numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  recebido numeric(12,2) not null default 0,
  troco numeric(12,2) not null default 0,
  itens jsonb not null,
  anulada boolean not null default false,
  anulada_por text,
  anulada_motivo text,
  anulada_em timestamptz,
  unique (loja_id, num)
);
create index if not exists vendas_loja_data_idx on public.vendas(loja_id, data desc);

create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  data date not null default current_date,
  descricao text not null,
  categoria text,
  valor numeric(12,2) not null check (valor >= 0),
  usuario_nome text
);
create index if not exists despesas_loja_idx on public.despesas(loja_id, data desc);

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  usuario_nome text,
  acao text not null,
  detalhe text,
  data timestamptz not null default now()
);
create index if not exists auditoria_loja_idx on public.auditoria(loja_id, data desc);

create table if not exists public.pagamentos_assinatura (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  plano text not null check (plano in ('mensal','trimestral','anual')),
  meses int not null,
  valor numeric(12,2) not null,
  metodo text,
  referencia text,
  estado text not null default 'pendente' check (estado in ('pendente','confirmado','rejeitado')),
  nota text,
  criado_em timestamptz not null default now(),
  confirmado_em timestamptz
);
create index if not exists pagamentos_loja_idx on public.pagamentos_assinatura(loja_id, criado_em desc);

create table if not exists public.comprovativos (
  pagamento_id uuid primary key references public.pagamentos_assinatura(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  imagem text not null
);

-- ---------- Funções de apoio ----------
create or replace function public.hoje() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'Africa/Maputo')::date $$;

create or replace function public.minha_loja() returns uuid
language sql stable security definer set search_path = public as $$
  select loja_id from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.sou_super() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'super' from public.perfis where id = auth.uid() and ativo), false)
$$;

create or replace function public.gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('dono','gerente') from public.perfis where id = auth.uid() and ativo), false)
$$;

create or replace function public.loja_ativa() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lojas l
    where l.id = public.minha_loja() and l.estado <> 'suspensa' and l.valido_ate >= public.hoje()
  )
$$;

create or replace function public.nome_de(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select nome from public.perfis where id = p_id
$$;

create or replace function public._audit(p_acao text, p_detalhe text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria(loja_id, usuario_nome, acao, detalhe)
  values (public.minha_loja(), public.nome_de(auth.uid()), p_acao, p_detalhe);
end $$;

-- ---------- Protecção do perfil ----------
create or replace function public.perfis_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor / administração
  if public.sou_super() then return new; end if;
  if new.id <> old.id or new.papel <> old.papel or new.loja_id is distinct from old.loja_id or new.ativo <> old.ativo then
    if not (public.meu_papel() = 'dono' and old.loja_id = public.minha_loja()
            and new.loja_id = old.loja_id and new.papel <> 'super' and old.papel <> 'super'
            and new.id = old.id and old.id <> auth.uid()) then
      raise exception 'Sem permissão para alterar o papel ou o estado deste utilizador';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists perfis_guard_trg on public.perfis;
create trigger perfis_guard_trg before update on public.perfis for each row execute function public.perfis_guard();

-- ---------- Segurança por linha (cada loja só vê a sua) ----------
alter table public.plataforma enable row level security;
alter table public.lojas enable row level security;
alter table public.perfis enable row level security;
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.lotes enable row level security;
alter table public.movimentos enable row level security;
alter table public.clientes enable row level security;
alter table public.recebimentos enable row level security;
alter table public.contadores enable row level security;
alter table public.vendas enable row level security;
alter table public.despesas enable row level security;
alter table public.auditoria enable row level security;
alter table public.pagamentos_assinatura enable row level security;
alter table public.comprovativos enable row level security;

drop policy if exists p_plataforma_sel on public.plataforma;
create policy p_plataforma_sel on public.plataforma for select to authenticated using (true);
drop policy if exists p_plataforma_upd on public.plataforma;
create policy p_plataforma_upd on public.plataforma for update to authenticated using (public.sou_super()) with check (public.sou_super());

drop policy if exists p_lojas_sel on public.lojas;
create policy p_lojas_sel on public.lojas for select to authenticated using (public.sou_super() or id = public.minha_loja());
drop policy if exists p_lojas_upd on public.lojas;
create policy p_lojas_upd on public.lojas for update to authenticated using (public.sou_super()) with check (public.sou_super());

drop policy if exists p_perfis_sel on public.perfis;
create policy p_perfis_sel on public.perfis for select to authenticated
  using (public.sou_super() or id = auth.uid() or loja_id = public.minha_loja());
drop policy if exists p_perfis_upd on public.perfis;
create policy p_perfis_upd on public.perfis for update to authenticated
  using (public.sou_super() or id = auth.uid() or (public.meu_papel() = 'dono' and loja_id = public.minha_loja()))
  with check (public.sou_super() or id = auth.uid() or (public.meu_papel() = 'dono' and loja_id = public.minha_loja()));

drop policy if exists p_categorias_sel on public.categorias;
create policy p_categorias_sel on public.categorias for select to authenticated using (loja_id = public.minha_loja());
drop policy if exists p_categorias_ins on public.categorias;
create policy p_categorias_ins on public.categorias for insert to authenticated
  with check (loja_id = public.minha_loja() and public.gestor() and public.loja_ativa());
drop policy if exists p_categorias_del on public.categorias;
create policy p_categorias_del on public.categorias for delete to authenticated
  using (loja_id = public.minha_loja() and public.gestor());

drop policy if exists p_produtos_sel on public.produtos;
create policy p_produtos_sel on public.produtos for select to authenticated using (loja_id = public.minha_loja());
drop policy if exists p_produtos_ins on public.produtos;
create policy p_produtos_ins on public.produtos for insert to authenticated
  with check (loja_id = public.minha_loja() and public.gestor() and public.loja_ativa());
drop policy if exists p_produtos_upd on public.produtos;
create policy p_produtos_upd on public.produtos for update to authenticated
  using (loja_id = public.minha_loja() and public.gestor() and public.loja_ativa())
  with check (loja_id = public.minha_loja() and public.gestor() and public.loja_ativa());

drop policy if exists p_lotes_sel on public.lotes;
create policy p_lotes_sel on public.lotes for select to authenticated using (loja_id = public.minha_loja());

drop policy if exists p_movimentos_sel on public.movimentos;
create policy p_movimentos_sel on public.movimentos for select to authenticated using (loja_id = public.minha_loja() and public.gestor());

drop policy if exists p_clientes_sel on public.clientes;
create policy p_clientes_sel on public.clientes for select to authenticated using (loja_id = public.minha_loja());
drop policy if exists p_clientes_ins on public.clientes;
create policy p_clientes_ins on public.clientes for insert to authenticated
  with check (loja_id = public.minha_loja() and public.loja_ativa() and divida = 0);
drop policy if exists p_clientes_upd on public.clientes;
create policy p_clientes_upd on public.clientes for update to authenticated
  using (loja_id = public.minha_loja() and public.loja_ativa()) with check (loja_id = public.minha_loja());
drop policy if exists p_clientes_del on public.clientes;
create policy p_clientes_del on public.clientes for delete to authenticated
  using (loja_id = public.minha_loja() and public.gestor() and divida = 0);

drop policy if exists p_recebimentos_sel on public.recebimentos;
create policy p_recebimentos_sel on public.recebimentos for select to authenticated using (loja_id = public.minha_loja() and public.gestor());

drop policy if exists p_vendas_sel on public.vendas;
create policy p_vendas_sel on public.vendas for select to authenticated
  using (loja_id = public.minha_loja() and (public.gestor() or usuario_id = auth.uid()));

drop policy if exists p_despesas_sel on public.despesas;
create policy p_despesas_sel on public.despesas for select to authenticated using (loja_id = public.minha_loja() and public.gestor());
drop policy if exists p_despesas_ins on public.despesas;
create policy p_despesas_ins on public.despesas for insert to authenticated
  with check (loja_id = public.minha_loja() and public.gestor() and public.loja_ativa());
drop policy if exists p_despesas_del on public.despesas;
create policy p_despesas_del on public.despesas for delete to authenticated
  using (loja_id = public.minha_loja() and public.gestor());

drop policy if exists p_auditoria_sel on public.auditoria;
create policy p_auditoria_sel on public.auditoria for select to authenticated using (loja_id = public.minha_loja() and public.gestor());

drop policy if exists p_pagamentos_sel on public.pagamentos_assinatura;
create policy p_pagamentos_sel on public.pagamentos_assinatura for select to authenticated
  using (public.sou_super() or (loja_id = public.minha_loja() and public.meu_papel() = 'dono'));

drop policy if exists p_comprovativos_sel on public.comprovativos;
create policy p_comprovativos_sel on public.comprovativos for select to authenticated
  using (public.sou_super() or (loja_id = public.minha_loja() and public.meu_papel() = 'dono'));

-- ---------- Permissões de tabela ----------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.produtos to authenticated;
grant insert, delete on public.categorias to authenticated;
grant insert, delete on public.despesas to authenticated;
grant insert, delete on public.clientes to authenticated;
revoke update on public.clientes from authenticated;
grant update (nome, tel) on public.clientes to authenticated;
revoke insert on public.clientes from authenticated;
grant insert (loja_id, nome, tel) on public.clientes to authenticated;
grant update on public.lojas to authenticated;
grant update on public.plataforma to authenticated;
grant update (nome, usuario, foto, ultimo_acesso, ativo, papel) on public.perfis to authenticated;

-- ---------- Funções chamadas pela app ----------
create or replace function public.existe_super() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where papel = 'super')
$$;

create or replace function public.reivindicar_super(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicie sessão primeiro'; end if;
  if exists (select 1 from public.perfis where papel = 'super') then
    raise exception 'O dono do sistema já foi configurado';
  end if;
  if exists (select 1 from public.perfis where id = auth.uid()) then
    raise exception 'Esta conta já tem perfil';
  end if;
  insert into public.perfis(id, loja_id, nome, papel) values (auth.uid(), null, coalesce(nullif(trim(p_nome), ''), 'Dono do sistema'), 'super');
end $$;

create or replace function public._semear_categorias(p_loja uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.categorias(loja_id, nome)
  select p_loja, n from unnest(array[
    'Medicamentos','Genéricos','Antipalúdicos','Antibióticos','Analgésicos e anti-inflamatórios',
    'Suplementos e vitaminas','Material hospitalar','Higiene pessoal','Cosméticos e beleza','Bebé e criança',
    'Bolachas e biscoitos','Bebidas','Água e sumos','Cereais e farinhas','Arroz, massa e feijão',
    'Óleos e condimentos','Enlatados e conservas','Laticínios','Doces e snacks','Congelados',
    'Limpeza doméstica','Papelaria e escritório','Electrónicos e acessórios','Roupa e calçado','Outros'
  ]) as n
  on conflict do nothing
$$;

create or replace function public.registar_loja(p_nome text, p_tipo text, p_nuit text, p_tel text, p_endereco text, p_dono_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; v_dias int;
begin
  if auth.uid() is null then raise exception 'Inicie sessão primeiro'; end if;
  if exists (select 1 from public.perfis where id = auth.uid()) then raise exception 'Esta conta já pertence a uma loja'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Indique o nome da loja'; end if;
  select teste_dias into v_dias from public.plataforma where id = 1;
  loop
    v_cod := lpad((floor(random() * 90000) + 10000)::int::text, 5, '0');
    exit when not exists (select 1 from public.lojas where codigo = v_cod);
  end loop;
  insert into public.lojas(codigo, nome, tipo, nuit, tel, endereco, estado, valido_ate)
  values (v_cod, trim(p_nome), coalesce(nullif(p_tipo, ''), 'Farmácia'), p_nuit, p_tel, p_endereco, 'teste', public.hoje() + v_dias)
  returning id into v_id;
  insert into public.perfis(id, loja_id, nome, papel) values (auth.uid(), v_id, coalesce(nullif(trim(p_dono_nome), ''), 'Dono'), 'dono');
  insert into public.contadores(loja_id) values (v_id);
  perform public._semear_categorias(v_id);
  return v_id;
end $$;

create or replace function public.atualizar_loja(p_nome text, p_tipo text, p_nuit text, p_tel text, p_endereco text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.meu_papel() <> 'dono' then raise exception 'Só o dono da loja pode alterar estes dados'; end if;
  update public.lojas set nome = coalesce(nullif(trim(p_nome), ''), nome), tipo = coalesce(nullif(p_tipo, ''), tipo),
    nuit = p_nuit, tel = p_tel, endereco = p_endereco where id = public.minha_loja();
end $$;

create or replace function public.criar_perfil(p_user uuid, p_nome text, p_usuario text, p_papel text) returns void
language plpgsql security definer set search_path = public as $$
declare v_papel text := public.meu_papel();
begin
  if v_papel is null or v_papel = 'super' or v_papel = 'caixa' then raise exception 'Sem permissão'; end if;
  if p_papel not in ('gerente','caixa') then raise exception 'Papel inválido'; end if;
  if v_papel = 'gerente' and p_papel <> 'caixa' then raise exception 'O gerente só pode criar caixas'; end if;
  if not public.loja_ativa() then raise exception 'A subscrição da loja expirou'; end if;
  if not exists (select 1 from auth.users where id = p_user and created_at > now() - interval '15 minutes') then
    raise exception 'Conta de utilizador inválida ou demasiado antiga';
  end if;
  if exists (select 1 from public.perfis where id = p_user) then raise exception 'Este utilizador já existe'; end if;
  insert into public.perfis(id, loja_id, nome, usuario, papel) values (p_user, public.minha_loja(), trim(p_nome), lower(trim(p_usuario)), p_papel);
  perform public._audit('criar_utilizador', p_papel || ': ' || trim(p_nome));
end $$;

create or replace function public.registar_auditoria(p_acao text, p_detalhe text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.minha_loja() is null then raise exception 'Sem acesso'; end if;
  perform public._audit(left(p_acao, 60), left(p_detalhe, 500));
end $$;

create or replace function public.entrada_stock(p_produto uuid, p_qtd int, p_lote text, p_validade date, p_custo numeric, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare v_loja uuid := public.minha_loja(); p public.produtos%rowtype; v_lote uuid;
begin
  if not public.gestor() then raise exception 'Só o gerente ou o dono podem dar entrada de stock'; end if;
  if not public.loja_ativa() then raise exception 'A subscrição da loja expirou'; end if;
  if p_qtd is null or p_qtd <= 0 then raise exception 'Quantidade inválida'; end if;
  select * into p from public.produtos where id = p_produto and loja_id = v_loja;
  if not found then raise exception 'Produto não encontrado'; end if;
  select id into v_lote from public.lotes
   where produto_id = p.id and coalesce(lote, '') = coalesce(p_lote, '') and validade is not distinct from p_validade limit 1;
  if v_lote is null then
    insert into public.lotes(loja_id, produto_id, lote, validade, qtd) values (v_loja, p.id, nullif(p_lote, ''), p_validade, p_qtd);
  else
    update public.lotes set qtd = qtd + p_qtd where id = v_lote;
  end if;
  if coalesce(p_custo, 0) > 0 then update public.produtos set custo = p_custo where id = p.id; end if;
  insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome)
  values (v_loja, p.id, p.nome, 'entrada', p_qtd, p_nota, public.nome_de(auth.uid()));
end $$;

create or replace function public.baixa_stock(p_lote uuid, p_qtd int, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.lotes%rowtype; p public.produtos%rowtype;
begin
  if not public.gestor() then raise exception 'Só o gerente ou o dono podem dar baixa de stock'; end if;
  select * into l from public.lotes where id = p_lote and loja_id = public.minha_loja() for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if p_qtd is null or p_qtd <= 0 or p_qtd > l.qtd then raise exception 'Quantidade inválida'; end if;
  update public.lotes set qtd = qtd - p_qtd where id = l.id;
  select * into p from public.produtos where id = l.produto_id;
  insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome)
  values (l.loja_id, p.id, p.nome, 'baixa', -p_qtd, p_motivo, public.nome_de(auth.uid()));
  perform public._audit('baixa_stock', p.nome || ' x' || p_qtd || ' (' || coalesce(p_motivo, '') || ')');
end $$;

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
      if p.un_por_caixa is null or p.preco_caixa is null then raise exception 'O produto % não tem venda por caixa', p.nome; end if;
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
    v_out := v_out || jsonb_build_object('produto_id', p.id, 'nome', p.nome, 'codigo', p.codigo, 'qtd', v_qtd, 'caixa', v_caixa,
        'un', v_un, 'preco', case when v_caixa then p.preco_caixa else p.preco end, 'custo_un', p.custo,
        'total', round(v_linha, 2), 'iva', p.iva, 'baixas', v_baixas);
    insert into public.movimentos(loja_id, produto_id, produto_nome, tipo, qtd, nota, usuario_nome)
    values (v_loja, p.id, p.nome, 'venda', -v_un, null, public.nome_de(auth.uid()));
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
      update public.lotes set qtd = qtd + (b->>'qtd')::int where id = (b->>'lote')::uuid;
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

create or replace function public.receber_fiado(p_cliente uuid, p_valor numeric, p_metodo text) returns void
language plpgsql security definer set search_path = public as $$
declare c public.clientes%rowtype; v numeric;
begin
  if public.minha_loja() is null or not public.loja_ativa() then raise exception 'Sem acesso'; end if;
  select * into c from public.clientes where id = p_cliente and loja_id = public.minha_loja() for update;
  if not found then raise exception 'Cliente não encontrado'; end if;
  v := least(c.divida, coalesce(p_valor, 0));
  if v <= 0 then raise exception 'Valor inválido'; end if;
  update public.clientes set divida = divida - v where id = c.id;
  insert into public.recebimentos(loja_id, cliente_id, valor, metodo, usuario_nome) values (c.loja_id, c.id, v, p_metodo, public.nome_de(auth.uid()));
end $$;

create or replace function public.enviar_comprovativo(p_plano text, p_referencia text, p_imagem text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pl public.plataforma%rowtype; v_meses int; v_valor numeric; v_id uuid;
begin
  if public.meu_papel() <> 'dono' then raise exception 'Só o dono da loja pode enviar comprovativos'; end if;
  if p_plano not in ('mensal','trimestral','anual') then raise exception 'Plano inválido'; end if;
  if p_imagem is null or length(p_imagem) < 100 or length(p_imagem) > 1500000 then raise exception 'Imagem do comprovativo inválida ou demasiado grande'; end if;
  select * into pl from public.plataforma where id = 1;
  v_meses := case p_plano when 'mensal' then 1 when 'trimestral' then 3 else 12 end;
  v_valor := case p_plano when 'mensal' then pl.preco_mensal when 'trimestral' then pl.preco_trimestral else pl.preco_anual end;
  insert into public.pagamentos_assinatura(loja_id, plano, meses, valor, metodo, referencia)
  values (public.minha_loja(), p_plano, v_meses, v_valor, pl.metodo, left(p_referencia, 120)) returning id into v_id;
  insert into public.comprovativos(pagamento_id, loja_id, imagem) values (v_id, public.minha_loja(), p_imagem);
  return v_id;
end $$;

create or replace function public.confirmar_pagamento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.pagamentos_assinatura%rowtype; l public.lojas%rowtype;
begin
  if not public.sou_super() then raise exception 'Só o dono do sistema pode confirmar pagamentos'; end if;
  select * into p from public.pagamentos_assinatura where id = p_id for update;
  if not found then raise exception 'Pagamento não encontrado'; end if;
  if p.estado <> 'pendente' then raise exception 'Este pagamento já foi tratado'; end if;
  select * into l from public.lojas where id = p.loja_id for update;
  update public.lojas set estado = 'ativa',
    valido_ate = (greatest(l.valido_ate, public.hoje()) + (p.meses || ' months')::interval)::date
  where id = l.id;
  update public.pagamentos_assinatura set estado = 'confirmado', confirmado_em = now() where id = p.id;
end $$;

create or replace function public.rejeitar_pagamento(p_id uuid, p_nota text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_super() then raise exception 'Só o dono do sistema pode rejeitar pagamentos'; end if;
  update public.pagamentos_assinatura set estado = 'rejeitado', nota = left(p_nota, 300), confirmado_em = now()
  where id = p_id and estado = 'pendente';
  if not found then raise exception 'Pagamento não encontrado ou já tratado'; end if;
end $$;

-- ---------- Permissões de execução ----------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.existe_super() to anon;
revoke execute on function public._audit(text, text) from authenticated;
revoke execute on function public._semear_categorias(uuid) from authenticated;

-- ---------- Tempo real (stock e vendas actualizam em todos os caixas) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.lotes; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.vendas; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.pagamentos_assinatura; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.produtos; exception when duplicate_object then null; end;
  end if;
end $$;

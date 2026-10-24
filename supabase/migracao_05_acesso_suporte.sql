-- =====================================================================
-- GestMZ — migração 05: acesso só por convite, código de acesso dos
-- funcionários, suporte, privacidade entre cargos e categorias genéricas.
-- Segura para correr mais de uma vez.
-- =====================================================================

-- ---------- Colunas novas ----------
alter table public.lojas add column if not exists configurada boolean not null default true;
alter table public.perfis add column if not exists email text;

-- Código de acesso (PIN) dos funcionários: guardado só como "hash", ninguém o lê.
create table if not exists public.perfis_pin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hash text not null,
  falhas int not null default 0,
  bloqueado_ate timestamptz
);
alter table public.perfis_pin enable row level security;
revoke all on public.perfis_pin from anon, authenticated;

-- Suporte: pedidos das lojas ao dono do sistema
create table if not exists public.suporte_tickets (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  autor_nome text,
  tipo text not null default 'duvida' check (tipo in ('duvida','sugestao','problema')),
  assunto text not null,
  estado text not null default 'aberto' check (estado in ('aberto','respondido','fechado')),
  nao_lido_super boolean not null default true,
  nao_lido_loja boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists suporte_tickets_loja_idx on public.suporte_tickets(loja_id, atualizado_em desc);
create table if not exists public.suporte_msgs (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.suporte_tickets(id) on delete cascade,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  de text not null check (de in ('loja','super')),
  autor_nome text,
  texto text not null,
  criado_em timestamptz not null default now()
);
create index if not exists suporte_msgs_ticket_idx on public.suporte_msgs(ticket_id, criado_em);
alter table public.suporte_tickets enable row level security;
alter table public.suporte_msgs enable row level security;
revoke all on public.suporte_tickets, public.suporte_msgs from anon, authenticated;
grant select on public.suporte_tickets, public.suporte_msgs to authenticated;

drop policy if exists p_tickets_sel on public.suporte_tickets;
create policy p_tickets_sel on public.suporte_tickets for select to authenticated
  using (public.sou_super() or (loja_id = public.minha_loja() and public.meu_papel() = 'dono'));
drop policy if exists p_smsgs_sel on public.suporte_msgs;
create policy p_smsgs_sel on public.suporte_msgs for select to authenticated
  using (public.sou_super() or (loja_id = public.minha_loja() and public.meu_papel() = 'dono'));

-- auditoria: guardar quem fez (para o gerente só ver o que os caixas fizeram)
alter table public.auditoria add column if not exists usuario_id uuid;
alter table public.auditoria add column if not exists papel text;
create or replace function public._audit(p_acao text, p_detalhe text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auditoria(loja_id, usuario_nome, usuario_id, papel, acao, detalhe)
  values (public.minha_loja(), public.nome_de(auth.uid()), auth.uid(), public.meu_papel(), p_acao, p_detalhe);
end $$;

-- ---------- Privacidade entre cargos (e do dono do sistema) ----------
-- Dono do sistema: só vê os donos das lojas (contacto). Dono da loja vê toda a equipa,
-- o gerente só vê os caixas, o caixa só vê o seu perfil.
drop policy if exists p_perfis_sel on public.perfis;
create policy p_perfis_sel on public.perfis for select to authenticated
  using (
    id = auth.uid()
    or (public.sou_super() and papel = 'dono')
    or (loja_id = public.minha_loja() and (
         public.meu_papel() = 'dono'
         or (public.meu_papel() = 'gerente' and papel = 'caixa')))
  );
drop policy if exists p_perfis_upd on public.perfis;
create policy p_perfis_upd on public.perfis for update to authenticated
  using (id = auth.uid() or (public.meu_papel() = 'dono' and loja_id = public.minha_loja())
         or (public.meu_papel() = 'gerente' and loja_id = public.minha_loja() and papel = 'caixa'))
  with check (id = auth.uid() or (public.meu_papel() = 'dono' and loja_id = public.minha_loja())
         or (public.meu_papel() = 'gerente' and loja_id = public.minha_loja() and papel = 'caixa'));

create or replace function public.perfis_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor / administração
  if new.id <> old.id or new.papel <> old.papel or new.loja_id is distinct from old.loja_id or new.ativo <> old.ativo
     or new.email is distinct from old.email then
    if not (old.id <> auth.uid() and old.papel <> 'super' and old.papel <> 'dono' and old.loja_id = public.minha_loja()
            and new.id = old.id and new.loja_id = old.loja_id and new.papel in ('gerente','caixa') and new.email is not distinct from old.email
            and (public.meu_papel() = 'dono' or (public.meu_papel() = 'gerente' and old.papel = 'caixa' and new.papel = 'caixa'))) then
      raise exception 'Sem permissão para alterar o papel ou o estado deste utilizador';
    end if;
  end if;
  return new;
end $$;

-- auditoria: o dono vê tudo; o gerente só o que os caixas (e ele) fizeram
drop policy if exists p_auditoria_sel on public.auditoria;
create policy p_auditoria_sel on public.auditoria for select to authenticated
  using (loja_id = public.minha_loja() and (
    public.meu_papel() = 'dono'
    or (public.meu_papel() = 'gerente' and (usuario_id = auth.uid() or papel = 'caixa'))));

-- movimentos de stock traziam custos: continuam só para gestores (sem alteração)

-- ---------- Categorias para qualquer comércio ----------
create or replace function public._semear_categorias(p_loja uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_tipo text; v_base text[]; v_farm text[]; v_extra text[] := array[]::text[];
begin
  select tipo into v_tipo from public.lojas where id = p_loja;
  v_base := array[
    'Bebidas','Refrigerantes e sumos','Água','Cervejas e vinhos','Bebidas energéticas','Chá e café','Leite e laticínios',
    'Arroz, massa e feijão','Farinhas e cereais','Açúcar e sal','Óleos e condimentos','Molhos e temperos','Enlatados e conservas',
    'Pão e padaria','Bolachas e biscoitos','Doces e chocolates','Snacks e salgados','Congelados','Carnes e peixe','Frutas e legumes','Ovos',
    'Higiene pessoal','Cosméticos e beleza','Cabelo','Bebé e criança','Fraldas','Limpeza doméstica','Sabão e detergentes','Papel e descartáveis',
    'Papelaria e escritório','Material escolar','Electrónicos e acessórios','Telemóveis e carregadores','Pilhas e lâmpadas','Cartões de recarga',
    'Roupa','Calçado','Utensílios de cozinha','Ferramentas e ferragens','Material de construção','Brinquedos','Animais e rações','Gás e carvão','Outros'
  ];
  v_farm := array[
    'Medicamentos','Genéricos','Antipalúdicos','Antibióticos','Analgésicos e anti-inflamatórios','Gripe e tosse','Digestivos',
    'Dermatologia','Vitaminas e suplementos','Primeiros socorros','Material hospitalar','Contraceptivos e preservativos','Saúde infantil','Testes rápidos'
  ];
  if v_tipo in ('Farmácia','Clínica / Posto de saúde') then v_extra := v_farm; end if;
  insert into public.categorias(loja_id, nome)
  select p_loja, n from unnest(v_extra || v_base) as n
  on conflict do nothing;
end $$;
revoke execute on function public._semear_categorias(uuid) from authenticated;

-- ---------- Registo público desligado: só por convite do dono do sistema ----------
drop function if exists public.registar_loja(text, text, text, text, text, text);

-- O dono do sistema cria a conta do lojista (a conta já foi criada na autenticação pela app).
create or replace function public.cadastrar_lojista(p_user uuid, p_email text, p_loja_nome text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cod text; v_dias int;
begin
  if not public.sou_super() then raise exception 'Só o dono do sistema pode criar lojistas'; end if;
  if not exists (select 1 from auth.users where id = p_user and created_at > now() - interval '15 minutes') then
    raise exception 'Conta de utilizador inválida ou demasiado antiga';
  end if;
  if exists (select 1 from public.perfis where id = p_user) then raise exception 'Este e-mail já tem acesso ao sistema'; end if;
  select teste_dias into v_dias from public.plataforma where id = 1;
  loop
    v_cod := lpad((floor(random() * 90000) + 10000)::int::text, 5, '0');
    exit when not exists (select 1 from public.lojas where codigo = v_cod);
  end loop;
  insert into public.lojas(codigo, nome, tipo, estado, valido_ate, configurada)
  values (v_cod, coalesce(nullif(trim(p_loja_nome), ''), 'Loja por configurar'), 'Mercearia', 'teste', public.hoje() + v_dias, false)
  returning id into v_id;
  insert into public.perfis(id, loja_id, nome, papel, email) values (p_user, v_id, 'Lojista', 'dono', lower(trim(p_email)));
  insert into public.contadores(loja_id) values (v_id);
  return v_id;
end $$;

-- O lojista preenche os dados da sua loja no primeiro acesso.
create or replace function public.configurar_loja(p_dono_nome text, p_nome text, p_tipo text, p_endereco text, p_tel text, p_nuit text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.lojas%rowtype;
begin
  if public.meu_papel() <> 'dono' then raise exception 'Só o dono da loja pode configurar a loja'; end if;
  select * into l from public.lojas where id = public.minha_loja() for update;
  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_dono_nome), '') = '' then raise exception 'Preencha o seu nome e o nome da loja'; end if;
  if coalesce(trim(p_endereco), '') = '' then raise exception 'Indique a localização da loja'; end if;
  update public.lojas set nome = trim(p_nome), tipo = coalesce(nullif(p_tipo, ''), tipo), endereco = trim(p_endereco),
    tel = nullif(trim(p_tel), ''), nuit = nullif(trim(p_nuit), ''), configurada = true where id = l.id;
  update public.perfis set nome = trim(p_dono_nome) where id = auth.uid();
  if not l.configurada then perform public._semear_categorias(l.id); end if;
end $$;

-- ---------- Código de acesso dos funcionários ----------
create or replace function public._pin_hash(p_user uuid, p_pin text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_user::text || ':gestmz:' || p_pin, 'utf8')), 'hex')
$$;
revoke execute on function public._pin_hash(uuid, text) from authenticated;

create or replace function public._definir_pin(p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_pin !~ '^[0-9]{6,10}$' then raise exception 'O código de acesso deve ter de 6 a 10 números'; end if;
  insert into public.perfis_pin(user_id, hash, falhas, bloqueado_ate) values (p_user, public._pin_hash(p_user, p_pin), 0, null)
  on conflict (user_id) do update set hash = excluded.hash, falhas = 0, bloqueado_ate = null;
end $$;
revoke execute on function public._definir_pin(uuid, text) from authenticated;

create or replace function public.definir_pin(p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.perfis%rowtype;
begin
  select * into t from public.perfis where id = p_user;
  if not found or t.loja_id is distinct from public.minha_loja() then raise exception 'Funcionário não encontrado'; end if;
  if not ((public.meu_papel() = 'dono' and t.papel in ('gerente','caixa')) or (public.meu_papel() = 'gerente' and t.papel = 'caixa')) then
    raise exception 'Sem permissão';
  end if;
  perform public._definir_pin(p_user, p_pin);
  perform public._audit('codigo_acesso', 'Novo código de acesso para ' || t.nome);
end $$;

create or replace function public.pin_exigido() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis p join public.perfis_pin k on k.user_id = p.id
                 where p.id = auth.uid() and p.ativo and p.papel in ('gerente','caixa'))
$$;

create or replace function public.verificar_pin(p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
declare k public.perfis_pin%rowtype;
begin
  if auth.uid() is null then raise exception 'Inicie sessão primeiro'; end if;
  select * into k from public.perfis_pin where user_id = auth.uid() for update;
  if not found then return true; end if;
  if k.bloqueado_ate is not null and k.bloqueado_ate > now() then
    raise exception 'Demasiadas tentativas. Espere alguns minutos ou peça um novo código ao seu responsável.';
  end if;
  if k.hash = public._pin_hash(auth.uid(), coalesce(p_pin, '')) then
    update public.perfis_pin set falhas = 0, bloqueado_ate = null where user_id = auth.uid();
    return true;
  end if;
  update public.perfis_pin set
    bloqueado_ate = case when falhas + 1 >= 5 then now() + interval '10 minutes' else null end,
    falhas = case when falhas + 1 >= 5 then 0 else falhas + 1 end
  where user_id = auth.uid();
  return false;
end $$;

-- Criar funcionário (e-mail real + código de acesso)
drop function if exists public.criar_perfil(uuid, text, text, text);
create or replace function public.criar_perfil(p_user uuid, p_nome text, p_email text, p_papel text, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare v_papel text := public.meu_papel();
begin
  if v_papel is null or v_papel in ('super','caixa') then raise exception 'Sem permissão'; end if;
  if p_papel not in ('gerente','caixa') then raise exception 'Cargo inválido'; end if;
  if v_papel = 'gerente' and p_papel <> 'caixa' then raise exception 'O gerente só pode criar caixas'; end if;
  if not public.loja_ativa() then raise exception 'A subscrição da loja expirou'; end if;
  if not exists (select 1 from auth.users where id = p_user and created_at > now() - interval '15 minutes') then
    raise exception 'Conta de utilizador inválida ou demasiado antiga';
  end if;
  if exists (select 1 from public.perfis where id = p_user) then raise exception 'Este e-mail já tem acesso ao sistema'; end if;
  perform public._definir_pin(p_user, p_pin);
  insert into public.perfis(id, loja_id, nome, email, papel) values (p_user, public.minha_loja(), trim(p_nome), lower(trim(p_email)), p_papel);
  perform public._audit('criar_utilizador', p_papel || ': ' || trim(p_nome));
end $$;

-- Remover funcionário de vez (liberta o e-mail; o histórico de vendas fica com o nome)
create or replace function public.remover_funcionario(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.perfis%rowtype;
begin
  select * into t from public.perfis where id = p_id;
  if not found or t.loja_id is distinct from public.minha_loja() or p_id = auth.uid() then raise exception 'Funcionário não encontrado'; end if;
  if not ((public.meu_papel() = 'dono' and t.papel in ('gerente','caixa')) or (public.meu_papel() = 'gerente' and t.papel = 'caixa')) then
    raise exception 'Sem permissão para remover este funcionário';
  end if;
  perform public._audit('remover_utilizador', t.papel || ': ' || t.nome);
  delete from auth.users where id = p_id;      -- apaga também o perfil e o código de acesso
end $$;

-- ---------- Suporte ----------
create or replace function public.abrir_ticket(p_tipo text, p_assunto text, p_texto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text := public.nome_de(auth.uid());
begin
  if public.meu_papel() <> 'dono' then raise exception 'Só o dono da loja pode contactar o suporte'; end if;
  if coalesce(trim(p_assunto), '') = '' or coalesce(trim(p_texto), '') = '' then raise exception 'Escreva o assunto e a mensagem'; end if;
  insert into public.suporte_tickets(loja_id, autor_nome, tipo, assunto) values (public.minha_loja(), v_nome, coalesce(nullif(p_tipo, ''), 'duvida'), left(trim(p_assunto), 120)) returning id into v_id;
  insert into public.suporte_msgs(ticket_id, loja_id, de, autor_nome, texto) values (v_id, public.minha_loja(), 'loja', v_nome, left(trim(p_texto), 3000));
  return v_id;
end $$;

create or replace function public.responder_ticket(p_ticket uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.suporte_tickets%rowtype;
begin
  select * into t from public.suporte_tickets where id = p_ticket for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escreva a mensagem'; end if;
  if public.sou_super() then
    insert into public.suporte_msgs(ticket_id, loja_id, de, autor_nome, texto) values (t.id, t.loja_id, 'super', 'GestMZ', left(trim(p_texto), 3000));
    update public.suporte_tickets set estado = 'respondido', nao_lido_loja = true, nao_lido_super = false, atualizado_em = now() where id = t.id;
  elsif public.meu_papel() = 'dono' and t.loja_id = public.minha_loja() then
    insert into public.suporte_msgs(ticket_id, loja_id, de, autor_nome, texto) values (t.id, t.loja_id, 'loja', public.nome_de(auth.uid()), left(trim(p_texto), 3000));
    update public.suporte_tickets set estado = 'aberto', nao_lido_super = true, nao_lido_loja = false, atualizado_em = now() where id = t.id;
  else raise exception 'Sem permissão'; end if;
end $$;

create or replace function public.ticket_lido(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.sou_super() then update public.suporte_tickets set nao_lido_super = false where id = p_ticket;
  elsif public.meu_papel() = 'dono' then update public.suporte_tickets set nao_lido_loja = false where id = p_ticket and loja_id = public.minha_loja();
  end if;
end $$;

create or replace function public.fechar_ticket(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.sou_super() then update public.suporte_tickets set estado = 'fechado', nao_lido_super = false where id = p_ticket;
  elsif public.meu_papel() = 'dono' then update public.suporte_tickets set estado = 'fechado', nao_lido_loja = false where id = p_ticket and loja_id = public.minha_loja();
  else raise exception 'Sem permissão'; end if;
end $$;

-- ---------- Permissões e tempo real ----------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.existe_super() to anon;
revoke execute on function public._audit(text, text) from authenticated;
revoke execute on function public._semear_categorias(uuid) from authenticated;
revoke execute on function public._pin_hash(uuid, text) from authenticated;
revoke execute on function public._definir_pin(uuid, text) from authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.suporte_tickets; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.suporte_msgs; exception when duplicate_object then null; end;
  end if;
end $$;

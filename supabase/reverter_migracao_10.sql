-- Reverte a migração 10 (NÃO executar sem necessidade). Não apaga dados: mantém as colunas novas e a tabela
-- auditoria_plataforma (inofensivas) — para as remover use os comandos comentados no fim, só depois de exportar o conteúdo.
drop trigger if exists perfis_super_guard_trg on public.perfis;
drop trigger if exists perfis_audit_super_trg on public.perfis;
drop trigger if exists plat_audit_trg on public.plataforma;
drop trigger if exists lojas_audit_plat_trg on public.lojas;
drop function if exists public.perfis_super_guard();
drop function if exists public._plat_audit_trg();
drop function if exists public.estado_inicializacao();
drop function if exists public._audit_plat(text, jsonb);

-- funções originais (idênticas às de produção antes da migração 10)
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
revoke all on function public.reivindicar_super(text) from public, anon;
grant execute on function public.reivindicar_super(text) to authenticated;

create or replace function public.nome_de(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select nome from public.perfis where id = p_id
$$;

-- permissões originais de plataforma (UPDATE ao nível da tabela; a política RLS continua a limitar ao dono do sistema)
grant update on public.plataforma to authenticated;

-- Remoção total (opcional, destrutiva só para os dados de auditoria):
-- drop table public.auditoria_plataforma;
-- alter table public.plataforma drop column dono_inicializado, drop column inicializacao_aberta;

-- =====================================================================
-- GestMZ — reverte a migração 16 (só se for mesmo necessário).
-- ATENÇÃO: apaga as notificações e o HISTÓRICO DE FECHOS DE CAIXA criados desde a migração, e a coluna produtos.foto_ver
-- (as fotografias ficam no Storage, mas deixam de estar ligadas aos produtos). Antes de correr:
--   1) exporte caixa_fechos e notificacoes (Table Editor → Export CSV) se quiser guardar o histórico;
--   2) as fotografias do Storage NÃO são apagadas por este ficheiro (o Supabase não permite apagar objetos por SQL);
--      apague-as pelo painel (Storage → produtos-fotos) se as quiser remover.
-- Não toca em vendas, produtos, lotes, clientes nem em funções que já existiam.
-- =====================================================================
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime drop table public.notificacoes; exception when undefined_object then null; end;
  end if;
end $$;
drop trigger if exists vendas_notifica_ins on public.vendas;
drop trigger if exists vendas_notifica_upd on public.vendas;
drop trigger if exists lotes_notifica_upd on public.lotes;
drop trigger if exists lotes_notifica_del on public.lotes;
drop trigger if exists recebimentos_usuario_trg on public.recebimentos;
drop trigger if exists produtos_campos_dono_trg on public.produtos;
drop function if exists public.vendas_notifica();
drop function if exists public.lotes_notifica();
drop function if exists public.recebimentos_usuario();
drop function if exists public.produtos_campos_dono();
drop function if exists public.reabrir_caixa(uuid, text);
drop function if exists public.fechar_caixa(numeric, text, numeric, uuid, timestamptz);
drop function if exists public.resumo_caixa();
drop function if exists public._caixa_calc(uuid, uuid, timestamptz);
drop function if exists public.marcar_todas_lidas();
drop function if exists public.marcar_notificacao_lida(uuid);
drop function if exists public.notificacoes_nao_lidas();
drop function if exists public.minhas_notificacoes(int, timestamptz);
drop function if exists public.produto_por_codigo(text);
drop function if exists public.produtos_venda();
drop table if exists public.caixa_fechos;
drop table if exists public.notificacoes_lidas;
drop table if exists public.notificacoes;
drop function if exists public.caixa_fechos_imutavel();
drop function if exists public._notificar(uuid, text, text, jsonb, text);
drop function if exists public._notif_tipos(text);
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    drop policy if exists fotos_produtos_sel on storage.objects;
    drop policy if exists fotos_produtos_ins on storage.objects;
    drop policy if exists fotos_produtos_upd on storage.objects;
    drop policy if exists fotos_produtos_del on storage.objects;
  end if;
end $$;
alter table public.produtos drop column if exists foto_ver;
alter table public.recebimentos drop column if exists usuario_id;

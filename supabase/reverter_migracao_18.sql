-- Reverte a migração 18 (personalização do recibo). Só apaga o que a 18 criou: não toca em lojas, vendas, produtos, clientes nem contas.
drop function if exists public.guardar_recibo_config(jsonb);
drop table if exists public.recibo_config;

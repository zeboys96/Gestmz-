-- Reverte a migração 17 (atividade das lojas). Só apaga o que a 17 criou: não toca em lojas, vendas, produtos, clientes nem contas.
drop function if exists public.super_versoes_em_uso();
drop function if exists public.super_atividade();
drop function if exists public.registar_atividade(text, text);
drop table if exists public.atividade_dia;
drop table if exists public.atividade_utilizador;

-- Reverte as migrações 17 e 18 (atividade das lojas). Só apaga o que elas criaram: não toca em lojas, vendas, produtos, clientes nem contas.
drop function if exists public.super_versoes_em_uso();
drop function if exists public.super_atividade();
drop function if exists public.registar_atividade(text);
drop function if exists public.registar_atividade(text, text);
drop table if exists public.atividade_dia;
drop table if exists public.atividade_utilizador;

-- Reverte a migração 15 (NÃO executar sem necessidade). Remove gatilhos, funções e tabelas de apoio ao TOTP.
-- ATENÇÃO: apaga os hashes dos códigos de recuperação (os titulares terão de gerar novos) e a configuração do interruptor.
-- Não toca nos fatores TOTP do Supabase Auth, nem em contas, lojas, vendas, produtos ou clientes.
-- Antes de reverter com o interruptor ligado, desligue-o (select public.mfa_desativar_obrigatorio_super();) — a remoção dos gatilhos também o faz na prática.
do $$ declare t text; begin
  foreach t in array array['lojas', 'perfis', 'pagamentos_assinatura', 'plataforma'] loop
    execute format('drop trigger if exists mfa_super_trg on public.%I', t);
  end loop;
end $$;
drop function if exists public._mfa_super_trg();
drop function if exists public.exigir_mfa_super();
drop function if exists public.mfa_super_obrigatorio();
drop function if exists public.mfa_estado();
drop function if exists public.mfa_gerar_codigos();
drop function if exists public.mfa_consumir_codigo(uuid, text);
drop function if exists public.mfa_devolver_codigo(uuid, bigint);
drop function if exists public.mfa_autorizar_remocao(uuid, uuid, text);
drop function if exists public.mfa_auditar(uuid, text, jsonb);
drop function if exists public.mfa_ativar_obrigatorio_super();
drop function if exists public.mfa_desativar_obrigatorio_super();
drop function if exists public._mfa_audit(uuid, text, jsonb);
drop function if exists public._mfa_tem_fator(uuid);
drop function if exists public._mfa_hash(text);
drop function if exists public._mfa_norm(text);
drop table if exists public.mfa_recuperacao;
drop table if exists public.mfa_tentativas;
drop table if exists public.config_seguranca;

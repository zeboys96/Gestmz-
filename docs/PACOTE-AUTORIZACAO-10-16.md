# Pacote de autorização — migrações 10 e 16 (EXECUTADAS em produção a 01/11/2026, com autorização expressa do dono)

Ordem: **(A) ensaio num projeto Supabase de TESTE → (B) backup da produção → (C) migração 10 → (D) migração 16.**
A migração 12 e o TOTP (15) **não** fazem parte deste pacote. Só avanço com a sua resposta expressa a cada passo.

## A. Ensaio no projeto de teste (recomendado antes de tocar na produção)
1. Criar um projeto Supabase novo (plano gratuito) só para testes. Não use a produção.
2. Aplicar `supabase/schema.sql` e as migrações 05 a 09, depois a 10 e a 16 (por esta ordem).
3. Criar uma conta de teste como dono do sistema, uma loja, um gerente e um caixa; correr o APK de teste contra esse projeto.
4. Verificar: lista do caixa sem stock, fotos (Storage), sino, fecho de caixa, reabertura.
Este ensaio é o único modo de validar o Storage, o tempo real e o PostgREST reais.

## B. Backup antes de qualquer migração em produção
- Painel Supabase → Database → Backups: confirmar se há cópias do seu plano e a data da última.
- Exportar em CSV (Table Editor): `lojas`, `perfis`, `produtos`, `lotes`, `vendas`, `clientes`, `recebimentos`, `despesas`, `movimentos`, `categorias`, `plataforma`, `pagamentos_assinatura`. Guardar fora do Supabase.
- Confirmar que as 3 farmácias têm **0 vendas pendentes** na app (indicador de vendas por enviar).

## C. Migração 10 — `supabase/migracao_10_inicializacao_segura.sql`
**Para que serve:** fecha a falha de «Configurar o dono do sistema» (passa a ser atómica no servidor) e protege a conta de super.
**Antes (só leitura, deve dar):** exatamente 1 perfil `papel='super'` ativo, com `loja_id` nulo e e-mail `zeboys96@gmail.com`; sem a função `estado_inicializacao`.
**Depois (só leitura, deve dar):** o mesmo perfil super intacto (mesmo id e e-mail, ativo); `estado_inicializacao()` = `'fechada'`; `dono_inicializado = true` e `inicializacao_aberta = false`.
**Reversão:** `supabase/reverter_migracao_10.sql` (provada em réplica).
**Riscos:** testada só em réplica Postgres; comparar as funções de produção com as do repositório antes de aplicar (a 10 não substitui funções de produção só por serem diferentes). Não altera contas, vendas nem produtos.

## D. Migração 16 — `supabase/migracao_16_stock_fotos_notificacoes_caixa.sql`
**Só acrescenta** (ver `docs/NOVIDADES-16.md` §2). **Antes:** não existem as tabelas `notificacoes`, `notificacoes_lidas`, `caixa_fechos` nem a coluna `produtos.foto_ver`. **Depois:** existem; `select count(*)` de vendas, produtos e lotes igual ao de antes.
**Reversão:** `supabase/reverter_migracao_16.sql` — apaga notificações e fechos criados desde então (exportar antes).
**Efeito visível:** o gerente deixa de alterar o limite de stock baixo e a fotografia.
**Depois de aplicada:** o caixa passa a ver só produtos com stock (com a app nova).

## O que NÃO se faz neste pacote
Migração 12, TOTP, Edge Function, criação da chave Android, merge, Release.

## Decisão pedida
Responda por escrito a cada passo: «autorizo o ensaio no projeto de teste», e mais tarde «autorizo a migração 10 em produção» e «autorizo a migração 16 em produção».

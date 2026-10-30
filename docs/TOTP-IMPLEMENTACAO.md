# GestMZ — TOTP: o que foi implementado (só em desenvolvimento) e como se valida

Estado: **nada aplicado nem publicado em produção.** Migração 15 por aplicar; Edge Function `recuperar-totp` por criar no Supabase; interruptor «MFA obrigatório para o dono do sistema» **desligado**. Decisões do utilizador (30/10): 1A (super obrigatório, donos opcional — mas só depois de provada a recuperação), 2A só para o futuro (único super: o atual), 3A (função preparada e testada localmente; publicar só com autorização explícita).

## Peças
| Peça | Ficheiro | Notas |
|---|---|---|
| Base de dados | `supabase/migracao_15_totp_recuperacao.sql` (+ `reverter_migracao_15.sql`) | Códigos de recuperação só como hash (8 códigos, 80 bits, uso único; gerar de novo invalida os antigos). Limite: 5 falhas/15 min por conta (as bloqueadas não prolongam o bloqueio). Auditoria sem códigos. Tabelas fechadas à API. RPCs de consumo/remoção só para `service_role`. |
| Interruptor | `config_seguranca.mfa_super_obrigatorio` | **Desligado por omissão.** Só liga com `mfa_ativar_obrigatorio_super()` (administração SQL), e só se: (a) `mfa_recuperacao_testada='true'` (posto à mão depois de um ensaio real), (b) todos os donos do sistema têm TOTP verificado, (c) todos têm códigos por usar. Ligado, o dono do sistema só escreve em lojas/perfis/pagamentos/plataforma com `aal2`; lê com `aal1`. Desligar: `mfa_desativar_obrigatorio_super()`. |
| Edge Function | `supabase/functions/recuperar-totp/` | `logica.mjs` (testada em Node) + `index.ts` (Deno). Ação `codigo`: o alvo é **sempre o dono do token**. Ação `remover_dono`: só o dono do sistema com `aal2` e só para um dono de loja; nunca funcionários, nunca outro super, nunca a própria conta. Se a remoção do fator falhar, o código é devolvido. Respostas e registos sem códigos nem tokens. CORS por lista (`GESTMZ_ORIGENS`). |
| Interface | `www/totp.js` | Conta → ativar (QR + chave), 8 códigos mostrados uma vez (só fecha após «já guardei»), gerar novos e desativar (pedem código), desafio no início de sessão, «Perdi o telemóvel». Só dono e super; invisível sem a migração 15; sem rede não bloqueia (o servidor decide). |

## Testes (locais)
- `tests/db/totp.sh`: 98 testes (migrações 10+12+15, 15 duas vezes) incl. concorrência (6 pedidos, 1 sucesso) e interruptor. `tests/db/reversao15.sh`.
- `tests/totp-funcao.test.js`: 10 testes da lógica da função, `tests/totp-ui.test.js`: interface em Chromium com cliente simulado.
- Controlos negativos: estragando de propósito cada proteção (uso único, limite, gatilhos, aal2, autorização de remoção, devolução do código, alvo do token) os testes falham.

## O que NÃO está provado (precisa de projeto Supabase de teste + telemóvel real)
1. `mfa.enroll/verify` reais, QR no Google Authenticator, tolerância do relógio.
2. `auth.admin.mfa.deleteFactor` e `listFactors` reais, e o comportamento de um token `aal2` antigo depois de remover o fator.
3. A função em Deno, CORS com as origens reais (web, `capacitor://localhost`, Electron `app://`), a chave de serviço injetada.
4. Coluna `factor_type`/`status` de `auth.mfa_factors` no Supabase real (usada em `_mfa_tem_fator`).
5. Ensaio completo: utilizador de teste ativa, perde o telemóvel, recupera com código, reativa; super de teste idem.

## Ordem segura (cada passo com autorização expressa)
migração 10 → app nova distribuída → 12 → **15** → criar a função num projeto de TESTE e executar o ensaio → só então, em produção: aplicar 15, criar a função, o super ativa TOTP e gera códigos (guardados fora do telemóvel) → pôr `mfa_recuperacao_testada='true'` → `mfa_ativar_obrigatorio_super()`. Último recurso se o super ficar bloqueado: remover o fator pelo painel do Supabase (dono do projeto) ou `mfa_desativar_obrigatorio_super()` por SQL de administração.

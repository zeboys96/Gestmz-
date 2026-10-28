# GestMZ — TOTP (Google Authenticator) e códigos de recuperação: avaliação e desenho

Estado: **só avaliação. Nada implementado, nada ativado em produção, nenhuma configuração do Supabase Auth alterada.**

## 1. Viabilidade
- O Supabase Auth traz MFA por TOTP (Google Authenticator, Microsoft Authenticator, Aegis, etc.), sem custo extra. Funções do cliente: `auth.mfa.enroll({factorType:'totp'})` (devolve QR, segredo e URI `otpauth://`), `challenge`, `verify`, `listFactors`, `getAuthenticatorAssuranceLevel`.
- Após `verify`, o JWT passa a ter `aal = aal2`. Sem MFA, o JWT é `aal1`.
- **A aplicação só é segura se o servidor exigir `aal2`**; esconder botões não protege. Verificação no servidor: `(auth.jwt()->>'aal') = 'aal2'`, dentro das funções sensíveis (migrações 11 e 14) ou em políticas RLS *restritivas*.
- O Supabase **não** tem códigos de recuperação nativos. Têm de ser nossos.
- Disponibilidade da funcionalidade MFA no projeto real: **não verificada** (não alterei nem testei a configuração de produção).

## 2. Quem usa
| Papel | Proposta |
|---|---|
| `super` | **Obrigatório** (conta `zeboys96@gmail.com`, a mais poderosa). Exigido no servidor para aprovar recuperações, criar/suspender donos e outras ações da plataforma. |
| `dono` | **Opcional**, recomendado; ativável em Conta. Não bloqueia vendas. |
| `gerente`, `caixa` | Fora do âmbito (autenticam por senha + código de acesso; fricção alta no balcão). |

## 3. Fluxos de interface (a implementar depois de autorizado)
1. **Ativar**: Conta → Segurança → mostra QR + segredo manual → o utilizador introduz o primeiro código de 6 dígitos → só então o fator fica verificado → mostra **10 códigos de recuperação uma única vez**.
2. **Entrar**: senha → se existir fator verificado, pede o código (aal2). Falha repetida: bloqueio temporário do Supabase.
3. **Ações do super** pedem `aal2` no servidor; sem ele, erro claro «Confirme com o código do autenticador».
4. **Desativar**: exige `aal2` e senha.

## 4. Códigos de recuperação (nossos)
- Tabela `mfa_recuperacao(user_id, hash, usado_em)`; 10 códigos aleatórios (≥ 64 bits), guardados só como hash (bcrypt/`crypt()` do pgcrypto); nunca em claro nem em registos. Mostrados uma única vez; regenerar invalida os antigos.
- **Limite técnico importante:** um código de recuperação **não consegue elevar o JWT a `aal2`** (isso só o TOTP faz). Logo, a recuperação tem de **remover o fator** e permitir novo registo. Isso exige a API de administração (`auth.admin.mfa.deleteFactor`), que só pode ser usada com a chave de serviço, **numa Edge Function** (a chave nunca vai para a app).
- Fluxo: utilizador com senha (aal1) + código de recuperação válido → a Edge Function verifica o hash, regista na auditoria, apaga o fator, marca o código como usado → o utilizador volta a ativar TOTP e recebe novos códigos.
- Para o **super** (sem outro super que o ajude): perdeu o telemóvel **e** os códigos → só o proprietário do projeto Supabase consegue remover o fator pelo painel (Authentication → Users). É o último recurso e deve estar descrito num documento guardado fora da app. Recomendo, quando houver condições, um **segundo superadministrador** com o seu próprio TOTP.
- Atraso de 1 hora (preferência sua): tecnicamente fácil (`usado_em`/`pedido_em` + verificação na Edge Function), mas **só protege se houver aviso ao titular**, o que exige e-mail fiável; hoje não está garantido. Sem aviso, o atraso apenas adia o atacante. Mantenho a recomendação da revisão anterior (1 h para códigos; 24 h para recuperação assistida pelo super).

## 5. Riscos
- **Bloqueio do super** (maior risco): ver acima; mitigar com códigos guardados fora do telemóvel e, depois, segundo super. Só ativar MFA no super **depois** de testar remoção de fator num utilizador de teste.
- **JWT antigo**: depois de remover o fator, o token `aal2` pode valer até renovar; as ações críticas devem também verificar um carimbo recente (`amr`/hora do `verify`) ou forçar `refreshSession`.
- **Só telemóvel**: a app e o autenticador estão no mesmo aparelho; perder o aparelho perde ambos. Guardar o segredo manual e os códigos fora do telefone.
- **Relógio do telemóvel** desfasado gera códigos recusados (o Supabase tolera pequena deriva).
- **Dependência da Edge Function** para recuperar: tem de estar criada, testada e protegida (limite de tentativas, auditoria) antes de obrigar MFA ao super.
- A funcionalidade só existe quando as migrações 10/11 estiverem aplicadas; não depende da 12.

## 6. Plano de testes
Local (sem produção): réplica Postgres com JWT simulado `aal1`/`aal2` para provar que as funções sensíveis recusam `aal1`; testes de hash e uso único dos códigos; interface com cliente Supabase simulado. Real (precisa de si): inscrever um utilizador de teste, entrar, remover fator com código, ver o comportamento de um token antigo.

## 7. Decisões que preciso de si
1. Super obrigatório e dono opcional? 2. Aceita um segundo super no futuro? 3. Autoriza, mais tarde, criar a Edge Function (só com o seu «sim» explícito)?

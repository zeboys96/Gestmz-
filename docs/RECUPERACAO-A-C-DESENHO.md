# Recuperação de acesso dos donos das lojas — desenho A + C (NÃO implementado)

Âmbito: **só donos de loja**. Funcionários: ver §9. Substitui/precisa a proposta anterior (`RECUPERACAO-SENHA-PROPOSTA.md`). Sem confirmação de e-mail e sem alterar a configuração do Supabase.

## 1. Princípio
Conhecer o e-mail **nunca** basta. A recuperação exige uma prova que o servidor consegue verificar e que o superadministrador não consegue fabricar sozinho.
- **C (prova própria):** o dono guarda **códigos de recuperação** de uso único, gerados enquanto ainda tem acesso.
- **A (prova humana):** o superadministrador verifica a pessoa fora da aplicação; serve para quem perdeu os códigos, com mais controlos.

## 2. Códigos de recuperação (C)
- O dono gera-os em «Conta → Códigos de recuperação» (precisa de sessão **e** da senha atual). São 8 códigos de ~80 bits (16 caracteres base32, `gen_random_bytes` no servidor), mostrados **uma vez**; guarda-se só o hash (SHA-256). Gerar de novo invalida os anteriores. Nunca vão para a auditoria nem para registos.
- Contas existentes: nada muda até o dono os gerar; **não se alteram senhas nem contas**. Convém pedir a cada lojista que os gere e guarde (num local seguro, fora do telemóvel de trabalho).
- Perda: se o dono tem sessão ainda ativa noutro aparelho, regenera; se não, usa o caminho A.

## 3. Fluxo
1. **Pedido** no ecrã de login («Esqueci a senha»): e-mail. A app gera um **segredo do aparelho** (256 bits, fica só no aparelho; o servidor guarda o hash) e mostra um **código de verificação** de 6 dígitos. A resposta é **idêntica** exista ou não a conta; só se cria registo se a conta existir e for de dono de loja ativa. Limites por e-mail e globais (um pedido pendente por conta, intervalo mínimo, teto por hora); sem revelar nada na latência (pedido sempre processado da mesma forma).
2. **Caminho C:** o pedido pode incluir **um código de recuperação**. O servidor valida o hash (sem o consumir ainda) e marca o pedido «prova própria apresentada». O superadministrador **vê só a marca**, nunca o código.
3. **Decisão do superadministrador** (área «Recuperações», contador em tempo real):
   - Com prova própria: aprova ou rejeita; **sem** prova própria o servidor **recusa aprovar** pelo caminho C.
   - Caminho A (sem códigos): o superadministrador tem de registar o **método de verificação** (chamada ao telefone registado, videochamada, presencial), lê o código de 6 dígitos que o titular vê no ecrã e escreve-o; o servidor compara. Só então aprova.
   - Em ambos: a função exige sessão com **MFA (AAL2)** do superadministrador (`auth.jwt()->>'aal' = 'aal2'`).
4. **Espera:** C — 1 h; A — 24 h. Durante a espera o pedido pode ser **cancelado** pelo titular (se ainda tiver sessão) e fica registado na auditoria da loja, visível ao dono da loja no próximo acesso (gerente/caixa não).
5. **Conclusão:** depois da espera, e dentro da validade (2 h para C, 24 h para A), o **aparelho com o segredo** mostra «Definir nova senha». A senha segue por HTTPS para uma **Edge Function** que, com a chave interna do Supabase, confirma no servidor (estado aprovado, janela de tempo, hash do segredo, uma só vez, tentativas ≤ 5) e chama `auth.admin.updateUserById`. Marca o pedido «concluído», **consome o código de recuperação** (C) e **apaga as sessões** da conta. A senha não é guardada nem escrita em registos; o superadministrador nunca a vê.
6. **Notificações:** o superadministrador vê o pedido, a decisão e o resultado (pendente → aprovado/rejeitado → concluído/expirado/cancelado) na área e no histórico. Notificações fora da app (e-mail/WhatsApp) não existem hoje; exigiriam serviço externo.

## 4. Auditoria
`auditoria_plataforma` (migração 10) e a auditoria da loja registam: pedido, prova apresentada (sim/não), método de verificação, decisão e quem, MFA presente, início da espera, conclusão, expiração, cancelamento, tentativas falhadas. **Nunca**: senhas, códigos, segredos do aparelho.

## 5. O atraso de uma hora — avaliação
| Cenário | Efeito do atraso |
|---|---|
| C com código | 1 h dá tempo ao verdadeiro dono de cancelar se não foi ele; custo baixo. Razoável como **mínimo**. |
| A sem códigos | 1 h é insuficiente para um engano por engenharia social ser notado (o dono real pode estar sem Internet horas). Proponho **24 h**. |
| Superadministrador comprometido | O atraso só ajuda se alguém vir o aviso: por isso o aviso fica na auditoria da loja e o **MFA** é obrigatório. |
Conclusão técnica: **1 h para C é aceitável; para A deve ser 24 h.** Não o trato como requisito definitivo — decide com o resultado do teste.

## 6. Ameaças e limites (honestos)
| Ameaça | Controlo | Resíduo |
|---|---|---|
| Sabe o e-mail | Resposta igual; sem prova não se aprova (C) / precisa de verificação humana (A) | — |
| Engenharia social ao superadministrador (A) | verificação registada, código lido, 24 h, aviso, MFA | **Existe**: depende da diligência humana |
| Superadministrador comprometido ou mal-intencionado | MFA, auditoria visível ao dono da loja, atraso | Pode criar o pedido no seu aparelho e aprovar; o atraso e a auditoria só **detetam**, não impedem. Um C obrigatório (sem A) eliminaria isto: custo = quem perde os códigos perde a conta |
| Códigos roubados | uso único, precisam também de aprovação e do segredo do aparelho | O ladrão com código **e** aparelho do titular |
| Troca de aparelho a meio | novo pedido | incómodo |
| Spam de pedidos | limites; aprovação em bloco | ocupa a lista |
| Sessões antigas | apagadas na conclusão | o token de acesso já emitido vale até expirar (por omissão cerca de 1 h): é limitação do Supabase |
| Perda total (códigos + telefone + conta) | só A com 24 h e verificação forte | pode falhar: contacto presencial |
**Decisão que lhe cabe:** aceitar o resíduo do superadministrador comprometido (A existe) ou tornar C obrigatório e A só para casos excecionais aprovados com verificação reforçada.

## 7. Dependências e o que NÃO está feito
- **Migração 11** (tabelas `recuperacoes`, `codigos_recuperacao`, RPCs, RLS fechado). **Depende da migração 10** (`auditoria_plataforma`, proteção do `super`); deve vir depois dela e **não na mesma janela**.
- **Edge Function** `concluir-recuperacao` (nunca criada nem publicada). Usa a chave de serviço injetada pelo Supabase; não vai para o cliente, o APK nem o Windows. Alternativa por SQL (`auth.users.encrypted_password`) **não recomendada**.
- **MFA do superadministrador**: ativar TOTP é um passo seu (definição do Supabase); a app só o pede.
- Não validado: a execução real com o Supabase Auth/PostgREST e a função `updateUserById` (só simulação local). Necessário um **projeto Supabase de teste**.
- Alteração normal de senha: separada (`tests/senha-normal.test.js`; pede a senha atual).

## 8. Testes necessários
Aprovada; rejeitada; expirada (espera e validade); reutilizada; segredo errado; outro aparelho; código de recuperação válido / inválido / já usado / regenerado; perdido (caminho A); superadministrador sem MFA recusado; aprovar sem prova; aprovar pedido de loja inexistente; resposta igual para e-mail inexistente; limites; auditoria sem segredos; sessões apagadas; separação da alteração normal; o `super` não pode ser alvo de recuperação; concorrência (duas conclusões).

## 9. Funcionários (fora desta fase)
Planear à parte: o dono da loja inicia a recuperação de um funcionário; o servidor gera um código de uso único que o dono entrega pessoalmente; o funcionário define a sua senha (o dono nunca a vê); mesmo registo e limites.

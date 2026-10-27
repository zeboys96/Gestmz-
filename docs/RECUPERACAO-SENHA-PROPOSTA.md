# Recuperação de senha dos lojistas — análise e propostas (NADA implementado, NADA alterado em produção)

## 1. Como as contas funcionam hoje (verificado no código e no Supabase, só leitura)
- O lojista **não se regista**: o dono do sistema cria a conta (`super.js`, `formLojista`) escrevendo o e-mail do lojista e uma senha inicial, e envia-lhe os dados por WhatsApp. O e-mail **nunca foi verificado** (confirmação desativada): qualquer texto com forma de e-mail é aceite, incluindo erros de escrita.
- Não existe recuperação de senha. A única alteração é «Conta → Senha» (`updateUser`), que exige sessão iniciada e fica **separada** do que se propõe abaixo.
- Funcionários: e-mail + senha + código de acesso (PIN) no servidor (bloqueio após 5 falhas). O dono da loja redefine o PIN, mas não a senha.
- Não há Edge Functions no projeto (lista vazia) e `service_role` não existe no cliente — assim deve continuar.

## 2. O que «confirmação de e-mail desativada» significa — e não significa
- Controla só se um **registo novo** exige clicar numa ligação. Não impede enviar e-mails de recuperação.
- Consequência de a **reativar**: cada conta criada pelo dono do sistema (lojista ou funcionário) ficaria inutilizável até clicar na ligação; um e-mail mal escrito bloqueia a conta; o serviço de e-mail incluído no Supabase é de teste (≈4 mensagens/hora, má entrega — [fonte](https://makerkit.dev/docs/md/next-supabase-turbo/going-to-production/authentication)), por isso seria preciso SMTP próprio. E **por si só não cria recuperação nenhuma**. Não recomendo reativá-la.

## 3. Conhecer o e-mail NÃO prova a identidade
O endereço é visível para o dono do sistema e pode ser adivinhado ou conhecido de terceiros; nunca foi provado que quem o escreveu o possui. Qualquer desenho tem de provar o titular por outra via. As vias possíveis, e o que cada uma prova:

| Via | O que prova | Precisa de |
|---|---|---|
| Ligação enviada para o e-mail | Controlo da caixa de correio (mas o e-mail nunca foi verificado: se estiver errado, quem o recebe pode ser outra pessoa; se a caixa for comprometida, o atacante entra) | SMTP próprio, alteração à configuração de produção |
| Verificação humana pelo dono do sistema, fora da aplicação (chamada para o telefone registado, dados da loja) | Conhecimento do titular por quem o conhece pessoalmente | disciplina operacional |
| Segredo ligado ao dispositivo que fez o pedido | Que quem conclui é quem pediu (não o admin, não terceiros) | código novo |
| Código de verificação lido em voz alta | Que o pedido que o admin vê é o da pessoa com quem fala | código novo |
| Códigos de recuperação de uso único entregues no primeiro acesso | Posse de um segredo entregue ao titular antes do problema (prova real, sem e-mail) | código novo; o lojista tem de os guardar |

## 4. Propostas

### Opção A (recomendada para começar) — Recuperação assistida, sem e-mail
1. No ecrã de login, «Esqueci a senha»: o lojista escreve o e-mail. O telemóvel gera um **segredo aleatório de 256 bits que fica só nesse aparelho** (o servidor guarda apenas o hash) e mostra um **código de 6 dígitos**. A resposta é sempre a mesma exista ou não a conta (não revela que e-mails existem).
2. Se a conta existir e for de lojista, cria-se **um** pedido pendente (limites: 1 pedido pendente por conta, intervalo mínimo entre pedidos, limite global/hora) que expira em 24 h.
3. O dono do sistema vê o pedido numa área própria («Recuperações», com contador em tempo real como o suporte): loja, e-mail, hora. **Fora da aplicação** liga ao telefone registado do lojista, confirma a identidade e pede o código de 6 dígitos que está no ecrã dele. Só com esse código o botão **Aprovar** funciona (ou **Rejeitar**, com motivo).
4. Aprovado: o pedido fica válido **30 minutos**, uma única vez. O aparelho que fez o pedido (e só ele — tem o segredo) mostra «Defina a nova senha»; o lojista escreve a senha **no seu telemóvel**; esta segue por HTTPS para uma Edge Function do Supabase que verifica (aprovado, não expirado, segredo certo, não usado, tentativas ≤ 5), define a senha e **encerra todas as sessões** dessa conta.
5. O dono do sistema recebe o aviso do pedido e do resultado (pendente → aprovado/rejeitado → concluído/expirado) na mesma área e no histórico. **Nunca vê, recebe nem define a senha:** só decide; a senha existe apenas no aparelho do lojista e em trânsito para a função (não é gravada nem registada).
6. Auditoria: cada passo (pedido, aprovação/rejeição e por quem, conclusão, expiração, tentativas falhadas) vai para `auditoria_plataforma` (migração 10) e a conclusão também para a auditoria **da loja**, visível ao dono da loja.
Dependências em produção (todas exigem a sua autorização): nova migração 11 (tabela `recuperacoes_senha`, RPCs, RLS), **uma Edge Function** com a chave `service_role` interna do Supabase (nunca vai para o cliente, o APK ou o Windows). Alternativa sem Edge Function: escrever `auth.users.encrypted_password` por SQL — funciona na prática mas mexe em tabela interna do Auth, não é suportado e **não o consigo validar na réplica local**; não recomendo.

Como o sistema prova que quem conclui é o titular: (1) o dono do sistema verificou a pessoa fora da aplicação, (2) o código lido liga esse pedido àquela conversa, (3) só o aparelho com o segredo conclui, (4) uma só vez, em 30 minutos.

Riscos residuais (honestos):
- **A raiz da confiança passa a ser o dono do sistema.** Hoje ele não consegue entrar nas lojas; com esta opção, se for enganado (engenharia social) ou se a sua conta for comprometida, pode permitir a tomada de uma conta de lojista — um dono do sistema comprometido pode até criar o pedido no seu próprio aparelho e aprová-lo. Mitigações: ativar **MFA (TOTP) na conta do dono do sistema**; atraso configurável (p. ex. 1 h) entre a aprovação e a conclusão; sessões da conta revogadas; aviso gravado na auditoria da loja; lista de verificação para o admin.
- Se o lojista trocar de telemóvel/navegador entre o pedido e a conclusão, tem de fazer novo pedido.
- Pedidos de spam: limitados e não revelam contas, mas podem ocupar a lista; o dono do sistema pode rejeitar em bloco.

### Opção B — E-mail de recuperação do Supabase + aprovação do dono do sistema
Mantém uma prova independente do admin (caixa de correio), mas exige SMTP próprio e alterações à configuração de produção (SMTP, URLs de redireccionamento, modelo de mensagem), e os e-mails atuais nunca foram verificados. A aprovação do admin seria um filtro adicional, não a prova. O mais sólido tecnicamente se os e-mails forem reais; trabalhoso para si por telefone.

### Opção C — Códigos de recuperação de uso único
No primeiro acesso mostram-se 8 códigos (guardados com hash); o lojista guarda-os. Recuperar = um código + aprovação do admin (opcional). Prova real sem e-mail e sem confiar no admin; falha se o lojista os perder (então cai na Opção A). Pode somar-se à A depois.

### Recomendação
Começar por **A**, com MFA no dono do sistema e o atraso de 1 h ativos; acrescentar **C** como segunda via mais forte quando quiser reduzir a dependência do admin. Só optar pela B se os e-mails dos lojistas passarem a ser reais e verificados.

## 5. Separação da alteração normal de senha
A recuperação usa tabela, RPCs e função próprias; não toca em `updateUser`. «Conta → Senha» continua só para quem tem sessão. (Nota: essa alteração hoje não pede a senha atual; é uma decisão à parte se a quer pedir.)

## 6. Decisões de que preciso
1. Opção A, B, C (ou A+C)?
2. Autoriza uma Edge Function com a chave interna do Supabase, depois de a migração 10 estar aplicada (a 11 depende da auditoria da 10)?
3. Atraso entre aprovação e conclusão: 0, 1 h ou 24 h?
4. Âmbito: só lojistas (dono da loja)? Os funcionários continuariam a ser redefinidos pelo dono da loja (hoje só o PIN).
5. Ativa MFA (TOTP) na conta do dono do sistema? (Definição do Supabase, feita por si.)

## 7. O que farei depois da decisão (sem produção)
Migração 11 + Edge Function + ecrãs, testes na réplica local (aprovação/rejeição, expiração, reutilização, segredo errado, 5 tentativas, ataque com e-mail conhecido, utilizador comum a aprovar, isolamento, auditoria, que a senha nunca fica em tabelas nem registos) e testes de navegador com cliente simulado. A parte da Edge Function só poderá ser testada com simulações, até haver um projeto Supabase de teste.

# Termos de utilização e Política de privacidade (02/11/2026)

Implementação: `www/legal.js`. Testes: `tests/legal.test.js` (inclui a Ajuda por cargo).

- **Só dois documentos:** «Termos de utilização» e «Política de privacidade». Não existe «Contrato» em nenhum sítio da app.
- **Onde aparecem:** nunca no ecrã de entrada. Aparecem (1) uma vez, no primeiro acesso depois de a conta existir, num ecrã com as duas ligações, a caixa «Li e concordo» e o botão «Avançar» (dono, gerente e caixa; o administrador do sistema não); (2) em «Conta», para ler quando quiserem.
- **Consentimento:** versão + data/hora em `user_metadata` do Supabase Auth (`termos_versao`, `termos_em`), mais cópia no aparelho (funciona sem internet e sincroniza depois). Não repete em cada entrada; só volta a pedir se `VERSAO` mudar (alteração relevante). A versão manteve-se em `2026-11-01`: quem já tinha aceitado não é incomodado.
- **Conteúdo verificado contra o sistema:** dados da conta (nome, e-mail, cargo, foto, último acesso, código de acesso só como hash), loja (nome, tipo, NUIT, telefone, endereço, subscrição, comprovativos), atividade (produtos, stock, fotografias, vendas, clientes, despesas, fechos, notificações, auditoria), suporte, cópia local no aparelho, câmara (códigos de barras e fotografia de produto), Supabase (Europa), GitHub/alojamento web, tipos de letra da Google e consulta de versões ao GitHub (veem o IP), sem ferramentas de análise (confirmado por pesquisa no código).
- **Removido por não ser prática do sistema:** retenção de 90 dias, reembolsos, limite de responsabilidade e renovação — o sistema não os aplica. Se quiser tê-los, são decisões comerciais a incluir depois.
- **Contacto:** funcionários → dono da loja; dono → separador «Suporte». `CONTACTO` em `legal.js` fica vazio até o responsável indicar um e-mail ou telefone público.
- **Aviso:** texto de boa-fé; convém revisão por um advogado em Moçambique antes de vender amplamente.

## Atualização 03/11/2026 (versão 1.1.1)
- Política de privacidade reescrita sem nomes de marcas nem termos técnicos: resumo inicial, dados e finalidade, câmara, destinatários (categorias de fornecedores, incluindo o endereço IP), quem vê o quê, proteção, conservação e direitos. `VERSAO` mantém-se em `2026-11-01` (clarificação, não alteração relevante): ninguém é obrigado a aceitar de novo.
- Corrigido: tocar no X dos Termos/Privacidade (em «Conta») abria «Novo funcionário». Causa: o ecrã «Equipa» deixava um `onclick` no `<main>` que apanhava qualquer botão `.link`; cada ecrã novo passa a ter um `<main>` limpo e o manipulador só aceita botões com `data-id`.

## Atualização 2026-11-04 (atividade das lojas)
- A política passou a dizer que se regista **quando a app está aberta, a versão e a plataforma** (sem vendas nem valores) e que a administração vê se a loja usou a app. Registos diários apagados aos 90 dias.
- `VERSAO` dos textos = `2026-11-04`: todos os utilizadores de loja voltam a aceitar uma vez (alteração relevante à privacidade).

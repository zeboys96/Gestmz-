# Verificação facial (Android, web, computador) — opções para aprovação (NADA integrado, nenhum custo assumido)

## 1. Antes de tudo: o que a verificação facial prova e o que não prova
- **Vivacidade** prova que há uma pessoa viva diante da câmara (e não uma fotografia, um vídeo ou uma máscara).
- **Comparação** prova que a pessoa de agora é a mesma que a da referência.
- **Nenhuma prova que a referência pertence ao titular legítimo.** Hoje o lojista não se regista sozinho: o dono do sistema cria a conta e envia a senha inicial por WhatsApp; o lojista preenche nome e loja no primeiro acesso. Quem receber essa senha primeiro poderia registar **o seu próprio rosto** na conta de outrem. A âncora de confiança real é o canal onde o dono do sistema entrega o acesso. Para a reforçar: (a) o dono do sistema só entrega a senha inicial à pessoa que conhece/verificou; (b) opcionalmente, verificação de **documento de identificação + selfie** por um fornecedor (não incluída em todas as opções); (c) o registo da referência passa a exigir um **convite de uso único** gerado pelo dono do sistema e entregue à pessoa certa.
- Logo: a verificação facial **reduz** o risco na recuperação (impede alguém com a senha inicial ou o e-mail de se passar pelo titular) mas **não o elimina**.

## 2. Opções analisadas (preços só de fontes oficiais, consultados hoje)
| | A1 — Amazon Rekognition (Face Liveness + CompareFaces) | A2 — Sumsub (verificação completa) | Outros (Veriff, Persona, Onfido…) |
|---|---|---|---|
| Preço | Liveness **$0,015 por verificação** (até 500 mil); comparação **$0,001 por imagem**; livre: 1000 imagens/mês de comparação nos primeiros 12 meses; **sem nível gratuito de liveness** listado ([AWS](https://aws.amazon.com/rekognition/pricing/?z=3)) | Plano Basic **$1,35 por verificação, mínimo $149/mês**; teste 14 dias com 50 verificações ([Sumsub](https://sumsub.com/pricing/)) | **Não verificado** (preços não consultados em fonte oficial) |
| Documento + selfie | Não (só rosto) | Sim | Sim (em geral) |
| Resultado verificável no servidor | Sim: o nosso servidor cria a sessão e lê o resultado diretamente da AWS (não aceita o do navegador) | Sim (webhook/API) | a verificar |
| Android / web / computador | SDKs web, Android e iOS (segundo a documentação AWS — **não confirmada nesta sessão**); computador: sem SDK nativo; teria de usar o componente web dentro do Electron (**por testar**) | SDK/WebSDK | a verificar |
| Offline | **Impossível** em todas | idem | idem |
| Onde se tratam os dados | Regiões AWS (confirmar se alguma serve África); dados saem de Moçambique | UE/EUA conforme contrato | a verificar |
| Retenção de imagens | **A confirmar** na documentação da AWS | **A confirmar** | a verificar |
| Custo para ~100 recuperações/mês | ≈ $1,6/mês + infraestrutura AWS (conta, identidade, função) | $149/mês (mínimo) | — |
Fonte-limite: várias páginas oficiais (documentação AWS de liveness, retenção, regiões) **não foram acessíveis** nesta sessão; por isso essas linhas ficam «a confirmar» e não devem ser tratadas como factos.

## 3. Enquadramento legal
A lei moçambicana de proteção de dados pessoais, segundo fonte consultada ([PLMJ](https://www.plmj.com/en/knowledge/informative-notes/Mozambique-Personal-Data-Protection-Bill/34166/)), estava em **proposta**; **não confirmei** que esteja em vigor nem como trata dados biométricos. Os dados biométricos são sensíveis em quase todos os regimes: precisa de **consentimento expresso**, finalidade restrita (recuperação), prazo de retenção definido, direito de eliminação, aviso de que são tratados por terceiro no estrangeiro, e **aconselhamento jurídico** antes de avançar.

## 4. Arquitetura segura (qualquer fornecedor)
1. A app pede ao **nosso servidor** (Edge Function) uma sessão de verificação ligada a **conta + pedido de recuperação + utilizador + aparelho**, com validade curta e uso único.
2. O navegador/app só captura com o SDK do fornecedor (câmara frontal aberta diretamente, sem galeria).
3. O **servidor** pede o resultado ao fornecedor com o identificador da sessão e só então grava «aprovado/recusado» no pedido. Uma resposta fabricada no navegador não serve, porque o servidor nunca a lê.
4. Não se guardam fotografias em tabelas da app: guarda-se o identificador da referência no fornecedor (tabela fechada por RLS) e o resultado; a imagem fica onde o fornecedor a mantiver, com retenção definida.
5. Limites: 3 tentativas por pedido, nova sessão a cada tentativa, bloqueio e **via alternativa** (caminho A com verificação humana e 24 h) para falsos negativos, câmara avariada ou quem não consiga concluir.
6. Fica registado na auditoria: pedido, resultado, nº de tentativas — sem imagens.

## 5. Desenho no registo e na recuperação
- **Registo (primeiro acesso, depois dos campos atuais nome e loja):** passo extra de captura com vivacidade; o servidor cria a referência. Obrigatório para novos donos **se** a opção escolhida o permitir; **donos existentes não são afetados** (podem registar a referência depois).
- **Recuperação:** pedido → verificação facial contra a referência → o servidor liga o resultado ao pedido exato → ainda é preciso a aprovação do superadministrador (A) ou um código de recuperação (C); só então o titular define a senha. A verificação facial é **um fator adicional**, não substitui a aprovação.
- O superadministrador nunca recebe imagens nem a senha.

## 6. Dependências e riscos
- Conta e faturação no fornecedor (custos recorrentes), segredos guardados no Supabase (nunca no cliente), Edge Functions, migração para as tabelas fechadas, política de privacidade e consentimento.
- No APK (Capacitor): a câmara frontal em WebView exige permissão e testes em telemóveis reais; um SDK nativo exigiria desenvolver um plugin (trabalho grande).
- Falsos negativos (iluminação, rosto, câmara baixa) afetam sobretudo telemóveis modestos: a via alternativa é obrigatória.
- Não pode ser testado de ponta a ponta sem conta do fornecedor, aparelho Android e Windows reais.

## 7. Recomendação
Primeiro implementar e validar **A + C** (sem biometria). Depois, se mantiver o interesse, avaliar **A1** como terceiro fator **apenas na recuperação** (custo baixo, controlo nosso), com consentimento e parecer jurídico, e decidir sobre documento+selfie (A2) só se o risco de registo com rosto alheio for inaceitável (custo mínimo $149/mês). Não aprovei nem iniciei nenhuma integração.

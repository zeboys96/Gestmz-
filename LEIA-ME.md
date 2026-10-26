# GestMZ — gestão empresarial de comércios em Moçambique

Vendas, stock, validades, equipa e assinaturas para farmácias, mercearias, supermercados e outros comércios. Funciona no telemóvel e no computador, com banco de dados na nuvem (Supabase). Cada loja vê apenas os seus dados.

## Como o acesso funciona

Não há registo público. Só entra quem recebeu acesso.

| Quem | Como recebe acesso | Como entra |
|---|---|---|
| **Dono do sistema (você)** | Cria a conta uma única vez em *Configurar o dono do sistema* | E-mail e senha |
| **Lojista** | Você cria a conta em *Lojas → + Novo lojista* (e-mail e senha) e envia-lhe os dados | E-mail e senha. No primeiro acesso preenche o seu nome, o nome da loja, o tipo e a localização |
| **Gerente / caixa** | O lojista cria em *Equipa → + Novo funcionário* (nome, e-mail, senha, cargo e **código de acesso** de 6 a 10 números) | E-mail e senha; depois aparece o nome, a foto e o cargo, e digita o código de acesso |

O ecrã de entrada é igual para todos. O sistema reconhece o cargo e abre o painel certo.

## O que cada cargo vê

- **Dono do sistema:** lojas (nome, tipo, localização, telefone e e-mail do lojista), pagamentos e suporte. Não vê produtos, stock, clientes, vendas nem a equipa das lojas.
- **Lojista (dono da loja):** tudo da sua loja, incluindo a actividade do gerente e dos caixas, a assinatura e o suporte.
- **Gerente:** vende, gere produtos e stock, vê relatórios e a actividade dos **caixas**. Não vê o dono, a assinatura nem o suporte.
- **Caixa:** só vende, consulta produtos e vê as **suas** vendas. Para retirar um item ou anular uma venda precisa do e-mail e da senha de um gerente.

## Produtos: embalagem e unidade

Registe o produto uma só vez, em *Produtos → + Novo produto*:

1. **Informações:** nome, categoria (lista com pesquisa; pode criar uma nova na hora), descrição.
2. **Como vende:** *Só por unidade* ou *Embalagem e unidade*. No segundo caso indique o nome da embalagem (caixa, pacote, fardo…), as unidades em cada uma e os códigos de barras da embalagem e da unidade (ou gere um código interno).
3. **Preços (MT):** custo e preço da embalagem, e preço de cada unidade. O custo por unidade e a margem são calculados; o preço da unidade é sempre o que você definir (o sistema só sugere).
4. **Stock inicial:** embalagens fechadas e unidades soltas. O stock conta-se em unidades (5 caixas de 20 = 100), mas a app mostra sempre quantas são **caixas fechadas** e quantas são **soltas**.

**Venda de unidades:** vendem-se primeiro as soltas; só quando faltam é que se abre uma caixa, e só as necessárias (5 caixas de 20, vende 3 → 4 caixas fechadas + 17 soltas = 97). Com 17 soltas, vender 5 não abre nada. Abrir caixa não altera o stock total: fica registado no *Registo* como «abertura». **Venda de embalagem:** só sai de caixas fechadas; se não houver, a app avisa para vender unidades ou dar entrada de caixas. Se a venda falhar, nada fica a meio. Anular a venda devolve as caixas como caixas e as unidades como soltas.

No caixa, ler o código da embalagem vende a embalagem inteira ao preço dela; ler o código da unidade vende 1. Um código nunca pode identificar duas apresentações (o sistema recusa repetições). Cada venda guarda o nome, a apresentação, o preço e as unidades, por isso o histórico não muda se os preços mudarem depois.

As categorias iniciais dependem do tipo de loja (mais de 40 para qualquer comércio e mais 14 para farmácias e clínicas). Em *Produtos → Categorias* pode criar, editar, pesquisar e apagar.

## Primeiros passos (uma única vez)

1. **Supabase → Authentication → Sign In / Providers → Email:** desligue **Confirm email**. Sem isto as contas criadas não conseguem entrar.
2. Abra a app e toque em **Configurar o dono do sistema**. Faça isto antes de dar o endereço a alguém: só a primeira pessoa pode criar esta conta.
3. Em **Preços e conta**, confirme o titular, o número de recebimento e os preços (os valores iniciais são exemplos).
4. Em **Lojas → + Novo lojista**, crie a conta de cada cliente. A app mostra a mensagem pronta (endereço, e-mail e senha) para copiar ou enviar por WhatsApp.

## Recibos: imprimir, PDF e partilhar

Depois de cada venda (e em *Vendas → Ver*) abre o recibo com **Imprimir recibo**, **Guardar em PDF** e **Partilhar**. O recibo usa sempre os dados guardados na venda (preços do momento) e não mexe em stock nem em pagamentos.

- **Papel:** 58 mm ou 80 mm (impressoras térmicas) ou A4, na caixa «Papel» do recibo; a escolha fica guardada neste aparelho.
- **Computador e Chrome do telemóvel:** *Imprimir recibo* abre o diálogo de impressão do navegador (que também permite «Guardar como PDF»). Não é preciso ter impressora ligada. Imprime-se só o recibo.
- **PDF:** *Guardar em PDF* cria `recibo-NNNNN.pdf` (loja, NUIT, contactos, número, data, operador, produtos, quantidades, preços, desconto, IVA, total, pagamento e mensagem final) e guarda-o nas Transferências. *Partilhar* abre a partilha do aparelho (WhatsApp, e-mail…); se o aparelho não partilha ficheiros, guarda o PDF.
- **Aplicação Android (APK):** o ecrã interno do Android **não tem janela de impressão** (por isso o botão não respondia). No APK, *Imprimir recibo* gera o PDF e abre a folha de partilha do Android, onde se escolhe imprimir, guardar ou enviar. Para isto é preciso **gerar um APK novo** (Actions → Gerar APK), que já inclui os plugins Share e Filesystem.
- A impressão directa em impressoras Bluetooth/USB depende do navegador e do serviço de impressão do Android; a app não envia comandos ESC/POS.

## Assinatura

O lojista abre **Assinatura**, escolhe o plano, transfere para o número indicado, anexa a foto do comprovativo (ficheiro ou câmara) e envia. O dono do sistema recebe o aviso, confere e confirma. Quando a validade termina, a loja só consegue consultar dados até renovar.

## Suporte

O lojista abre **Suporte** e escreve uma dúvida, sugestão ou problema. O dono do sistema recebe o aviso, responde e a conversa fica registada.

## Ícone e arranque da aplicação Android

O Capacitor cria a pasta `android/` de raiz em cada compilação, por isso, sem este passo, o APK saía sempre com o ícone e o splash padrão do Capacitor. A compilação agora corre `resources/aplicar-android.py`, que aplica o logótipo do GestMZ (o mesmo de `www/icon.svg`): ícone normal, redondo e adaptativo (barras amarelas sobre verde #00453A), splash verde com o logótipo (Android 12+ e anteriores) e fundo verde até a interface carregar. Se o modelo do Capacitor mudar, o script falha e a compilação pára, em vez de gerar um APK com o ícone errado. Para trocar o logótipo: altere as cores/desenho em `resources/gerar-icones.js`, corra `node resources/gerar-icones.js` e faça commit.

O `supabase.js` é guardado dentro da aplicação durante a compilação (APK e site), e as fontes carregam em segundo plano, para a abertura não ficar parada à espera da internet. O identificador `mz.gestmz.app` e o nome «GestMZ» não foram alterados.

## Versões e atualizações (Android e Windows)

A versão é uma só, em `package.json` (`x.y.z`). O `versionCode` do Android é calculado (1.2.3 → 10203). Para subir de versão altere `package.json`, `desktop/package.json` e `www/versao.js` e corra `node scripts/verificar-versoes.js`, que falha se estiverem diferentes.

- **Web (Vercel):** sem alterações; atualiza-se sozinha.
- **Android:** a app consulta `www/versions.json` (no ramo `main`) e avisa quando há versão nova. O Android não deixa instalar em silêncio: a app abre a transferência do APK da Release e o utilizador toca para instalar. Os dados mantêm-se **se o APK novo tiver a mesma assinatura**. Por isso a versão de produção é assinada com uma chave permanente guardada nos segredos do GitHub (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). **Guarde cópias dessa chave fora do GitHub: sem ela não há atualizações por cima.** O primeiro APK assinado com a chave nova exige desinstalar uma vez o APK de teste atual (sincronize antes as vendas pendentes).
- **Windows:** aplicação Electron (`desktop/`), instalador NSIS por utilizador, atualização com `electron-updater` a partir das Releases. Sem certificado de assinatura de código o Windows mostra o aviso SmartScreen.
- **Preparar uma versão:** Actions → **Preparar versão** → *teste* (só artefactos) ou *candidata* (APK assinado + instalador + rascunho de Release, depois de aprovação no ambiente `aprovacao-release`; configure aí os *Required reviewers*). Nada é publicado sozinho.
- **Publicar:** abra o rascunho, teste os instaladores, carregue em *Publish release*. Só depois gere a proposta com `scripts/atualizar-versions.js` e faça commit de `www/versions.json`: é isso que faz as apps avisarem.
- **Reverter:** a versão não desce. Publique uma versão nova (número maior) com o código bom, ou ponha `bloquear: true`/`minima` em `versions.json` para forçar a atualização.

## Instalar no telemóvel

Abra o endereço no Chrome, toque nos três pontos e escolha **Instalar aplicação**. Para um ficheiro APK, no GitHub abra *Actions → Gerar APK → Run workflow*.

## Limites a conhecer

- **Vendas sem internet:** o aparelho guarda uma cópia dos produtos, do stock e dos clientes. Sem ligação, gerente e caixa continuam a vender (a app pede o código de acesso, verificado no próprio aparelho). As vendas ficam numa fila, aparecem no aviso «Sem internet · N venda(s) por enviar» e seguem sozinhas quando a ligação volta, sem duplicar. A venda guarda a hora em que foi feita (até 7 dias). Se o servidor recusar uma (por exemplo, o stock acabou entretanto noutro caixa), ela fica marcada com o motivo para o dono decidir. O stock é partilhado: dois caixas offline podem vender a mesma última unidade. Para abrir a app sem internet é preciso ter entrado uma vez com internet neste aparelho; ao sair, a cópia local é apagada.
- **O código de acesso é verificado no servidor.** Sem ele, o servidor não mostra nem altera nada do gerente ou do caixa, mesmo a quem sabe o e-mail e a senha. Vale 12 horas por sessão. Para autorizar uma acção do caixa, o gerente escreve e-mail, senha e o seu código (o dono não tem código).
- **Esqueceu a senha?** O funcionário pode mudar a senha em *Conta*. Se perdeu o acesso, o dono remove-o e cria de novo (o e-mail fica livre).
- **Plano gratuito do Supabase** pausa o projecto após cerca de uma semana sem uso. Com lojas a pagar, passe ao plano pago.
- **Pagamentos** são confirmados à mão. Pagamento automático por M-Pesa/e-Mola exige contrato com a operadora.
- A câmara lê códigos no Chrome do Android. O leitor USB ou Bluetooth funciona em qualquer navegador.
- **Etiquetas:** em *Produtos → Etiquetas* imprime códigos de barras (Code 128) de 50 × 30 mm da unidade ou da embalagem, com nome e preço. Se o produto não tem código, a app gera um interno e guarda-o. O tamanho do papel escolhe-se na janela de impressão.
- Os valores de IVA são indicativos. Confirme o enquadramento fiscal com o seu contabilista.

## Ficheiros

- `www/` — a aplicação (é a pasta publicada)
- `www/config.js` — endereço e chave pública do Supabase
- `supabase/schema.sql` — base de dados completa (versão actual)
- `supabase/migracao_05_*.sql`, `migracao_06_*.sql`, `migracao_07_*.sql`, `migracao_08_*.sql` e `migracao_09_*.sql` — as últimas alterações, já aplicadas ao projecto Gestmz

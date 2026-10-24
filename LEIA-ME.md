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
4. **Stock inicial:** embalagens fechadas e unidades soltas. O stock conta-se em unidades (5 caixas de 20 = 100).

No caixa, ler o código da embalagem vende a embalagem inteira ao preço dela; ler o código da unidade vende 1. Um código nunca pode identificar duas apresentações (o sistema recusa repetições). Cada venda guarda o nome, a apresentação, o preço e as unidades, por isso o histórico não muda se os preços mudarem depois.

As categorias iniciais dependem do tipo de loja (mais de 40 para qualquer comércio e mais 14 para farmácias e clínicas). Em *Produtos → Categorias* pode criar, editar, pesquisar e apagar.

## Primeiros passos (uma única vez)

1. **Supabase → Authentication → Sign In / Providers → Email:** desligue **Confirm email**. Sem isto as contas criadas não conseguem entrar.
2. Abra a app e toque em **Configurar o dono do sistema**. Faça isto antes de dar o endereço a alguém: só a primeira pessoa pode criar esta conta.
3. Em **Preços e conta**, confirme o titular, o número de recebimento e os preços (os valores iniciais são exemplos).
4. Em **Lojas → + Novo lojista**, crie a conta de cada cliente. A app mostra a mensagem pronta (endereço, e-mail e senha) para copiar ou enviar por WhatsApp.

## Assinatura

O lojista abre **Assinatura**, escolhe o plano, transfere para o número indicado, anexa a foto do comprovativo (ficheiro ou câmara) e envia. O dono do sistema recebe o aviso, confere e confirma. Quando a validade termina, a loja só consegue consultar dados até renovar.

## Suporte

O lojista abre **Suporte** e escreve uma dúvida, sugestão ou problema. O dono do sistema recebe o aviso, responde e a conversa fica registada.

## Instalar no telemóvel

Abra o endereço no Chrome, toque nos três pontos e escolha **Instalar aplicação**. Para um ficheiro APK, no GitHub abra *Actions → Gerar APK → Run workflow*.

## Limites a conhecer

- **Precisa de internet** para vender (o stock é partilhado entre os caixas). Venda sem internet com sincronização seria uma fase seguinte.
- **O código de acesso é uma segunda confirmação no aparelho**, não uma segunda autenticação no servidor: quem tem o e-mail e a senha de um funcionário consegue chamar o servidor sem o código. Por isso o dono deve dar senhas diferentes a cada um e removê-lo quando sair.
- **Esqueceu a senha?** O funcionário pode mudar a senha em *Conta*. Se perdeu o acesso, o dono remove-o e cria de novo (o e-mail fica livre).
- **Plano gratuito do Supabase** pausa o projecto após cerca de uma semana sem uso. Com lojas a pagar, passe ao plano pago.
- **Pagamentos** são confirmados à mão. Pagamento automático por M-Pesa/e-Mola exige contrato com a operadora.
- A câmara lê códigos no Chrome do Android. O leitor USB ou Bluetooth funciona em qualquer navegador.
- Impressão de etiquetas com o código interno ainda não existe: gere o código, copie-o ou imprima-o à parte.
- Os valores de IVA são indicativos. Confirme o enquadramento fiscal com o seu contabilista.

## Ficheiros

- `www/` — a aplicação (é a pasta publicada)
- `www/config.js` — endereço e chave pública do Supabase
- `supabase/schema.sql` — base de dados completa (versão actual)
- `supabase/migracao_05_*.sql` e `migracao_06_*.sql` — as duas últimas alterações, já aplicadas ao projecto Gestmz

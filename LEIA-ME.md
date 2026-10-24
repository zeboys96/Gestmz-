# GestMZ — gestão empresarial para farmácias e lojas

Sistema de vendas, stock, validades, equipa e assinaturas, feito para Moçambique. Funciona no telemóvel e no computador, com banco de dados na nuvem (Supabase). Cada loja vê apenas os seus próprios dados.

## O que já vem pronto

**Para o dono do sistema (você)**
- Painel com todas as lojas, estado (teste, ativa, expirada, suspensa) e dias que faltam.
- Aviso quando uma loja envia comprovativo de pagamento. Vê a imagem e carrega em **Confirmar**; a loja fica com acesso mensal, trimestral ou anual.
- Preços dos planos e número de recebimento (e-Mola, M-Pesa ou mKesh) editáveis a qualquer momento.
- Pode dar 30 dias grátis, suspender ou reativar uma loja.

**Para cada loja**
- Perfis: dono, gerente e caixa, cada um com utilizador, senha e foto.
- Caixa: leitor de código de barras (USB/Bluetooth) ou câmara do telemóvel, recibo imprimível, M-Pesa, e-Mola, mKesh, cartão, transferência e fiado.
- Produtos com categorias numa lista (25 já criadas, e pode criar mais na hora).
- Caixa fechada e unidade: o pacote tem um código, a caixa tem outro. Ler a caixa na entrada de stock soma as unidades; ler o pacote no caixa vende 1.
- Stock por lote e validade. Vende primeiro o que expira primeiro e nunca vende lotes expirados.
- O caixa não apaga nada sozinho: retirar um item ou anular uma venda exige o utilizador e a senha do gerente. Tudo fica no Registo.
- Painel do dono: quem vendeu hoje, quem está a trabalhar agora, vendas, lucro, stock a acabar e validades.
- O stock actualiza em todos os caixas ao mesmo tempo.
- Apresentação "Como funciona" no primeiro uso e página de Ajuda.

## Primeiros passos (uma única vez)

1. **Desligue a confirmação por e-mail no Supabase.** Em supabase.com abra o projecto Gestmz, vá a *Authentication → Sign In / Providers → Email* e desligue **Confirm email**. Guarde. Sem isto, os funcionários não conseguem entrar.
2. Abra o endereço da app. No ecrã de entrada toque em **Configurar o dono do sistema** e crie a sua conta. Faça isto logo, antes de dar o endereço a alguém: só a primeira pessoa pode criar esta conta.
3. Em **Preços e conta**, confirme o nome e o número de recebimento e ajuste os preços (os valores iniciais são exemplos).
4. Distribua o endereço às lojas. Cada dono toca em **Registar a minha loja** e tem teste grátis.

## Como uma loja trabalha

1. O dono regista a loja e vê o **código da loja** (5 números) em *Equipa*.
2. Em *Equipa → Novo funcionário*, cria os gerentes e caixas.
3. Os funcionários entram no separador **Funcionário** com o código da loja, o seu utilizador e a senha.
4. Em *Produtos → Novo produto*, regista cada produto. Para vender também por caixa, marque a opção e indique o código da caixa, as unidades por caixa e o preço da caixa.
5. Em *Produtos → Entrada de stock*, passe o leitor no código da caixa ou do pacote e indique a quantidade, o lote e a validade.

## Assinatura

O dono da loja abre **Assinatura**, escolhe o plano, transfere para o número indicado, anexa a foto do comprovativo e envia. O dono do sistema recebe o aviso, confere e confirma. Quando a validade termina, a loja só consegue consultar dados até renovar.

## Instalar no telemóvel

Abra o endereço no Chrome, toque nos três pontos e escolha **Instalar aplicação**. Para um ficheiro APK, no GitHub abra *Actions → Gerar APK → Run workflow* e descarregue o resultado.

## Limites a conhecer

- **Precisa de internet** para vender, porque o stock é partilhado entre todos os caixas. A app abre sem internet, mas não regista vendas. Vendas sem internet, com sincronização depois, seriam uma fase seguinte.
- **Plano gratuito do Supabase pausa o projecto** depois de cerca de uma semana sem uso e tem limites de armazenamento. Com lojas a pagar, passe o projecto ao plano pago do Supabase.
- **Confirmação de pagamentos é manual.** Pagamento automático por M-Pesa ou e-Mola exige contrato com a operadora.
- **Esqueceu a senha?** O funcionário pode mudar a senha em *Conta* enquanto tem sessão. Se já perdeu o acesso, retire-lhe o acesso em *Equipa* e crie um novo utilizador.
- A câmara só lê códigos em navegadores que suportam essa função (Chrome no Android funciona). O leitor USB ou Bluetooth funciona em qualquer um.
- Os valores de IVA são indicativos. Confirme o enquadramento fiscal com o seu contabilista.

## Ficheiros

- `www/` — a aplicação (é a pasta que é publicada)
- `www/config.js` — endereço e chave pública do Supabase
- `supabase/schema.sql` — o banco de dados, já aplicado ao projecto Gestmz

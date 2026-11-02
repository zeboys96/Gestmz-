# GestMZ — APK de testes (31/10/2026): o que é, como instalar e o que testar

**Não é uma versão de produção.** É um APK de *depuração* gerado pelo GitHub Actions (`versao.yml`, modo teste) a partir do ramo `desenvolvimento/atualizacoes`. Nada foi publicado, nenhuma atualização foi ativada, nenhuma migração foi aplicada na base de dados real.

## Identificação
- Pacote `mz.gestmz.app` · versão `1.1.0` · número de compilação (versionCode) `10100`. O próprio workflow confere estes três valores com `aapt2` e falha se não baterem.
- Assinatura: **chave de depuração efémera**, criada de novo em cada execução do GitHub. O SHA-256 do certificado aparece no resumo de cada execução («Certificado do APK de teste») e no ficheiro `…apk.certificado.txt` dentro do artefacto.

## Compatibilidade com o APK já instalado — NÃO CONFIRMADA (expectativa: incompatível)
O APK instalado foi gerado pelo `apk.yml`, também com chave de depuração criada nessa execução. Não tenho acesso ao seu telemóvel nem consigo descarregar artefactos deste ambiente, por isso **não consegui comparar os certificados**. A expectativa é que sejam diferentes. Consequências:
- Instalar por cima: o Android recusa («App não instalada») **sem apagar nada**. A app antiga fica intacta.
- A única forma de ter este APK no mesmo telemóvel é desinstalar a app atual, o que **apaga os dados locais, incluindo vendas pendentes**. Só depois do «antes de desinstalar» abaixo.

## Opções (decida)
1. **Instalar noutro telemóvel** (ou um telemóvel de teste): zero risco para o telemóvel principal. Recomendado.
2. **Mesmo telemóvel, depois de proteger os dados**: seguir «Antes de desinstalar».
3. **Variante lado a lado** (pacote `mz.gestmz.app.teste`, instala-se ao lado da app atual, sem tocar nela, com dados separados): permite testar hoje sem desinstalar nada. **Não está feita**: muda o identificador do pacote (que pediu para confirmar como `mz.gestmz.app`) e eu não consigo ler os registos do GitHub para depurar um erro de compilação. Posso preparar se autorizar.

## Antes de desinstalar a app atual (só opção 2)
1. Com Internet, entre com cada conta usada no aparelho e deixe as vendas sincronizarem até **0 pendentes**.
2. Confirme no painel web (outro aparelho) que as últimas vendas aparecem.
3. Se ainda houver pendentes que não consegue sincronizar: **não desinstale**. (A cópia só existe na app NOVA; a app instalada hoje não a tem — por isso a cópia ajuda nas passagens futuras, não nesta.)
4. Só então desinstalar e instalar o APK de teste.

## Como instalar (telemóvel de teste)
1. No telemóvel, abra o link da execução (GitHub exige sessão iniciada), toque no artefacto `GestMZ-android-1.1.0-` e descarregue o zip.
2. Extraia o zip; instale `GestMZ-1.1.0-android-teste.apk` (permita «instalar apps desconhecidas» ao navegador/ficheiros, só para esta instalação).
3. Compare o SHA-256 do ficheiro (`…apk.sha256`) com o ficheiro `.sha256` do zip, se tiver uma app que o calcule.

## O que testar pessoalmente (a base de dados real continua SEM as migrações 10, 12 e 15)
- Entrar como administrador, dono, gerente e caixa. O PDV, vendas, anular venda, stock, validades, leitor de código de barras/câmara, recibos (imprimir/partilhar PDF).
- **Sem Internet**: vender, ver «por enviar», voltar a ligar e confirmar que enviou sem duplicar.
- **Conta → «Cópia das vendas por enviar»**: *Guardar cópia* deve abrir a folha de partilha do Android (guarde no Drive/WhatsApp/e-mail). Faça com uma venda de teste feita offline; depois *Restaurar de um ficheiro* (num aparelho/conta onde essa venda já não esteja). **Corrigi hoje a forma de gravar o ficheiro na app, mas isto nunca foi testado num telemóvel real: é o teste mais importante.**
- Exportar CSV nos relatórios (usa o mesmo mecanismo de partilha).
- Gerente: **neste momento ainda vê custos/despesas se consultar diretamente a base de dados** (as proteções estão na migração 12, não aplicada). A interface já esconde despesas e lucro ao gerente e ao caixa.
- O cartão «Autenticador» **não aparece** (depende da migração 15). É o esperado.

## Problemas conhecidos e limitações
- Compatibilidade de assinatura por confirmar; instalação por cima provavelmente impossível.
- Cópia/restauro de vendas, partilha de ficheiros, câmara e instalação nunca validados num telemóvel real; Windows também não.
- A app nova funciona com a base de dados atual (verificado: só faltam em produção as funções das migrações 10/12/15, e a app tem retorno para cada uma), mas **apps antigas deixam de funcionar bem se a migração 12 for aplicada antes de todos terem a app nova**.
- Descarga automática e atualizações automáticas da app não estão ativadas.

## O que não está pronto para produção
Migrações 10, 12 e 15 (e 11/13/14) por rever e autorizar; chave Android definitiva por criar; Edge Function `recuperar-totp` por publicar; ensaio real do TOTP e da recuperação num projeto Supabase de teste; remoção do gatilho `push:`; merge e Release.

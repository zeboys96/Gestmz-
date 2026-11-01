# Novidades da migração 16 — stock zero, fotografias, notificações e fecho de caixa

Estado: **código no ramo `desenvolvimento/atualizacoes`. Migrações 10 e 16 APLICADAS em produção em 01/11/2026 (autorizadas pelo dono, com backup prévio e verificação depois); migração 12 NÃO aplicada; nenhuma função publicada; nada fundido em `main`.**
«Simulação» = Chromium com cliente Supabase simulado, ou Postgres 16 local descartável. Não é o Supabase real nem um telefone.

## 1. O que foi feito

| Pedido | Como | Onde |
|---|---|---|
| Produto sem stock some da lista do caixa | `produtos_venda()` (servidor) só devolve produtos com stock **vendável** (lotes fora de validade não contam); sem custos, mínimos, lotes ou validades. `produto_por_codigo()` diz «sem stock» (≠ «não encontrado»). `registar_venda` já recusava vender sem stock. Reposição → reaparece na próxima leitura (a app relê a lista ao vender, ao repor e em tempo real). O produto **não é apagado**; dono e gerente continuam a vê-lo. | migração 16 §2; `www/core.js` (`lerProdutos`), `www/loja.js` (PDV) |
| Retirar artigos do carrinho sem gerente | Retirar, diminuir e corrigir quantidades deixaram de pedir autorização. **Anular venda concluída continua a exigir o gerente** (e `anular_venda` continua imposta no servidor). | `www/loja.js` |
| Fotografias | Dono: tirar (câmara abre direta), escolher da galeria, ver antes de guardar, substituir, remover. Compressão e redimensionamento no aparelho (grande ≤ 960 px/≤ 280 KB; miniatura ≤ 160 px/≈ 30 KB). Contentor Storage **privado** `produtos-fotos`, caminho `<loja>/<produto>/<versão>-[tf].jpg`; só o dono escreve; cada loja lê só a sua pasta. A tabela guarda só `foto_ver` (texto curto). Lazy loading, cache em memória + Cache API, imagem temporária e imagem padrão se falhar. A fotografia nunca bloqueia a venda. | migração 16 §3; `www/fotos.js` |
| Centro de notificações | Sino com contador (dono e gerente; o caixa não tem sino nem pede notificações). Guardadas na BD; tempo real + sondeamento; marcar uma/todas; histórico; sem duplicados (chave única por evento). Tipos: venda, stock baixo, stock zero, venda anulada, caixa fechado, caixa reaberto. Gerente **não** recebe fecho/reabertura de caixa nem nada financeiro interno. Stock baixo usa o limite `minimo` que **só o dono** define. | migração 16 §4; `www/notif.js` |
| Fecho de caixa | Botão «Fechar caixa» sempre visível (caixa e gerente). Resumo calculado **no servidor** (os números mostrados são os gravados); contagem física, diferença (falta/excesso), observação, valor inicial; confirmação final; fecho atómico com bloqueio por funcionário e referência única (sem duplicar). Offline → fica **pendente** («ainda não confirmado») e segue sozinho, com a mesma referência. Imutável (gatilho): nem o dono nem a administração alteram ou apagam. Só o **dono** reabre, só o fecho mais recente, com motivo; o fecho original fica guardado. Cada funcionário fecha o seu; fechar um não fecha os outros; não é «encerrar o dia». Dono recebe «Caixa fechado com sucesso.» com caixa, funcionário, data/hora, totais, contado e diferença (destacada). | migração 16 §5; `www/caixa.js` |

## 2. Migração 16 (`supabase/migracao_16_stock_fotos_notificacoes_caixa.sql`)
- **Só acrescenta.** 1 coluna em `produtos` (`foto_ver`), 1 em `recebimentos` (`usuario_id`), 3 tabelas (`notificacoes`, `notificacoes_lidas`, `caixa_fechos`), funções e gatilhos novos, contentor `produtos-fotos`. **Não substitui nenhuma função existente** (nem `registar_venda`, `anular_venda`, `receber_fiado`). Não apaga nem altera vendas, produtos, lotes, clientes ou contas.
- Os gatilhos novos só inserem linhas em `notificacoes` (não tocam em vendas nem stock). Efeito colateral intencional: o gerente deixa de poder alterar o limite de stock baixo e a fotografia (só o dono).
- Independente das migrações 10, 12 e 15 (testada com 10+12 e sem a 12). Pode ser aplicada duas vezes sem erro.
- **Reversão:** `supabase/reverter_migracao_16.sql` (provada em réplica: repõe funções, gatilhos, tabelas e políticas). ATENÇÃO: apaga as notificações e o **histórico de fechos** criados desde então; exportar antes. Os ficheiros do Storage não se apagam por SQL.
- **Antes de aplicar (com a sua autorização):** backup/exportação das tabelas; confirmar no painel que existe o Storage; comparar as definições de produção das funções que o ficheiro usa (`meu_papel`, `minha_loja`, `loja_ativa`, `hoje`, `nome_de`, `_audit`).

## 3. Dependências e limites que não pode ignorar
1. **A restrição «o caixa não vê stock» só é imposta no servidor depois da migração 12** (que fecha o `SELECT` direto em `produtos`/`lotes`). Sem a 12, a app nova já usa a lista do servidor, mas um caixa que chame a API diretamente ainda lê `lotes`. A 12 só pode entrar depois de todos os aparelhos terem a app nova (ver `REQUISITOS-ESTADO.md` §1).
2. **App nova + servidor sem a 16:** a app não parte (usa as leituras antigas; sino escondido; fecho indica «ainda não disponível»), mas o caixa continua a ver produtos sem stock até a 16 ser aplicada.
3. **App antiga + servidor com a 16:** continua a funcionar (a 16 não altera funções existentes).
4. O primeiro fecho de um funcionário conta desde a meia-noite (Maputo) desse dia; os seguintes, desde o fecho anterior. Vendas feitas offline e ainda por enviar **não entram** no fecho (a app avisa para esperar que sigam).
5. O fecho offline guarda a hora do aparelho (aceite entre −7 dias e +5 min; fora disso usa a hora do servidor).
6. A notificação de stock zero conta todos os lotes (inclui vencidos); a lista do caixa só conta o vendável. Um produto só com stock vencido some do caixa mas não gera «stock zero».

## 4. Testes (resultados reais, 01/11/2026)
- `tests/db/novidades16.sh` — **162/162** (Postgres 16 local), com 10+12, com `GESTMZ_SEM12=1` e com `GESTMZ_DUAS=1` (idempotência). 5 mutações deliberadas (retirar o filtro de stock, abrir o fecho ao gerente, remover o gatilho de imutabilidade, retirar a idempotência do fecho, abrir a leitura de fotos entre lojas) foram **todas detetadas**.
- `tests/db/reversao16.sh` — reversão provada com e sem a 12.
- `tests/novidades-ui.test.js` — 6 testes em Chromium real com Supabase simulado: lista e código sem stock, reposição, carrinho livre, anulação protegida, compressão/miniaturas/lazy/cache/lentidão/falha, formulário, sino, fecho (falta, excesso, duplo clique, offline, reenvio, resposta perdida), histórico e reabertura.
- Bateria anterior sem regressões: JS 45/45; DB 83/83, 15/15, 90/90, 98/98; reversões 10/12/15/16.

## 5. O que ainda depende de Supabase real ou de um telefone
- **Supabase real:** criação do contentor e das políticas em `storage.objects` (testadas só num substituto), tempo real, permissões de `SECURITY DEFINER` com o PostgREST real, tamanho/tipo impostos pelo Storage.
- **Telefone Android:** câmara frontal/traseira para a fotografia, desempenho com catálogo real e rede móvel lenta, gaveta/contagem no fecho, sino em segundo plano. **Nenhum destes foi testado num telefone.** Windows: não testado.
- Notificações do sistema (push) com a app fechada **não** existem: ao reabrir a app, as notificações guardadas aparecem.

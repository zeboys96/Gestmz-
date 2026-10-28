# Autorização temporária de operações do caixa — desenho técnico (NÃO implementado)

## 1. Como funciona hoje (verificado no código)
`autorizar()` (`www/core.js`) pede no aparelho do caixa o **e-mail, a senha e o código de acesso do gerente**, inicia uma sessão auxiliar e usa-a. Três ações passam por aqui (`www/loja.js`):
| Ação | Onde é imposta |
|---|---|
| Retirar / diminuir item da venda em curso | **Só no JavaScript.** O carrinho vive no aparelho; o servidor nem sabe que existe. |
| Cancelar a venda em curso | **Só no JavaScript.** Idem. |
| Anular uma venda já gravada (`anular_venda`) | **No servidor** (`gestor()` exige sessão de gerente/dono). |
Problemas: as credenciais do gerente são escritas num aparelho que não é o dele; ficam expostas a olhares, gravação do ecrã e teclados; a senha do gerente circula pelo aparelho do caixa.

## 2. Limite que tem de ser dito já
Para as duas primeiras ações **nenhum código de servidor consegue impedir** o caixa de mexer no seu próprio carrinho: não há objeto no servidor para proteger. Um código só conseguiria dar **prova e registo** («o gerente X autorizou retirar o item Y»), não impedimento. A garantia verdadeira só existe para operações que o servidor executa: anular venda, e (opcionalmente) desconto. Se quiser impedimento real para o carrinho, é preciso alterar a arquitetura (carrinho guardado no servidor), o que não funciona offline — não recomendo.

## 3. Desenho proposto
Tabela `autorizacoes` (migração 13): `id`, `loja_id`, `acao` (lista fechada), `objeto` (id da venda, do produto/linha, ou hash do carrinho), `solicitante_id` (caixa), `aprovador_id`, `estado` (pendente, aprovada, usada, rejeitada, cancelada, expirada), `codigo_hash`, `tentativas`, `criada_em`, `aprovada_em`, `expira_em`, `usada_em`, `detalhe`. RLS fechado: só funções acedem.
1. **Pedido** — `pedir_autorizacao(acao, objeto, detalhe)`: o caixa cria o pedido (expira em 5 min se ninguém aprovar; 1 pedido pendente por caixa e ação).
2. **Aprovação** — o gerente/dono, na **sua própria sessão/aparelho**, vê o pedido (sinal em tempo real) e `aprovar_autorizacao(id)`; o servidor impõe `aprovador ≠ solicitante`, papel gerente/dono da mesma loja e PIN válido; gera um código aleatório (`gen_random_bytes`, 8 dígitos) e **mostra-o uma única vez ao gerente**; guarda só o hash; validade 3 min.
3. **Uso** — o gerente diz o código ao caixa. Para anular venda: `anular_venda_autorizada(venda, motivo, id, codigo)` valida e executa **na mesma transação** (`for update`): loja, solicitante = utilizador atual, ação e objeto iguais, estado aprovada, não expirada, hash certo, tentativas < 5 (5.ª falha invalida) — marca `usada` e anula. Para ações do carrinho: `consumir_autorizacao(id, codigo)` devolve ok e fica na auditoria (prova, não impedimento).
4. **Auditoria** — cada transição (pedida, aprovada, rejeitada, usada, expirada, cancelada, tentativa falhada) vai para a auditoria da loja, sem o código.
5. O caixa pode cancelar; o gerente pode rejeitar; pedidos expirados limpam-se.
O fluxo antigo (credenciais no aparelho do caixa) seria **removido** quando todos os aparelhos tiverem a versão nova, porque deixá-lo anula o ganho.

## 4. Riscos e dependências
- Exige Internet (o fluxo atual também exige: inicia sessão do gerente online).
- O gerente tem de estar online noutro aparelho; sem gerente disponível não há anulação (hoje também não).
- Código de 8 dígitos, 5 tentativas, 3 minutos, ligado a pedido/objeto/loja/utilizador: probabilidade de acerto por adivinhação ≈ 5/10⁸; um atacante também precisaria de um pedido aprovado.
- Observação por cima do ombro do código: só vale para aquele pedido, uma vez, por quem o pediu.
- Dependências: **migração 13** (tabela, funções, RLS), alteração da app (`autorizar()`), testes de base de dados e de navegador. Independente das migrações 10 e 12, mas deve ser aplicada depois de ambas por ordem de risco.
- Testes necessários: válida; expirada; reutilizada; outro caixa; outra loja; outro objeto; o caixa aprova a si próprio; gerente de outra loja; 5 tentativas; cancelada; rejeitada; concorrência (dois usos simultâneos); auditoria sem código.

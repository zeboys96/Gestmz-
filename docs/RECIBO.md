# Recibo de venda (GestMZ)

- **Um só modelo** (`reciboLinhas` em `www/recibo.js`) alimenta o ecrã, a impressão do navegador e o PDF: o que se vê é o que sai.
- Papéis: 58 mm (32 colunas), 80 mm (42) e A4 (56). Tipo de letra monoespaçado: os valores ficam sempre alinhados à direita.
- **Só lê a venda já registada**. Não recalcula nem altera valores, IVA, arredondamentos nem a numeração. A «base tributável» mostrada é
  (valor das linhas com IVA, com o desconto repartido) − IVA registado, apenas para apresentação.
- **Personalização por loja** (só o dono): logótipo (reduzido a 256×96 no aparelho), sucursal, e-mail, mensagens, informação adicional e
  o que mostrar. Guardada na tabela `recibo_config` (migração 18, só acrescenta) e em cópia no aparelho (funciona sem rede e antes de a
  migração estar ativa).
- Sem código QR (decisão do proprietário): o recibo mantém-se limpo e simples.
- Impressão: navegador/PDF/partilha do Android. Não há comunicação direta ESC/POS por Bluetooth/USB.
- Reverter a base de dados: `supabase/reverter_migracao_18.sql` (só apaga a tabela e a função novas).

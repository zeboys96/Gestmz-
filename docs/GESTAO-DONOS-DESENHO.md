# Gestão dos donos das lojas pelo superadministrador — verificação e desenho (NÃO implementado)

## 1. O que existe hoje
- Só há **um papel de administração: `super`** (não existe «administrador comum»). O servidor protege-o com `sou_super()`; a migração 10 impede criar, apagar ou alterar um `super` pela API.
- O painel já suspende e reativa a **loja** (`lojas.estado = 'suspensa'`, reversível) e acrescenta dias (`+30 dias`). Não há ecrã para gerir a **conta do dono**.
- A API não tem `DELETE` em `lojas` nem em `perfis`; apagar só é possível por SQL de administração.

## 2. Consequências (do esquema)
| Pergunta | Resposta verificada |
|---|---|
| Suspender a loja | `loja_ativa()` passa a falso: bloqueia, no servidor, as gravações de produtos, clientes e despesas, as vendas e as entradas de stock (a função é usada em cerca de 16 pontos do esquema; não verifiquei um a um o efeito de cada). Os dados **ficam intactos**; reversível mudando o estado. |
| Desativar a conta do dono (`perfis.ativo = false`) | `minha_loja()` e `meu_papel()` devolvem nulo para essa conta: deixa de aceder a tudo. **Os funcionários da loja continuam a poder entrar** (os seus perfis estão ativos) — por isso desativar o dono não equivale a suspender a loja. |
| Hoje o `super` consegue desativar um dono pela API? | **Não**: `perfis_guard` só permite alterar `ativo` de gerentes/caixas. É necessária uma função própria. |
| Eliminar uma loja | **15 tabelas** referenciam `lojas` com `on delete cascade`: apagar a loja apaga vendas, produtos, clientes, stock, auditoria… **Irreversível. Não recomendo expor eliminação.** |
| Eliminar o utilizador do Auth | `perfis`, PIN e sessões apagam-se em cascata; vendas ficam com o nome gravado (texto), mas perde-se a ligação ao utilizador. |
| Histórico financeiro | Vendas, recebimentos e pagamentos de subscrição mantêm-se enquanto a loja existir. |

## 3. Proposta (migração 14)
- `suspender_dono(user)` / `reativar_dono(user)`: `security definer`, só `sou_super()` **e** nunca sobre outro `super` nem sobre `zeboys96@gmail.com`; muda `ativo` e regista na `auditoria_plataforma` (migração 10) com motivo obrigatório; revoga as sessões desse utilizador.
- Para suspender «tudo»: um botão que faz as duas coisas (loja + dono) com confirmação em duas etapas, mostrando os efeitos: «os N funcionários ficam sem acesso / apenas leitura; nada é apagado; pode reverter».
- **Sem** botão de eliminação. Eliminação definitiva continua a ser SQL manual, com cópia prévia e pedido explícito.
- Proteção do `super`: já garantida (trigger da migração 10 + `perfis_guard`); as novas funções recusam alvo `super`.
- Dependência: migração 10 aplicada primeiro (auditoria da plataforma e proteção do `super`). Nenhuma conta real foi tocada neste trabalho.
- Testes necessários: não-`super` recusado; alvo `super` recusado; reversibilidade; funcionários mantêm/perdem acesso conforme o desenho; auditoria; dados idênticos antes/depois.

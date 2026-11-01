# Termos de uso, política de privacidade e contrato (resumo) — como funciona e o que decidir

Estado: implementado na branch `desenvolvimento/atualizacoes` (`www/legal.js`, `tests/legal.test.js`). **Não precisa de migração** nem de alterações na base de dados. Nada publicado.

## O que o utilizador vê
- **Ecrã de entrada:** três ligações discretas (Termos de uso · Privacidade · Contrato). Os campos e o botão Entrar não mudaram.
- **Dono da loja:** no primeiro acesso (e sempre que a versão dos textos mudar) aparece uma janela que só se fecha ao marcar «Li e aceito» e carregar em «Aceitar e continuar», ou ao sair. Pode ler os três textos antes de aceitar.
- **Gerente e caixa:** não são bloqueados; podem ler os textos em «A minha conta».
- **Administrador do sistema:** sem bloqueio.
- Os textos estão na própria app (funcionam sem internet).

## Como a aceitação é registada
Em `user_metadata` do Supabase Auth: `termos_versao` e `termos_em` (data/hora). Sem internet, a aceitação fica no aparelho e é enviada quando a ligação voltar; uma falha de rede nunca bloqueia a loja.
**Limite:** `user_metadata` pode ser editado pelo próprio utilizador, por isso é um registo simples, não uma prova forte. Se quiser prova mais forte (tabela de aceitações escrita só pelo servidor, com IP e versão), é uma migração futura (a «17»), que só se aplica com a sua autorização.

## Para mudar uma regra
Editar o texto em `www/legal.js` e mudar `VERSAO` (data): todos os donos voltam a ser pedidos para aceitar. Preencher `CONTACTO` com o e-mail ou telefone público do prestador.

## Decisões do dono do sistema (valores que eu escolhi por defeito; confirme ou altere)
| Ponto | Valor atual no texto |
|---|---|
| Retenção dos dados após fim da subscrição | 90 dias |
| Reembolso | Sem reembolso de períodos iniciados; compensação em tempo se houver falha grave do serviço |
| Limite de responsabilidade | O valor pago nos 3 meses anteriores |
| Renovação | Sem renovação automática |
| Contacto | Vazio: pelo separador «Suporte» |
| Prestador | Descrito como «o Prestador (GestMZ)»; sem nome legal nem NUIT |

## Revisão jurídica (importante)
Os textos são um modelo de boa-fé em linguagem simples, **não são aconselhamento jurídico**. Não consegui confirmar nas fontes consultadas que exista em Moçambique uma lei geral de proteção de dados já em vigor (há notícias sobre o assunto, mas não confirmei o estado atual). Por isso o texto segue boas práticas gerais (finalidade, minimização, direitos de acesso e correção, segurança, retenção) sem citar uma lei específica. Antes de distribuir a várias lojas, peça a um advogado em Moçambique que reveja: identificação do prestador, limite de responsabilidade, retenção e transferência de dados para fora do país (os servidores estão na Irlanda).

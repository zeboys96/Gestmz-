# Como remover o gatilho temporário de `versao.yml` (NÃO removido ainda)

O bloco abaixo existe só porque o GitHub não deixa lançar um workflow à mão enquanto ele não estiver no ramo principal. Faz o workflow correr em modo teste sempre que `versao.yml` é alterado no ramo `desenvolvimento/atualizacoes`:
```yaml
  push:
    branches: [desenvolvimento/atualizacoes]
    paths: ['.github/workflows/versao.yml']
```
Depois do merge, `workflow_dispatch` passa a funcionar e o gatilho deixa de ser preciso. Risco de o deixar: correr builds de teste sem querer (só gastam minutos; não publicam).

## Procedimento (um commit separado, antes ou logo depois do merge)
1. Apagar as 4 linhas acima e as 2 linhas de comentário «TEMPORÁRIO…» que as antecedem.
2. Em `tests/versoes.test.js`, o teste que verifica o gatilho temporário deve passar a verificar que **não** existe `push:` no workflow (procurar «temporário»/`desenvolvimento/atualizacoes`).
3. `node --test tests/*.test.js` e `node scripts/verificar-versoes.js`.
4. Commit: «versao.yml: remover gatilho temporário». Como o gatilho é removido, esse commit não dispara execução.
5. Confirmar em Actions que só aparece o disparo manual.

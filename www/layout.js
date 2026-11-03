'use strict';
/* GestMZ — etiquetas das colunas das tabelas (para o modo «cartões» do telemóvel, ver style.css). Só acrescenta atributos; não altera dados nem eventos. */
(function () {
  function marcar(t) {
    t.dataset.rt = '1';
    const linhas = [...t.rows], cab = linhas.find(r => r.querySelector('th')), nomes = cab ? [...cab.cells].map(c => c.textContent.trim()) : [];
    linhas.forEach(r => { if (r === cab) return; [...r.cells].forEach((c, i) => { if (nomes[i] && !c.hasAttribute('data-l')) c.setAttribute('data-l', nomes[i]); }); });
  }
  const varrer = () => document.querySelectorAll('main table:not([data-rt])').forEach(marcar);
  // sem esperar pelo fotograma seguinte: o observador já junta as alterações e corre antes de o ecrã desenhar (não há cartões sem etiquetas)
  const obs = new MutationObserver(() => varrer());
  const iniciar = () => { obs.observe(document.body, { childList: true, subtree: true }); varrer(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();

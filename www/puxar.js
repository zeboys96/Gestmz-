'use strict';
/* GestMZ — puxar para atualizar. Só nos ecrãs de consulta (não em «Vender», «Conta», «Fechar caixa», «Ajuda», que têm formulários ou uma venda em curso).
   Só começa quando o ecrã está no topo e o dedo desce na vertical; a rolagem normal e os campos de texto não são afetados.
   Atualizar = redesenhar o ecrã atual com os dados do servidor (nunca reenvia vendas nem apaga nada); valores já escritos nos campos do ecrã são repostos. */
(function (raiz) {
  const ECRAS = ['painel', 'vendas', 'produtos', 'clientes', 'despesas', 'relatorios', 'equipa', 'registo', 'assinatura', 'suporte', 'fechos', 's_lojas', 's_pagamentos', 's_suporte'];
  const LIMITE = 64, MAX = 110;
  let el = null, pendenteOnline = false;
  const topo = () => (document.scrollingElement ? document.scrollingElement.scrollTop : window.scrollY) <= 0;
  const aberta = () => !!document.querySelector('.modal, .sheet, #legal-gate');
  const pode = () => typeof cur !== 'undefined' && ECRAS.includes(cur) && !aberta();
  function ind() {
    if (el && el.isConnected) return el;
    el = document.createElement('div'); el.id = 'ptr'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.hidden = true;
    el.innerHTML = '<span class="ptr-i" aria-hidden="true"></span><span class="ptr-t"></span>'; document.body.appendChild(el); return el;
  }
  const mostrar = (txt, y, estado) => { const e = ind(); e.hidden = false; e.dataset.estado = estado || ''; e.style.transform = 'translate(-50%,' + Math.round(y) + 'px)'; e.querySelector('.ptr-t').textContent = txt; };
  const esconder = () => { if (!el) return; el.hidden = true; el.dataset.estado = ''; };
  /* guarda e repõe o que o utilizador tinha escrito nos campos do ecrã (por id) */
  function guardarCampos() {
    const m = document.getElementById('main'); if (!m) return [];
    return [...m.querySelectorAll('input[id],select[id],textarea[id]')].filter(c => c.type !== 'file' && c.type !== 'password').map(c => ({ id: c.id, v: c.type === 'checkbox' || c.type === 'radio' ? c.checked : c.value }));
  }
  function reporCampos(l) {
    const m = document.getElementById('main'); if (!m) return;
    l.forEach(x => { const c = m.querySelector('#' + CSS.escape(x.id)); if (!c) return; const atual = c.type === 'checkbox' || c.type === 'radio' ? c.checked : c.value; if (atual === x.v) return;
      if (c.type === 'checkbox' || c.type === 'radio') c.checked = x.v; else c.value = x.v; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  /* devolve: 'ok' | 'ocupado' | 'offline' | 'erro' | 'ignorado' */
  async function atualizar() {
    if (!pode()) return 'ignorado';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { pendenteOnline = true; if (typeof toast === 'function') toast('Sem ligação. Os dados atualizam quando a ligação voltar.'); return 'offline'; }
    const campos = guardarCampos();
    try {
      const r = await atualizarPagina(); if (r === 'ocupado') return 'ocupado';
      reporCampos(campos); pendenteOnline = false; if (typeof toast === 'function') toast('Atualizado.'); return 'ok';
    } catch (e) { if (typeof toast === 'function') toast('Não foi possível atualizar: ' + (e && e.message ? e.message : e), true); return 'erro'; }
  }
  /* ---- gesto ---- */
  let g = null;
  function rolavel(n) { for (; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true; } return false; }
  document.addEventListener('touchstart', e => {
    g = null; if (e.touches.length !== 1 || !pode() || !topo() || atualizandoAgora()) return;
    const t = e.target; if (t.closest && t.closest('input,textarea,select,[contenteditable="true"],#ptr') || rolavel(t)) return;
    g = { x: e.touches[0].clientX, y: e.touches[0].clientY, ativo: false, dy: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!g) return; const t = e.touches[0], dy = t.clientY - g.y, dx = t.clientX - g.x;
    if (!g.ativo) { if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) { g = null; return; } if (dy < -6) { g = null; return; } if (dy < 12) return; if (!topo()) { g = null; return; } g.ativo = true; }
    g.dy = Math.min(MAX, (dy - 12) * 0.55); if (e.cancelable) e.preventDefault();
    mostrar(g.dy >= LIMITE ? 'Solte para atualizar' : 'Puxe para atualizar', g.dy - 40, g.dy >= LIMITE ? 'pronto' : 'puxar');
  }, { passive: false });
  const fim = async () => {
    const x = g; g = null; if (!x || !x.ativo) return;
    if (x.dy < LIMITE) { esconder(); return; }
    mostrar('A atualizar…', 22, 'a-atualizar'); const r = await atualizar();
    if (r === 'ok') { mostrar('Atualizado', 22, 'ok'); setTimeout(esconder, 900); } else esconder();
  };
  document.addEventListener('touchend', fim, { passive: true }); document.addEventListener('touchcancel', () => { g = null; esconder(); }, { passive: true });
  const atualizandoAgora = () => !!(el && el.dataset.estado === 'a-atualizar');
  /* voltou a ligação: se ficou uma atualização por fazer, faz-se agora */
  window.addEventListener('online', () => { if (pendenteOnline) setTimeout(() => { if (pendenteOnline) atualizar(); }, 600); });
  raiz.GestPuxar = { atualizar, ECRAS, pode };
})(window);

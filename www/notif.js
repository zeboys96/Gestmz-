'use strict';
/* GestMZ — centro de notificações (sino) e linha de topo.
   As notificações vivem na base de dados (sobrevivem ao fecho da app) e o servidor só entrega ao dono tudo e ao gerente o que é operacional;
   o caixa não tem acesso. Aqui só se mostram; quem decide o que cada papel vê é o servidor. */

const NOTIF = { n: null, canal: null, poll: null, painel: null, vistas: new Set(), indisponivel: false };
const notifPode = () => !!S.perfil && ['dono', 'gerente'].includes(S.perfil.papel) && !NOTIF.indisponivel;

/* linha de topo: «Fechar caixa» (caixa e gerente, sempre visível) e o sino (dono e gerente) */
function montarTopo() {
  const el = $('#topline'); if (!el || !S.perfil || S.perfil.papel === 'super') return;
  const p = S.perfil.papel, h = [];
  if (p === 'caixa' || p === 'gerente') h.push(`<button class="btn ghost sm" id="btnFecho" type="button">${ico('caixa', 18)} Fechar caixa</button>`);
  if (['dono', 'gerente'].includes(p)) h.push(`<button class="sino" id="sino" type="button" aria-label="Notificações" title="Notificações">${ico('sino', 22)}<span class="sn" hidden></span></button>`);
  el.innerHTML = h.join('');
  const f = $('#btnFecho', el); if (f) f.onclick = () => go('fecho');
  const s = $('#sino', el); if (s) { s.onclick = abrirNotificacoes; notifPintar(); }
}
function notifPintar() {
  const s = $('#sino'); if (!s) return;
  s.hidden = NOTIF.indisponivel; const b = $('.sn', s), n = NOTIF.n || 0;
  b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); s.setAttribute('aria-label', n ? `Notificações: ${n} por ler` : 'Notificações');
}
async function notifContar(avisar) {
  if (!notifPode() || !navigator.onLine) return;
  try {
    const n = +(await q(sb.rpc('notificacoes_nao_lidas'))) || 0, antes = NOTIF.n;
    NOTIF.n = n; notifPintar();
    if (avisar && antes != null && n > antes) { bip(); toast(n - antes === 1 ? 'Nova notificação.' : `${n - antes} novas notificações.`); }
    if (NOTIF.painel && avisar) notifCarregar(true);
  } catch (e) { if (semFuncao(e)) { NOTIF.indisponivel = true; notifPintar(); } }   // servidor sem a migração: o sino esconde-se
}
function notifIniciar() {
  notifParar(); if (!notifPode()) return;
  NOTIF.n = null; NOTIF.indisponivel = false; notifContar(false);
  try {   // tempo real; se falhar, o sondeamento abaixo garante a atualização
    NOTIF.canal = sb.channel('notif-' + S.perfil.loja_id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: 'loja_id=eq.' + S.perfil.loja_id },
      m => { const id = m && m.new && m.new.id; if (id && NOTIF.vistas.has(id)) return; if (id) NOTIF.vistas.add(id); notifContar(true); }).subscribe();
  } catch (e) { /* sem tempo real */ }
  NOTIF.poll = setInterval(() => notifContar(true), 60000);
}
function notifParar() {
  if (NOTIF.canal) { try { sb.removeChannel(NOTIF.canal); } catch (e) { /* ok */ } NOTIF.canal = null; }
  clearInterval(NOTIF.poll); NOTIF.poll = null; NOTIF.n = null;
}
window.addEventListener('online', () => { if (S.perfil) notifContar(true); });

/* ---------- apresentação ---------- */
const NOTIF_ICONE = { venda: '🧾', stock_baixo: '📉', stock_zero: '⛔', venda_anulada: '↩️', caixa_fechado: '🔒', caixa_reaberto: '🔓' };
function notifDetalhe(n) {
  const d = n.dados || {}, L = [], add = (k, v) => { if (v != null && v !== '') L.push(`<span><i>${k}</i> ${v}</span>`); };
  if (n.tipo === 'venda') { add('Funcionário', esc(d.funcionario)); add('Valor', mt(d.total)); add('Pagamento', esc(d.pagamento)); add('Data', d.data ? esc(fdt(d.data)) : ''); }
  else if (n.tipo === 'stock_baixo') { add('Produto', esc(d.produto)); add('Stock', d.stock != null ? esc(d.stock) + ' un.' : ''); add('Limite', d.minimo != null ? esc(d.minimo) + ' un.' : ''); }
  else if (n.tipo === 'stock_zero') { add('Produto', esc(d.produto)); add('Ficou indisponível em', d.em ? esc(fdt(d.em)) : ''); }
  else if (n.tipo === 'venda_anulada') { add('Venda', esc(d.num)); add('Funcionário', esc(d.funcionario)); add('Anulada por', esc(d.anulada_por)); add('Motivo', esc(d.motivo || 'sem motivo indicado')); add('Valor', mt(d.total)); add('Data', d.data ? esc(fdt(d.data)) : ''); }
  else if (n.tipo === 'caixa_fechado') {
    const dif = +d.diferenca || 0;
    add('Caixa', esc(d.caixa)); add('Funcionário', esc(d.funcionario)); add('Fecho', d.fim ? esc(fdt(d.fim)) : ''); add('Vendas', esc(d.n_vendas) + ' · ' + mt(d.total_vendido));
    add('Em dinheiro', mt(d.dinheiro)); add('Outros métodos', mt(d.outros)); add('Esperado', mt(d.esperado)); add('Contado', mt(d.contado));
    L.push(`<span class="${dif ? 'dif-mau' : 'dif-ok'}"><i>Diferença</i> <b>${dif === 0 ? 'sem diferença' : (dif < 0 ? 'falta ' : 'excesso ') + mt(Math.abs(dif))}</b></span>`);
    if (d.obs) add('Observação', esc(d.obs));
  } else if (n.tipo === 'caixa_reaberto') { add('Caixa', esc(d.caixa)); add('Reaberto por', esc(d.reaberto_por)); add('Motivo', esc(d.motivo)); add('Em', d.em ? esc(fdt(d.em)) : ''); }
  return L.join('');
}
function notifLinha(n) {
  const mau = n.tipo === 'caixa_fechado' && +(n.dados || {}).diferenca, zero = n.tipo === 'stock_zero' || n.tipo === 'venda_anulada';
  return `<button type="button" class="nt ${n.lida ? '' : 'nova'} ${mau || zero ? 'alerta' : ''}" data-id="${n.id}" aria-label="${esc(n.titulo)}${n.lida ? '' : ' (por ler)'}"><span class="ni" aria-hidden="true">${NOTIF_ICONE[n.tipo] || '🔔'}</span><span class="nb"><b>${esc(n.titulo)}</b><span class="nd">${notifDetalhe(n)}</span><span class="nh muted small">${esc(fdt(n.criada_em))}</span></span>${n.lida ? '' : '<span class="np" aria-hidden="true"></span>'}</button>`;
}

/* ---------- painel ---------- */
function abrirNotificacoes() {
  if (NOTIF.painel) return;
  const el = document.createElement('div'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Notificações');
  el.innerHTML = `<div class="sheet-box"><div class="mh"><b>Notificações</b><div class="act" style="gap:6px"><button type="button" class="btn ghost sm" id="ntTodas">Marcar todas como lidas</button><button type="button" class="x" data-x aria-label="Fechar">✕</button></div></div>
    <div class="sheet-b" id="ntLista" aria-live="polite">${loaderHTML('A carregar', 'min-height:90px')}</div><div class="sheet-f" id="ntMais" hidden><button type="button" class="btn ghost block" id="ntMaisBtn">Mostrar anteriores</button></div></div>`;
  document.body.appendChild(el); NOTIF.painel = { el, itens: [], fim: false };
  const fechar = () => { document.removeEventListener('keydown', tecla); el.remove(); NOTIF.painel = null; };
  const tecla = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tecla); el.onmousedown = e => { if (e.target === el) fechar(); }; $('[data-x]', el).onclick = fechar;
  $('#ntLista', el).onclick = async e => {
    const b = e.target.closest('.nt'); if (!b || !b.classList.contains('nova')) return;
    const it = NOTIF.painel.itens.find(x => x.id === b.dataset.id); if (!it) return;
    try { await q(sb.rpc('marcar_notificacao_lida', { p_id: it.id })); it.lida = true; b.classList.remove('nova'); const pt = $('.np', b); if (pt) pt.remove(); await notifContar(false); } catch (er) { erro(er); }
  };
  $('#ntTodas', el).onclick = async ev => {
    ev.target.disabled = true;
    try { await q(sb.rpc('marcar_todas_lidas')); NOTIF.painel.itens.forEach(x => x.lida = true); notifDesenhar(); await notifContar(false); } catch (er) { erro(er); } finally { ev.target.disabled = false; }
  };
  $('#ntMaisBtn', el).onclick = () => notifCarregar(false);
  notifCarregar(true);
}
function notifDesenhar() {
  const P = NOTIF.painel; if (!P) return; const l = $('#ntLista', P.el);
  l.innerHTML = P.itens.length ? `<div class="ntl">${P.itens.map(notifLinha).join('')}</div>` : '<div class="empty">Ainda não há notificações.</div>';
  $('#ntMais', P.el).hidden = P.fim || !P.itens.length;
}
async function notifCarregar(reiniciar) {
  const P = NOTIF.painel; if (!P) return;
  if (!navigator.onLine) { if (!P.itens.length) $('#ntLista', P.el).innerHTML = '<div class="msg">Sem internet. As notificações aparecem quando a ligação voltar; nada se perde.</div>'; return; }
  try {
    const antes = !reiniciar && P.itens.length ? P.itens[P.itens.length - 1].criada_em : null;
    const r = await q(sb.rpc('minhas_notificacoes', { p_limite: 30, p_antes: antes })) || [];
    if (!NOTIF.painel) return;
    if (reiniciar) { P.itens = r; P.fim = r.length < 30; }
    else { const ids = new Set(P.itens.map(x => x.id)); r.forEach(x => { if (!ids.has(x.id)) P.itens.push(x); }); P.fim = r.length < 30; }
    notifDesenhar();
  } catch (e) { if (NOTIF.painel) $('#ntLista', NOTIF.painel.el).innerHTML = `<div class="msg bad">Não foi possível carregar as notificações.<br><span class="small">${esc(e.message)}</span></div><button type="button" class="btn ghost" id="ntRep">Tentar de novo</button>`; const b = NOTIF.painel && $('#ntRep', NOTIF.painel.el); if (b) b.onclick = () => notifCarregar(true); }
}

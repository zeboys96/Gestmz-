'use strict';
/* GestMZ — etiquetas com código de barras e vendas sem internet */

/* ======================= CÓDIGO DE BARRAS (Code 128-B) ======================= */
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
/* Devolve a sequência de larguras (barra, espaço, barra…) ou null se o texto tiver caracteres que o Code 128-B não aceita. */
function code128(txt) {
  txt = String(txt || ''); if (!txt || /[^\x20-\x7e]/.test(txt)) return null;
  const v = [104]; let soma = 104;
  [...txt].forEach((ch, i) => { const x = ch.charCodeAt(0) - 32; v.push(x); soma += x * (i + 1); });
  v.push(soma % 103, 106);
  return v.map(x => C128[x]).join('');
}
/* SVG do código de barras (com zona de silêncio). */
function barrasSVG(txt, altura) {
  const w = code128(txt); if (!w) return '';
  let x = 10, d = '';
  [...w].forEach((n, i) => { n = +n; if (i % 2 === 0) d += `M${x} 0h${n}v${altura}h-${n}z`; x += n; });
  return `<svg class="barras" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} ${altura}" preserveAspectRatio="none" role="img" aria-label="Código de barras ${esc(txt)}" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
}
function etiquetaHTML(p, cod, caixa) {
  const preco = caixa ? p.preco_caixa : p.preco;
  return `<div class="etq"><div class="en">${esc(p.nome)}${caixa ? ' · ' + esc((p.embalagem || 'Caixa')) + ' de ' + p.un_por_caixa : ''}</div>${barrasSVG(cod, 40)}<div class="ec">${esc(cod)}</div>${+preco ? `<div class="ep">${mt(preco)}</div>` : ''}</div>`;
}
function formEtiquetas(p) {
  const opcoes = [];
  if (p.codigo) opcoes.push({ id: 'un', t: 'Unidade', cod: p.codigo, caixa: false });
  if (p.un_por_caixa && p.codigo_caixa) opcoes.push({ id: 'cx', t: p.embalagem || 'Embalagem', cod: p.codigo_caixa, caixa: true });
  if (!opcoes.length) {
    const cx = false;
    return modal('Etiquetas — ' + esc(p.nome), `<p>Este produto ainda não tem código de barras.</p><p class="muted small">Gere um código interno para ${cx ? 'a embalagem' : 'o produto'}, guarde-o e imprima a etiqueta para colar no produto.</p>`, {
      okText: 'Gerar código e continuar',
      onOk: async () => {
        const campo = cx ? 'codigo_caixa' : 'codigo';
        for (let i = 0; i < 5; i++) {
          try { await q(sb.from('produtos').update({ [campo]: gerarCodigoInterno() }).eq('id', p.id)); break; }
          catch (e) { if (i === 4 || !/código de barras/i.test(e.message)) throw e; }
        }
        await recarregarProdutos(); if (cur === 'produtos') go('produtos', true);
        setTimeout(() => formEtiquetas(prodById(p.id)), 50);
      }
    });
  }
  const w = modal('Etiquetas — ' + esc(p.nome), `<div class="seg" role="radiogroup" aria-label="Que código imprimir">${opcoes.map((o, i) => `<label class="${i ? '' : 'on'}"><input type="radio" name="qual" value="${o.id}" ${i ? '' : 'checked'}> ${esc(o.t)}</label>`).join('')}</div>
    <label>Quantas etiquetas?<input class="in" name="n" inputmode="numeric" value="${opcoes.length ? 12 : 1}" autocomplete="off"></label>
    <div id="prev" class="etqs prev"></div>
    <p class="muted small">Imprima em folha de etiquetas ou em papel normal e recorte. Cada etiqueta tem 50 × 30 mm.</p>`, { okText: 'Imprimir', onOk: async d => { const o = opcoes.find(x => x.id === (d.qual || opcoes[0].id)); const n = Math.min(200, Math.max(1, parseInt(d.n) || 1)); if (!code128(o.cod)) throw new Error('Este código tem caracteres que não cabem num código de barras.'); imprimir(`<div class="etqs">${etiquetaHTML(p, o.cod, o.caixa).repeat(n)}</div>`); return false; } });
  const f = w.f, ver = () => { const o = opcoes.find(x => x.id === f.elements.qual.value) || opcoes[0]; $('#prev', f).innerHTML = code128(o.cod) ? etiquetaHTML(p, o.cod, o.caixa) : '<div class="msg bad">Este código tem caracteres que não cabem num código de barras.</div>'; $$('.seg label', f).forEach(l => l.classList.toggle('on', $('input', l).checked)); };
  f.addEventListener('change', ver); ver();
}

/* ======================= VENDAS SEM INTERNET ======================= */
const SEM_NET = 'Sem ligação à internet.';
const ehRede = e => { const m = String((e && e.message) || e || ''); return !navigator.onLine || m === SEM_NET || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(m); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const jGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
const jSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const FILA_K = 'gestmz_fila';
const lerFila = () => jGet(FILA_K, []);
const minhaFila = () => lerFila().filter(x => S.perfil && x.uid === S.perfil.id);

/* cópia local de produtos, stock e clientes para abrir e vender sem internet */
function guardarCache() {
  if (!S.perfil || S.perfil.papel === 'super' || !S.loja) return;
  jSet('gestmz_cache', { uid: S.perfil.id, perfil: S.perfil, loja: S.loja, plat: S.plat, cats: S.cats, produtos: S.produtos, clientes: S.clientes, equipa: S.equipa, em: Date.now() });
}
async function sha256hex(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function guardarPinLocal(uid, pin) { try { localStorage.setItem('gestmz_pinh_' + uid, await sha256hex(uid + ':gestmz:' + pin)); } catch (e) { /* ok */ } }
function limparCache() { try { localStorage.removeItem('gestmz_cache'); Object.keys(localStorage).filter(k => k.startsWith('gestmz_pinh_')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* ok */ } }

async function entrarOffline() {
  const c = jGet('gestmz_cache', null);
  if (!c || !c.perfil) return vLogin('Sem internet. Ligue-se uma vez à internet para entrar neste aparelho.');
  const abrir = () => {
    Object.assign(S, { perfil: c.perfil, loja: c.loja, plat: c.plat, cats: c.cats || [], produtos: c.produtos || [], clientes: c.clientes || [], equipa: c.equipa || [], offline: true });
    shell(navLoja()); go('pdv'); netUpdate();
  };
  const h = c.perfil.papel !== 'dono' ? localStorage.getItem('gestmz_pinh_' + c.uid) : null;
  if (c.perfil.papel !== 'dono' && !h) return vLogin('Sem internet. Entre uma vez com internet para poder vender sem ligação.');
  if (!h) return abrir();
  authShell(`<div style="text-align:center">${avatar(c.perfil, 'lg')}<h2 style="margin:10px 0 2px">${esc(c.perfil.nome)}</h2><div class="muted">${PAPEL[c.perfil.papel]} · ${esc(c.loja.nome)}</div></div>
    <div class="msg" style="margin-top:12px">Sem internet. Pode vender; as vendas seguem quando a ligação voltar.</div>
    <form id="f" style="margin-top:12px"><label>Código de acesso<input class="in pin" name="pin" type="password" inputmode="numeric" autocomplete="off" required placeholder="••••••" style="text-align:center;font-size:22px;letter-spacing:6px"></label><button class="btn block" id="go">Aceder</button></form>
    <div style="text-align:center;margin-top:8px"><button class="link" id="v">Tentar de novo com internet</button></div>`);
  $('#v').onclick = () => location.reload();
  $('#f').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    if (await sha256hex(c.uid + ':gestmz:' + d.pin.trim()) === h) abrir(); else { toast('Código de acesso incorrecto.', true); e.target.reset(); }
  };
}

/* guarda a venda neste aparelho, baixa o stock localmente e devolve o recibo provisório */
function enfileirarVenda(ref, dados, t) {
  const itens = dados.itens.map(c => {
    const p = prodById(c.produto_id), un = c.caixa ? c.qtd * p.un_por_caixa : c.qtd, preco = c.caixa ? +p.preco_caixa : +p.preco;
    return { produto_id: p.id, nome: p.nome, codigo: c.caixa ? p.codigo_caixa : p.codigo, qtd: c.qtd, caixa: c.caixa, apresentacao: c.caixa ? (p.embalagem || 'Caixa') : 'Unidade', un_por_caixa: p.un_por_caixa, un, preco, custo_un: +p.custo, total: r2(preco * c.qtd), iva: p.iva };
  });
  const agora = new Date().toISOString();
  const venda = { id: 'local-' + ref, num: null, pendente: true, data: agora, usuario_nome: S.perfil.nome, cliente_id: dados.cliente, pagamento: dados.pagamento, subtotal: t.sub, desconto: t.desc, iva: t.iva, total: t.tot,
    recebido: dados.pagamento === 'Numerário' ? dados.recebido : 0, troco: dados.pagamento === 'Numerário' && dados.recebido > 0 ? r2(dados.recebido - t.tot) : 0, itens };
  const f = lerFila(); f.push({ ref, uid: S.perfil.id, loja: S.perfil.loja_id, itens: dados.itens, pagamento: dados.pagamento, cliente: dados.cliente, desconto: t.desc, recebido: dados.recebido, data: agora, venda, erro: null });
  if (!jSet(FILA_K, f)) throw new Error('Não há espaço neste aparelho para guardar a venda. Ligue-se à internet.');
  itens.forEach(i => { // baixa local (validade mais próxima primeiro)
    const p = prodById(i.produto_id); let falta = i.un;
    p.lotes.slice().sort((a, b) => (a.validade || '9999').localeCompare(b.validade || '9999')).forEach(l => { if (falta > 0 && (!l.validade || diasPara(l.validade) >= 0)) { const x = Math.min(l.qtd, falta); l.qtd -= x; falta -= x; } });
  });
  if (dados.pagamento === 'Fiado' && dados.cliente) { const c = S.clientes.find(x => x.id === dados.cliente); if (c) c.divida = r2(+c.divida + t.tot); }
  guardarCache(); netUpdate();
  return venda;
}

let sincA = false;
async function sincronizarFila() {
  if (sincA || !S.perfil || S.perfil.papel === 'super' || !navigator.onLine) return 0;
  const todas = lerFila(), minhas = todas.filter(x => x.uid === S.perfil.id && !x.erro);
  if (!minhas.length) return 0;
  sincA = true; let ok = 0;
  try {
    for (const it of minhas) {
      try {
        await q(sb.rpc('registar_venda', { p_itens: it.itens, p_pagamento: it.pagamento, p_cliente: it.cliente || null, p_desconto: it.desconto || 0, p_recebido: it.recebido || 0, p_ref: it.ref, p_data: it.data }));
        jSet(FILA_K, lerFila().filter(x => x.ref !== it.ref)); ok++;
      } catch (e) {
        if (ehRede(e) || /sem acesso|inicie sess|jwt|sessão|autentic/i.test(e.message)) break;
        const f = lerFila(), x = f.find(y => y.ref === it.ref); if (x) { x.erro = e.message; jSet(FILA_K, f); }
      }
    }
  } finally { sincA = false; }
  if (ok) { toast(ok === 1 ? '1 venda enviada.' : ok + ' vendas enviadas.'); try { await recarregarProdutos(); S.clientes = await all(() => sb.from('clientes').select('*').order('nome')); guardarCache(); } catch (e) { /* ok */ } }
  netUpdate(); return ok;
}
async function aoVoltarNet() {
  netUpdate(); if (!S.perfil || S.perfil.papel === 'super') return;
  try {
    if (S.perfil.papel !== 'dono' && await q(sb.rpc('pin_exigido'))) return entrar();   // sessão do código de acesso terminou
    await sincronizarFila(); await carregarLoja();
    if (S.offline) { S.offline = false; iniciarRT(); }
  } catch (e) { /* fica para a próxima */ }
  netUpdate();
}
function netUpdate() {
  let el = $('#net'); if (!el) { el = document.createElement('button'); el.id = 'net'; el.type = 'button'; el.hidden = true; el.onclick = abrirFila; document.body.appendChild(el); }
  const f = S.perfil ? minhaFila() : [], err = f.filter(x => x.erro).length, pend = f.length - err, off = !navigator.onLine;
  if (!S.perfil || (!off && !f.length)) { el.hidden = true; return; }
  el.hidden = false; el.className = err ? 'bad' : (off ? 'off' : 'sync');
  el.textContent = (off ? 'Sem internet' : 'A enviar') + (pend ? ` · ${pend} venda(s) por enviar` : '') + (err ? ` · ${err} com problema` : '');
}
function abrirFila() {
  const f = minhaFila();
  const w = modal('Vendas neste aparelho', (f.length ? `<p class="muted small">Estas vendas foram feitas sem internet e ainda não chegaram ao servidor. Seguem sozinhas quando houver ligação.</p>` + f.map(x => `<div class="ci"><div style="min-width:0"><b>${mt(x.venda.total)}</b> · ${esc(x.pagamento)}<br><span class="muted small">${fdt(x.data)} · ${x.itens.length} linha(s)</span>${x.erro ? `<br><span class="warn-t small">Recusada: ${esc(x.erro)}</span>` : ''}</div><div style="text-align:right"><button type="button" class="btn ghost sm" data-r="${x.ref}">Recibo</button>${x.erro ? `<button type="button" class="btn ghost sm" data-d="${x.ref}">Descartar</button>` : ''}</div></div>`).join('') : '<div class="empty">Nada por enviar.</div>') + (navigator.onLine && f.some(x => !x.erro) ? '<div class="mf"><button type="button" class="btn" id="env">Enviar agora</button></div>' : ''), {});
  w.m.onclick = e => {
    const r = e.target.closest('[data-r]'), d = e.target.closest('[data-d]');
    if (r) { const x = f.find(y => y.ref === r.dataset.r); if (x) { w.close(); mostrarRecibo(x.venda); } }
    if (d) ask('Descartar esta venda? Ela não será registada no servidor.', () => { jSet(FILA_K, lerFila().filter(y => y.ref !== d.dataset.d)); netUpdate(); w.close(); abrirFila(); }, 'Descartar', true);
    if (e.target.id === 'env') { e.target.disabled = true; sincronizarFila().then(() => { w.close(); abrirFila(); }); }
  };
}
window.addEventListener('online', () => aoVoltarNet());
window.addEventListener('offline', () => netUpdate());
setInterval(() => { if (S.perfil && navigator.onLine && minhaFila().some(x => !x.erro)) sincronizarFila(); }, 30000);

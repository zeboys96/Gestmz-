'use strict';
/* GestMZ — loja: painel, caixa (PDV), vendas e produtos */
const isGestor = () => ['dono', 'gerente'].includes(S.perfil.papel);
const lucroVenda = v => r2(v.itens.reduce((s, i) => s + i.total - (i.custo_un || 0) * i.un, 0) - (v.desconto || 0));
const diaIso = (d, add) => { const x = new Date(d + 'T00:00:00'); if (add) x.setDate(x.getDate() + add); return x.toISOString(); };
const aviso = a => a.ok ? '' : `<div class="msg bad">${esc(a.txt)}</div>`;
const online = u => u && u.ultimo_acesso && (Date.now() - new Date(u.ultimo_acesso).getTime()) < 150000;

/* ======================= PAINEL ======================= */
VIEWS.painel = async function () {
  const hoje = ymd(), m0 = hoje.slice(0, 8) + '01', sete = new Date(); sete.setDate(sete.getDate() - 6);
  const desde = m0 < ymd(sete) ? m0 : ymd(sete);
  const [vs0, eq] = await Promise.all([
    all(() => sb.from('vendas').select('id,num,data,usuario_id,usuario_nome,total,pagamento,itens,anulada,desconto').gte('data', diaIso(desde)).order('data', { ascending: false })),
    all(() => sb.from('perfis').select('id,nome,usuario,papel,foto,ativo,ultimo_acesso').eq('loja_id', S.loja.id).order('nome'))
  ]);
  S.equipa = eq; recarregarLoja().catch(() => { });
  const vs = vs0.filter(v => !v.anulada), dia = v => ymd(new Date(v.data));
  const vh = vs.filter(v => dia(v) === hoje), vm = vs.filter(v => dia(v) >= m0);
  const soma = a => r2(a.reduce((s, v) => s + +v.total, 0));
  const dias = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = ymd(d); dias.push([k, soma(vs.filter(v => dia(v) === k))]); }
  const mx = Math.max(1, ...dias.map(d => d[1]));
  const baixo = S.produtos.filter(p => ['baixo', 'sem'].includes(estado(p)));
  const exp = S.produtos.flatMap(p => p.lotes.filter(l => l.validade && diasPara(l.validade) <= 90).map(l => ({ p, l }))).sort((a, b) => a.l.validade.localeCompare(b.l.validade));
  const fiado = r2(S.clientes.reduce((s, c) => s + +c.divida, 0));
  const valorStock = r2(S.produtos.reduce((s, p) => s + estoque(p) * +p.custo, 0));
  const equipaHoje = S.equipa.filter(u => u.ativo).map(u => { const x = vh.filter(v => v.usuario_id === u.id); return { u, n: x.length, t: soma(x) }; }).sort((a, b) => b.t - a.t || a.u.nome.localeCompare(b.u.nome));
  const topT = Math.max(1, ...equipaHoje.map(e => e.t));
  const lider = equipaHoje[0] && equipaHoje[0].t > 0 ? equipaHoje[0] : null;
  $('#main').innerHTML = `<div class="bar"><h2>Painel</h2><span class="muted">${new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
  <div class="grid">
    <div class="stat hi"><span>Vendas hoje</span><b>${mt(soma(vh))}</b></div>
    <div class="stat"><span>Nº de vendas hoje</span><b>${vh.length}</b></div>
    <div class="stat ok"><span>Lucro bruto hoje</span><b>${mt(r2(vh.reduce((s, v) => s + lucroVenda(v), 0)))}</b></div>
    <div class="stat"><span>Vendas do mês</span><b>${mt(soma(vm))}</b></div>
    <div class="stat warn"><span>Stock baixo ou esgotado</span><b>${baixo.length}</b></div>
    <div class="stat bad"><span>Lotes a expirar (90 dias)</span><b>${exp.length}</b></div>
    <div class="stat warn"><span>Fiado por receber</span><b>${mt(fiado)}</b></div>
    <div class="stat"><span>Valor do stock (custo)</span><b>${mt(valorStock)}</b></div>
  </div>
  <div class="cols">
    <div class="card"><h3>Quem vendeu hoje</h3>${lider ? `<p class="muted small" style="margin-top:-6px">Melhor vendedor: <b>${esc(lider.u.nome)}</b></p>` : ''}
      <div class="rank">${equipaHoje.map(e => `<div class="it">${avatar(e.u)}<div class="meter"><b><span>${esc(e.u.nome)} <span class="dot ${online(e.u) ? 'on' : ''}" title="${online(e.u) ? 'A trabalhar agora' : 'Fora do sistema'}"></span></span><span>${mt(e.t)}</span></b><span class="muted small">${PAPEL[e.u.papel]} · ${e.n} venda(s)</span><i style="width:${Math.max(2, Math.round(e.t / topT * 100))}%"></i></div></div>`).join('') || '<div class="empty">Sem equipa.</div>'}</div></div>
    <div class="card"><h3>Últimos 7 dias</h3><div class="bars">${dias.map(d => `<div title="${mt(d[1])}"><i style="height:${Math.round(d[1] / mx * 100)}%"></i>${d[0].slice(8)}/${d[0].slice(5, 7)}</div>`).join('')}</div></div>
    <div class="card"><h3>Validades a vigiar</h3>${exp.length ? `<div class="tw"><table><tr><th>Produto</th><th>Lote</th><th>Validade</th><th class="n">Qtd</th></tr>${exp.slice(0, 8).map(({ p, l }) => { const d = diasPara(l.validade); return `<tr><td>${esc(p.nome)}</td><td>${esc(l.lote || '—')}</td><td>${fd(l.validade)} <span class="tag ${d < 0 ? 'expirado' : 'expira'}">${d < 0 ? 'expirado' : d + ' d'}</span></td><td class="n">${l.qtd}</td></tr>`; }).join('')}</table></div>` : '<div class="empty">Nada a expirar nos próximos 90 dias.</div>'}</div>
    <div class="card"><h3>Precisa de repor</h3>${baixo.length ? `<div class="tw"><table><tr><th>Produto</th><th class="n">Stock</th><th class="n">Mínimo</th></tr>${baixo.slice(0, 8).map(p => `<tr><td>${esc(p.nome)}</td><td class="n">${estoque(p)}</td><td class="n">${p.minimo}</td></tr>`).join('')}</table></div>` : '<div class="empty">Stock em dia.</div>'}</div>
  </div>`;
};

/* ======================= CAIXA (PDV) ======================= */
const cartKey = c => c.pid + '|' + (c.caixa ? 1 : 0);
const precoUn = (c, p) => c.caixa ? +p.preco_caixa : +p.preco;
const unidadesDe = (c, p) => c.caixa ? c.qtd * p.un_por_caixa : c.qtd;
function achar(cod) {
  cod = String(cod).trim(); if (!cod) return null;
  for (const p of S.produtos) { if (p.codigo && p.codigo === cod) return { p, caixa: false }; if (p.codigo_caixa && p.codigo_caixa === cod) return { p, caixa: true }; }
  return null;
}
const filtrarProdutos = t => { t = t.toLowerCase(); return S.produtos.filter(p => !t || p.nome.toLowerCase().includes(t) || (p.codigo || '').includes(t) || (p.codigo_caixa || '').includes(t) || (p.categoria || '').toLowerCase().includes(t)); };

VIEWS.pdv = async function () {
  const a = assin(), gestor = isGestor();
  $('#main').innerHTML = `<div class="bar"><h2>Vender</h2><span class="muted">${esc(S.perfil.nome)} · ${PAPEL[S.perfil.papel]}</span></div>${aviso(a)}
  <div class="pdv"><section class="card"><div class="scan"><input class="in" id="q" placeholder="Passe o leitor de código de barras ou escreva o nome…" autocomplete="off" inputmode="search" aria-label="Procurar produto"><button class="btn ghost" id="cam" type="button" title="Ler código com a câmara" aria-label="Ler código com a câmara">${ico('camera')}</button></div><div class="plist" id="lista"></div></section>
  <section class="card"><h3>Venda actual</h3><div id="cart"></div><div id="tot"></div>
    <div class="row" style="margin-top:12px"><label>Cliente<select class="in" id="cli"><option value="">Consumidor final</option>${opts(S.clientes.map(c => [c.id, c.nome]))}</select></label><label>Desconto (MT)<input class="in" id="desc" inputmode="decimal" value="0" ${gestor ? '' : 'disabled title="Só o gerente pode dar desconto"'}></label></div>
    <button class="link small" id="novoCli" type="button">+ Novo cliente</button>
    <div class="row"><label>Pagamento<select class="in" id="pag">${opts(PAGAMENTOS)}</select></label><label id="recL">Valor recebido<input class="in" id="rec" inputmode="decimal"></label></div>
    <div id="troco" class="tot"></div>
    <div class="row"><button class="btn ghost" id="lmp" type="button">Cancelar venda</button><button class="btn" id="fin" type="button" ${a.ok ? '' : 'disabled'}>${ico('check')} Finalizar venda</button></div></section></div>`;
  const q = $('#q');
  window.pdvLista = () => {
    const l = filtrarProdutos(q.value.trim()).slice(0, 40);
    $('#lista').innerHTML = l.length ? l.map(p => { const v = vendavel(p); return `<div class="pi" ${v <= 0 ? 'style="opacity:.55"' : ''}><button class="main" type="button" data-id="${p.id}" data-c="0"><b>${esc(p.nome)}</b><small>${esc(p.categoria || '')} · stock ${v}${p.un_por_caixa ? ` (${Math.floor(v / p.un_por_caixa)} caixas)` : ''}${p.controlado ? ' · exige receita' : ''}</small></button><span class="px">${mt(p.preco)}</span>${p.un_por_caixa && p.preco_caixa ? `<button class="btn ghost sm" type="button" data-id="${p.id}" data-c="1" title="Vender a caixa fechada">Caixa ${p.un_por_caixa} un · ${mt(p.preco_caixa)}</button>` : ''}</div>`; }).join('') : `<div class="empty">Nenhum produto encontrado.${gestor ? '<br>Registe-o em “Produtos”.' : '<br>Peça ao gerente para o registar.'}</div>`;
  };
  $('#lista').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) { pdvAdd(b.dataset.id, b.dataset.c === '1'); if (innerWidth > 900) q.focus(); } };
  q.oninput = pdvLista;
  q.onkeydown = e => {
    if (e.key !== 'Enter') return; e.preventDefault(); const t = q.value.trim(); if (!t) return;
    const r = achar(t);
    if (r) { pdvAdd(r.p.id, r.caixa); q.value = ''; pdvLista(); return; }
    const m = filtrarProdutos(t); if (m.length === 1) { pdvAdd(m[0].id, false); q.value = ''; pdvLista(); } else { toast('Código ou produto não encontrado.', true); q.select(); }
  };
  $('#cam').onclick = () => lerCamera(c => { const r = achar(c); if (r) pdvAdd(r.p.id, r.caixa); else { q.value = c; pdvLista(); toast('Código ' + c + ' não registado.', true); } });
  $('#cart').onclick = async e => {
    const b = e.target.closest('button[data-k]'); if (!b) return; const it = cart.find(c => cartKey(c) === b.dataset.k); if (!it) return; const p = prodById(it.pid);
    if (b.dataset.a === '+') return pdvAdd(it.pid, it.caixa);
    const rem = b.dataset.a === 'x' || it.qtd <= 1;
    const g = await autorizar(rem ? `Retirar «${p.nome}» da venda em curso.` : `Diminuir a quantidade de «${p.nome}».`, rem ? 'retirar_item' : 'diminuir_item', `${p.nome} (${it.qtd}${it.caixa ? ' caixa(s)' : ''}) na venda em curso`);
    if (!g) return; g.fim();
    if (rem) cart = cart.filter(c => c !== it); else it.qtd--;
    pdvDraw();
  };
  ['desc', 'pag', 'rec'].forEach(i => $('#' + i).oninput = pdvDraw);
  $('#novoCli').onclick = () => formCliente(null, c => { $('#cli').insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.nome)}</option>`); $('#cli').value = c.id; });
  $('#lmp').onclick = async () => {
    if (!cart.length) return;
    const g = await autorizar('Cancelar a venda em curso.', 'cancelar_venda_em_curso', `${cart.length} linha(s) descartadas`);
    if (!g) return; g.fim(); cart = []; pdvDraw();
  };
  $('#fin').onclick = pdvFinalizar;
  pdvLista(); pdvDraw(); if (innerWidth > 900) q.focus();
};
function pdvAdd(pid, caixa) {
  const p = prodById(pid); if (!p) return;
  if (!assin().ok) return toast('A subscrição expirou. Renove para vender.', true);
  if (caixa && (!p.un_por_caixa || !p.preco_caixa)) return toast('Este produto não tem venda por caixa.', true);
  const usado = cart.filter(c => c.pid === pid).reduce((s, c) => s + unidadesDe(c, p), 0), novo = caixa ? p.un_por_caixa : 1;
  if (usado + novo > vendavel(p)) { bip(); return toast(`Sem stock suficiente de «${p.nome}» (lotes expirados não são vendidos).`, true); }
  const add = () => { const it = cart.find(c => c.pid === pid && c.caixa === caixa); if (it) it.qtd++; else cart.push({ pid, caixa, qtd: 1 }); pdvDraw(); };
  if (p.controlado && !cart.some(c => c.pid === pid)) return ask(`«${p.nome}» é medicamento controlado e exige receita médica. Confirma que a receita foi apresentada?`, add, 'Receita apresentada');
  add();
}
function pdvTotais() {
  let sub = 0, iva = 0;
  cart.forEach(c => { const p = prodById(c.pid), l = precoUn(c, p) * c.qtd; sub += l; iva += l * (p.iva || 0) / (100 + (p.iva || 0)); });
  sub = r2(sub); const d = Math.min(sub, Math.max(0, num($('#desc') ? $('#desc').value : 0))), tot = r2(sub - d);
  return { sub, desc: d, tot, iva: r2(iva * (sub ? tot / sub : 1)) };
}
function pdvDraw() {
  cart = cart.filter(c => prodById(c.pid));
  const podeRem = true;
  $('#cart').innerHTML = cart.length ? cart.map(c => { const p = prodById(c.pid), k = cartKey(c); return `<div class="ci"><div style="min-width:0"><b>${esc(p.nome)}</b>${c.caixa ? ` <span class="tag ok">caixa de ${p.un_por_caixa}</span>` : ''}<br><span class="muted small">${mt(precoUn(c, p))}</span></div><div class="q"><button type="button" data-a="-" data-k="${k}" aria-label="Diminuir">−</button><b>${c.qtd}</b><button type="button" data-a="+" data-k="${k}" aria-label="Aumentar">+</button></div><div style="text-align:right"><b>${mt(precoUn(c, p) * c.qtd)}</b>${podeRem ? `<br><button class="link small" type="button" data-a="x" data-k="${k}">retirar</button>` : ''}</div></div>`; }).join('') : '<div class="empty">Leia um código de barras ou toque num produto.</div>';
  const t = pdvTotais();
  $('#tot').innerHTML = `<div class="tot"><span>Subtotal</span><span>${mt(t.sub)}</span></div>${t.desc ? `<div class="tot"><span>Desconto</span><span>-${mt(t.desc)}</span></div>` : ''}${t.iva ? `<div class="tot muted"><span>IVA incluído</span><span>${mt(t.iva)}</span></div>` : ''}<div class="tot big"><span>TOTAL</span><span>${mt(t.tot)}</span></div>`;
  const pg = $('#pag').value; $('#recL').style.display = pg === 'Numerário' ? '' : 'none';
  const r = num($('#rec').value); $('#troco').innerHTML = pg === 'Numerário' && r ? `<span>Troco</span><b>${mt(Math.max(0, r - t.tot))}</b>` : '';
}
async function pdvFinalizar() {
  if (!cart.length) return toast('A venda está vazia.', true);
  const t = pdvTotais(), pg = $('#pag').value, cli = $('#cli').value, rec = num($('#rec').value), b = $('#fin');
  if (pg === 'Fiado' && !cli) return toast('Escolha o cliente para vender a fiado.', true);
  if (pg === 'Numerário' && rec && rec < t.tot) return toast('O valor recebido é menor que o total.', true);
  b.disabled = true;
  try {
    const itens = cart.map(c => ({ produto_id: c.pid, qtd: c.qtd, caixa: c.caixa }));
    const v = await q(sb.rpc('registar_venda', { p_itens: itens, p_pagamento: pg, p_cliente: cli || null, p_desconto: t.desc, p_recebido: rec }));
    cart = [];
    const cl = await all(() => sb.from('clientes').select('*').order('nome')); S.clientes = cl;
    await recarregarProdutos(); await VIEWS.pdv(); bip(); mostrarRecibo(v);
  } catch (e) { erro(e); b.disabled = false; await recarregarProdutos().catch(() => { }); if (window.pdvLista) pdvLista(); }
}
function reciboHTML(v) {
  const c = S.loja, cli = S.clientes.find(x => x.id === v.cliente_id);
  return `<div class="rc"><div class="c"><b>${esc(c.nome)}</b><br>${esc(c.endereco || '')}${c.nuit ? '<br>NUIT: ' + esc(c.nuit) : ''}${c.tel ? '<br>Tel: ' + esc(c.tel) : ''}</div><hr>
  <div>Recibo: ${nvenda(v)}${v.anulada ? ' (ANULADO)' : ''}<br>${fdt(v.data)}<br>Operador: ${esc(v.usuario_nome)}${cli ? '<br>Cliente: ' + esc(cli.nome) : ''}</div><hr>
  ${v.itens.map(i => `<div class="l"><span>${i.qtd} x ${esc(i.nome)}${i.caixa ? ' (caixa)' : ''}</span><span>${mt(i.total)}</span></div>`).join('')}<hr>
  <div class="l"><span>Subtotal</span><span>${mt(v.subtotal)}</span></div>${+v.desconto ? `<div class="l"><span>Desconto</span><span>-${mt(v.desconto)}</span></div>` : ''}
  <div class="l b"><span>TOTAL</span><span>${mt(v.total)}</span></div>${+v.iva ? `<div class="l"><span>IVA incluído</span><span>${mt(v.iva)}</span></div>` : ''}
  <div class="l"><span>Pagamento</span><span>${esc(v.pagamento)}</span></div>${v.pagamento === 'Numerário' && +v.recebido ? `<div class="l"><span>Recebido</span><span>${mt(v.recebido)}</span></div><div class="l"><span>Troco</span><span>${mt(v.troco)}</span></div>` : ''}
  <hr><div class="c">Obrigado pela preferência!<br>Guarde este recibo.</div></div>`;
}
function mostrarRecibo(v) {
  const w = modal('Venda ' + nvenda(v), reciboHTML(v) + `<div class="mf" style="justify-content:center"><button type="button" class="btn" id="pr">Imprimir recibo</button>${!v.anulada ? '<button type="button" class="btn ghost" id="an">Anular venda</button>' : ''}</div>`, {});
  $('#pr', w.m).onclick = () => imprimir(reciboHTML(v));
  const an = $('#an', w.m); if (an) an.onclick = () => anularVenda(v, w);
}
function anularVenda(v, w) {
  modal('Anular ' + nvenda(v), `<p>Total ${mt(v.total)}. O stock volta ao lote de origem${v.pagamento === 'Fiado' ? ' e a dívida do cliente é reduzida' : ''}.</p>${fld('Motivo da anulação', 'motivo', '', 'text', 'required placeholder="Ex.: cliente sem dinheiro"')}`, {
    okText: 'Continuar', danger: true,
    onOk: async d => {
      const a = await autorizar(`Anular a venda ${nvenda(v)} (${mt(v.total)}).`, 'pedido_anulacao', `${nvenda(v)}: ${d.motivo}`);
      if (!a) return false;
      try { await q(a.aux.rpc('anular_venda', { p_venda: v.id, p_motivo: d.motivo })); } finally { a.fim(); }
      await recarregarProdutos(); S.clientes = await all(() => sb.from('clientes').select('*').order('nome'));
      toast('Venda anulada. Stock reposto.'); if (w) w.close(); if (cur === 'vendas') go('vendas', true);
    }
  });
}

/* ======================= VENDAS ======================= */
VIEWS.vendas = async function () {
  let dia = ymd();
  $('#main').innerHTML = `<div class="bar"><h2>Vendas</h2><input class="in" type="date" id="d" value="${dia}" style="width:auto" aria-label="Dia"></div><div class="card" id="c"></div>`;
  const draw = async () => {
    const l = await all(() => sb.from('vendas').select('*').gte('data', diaIso(dia)).lt('data', diaIso(dia, 1)).order('data', { ascending: false }));
    window._vs = l;
    const ok = l.filter(v => !v.anulada), pg = {}; ok.forEach(v => pg[v.pagamento] = (pg[v.pagamento] || 0) + +v.total);
    $('#c').innerHTML = l.length ? `<div class="tw"><table><tr><th>Nº</th><th>Hora</th><th>Vendedor</th><th>Pagamento</th><th class="n">Total</th><th></th></tr>${l.map(v => `<tr class="${v.anulada ? 'off' : ''}"><td>${nvenda(v)}</td><td>${fh(v.data)}</td><td>${esc(v.usuario_nome)}</td><td>${esc(v.pagamento)}</td><td class="n">${mt(v.total)}</td><td class="act"><button class="btn ghost sm" data-id="${v.id}">Ver</button></td></tr>`).join('')}</table></div>
      <p class="muted">Total do dia: <b>${mt(r2(ok.reduce((s, v) => s + +v.total, 0)))}</b> · ${Object.entries(pg).map(([k, x]) => `${esc(k)} ${mt(x)}`).join(' · ')}</p>${S.perfil.papel === 'caixa' ? '<p class="muted small">Está a ver apenas as suas vendas.</p>' : ''}` : '<div class="empty">Sem vendas neste dia.</div>';
  };
  $('#d').onchange = e => { dia = e.target.value || ymd(); draw().catch(erro); };
  $('#c').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) mostrarRecibo(window._vs.find(v => v.id === b.dataset.id)); };
  await draw();
};

/* ======================= PRODUTOS ======================= */
let pf = { q: '', f: 'todos', c: '' };
VIEWS.produtos = async function () {
  const adm = isGestor(), a = assin();
  $('#main').innerHTML = `<div class="bar"><h2>Produtos</h2><div class="act">${adm ? `<button class="btn ghost" id="ent">Entrada de stock</button><button class="btn ghost" id="cats">Categorias</button><button class="btn" id="novo" ${a.ok ? '' : 'disabled'}>+ Novo produto</button>` : ''}</div></div>${aviso(a)}
  <div class="card"><div class="row"><input class="in" id="q" placeholder="Procurar por nome, código ou categoria…" value="${esc(pf.q)}" aria-label="Procurar"><select class="in" id="c" aria-label="Categoria"><option value="">Todas as categorias</option>${opts(S.cats.map(c => c.nome), pf.c)}</select><select class="in" id="f" aria-label="Estado">${opts([['todos', 'Todos'], ['baixo', 'Stock baixo'], ['sem', 'Sem stock'], ['expira', 'A expirar ou expirados']], pf.f)}</select></div><div id="tb"></div></div>`;
  const draw = () => {
    const t = pf.q.toLowerCase();
    const l = S.produtos.filter(p => (!t || p.nome.toLowerCase().includes(t) || (p.codigo || '').includes(t) || (p.codigo_caixa || '').includes(t) || (p.categoria || '').toLowerCase().includes(t)) && (!pf.c || p.categoria === pf.c) &&
      (pf.f === 'todos' || (pf.f === 'baixo' && estoque(p) > 0 && estoque(p) <= p.minimo) || (pf.f === 'sem' && estoque(p) <= 0) || (pf.f === 'expira' && p.lotes.some(x => x.validade && diasPara(x.validade) <= 90))));
    $('#tb').innerHTML = l.length ? `<div class="tw"><table><tr><th>Produto</th><th>Categoria</th><th class="n">Stock</th><th class="n">Preço</th><th>Validade</th><th>Estado</th><th></th></tr>${l.map(p => { const s = estado(p), e = estoque(p); return `<tr><td><b>${esc(p.nome)}</b>${p.controlado ? ' <span class="tag baixo">receita</span>' : ''}<br><span class="muted small">${esc(p.codigo || 'sem código')}${p.un_por_caixa ? ' · caixa ' + esc(p.codigo_caixa || '—') + ' (' + p.un_por_caixa + ' un)' : ''}</span></td><td>${esc(p.categoria || '—')}</td><td class="n">${e}${p.un_por_caixa ? `<br><span class="muted small">${Math.floor(e / p.un_por_caixa)} caixas</span>` : ''}</td><td class="n">${mt(p.preco)}${p.preco_caixa ? `<br><span class="muted small">caixa ${mt(p.preco_caixa)}</span>` : ''}</td><td>${fd(proxVal(p))}</td><td><span class="tag ${s}">${ESTADO_TXT[s]}</span></td><td class="act">${adm ? `<button class="btn ghost sm" data-a="in" data-id="${p.id}">+ Stock</button><button class="btn ghost sm" data-a="out" data-id="${p.id}">Baixa</button><button class="btn ghost sm" data-a="ed" data-id="${p.id}">Editar</button><button class="btn ghost sm" data-a="del" data-id="${p.id}" aria-label="Apagar">Apagar</button>` : ''}</td></tr>`; }).join('')}</table></div>` : `<div class="empty">Nenhum produto. ${adm ? 'Toque em “+ Novo produto” para começar.' : ''}</div>`;
  };
  $('#q').oninput = e => { pf.q = e.target.value; draw(); }; $('#c').onchange = e => { pf.c = e.target.value; draw(); }; $('#f').onchange = e => { pf.f = e.target.value; draw(); };
  if (adm) {
    $('#novo').onclick = () => formProduto(); $('#cats').onclick = gerirCategorias; $('#ent').onclick = escolherEntrada;
    $('#tb').onclick = e => {
      const b = e.target.closest('button'); if (!b) return; const p = prodById(b.dataset.id);
      if (b.dataset.a === 'ed') formProduto(p); if (b.dataset.a === 'in') formEntrada(p); if (b.dataset.a === 'out') formBaixa(p);
      if (b.dataset.a === 'del') ask(`Apagar «${p.nome}»? O histórico de vendas é mantido.`, async () => { await q(sb.from('produtos').update({ ativo: false }).eq('id', p.id)); await recarregarProdutos(); go('produtos', true); }, 'Apagar', true);
    };
  }
  draw();
};
function formProduto(p) {
  const novo = !p; p = p || { nome: '', codigo: '', categoria: '', unidade: 'un', custo: '', preco: '', minimo: 10, iva: 0, controlado: false, codigo_caixa: '', un_por_caixa: '', preco_caixa: '' };
  const nomesCat = S.cats.map(c => c.nome); if (p.categoria && !nomesCat.includes(p.categoria)) nomesCat.push(p.categoria);
  const temCaixa = !!p.un_por_caixa;
  const w = modal(novo ? 'Novo produto' : 'Editar produto', `
    ${fld('Nome do produto', 'nome', p.nome, 'text', 'required')}
    <div class="row"><label>Categoria<select class="in" name="categoria" id="selcat" required><option value="" disabled ${p.categoria ? '' : 'selected'}>Escolha a categoria…</option>${opts(nomesCat, p.categoria)}<option value="__nova">＋ Criar nova categoria…</option></select></label>
    <label>Unidade de venda<select class="in" name="unidade">${opts(UNIDADES, p.unidade)}</select></label></div>
    <div id="novacat" hidden>${fld('Nome da nova categoria', 'novacat', '', 'text')}</div>
    ${fld('Código de barras de 1 unidade', 'codigo', p.codigo, 'text', 'inputmode="numeric" autocomplete="off"', 'Clique aqui e passe o leitor. É o código do pacote/peça que o cliente leva.')}
    <label class="chk"><input type="checkbox" id="temcx" ${temCaixa ? 'checked' : ''}> Também vendo por caixa / embalagem grande</label>
    <div id="cx" ${temCaixa ? '' : 'hidden'} class="card" style="background:var(--bg)">
      <p class="small muted" style="margin-top:0">Exemplo: uma caixa traz 50 pacotes de bolacha. O pacote tem um código; a caixa tem outro. Ao ler o código da <b>caixa</b> na entrada de stock, entram 50 unidades. No caixa, ler o <b>pacote</b> vende 1.</p>
      <div class="row">${fld('Código de barras da caixa', 'codigo_caixa', p.codigo_caixa, 'text', 'inputmode="numeric"')}${fld('Unidades por caixa', 'un_por_caixa', p.un_por_caixa, 'number', 'min="2"')}${fld('Preço da caixa (MT)', 'preco_caixa', p.preco_caixa, 'text', 'inputmode="decimal"')}</div></div>
    <div class="row">${fld('Preço de custo por unidade (MT)', 'custo', p.custo, 'text', 'inputmode="decimal" required')}${fld('Preço de venda por unidade (MT)', 'preco', p.preco, 'text', 'inputmode="decimal" required')}</div>
    <div class="row">${fld('Avisar quando o stock chegar a', 'minimo', p.minimo, 'number', 'min="0"')}<label>IVA<select class="in" name="iva"><option value="0" ${!p.iva ? 'selected' : ''}>Isento (0%)</option><option value="16" ${p.iva === 16 ? 'selected' : ''}>16%</option></select></label></div>
    <label class="chk"><input type="checkbox" name="controlado" ${p.controlado ? 'checked' : ''}> Medicamento controlado (pede receita na venda)</label>
    ${novo ? `<hr style="border:0;border-top:1px solid var(--line);margin:10px 0"><h3>Stock inicial (opcional)</h3><div class="row">${fld('Quantidade', 'qtd', '', 'number', 'min="0"')}<label>Contada em<select class="in" name="em" id="em"><option value="un">unidades</option></select></label></div><div class="row">${fld('Lote', 'lote', '')}${fld('Validade', 'validade', '', 'date')}</div>` : ''}`, {
    wide: true,
    onOk: async (d, f) => {
      let cat = d.categoria;
      if (cat === '__nova') { cat = (d.novacat || '').trim(); if (!cat) throw new Error('Escreva o nome da nova categoria.'); if (!S.cats.some(c => c.nome === cat)) { const r = await q(sb.from('categorias').insert({ loja_id: S.loja.id, nome: cat }).select()); S.cats.push(r[0]); S.cats.sort((a, b) => a.nome.localeCompare(b.nome)); } }
      if (!cat) throw new Error('Escolha a categoria do produto.');
      const cx = $('#temcx', f).checked;
      if (cx && (parseInt(d.un_por_caixa) < 2 || !num(d.preco_caixa))) throw new Error('Para vender por caixa indique as unidades por caixa (2 ou mais) e o preço da caixa.');
      const o = { nome: d.nome.trim(), codigo: d.codigo.trim() || null, categoria: cat, unidade: d.unidade, custo: num(d.custo), preco: num(d.preco), minimo: parseInt(d.minimo) || 0, iva: parseInt(d.iva) || 0, controlado: !!d.controlado, codigo_caixa: cx ? (d.codigo_caixa.trim() || null) : null, un_por_caixa: cx ? parseInt(d.un_por_caixa) : null, preco_caixa: cx ? num(d.preco_caixa) : null };
      if (novo) {
        const r = await q(sb.from('produtos').insert({ ...o, loja_id: S.loja.id }).select());
        const qtd = parseInt(d.qtd) || 0;
        if (qtd > 0) await q(sb.rpc('entrada_stock', { p_produto: r[0].id, p_qtd: qtd * (d.em === 'cx' && o.un_por_caixa ? o.un_por_caixa : 1), p_lote: d.lote || null, p_validade: d.validade || null, p_custo: o.custo, p_nota: 'Stock inicial' }));
      } else await q(sb.from('produtos').update(o).eq('id', p.id));
      await recarregarProdutos(); go('produtos', true); toast('Produto guardado.');
    }
  });
  const sel = $('#selcat', w.m), nc = $('#novacat', w.m), cxb = $('#cx', w.m), tc = $('#temcx', w.m);
  sel.onchange = () => { nc.hidden = sel.value !== '__nova'; if (!nc.hidden) $('input', nc).focus(); };
  const em = $('#em', w.m);
  tc.onchange = () => { cxb.hidden = !tc.checked; if (em) em.innerHTML = '<option value="un">unidades</option>' + (tc.checked ? '<option value="cx">caixas</option>' : ''); };
}
function gerirCategorias() {
  const w = modal('Categorias de produtos', `<div id="lc"></div><div class="row" style="margin-top:10px">${fld('Nova categoria', 'nc', '', 'text', 'placeholder="Ex.: Cartões de recarga"')}<div style="flex:none;align-self:flex-end;margin-bottom:12px"><button type="button" class="btn" id="add">Adicionar</button></div></div>`, {});
  const draw = () => { $('#lc', w.m).innerHTML = `<div class="tw" style="max-height:44vh;overflow:auto"><table>${S.cats.map(c => `<tr><td>${esc(c.nome)}</td><td class="n">${S.produtos.filter(p => p.categoria === c.nome).length} produto(s)</td><td class="act"><button type="button" class="btn ghost sm" data-id="${c.id}">Apagar</button></td></tr>`).join('')}</table></div>`; };
  draw();
  $('#add', w.m).onclick = async () => {
    const i = $('[name=nc]', w.m), n = i.value.trim(); if (!n) return;
    try { const r = await q(sb.from('categorias').insert({ loja_id: S.loja.id, nome: n }).select()); S.cats.push(r[0]); S.cats.sort((a, b) => a.nome.localeCompare(b.nome)); i.value = ''; draw(); } catch (e) { erro(e); }
  };
  $('#lc', w.m).onclick = async e => { const b = e.target.closest('button[data-id]'); if (!b) return; try { await q(sb.from('categorias').delete().eq('id', b.dataset.id)); S.cats = S.cats.filter(c => c.id !== b.dataset.id); draw(); } catch (er) { erro(er); } };
}
function escolherEntrada() {
  modal('Entrada de stock', `<p class="muted">Passe o leitor no código do produto ou da caixa, ou escreva o nome.</p>${fld('Código ou nome', 'b', '', 'text', 'required autocomplete="off"')}`, {
    okText: 'Continuar',
    onOk: async d => {
      const r = achar(d.b); let p = r && r.p, cx = !!(r && r.caixa);
      if (!p) { const m = filtrarProdutos(d.b.trim()); if (m.length === 1) p = m[0]; else if (m.length > 1) throw new Error('Há vários produtos com esse nome. Escreva mais letras ou use o código.'); }
      if (!p) throw new Error('Produto não encontrado. Registe-o primeiro em “+ Novo produto”.');
      setTimeout(() => formEntrada(p, cx), 50);
    }
  });
}
function formEntrada(p, caixas) {
  modal('Entrada de stock — ' + esc(p.nome), `${p.un_por_caixa ? `<p class="small muted">1 caixa = ${p.un_por_caixa} unidades.</p>` : ''}
    <div class="row">${fld('Quantidade recebida', 'qtd', '', 'number', 'min="1" required')}<label>Contada em<select class="in" name="em"><option value="un" ${caixas ? '' : 'selected'}>unidades</option>${p.un_por_caixa ? `<option value="cx" ${caixas ? 'selected' : ''}>caixas</option>` : ''}</select></label></div>
    <div class="row">${fld('Lote', 'lote', '')}${fld('Validade', 'validade', '', 'date')}</div>
    <div class="row">${fld('Custo por unidade (MT)', 'custo', p.custo, 'text', 'inputmode="decimal"')}${fld('Nota (fornecedor, factura…)', 'nota', '')}</div>`, {
    okText: 'Dar entrada',
    onOk: async d => {
      const n = parseInt(d.qtd) * (d.em === 'cx' ? p.un_por_caixa : 1); if (!(n > 0)) throw new Error('Quantidade inválida.');
      await q(sb.rpc('entrada_stock', { p_produto: p.id, p_qtd: n, p_lote: d.lote || null, p_validade: d.validade || null, p_custo: num(d.custo), p_nota: d.nota || 'Entrada' }));
      await recarregarProdutos(); toast(`Entraram ${n} unidades de ${p.nome}.`); if (cur === 'produtos') go('produtos', true);
    }
  });
}
function formBaixa(p) {
  const ls = p.lotes.filter(l => l.qtd > 0); if (!ls.length) return toast('Este produto não tem stock.', true);
  modal('Baixa de stock — ' + esc(p.nome), `<label>Lote<select class="in" name="lote">${ls.map(l => `<option value="${l.id}">${esc(l.lote || 'sem lote')} · validade ${fd(l.validade)} · ${l.qtd} un.</option>`).join('')}</select></label>${fld('Quantidade', 'qtd', '', 'number', 'min="1" required')}<label>Motivo<select class="in" name="m"><option>Expirado</option><option>Danificado</option><option>Perda ou furto</option><option>Ajuste de inventário</option></select></label>`, {
    okText: 'Dar baixa', danger: true,
    onOk: async d => { await q(sb.rpc('baixa_stock', { p_lote: d.lote, p_qtd: parseInt(d.qtd), p_motivo: d.m })); await recarregarProdutos(); toast('Baixa registada.'); go('produtos', true); }
  });
}

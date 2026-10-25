'use strict';
/* GestMZ — recibo: ver, imprimir, guardar em PDF e partilhar.
   Os dados vêm sempre da venda já registada (itens guardados na venda); nada aqui toca em stock, pagamentos ou preços. */

const PAPEIS = { '58': { nome: '58 mm (térmica)', mm: 58, cols: 32 }, '80': { nome: '80 mm (térmica)', mm: 80, cols: 42 }, 'a4': { nome: 'A4', mm: 210, cols: 56 } };
const papelAtual = () => { const k = jGet('gestmz_papel', '80'); return PAPEIS[k] ? k : '80'; };
const dinheiro = n => mt(n).replace(/[\s  ]+/g, ' ');

/* modelo único do recibo (usado no ecrã, na impressão e no PDF) */
function reciboModelo(v) {
  const c = S.loja || {}, cli = (S.clientes || []).find(x => x.id === v.cliente_id);
  return {
    loja: c.nome || '', endereco: c.endereco || '', fiscal: c.nuit ? 'NUIT: ' + c.nuit : '', tel: c.tel ? 'Tel: ' + c.tel : '',
    numero: nvenda(v), anulada: !!v.anulada, pendente: !!v.pendente, data: fdt(v.data), operador: v.usuario_nome || '', cliente: cli ? cli.nome : '',
    itens: (v.itens || []).map(i => ({
      nome: i.nome, apres: i.caixa ? ' (' + String(i.apresentacao || 'caixa').toLowerCase() + (i.un_por_caixa ? ' de ' + i.un_por_caixa : '') + ')' : '',
      qtd: i.qtd, preco: i.preco != null ? +i.preco : (i.qtd ? +i.total / i.qtd : 0), total: +i.total
    })),
    subtotal: +v.subtotal || 0, desconto: +v.desconto || 0, iva: +v.iva || 0, total: +v.total || 0, pagamento: v.pagamento || '',
    recebido: v.pagamento === 'Numerário' && +v.recebido ? +v.recebido : 0, troco: v.pagamento === 'Numerário' && +v.recebido ? +v.troco || 0 : 0,
    fim: 'Obrigado pela preferência!', fim2: 'Guarde este recibo.'
  };
}

/* ---------- HTML do recibo (ecrã e impressão do navegador) ---------- */
function reciboHTML(v) {
  const m = reciboModelo(v), L = (a, b, cls) => `<div class="l ${cls || ''}"><span>${a}</span><span>${b}</span></div>`;
  return `<div class="rc"><div class="c"><b>${esc(m.loja)}</b>${m.endereco ? '<br>' + esc(m.endereco) : ''}${m.fiscal ? '<br>' + esc(m.fiscal) : ''}${m.tel ? '<br>' + esc(m.tel) : ''}</div><hr>
  <div>Recibo: ${esc(m.numero)}${m.anulada ? ' (ANULADO)' : ''}<br>${esc(m.data)}<br>Operador: ${esc(m.operador)}${m.cliente ? '<br>Cliente: ' + esc(m.cliente) : ''}</div><hr>
  ${m.itens.map(i => `<div class="it"><div class="n">${esc(i.nome)}${esc(i.apres)}</div>${L(`${i.qtd} x ${dinheiro(i.preco)}`, dinheiro(i.total))}</div>`).join('')}<hr>
  ${L('Subtotal', dinheiro(m.subtotal))}${m.desconto ? L('Desconto', '-' + dinheiro(m.desconto)) : ''}
  ${L('TOTAL', dinheiro(m.total), 'b')}${m.iva ? L('IVA incluído', dinheiro(m.iva)) : ''}
  ${L('Pagamento', esc(m.pagamento))}${m.recebido ? L('Recebido', dinheiro(m.recebido)) + L('Troco', dinheiro(m.troco)) : ''}
  <hr><div class="c">${esc(m.fim)}<br>${esc(m.fim2)}</div></div>`;
}

/* ---------- PDF (gerado aqui, sem bibliotecas; texto em Courier, acentos em WinAnsi) ---------- */
const WIN = { '—': 0x97, '–': 0x96, '€': 0x80, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85 };
function pdfStr(t) { // texto → string binária entre parênteses, com escapes
  let o = '';
  for (const ch of String(t)) {
    const c = ch.codePointAt(0); let b = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : (WIN[ch] || 0x3f);
    if (b < 0x20) b = 0x20;
    const s = String.fromCharCode(b); o += (s === '(' || s === ')' || s === '\\') ? '\\' + s : s;
  }
  return '(' + o + ')';
}
function reciboLinhas(m, cols) {
  const out = [], pad = (t, n) => t + ' '.repeat(Math.max(0, n - t.length)), cen = t => ' '.repeat(Math.max(0, Math.floor((cols - t.length) / 2))) + t;
  const palavras = t => { const r = []; let l = ''; for (let w of String(t).split(/\s+/).filter(Boolean)) { while (w.length > cols) { if (l) { r.push(l); l = ''; } r.push(w.slice(0, cols)); w = w.slice(cols); } if (!l) l = w; else if ((l + ' ' + w).length <= cols) l += ' ' + w; else { r.push(l); l = w; } } if (l) r.push(l); return r; };
  const lr = (a, b, bold) => { if (a.length + b.length + 1 <= cols) out.push({ t: a + ' '.repeat(cols - a.length - b.length) + b, b: bold }); else { palavras(a).forEach(x => out.push({ t: x, b: bold })); out.push({ t: ' '.repeat(Math.max(0, cols - b.length)) + b, b: bold }); } };
  const hr = () => out.push({ t: '-'.repeat(cols) });
  palavras(m.loja).forEach(x => out.push({ t: cen(x), b: true }));
  [m.endereco, m.fiscal, m.tel].filter(Boolean).forEach(t => palavras(t).forEach(x => out.push({ t: cen(x) })));
  hr(); palavras('Recibo: ' + m.numero + (m.anulada ? ' (ANULADO)' : '')).forEach(x => out.push({ t: x, b: true }));
  out.push({ t: m.data }); palavras('Operador: ' + m.operador).forEach(x => out.push({ t: x })); if (m.cliente) palavras('Cliente: ' + m.cliente).forEach(x => out.push({ t: x })); hr();
  m.itens.forEach(i => { palavras(i.nome + i.apres).forEach(x => out.push({ t: x })); lr(`${i.qtd} x ${dinheiro(i.preco)}`, dinheiro(i.total)); });
  hr(); lr('Subtotal', dinheiro(m.subtotal)); if (m.desconto) lr('Desconto', '-' + dinheiro(m.desconto)); lr('TOTAL', dinheiro(m.total), true); if (m.iva) lr('IVA incluido', dinheiro(m.iva));
  lr('Pagamento', m.pagamento); if (m.recebido) { lr('Recebido', dinheiro(m.recebido)); lr('Troco', dinheiro(m.troco)); }
  hr(); out.push({ t: cen(m.fim) }); out.push({ t: cen(m.fim2) });
  return out;
}
function pdfRecibo(m, k) {
  const P = PAPEIS[k] || PAPEIS['80'], cols = P.cols, lin = reciboLinhas(m, cols);
  const W = k === 'a4' ? 595.28 : P.mm * 72 / 25.4, mx = k === 'a4' ? 56 : 7, fs = Math.min(k === 'a4' ? 10.5 : 20, (W - 2 * mx) / (cols * 0.6)), ld = fs * 1.25, mt0 = k === 'a4' ? 56 : 10;
  const H = k === 'a4' ? Math.max(841.89, mt0 * 2 + lin.length * ld) : mt0 * 2 + lin.length * ld;
  let c = '';
  lin.forEach((l, n) => { c += `BT /${l.b ? 'F2' : 'F1'} ${fs.toFixed(2)} Tf ${mx.toFixed(2)} ${(H - mt0 - fs - n * ld).toFixed(2)} Td ${pdfStr(l.t)} Tj ET\n`; });
  const f = x => x.toFixed(2), objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${c.length} >>\nstream\n${c}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title ${pdfStr('Recibo ' + m.numero)} /Producer (GestMZ) >>`
  ];
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const off = [];
  objs.forEach((o, i) => { off.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x0 = pdf.length; pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${x0}\n%%EOF\n`;
  const u = new Uint8Array(pdf.length); for (let i = 0; i < pdf.length; i++) u[i] = pdf.charCodeAt(i) & 255;
  return u;
}
const nomePDF = v => 'recibo-' + (v.num == null ? 'por-enviar-' + String(v.id || '').slice(-6) : String(v.num).padStart(5, '0')) + '.pdf';
const pdfBlob = v => new Blob([pdfRecibo(reciboModelo(v), papelAtual())], { type: 'application/pdf' });
const noApp = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };
const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

/* aplicação Android (APK): o ecrã interno não imprime; gera o PDF e abre a folha de partilha do Android (imprimir, guardar, WhatsApp…) */
async function pdfNoApp(v) {
  const P = (window.Capacitor && window.Capacitor.Plugins) || {};
  if (!P.Filesystem || !P.Share) throw new Error('Esta versão da aplicação ainda não tem a impressão. Instale o APK novo (Actions → Gerar APK).');
  const r = await P.Filesystem.writeFile({ path: nomePDF(v), data: b64(pdfRecibo(reciboModelo(v), papelAtual())), directory: 'CACHE' });
  await P.Share.share({ title: 'Recibo ' + nvenda(v), text: 'Recibo ' + nvenda(v) + ' — ' + S.loja.nome, url: r.uri, dialogTitle: 'Imprimir, guardar ou partilhar o recibo' });
}
function descarregar(blob, nome) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.rel = 'noopener'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 8000);
}
async function guardarPDF(v) {
  try {
    if (noApp()) return await pdfNoApp(v);
    descarregar(pdfBlob(v), nomePDF(v));
    toast('PDF do recibo gerado. Procure «' + nomePDF(v) + '» nas Transferências do aparelho.');
  } catch (e) { if (e && /cancel/i.test(e.name + e.message)) return; toast('Não foi possível gerar o PDF: ' + (e.message || e), true); }
}
async function partilharRecibo(v) {
  try {
    if (noApp()) return await pdfNoApp(v);
    const blob = pdfBlob(v), f = new File([blob], nomePDF(v), { type: 'application/pdf' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Recibo ' + nvenda(v), text: 'Recibo ' + nvenda(v) + ' — ' + S.loja.nome }); return; }
    descarregar(blob, nomePDF(v)); toast('Este aparelho não partilha ficheiros directamente. O PDF foi guardado; envie-o a partir das Transferências.', true);
  } catch (e) { if (e && (e.name === 'AbortError' || /cancel/i.test(String(e.message)))) return; toast('Não foi possível partilhar: ' + (e.message || e), true); }
}
/* impressão do navegador (computador e Chrome do telemóvel) */
async function imprimirRecibo(v) {
  try {
    if (noApp()) return await pdfNoApp(v);
    if (typeof window.print !== 'function') return toast('Este navegador não imprime. Use «Guardar em PDF» ou «Partilhar».', true);
    const k = papelAtual(), P = PAPEIS[k], el = $('#recibo');
    el.className = 'p' + k; el.innerHTML = reciboHTML(v);
    let st = $('#pagina'); if (!st) { st = document.createElement('style'); st.id = 'pagina'; document.head.appendChild(st); }
    st.textContent = k === 'a4' ? '@page{margin:12mm}' : `@page{margin:2mm;size:${P.mm}mm auto}`;
    let abriu = false; const on = () => { abriu = true; }, fim = () => { el.innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('beforeprint', on, { once: true }); window.addEventListener('afterprint', fim);
    window.print();
    setTimeout(() => { window.removeEventListener('beforeprint', on); if (!abriu) toast('Se a janela de impressão não abriu, este aparelho não a permite aqui. Use «Guardar em PDF» ou «Partilhar».', true); }, 1500);
  } catch (e) { toast('Não foi possível imprimir: ' + (e.message || e) + '. Use «Guardar em PDF».', true); }
}

function mostrarRecibo(v) {
  const w = modal('Venda ' + nvenda(v), reciboHTML(v) + `<div class="rcopt"><label>Papel <select id="pap" class="in">${opts(Object.entries(PAPEIS).map(([k, p]) => [k, p.nome]), papelAtual())}</select></label></div>
    <div class="mf rcact"><button type="button" class="btn" id="pr">Imprimir recibo</button><button type="button" class="btn ghost" id="pdf">Guardar em PDF</button><button type="button" class="btn ghost" id="sh">Partilhar</button>${!v.anulada && !v.pendente ? '<button type="button" class="btn ghost" id="an">Anular venda</button>' : ''}</div>`, {});
  $('#pr', w.m).onclick = () => imprimirRecibo(v);
  $('#pdf', w.m).onclick = () => guardarPDF(v);
  $('#sh', w.m).onclick = () => partilharRecibo(v);
  $('#pap', w.m).onchange = e => { jSet('gestmz_papel', e.target.value); };
  const an = $('#an', w.m); if (an) an.onclick = () => anularVenda(v, w);
}

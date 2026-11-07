'use strict';
/* GestMZ — recibo: ver, imprimir, guardar em PDF e partilhar.
   Os dados vêm sempre da venda já registada (itens guardados na venda); nada aqui toca em stock, pagamentos ou preços. */

const PAPEIS = { '58': { nome: '58 mm (térmica)', mm: 58, cols: 32 }, '80': { nome: '80 mm (térmica)', mm: 80, cols: 42 }, 'a4': { nome: 'A4', mm: 210, cols: 56 } };
const papelAtual = () => { const k = jGet('gestmz_papel', '80'); return PAPEIS[k] ? k : '80'; };
const dinheiro = n => mt(n).replace(/[\s  ]+/g, ' ');

/* ---------- personalização por loja (só o dono altera; guardada na base de dados e em cópia neste aparelho) ---------- */
const RC_PADRAO = { sucursal: '', email: '', extra: '', msg: 'Obrigado pela preferência!', msg2: 'Guarde este recibo.', logo: null,
  mostrar: { logo: true, nuit: true, operador: true, cliente: true, iva: true, unidade: true } };
let rcCfg = null, rcLogoPix = null, rcLogoDe = null;
const rcChave = () => 'gestmz_recibo_cfg_' + ((window.S && S.perfil && S.perfil.loja_id) || '');
const rcLogoOk = l => typeof l === 'string' && l.length <= 90000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(l);
function rcLimpar(c) {
  const o = c && typeof c === 'object' ? c : {}, t = (x, n) => typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
  const m = o.mostrar && typeof o.mostrar === 'object' ? o.mostrar : {}, r = { mostrar: {} };
  r.sucursal = t(o.sucursal, 40); r.email = t(o.email, 50); r.extra = t(o.extra, 100);
  r.msg = 'msg' in o ? t(o.msg, 60) : RC_PADRAO.msg; r.msg2 = 'msg2' in o ? t(o.msg2, 60) : RC_PADRAO.msg2; r.logo = rcLogoOk(o.logo) ? o.logo : null;
  Object.keys(RC_PADRAO.mostrar).forEach(k => { r.mostrar[k] = k in m ? m[k] === true : RC_PADRAO.mostrar[k]; });
  return r;
}
function reciboCfg() { if (!rcCfg) rcCfg = rcLimpar(jGet(rcChave(), null)); return rcCfg; }
async function reciboCarregarCfg() {
  try {
    const l = await q(sb.from('recibo_config').select('cfg').limit(1));
    if (l && l[0] && l[0].cfg) { rcCfg = rcLimpar(l[0].cfg); jSet(rcChave(), rcCfg); }
  } catch (e) { /* sem rede ou sistema ainda sem a tabela: fica a cópia deste aparelho */ }
}
/* o logótipo é descodificado uma vez (para o PDF) e guardado em memória */
async function reciboPrepararLogo(cfg) {
  const l = (cfg || reciboCfg()).logo; if (!l || !rcLogoOk(l)) { rcLogoPix = null; rcLogoDe = null; return null; }
  if (rcLogoDe === l && rcLogoPix) return rcLogoPix;
  try {
    const img = new Image(); img.src = l; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h); for (let i = 0; i < g.length; i++) g[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    rcLogoPix = { w, h, g }; rcLogoDe = l; return rcLogoPix;
  } catch (e) { rcLogoPix = null; return null; }
}

/* modelo único do recibo (usado no ecrã, na impressão e no PDF). Só LÊ a venda já registada: não calcula nem altera valores. */
const num2 = n => dinheiro(n).replace(/ MT$/, '');
const r2c = n => Math.round((+n + Number.EPSILON) * 100) / 100;
function reciboModelo(v) {
  const c = S.loja || {}, cli = (S.clientes || []).find(x => x.id === v.cliente_id);
  const itens = (v.itens || []).map(i => {
    const p = (S.produtos || []).find(x => x.id === i.produto_id);
    return {
      nome: i.nome, apres: i.caixa ? ' (' + String(i.apresentacao || 'caixa').toLowerCase() + (i.un_por_caixa ? ' de ' + i.un_por_caixa : '') + ')' : '',
      un: i.caixa ? '' : String((p && p.unidade) || 'un'), qtd: i.qtd, preco: i.preco != null ? +i.preco : (i.qtd ? +i.total / i.qtd : 0), total: +i.total, iva: +i.iva || 0
    };
  });
  const subtotal = +v.subtotal || 0, total = +v.total || 0, iva = +v.iva || 0;
  // só para mostrar: valor das linhas com IVA (já com o desconto repartido) menos o IVA registado = base tributável
  const taxas = [...new Set(itens.filter(i => i.iva > 0).map(i => i.iva))], bruto = itens.filter(i => i.iva > 0).reduce((s, i) => s + i.total, 0);
  const base = iva > 0 ? r2c(bruto * (subtotal > 0 ? total / subtotal : 1) - iva) : 0;
  return {
    loja: c.nome || '', endereco: c.endereco || '', nuit: c.nuit || '', tel: c.tel || '',
    numero: nvenda(v), semNumero: v.num == null, anulada: !!v.anulada, pendente: !!v.pendente, data: fdt(v.data).replace(', ', ' '), dataISO: (() => { try { return new Date(v.data).toISOString().slice(0, 16).replace('T', ' '); } catch (e) { return ''; } })(),
    operador: v.usuario_nome || '', cliente: cli ? cli.nome : '', itens,
    subtotal, desconto: +v.desconto || 0, iva, taxa: taxas.length === 1 ? taxas[0] : 0, base, total, pagamento: v.pagamento || '',
    recebido: v.pagamento === 'Numerário' && +v.recebido ? +v.recebido : 0, troco: v.pagamento === 'Numerário' && +v.recebido ? +v.troco || 0 : 0
  };
}
/* ---------- disposição do recibo (linhas), igual no ecrã, na impressão e no PDF ---------- */
function reciboLinhas(m, cols, cfg, termico) {
  cfg = cfg || reciboCfg(); const mo = cfg.mostrar, out = [];
  const ajusta = s => s > 1 ? cols / Math.floor(cols / s) : 1, larg = s => Math.max(8, Math.floor(cols / (s || 1) + 1e-9));   // tamanhos maiores ocupam a largura toda
  const quebra = (t, n) => { const r = []; let l = ''; for (let w of String(t == null ? '' : t).split(/\s+/).filter(Boolean)) { while (w.length > n) { if (l) { r.push(l); l = ''; } r.push(w.slice(0, n)); w = w.slice(n); } if (!l) l = w; else if ((l + ' ' + w).length <= n) l += ' ' + w; else { r.push(l); l = w; } } if (l) r.push(l); return r; };
  const cen = (t, n) => ' '.repeat(Math.max(0, Math.floor((n - t.length) / 2))) + t;
  const txt = (t, o) => { o = Object.assign({}, o); const g = o.s > 1; if (o.s) o.s = termico ? 1 : ajusta(o.s); const n = larg(o.s); quebra(t, n).forEach(x => out.push({ k: 't', t: o.c ? cen(x, n) : x, b: !!o.b, s: o.s || 1, g })); };
  const par = (a, b, o) => { o = Object.assign({}, o); const g = o.s > 1; if (o.s) o.s = termico ? 1 : ajusta(o.s); const n = larg(o.s); b = String(b); const ls = quebra(a, Math.max(4, n - b.length - 1)); if (!ls.length) ls.push('');
    ls.forEach((x, i) => { const ult = i === ls.length - 1; out.push({ k: 't', t: ult ? x + ' '.repeat(Math.max(1, n - x.length - b.length)) + b : x, b: !!o.b, s: o.s || 1, g }); }); };
  const kv = (a, b) => { const w = 10, n = cols - w; quebra(b, n).forEach((x, i) => out.push({ k: 't', t: (i ? ' '.repeat(w) : a.padEnd(w)) + x, b: false, s: 1 })); };
  const hr = ch => out.push({ k: 'hr', ch: ch || '-' }), sp = () => out.push({ k: 'sp' });
  // cabeçalho
  if (mo.logo && cfg.logo) out.push({ k: 'logo' });
  txt(m.loja, { b: true, c: true, s: 1.4 });
  if (cfg.sucursal) txt(cfg.sucursal, { b: true, c: true });
  [m.endereco, mo.nuit && m.nuit ? 'NUIT: ' + m.nuit : '', m.tel ? 'Tel: ' + m.tel : '', cfg.email].filter(Boolean).forEach(t => txt(t, { c: true }));
  hr('='); txt('RECIBO DE VENDA', { b: true, c: true });
  if (m.anulada) txt('*** VENDA ANULADA ***', { b: true, c: true }); else if (m.pendente) txt('Provisório: por sincronizar', { c: true });
  sp(); kv('Recibo', m.numero); kv('Data', m.data); if (mo.operador && m.operador) kv('Operador', m.operador); if (mo.cliente && m.cliente) kv('Cliente', m.cliente);
  hr('-');
  // artigos: nome por extenso (várias linhas se preciso) e, por baixo, «quantidade × preço» à esquerda e total à direita
  par('ARTIGO', 'TOTAL (MT)', { b: true }); hr('-');
  m.itens.forEach((i, n) => {
    if (n) sp();
    txt(i.nome + i.apres, { b: false });
    const q = String(i.qtd).replace('.', ',') + (mo.unidade && i.un ? ' ' + i.un : '');
    par('  ' + q + ' x ' + num2(i.preco), num2(i.total));
  });
  hr('-'); txt('Artigos: ' + m.itens.length);
  // resumo financeiro (valores tal como registados na venda)
  par('Subtotal', dinheiro(m.subtotal)); if (m.desconto) par('Desconto', '-' + dinheiro(m.desconto));
  if (m.iva) { if (mo.iva) { par('Base tributável', dinheiro(m.base)); par('IVA' + (m.taxa ? ' ' + m.taxa + '%' : '') + ' incluído', dinheiro(m.iva)); } else par('IVA incluído', dinheiro(m.iva)); }
  hr('='); par('TOTAL', dinheiro(m.total), { b: true, s: 1.4 }); hr('=');
  par('Pagamento', m.pagamento); if (m.recebido) { par('Valor recebido', dinheiro(m.recebido)); par('Troco', dinheiro(m.troco), { b: true }); }
  // rodapé
  sp(); if (cfg.msg) txt(cfg.msg, { b: true, c: true }); if (cfg.msg2) txt(cfg.msg2, { c: true }); if (cfg.extra) txt(cfg.extra, { c: true });
  sp(); txt('Emitido por GestMZ', { c: true });
  return out;
}

/* ---------- HTML do recibo (ecrã e impressão do navegador) ---------- */
function reciboHTML(v, k, cfg) {
  k = k || papelAtual(); cfg = cfg || reciboCfg(); const P = PAPEIS[k] || PAPEIS['80'], m = reciboModelo(v), lin = reciboLinhas(m, P.cols, cfg);
  return `<div class="rc" style="--cols:${P.cols}">` + lin.map(l => {
    if (l.k === 'hr') return `<div class="r">${l.ch.repeat(P.cols)}</div>`;
    if (l.k === 'sp') return '<div class="sp"></div>';
    if (l.k === 'logo') return rcLogoOk(cfg.logo) ? `<div class="rl"><img src="${cfg.logo}" alt=""></div>` : '';
    return `<div class="r${l.b ? ' b' : ''}"${l.s > 1 ? ` style="font-size:${l.s}em"` : ''}>${esc(l.t)}</div>`;
  }).join('') + '</div>';
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
function pdfRecibo(m, k, cfg) {
  cfg = cfg || reciboCfg(); const P = PAPEIS[k] || PAPEIS['80'], cols = P.cols, lin = reciboLinhas(m, cols, cfg), a4 = k === 'a4';
  const W = a4 ? 595.28 : P.mm * 72 / 25.4, mx = a4 ? 56 : 7, cw = W - 2 * mx, fs = Math.min(a4 ? 10.5 : 20, cw / (cols * 0.6)), ld = fs * 1.25, mt0 = a4 ? 56 : 10;
  const pix = cfg.logo && rcLogoPix && rcLogoDe === cfg.logo ? rcLogoPix : null, lw = cw * (a4 ? 0.3 : 0.55), lh = pix ? lw * pix.h / pix.w : 0;
  const alt = l => l.k === 't' ? ld * l.s : l.k === 'hr' ? ld : l.k === 'sp' ? ld * 0.45 : l.k === 'logo' ? (pix ? lh + ld * 0.5 : 0) : 0;
  const total = lin.reduce((s, l) => s + alt(l), 0), H = a4 ? Math.max(841.89, mt0 * 2 + total) : mt0 * 2 + total;
  let c = '', y = H - mt0; const f2 = x => x.toFixed(2);
  lin.forEach(l => {
    const h = alt(l);
    if (l.k === 't') c += `BT /${l.b ? 'F2' : 'F1'} ${f2(fs * l.s)} Tf ${f2(mx)} ${f2(y - fs * l.s)} Td ${pdfStr(l.t)} Tj ET\n`;
    else if (l.k === 'hr') c += `BT /F1 ${f2(fs)} Tf ${f2(mx)} ${f2(y - fs)} Td ${pdfStr(l.ch.repeat(cols))} Tj ET\n`;
    else if (l.k === 'logo' && pix) c += `q ${f2(lw)} 0 0 ${f2(lh)} ${f2((W - lw) / 2)} ${f2(y - lh)} cm /Im1 Do Q\n`;
    y -= h;
  });
  const f = x => x.toFixed(2);
  let img = null; if (pix) { let b = ''; for (let i = 0; i < pix.g.length; i += 0x4000) b += String.fromCharCode.apply(null, pix.g.subarray(i, i + 0x4000)); img = `<< /Type /XObject /Subtype /Image /Width ${pix.w} /Height ${pix.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${pix.g.length} >>\nstream\n${b}\nendstream`; }
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${img ? ' /XObject << /Im1 8 0 R >>' : ''} >> /Contents 4 0 R >>`,
    `<< /Length ${c.length} >>\nstream\n${c}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title ${pdfStr('Recibo ' + m.numero)} /Producer (GestMZ) >>`
  ]; if (img) objs.push(img);
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const off = [];
  objs.forEach((o, i) => { off.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x0 = pdf.length; pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${x0}\n%%EOF\n`;
  const u = new Uint8Array(pdf.length); for (let i = 0; i < pdf.length; i++) u[i] = pdf.charCodeAt(i) & 255;
  return u;
}
const nomePDF = v => 'recibo-' + (v.num == null ? 'por-enviar-' + String(v.id || '').slice(-6) : String(v.num).padStart(5, '0')) + '.pdf';
const pdfBytes = async v => { await reciboPrepararLogo(); return pdfRecibo(reciboModelo(v), papelAtual()); };
const pdfBlob = async v => new Blob([await pdfBytes(v)], { type: 'application/pdf' });
const noApp = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };
const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

/* aplicação Android (APK): o ecrã interno não imprime; gera o PDF e abre a folha de partilha do Android (imprimir, guardar, WhatsApp…) */
async function pdfNoApp(v) {
  const P = (window.Capacitor && window.Capacitor.Plugins) || {};
  if (!P.Filesystem || !P.Share) throw new Error('Esta versão da aplicação ainda não tem a impressão. Instale o APK novo (Actions → Gerar APK).');
  const r = await P.Filesystem.writeFile({ path: nomePDF(v), data: b64(await pdfBytes(v)), directory: 'CACHE' });
  await P.Share.share({ title: 'Recibo ' + nvenda(v), text: 'Recibo ' + nvenda(v) + ' — ' + S.loja.nome, url: r.uri, dialogTitle: 'Imprimir, guardar ou partilhar o recibo' });
}
function descarregar(blob, nome) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.rel = 'noopener'; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 8000);
}
async function guardarPDF(v) {
  try {
    if (noApp()) return await pdfNoApp(v);
    descarregar(await pdfBlob(v), nomePDF(v));
    toast('PDF do recibo gerado. Procure «' + nomePDF(v) + '» nas Transferências do aparelho.');
  } catch (e) { if (e && /cancel/i.test(e.name + e.message)) return; toast('Não foi possível gerar o PDF: ' + (e.message || e), true); }
}
async function partilharRecibo(v) {
  try {
    if (noApp()) return await pdfNoApp(v);
    const blob = await pdfBlob(v), f = new File([blob], nomePDF(v), { type: 'application/pdf' });
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
    el.className = 'p' + k; el.innerHTML = reciboHTML(v, k);
    let st = $('#pagina'); if (!st) { st = document.createElement('style'); st.id = 'pagina'; document.head.appendChild(st); }
    st.textContent = k === 'a4' ? '@page{margin:12mm}' : `@page{margin:2mm;size:${P.mm}mm auto}`;
    let abriu = false; const on = () => { abriu = true; }, fim = () => { el.innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('beforeprint', on, { once: true }); window.addEventListener('afterprint', fim);
    window.print();
    setTimeout(() => { window.removeEventListener('beforeprint', on); if (!abriu) toast('Se a janela de impressão não abriu, este aparelho não a permite aqui. Use «Guardar em PDF» ou «Partilhar».', true); }, 1500);
  } catch (e) { toast('Não foi possível imprimir: ' + (e.message || e) + '. Use «Guardar em PDF».', true); }
}

/* ---------- impressão térmica direta (ESC/POS) ---------- */
const imprimirDireto = async v => {
  const c = GestImpressora.ler(); if (!c || !c.via) throw new Error('Configure primeiro a impressora térmica.');
  const k = papelAtual() === 'a4' ? '80' : papelAtual(), cfg = reciboCfg(), pix = await reciboPrepararLogo(cfg);
  const lin = reciboLinhas(reciboModelo(v), GestEscPos.COLS[k], cfg, true);
  const bytes = GestEscPos.codificar(lin, { cols: GestEscPos.COLS[k], cp: c.cp || '850', cortar: c.cortar !== false, logo: cfg.mostrar.logo ? pix : null, pontos: GestEscPos.PONTOS[k] });
  await GestImpressora.enviar(bytes, c);
};
async function imprimirDiretoUI(v, btn) {
  const t = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = 'A imprimir…'; }
  try { await imprimirDireto(v); toast('Enviado para a impressora.'); } catch (e) { toast('Não foi possível imprimir: ' + (e && e.message ? e.message : e), true); }
  finally { if (btn) { btn.disabled = false; btn.textContent = t; } }
}
function impressoraConfigurar(depois) {
  const vias = GestImpressora.vias(), disp = Object.keys(vias).filter(k => vias[k]), c0 = GestImpressora.ler() || {};
  if (!disp.length) return modal('Impressora térmica', '<p>Este aparelho ou navegador não permite ligar impressoras diretamente. Use <b>Imprimir recibo</b> ou <b>Guardar em PDF</b>.</p><p class="muted small">No Android, use a app GestMZ (Bluetooth). No computador, use o Chrome ou o Edge (USB ou porta série).</p>', { okText: 'Fechar' });
  let sel = Object.assign({}, c0); if (!sel.via || !disp.includes(sel.via)) sel.via = disp[0];
  const w = modal('Impressora térmica', `<div id="imf">
    <p class="muted small">Imprime direto na impressora de talões (ESC/POS), sem janelas de impressão. O papel (58 ou 80 mm) escolhe-se no recibo.</p>
    <label class="lbl">Ligação<select id="imv" class="in">${disp.map(k => `<option value="${k}" ${sel.via === k ? 'selected' : ''}>${GestImpressora.NOMES[k]}</option>`).join('')}</select></label>
    <div id="imd"></div>
    <label class="lbl">Acentos<select id="imc" class="in">${opts([['850', 'Português (PC850), recomendado'], ['858', 'Português (PC858)'], ['860', 'Português (PC860)'], ['ascii', 'Sem acentos (se sair lixo)']], c0.cp || '850')}</select></label>
    <label class="chk"><input type="checkbox" id="imx" ${c0.cortar === false ? '' : 'checked'}> Cortar o papel no fim</label>
    <div class="mf"><button type="button" class="btn ghost" id="imt">Imprimir teste</button></div></div>`, { okText: 'Guardar', onOk: async () => { guardarSel(); toast('Impressora guardada.'); if (depois) depois(); } });
  const guardarSel = () => { const c = Object.assign({}, sel, { via: $('#imv', w.m).value, cp: $('#imc', w.m).value, cortar: $('#imx', w.m).checked }); GestImpressora.guardar(c); return c; };
  const desenhar = async () => {
    const via = $('#imv', w.m).value, box = $('#imd', w.m); sel.via = via;
    if (via === 'bt') { box.innerHTML = '<p class="muted small">A procurar impressoras emparelhadas…</p>';
      try { const l = await GestImpressora.emparelhadas(); box.innerHTML = l.length ? `<label class="lbl">Impressora emparelhada<select id="imb" class="in">${opts(l.map(d => [d.endereco, d.nome || d.endereco]), sel.endereco || (l[0] && l[0].endereco))}</select></label><p class="muted small">Não aparece? Emparelhe-a antes nas definições de Bluetooth do Android.</p>` : '<p>Nenhuma impressora emparelhada. Ligue a impressora, emparelhe-a em Definições → Bluetooth e volte aqui.</p>';
        const b = $('#imb', w.m); if (b) { const f = () => { sel.endereco = b.value; sel.nome = b.options[b.selectedIndex].text; }; b.onchange = f; f(); } }
      catch (e) { box.innerHTML = `<p class="erro">${esc(e && e.message ? e.message : String(e))}</p><p class="muted small">Autorize o Bluetooth quando o Android pedir.</p>`; } }
    else { box.innerHTML = `<p class="muted small">${sel.nome && sel.via === via ? 'Selecionada: <b>' + esc(sel.nome) + '</b>' : 'Nenhuma selecionada.'}</p><button type="button" class="btn ghost" id="ime">Escolher impressora</button>`;
      $('#ime', w.m).onclick = async () => { try { const r = await GestImpressora.escolher(via); sel = Object.assign(sel, r); desenhar(); } catch (e) { if (!(e && /No device|cancel|abort|NotFound|select/i.test(String(e.name + e.message)))) toast(e.message || String(e), true); } }; }
  };
  $('#imv', w.m).onchange = desenhar; desenhar();
  $('#imt', w.m).onclick = async e => { const c = guardarSel(); e.target.disabled = true; try { await imprimirDireto(reciboAmostra()); toast('Teste enviado.'); } catch (er) { toast('Falhou: ' + (er && er.message ? er.message : er), true); } finally { e.target.disabled = false; } };
}

function mostrarRecibo(v) {
  const dono = S.perfil && S.perfil.papel === 'dono', tem = !!(GestImpressora.ler() || {}).via;
  const w = modal('Venda ' + nvenda(v), `<div id="rcv" class="rcv">${reciboHTML(v)}</div><div class="rcopt"><label>Papel <select id="pap" class="in">${opts(Object.entries(PAPEIS).map(([k, p]) => [k, p.nome]), papelAtual())}</select></label></div>
    <div class="mf rcact">${tem ? '<button type="button" class="btn" id="pd">Imprimir (térmica)</button>' : ''}<button type="button" class="btn${tem ? ' ghost' : ''}" id="pr">Imprimir recibo</button><button type="button" class="btn ghost" id="pdf">Guardar em PDF</button><button type="button" class="btn ghost" id="im">Impressora</button><button type="button" class="btn ghost" id="sh">Partilhar</button>${dono ? '<button type="button" class="btn ghost" id="cf">Personalizar</button>' : ''}${!v.anulada && !v.pendente ? '<button type="button" class="btn ghost" id="an">Anular venda</button>' : ''}</div>`, {});
  $('#pr', w.m).onclick = () => imprimirRecibo(v);
  const pd = $('#pd', w.m); if (pd) pd.onclick = () => imprimirDiretoUI(v, pd);
  $('#im', w.m).onclick = () => impressoraConfigurar(() => { w.close && w.close(); mostrarRecibo(v); });
  $('#pdf', w.m).onclick = () => guardarPDF(v);
  $('#sh', w.m).onclick = () => partilharRecibo(v);
  $('#pap', w.m).onchange = e => { jSet('gestmz_papel', e.target.value); $('#rcv', w.m).innerHTML = reciboHTML(v); };
  const cf = $('#cf', w.m); if (cf) cf.onclick = () => reciboConfigurar(() => { $('#rcv', w.m).innerHTML = reciboHTML(v); });
  const an = $('#an', w.m); if (an) an.onclick = () => anularVenda(v, w);
}

/* ---------- configuração do recibo (só o dono) ---------- */
function reciboAmostra() {
  const agora = new Date().toISOString(), it = (nome, qtd, preco, iva, extra) => Object.assign({ produto_id: null, nome, qtd, preco, total: Math.round(qtd * preco * 100) / 100, iva, caixa: false }, extra || {});
  const itens = [it('Água mineral 1,5 L', 2, 45, 0), it('Paracetamol 500 mg comprimidos (caixa 20)', 1, 180, 16), it('Arroz', 2.5, 78.4, 0, {})];
  const sub = itens.reduce((s, i) => s + i.total, 0), desc = 20, tot = sub - desc, ivaV = Math.round((180 * 16 / 116) * (tot / sub) * 100) / 100;
  return { id: 'amostra', num: 128, data: agora, usuario_nome: (S.perfil && S.perfil.nome) || 'Operador', cliente_id: null, pagamento: 'Numerário', subtotal: sub, desconto: desc, iva: ivaV, total: tot, recebido: Math.ceil(tot / 100) * 100, troco: Math.ceil(tot / 100) * 100 - tot, itens };
}
/* reduz e converte a imagem escolhida para um logótipo leve (máx. 256×96, tons de cinzento) */
async function reciboLogoDeFicheiro(f) {
  if (!f || !/^image\/(png|jpeg|webp|gif|bmp)$/i.test(f.type)) throw new Error('Escolha uma imagem PNG ou JPG.');
  if (f.size > 8 * 1024 * 1024) throw new Error('A imagem é demasiado grande.');
  const url = URL.createObjectURL(f);
  try {
    const img = new Image(); img.src = url; await img.decode(); const k = Math.min(1, 256 / img.naturalWidth, 96 / img.naturalHeight), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h), p = d.data; for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2], e = Math.max(0, Math.min(255, (g - 128) * 1.25 + 128)); p[i] = p[i + 1] = p[i + 2] = e; } x.putImageData(d, 0, 0);
    let r = c.toDataURL('image/png'); if (r.length > 80000) r = c.toDataURL('image/jpeg', 0.6);
    if (!rcLogoOk(r)) throw new Error('O logótipo ficou grande demais. Use uma imagem mais simples.');
    return r;
  } finally { URL.revokeObjectURL(url); }
}
function reciboConfigurar(aoGuardar) {
  if (!S.perfil || S.perfil.papel !== 'dono') return toast('Só o dono da loja pode personalizar o recibo.', true);
  const c0 = reciboCfg(), CK = [['logo', 'Mostrar o logótipo'], ['nuit', 'Mostrar o NUIT'], ['operador', 'Mostrar o operador'], ['cliente', 'Mostrar o cliente (quando registado)'], ['iva', 'Detalhar base tributável e taxa de IVA'], ['unidade', 'Mostrar a unidade de medida']];
  let logo = c0.logo;
  const w = modal('Personalizar recibo', `<div id="rcp" class="rcv rcp"></div><div class="rcopt"><label>Papel <select id="pap2" class="in">${opts(Object.entries(PAPEIS).map(([k, p]) => [k, p.nome]), papelAtual())}</select></label></div>
    <div class="foto-campo"><span class="lbl">Logótipo (opcional)</span><div class="fotorow"><label class="btn ghost filebtn">Escolher imagem<input type="file" id="lg" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="btn ghost" id="lgx">Remover</button></div></div>
    ${fld('Sucursal (opcional)', 'sucursal', c0.sucursal, 'text', 'maxlength="40"')}${fld('E-mail (opcional)', 'email', c0.email, 'email', 'maxlength="50"')}
    ${fld('Mensagem de agradecimento', 'msg', c0.msg, 'text', 'maxlength="60"')}${fld('2.ª linha do rodapé', 'msg2', c0.msg2, 'text', 'maxlength="60"')}${fld('Informação adicional da loja (opcional)', 'extra', c0.extra, 'text', 'maxlength="100"', 'Ex.: horário, página, política de trocas.')}
    <div class="rcchk">${CK.map(([k, t]) => `<label class="chk"><input type="checkbox" name="m_${k}" ${c0.mostrar[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>
    <p class="muted small">O nome, o endereço, o telefone e o NUIT da loja alteram-se em Conta → Dados do estabelecimento. Os valores e a numeração das vendas nunca mudam.</p>`,
    { wide: true, okText: 'Guardar', onOk: async (d) => {
      const cfg = ler(d); const r = await guardarConfig(cfg); if (aoGuardar) aoGuardar(); toast(r); } });
  const am = reciboAmostra(), F = $('form', w.m);
  const ler = d => rcLimpar({ sucursal: d.sucursal, email: d.email, msg: d.msg, msg2: d.msg2, extra: d.extra, logo, mostrar: Object.fromEntries(CK.map(([k]) => [k, d['m_' + k] === 'on'])) });
  const desenhar = () => { const cfg = ler(Object.fromEntries(new FormData(F))); $('#rcp', w.m).innerHTML = reciboHTML(am, $('#pap2', w.m).value, cfg); };
  F.addEventListener('input', desenhar); $('#pap2', w.m).onchange = e => { jSet('gestmz_papel', e.target.value); desenhar(); };
  $('#lg', w.m).onchange = async e => { try { logo = await reciboLogoDeFicheiro(e.target.files[0]); desenhar(); } catch (er) { toast(er.message || String(er), true); } e.target.value = ''; };
  $('#lgx', w.m).onclick = () => { logo = null; desenhar(); };
  desenhar();
}
/* guarda na base de dados (todos os aparelhos da loja) e, sempre, uma cópia neste aparelho */
async function guardarConfig(cfg) {
  const lim = rcLimpar(cfg); jSet(rcChave(), lim); rcCfg = lim; rcLogoPix = null; rcLogoDe = null;
  try { await q(sb.rpc('guardar_recibo_config', { p_cfg: lim })); return 'Recibo personalizado guardado.'; }
  catch (e) { if (semFuncao(e) || /guardar_recibo_config|recibo_config/i.test(String((e && e.message) || ''))) return 'Guardado neste aparelho. A atualização do sistema para guardar em todos os aparelhos ainda não está ativa.'; throw e; }
}

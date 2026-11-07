'use strict';
/* GestMZ — impressão térmica direta (ESC/POS).
   • GestEscPos: converte as linhas do recibo (as mesmas do ecrã e do PDF) em comandos ESC/POS: letra normal/negrito/alta, logótipo, corte.
   • GestImpressora: envia esses comandos por Bluetooth (app Android), USB (WebUSB) ou porta série/Bluetooth-COM (Web Serial, no computador).
   Não altera vendas nem valores: só imprime o que o recibo já mostra. */
(function (raiz) {
  // metade de cima (0x80–0xFF) de cada página de caracteres, gerada a partir das tabelas oficiais CP850, CP858 e CP860
  const TABELAS = {
    '850': "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00f8\u00a3\u00d8\u00d7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00ae\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u00c1\u00c2\u00c0\u00a9\u2563\u2551\u2557\u255d\u00a2\u00a5\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u00e3\u00c3\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u00a4\u00f0\u00d0\u00ca\u00cb\u00c8\u0131\u00cd\u00ce\u00cf\u2518\u250c\u2588\u2584\u00a6\u00cc\u2580\u00d3\u00df\u00d4\u00d2\u00f5\u00d5\u00b5\u00fe\u00de\u00da\u00db\u00d9\u00fd\u00dd\u00af\u00b4\u00ad\u00b1\u2017\u00be\u00b6\u00a7\u00f7\u00b8\u00b0\u00a8\u00b7\u00b9\u00b3\u00b2\u25a0\u00a0",
    '858': "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00f8\u00a3\u00d8\u00d7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00ae\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u00c1\u00c2\u00c0\u00a9\u2563\u2551\u2557\u255d\u00a2\u00a5\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u00e3\u00c3\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u00a4\u00f0\u00d0\u00ca\u00cb\u00c8\u20ac\u00cd\u00ce\u00cf\u2518\u250c\u2588\u2584\u00a6\u00cc\u2580\u00d3\u00df\u00d4\u00d2\u00f5\u00d5\u00b5\u00fe\u00de\u00da\u00db\u00d9\u00fd\u00dd\u00af\u00b4\u00ad\u00b1\u2017\u00be\u00b6\u00a7\u00f7\u00b8\u00b0\u00a8\u00b7\u00b9\u00b3\u00b2\u25a0\u00a0",
    '860': "\u00c7\u00fc\u00e9\u00e2\u00e3\u00e0\u00c1\u00e7\u00ea\u00ca\u00e8\u00cd\u00d4\u00ec\u00c3\u00c2\u00c9\u00c0\u00c8\u00f4\u00f5\u00f2\u00da\u00f9\u00cc\u00d5\u00dc\u00a2\u00a3\u00d9\u20a7\u00d3\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00d2\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0"
  };
  const ESC_T = { '850': 2, '858': 19, '860': 3 };   // comando ESC t n
  const COLS = { '58': 32, '80': 48, 'a4': 48 };        // letra A: 12 pontos → 384 (58 mm) ou 576 pontos (80 mm)
  const PONTOS = { '58': 384, '80': 576, 'a4': 576 };
  const MAPAS = {}; Object.keys(TABELAS).forEach(k => { const m = new Map(); Array.from(TABELAS[k]).forEach((c, i) => { if (!m.has(c)) m.set(c, 128 + i); }); MAPAS[k] = m; });
  const SUBST = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '€': 'EUR', ' ': ' ', '•': '*', '™': 'TM' };

  function texto(t, cp) {
    const out = []; const mapa = MAPAS[cp];
    for (const c0 of String(t == null ? '' : t)) {
      let c = SUBST[c0] || c0;
      for (const ch of Array.from(c)) {
        const n = ch.codePointAt(0);
        if (n >= 32 && n < 127) out.push(n);
        else if (mapa && mapa.has(ch)) out.push(mapa.get(ch));
        else { const b = ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); if (b !== ch && /^[\x20-\x7e]+$/.test(b)) for (const x of b) out.push(x.charCodeAt(0)); else out.push(n < 32 ? 32 : 63); }
      }
    }
    return out;
  }
  /* imagem em tons de cinzento → pontos a preto e branco com difusão de erro (Floyd–Steinberg) → comandos GS v 0 em faixas */
  function raster(pix, maxLarg) {
    if (!pix || !pix.w || !pix.h) return [];
    const k = Math.min(1, maxLarg / pix.w), w = Math.max(8, Math.round(pix.w * k)), h = Math.max(1, Math.round(pix.h * k));
    const g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {                       // média da área de origem
      const x0 = Math.floor(x / k), x1 = Math.max(x0 + 1, Math.floor((x + 1) / k)), y0 = Math.floor(y / k), y1 = Math.max(y0 + 1, Math.floor((y + 1) / k)); let s = 0, n = 0;
      for (let yy = y0; yy < Math.min(y1, pix.h); yy++) for (let xx = x0; xx < Math.min(x1, pix.w); xx++) { s += pix.g[yy * pix.w + xx]; n++; } g[y * w + x] = n ? s / n : 255; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, o = g[i], n = o < 128 ? 0 : 255, e = o - n; g[i] = n;
      if (x + 1 < w) g[i + 1] += e * 7 / 16; if (y + 1 < h) { if (x > 0) g[i + w - 1] += e * 3 / 16; g[i + w] += e * 5 / 16; if (x + 1 < w) g[i + w + 1] += e / 16; } }
    const lb = Math.ceil(w / 8), out = [];
    for (let y0 = 0; y0 < h; y0 += 96) { const hh = Math.min(96, h - y0); out.push(0x1d, 0x76, 0x30, 0, lb & 255, lb >> 8, hh & 255, hh >> 8);
      for (let y = y0; y < y0 + hh; y++) for (let b = 0; b < lb; b++) { let v = 0; for (let i = 0; i < 8; i++) { const x = b * 8 + i; if (x < w && g[y * w + x] < 128) v |= 0x80 >> i; } out.push(v); } }
    return out;
  }
  /* linhas do recibo (reciboLinhas com «termico») → bytes */
  function codificar(linhas, o) {
    o = o || {}; const cp = o.cp || '850', cols = o.cols || 32, out = [0x1b, 0x40];            // ESC @ (repor)
    if (cp !== 'ascii') out.push(0x1b, 0x74, ESC_T[cp] != null ? ESC_T[cp] : 2); else out.push(0x1b, 0x74, 0);
    const alvo = cp === 'ascii' ? null : cp;
    const lf = () => out.push(0x0a);
    linhas.forEach(l => {
      if (l.k === 't') { const g = !!l.g || (l.s || 1) > 1; if (l.b || g) out.push(0x1b, 0x45, 1); if (g) out.push(0x1d, 0x21, 0x01);          // negrito / dupla altura
        out.push(...texto(l.t, alvo)); lf(); if (g) out.push(0x1d, 0x21, 0x00); if (l.b || g) out.push(0x1b, 0x45, 0); }
      else if (l.k === 'hr') { out.push(...texto(l.ch.repeat(cols), alvo)); lf(); }
      else if (l.k === 'sp') out.push(0x1b, 0x4a, 10);                                                                                   // avançar 10 pontos
      else if (l.k === 'logo' && o.logo) { const r = raster(o.logo, Math.round((o.pontos || 384) * 0.55)); if (r.length) { out.push(0x1b, 0x61, 1, ...r, 0x1b, 0x61, 0); out.push(0x1b, 0x4a, 12); } }
    });
    if (o.cortar !== false) out.push(0x1b, 0x64, 4, 0x1d, 0x56, 1); else out.push(0x1b, 0x64, 5);   // avançar e cortar (ou só avançar)
    return Uint8Array.from(out);
  }
  raiz.GestEscPos = { codificar, raster, texto, COLS, PONTOS, TABELAS };

  /* ---------- envio para a impressora ---------- */
  const CHAVE = 'gestmz_impressora';
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; } };
  const guardar = c => { try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch (e) { /* ok */ } };
  const plug = () => { const P = (raiz.Capacitor && raiz.Capacitor.Plugins) || {}; return P.GestMZImpressora || null; };
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x4000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x4000)); return btoa(s); };
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  const vias = () => ({ bt: !!plug(), usb: !!(raiz.navigator && navigator.usb), serial: !!(raiz.navigator && navigator.serial) });
  const NOMES = { bt: 'Bluetooth', usb: 'USB', serial: 'Porta série / Bluetooth (COM)' };

  async function emparelhadas() { const P = plug(); if (!P) return []; const r = await P.emparelhadas(); return (r && r.dispositivos) || []; }
  async function escolher(via) {            // pede ao utilizador o aparelho (USB/série); devolve o que deve ser guardado
    if (via === 'usb') { const d = await navigator.usb.requestDevice({ filters: [{ classCode: 7 }, {}] }); return { via, vendorId: d.vendorId, productId: d.productId, nome: d.productName || 'Impressora USB' }; }
    if (via === 'serial') { const p = await navigator.serial.requestPort(); const i = (p.getInfo && p.getInfo()) || {}; return { via, vendorId: i.usbVendorId || 0, productId: i.usbProductId || 0, nome: 'Porta série' + (i.usbVendorId ? ' ' + i.usbVendorId.toString(16) + ':' + (i.usbProductId || 0).toString(16) : '') }; }
    throw new Error('Via não suportada.');
  }
  async function enviarBT(c, u) { const P = plug(); if (!P) throw new Error('Bluetooth indisponível neste aparelho.'); if (!c.endereco) throw new Error('Escolha a impressora Bluetooth.'); await P.imprimir({ endereco: c.endereco, dados: b64(u) }); }
  async function enviarSerial(c, u) {
    const ps = await navigator.serial.getPorts(); let p = ps.find(x => { const i = x.getInfo ? x.getInfo() : {}; return !c.vendorId || (i.usbVendorId === c.vendorId && i.usbProductId === c.productId); }) || ps[0];
    if (!p) throw new Error('Porta não encontrada. Volte a escolher a impressora.');
    await p.open({ baudRate: c.baud || 9600 }); try { const w = p.writable.getWriter(); try { for (let i = 0; i < u.length; i += 512) { await w.write(u.subarray(i, i + 512)); await pausa(8); } } finally { w.releaseLock(); } await pausa(200); } finally { try { await p.close(); } catch (e) { /* ok */ } }
  }
  async function enviarUSB(c, u) {
    const ds = await navigator.usb.getDevices(); const d = ds.find(x => !c.vendorId || (x.vendorId === c.vendorId && x.productId === c.productId)) || ds[0]; if (!d) throw new Error('Impressora USB não encontrada. Volte a escolher.');
    await d.open(); try { if (d.configuration == null) await d.selectConfiguration(1);
      let alvo = null; for (const i of d.configuration.interfaces) for (const a of i.alternates) { const e = a.endpoints.find(x => x.direction === 'out' && x.type === 'bulk'); if (e && (a.interfaceClass === 7 || !alvo)) alvo = { n: i.interfaceNumber, e: e.endpointNumber }; }
      if (!alvo) throw new Error('A impressora USB não tem saída de dados.'); await d.claimInterface(alvo.n);
      try { for (let i = 0; i < u.length; i += 4096) await d.transferOut(alvo.e, u.subarray(i, i + 4096)); } finally { try { await d.releaseInterface(alvo.n); } catch (e) { /* ok */ } }
    } finally { try { await d.close(); } catch (e) { /* ok */ } }
  }
  async function enviar(u, c) { c = c || ler(); if (!c || !c.via) throw new Error('Impressora não configurada.'); const v = vias();
    if (c.via === 'bt') return enviarBT(c, u); if (c.via === 'serial') { if (!v.serial) throw new Error('Este navegador não suporta porta série.'); return enviarSerial(c, u); }
    if (c.via === 'usb') { if (!v.usb) throw new Error('Este navegador não suporta USB.'); return enviarUSB(c, u); } throw new Error('Via desconhecida.'); }
  raiz.GestImpressora = { ler, guardar, vias, NOMES, emparelhadas, escolher, enviar, remover() { try { localStorage.removeItem(CHAVE); } catch (e) { /* ok */ } } };
})(typeof window !== 'undefined' ? window : globalThis);

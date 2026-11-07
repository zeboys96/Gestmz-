// Impressão térmica ESC/POS: os bytes são descodificados por um emulador de impressora e comparados com o recibo. SIMULAÇÃO: sem impressora física.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www'), SAIDA = process.env.GESTMZ_RECIBOS || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'escpos-'));
const FAKE = `(function(){ window.__chamadas=[]; const b={select(){return b;},order(){return b;},eq(){return b;},limit(){return b;},then(r,j){return Promise.resolve({data:window.__rc||[],error:null}).then(r,j);}};
  const sbf={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},
    rpc:(n,a)=>{window.__chamadas.push({n,a});return Promise.resolve({data:null,error:window.__rpcErro?{message:window.__rpcErro}:null});},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){},from:()=>b};
  window.supabase={createClient:()=>sbf}; })();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
const rodar = (nome, f) => test(nome, { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch(); try { await f(b, url); } finally { await b.close(); s.close(); } });
async function abrir(b, url, papel, vp) {
  const ctx = await b.newContext({ viewport: vp || { width: 420, height: 900 }, deviceScaleFactor: 2 }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(url); await p.waitForSelector('#f');
  await p.evaluate(pp => { S.perfil = { papel: pp || 'dono', nome: 'Maria Joaquina', id: 'u1', loja_id: 'L1' }; S.loja = { id: 'L1', nome: 'Farmácia Nova Esperança', endereco: 'Av. 25 de Setembro 1234, Maputo', nuit: '400123456', tel: '84 123 4567', estado: 'ativa', valido_ate: '2099-01-01', operacional: true };
    S.clientes = [{ id: 'c1', nome: 'Ana Maria dos Santos Fiada' }]; S.cats = []; S.produtos = [{ id: 'p1', nome: 'Arroz', unidade: 'kg', preco: 78.4, iva: 0, lotes: [] }, { id: 'p2', nome: 'Paracetamol', unidade: 'un', preco: 180, iva: 16, lotes: [] }]; shell(navLoja()); }, papel);
  return { ctx, p, erros };
}
const V = (o) => Object.assign({ id: 'v1', num: 128, data: '2026-11-06T09:12:00.000Z', usuario_nome: 'Maria Joaquina', cliente_id: null, pagamento: 'Numerário', subtotal: 100, desconto: 0, iva: 0, total: 100, recebido: 100, troco: 0,
  itens: [{ produto_id: 'p1', nome: 'Arroz', qtd: 1, preco: 100, total: 100, iva: 0 }] }, o);
const CASOS = {
  um_item: V({}),
  varios: V({ subtotal: 520.5, total: 520.5, recebido: 600, troco: 79.5, itens: [{ produto_id: 'p1', nome: 'Arroz', qtd: 2.5, preco: 78.4, total: 196, iva: 0 }, { produto_id: 'p2', nome: 'Paracetamol 500 mg', qtd: 1, preco: 180, total: 180, iva: 0 }, { produto_id: null, nome: 'Água 1,5 L', qtd: 3, preco: 48.17, total: 144.5, iva: 0 }] }),
  desconto: V({ subtotal: 1000, desconto: 150, total: 850, recebido: 1000, troco: 150, itens: [{ produto_id: 'p1', nome: 'Arroz', qtd: 10, preco: 100, total: 1000, iva: 0 }] }),
  iva16: V({ subtotal: 232, desconto: 0, iva: 32, total: 232, recebido: 0, troco: 0, pagamento: 'Cartão', itens: [{ produto_id: 'p2', nome: 'Paracetamol', qtd: 2, preco: 116, total: 232, iva: 16 }] }),
  iva_desc_misto: V({ subtotal: 380, desconto: 20, iva: 24.89, total: 360, recebido: 400, troco: 40, itens: [{ produto_id: 'p2', nome: 'Paracetamol', qtd: 1, preco: 180, total: 180, iva: 16 }, { produto_id: 'p1', nome: 'Arroz', qtd: 2, preco: 100, total: 200, iva: 0 }] }),
  mpesa: V({ pagamento: 'M-Pesa', recebido: 0, troco: 0 }),
  nome_longo: V({ itens: [{ produto_id: null, nome: 'Suplemento vitamínico multivitamínico completo com minerais e antioxidantes para adultos 120 comprimidos', qtd: 1, preco: 100, total: 100, iva: 0 }, { produto_id: null, nome: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJ', qtd: 1, preco: 0, total: 0, iva: 0 }], subtotal: 100, total: 100 }),
  valores_grandes: V({ subtotal: 1234567.89, total: 1234567.89, recebido: 2000000, troco: 765432.11, itens: [{ produto_id: null, nome: 'Equipamento', qtd: 3, preco: 411522.63, total: 1234567.89, iva: 0 }] }),
  cliente: V({ cliente_id: 'c1' }),
  anulada: V({ anulada: true }),
  pendente: V({ num: null, pendente: true, id: 'local-x' }),
  caixa_un: V({ itens: [{ produto_id: 'p1', nome: 'Refresco', qtd: 2, preco: 50, total: 100, iva: 0, caixa: true, apresentacao: 'Caixa', un_por_caixa: 24 }] })
};



/* emulador mínimo de impressora ESC/POS: devolve as linhas impressas com estilo, os cortes e os rasters */
function emular(bytes, cp, tabelas) {
  const inv = c => { const t = tabelas[c]; return b => b < 128 ? String.fromCharCode(b) : (t ? t[b - 128] : '?'); };
  const dec = inv(cp); const lin = []; let cur = '', neg = false, alt = false, alin = 0, cortes = 0, rasters = [], pagina = null, avancos = 0, inicio = false;
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    if (b === 0x1b) { const c = bytes[i + 1];
      if (c === 0x40) { inicio = true; i += 2; } else if (c === 0x74) { pagina = bytes[i + 2]; i += 3; } else if (c === 0x45) { neg = !!bytes[i + 2]; i += 3; } else if (c === 0x61) { alin = bytes[i + 2]; i += 3; }
      else if (c === 0x64) { avancos += bytes[i + 2]; i += 3; } else if (c === 0x4a) { lin.push({ t: '', avanco: bytes[i + 2] }); i += 3; } else throw new Error('ESC desconhecido ' + c.toString(16)); }
    else if (b === 0x1d) { const c = bytes[i + 1];
      if (c === 0x21) { alt = !!(bytes[i + 2] & 1); if (bytes[i + 2] & 0x10) throw new Error('largura dupla inesperada'); i += 3; }
      else if (c === 0x56) { cortes++; i += bytes[i + 2] >= 65 ? 4 : 3; }
      else if (c === 0x76) { const lb = bytes[i + 4] + bytes[i + 5] * 256, h = bytes[i + 6] + bytes[i + 7] * 256; rasters.push({ lb, h, alin, i }); i += 8 + lb * h; }
      else throw new Error('GS desconhecido ' + c.toString(16)); }
    else if (b === 0x0a) { lin.push({ t: cur, neg, alt, alin }); cur = ''; i++; }
    else { cur += dec(b); i++; }
  }
  return { lin, cortes, rasters, pagina, avancos, inicio, resto: cur };
}
async function gerar(p, v, k, cp, extra) {
  return p.evaluate(async ({ v, k, cp, extra }) => { const cfg = Object.assign(reciboCfg(), extra && extra.cfg || {}); if (extra && extra.logo) { rcCfg = rcLimpar({ logo: extra.logo }); } if (extra && extra.semLogo) { rcCfg = rcLimpar({}); } const c2 = reciboCfg(); const pix = c2.logo ? await reciboPrepararLogo(c2) : null;
    const cols = GestEscPos.COLS[k], lin = reciboLinhas(reciboModelo(v), cols, c2, true), by = GestEscPos.codificar(lin, { cols, cp, cortar: !(extra && extra.semCorte), logo: pix, pontos: GestEscPos.PONTOS[k] });
    return { by: Array.from(by), lin, tabelas: GestEscPos.TABELAS }; }, { v, k, cp, extra });
}

rodar('ESC/POS: texto, acentos, negrito, dupla altura, corte e alinhamento coincidem com o recibo (58 e 80 mm; PC850/858/860)', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url);
  for (const k of ['58', '80']) for (const cp of ['850', '858', '860']) for (const nome of ['varios', 'iva_desc_misto', 'nome_longo', 'valores_grandes', 'anulada']) {
    const r = await gerar(p, CASOS[nome], k, cp), cols = ({ '58': 32, '80': 48 })[k], e = emular(r.by, cp, r.tabelas);
    assert.ok(e.inicio, 'ESC @'); assert.strictEqual(e.cortes, 1, 'um corte no fim'); assert.strictEqual(e.resto, '', 'nenhum texto sem fim de linha'); assert.strictEqual(e.pagina, { '850': 2, '858': 19, '860': 3 }[cp]);
    const txt = r.lin.filter(l => l.k === 't' || l.k === 'hr'), imp = e.lin.filter(l => !l.avanco);
    assert.strictEqual(imp.length, txt.length, `${k}/${cp}/${nome}: n.º de linhas`);
    imp.forEach((l, i) => { const o = txt[i], esperado = o.k === 'hr' ? o.ch.repeat(cols) : o.t; assert.strictEqual(l.t, esperado, `${k}/${cp}/${nome}: linha ${i}`); assert.ok(l.t.length <= cols, 'cabe na largura da impressora');
      if (o.k === 't' && (o.b || o.g)) assert.ok(l.neg, 'negrito'); if (o.k === 't' && o.g) assert.ok(l.alt, 'dupla altura'); if (o.k === 't' && !o.g) assert.ok(!l.alt); });
    const tot = imp.find(l => /^TOTAL/.test(l.t)); assert.ok(tot && tot.alt && tot.neg && tot.t.length === cols, 'TOTAL grande, a negrito e alinhado à direita'); assert.deepStrictEqual(r.by.slice(-6), [0x1b, 0x64, 4, 0x1d, 0x56, 1], 'avança e corta');
  }
  assert.deepStrictEqual(erros, []); await ctx.close();
});

rodar('ESC/POS: sem corte só avança o papel; «sem acentos» não envia bytes acima de 127; carateres fora da página viram aproximação segura', async (b, url) => {
  const { ctx, p } = await abrir(b, url);
  const r = await gerar(p, V({ itens: [{ produto_id: null, nome: 'Café «ção» – 100% œ ő ☺', qtd: 1, preco: 100, total: 100, iva: 0 }] }), '58', '850', { semCorte: true }), e = emular(r.by, '850', r.tabelas);
  assert.strictEqual(e.cortes, 0); assert.ok(e.avancos >= 5); const l = e.lin.find(x => /Caf/.test(x.t)); assert.ok(l && /Café «ção» - 100% /.test(l.t), l && l.t); assert.ok(/100% \? o \?$/.test(l.t), l.t);
  const a = await gerar(p, CASOS.varios, '58', 'ascii'); assert.ok(emular(a.by, null, a.tabelas).lin.every(l => /^[\x20-\x7e]*$/.test(l.t)), 'sem acentos: só ASCII visível');
  const ascii = await p.evaluate(() => Array.from(GestEscPos.texto('Água ção Ç é Ã', null)));
  assert.strictEqual(String.fromCharCode(...ascii), 'Agua cao C e A'); assert.ok(ascii.every(x => x < 128));
  const t850 = await p.evaluate(() => Array.from(GestEscPos.texto('ãõçÁÉéÓ', '850'))); assert.deepStrictEqual(t850, [0xc6, 0xe4, 0x87, 0xb5, 0x90, 0x82, 0xe0]);
  const t860 = await p.evaluate(() => Array.from(GestEscPos.texto('ãõçÁÉéÓ', '860'))); assert.deepStrictEqual(t860, [0x84, 0x94, 0x87, 0x86, 0x90, 0x82, 0x9f], 'PC860 (tabela oficial)');
  await ctx.close();
});

rodar('ESC/POS: logótipo em raster GS v 0 centrado, com a largura certa para 58 e 80 mm', async (b, url) => {
  const { ctx, p } = await abrir(b, url);
  const LOGO = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 70; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 70); x.fillStyle = '#000'; x.fillRect(4, 4, 62, 62); x.font = 'bold 22px sans-serif'; x.fillText('Farmácia', 76, 40); return c.toDataURL('image/png'); });
  for (const k of ['58', '80']) { const r = await gerar(p, CASOS.um_item, k, '850', { logo: LOGO }), e = emular(r.by, '850', r.tabelas);
    assert.ok(e.rasters.length >= 1, 'há raster'); const w = e.rasters[0].lb * 8; assert.ok(w <= { 58: 384, 80: 576 }[k] * 0.56 + 8 && w >= 64, `${k}: largura do logótipo ${w}`); assert.strictEqual(e.rasters[0].alin, 1, 'centrado');
    const alt = e.rasters.reduce((s, x) => s + x.h, 0); assert.ok(alt > 10 && alt < 200); assert.ok(r.by.length < 20000, 'tamanho razoável'); }
  const sem = await gerar(p, CASOS.um_item, '58', '850', { semLogo: true }); assert.strictEqual(emular(sem.by, '850', sem.tabelas).rasters.length, 0, 'sem logótipo configurado, sem raster');
  await ctx.close();
});

rodar('ESC/POS: envio por Bluetooth (Android), USB e porta série, com a configuração e erros claros', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url);
  // Bluetooth: plugin nativo simulado
  await p.evaluate(() => { window.__bt = []; window.Capacitor = { Plugins: { GestMZImpressora: { emparelhadas: async () => ({ dispositivos: [{ nome: 'MTP-II', endereco: 'AA:BB:CC:DD:EE:FF' }, { nome: 'Fone', endereco: '11:22:33:44:55:66' }] }), imprimir: async a => { window.__bt.push(a); } } } }; });
  assert.deepStrictEqual(await p.evaluate(() => GestImpressora.vias().bt), true);
  assert.strictEqual((await p.evaluate(() => GestImpressora.emparelhadas())).length, 2);
  await p.evaluate(() => GestImpressora.guardar({ via: 'bt', endereco: 'AA:BB:CC:DD:EE:FF', nome: 'MTP-II', cp: '850', cortar: true, }));
  await p.evaluate(v => imprimirDireto(v), CASOS.varios); const bt = await p.evaluate(() => window.__bt);
  assert.strictEqual(bt.length, 1); assert.strictEqual(bt[0].endereco, 'AA:BB:CC:DD:EE:FF'); const by = Buffer.from(bt[0].dados, 'base64'); assert.strictEqual(by[0], 0x1b); assert.strictEqual(by[1], 0x40); assert.ok(by.includes(Buffer.from('Subtotal')));
  // o botão «Imprimir (térmica)» aparece com impressora configurada e envia
  await p.evaluate(v => { jSet('gestmz_papel', '58'); mostrarRecibo(v); }, CASOS.varios); await p.waitForSelector('#pd'); await p.click('#pd'); await p.waitForFunction(() => window.__bt.length === 2);
  // sem Bluetooth e sem configuração
  await p.evaluate(() => { GestImpressora.remover(); }); assert.strictEqual(await p.evaluate(() => GestImpressora.ler()), null);
  const sem = await p.evaluate(async v => { try { await imprimirDireto(v); return 'ok'; } catch (e) { return e.message; } }, CASOS.um_item); assert.ok(/Configure primeiro/.test(sem));
  await p.evaluate(v => { document.querySelectorAll('.modal').forEach(m => m.remove()); mostrarRecibo(v); }, CASOS.um_item); assert.strictEqual(await p.locator('#pd').count(), 0, 'sem impressora, sem botão térmica');
  // Web Serial simulado
  await p.evaluate(() => { window.__ser = []; const porta = { getInfo: () => ({ usbVendorId: 1155, usbProductId: 22339 }), open: async o => { window.__ser.push('open:' + o.baudRate); }, close: async () => { window.__ser.push('close'); }, writable: { getWriter: () => ({ write: async u => { window.__ser.push('w:' + u.length); }, releaseLock() { window.__ser.push('rel'); } }) } };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => porta, getPorts: async () => [porta] } }); });
  const esc = await p.evaluate(() => GestImpressora.escolher('serial')); assert.strictEqual(esc.vendorId, 1155);
  await p.evaluate(e => GestImpressora.guardar(Object.assign(e, { cp: '850', cortar: true })), esc); await p.evaluate(v => imprimirDireto(v), CASOS.um_item);
  const ser = await p.evaluate(() => window.__ser); assert.ok(ser[0] === 'open:9600' && ser.at(-1) === 'close' && ser.some(x => x.startsWith('w:')), ser.join());
  // WebUSB simulado
  await p.evaluate(() => { window.__usb = []; const d = { vendorId: 1208, productId: 514, productName: 'POS-58', configuration: null, open: async () => { window.__usb.push('open'); }, selectConfiguration: async () => { d.configuration = { interfaces: [{ interfaceNumber: 0, alternates: [{ interfaceClass: 7, endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 2 }] }] }] }; }, claimInterface: async n => { window.__usb.push('claim' + n); }, releaseInterface: async () => { window.__usb.push('rel'); }, transferOut: async (e, u) => { window.__usb.push('out' + e + ':' + u.length); return { status: 'ok' }; }, close: async () => { window.__usb.push('close'); } };
    Object.defineProperty(navigator, 'usb', { configurable: true, value: { requestDevice: async () => d, getDevices: async () => [d] } }); });
  const us = await p.evaluate(() => GestImpressora.escolher('usb')); assert.strictEqual(us.productId, 514);
  await p.evaluate(e => GestImpressora.guardar(Object.assign(e, { cp: '858', cortar: false })), us); await p.evaluate(v => imprimirDireto(v), CASOS.um_item);
  const u = await p.evaluate(() => window.__usb); assert.ok(u[0] === 'open' && u.includes('claim0') && u.some(x => x.startsWith('out2:')) && u.at(-1) === 'close', u.join());
  // erro de impressão chega à pessoa
  await p.evaluate(() => { window.Capacitor.Plugins.GestMZImpressora.imprimir = async () => { throw new Error('Não consegui ligar à impressora.'); }; GestImpressora.guardar({ via: 'bt', endereco: 'AA:BB:CC:DD:EE:FF' }); });
  await p.evaluate(v => { document.querySelectorAll('.modal').forEach(m => m.remove()); mostrarRecibo(v); }, CASOS.um_item); await p.click('#pd'); await p.waitForFunction(() => /Não foi possível imprimir/.test(document.body.innerText));
  assert.deepStrictEqual(erros, []); await ctx.close();
});

rodar('ESC/POS: ecrã «Impressora térmica» lista as emparelhadas, guarda a escolha e imprime o teste', async (b, url) => {
  const { ctx, p } = await abrir(b, url, 'caixa');
  await p.evaluate(() => { window.__bt = []; window.Capacitor = { Plugins: { GestMZImpressora: { emparelhadas: async () => ({ dispositivos: [{ nome: 'MTP-II', endereco: 'AA:BB:CC:DD:EE:FF' }] }), imprimir: async a => { window.__bt.push(a); } } } }; impressoraConfigurar(); });
  await p.waitForSelector('#imb'); assert.ok(/MTP-II/.test(await p.locator('#imb').innerText())); await p.selectOption('#imc', '860'); await p.uncheck('#imx');
  await p.click('#imt'); await p.waitForFunction(() => window.__bt.length === 1); await p.click('.modal [data-ok]'); await p.waitForTimeout(200);
  const c = await p.evaluate(() => GestImpressora.ler()); assert.deepStrictEqual([c.via, c.endereco, c.cp, c.cortar], ['bt', 'AA:BB:CC:DD:EE:FF', '860', false]);
  await (async () => { await p.evaluate(() => impressoraConfigurar()); await p.waitForSelector('#imb'); await (await p.$('.modal .box')).screenshot({ path: path.join(SAIDA, 'impressora.png') }); })();
  await ctx.close();
  // sem nenhuma via (navegador sem USB/série/Bluetooth)
  const { ctx: c2, p: p2 } = await abrir(b, url, 'caixa'); await p2.evaluate(() => { Object.defineProperty(navigator, 'usb', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true }); impressoraConfigurar(); });
  assert.ok(/não permite ligar impressoras/.test(await p2.locator('.modal .box').innerText())); await c2.close();
});

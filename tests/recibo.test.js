// Recibo de venda: disposição (58/80 mm e A4), alinhamento, valores intactos, PDF, QR e personalização. SIMULAÇÃO: Chromium + cliente Supabase simulado.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www'), SAIDA = process.env.GESTMZ_RECIBOS || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'recibos-'));
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
const COLS = { 58: 32, 80: 42, a4: 56 };

rodar('recibo: todas as disposições cabem nas colunas de 58 mm, 80 mm e A4, com valores alinhados e sem cortes', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url);
  const r = await p.evaluate(({ CASOS }) => { const out = []; for (const [nome, v] of Object.entries(CASOS)) for (const k of ['58', '80', 'a4']) {
    const antes = JSON.stringify(v), cfg = reciboCfg(), m = reciboModelo(v), lin = reciboLinhas(m, PAPEIS[k].cols, cfg); out.push({ nome, k, lin, intacto: antes === JSON.stringify(v), m }); } return out; }, { CASOS });
  assert.deepStrictEqual(erros, []);
  for (const c of r) {
    const cols = COLS[c.k]; assert.ok(c.intacto, c.nome + ': a venda não foi alterada');
    for (const l of c.lin) if (l.k === 't') {
      const n = Math.floor(cols / l.s + 1e-9); assert.ok(l.t.length <= n, `${c.nome}/${c.k}: «${l.t}» (${l.t.length}) excede ${n}`); assert.ok(!/[\n\r\t]/.test(l.t));
      if (/^ {2}[\d,]+( \S+)? x /.test(l.t)) assert.strictEqual(l.t.length, n, `${c.nome}/${c.k}: valor da linha de artigo alinhado à direita «${l.t}»`);
      if (/^(Subtotal|Desconto|Base tributável|IVA|TOTAL|Pagamento|Valor recebido|Troco)/.test(l.t)) assert.strictEqual(l.t.length, n, `${c.nome}/${c.k}: resumo alinhado «${l.t}»`);
    }
  }
  await ctx.close();
});

rodar('recibo: os valores impressos são exatamente os da venda (subtotal, desconto, base, IVA, total, recebido, troco) e a numeração é a registada', async (b, url) => {
  const { ctx, p } = await abrir(b, url);
  const r = await p.evaluate(({ CASOS }) => Object.fromEntries(Object.entries(CASOS).map(([nome, v]) => [nome, { t: reciboLinhas(reciboModelo(v), 42, reciboCfg()).filter(l => l.k === 't').map(l => l.t).join('\n'), f: { sub: dinheiro(v.subtotal), des: dinheiro(v.desconto), iva: dinheiro(v.iva), tot: dinheiro(v.total), rec: dinheiro(v.recebido), tro: dinheiro(v.troco), n: nvenda(v) }, m: reciboModelo(v) }])), { CASOS });
  for (const [nome, x] of Object.entries(r)) { const v = CASOS[nome];
    assert.ok(x.t.includes(x.f.tot), nome + ': total'); assert.ok(x.t.includes(x.f.sub), nome + ': subtotal'); assert.ok(x.t.includes('Recibo   ' + x.f.n) || x.t.includes(x.f.n), nome + ': número do recibo');
    if (v.desconto) assert.ok(x.t.includes('-' + x.f.des), nome + ': desconto'); else assert.ok(!/Desconto/.test(x.t), nome + ': sem linha de desconto');
    if (v.iva) { assert.ok(x.t.includes(x.f.iva), nome + ': IVA'); assert.ok(/Base tributável/.test(x.t) && /IVA( 16%)? incluído/.test(x.t), nome + ': base e IVA'); } else assert.ok(!/IVA/.test(x.t), nome + ': sem IVA');
    if (v.pagamento === 'Numerário' && v.recebido) { assert.ok(x.t.includes(x.f.rec) && x.t.includes(x.f.tro), nome + ': recebido e troco'); } else assert.ok(!/Troco|Valor recebido/.test(x.t), nome + ': sem troco em ' + v.pagamento);
    assert.ok(x.t.includes(v.pagamento), nome + ': método de pagamento');
  }
  // IVA: base + IVA = valor das linhas com IVA (com o desconto repartido); taxa 16% mostrada quando é única
  assert.strictEqual(r.iva16.m.base, 200); assert.strictEqual(r.iva16.m.taxa, 16); assert.ok(/IVA 16% incluído/.test(r.iva16.t));
  assert.strictEqual(r.iva_desc_misto.m.taxa, 16); assert.strictEqual(r.iva_desc_misto.m.base, Math.round((180 * 360 / 380 - 24.89) * 100) / 100);
  assert.ok(/Provisório/.test(r.pendente.t) && /por enviar/.test(r.pendente.t), 'provisório sem número definitivo'); assert.ok(/VENDA ANULADA/.test(r.anulada.t));
  assert.ok(/Cliente  +Ana Maria/.test(r.cliente.t)); assert.ok(!/Cliente/.test(r.um_item.t));
  assert.ok(/2,5 kg x 78,40/.test(r.varios.t), 'unidade de medida'); assert.ok(/\(caixa de 24\)/.test(r.caixa_un.t));
  await ctx.close();
});

rodar('recibo: no ecrã não há cortes nem sobreposição (58, 80 e A4) e gera imagens de pré-visualização', async (b, url) => {
  const { ctx, p } = await abrir(b, url, 'dono', { width: 380, height: 900 });
  for (const k of ['58', '80', 'a4']) for (const nome of ['varios', 'iva_desc_misto', 'nome_longo', 'valores_grandes']) {
    await p.evaluate(({ k, v }) => { jSet('gestmz_papel', k); document.querySelectorAll('.modal').forEach(m => m.remove()); mostrarRecibo(v); }, { k, v: CASOS[nome] });
    await p.waitForSelector('.rc');
    const m = await p.evaluate(() => { const rc = document.querySelector('.rc'), bx = rc.getBoundingClientRect(); return { sw: rc.scrollWidth, cw: rc.clientWidth, over: [...rc.querySelectorAll('.r')].filter(e => e.scrollWidth > e.clientWidth + 1).length, bx: bx.width, vp: innerWidth }; });
    assert.ok(m.sw <= m.cw + 1, `${k}/${nome}: recibo mais largo que o seu espaço (${m.sw}>${m.cw})`); assert.strictEqual(m.over, 0, `${k}/${nome}: linhas cortadas`);
    if (nome === 'varios' || nome === 'nome_longo') await (await p.$('.rc')).screenshot({ path: path.join(SAIDA, `ecra-${k}-${nome}.png`) });
  }
  await ctx.close();
});

rodar('recibo: PDF válido em 58 mm e 80 mm (tamanho da página, texto e logótipo) e PDF de A4', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url);
  const LOGO = 'data:image/png;base64,' + await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 200; c.height = 70; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 70); x.fillStyle = '#000'; x.fillRect(4, 4, 62, 62); x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.fillText('NE', 13, 49); x.fillStyle = '#000'; x.font = 'bold 22px sans-serif'; x.fillText('Farmácia', 76, 40); return c.toDataURL('image/png').split(',')[1]; });
  await p.evaluate(l => { rcCfg = rcLimpar({ logo: l, sucursal: 'Sucursal Polana', email: 'geral@loja.co.mz', extra: 'Seg-Sáb 8h-20h', msg: 'Obrigado pela preferência!', msg2: 'Volte sempre.' }); }, LOGO);
  for (const k of ['58', '80', 'a4']) {
    const b64 = await p.evaluate(async ({ k, v }) => { jSet('gestmz_papel', k); const u = await pdfBytes(v); return b64(u); }, { k, v: CASOS.iva_desc_misto });
    const f = path.join(SAIDA, `recibo-${k}.pdf`); fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    assert.ok(fs.readFileSync(f).subarray(0, 5).toString() === '%PDF-');
    const info = spawnSync('pdfinfo', [f], { encoding: 'utf8' });
    if (info.status === 0) { const mm = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info.stdout); const w = +mm[1]; assert.ok(Math.abs(w - (k === 'a4' ? 595.28 : +k * 72 / 25.4)) < 1.2, `${k}: largura da página ${w}`);
      const tx = spawnSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }).stdout; assert.ok(/Farmácia Nova Esperança/.test(tx.replace(/\s+/g, ' ')) && /TOTAL/.test(tx) && /Base tributável/.test(tx) && /Troco/.test(tx), `${k}: texto do PDF`);
      spawnSync('pdftoppm', ['-r', k === 'a4' ? '70' : '160', '-png', '-singlefile', f, path.join(SAIDA, `pdf-${k}`)]); }
    assert.ok(Buffer.from(b64, 'base64').includes(Buffer.from('/Subtype /Image')), `${k}: logótipo no PDF`);
  }
  assert.deepStrictEqual(erros, []); await ctx.close();
});

rodar('recibo: personalização — só o dono vê e altera; guarda por RPC; recusa logótipo inválido; mostra/oculta campos', async (b, url) => {
  for (const papel of ['caixa', 'gerente']) { const { ctx, p } = await abrir(b, url, papel); await p.evaluate(v => mostrarRecibo(v), CASOS.um_item); await p.waitForSelector('.rc');
    assert.strictEqual(await p.locator('#cf').count(), 0, papel + ' não vê «Personalizar»'); await p.evaluate(() => reciboConfigurar()); assert.strictEqual(await p.locator('#rcp').count(), 0, papel + ' não abre a configuração'); await ctx.close(); }
  const { ctx, p, erros } = await abrir(b, url, 'dono', { width: 420, height: 950 });
  await p.evaluate(v => mostrarRecibo(v), CASOS.cliente); await p.waitForSelector('#cf'); await p.click('#cf'); await p.waitForSelector('#rcp .rc');
  assert.ok(/Obrigado pela preferência!/.test(await p.locator('#rcp').innerText()));
  await p.fill('[name=msg]', 'Volte sempre à Nova Esperança!'); await p.fill('[name=sucursal]', 'Sucursal Polana'); await p.fill('[name=extra]', 'Seg-Sáb 8h-20h'); await p.uncheck('[name=m_operador]');
  const pv = await p.locator('#rcp').innerText(); assert.ok(/Volte sempre à Nova Esperança!/.test(pv) && /Sucursal Polana/.test(pv) && /Seg-Sáb 8h-20h/.test(pv) && !/Operador/.test(pv), 'pré-visualização muda ao escrever');  assert.strictEqual(await p.locator('#rcp .rq, [name=m_qr]').count(), 0, 'sem QR');
  await (await p.$('.modal .box')).screenshot({ path: path.join(SAIDA, 'configuracao.png') });
  // logótipo inválido e válido
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 60; const x = c.getContext('2d'); x.fillStyle = '#00453A'; x.fillRect(0, 0, 120, 60); x.fillStyle = '#F4B400'; x.fillRect(10, 10, 40, 40); return c.toDataURL('image/png'); });
  fs.writeFileSync(path.join(SAIDA, 'logo-teste.png'), Buffer.from(png.split(',')[1], 'base64'));
  await p.setInputFiles('#lg', path.join(SAIDA, 'logo-teste.png')); await p.waitForSelector('#rcp .rl img');
  fs.writeFileSync(path.join(SAIDA, 'nao-imagem.txt'), 'olá'); await p.setInputFiles('#lg', { name: 'x.png', mimeType: 'text/plain', buffer: Buffer.from('olá') }); await p.waitForTimeout(150);
  assert.strictEqual(await p.locator('#rcp .rl img').count(), 1, 'ficheiro inválido não substitui o logótipo');
  await p.click('.modal [data-ok]'); await p.waitForFunction(() => window.__chamadas.some(c => c.n === 'guardar_recibo_config'));
  const ch = await p.evaluate(() => window.__chamadas.filter(c => c.n === 'guardar_recibo_config')[0].a.p_cfg);
  assert.strictEqual(ch.msg, 'Volte sempre à Nova Esperança!'); assert.strictEqual(ch.mostrar.operador, false); assert.ok(!('qr' in ch.mostrar)); assert.ok(/^data:image\/png;base64,/.test(ch.logo)); assert.strictEqual(ch.sucursal, 'Sucursal Polana');
  assert.ok(!('nome' in ch) && !('endereco' in ch) && !('nuit' in ch), 'a configuração do recibo não leva dados fiscais da loja');
  // o recibo passa a usar a configuração
  await p.waitForSelector('.rc'); const ap = await p.locator('#rcv').innerText(); assert.ok(/Volte sempre/.test(ap) && !/Operador/.test(ap));
  assert.deepStrictEqual(erros, []); await ctx.close();
});

rodar('recibo: sistema ainda sem a tabela/função: guarda neste aparelho e avisa, sem erro', async (b, url) => {
  const { ctx, p } = await abrir(b, url, 'dono');
  await p.evaluate(() => { window.__rpcErro = 'Could not find the function public.guardar_recibo_config in the schema cache'; });
  const msg = await p.evaluate(() => guardarConfig({ msg: 'Olá', mostrar: {} })); assert.ok(/neste aparelho/.test(msg));
  assert.strictEqual(await p.evaluate(() => reciboCfg().msg), 'Olá'); await ctx.close();
});

rodar('recibo: configuração maliciosa ou inválida é limpa (logótipo só PNG/JPEG em base64, textos curtos, HTML escapado)', async (b, url) => {
  const { ctx, p } = await abrir(b, url);
  const r = await p.evaluate(() => { const c = rcLimpar({ logo: 'javascript:alert(1)', msg: '<img src=x onerror=alert(1)>' + 'x'.repeat(200), extra: 'a\nb', mostrar: { qr: true, nuit: false } });
    rcCfg = c; return { c, h: reciboHTML({ id: 'v', num: 1, data: new Date().toISOString(), usuario_nome: '<b>x</b>', pagamento: 'Numerário', subtotal: 1, desconto: 0, iva: 0, total: 1, recebido: 1, troco: 0, itens: [{ nome: '<script>x</script>', qtd: 1, preco: 1, total: 1, iva: 0 }] }, '80', c) }; });
  assert.strictEqual(r.c.logo, null); assert.ok(r.c.msg.length <= 60); assert.ok(!/\n/.test(r.c.extra)); assert.ok(!('qr' in r.c.mostrar)); assert.strictEqual(r.c.mostrar.nuit, false);
  assert.ok(!/<script>|<b>x<\/b>|<img src=x/.test(r.h), 'HTML escapado'); await ctx.close();
});

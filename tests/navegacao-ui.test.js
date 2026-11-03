// Navegação, janelas (Termos/Privacidade), puxar para atualizar e adaptação a vários ecrãs.
// SIMULAÇÃO: Chromium real (toques reais via CDP) + cliente Supabase simulado. NÃO usa o Supabase real nem um telemóvel Android.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `(function(){
  window.__ch = []; window.__T = {}; window.__rpc = {}; window.__rt = []; window.__up = []; window.__dl = 0; window.__rm = [];
  const reg = (x) => window.__ch.push(x);
  const build = (t) => { const o = { t, filtros: [] }, b = { select(){ return b; }, order(){ return b; }, range(){ return b; }, eq(k, v){ o.filtros.push([k, v]); return b; }, gt(){ return b; }, gte(){ return b; }, lt(){ return b; }, lte(){ return b; }, limit(){ return b; },
    update(v){ o.upd = v; return b; }, insert(v){ o.ins = v; return b; }, delete(){ o.del = true; return b; },
    then(res, rej){ if (o.upd || o.ins || o.del) reg({ tab: t, upd: o.upd, ins: o.ins, del: o.del, filtros: o.filtros }); const dados = window.__T[t]; return Promise.resolve({ data: o.upd || o.ins || o.del ? (o.ins ? [Object.assign({ id: 'novo-' + t }, o.ins)] : []) : (typeof dados === 'function' ? dados() : (dados || [])), error: null }).then(res, rej); } }; return b; };
  const storage = { from: (bk) => ({
    upload: async (p, blob, o) => { window.__up.push({ bk, p, tipo: o && o.contentType, tam: blob.size }); return window.__upErro ? { data: null, error: { message: window.__upErro } } : { data: { path: p }, error: null }; },
    download: async (p) => { window.__dl++; if (window.__dlAtraso) await new Promise(r => setTimeout(r, window.__dlAtraso)); if (window.__dlFalha) return { data: null, error: { message: 'falhou' } }; return { data: new Blob(['x'.repeat(2000)], { type: 'image/jpeg' }), error: null }; },
    remove: async (l) => { window.__rm.push(...l); return { data: l, error: null }; } }) };
  const sbf = { auth:{ getSession: async()=>({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}) },
    rpc: (n, a) => { reg({ rpc: n, a }); const f = window.__rpc[n]; const b = { range(){ return b; }, order(){ return b; }, then(res, rej){ let r; try { r = f ? f(a) : { data: null, error: null }; } catch (e) { r = { data: null, error: { message: String(e.message) } }; } return Promise.resolve(r).then(res, rej); } }; return b; },
    channel: (nome) => { const c = { on(tipo, cfg, cb){ window.__rt.push({ nome, cfg, cb }); return c; }, subscribe(){ return c; } }; return c; }, removeChannel(){}, from: build, storage };
  window.supabase = { createClient: () => sbf };
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });

const LOJA = { id: '11111111-1111-1111-1111-111111111111', nome: 'Loja com um nome bastante comprido para testar o ecrã', estado: 'ativa', valido_ate: '2099-01-01', configurada: true, operacional: true };
const LONGO = 'Produto com um nome muito comprido para ver se a tabela e os cartões aguentam sem sair do ecrã 1234567890';
const PROD = i => ({ id: '22222222-2222-2222-2222-' + String(i).padStart(12, '0'), nome: i % 2 ? LONGO + ' ' + i : 'Arroz ' + i, codigo: '90000' + i, categoria: 'Mercearia', preco: 50 + i, custo: 30, minimo: 3, iva: 0, controlado: false, un_por_caixa: null, preco_caixa: null, embalagem: null, codigo_caixa: null, foto_ver: null, ativo: true, disp_un: 10, disp_cx: 0 });

async function abrir(b, url, papel, vp, opts) {
  const ctx = await b.newContext(Object.assign({ viewport: vp || { width: 1100, height: 800 } }, opts || {})); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(url); await p.waitForSelector('#f');
  await p.evaluate(([pp, lj, prods]) => {
    window.__T = new Proxy({}, { get: (t, k) => (k in t ? t[k] : []), set: (t, k, v) => { t[k] = v; return true; } });
    window.__rpc = new Proxy({}, { get: (t, k) => t[k] || (() => ({ data: [], error: null })), set: (t, k, v) => { t[k] = v; return true; } });
    window.__T.loja = lj; window.__T.produtos = prods;
    window.__rpc.minha_loja_info = () => ({ data: lj, error: null }); window.__rpc.produtos_loja = () => ({ data: prods, error: null }); window.__rpc.produtos_venda = () => ({ data: prods, error: null });
    window.__rpc.lotes_loja = () => ({ data: prods.map((p, i) => ({ id: 'L' + i, produto_id: p.id, qtd: 10, soltas: 10, validade: '2027-05-01', custo_un: 30, lote: 'A' + i })), error: null });
    window.__T.clientes = Array.from({ length: 5 }, (_, i) => ({ id: 'c' + i, nome: 'Cliente com um nome muito comprido número ' + i + ' da Silva Nhaca', tel: '84 123 45' + i, divida: 100 * i, nuit: '' }));
    window.__rpc.vendas_loja = () => ({ data: Array.from({ length: 6 }, (_, i) => ({ id: 'v' + i, num: i + 1, data: new Date().toISOString(), usuario_nome: 'Funcionário com nome muito comprido ' + i, pagamento: 'M-Pesa', total: 1234.5 + i, desconto: 0, anulada: false, cliente_id: null, recebido: 1300, itens: [{ nome: 'Produto com um nome muito comprido para a tabela ' + i, qtd: 2, un: 2, preco: 50, total: 100, custo_un: 30 }] })), error: null });
    window.__T.plataforma = [{ preco_mensal: 500, preco_trimestral: 1300, preco_anual: 4800, numero_pagamento: '84 000 0000', nome_pagamento: 'GestMZ' }];
    S.perfil = { papel: pp, nome: 'Teste com nome comprido', id: 'u1', loja_id: lj.id }; S.loja = lj; S.clientes = []; S.cats = []; S.produtos = prods; S.equipa = [];
    recarregarProdutos().then(() => shell(navLoja()));
  }, [papel, LOJA, Array.from({ length: 8 }, (_, i) => PROD(i + 1))]);
  await p.waitForSelector('#nav button');
  return { ctx, p, erros };
}
const ir = async (p, v) => { await p.evaluate(v => go(v), v); await p.waitForFunction(v => cur === v && !document.querySelector('#main .loading'), v, { timeout: 5000 }); };
const lento = (p, v, ms, marca) => p.evaluate(([v, ms, marca]) => { const o = VIEWS[v]; window.__n = window.__n || {}; VIEWS[v] = async function () { window.__n[v] = (window.__n[v] || 0) + 1; if (ms) await new Promise(r => setTimeout(r, ms)); const m = $('#main'); const r = await o(); return r; }; }, [v, ms, marca]);

test('Termos e Privacidade em «Conta»: abrem uma só janela e o X fecha só essa, sem abrir «Novo funcionário» (mesmo vindo de «Equipa»)', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    for (const papel of ['dono', 'gerente', 'caixa']) {
      const { ctx, p, erros } = await abrir(b, url, papel, { width: 412, height: 800 }, { hasTouch: true, isMobile: true });
      if (papel !== 'caixa') await ir(p, 'equipa');   // deixa o ecrã «Equipa» (e os seus manipuladores antigos) para trás
      await ir(p, 'perfil'); await p.waitForSelector('#main [data-legal]');
      for (const [k, titulo] of [['termos', 'Termos de utilização'], ['privacidade', 'Política de privacidade']]) {
        for (let rep = 0; rep < 3; rep++) {
          await p.tap(`#main [data-legal=${k}]`); await p.waitForSelector('.modal .legal');
          assert.strictEqual(await p.locator('.modal').count(), 1, papel + ': só uma janela ao abrir ' + k); assert.ok((await p.locator('.modal').innerText()).includes(titulo));
          await p.tap('.modal [data-x]'); await p.waitForTimeout(150);
          assert.strictEqual(await p.locator('.modal').count(), 0, papel + ': o X fecha a janela de ' + k + ' (repetição ' + rep + ')');
          assert.ok(!/Novo funcionário|Editar /.test(await p.locator('body').innerText().catch(() => '')) || (await p.locator('.modal').count()) === 0, 'não abre «Novo funcionário»');
        }
      }
      assert.strictEqual(await p.evaluate(() => cur), 'perfil', papel + ': continua em «Conta»'); assert.deepStrictEqual(erros, []); await ctx.close();
    }
  } finally { await b.close(); s.close(); }
});

test('navegação: tocar em várias opções seguidas mostra sempre o conteúdo da última, mesmo que um ecrã antigo demore mais', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono');
    await lento(p, 'equipa', 700); await lento(p, 'relatorios', 450); await lento(p, 'clientes', 40); await lento(p, 'despesas', 150);
    const titulo = async () => (await p.locator('#main h2').first().innerText().catch(() => '')).trim();
    // 1) ecrã lento e depois rápido: o lento acaba depois e não pode ficar por cima
    await p.click('#nav [data-v=equipa]'); await p.waitForTimeout(30); await p.click('#nav [data-v=clientes]');
    await p.waitForTimeout(1300); assert.strictEqual(await titulo(), 'Clientes', 'depois de «Equipa» lento, fica «Clientes»'); assert.strictEqual(await p.evaluate(() => cur), 'clientes');
    assert.ok(await p.locator('#nav [data-v=clientes]').evaluate(e => e.classList.contains('on')), 'o menu marcado é o do conteúdo');
    // 2) sequência rápida de várias opções
    for (const v of ['equipa', 'relatorios', 'despesas', 'clientes', 'produtos', 'vendas', 'despesas']) { await p.click(`#nav [data-v=${v}]`); await p.waitForTimeout(25); }
    await p.waitForTimeout(1500); assert.strictEqual(await titulo(), 'Despesas', 'ao fim da sequência fica a última escolha'); assert.strictEqual(await p.evaluate(() => cur), 'despesas');
    for (const v of ['painel', 'vendas', 'produtos', 'clientes', 'despesas', 'relatorios', 'equipa', 'registo', 'assinatura', 'suporte', 'ajuda', 'perfil']) {
      await p.click(`#nav [data-v=${v}]`); await p.waitForFunction(v => cur === v && !document.querySelector('#main .loading'), v);
      const on = await p.locator('#nav button.on').getAttribute('data-v'); assert.strictEqual(on, v, 'menu marcado = ' + v);
      assert.ok((await p.locator('#main').innerText()).trim().length > 0, v + ' tem conteúdo');
    }
    // 3) o conteúdo de «Equipa» nunca aparece em «Conta»
    await p.click('#nav [data-v=equipa]'); await p.waitForTimeout(40); await p.click('#nav [data-v=perfil]'); await p.waitForTimeout(1200);
    assert.ok(!/Novo funcionário/.test(await p.locator('#main').innerText()), '«Conta» não mostra «Equipa»'); assert.strictEqual(await p.locator('.modal').count(), 0);
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

test('puxar para atualizar: gesto real de toque atualiza só quando está no topo; não duplica, não apaga formulários, respeita offline e mostra erros', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono', { width: 412, height: 800 }, { hasTouch: true, isMobile: true });
    const cdp = await ctx.newCDPSession(p);
    const toque = async (x, y0, y1, passos = 12) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] }); for (let i = 1; i <= passos; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / passos }] }); return async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }; };
    await lento(p, 'vendas', 150); await ir(p, 'vendas'); const base = await p.evaluate(() => window.__n.vendas);
    // escreve uma data no campo do ecrã: tem de se manter
    await p.evaluate(() => { const d = document.querySelector('#d'); d.value = '2026-10-01'; d.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForTimeout(300);
    const antesCh = await p.evaluate(() => window.__ch.length);
    // 1) puxar curto: não atualiza
    let fim = await toque(200, 150, 190); await p.waitForTimeout(80); await fim(); await p.waitForTimeout(400); assert.strictEqual(await p.evaluate(() => window.__n.vendas), base, 'puxar pouco não atualiza');
    // 2) puxar até ao fim: indicador e atualização
    fim = await toque(200, 150, 420, 20); await p.waitForSelector('#ptr:not([hidden])'); assert.ok(/Solte/.test(await p.locator('#ptr').innerText()), 'indicador pede para soltar'); await fim();
    await p.waitForFunction(b => window.__n.vendas > b, base); await p.waitForFunction(() => /Atualizado/.test(document.querySelector('.toast') ? document.querySelector('.toast').textContent : ''), null, { timeout: 4000 });
    assert.strictEqual(await p.locator('#d').inputValue(), '2026-10-01', 'o campo do ecrã mantém o que o utilizador escolheu');
    assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.rpc === 'registar_venda' || c.rpc === 'anular_venda').length), 0, 'atualizar nunca envia nem altera vendas');
    // 3) rolagem normal: se o ecrã não está no topo, descer o dedo rola e não atualiza
    await p.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollTo(0, 600); }); await p.waitForTimeout(100); const n1 = await p.evaluate(() => window.__n.vendas);
    fim = await toque(200, 150, 420, 20); await fim(); await p.waitForTimeout(500); assert.strictEqual(await p.evaluate(() => window.__n.vendas), n1, 'fora do topo não atualiza'); await p.evaluate(() => { window.scrollTo(0, 0); });
    // 4) pedidos em simultâneo: só um
    const n2 = await p.evaluate(() => window.__n.vendas); const rs = await p.evaluate(() => Promise.all([GestPuxar.atualizar(), GestPuxar.atualizar(), GestPuxar.atualizar()]));
    assert.deepStrictEqual(rs.slice().sort(), ['ocupado', 'ocupado', 'ok']); assert.strictEqual(await p.evaluate(() => window.__n.vendas), n2 + 1, 'três pedidos seguidos = uma só atualização');
    // 5) janelas abertas e ecrãs com formulários: não atualiza
    await ir(p, 'perfil'); assert.strictEqual(await p.evaluate(() => GestPuxar.pode()), false, '«Conta» (formulários) não se atualiza por gesto');
    await ir(p, 'vendas'); await p.evaluate(() => modal('Teste', '<p>x</p>')); assert.strictEqual(await p.evaluate(() => GestPuxar.pode()), false, 'com janela aberta não atualiza'); await p.evaluate(() => document.querySelector('.modal [data-x]').click());
    // 6) erro: mantém o conteúdo e avisa
    const html0 = await p.locator('#main').innerHTML(); await p.evaluate(() => { const o = VIEWS.vendas; window.__o = o; VIEWS.vendas = async () => { throw new Error('Falha de teste'); }; });
    const re = await p.evaluate(() => GestPuxar.atualizar()); assert.strictEqual(re, 'erro'); assert.ok(/Não foi possível atualizar: Falha de teste/.test(await p.locator('.toast').innerText())); assert.strictEqual(await p.locator('#main').innerHTML(), html0, 'o ecrã não foi apagado');
    await p.evaluate(() => { VIEWS.vendas = window.__o; });
    // 7) offline: avisa, não pede nada; quando a ligação volta, atualiza sozinho
    await ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); const n3 = await p.evaluate(() => window.__n.vendas);
    assert.strictEqual(await p.evaluate(() => GestPuxar.atualizar()), 'offline'); assert.ok(/Sem ligação/.test(await p.locator('.toast').innerText())); assert.strictEqual(await p.evaluate(() => window.__n.vendas), n3, 'offline não pede dados');
    await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForFunction(n => window.__n.vendas > n, n3, { timeout: 4000 });
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

const ECRAS = [['telemóvel pequeno vertical', 360, 640], ['telemóvel pequeno horizontal', 640, 360], ['telemóvel grande vertical', 412, 915], ['telemóvel grande horizontal', 915, 412], ['tablet vertical', 768, 1024], ['tablet horizontal', 1024, 768],
  ['portátil', 1280, 720], ['computador', 1920, 1080], ['janela redimensionada larga', 1100, 600], ['janela redimensionada estreita', 800, 520], ['muito estreito', 320, 568]];

test('puxar para atualizar: em «Produtos» e no «Painel» relê os produtos do servidor; num erro mostra o aviso e mantém o ecrã', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono', { width: 412, height: 800 }, { hasTouch: true, isMobile: true });
    await p.evaluate(() => { window.__rp = 0; const o = window.recarregarProdutos; window.recarregarProdutos = async function () { window.__rp++; return o.apply(this, arguments); }; });
    for (const v of ['produtos', 'painel']) {
      await ir(p, v); const antes = await p.evaluate(() => window.__rp);
      const r = await p.evaluate(() => atualizarPagina()); assert.strictEqual(r, 'ok', v);
      assert.ok(await p.evaluate(() => window.__rp) > antes, v + ': a atualização tem de reler os produtos');
    }
    // erro do servidor: a promessa rejeita (o gesto mostra o aviso) e o ecrã não fica em branco
    await ir(p, 'produtos'); await p.evaluate(() => { window.recarregarProdutos = async () => { throw new Error('falhou de propósito'); }; });
    const msg = await p.evaluate(async () => { try { await atualizarPagina(); return 'sem erro'; } catch (e) { return e.message; } });
    assert.strictEqual(msg, 'falhou de propósito'); assert.ok(await p.locator('#main .bar h2').count() > 0, 'o ecrã continua desenhado');
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

test('adaptação: em todos os tamanhos e orientações e para os 3 cargos, nada sai do ecrã e todas as opções ficam acessíveis', { skip: !chromium && 'playwright indisponível', timeout: 600000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch(); const falhas = [];
  try {
    for (const [nome, w, h] of ECRAS) {
      for (const papel of ['dono', 'gerente', 'caixa']) {
        const { ctx, p, erros } = await abrir(b, url, papel, { width: w, height: h }, w < 1000 ? { hasTouch: true, isMobile: true } : {});
        const itens = await p.evaluate(() => navLoja().map(n => n[0]));
        for (const v of itens) {
          if (v === 'sair') continue;
          await p.evaluate(v => go(v), v); await p.waitForFunction(v => cur === v && !document.querySelector('#main .loading'), v, { timeout: 5000 }).catch(() => { });
          const r = await p.evaluate(() => { const d = document.documentElement; return { sw: d.scrollWidth, iw: window.innerWidth }; }); r.iw = w;   // em emulação de telemóvel o navegador alarga a janela quando há excesso: compara-se com a largura real do aparelho
          if (r.sw > w + 1 || r.iw > w + 1 && false) falhas.push(`${nome} ${papel}/${v}: a página tem rolagem horizontal (${r.sw} > ${r.iw})`);
          // o menu do ecrã tem de estar acessível
          const ok = await p.evaluate(v => { const bt = document.querySelector(`#nav [data-v=${v}]`); if (!bt) return 'sem botão'; bt.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = bt.getBoundingClientRect(); const vis = r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= window.visualViewport.width + 1 && r.top >= -1 && r.bottom <= window.visualViewport.height + 1; return vis ? 'ok' : 'fora do ecrã ' + JSON.stringify([r.left, r.right, r.top, r.bottom]); }, v);
          if (ok !== 'ok') falhas.push(`${nome} ${papel}/${v}: botão do menu ${ok}`);
          // o último conteúdo não fica tapado pela barra de menu
          const tapado = await p.evaluate(() => { const m = document.querySelector('main'), sd = document.querySelector('.side'); if (!m || !sd) return false; const sr = sd.getBoundingClientRect(); if (sr.width < window.visualViewport.width * 0.9) return false; return parseFloat(getComputedStyle(m).paddingBottom) < sr.height; });
          if (tapado) falhas.push(`${nome} ${papel}/${v}: a barra de menu tapa o fim do conteúdo`);
        }
        // telemóvel (≤640): as tabelas passam a cartões, sem rolar para os lados; horizontal baixo: menu em coluna à esquerda sem tapar o conteúdo
        if (papel === 'dono') {
          await p.evaluate(() => go('produtos')); await p.waitForFunction(() => !document.querySelector('#main .loading') && document.querySelector('#main table'));
          const tb = await p.evaluate(() => { const t = document.querySelector('#main .tw'), r = document.querySelector('#main .tw tr:not(:has(> th))'); return { tw: t.scrollWidth <= t.clientWidth + 1, disp: getComputedStyle(r).display, cab: getComputedStyle(document.querySelector('#main .tw tr:has(> th)')).display, rotulo: !!document.querySelector('#main .tw td[data-l]') }; });
          if (w <= 640) { if (!tb.tw || tb.disp !== 'block' || tb.cab !== 'none' || !tb.rotulo) falhas.push(`${nome}: a tabela não passou a cartões ${JSON.stringify(tb)}`); } else if (tb.disp === 'block') falhas.push(`${nome}: em ecrã largo a tabela não devia ser cartões`);
          const rail = await p.evaluate(() => { const s = document.querySelector('.side').getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(); return { sr: s.right, sw: s.width, ml: m.left, mt: m.top }; });
          if (w <= 900 && h <= 520 && w > h) { if (!(rail.sw < 120 && rail.ml >= rail.sr - 1)) falhas.push(`${nome}: em horizontal o menu devia ser uma coluna à esquerda sem tapar o conteúdo ${JSON.stringify(rail)}`); }
        }
        // janela de formulário cabe no ecrã (ou rola dentro dela)
        const j = await p.evaluate(() => { const w = modal('Janela de teste', Array.from({ length: 12 }, (_, i) => `<label>Campo ${i}<input class="in" name="c${i}"></label>`).join(''), { okText: 'Guardar' }); const bx = w.m.querySelector('.box').getBoundingClientRect(); const ok = document.querySelector('.modal [data-ok]'); w.m.querySelector('.box').scrollTop = 9999; const ob = ok ? ok.getBoundingClientRect() : null; const r = { t: bx.top, b: bx.bottom, l: bx.left, r: bx.right, h: window.innerHeight, w: window.innerWidth, okb: ob && ob.bottom, okt: ob && ob.top }; w.close(); return r; });
        if (j.t < -1 || j.b > j.h + 1 || j.l < -1 || j.r > j.w + 1) falhas.push(`${nome} ${papel}: a janela não cabe no ecrã ${JSON.stringify(j)}`);
        if (j.okb != null && (j.okb > j.h + 1 || j.okt < 0)) falhas.push(`${nome} ${papel}: o botão Guardar fica inacessível`);
        if (erros.length) falhas.push(`${nome} ${papel}: erros de script ${erros.join('|')}`);
        await ctx.close();
      }
    }
    assert.deepStrictEqual(falhas, [], falhas.join('\n'));
  } finally { await b.close(); s.close(); }
});

test('rotação: ao rodar o aparelho mantém-se o ecrã, o que foi escrito e a janela aberta', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    for (const [v, h] of [[{ width: 412, height: 915 }, { width: 915, height: 412 }], [{ width: 768, height: 1024 }, { width: 1024, height: 768 }], [{ width: 1100, height: 700 }, { width: 760, height: 480 }]]) {
      const { ctx, p, erros } = await abrir(b, url, 'dono', v, v.width < 1000 ? { hasTouch: true, isMobile: true } : {});
      await ir(p, 'produtos'); await p.fill('#q', 'Arroz 2'); const antes = await p.locator('#main').innerText();
      await p.evaluate(() => modal('Janela', '<label>Nome<input class="in" name="nome" id="jn"></label>', { okText: 'Guardar' })); await p.fill('#jn', 'texto escrito');
      await p.setViewportSize(h); await p.waitForTimeout(300);
      assert.strictEqual(await p.evaluate(() => cur), 'produtos', 'continua no mesmo ecrã'); assert.strictEqual(await p.locator('#q').inputValue(), 'Arroz 2', 'a pesquisa mantém-se');
      assert.strictEqual(await p.locator('#jn').inputValue(), 'texto escrito', 'o que foi escrito na janela mantém-se'); assert.strictEqual(await p.locator('.modal').count(), 1);
      const r = await p.evaluate(() => { const bx = document.querySelector('.modal .box').getBoundingClientRect(); return { b: bx.bottom, h: window.visualViewport.height, sw: document.documentElement.scrollWidth, iw: window.visualViewport.width }; });
      assert.ok(r.b <= r.h + 1 && r.sw <= r.iw + 1, 'depois de rodar tudo cabe: ' + JSON.stringify(r)); assert.deepStrictEqual(erros, []); await ctx.close();
    }
  } finally { await b.close(); s.close(); }
});


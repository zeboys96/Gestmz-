// Ordem na entrada: termos -> guia de dicas -> aviso de atualização (só com a loja aberta). SIMULAÇÃO: Chromium + Supabase simulado.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const VERS = JSON.parse(fs.readFileSync(path.join(WWW, 'versions.json'), 'utf8'));
const FAKE = `(function(){ window.__meta = {}; window.__out = 0; window.__buscas = 0;
  const sbf = { auth: { getSession: async () => ({ data: { session: window.__sess ? { user: { id: 'u1', user_metadata: window.__meta } } : null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
    updateUser: async (a) => { Object.assign(window.__meta, a.data); return { data: {}, error: null }; }, signOut: async () => { window.__out++; window.__sess = false; return {}; } },
    rpc: async () => ({ data: null, error: null }), channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}, from: () => new Proxy({}, { get: () => function () { return this; } }) };
  window.supabase = { createClient: () => sbf };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { App: { getInfo: async () => ({ id: 'mz.gestmz.app', version: '1.1.1' }) } } };
  const f0 = window.fetch; window.fetch = (u, o) => /versions\\.json/.test(String(u)) ? (window.__buscas++, Promise.resolve(new Response(JSON.stringify(window.__VERS), { status: 200 }))) : f0(u, o);
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
async function abrir(b, url) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 800 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.addInitScript(v => { window.__VERS = v; }, VERS);
  await p.goto(url); await p.waitForSelector('#f');
  await p.evaluate(() => { window.GESTMZ_CONFIG = Object.assign(window.GESTMZ_CONFIG || {}, { VERSOES_URL: 'https://x.invalid/versions.json' }); window.__sess = true; localStorage.clear(); S.perfil = { papel: 'caixa', nome: 'T', id: 'u1', loja_id: 'l1' }; });
  return { ctx, p, erros };
}
const visivel = (p, s) => p.locator(s).count();

test('entrada: sem aceitar os termos, o guia e o aviso não aparecem; «Sair» limpa tudo e o login fica limpo', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url);
    await p.evaluate(() => { GestMZAtualizacao.iniciar(); fimDaEntrada(); }); await p.waitForSelector('#legal-gate');
    assert.strictEqual(await visivel(p, '#sl'), 0, 'guia não abre antes dos termos'); await p.waitForTimeout(300);
    await p.evaluate(() => GestMZAtualizacao.aposEntrar(0)); // não deve ligar nada enquanto os termos estão abertos
    await p.waitForTimeout(500); assert.strictEqual(await visivel(p, '#upd'), 0, 'sem aviso com os termos abertos');
    assert.strictEqual(await p.evaluate(() => !!localStorage.getItem('gestmz_ajuda_u1')), false, 'guia não foi marcado como visto');
    await p.click('#lg-sair'); await p.waitForFunction(() => window.__out === 1);
    await p.waitForSelector('#f'); await p.waitForTimeout(500);
    assert.strictEqual(await visivel(p, '.modal'), 0, 'nada por cima do login'); assert.strictEqual(await visivel(p, '#sl'), 0); assert.strictEqual(await visivel(p, '#upd'), 0, 'sem aviso no login');
    assert.strictEqual(await p.evaluate(() => !!localStorage.getItem('gestmz_ajuda_u1')), false);
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

test('entrada: depois de aceitar vem o guia (uma vez) e só então, com a loja aberta, o aviso de atualização; sair remove o aviso', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url);
    await p.evaluate(() => { GestMZAtualizacao.iniciar(); window.__fim = fimDaEntrada(); }); await p.waitForSelector('#legal-gate');
    await p.check('#lg-ck'); await p.click('#lg-ok'); await p.waitForSelector('#sl');
    assert.strictEqual(await visivel(p, '#legal-gate'), 0); assert.strictEqual(await visivel(p, '#upd'), 0, 'aviso ainda não');
    await p.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); GestMZAtualizacao.aposEntrar(100); });
    await p.waitForSelector('#upd'); assert.ok(/Nova versão/.test(await p.locator('#upd').innerText()));
    await p.evaluate(() => sair()); await p.waitForSelector('#f'); assert.strictEqual(await visivel(p, '#upd'), 0, 'aviso some ao sair'); assert.strictEqual(await visivel(p, '.modal'), 0);
    const b0 = await p.evaluate(() => window.__buscas); await p.waitForTimeout(400);
    await p.evaluate(() => { S.perfil = { papel: 'caixa', id: 'u1', nome: 'T', loja_id: 'l1' }; window.__sess = true; });
    // com a sessão fechada, uma verificação tardia não mostra nada no login
    await p.evaluate(() => GestMZAtualizacao.fechar()); await p.waitForTimeout(300); assert.strictEqual(await visivel(p, '#upd'), 0);
    // segunda entrada: guia já visto, não repete
    await p.evaluate(() => { document.querySelectorAll('.modal,#upd').forEach(m => m.remove()); return fimDaEntrada(); }); await p.waitForTimeout(300); assert.strictEqual(await visivel(p, '#sl'), 0, 'guia só uma vez');
    assert.ok(b0 >= 1); assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

test('entrada: ao voltar à app (aberta há mais de 10 min) procura atualização de novo; no login nunca', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url);
    await p.evaluate(() => { GestMZAtualizacao.aposEntrar(0); }); await p.waitForSelector('#upd'); const n0 = await p.evaluate(() => window.__buscas);
    const voltar = () => p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.evaluate(() => document.getElementById('upd').remove()); await voltar(); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => window.__buscas), n0, 'menos de 10 min: não procura outra vez');
    await p.evaluate(() => { const d0 = Date.now; Date.now = () => d0() + 11 * 60 * 1000; }); await voltar(); await p.waitForSelector('#upd');
    assert.strictEqual(await p.evaluate(() => window.__buscas), n0 + 1, 'passados 10 min: procura de novo');
    await p.evaluate(() => sair()); await p.waitForSelector('#f'); await voltar(); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => window.__buscas), n0 + 1, 'no login não procura'); assert.strictEqual(await visivel(p, '#upd'), 0);
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

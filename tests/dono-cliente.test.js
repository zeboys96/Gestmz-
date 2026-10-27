// Testa no navegador (Chromium/Playwright, com um cliente Supabase simulado) que a opção «Configurar o dono do sistema»
// só aparece quando o SERVIDOR responde 'aberta' — e falha fechada em tudo o resto. Simulação: não usa o Supabase real.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `
window.__chamadas = [];
(function () {
  const resp = () => window.__estado || { data: 'fechada', error: null };
  const sbf = { auth: {
      getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ error: { message: 'x' } }), signUp: async () => { window.__chamadas.push('signUp'); return { data: { session: null }, error: { message: 'x' } }; }, signOut: async () => ({}) },
    rpc: async (n, a) => { window.__chamadas.push('rpc:' + n); if (n === 'estado_inicializacao') { const r = resp(); if (r.lancar) throw new Error('rede'); return r; } return { data: null, error: null }; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
    from: () => new Proxy({}, { get: () => function () { return this; } }) };
  window.supabase = { createClient: () => sbf };
})();`;
function servidor() {
  return http.createServer((req, res) => {
    const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
    const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.end(fs.readFileSync(f));
  });
}
test('cliente: «Configurar o dono do sistema» falha fechado', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const srv = servidor(); await new Promise(r => srv.listen(0, r)); const url = 'http://127.0.0.1:' + srv.address().port + '/';
  let b; try { b = await chromium.launch(); } catch (e) { srv.close(); return assert.fail('não foi possível abrir o Chromium: ' + e.message); }
  const casos = [
    ['servidor diz fechada', { data: 'fechada', error: null }, false],
    ['servidor diz aberta', { data: 'aberta', error: null }, true],
    ['erro da consulta (ex.: função inexistente)', { data: null, error: { message: 'x' } }, false],
    ['consulta lança exceção (sem rede)', { lancar: true }, false],
    ['resposta inesperada', { data: true, error: null }, false],
    ['resposta nula', { data: null, error: null }, false],
  ];
  try {
    for (const [nome, estado, esperaBotao] of casos) {
      const ctx = await b.newContext(); const p = await ctx.newPage();
      const erros = []; p.on('pageerror', e => erros.push(e.message));
      await p.addInitScript(e => { window.__estado = e; }, estado);
      await p.goto(url); await p.waitForSelector('#f', { timeout: 10000 });
      const tem = (await p.locator('#sup').count()) > 0;
      assert.strictEqual(tem, esperaBotao, nome + ': botão visível = ' + tem);
      assert.deepStrictEqual(erros, [], nome + ': erros JS ' + erros);
      await ctx.close();
    }
    // sem Internet (navigator.onLine=false) com o servidor a dizer 'aberta' → continua fechado
    let ctx = await b.newContext(); let p = await ctx.newPage();
    await p.addInitScript(() => { window.__estado = { data: 'aberta', error: null }; Object.defineProperty(navigator, 'onLine', { get: () => false }); });
    await p.goto(url); await p.waitForSelector('#f');
    assert.strictEqual(await p.locator('#sup').count(), 0, 'offline: o botão não pode aparecer'); await ctx.close();
    // forçar o formulário com o servidor a dizer 'fechada': mostra mensagem segura e NUNCA chama signUp
    ctx = await b.newContext(); p = await ctx.newPage();
    await p.addInitScript(() => { window.__estado = { data: 'fechada', error: null }; });
    await p.goto(url); await p.waitForSelector('#f');
    await p.evaluate(() => vSetupSuper()); await p.waitForSelector('text=Configuração indisponível');
    assert.strictEqual(await p.locator('input[name=senha]').count(), 0, 'não mostra o formulário de criação');
    assert.ok(!(await p.evaluate(() => window.__chamadas)).includes('signUp'), 'não regista utilizadores');
    await ctx.close();
    // com 'aberta' mostra o formulário; se o servidor fechar entretanto, o envio é recusado ANTES do signUp
    ctx = await b.newContext(); p = await ctx.newPage();
    await p.addInitScript(() => { window.__estado = { data: 'aberta', error: null }; });
    await p.goto(url); await p.waitForSelector('#sup'); await p.click('#sup'); await p.waitForSelector('input[name=senha]');
    await p.evaluate(() => { window.__estado = { data: 'fechada', error: null }; });
    await p.fill('input[name=nome]', 'X'); await p.fill('input[name=email]', 'x@teste.local'); await p.fill('input[name=senha]', '123456'); await p.click('#go');
    await p.waitForTimeout(500);
    assert.ok(!(await p.evaluate(() => window.__chamadas)).includes('signUp'), 'servidor fechou → não chama signUp'); await ctx.close();
  } finally { await b.close(); srv.close(); }
});

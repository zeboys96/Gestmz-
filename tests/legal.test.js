// Termos de uso, política de privacidade e contrato (www/legal.js). SIMULAÇÃO: Chromium real + cliente Supabase simulado.
// Não usa o Supabase real nem um telemóvel. A aceitação grava-se em user_metadata do Supabase Auth (auth.updateUser).
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `(function(){
  window.__upd = []; window.__out = 0; window.__meta = {}; window.__updErro = null;
  const sbf = { auth: {
    getSession: async () => ({ data: { session: window.__sess ? { user: { id: 'u1', user_metadata: window.__meta } } : null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
    updateUser: async (a) => { window.__upd.push(a); if (window.__updErro) return { data: null, error: { message: window.__updErro } }; Object.assign(window.__meta, a.data); return { data: {}, error: null }; },
    signOut: async () => { window.__out++; return {}; } },
    rpc: async () => ({ data: 'fechada', error: null }), channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){},
    from: () => new Proxy({}, { get: () => function () { return this; } }) };
  window.supabase = { createClient: () => sbf };
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });

async function abrir(b, url, papel) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 800 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(url); await p.waitForSelector('#f');
  await p.evaluate(pp => { window.__sess = true; S.perfil = { papel: pp, nome: 'Teste', id: 'u1', loja_id: 'l1' }; }, papel);
  return { ctx, p, erros };
}

test('legal: ecrã de entrada tem as 3 ligações e cada texto abre; os textos têm o essencial', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono');
    assert.strictEqual(await p.locator('#f [name=e]').count(), 1, 'campos de entrada continuam'); assert.strictEqual(await p.locator('#go').count(), 1, 'botão Entrar continua');
    assert.strictEqual(await p.locator('.legal-links [data-legal]').count(), 3, '3 ligações no ecrã de entrada');
    for (const [k, titulo, frases] of [['termos', 'Termos de uso', [/Contas e acesso/, /Teste grátis, subscrição e pagamento/, /sem internet/i, /Impostos/]],
      ['privacidade', 'Política de privacidade', [/não vendemos dados/i, /reconhecimento facial/i, /Supabase/, /Quem vê o quê/, /Os seus direitos/, /Quanto tempo guardamos/]],
      ['contrato', 'Contrato de subscrição', [/objeto/i, /duração/i, /preço/i, /reembolsos/i, /cessação/i]]]) {
      await p.click(`.legal-links [data-legal=${k}]`); await p.waitForSelector('.modal .legal');
      const m = await p.locator('.modal').innerText(); assert.ok(m.includes(titulo), titulo); for (const f of frases) assert.ok(f.test(m), titulo + ' deve conter ' + f);
      assert.ok(!/undefined|\[object|\$\{/.test(m), 'sem marcadores por preencher em ' + titulo);
      await p.click('.modal [data-x]'); assert.strictEqual(await p.locator('.modal').count(), 0);
    }
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

test('legal: o dono tem de aceitar (uma vez por versão); gerente e caixa não são bloqueados', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    // dono sem aceitação: aparece, não avança sem marcar, aceitar grava versão e data na conta
    const d = await abrir(b, url, 'dono'); await d.p.evaluate(() => GestLegal.exigirAceitacao()); await d.p.waitForSelector('#legal-gate');
    assert.ok(await d.p.locator('#lg-ok').isDisabled(), 'sem marcar a caixa não se aceita'); assert.strictEqual(await d.p.evaluate(() => window.__upd.length), 0, 'nada gravado antes de aceitar');
    await d.p.click('#legal-gate [data-legal=privacidade]'); await d.p.waitForSelector('.modal:not(#legal-gate) .legal'); assert.ok(/Política de privacidade/.test(await d.p.locator('.modal:not(#legal-gate)').innerText()), 'dá para ler os textos antes de aceitar');
    await d.p.click('.modal:not(#legal-gate) [data-x]'); await d.p.check('#lg-ck'); assert.ok(await d.p.locator('#lg-ok').isEnabled());
    await d.p.click('#lg-ok'); await d.p.waitForSelector('#legal-gate', { state: 'detached' });
    const up = await d.p.evaluate(() => window.__upd); assert.strictEqual(up.length, 1); const ver = await d.p.evaluate(() => GestLegal.VERSAO);
    assert.strictEqual(up[0].data.termos_versao, ver, 'grava a versão aceite'); assert.ok(!isNaN(Date.parse(up[0].data.termos_em)), 'grava a data/hora');
    // já aceitou esta versão: não volta a pedir
    await d.p.evaluate(() => GestLegal.exigirAceitacao()); await d.p.waitForTimeout(200); assert.strictEqual(await d.p.locator('#legal-gate').count(), 0, 'não repete'); assert.strictEqual(await d.p.evaluate(() => window.__upd.length), 1);
    // versão nova: volta a pedir
    await d.p.evaluate(() => { window.__meta.termos_versao = '2000-01-01'; localStorage.clear(); GestLegal.exigirAceitacao(); }); await d.p.waitForSelector('#legal-gate'); assert.deepStrictEqual(d.erros, []); await d.ctx.close();
    // gerente e caixa: nada de bloqueio; podem ler no cartão «A minha conta»
    for (const papel of ['gerente', 'caixa']) {
      const g = await abrir(b, url, papel); await g.p.evaluate(() => GestLegal.exigirAceitacao()); await g.p.waitForTimeout(200);
      assert.strictEqual(await g.p.locator('#legal-gate').count(), 0, papel + ' não é bloqueado'); assert.strictEqual(await g.p.evaluate(() => window.__upd.length), 0, papel + ' não grava aceitação');
      await g.p.evaluate(() => { const m = document.createElement('main'); m.id = 'x'; document.body.appendChild(m); GestLegal.cartaoConta(m); }); assert.strictEqual(await g.p.locator('#x [data-legal]').count(), 3, papel + ' pode ler os textos'); await g.ctx.close();
    }
    // administrador do sistema: sem cartão nem bloqueio
    const su = await abrir(b, url, 'super'); await su.p.evaluate(() => GestLegal.exigirAceitacao()); await su.p.waitForTimeout(150); assert.strictEqual(await su.p.locator('#legal-gate').count(), 0); await su.ctx.close();
  } finally { await b.close(); s.close(); }
});

test('legal: sem internet a aceitação fica no aparelho e sincroniza depois; erro do servidor não deixa passar; «Sair» sai', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    // sem internet
    const o = await abrir(b, url, 'dono'); await o.p.evaluate(() => { window.__updErro = 'Failed to fetch'; GestLegal.exigirAceitacao(); }); await o.p.waitForSelector('#legal-gate'); await o.p.check('#lg-ck'); await o.p.click('#lg-ok');
    await o.p.waitForSelector('#legal-gate', { state: 'detached' }); assert.ok(/guardada neste aparelho/i.test(await o.p.locator('.toast').innerText()), 'avisa que fica pendente'); assert.strictEqual(await o.p.evaluate(() => window.__meta.termos_versao), undefined, 'o servidor ainda não tem');
    await o.p.evaluate(() => { window.__updErro = null; return GestLegal.exigirAceitacao(); }); await o.p.waitForFunction(() => window.__meta.termos_versao === GestLegal.VERSAO); assert.ok(true, 'sincronizou quando a ligação voltou'); await o.ctx.close();
    // erro do servidor (não é de rede): o gate fica e mostra o erro
    const e = await abrir(b, url, 'dono'); await e.p.evaluate(() => { window.__updErro = 'Permission denied'; GestLegal.exigirAceitacao(); }); await e.p.waitForSelector('#legal-gate'); await e.p.check('#lg-ck'); await e.p.click('#lg-ok');
    await e.p.waitForFunction(() => document.querySelector('#lg-er').textContent.length > 0); assert.ok(/Permission denied/.test(await e.p.locator('#lg-er').innerText())); assert.strictEqual(await e.p.locator('#legal-gate').count(), 1, 'continua bloqueado'); await e.ctx.close();
    // sair
    const x = await abrir(b, url, 'dono'); await x.p.evaluate(() => GestLegal.exigirAceitacao()); await x.p.waitForSelector('#legal-gate'); await x.p.click('#lg-sair'); await x.p.waitForTimeout(300);
    assert.strictEqual(await x.p.evaluate(() => window.__out) >= 1, true, 'terminou a sessão'); assert.strictEqual(await x.p.evaluate(() => window.__upd.length), 0, 'sem aceitar nada'); await x.ctx.close();
  } finally { await b.close(); s.close(); }
});

test('legal: o texto está no cache offline e a versão está definida', () => {
  const sw = fs.readFileSync(path.join(WWW, 'sw.js'), 'utf8'); const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  assert.ok(sw.includes("'./legal.js'"), 'legal.js no cache offline'); assert.ok(html.includes('<script src="legal.js"></script>'), 'legal.js carregado');
  assert.ok(/const VERSAO = '\d{4}-\d{2}-\d{2}'/.test(fs.readFileSync(path.join(WWW, 'legal.js'), 'utf8')), 'versão com data');
});

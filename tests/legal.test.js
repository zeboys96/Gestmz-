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

test('legal: o ecrã de entrada não tem ligações legais nem «Contrato»; os dois textos abrem dentro da app e dizem o essencial', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono');
    assert.strictEqual(await p.locator('#f [name=e]').count(), 1, 'campos de entrada continuam'); assert.strictEqual(await p.locator('#go').count(), 1, 'botão Entrar continua');
    assert.strictEqual(await p.locator('[data-legal]').count(), 0, 'sem ligações legais no ecrã de entrada');
    assert.ok(!/contrato|termos|privacidade/i.test(await p.locator('#app').innerText()), 'o ecrã de entrada não menciona termos, privacidade nem contrato');
    await p.evaluate(() => { const m = document.createElement('main'); m.id = 'x'; document.body.appendChild(m); GestLegal.cartaoConta(m); });
    assert.strictEqual(await p.locator('#x [data-legal]').count(), 2, 'só 2 ligações dentro da app');
    assert.ok(!/contrato/i.test(await p.locator('#x').innerText()), 'sem «Contrato» no cartão');
    for (const [k, titulo, frases] of [['termos', 'Termos de utilização', [/Para que serve o GestMZ/, /O seu acesso/, /Os seus deveres/, /sem internet/i, /Dúvidas/]],
      ['privacidade', 'Política de privacidade', [/Não vendemos os seus dados/i, /Dados que tratamos e para quê/, /Quem recebe os dados/, /endereço IP/i, /Como protegemos/, /Os seus direitos/, /Quanto tempo guardamos/]]]) {
      await p.click(`#x [data-legal=${k}]`); await p.waitForSelector('.modal .legal');
      const m = await p.locator('.modal').innerText(); assert.ok(m.includes(titulo), titulo); for (const f of frases) assert.ok(f.test(m), titulo + ' deve conter ' + f);
      assert.ok(!/undefined|\[object|\$\{|contrato/i.test(m), 'sem marcadores nem «contrato» em ' + titulo); assert.ok(!/supabase|github|vercel|google|postgres|api\b|rls/i.test(m), 'sem nomes de serviços nem termos técnicos em ' + titulo); assert.ok(m.length < 6500, titulo + ' é curto'); assert.ok(!/reembols/i.test(m.replace(/Os registos diários são apagados passados 90 dias\./, '')) && !/90 dias/i.test(m.replace('Os registos diários são apagados passados 90 dias.', '')), 'sem promessas que o sistema não cumpre (a única retenção declarada, de 90 dias, é a do registo de uso, que o servidor cumpre)');
      await p.click('.modal [data-x]'); assert.strictEqual(await p.locator('.modal').count(), 0);
    }
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

test('legal: no primeiro acesso dono, gerente e caixa aceitam uma vez (versão+data); não repete; versão nova volta a pedir; super não é bloqueado', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    for (const papel of ['dono', 'gerente', 'caixa']) {
      const d = await abrir(b, url, papel); await d.p.evaluate(() => { GestLegal.exigirAceitacao(); }); await d.p.waitForSelector('#legal-gate');
      assert.ok(await d.p.locator('#lg-ok').isDisabled(), papel + ': sem marcar não avança'); assert.strictEqual(await d.p.locator('#lg-ok').innerText(), 'Avançar'); assert.strictEqual(await d.p.evaluate(() => window.__upd.length), 0, 'nada gravado antes de aceitar');
      assert.strictEqual(await d.p.locator('#legal-gate [data-legal]').count(), 2, 'só 2 documentos'); assert.ok(!/contrato/i.test(await d.p.locator('#legal-gate').innerText()));
      await d.p.click('#legal-gate [data-legal=privacidade]'); await d.p.waitForSelector('.modal:not(#legal-gate) .legal'); assert.ok(/Política de privacidade/.test(await d.p.locator('.modal:not(#legal-gate)').innerText()), 'dá para ler antes de aceitar');
      await d.p.click('.modal:not(#legal-gate) [data-x]'); await d.p.check('#lg-ck'); assert.ok(await d.p.locator('#lg-ok').isEnabled()); await d.p.click('#lg-ok'); await d.p.waitForSelector('#legal-gate', { state: 'detached' });
      const up = await d.p.evaluate(() => window.__upd), ver = await d.p.evaluate(() => GestLegal.VERSAO); assert.strictEqual(up.length, 1); assert.strictEqual(up[0].data.termos_versao, ver, 'grava a versão'); assert.ok(!isNaN(Date.parse(up[0].data.termos_em)), 'grava data/hora');
      await d.p.evaluate(() => { GestLegal.exigirAceitacao(); }); await d.p.waitForTimeout(200); assert.strictEqual(await d.p.locator('#legal-gate').count(), 0, 'não repete'); assert.strictEqual(await d.p.evaluate(() => window.__upd.length), 1);
      await d.p.evaluate(() => { window.__meta.termos_versao = '2000-01-01'; localStorage.clear(); GestLegal.exigirAceitacao(); }); await d.p.waitForSelector('#legal-gate'); assert.deepStrictEqual(d.erros, []); await d.ctx.close();
    }
    // quem já aceitou esta versão (consentimento existente) não é bloqueado
    const j = await abrir(b, url, 'caixa'); await j.p.evaluate(() => { window.__meta.termos_versao = GestLegal.VERSAO; return GestLegal.exigirAceitacao(); }); await j.p.waitForTimeout(200);
    assert.strictEqual(await j.p.locator('#legal-gate').count(), 0, 'consentimento existente respeitado'); assert.strictEqual(await j.p.evaluate(() => window.__upd.length), 0); await j.ctx.close();
    const su = await abrir(b, url, 'super'); await su.p.evaluate(() => { GestLegal.exigirAceitacao(); }); await su.p.waitForTimeout(150); assert.strictEqual(await su.p.locator('#legal-gate').count(), 0); await su.ctx.close();
  } finally { await b.close(); s.close(); }
});

test('ajuda: cada cargo vê só o que existe para si; sem instruções antigas nem «contrato»', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const textos = {};
    for (const papel of ['dono', 'gerente', 'caixa']) {
      const { ctx, p, erros } = await abrir(b, url, papel);
      textos[papel] = await p.evaluate(async () => { const m = document.createElement('main'); m.id = 'main'; document.body.appendChild(m); await VIEWS.ajuda(); const faq = m.innerText; VIEWS.ajudaSlides(); const all = []; for (let i = 0; i < 40; i++) { const sl = document.querySelector('.slide'); if (sl) all.push(sl.innerText); const nx = document.querySelector('#nx'); if (!nx || nx.textContent === 'Concluir') break; nx.click(); } return faq + '\n' + all.join('\n'); });
      assert.deepStrictEqual(erros, []); await ctx.close();
    }
    for (const [papel, t] of Object.entries(textos)) { assert.ok(!/contrato/i.test(t), papel); assert.ok(!/Sim, para vender e actualizar|só são guardadas com ligação|inventado por si no campo|Registo”|retirar um produto da venda ou anular/.test(t), papel + ': sem instruções antigas'); assert.ok(/sem internet/i.test(t), papel + ' explica o trabalho sem internet'); }
    assert.ok(/Fechos de caixa/.test(textos.dono) && /A sua equipa/.test(textos.dono));
    assert.ok(!/Despesas e relatórios|Subscrição|Fechos de caixa/.test(textos.gerente), 'o gerente não vê guias de despesas, subscrição nem fechos do dono'); assert.ok(/Fechar o caixa/.test(textos.gerente));
    assert.ok(!/Despesas|Subscrição|Equipa|Relatórios|Entrada de stock|Avisos \(sino\)/.test(textos.caixa), 'o caixa só vê o que usa'); assert.ok(/Fechar o caixa/.test(textos.caixa) && /Vender/.test(textos.caixa));
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
    const x = await abrir(b, url, 'dono'); await x.p.evaluate(() => { GestLegal.exigirAceitacao(); }); await x.p.waitForSelector('#legal-gate'); await x.p.click('#lg-sair'); await x.p.waitForTimeout(300);
    assert.strictEqual(await x.p.evaluate(() => window.__out) >= 1, true, 'terminou a sessão'); assert.strictEqual(await x.p.evaluate(() => window.__upd.length), 0, 'sem aceitar nada'); await x.ctx.close();
  } finally { await b.close(); s.close(); }
});

test('legal: o texto está no cache offline e a versão está definida', () => {
  const sw = fs.readFileSync(path.join(WWW, 'sw.js'), 'utf8'); const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  assert.ok(sw.includes("'./legal.js'"), 'legal.js no cache offline'); assert.ok(html.includes('<script src="legal.js"></script>'), 'legal.js carregado');
  assert.ok(/const VERSAO = '\d{4}-\d{2}-\d{2}'/.test(fs.readFileSync(path.join(WWW, 'legal.js'), 'utf8')), 'versão com data');
});

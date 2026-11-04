// Atualização Android DENTRO da app (sem navegador, sem mostrar o endereço). SIMULAÇÃO: Chromium real + plugins Capacitor simulados
// (Filesystem, GestMZInstalador, Browser). Não valida o instalador real do Android nem um telefone.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const SHA = 'a'.repeat(63) + 'b';
const FAKE = `(function(){ const sbf = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }), signOut: async () => ({}) },
  rpc: async () => ({ data: 'fechada', error: null }), channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}, from: () => new Proxy({}, { get: () => function () { return this; } }) };
  window.supabase = { createClient: () => sbf }; })();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
const VERSOES = { esquema: 1, atualizado_em: '2026-11-04', plataformas: { android: { ultima: '1.1.9', minima: '1.0.0', bloquear: false, publicada_em: '2026-11-04', url: 'https://github.com/zeboys96/Gestmz-/releases/download/v1.1.9/GestMZ-1.1.9-android.apk', sha256: SHA, tamanho: 3400000, notas: ['Teste'], requisitos: { android_min: 8 } }, windows: { ultima: null, minima: null, bloquear: false, publicada_em: null, url: null, sha256: null, notas: [], requisitos: { windows_min: '10.0.17763' } } } };

// opc: { pode, nativo, instalarErro, lento }
const INIT = opc => `(function(){ const o = ${JSON.stringify(opc)}; window.__l = { dl: 0, inst: [], perm: 0, br: [], rm: 0, ouv: 0, rem: 0 }; let cb = null;
  const P = { App: { getInfo: async () => ({ id: 'mz.gestmz.app', version: '1.1.1' }) }, Browser: { open: async x => { window.__l.br.push(x.url); } } };
  if (o.nativo || o.proprio) { P.Filesystem = { rmdir: async () => { window.__l.rm++; }, addListener: async (n, f) => { cb = f; window.__l.ouv++; return { remove: async () => { window.__l.rem++; } }; },
      downloadFile: async a => { window.__l.dl++; window.__l.dlArgs = a; if (cb) { cb({ bytes: 30, contentLength: 100 }); await new Promise(r => setTimeout(r, o.lento || 50)); cb({ bytes: 100, contentLength: 100 }); } return { path: '/data/user/0/mz.gestmz.app/cache/' + a.path }; } };
    P.GestMZInstalador = { addListener: async (n, f) => { if (n === 'instalacao') window.__evInst = f; else if (o.proprio) cb = f; return { remove: async () => { window.__l.rem++; } }; }, transferir: o.proprio ? async a => { window.__l.tr = a; if (o.transfErro) throw new Error(o.transfErro); if (cb) { cb({ bytes: 30, total: 100 }); await new Promise(r => setTimeout(r, 50)); cb({ bytes: 100, total: 100 }); } return { caminho: '/data/user/0/mz.gestmz.app/cache/gestmz-update/GestMZ-update.apk' }; } : undefined, podeInstalar: async () => ({ pode: o.pode }), abrirPermissao: async () => { window.__l.perm++; }, instalar: async a => { window.__l.inst.push(a); if (o.instalarErro) throw new Error(o.instalarErro); } }; }
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: P }; })();`;

async function abrir(b, url, opc) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 800 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.addInitScript(INIT(opc)); await p.route('**/versions.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VERSOES) }));
  await p.goto(url); await p.waitForSelector('#f');
  const d = await p.evaluate(() => GestMZAtualizacao.verificar()); assert.strictEqual(d.estado, 'disponivel');
  await p.evaluate(x => GestMZAtualizacao.detalhes(x), d); await p.waitForSelector('#upd-go'); return { ctx, p, erros };
}
const rodar = (nome, f) => test(nome, { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch(); try { await f(b, url); } finally { await b.close(); s.close(); } });

rodar('atualização Android: transfere dentro da app, com progresso, confere o SHA-256 e abre o instalador; nunca abre o navegador nem mostra o endereço', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url, { nativo: true, pode: true, lento: 400 });
  const antes = await p.locator('.modal').innerText(); assert.ok(!/github|https?:|\.apk|releases/i.test(antes), 'a janela não mostra de onde vem o ficheiro: ' + antes);
  await p.click('#upd-go'); await p.click('#upd-go', { force: true }).catch(() => { });   // duplo toque
  await p.waitForFunction(() => /30%/.test(document.querySelector('#upd-estado').textContent));
  assert.ok(!/github|https?:|\.apk|releases/i.test(await p.locator('.modal').innerText()), 'durante a transferência também não mostra o endereço');
  await p.waitForFunction(() => window.__l.inst.length === 1); const l = await p.evaluate(() => window.__l);
  assert.strictEqual(l.dl, 1, 'só uma transferência apesar do duplo toque'); assert.strictEqual(l.dlArgs.directory, 'CACHE'); assert.ok(l.dlArgs.path.startsWith('gestmz-update/') && l.dlArgs.path.endsWith('.apk')); assert.strictEqual(l.dlArgs.progress, true);
  assert.deepStrictEqual(l.br, [], 'não abriu o navegador'); assert.strictEqual(l.inst[0].sha256, SHA, 'o instalador recebe o SHA-256 esperado'); assert.ok(l.inst[0].caminho.includes('/cache/gestmz-update/'), 'ficheiro na cache da app');
  assert.strictEqual(l.ouv, 1); assert.strictEqual(l.rem, 1, 'o ouvinte de progresso é removido'); assert.strictEqual(l.rm, 1, 'limpa transferências antigas');
  await p.waitForFunction(() => /Confirme a instalação/.test(document.querySelector('#upd-estado').textContent)); assert.deepStrictEqual(erros, []); await ctx.close();
});

rodar('atualização Android: sem permissão para instalar, abre a definição do Android uma vez, não transfere e explica o que fazer', async (b, url) => {
  const { ctx, p } = await abrir(b, url, { nativo: true, pode: false });
  await p.click('#upd-go'); await p.waitForFunction(() => /permita/i.test(document.querySelector('#upd-estado').textContent));
  const l = await p.evaluate(() => window.__l); assert.strictEqual(l.perm, 1); assert.strictEqual(l.dl, 0, 'não transfere antes da permissão'); assert.deepStrictEqual(l.br, []);
  assert.ok(await p.locator('#upd-go').isEnabled(), 'pode tentar de novo depois de permitir'); await ctx.close();
});

rodar('atualização Android: se a verificação de segurança falhar, mostra o erro sem endereço e só então oferece o navegador', async (b, url) => {
  const { ctx, p } = await abrir(b, url, { nativo: true, pode: true, instalarErro: 'sha256' });
  assert.ok(await p.locator('#upd-nav').isVisible(), 'a alternativa do navegador está sempre disponível, discreta');
  await p.click('#upd-go'); await p.waitForFunction(() => /verificação de segurança/.test(document.querySelector('#upd-estado').textContent));
  assert.strictEqual(await p.locator('#upd-go').innerText(), 'Tentar de novo'); assert.ok(!/github|https?:/i.test(await p.locator('.modal').innerText())); assert.ok(await p.locator('#upd-nav').isVisible(), 'último recurso disponível');
  await p.click('#upd-nav'); const l = await p.evaluate(() => window.__l); assert.strictEqual(l.br.length, 1, 'só abre o navegador por escolha da pessoa'); await ctx.close();
});

rodar('atualização Android: numa versão antiga da app (sem instalador interno) continua a funcionar pelo navegador', async (b, url) => {
  const { ctx, p } = await abrir(b, url, { nativo: false });
  await p.click('#upd-go'); await p.waitForFunction(() => window.__l.br.length === 1); assert.ok(/releases\/download\/v1\.1\.9\//.test(await p.evaluate(() => window.__l.br[0]))); await ctx.close();
});

rodar('atualização Android (1.1.4+): usa o descarregador próprio do plugin, com progresso, sem o plugin genérico; o erro mostra um código curto', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url, { proprio: true, pode: true });
  await p.click('#upd-go'); await p.waitForFunction(() => /Confirme a instalação/.test(document.querySelector('#upd-estado').textContent));
  const l = await p.evaluate(() => window.__l); assert.strictEqual(l.dl, 0, 'não usa o Filesystem'); assert.ok(l.tr.url.endsWith('GestMZ-1.1.9-android.apk')); assert.strictEqual(l.tr.sha256, SHA);
  assert.strictEqual(l.inst.length, 1); assert.ok(/gestmz-update\/GestMZ-update\.apk$/.test(l.inst[0].caminho)); assert.deepStrictEqual(l.br, [], 'não abre o navegador');
  assert.ok(!/github/i.test(await p.locator('#upd-estado').innerText()));
  assert.deepStrictEqual(erros, []); await ctx.close();
  const f = await abrir(b, url, { proprio: true, pode: true, transfErro: 'http-404' });
  await f.p.click('#upd-go'); await f.p.waitForFunction(() => /código: http-404/.test(document.querySelector('#upd-estado').textContent));
  assert.ok(await f.p.locator('#upd-nav').isVisible(), 'aparece a alternativa'); assert.ok(!/github/i.test(await f.p.locator('#upd-estado').innerText())); await f.ctx.close();
});

rodar('atualização Android: se o Android recusar a instalação, mostra o código curto e oferece a alternativa', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url, { proprio: true, pode: true });
  await p.click('#upd-go'); await p.waitForFunction(() => /Confirme a instalação/.test(document.querySelector('#upd-estado').textContent));
  await p.evaluate(() => window.__evInst({ codigo: 4, mensagem: 'INSTALL_FAILED_INVALID_APK' }));
  await p.waitForFunction(() => /código: 4/.test(document.querySelector('#upd-estado').textContent));
  assert.ok(await p.locator('#upd-nav').isVisible()); assert.ok(!/github/i.test(await p.locator('#upd-estado').innerText())); assert.ok(await p.locator('#upd-go').isEnabled());
  assert.deepStrictEqual(erros, []); await ctx.close();
});

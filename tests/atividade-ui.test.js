// Atividade das lojas (superadmin), presença da app e dicas curtas. SIMULAÇÃO: Chromium + Supabase simulado (a base de dados real está em tests/db/07_atividade.sql).
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `(function(){
  window.__rpc = []; window.__T = {}; window.__R = {};
  const build = t => { const b = { select(){return b;}, order(){return b;}, eq(){return b;}, update(){return b;}, limit(){return b;}, range(){return b;}, then(res, rej){ return Promise.resolve({ data: window.__T[t] || [], error: null }).then(res, rej); } }; return b; };
  const sbf = { auth:{ getSession: async()=>({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}) },
    rpc: (n, a) => { window.__rpc.push({ n, a }); const r = window.__R[n]; const out = r === undefined ? { data: null, error: { message: 'Could not find the function public.' + n } } : { data: typeof r === 'function' ? r(a) : r, error: null };
      const b = { range(){return b;}, order(){return b;}, then(res, rej){ return Promise.resolve(out).then(res, rej); } }; return b; },
    channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}, from: build };
  window.supabase = { createClient: () => sbf };
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
const rodar = (nome, f) => test(nome, { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch(); try { await f(b, url); } finally { await b.close(); s.close(); } });
async function abrir(b, url, papel, vp) {
  const ctx = await b.newContext({ viewport: vp || { width: 1100, height: 900 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(url); await p.waitForSelector('#f');
  await p.evaluate(pp => { S.perfil = { papel: pp, nome: 'T', id: 'u1', loja_id: pp === 'super' ? null : 'L1' }; }, papel);
  return { ctx, p, erros };
}
const iso = m => new Date(Date.now() - m * 60000).toISOString(), dia = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const hojeStr = dia(0), valida = n => dia(-n);
const LOJAS = [
  { id: 'L1', nome: 'Farmácia Sol', tipo: 'Farmácia', estado: 'ativa', valido_ate: valida(20), configurada: true, criado_em: iso(9000) },
  { id: 'L2', nome: 'Mercearia Lua', tipo: 'Mercearia', estado: 'ativa', valido_ate: valida(3), configurada: true, criado_em: iso(8000) },
  { id: 'L3', nome: 'Loja Estrela', tipo: 'Loja', estado: 'teste', valido_ate: valida(10), configurada: true, criado_em: iso(7000) },
  { id: 'L4', nome: 'Loja Nova', tipo: 'Loja', estado: 'teste', valido_ate: valida(25), configurada: true, criado_em: iso(100) }];
const ATV = [
  { loja_id: 'L1', online: 1, utilizadores: 2, ultimo_visto: iso(1), dias_7: 5, dias_30: 20, dias: [hojeStr, dia(1), dia(2)], versao: '1.1.7', plataforma: 'android' },
  { loja_id: 'L2', online: 0, utilizadores: 1, ultimo_visto: iso(60 * 24 * 9), dias_7: 0, dias_30: 4, dias: [], versao: '1.1.2', plataforma: 'web' },
  { loja_id: 'L3', online: 0, utilizadores: 1, ultimo_visto: iso(180), dias_7: 2, dias_30: 9, dias: [dia(3)], versao: '1.1.6', plataforma: 'windows' },
  { loja_id: 'L4', online: 0, utilizadores: 1, ultimo_visto: null, dias_7: 0, dias_30: 0, dias: [], versao: null, plataforma: null }];
const VERS = [{ versao: '1.1.7', utilizadores: 2, lojas: 1, ultimo_visto: iso(1) }, { versao: '1.1.2', utilizadores: 1, lojas: 1, ultimo_visto: iso(60 * 24 * 9) }];

rodar('superadmin: ecrã «Atividade» mostra online, dias de uso, alertas e versões; filtros funcionam; sem nomes de pessoas', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url, 'super');
  await p.evaluate(([l, a, v]) => { __T.lojas = l; __R.admin_listar_lojas = l; __R.super_atividade = a; __R.super_versoes_em_uso = v; shell(navSuper()); }, [LOJAS, ATV, VERS]);
  assert.strictEqual(await p.locator('#nav [data-v=s_atividade]').count(), 1, 'há o menu Atividade');
  await p.evaluate(() => go('s_atividade')); await p.waitForSelector('#atvl tr');
  const txt = async () => await p.locator('#main').innerText();
  const t = await txt();
  assert.strictEqual(await p.locator('#atvl tr').count(), 4);
  const stat = n => p.locator('.stat').nth(n).locator('b').innerText();
  assert.strictEqual(await stat(0), '1', 'online agora'); assert.strictEqual(await stat(1), '1', 'usaram hoje'); assert.strictEqual(await stat(2), '1', 'sem uso há 7 dias (L2 ativa)'); assert.strictEqual(await stat(3), '1', 'nunca abriram');
  assert.ok(/Mercearia Lua/.test(t) && /há 9 dias/.test(t), 'mostra há quanto tempo'); assert.ok(/Nunca abriu/.test(t));
  assert.ok(/termina a subscrição nos próximos 7 dias: Mercearia Lua/.test(t), 'alerta de subscrição a terminar');
  assert.ok(/1\.1\.2/.test(t) && /Versões da app em uso/.test(t));
  assert.strictEqual(await p.locator('#atvl tr').first().locator('.pt.on').count(), 1, 'a primeira linha (mais recente) está online');
  assert.strictEqual(await p.locator('#atvl .dias14').first().locator('i.on').count(), 3, 'tira dos 14 dias');
  await p.click('#fa [data-f=online]'); assert.strictEqual(await p.locator('#atvl tr').count(), 1);
  await p.click('#fa [data-f=inativas]'); assert.strictEqual(await p.locator('#atvl tr').count(), 1); assert.ok(/Mercearia Lua/.test(await p.locator('#atvl').innerText()));
  await p.click('#fa [data-f=nunca]'); assert.ok(/Loja Nova/.test(await p.locator('#atvl').innerText()));
  await p.click('#fa [data-f=todas]'); assert.strictEqual(await p.locator('#atvl tr').count(), 4);
  assert.ok(!/@|Dono|funcion/i.test(await p.locator('#atvl').innerText()), 'sem nomes nem e-mails de pessoas');
  // lista de lojas também mostra o estado
  await p.evaluate(() => go('s_lojas')); await p.waitForSelector('#main table'); assert.ok(/Online/.test(await txt()) && /Nunca abriu/.test(await txt()));
  assert.deepStrictEqual(erros, []); await ctx.close();
});

rodar('superadmin: se o servidor ainda não tem a atividade, avisa e o resto do painel continua a funcionar', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url, 'super');
  await p.evaluate(l => { __T.lojas = l; __R.admin_listar_lojas = l; shell(navSuper()); }, LOJAS);
  await p.evaluate(() => go('s_atividade')); await p.waitForSelector('.msg.warn'); assert.ok(/ainda não está ativa/.test(await p.locator('#main').innerText()));
  await p.evaluate(() => go('s_lojas')); await p.waitForSelector('#main table'); assert.ok(/Farmácia Sol/.test(await p.locator('#main').innerText()));
  assert.deepStrictEqual(erros, []); await ctx.close();
});

rodar('superadmin: ecrã de atividade cabe num telemóvel (sem rolagem lateral)', async (b, url) => {
  const { ctx, p } = await abrir(b, url, 'super', { width: 360, height: 740 });
  await p.evaluate(([l, a, v]) => { __T.lojas = l; __R.admin_listar_lojas = l; __R.super_atividade = a; __R.super_versoes_em_uso = v; shell(navSuper()); go('s_atividade'); }, [LOJAS, ATV, VERS]);
  await p.waitForSelector('#atvl tr'); await p.waitForTimeout(200);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem lateral'); await ctx.close();
});

rodar('presença: a app avisa o servidor com versão e plataforma; o superadmin não conta; sem internet ou depois de sair não envia; erros nunca aparecem', async (b, url) => {
  const { ctx, p, erros } = await abrir(b, url, 'dono');
  await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }; GestAtividade.iniciar(); });
  await p.waitForFunction(() => __rpc.some(c => c.n === 'registar_atividade'));
  const c = await p.evaluate(() => __rpc.find(c => c.n === 'registar_atividade')); assert.strictEqual(c.a.p_plataforma, 'android'); assert.match(c.a.p_versao, /^\d+\.\d+\.\d+$/);
  assert.deepStrictEqual(Object.keys(c.a).sort(), ['p_plataforma', 'p_versao'], 'só envia versão e plataforma (nada de vendas)');
  const n0 = await p.evaluate(() => __rpc.length); await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); return GestAtividade.enviar(); }); assert.strictEqual(await p.evaluate(() => __rpc.length), n0, 'offline: não envia');
  await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); GestAtividade.parar(); return GestAtividade.enviar(); }); assert.strictEqual(await p.evaluate(() => __rpc.length), n0, 'parado: não envia');
  await p.evaluate(() => { S.perfil.papel = 'super'; GestAtividade.iniciar(); }); await p.waitForTimeout(200); assert.strictEqual(await p.evaluate(() => __rpc.length), n0, 'o superadmin não conta');
  await p.evaluate(() => { S.perfil.papel = 'caixa'; return GestAtividade.enviar(); }); assert.strictEqual(await p.evaluate(() => __rpc.length), n0 + 1);   // a função falta no servidor → erro silencioso
  assert.deepStrictEqual(erros, []); await ctx.close();
});

rodar('dicas: curtas, sem termos técnicos, e só as do cargo', async (b, url) => {
  const PROIBIDAS = /google|autenticador|lote|supabase|github|servidor|api\b|rls|token|sincroniz|cache|backup|aal|totp/i;
  for (const [papel, max] of [['dono', 9], ['gerente', 8], ['caixa', 6]]) {
    const { ctx, p, erros } = await abrir(b, url, papel);
    await p.evaluate(() => VIEWS.ajudaSlides()); await p.waitForSelector('.slide');
    const dicas = []; for (let i = 0; i < 20; i++) { dicas.push({ t: await p.locator('.slide h3').innerText(), x: await p.locator('.slide p').innerText() }); if (/Concluir/.test(await p.locator('#nx').innerText())) break; await p.click('#nx'); }
    assert.strictEqual(dicas.length, max, papel + ': número de dicas');
    for (const d of dicas) { assert.ok(d.x.length <= 100, papel + ': texto curto «' + d.x + '»'); assert.ok(d.x.split(/[.!?]/).filter(s => s.trim()).length <= 2, papel + ': no máximo duas frases'); assert.ok(!PROIBIDAS.test(d.t + ' ' + d.x), papel + ': sem termos técnicos «' + d.x + '»'); }
    const todas = dicas.map(d => d.t).join('|');
    if (papel === 'caixa') assert.ok(!/Produtos|Equipa|Validades|Fechos/.test(todas), 'caixa não vê dicas de gestão');
    if (papel === 'dono') assert.ok(/A sua equipa/.test(todas) && /Fechos de caixa/.test(todas)); else assert.ok(!/A sua equipa/.test(todas));
    assert.deepStrictEqual(erros, []); await ctx.close();
  }
});

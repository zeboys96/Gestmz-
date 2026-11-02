// Interface do TOTP (www/totp.js) em Chromium com cliente Supabase SIMULADO. Prova o comportamento da app; NÃO prova o Supabase Auth real
// (inscrição, QR, validação do código de 30 s) — isso exige um projeto Supabase de teste e um telemóvel.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `(function(){
  window.__log = []; window.__st = window.__st || { tem: false, aalAtual: 'aal1', restantes: 0, semMig15: false, codigoOk: '123456', funcao: { status: 200, corpo: { ok: true } } };
  const L = x => window.__log.push(x);
  const mfa = {
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: window.__st.aalAtual, nextLevel: window.__st.tem ? 'aal2' : 'aal1' }, error: null }),
    listFactors: async () => ({ data: { totp: window.__st.tem ? [{ id: 'f1', status: 'verified' }] : [] }, error: null }),
    challengeAndVerify: async a => { L(['verify', a.factorId, a.code]); if (a.code === window.__st.codigoOk) { window.__st.aalAtual = 'aal2'; if (a.factorId === 'novo') window.__st.tem = true; return { data: {}, error: null }; } return { data: null, error: { message: 'Invalid TOTP code entered' } }; },
    enroll: async () => { L(['enroll']); return { data: { id: 'novo', totp: { qr_code: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }, error: null }; },
    unenroll: async a => { L(['unenroll', a.factorId]); if (a.factorId === 'f1') window.__st.tem = false; return { data: {}, error: null }; }
  };
  const sbf = { auth:{ mfa, getSession: async()=>({data:{session: window.__sess ? {user:{id:'u1',email:'t@t.t'}} : null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}), refreshSession: async()=>{ L(['refresh']); return {}; } },
    functions: { invoke: async (n, o) => { L(['funcao', n, o.body]); const f = window.__st.funcao; if (f.status !== 200) return { data: null, error: { context: { json: async () => f.corpo } } }; window.__st.tem = false; return { data: f.corpo, error: null }; } },
    rpc: (n, a) => { L(['rpc', n]); const b = { then(res, rej){ let r;
        if (n === 'mfa_estado') r = window.__st.semMig15 ? { data: null, error: { message: 'Could not find the function public.mfa_estado in the schema cache' } } : { data: { tem_fator: window.__st.tem, codigos_restantes: window.__st.restantes, aal: window.__st.aalAtual, permitido: true, super_obrigatorio: window.__st.papel === 'super' ? !!window.__st.obrig : null }, error: null };
        else if (n === 'mfa_gerar_codigos') { window.__st.restantes = 8; r = { data: ['aaaa-bbbb-cccc-dddd-0001','aaaa-bbbb-cccc-dddd-0002','aaaa-bbbb-cccc-dddd-0003','aaaa-bbbb-cccc-dddd-0004','aaaa-bbbb-cccc-dddd-0005','aaaa-bbbb-cccc-dddd-0006','aaaa-bbbb-cccc-dddd-0007','aaaa-bbbb-cccc-dddd-0008'], error: null }; }
        else r = { data: null, error: null };
        return Promise.resolve(r).then(res, rej); }, range(){ return b; }, order(){ return b; } }; return b; },
    channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}, from: () => { const b = { select(){return b;}, order(){return b;}, range(){return b;}, eq(){return b;}, limit(){return b;}, then(res, rej){ return Promise.resolve({ data: [], error: null }).then(res, rej); } }; return b; } };
  window.supabase = { createClient: () => sbf };
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });

test('TOTP na interface: ativar, códigos únicos, desafio ao entrar, perdi o telemóvel, desativar, sem migração', { skip: !chromium && 'playwright indisponível', timeout: 240000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  const abrir = async (papel, st) => {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
    await p.goto(url); await p.waitForSelector('#f');
    await p.evaluate(([pp, st]) => { window.__st = Object.assign({ tem: false, aalAtual: 'aal1', restantes: 0, semMig15: false, codigoOk: '123456', papel: pp, funcao: { status: 200, corpo: { ok: true } } }, st || {}); window.__sess = true; S.perfil = { papel: pp, nome: 'T', id: 'u1', loja_id: pp === 'super' ? null : 'L1' }; S.loja = pp === 'super' ? null : { id: 'L1', nome: 'Loja', configurada: true, operacional: true }; }, [papel, st]);
    return { ctx, p, erros };
  };
  const conta = async p => { await p.evaluate(() => { const m = document.createElement('div'); m.id = 'main'; document.body.appendChild(m); return GestTOTP.cartaoConta(m); }); await p.waitForSelector('#cartao-totp'); };
  const log = p => p.evaluate(() => window.__log);
  try {
    // ---- ativar (dono): QR + chave, código errado não ativa, código certo mostra 8 códigos uma só vez ----
    let { ctx, p, erros } = await abrir('dono'); await conta(p);
    assert.ok(/Desligado/.test(await p.locator('#cartao-totp').innerText())); await p.click('#ta'); await p.waitForSelector('.modal img[alt*="QR"]');
    assert.ok(/JBSWY3DPEHPK3PXP/.test(await p.locator('.modal').innerText()), 'mostra a chave manual');
    await p.fill('.modal [name=c]', '000000'); await p.click('.modal [data-ok]'); await p.waitForTimeout(300);
    assert.ok(!(await log(p)).some(x => x[0] === 'rpc' && x[1] === 'mfa_gerar_codigos'), 'código errado não gera códigos'); assert.ok(/incorreto|expirado/i.test(await p.locator('.toast').innerText()), 'mensagem clara');
    await p.fill('.modal [name=c]', '123 456'); await p.click('.modal [data-ok]'); await p.waitForSelector('#cods');
    const cods = (await p.locator('#cods').innerText()).trim().split('\n'); assert.strictEqual(cods.length, 8); assert.ok(cods.every(c => /^[0-9a-f]{4}(-[0-9a-f]{4}){4}$/.test(c)));
    await p.click('.modal [data-ok]'); await p.waitForTimeout(200); assert.ok(await p.locator('#cods').count() === 1, 'sem confirmar que guardou, não fecha');
    assert.ok(await p.evaluate(() => !localStorage.getItem('gestmz_cods') && !Object.keys(localStorage).some(k => /cod|recup/i.test(k)) && !JSON.stringify(Object.assign({}, localStorage)).includes('aaaa-bbbb')), 'os códigos não ficam no aparelho');
    await p.check('#gu'); await p.click('.modal [data-ok]'); await p.waitForTimeout(300); assert.strictEqual(await p.locator('.modal').count(), 0);
    assert.ok(/Ativo/.test(await p.locator('#cartao-totp').innerText()) && /por usar: 8/.test(await p.locator('#cartao-totp').innerText()));
    assert.deepStrictEqual(erros, []); await ctx.close();

    // ---- fechar a ativação a meio remove o fator incompleto ----
    ({ ctx, p, erros } = await abrir('dono')); await conta(p); await p.click('#ta'); await p.waitForSelector('.modal'); await p.click('.modal [data-x]'); await p.waitForTimeout(200);
    assert.ok((await log(p)).some(x => x[0] === 'unenroll' && x[1] === 'novo'), 'fator a meio é removido'); await ctx.close();

    // ---- caixa/gerente nunca veem o cartão ----
    for (const papel of ['caixa', 'gerente']) { ({ ctx, p } = await abrir(papel)); await p.evaluate(() => { const m = document.createElement('div'); m.id = 'main'; document.body.appendChild(m); return GestTOTP.cartaoConta(m); }); assert.strictEqual(await p.locator('#cartao-totp').count(), 0, papel + ' sem cartão'); assert.ok(!(await log(p)).some(x => x[1] === 'mfa_estado'), papel + ' nem consulta'); await ctx.close(); }

    // ---- sem migração 15: nada aparece e nada quebra ----
    ({ ctx, p, erros } = await abrir('dono', { semMig15: true })); await p.evaluate(() => { const m = document.createElement('div'); m.id = 'main'; document.body.appendChild(m); return GestTOTP.cartaoConta(m); }); await p.waitForTimeout(300);
    assert.strictEqual(await p.locator('#cartao-totp').count(), 0); assert.deepStrictEqual(erros, []); await ctx.close();

    // ---- super: aviso de obrigatório; desativar escondido quando obrigatório ----
    ({ ctx, p } = await abrir('super', { tem: true, restantes: 2, obrig: true })); await conta(p); const t = await p.locator('#cartao-totp').innerText();
    assert.ok(/obrigatório/i.test(t) && /por usar: 2/.test(t) && /gere novos/i.test(t)); assert.strictEqual(await p.locator('#td').count(), 0, 'super obrigatório não vê «Desativar»'); await ctx.close();
    ({ ctx, p } = await abrir('super', { tem: false, obrig: false })); await conta(p); assert.ok(/Será obrigatório/i.test(await p.locator('#cartao-totp').innerText())); await ctx.close();

    // ---- entrar: conta com TOTP pede o código antes de abrir os dados ----
    ({ ctx, p, erros } = await abrir('dono', { tem: true })); assert.strictEqual(await p.evaluate(() => GestTOTP.precisaDesafio()), true);
    await p.evaluate(() => { window.__depois = 0; GestTOTP.vDesafio(async () => { window.__depois++; }); }); await p.waitForSelector('#ft');
    await p.fill('#ft [name=c]', '12345'); await p.click('#tok'); await p.waitForTimeout(250); assert.strictEqual(await p.evaluate(() => window.__depois), 0, '5 números não passam'); assert.ok(!(await log(p)).some(x => x[0] === 'verify'), 'nem chega a verificar');
    await p.fill('#ft [name=c]', '999999'); await p.click('#tok'); await p.waitForTimeout(300); assert.strictEqual(await p.evaluate(() => window.__depois), 0, 'código errado não entra');
    await p.fill('#ft [name=c]', '123456'); await p.click('#tok'); await p.waitForTimeout(300); assert.strictEqual(await p.evaluate(() => window.__depois), 1, 'código certo entra');
    assert.strictEqual(await p.evaluate(() => GestTOTP.precisaDesafio()), false, 'depois de aal2 já não pede'); assert.deepStrictEqual(erros, []); await ctx.close();
    ({ ctx, p } = await abrir('dono', { tem: false })); assert.strictEqual(await p.evaluate(() => GestTOTP.precisaDesafio()), false, 'sem autenticador: nada muda no início de sessão'); await ctx.close();
    ({ ctx, p } = await abrir('dono', { tem: true })); await p.evaluate(() => { sb.auth.mfa.getAuthenticatorAssuranceLevel = async () => { throw new Error('Failed to fetch'); }; }); assert.strictEqual(await p.evaluate(() => GestTOTP.precisaDesafio()), false, 'sem rede não bloqueia (o servidor decide)'); await ctx.close();

    // ---- perdi o telemóvel: o código vai à Edge Function SEM indicar conta; sucesso segue; erro mostra a mensagem do servidor ----
    ({ ctx, p, erros } = await abrir('dono', { tem: true })); await p.evaluate(() => { window.__depois = 0; GestTOTP.vRecuperar(async () => { window.__depois++; }); }); await p.waitForSelector('#fr');
    await p.fill('#fr [name=c]', 'aaaa-bbbb-cccc-dddd-0001'); await p.click('#rok'); await p.waitForTimeout(400);
    const chamada = (await log(p)).find(x => x[0] === 'funcao'); assert.deepStrictEqual(chamada, ['funcao', 'recuperar-totp', { acao: 'codigo', codigo: 'aaaa-bbbb-cccc-dddd-0001' }], 'só ação e código; a conta vem do token');
    assert.strictEqual(await p.evaluate(() => window.__depois), 1); assert.ok((await log(p)).some(x => x[0] === 'refresh'), 'renova a sessão depois de remover o fator'); await ctx.close();
    ({ ctx, p, erros } = await abrir('dono', { tem: true, funcao: { status: 400, corpo: { erro: 'Código inválido ou já usado.' } } })); await p.evaluate(() => { window.__depois = 0; GestTOTP.vRecuperar(async () => { window.__depois++; }); }); await p.waitForSelector('#fr');
    await p.fill('#fr [name=c]', 'zzzz'); await p.click('#rok'); await p.waitForTimeout(400); assert.strictEqual(await p.evaluate(() => window.__depois), 0); assert.ok(/inválido ou já usado/i.test(await p.locator('.toast').innerText()));
    assert.ok(await p.locator('#fr').count() === 1, 'continua no ecrã para tentar outra vez'); assert.deepStrictEqual(erros, []); await ctx.close();
    ({ ctx, p } = await abrir('dono', { tem: true, funcao: { status: 429, corpo: { erro: 'Demasiadas tentativas. Tente mais tarde.' } } })); await p.evaluate(() => GestTOTP.vRecuperar(async () => { })); await p.waitForSelector('#fr'); await p.fill('#fr [name=c]', 'aaaa'); await p.click('#rok'); await p.waitForTimeout(300);
    assert.ok(/Demasiadas tentativas/.test(await p.locator('.toast').innerText())); await ctx.close();

    // ---- desativar exige o código; gerar novos exige o código (aal2) ----
    ({ ctx, p, erros } = await abrir('dono', { tem: true, restantes: 5 })); await conta(p); await p.click('#td'); await p.waitForSelector('.modal [name=c]');
    await p.fill('.modal [name=c]', '000000'); await p.click('.modal [data-ok]'); await p.waitForTimeout(300); assert.ok(!(await log(p)).some(x => x[0] === 'unenroll' && x[1] === 'f1'), 'código errado não desativa');
    await p.fill('.modal [name=c]', '123456'); await p.click('.modal [data-ok]'); await p.waitForSelector('.modal:has-text("Desativar o autenticador")'); await p.click('.modal [data-ok]'); await p.waitForTimeout(400);
    assert.ok((await log(p)).some(x => x[0] === 'unenroll' && x[1] === 'f1'), 'com o código certo desativa'); assert.deepStrictEqual(erros, []); await ctx.close();
    ({ ctx, p } = await abrir('dono', { tem: true, restantes: 1, aalAtual: 'aal1' })); await conta(p); await p.click('#tg'); await p.waitForSelector('.modal [name=c]');
    assert.ok(!(await log(p)).some(x => x[1] === 'mfa_gerar_codigos'), 'sem aal2 pede primeiro o código'); await p.fill('.modal [name=c]', '123456'); await p.click('.modal [data-ok]'); await p.waitForSelector('#cods'); assert.ok((await log(p)).some(x => x[1] === 'mfa_gerar_codigos')); await ctx.close();
  } finally { await b.close(); s.close(); }
});

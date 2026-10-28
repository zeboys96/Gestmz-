// Alteração normal de senha (Conta → Mudar senha): exige a senha atual (reautenticação), pedida a cada papel.
// SIMULAÇÃO com cliente Supabase simulado: prova o comportamento da app, NÃO que o servidor recuse um updateUser feito diretamente
// por quem tenha uma sessão (isso depende da definição do Supabase Auth «exigir a senha atual», que não foi alterada).
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `(function(){ window.__upd = []; window.__sign = [];
  const sbf = { auth:{ getSession: async()=>({data:{session: window.__sessao === 'sim' ? {user:{email:'t@teste.local'}} : null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}),
      signInWithPassword: async (c)=>{ window.__sign.push(c.email); if (window.__rede) return {data:null,error:{message:'Failed to fetch'}}; return c.password === 'atual123' ? {data:{user:{id:'u1'}},error:null} : {data:null,error:{message:'Invalid login credentials'}}; },
      updateUser: async (a)=>{ window.__upd.push(a.password); return {error:null}; } },
    rpc: async()=>({data:'fechada',error:null}), channel:()=>({on(){return this},subscribe(){return this}}), removeChannel(){}, from:()=>new Proxy({},{get:()=>function(){return this}}) };
  window.supabase = { createClient: () => sbf }; })();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
test('senha normal: exige a senha atual em todos os papéis e não toca na recuperação', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    for (const papel of ['super', 'dono', 'gerente', 'caixa']) {
      const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
      await p.goto(url); await p.waitForSelector('#f');
      await p.evaluate(pp => { window.__sessao = 'sim'; S.perfil = { papel: pp, nome: 'T', id: 'u1', loja_id: pp === 'super' ? null : 'L1' }; S.loja = pp === 'super' ? null : { id: 'L1', nome: 'Loja', configurada: true, operacional: true }; shell(pp === 'super' ? navSuper() : navLoja()); return VIEWS.perfil(); }, papel);
      await p.waitForSelector('#fs');
      const tenta = async (atual, nova, conf) => { await p.fill('#fs [name=atual]', atual); await p.fill('#fs [name=senha]', nova); await p.fill('#fs [name=conf]', conf); await p.click('#fs button'); await p.waitForTimeout(300); return p.evaluate(() => ({ upd: window.__upd.slice(), sign: window.__sign.length })); };
      const id = papel + ': ';
      let r = await tenta('errada1', 'nova12345', 'nova12345'); assert.deepStrictEqual(r.upd, [], id + 'senha atual errada não pode alterar'); assert.strictEqual(r.sign, 1, id + 'tentou autenticar');
      r = await tenta('atual123', 'nova12345', 'outra12345'); assert.deepStrictEqual(r.upd, [], id + 'confirmação diferente'); assert.strictEqual(r.sign, 1, id + 'não chega a autenticar');
      r = await tenta('atual123', 'atual123', 'atual123'); assert.deepStrictEqual(r.upd, [], id + 'nova igual à atual');
      await p.evaluate(() => { window.__rede = true; }); r = await tenta('atual123', 'nova12345', 'nova12345'); assert.deepStrictEqual(r.upd, [], id + 'sem rede não altera');
      await p.evaluate(() => { window.__rede = false; window.__sessao = 'nao'; }); r = await tenta('atual123', 'nova12345', 'nova12345'); assert.deepStrictEqual(r.upd, [], id + 'sem sessão não altera');
      await p.evaluate(() => { window.__sessao = 'sim'; }); r = await tenta('atual123', 'nova12345', 'nova12345'); assert.deepStrictEqual(r.upd, ['nova12345'], id + 'com a senha atual certa altera uma vez');
      assert.ok(!(await p.content()).includes('Esqueci'), id + 'a alteração normal não mistura a recuperação');
      assert.deepStrictEqual(erros, [], id + 'erros JS ' + erros); await ctx.close();
    }
  } finally { await b.close(); s.close(); }
});

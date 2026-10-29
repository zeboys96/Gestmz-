// Cópia e restauro das vendas ainda não enviadas (www/copia.js).
// Parte 1: lógica pura em Node. Parte 2: Chromium com cliente Supabase SIMULADO (a idempotência real do servidor
// está em vendas_ref_cliente_uq + registar_venda; aqui só se prova que a app envia a mesma referência e não duplica localmente).
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const C = require(path.join(WWW, 'copia.js'));

const U = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const PERFIL = { id: U(1), loja_id: U(100), papel: 'caixa', nome: 'Ana' };
const AGORA = Date.parse('2026-10-29T10:00:00Z');
const venda = n => ({ ref: U(1000 + n), uid: PERFIL.id, loja: PERFIL.loja_id, itens: [{ produto_id: U(500), qtd: 2, caixa: false }], pagamento: 'Numerário', cliente: null, desconto: 0, recebido: 50, data: '2026-10-29T09:00:00.000Z', erro: null,
  venda: { id: 'local-' + U(1000 + n), num: null, pendente: true, data: '2026-10-29T09:00:00.000Z', usuario_nome: 'Ana', pagamento: 'Numerário', subtotal: 20, desconto: 0, iva: 0, total: 20, recebido: 50, troco: 30,
    itens: [{ produto_id: U(500), nome: 'Paracetamol', qtd: 2, un: 2, preco: 10, total: 20, caixa: false, custo_un: 4, segredo: 'x' }] } });

test('cópia: ida e volta, sem custos nem campos desconhecidos, só da própria conta', async () => {
  const fila = [venda(1), venda(2), Object.assign(venda(3), { uid: U(2) })];   // a 3.ª é de outro utilizador no mesmo aparelho
  const e = await C.exportar(fila, PERFIL, AGORA);
  assert.strictEqual(e.n, 2); assert.strictEqual(e.ignoradas, 0);
  assert.ok(!/custo|segredo|token|senha|password|apikey/i.test(e.texto), 'o ficheiro não leva custos, segredos nem credenciais');
  const v = await C.validar(e.texto, PERFIL, [], AGORA);
  assert.ok(v.ok, JSON.stringify(v)); assert.strictEqual(v.novas.length, 2); assert.strictEqual(v.repetidas, 0);
  assert.deepStrictEqual(v.novas.map(x => x.ref), [U(1001), U(1002)]);
  assert.ok(v.novas.every(x => x.venda.pendente === true && x.venda.id === 'local-' + x.ref && x.erro === null));
});

test('cópia: recusa o que não pode importar (nada é importado)', async () => {
  const e = await C.exportar([venda(1), venda(2)], PERFIL, AGORA), o = JSON.parse(e.texto);
  const recusa = async (texto, perfil, re, nome) => { const r = await C.validar(texto, perfil || PERFIL, [], AGORA); assert.ok(r.erro && re.test(r.erro), nome + ': ' + JSON.stringify(r)); assert.ok(!r.novas, nome + ' não devolve vendas'); };
  await recusa('', null, /vazio/i, 'vazio');
  await recusa('x'.repeat(2 * 1024 * 1024 + 1), null, /grande/i, 'enorme');
  await recusa('não é json', null, /JSON/i, 'texto');
  await recusa(JSON.stringify({ a: 1 }), null, /não é uma cópia/i, 'outro JSON');
  await recusa(JSON.stringify(Object.assign({}, o, { versao: 2 })), null, /versão/i, 'versão desconhecida');
  await recusa(e.texto, Object.assign({}, PERFIL, { id: U(2) }), /outro utilizador|outra loja/i, 'outro utilizador');
  await recusa(e.texto, Object.assign({}, PERFIL, { loja_id: U(101) }), /outro utilizador|outra loja/i, 'outra loja');
  const adulterada = JSON.parse(e.texto); adulterada.vendas[0].venda.total = 1; await recusa(JSON.stringify(adulterada), null, /resumo|alterado|corrompido/i, 'alterada à mão');
  const semResumo = JSON.parse(e.texto); delete semResumo.resumo; await recusa(JSON.stringify(semResumo), null, /resumo|alterado|corrompido/i, 'sem resumo');
});

test('cópia: mesmo com resumo refeito por quem edita o ficheiro, cada venda é validada campo a campo', async () => {
  const sha = async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map(x => x.toString(16).padStart(2, '0')).join('');
  const refaz = async vendas => JSON.stringify({ formato: 'gestmz-fila', versao: 1, criado: '2026-10-29T10:00:00.000Z', uid: PERFIL.id, loja: PERFIL.loja_id, vendas, resumo: await sha(JSON.stringify(vendas)) });
  const base = async () => JSON.parse((await C.exportar([venda(1)], PERFIL, AGORA)).texto).vendas;
  const casos = {
    'pagamento inventado': v => { v[0].pagamento = 'Bitcoin'; },
    'referência não é uuid': v => { v[0].ref = "1'; drop table vendas;--"; },
    'produto não é uuid': v => { v[0].itens[0].produto_id = 'abc'; },
    'quantidade negativa': v => { v[0].itens[0].qtd = -5; },
    'quantidade decimal': v => { v[0].itens[0].qtd = 1.5; },
    'quantidade enorme': v => { v[0].itens[0].qtd = 1e9; },
    'sem itens': v => { v[0].itens = []; },
    'desconto negativo': v => { v[0].desconto = -10; },
    'recebido inválido': v => { v[0].recebido = 'muito'; },
    'data no futuro': v => { v[0].data = '2030-01-01T00:00:00Z'; },
    'data absurda': v => { v[0].data = '1999-01-01T00:00:00Z'; },
    'data não é data': v => { v[0].data = 'ontem'; },
    'fiado sem cliente': v => { v[0].pagamento = 'Fiado'; v[0].cliente = null; },
    'cliente inválido': v => { v[0].cliente = 'joao'; },
    'outro utilizador dentro da venda': v => { v[0].uid = U(9); },
    'outra loja dentro da venda': v => { v[0].loja = U(9); },
    'recibo sem total': v => { delete v[0].venda.total; }
  };
  for (const [nome, f] of Object.entries(casos)) { const v = await base(); f(v); const r = await C.validar(await refaz(v), PERFIL, [], AGORA); assert.ok(r.erro && !r.novas, nome + ' devia ser recusado: ' + JSON.stringify(r)); }
  // campos a mais (ex.: custos, scripts) são descartados, não importados
  const v = await base(); v[0].itens[0].custo_un = 99; v[0].extra = '<script>'; v[0].venda.itens[0].custo_un = 99; v[0].venda.itens[0].nome = '<img onerror=x>';
  const r = await C.validar(await refaz(v), PERFIL, [], AGORA); assert.ok(r.ok, JSON.stringify(r));
  const s = JSON.stringify(r.novas[0]); assert.ok(!/custo_un|extra|<script>/.test(s), 'campos desconhecidos descartados'); assert.deepStrictEqual(Object.keys(r.novas[0].itens[0]).sort(), ['caixa', 'produto_id', 'qtd']);
});

test('cópia: repetidas não se duplicam (na fila atual, no próprio ficheiro, ao restaurar duas vezes)', async () => {
  const e = await C.exportar([venda(1), venda(2)], PERFIL, AGORA);
  let r = await C.validar(e.texto, PERFIL, [venda(1)], AGORA); assert.ok(r.ok); assert.strictEqual(r.novas.length, 1); assert.strictEqual(r.repetidas, 1);
  r = await C.validar(e.texto, PERFIL, [venda(1), venda(2)], AGORA); assert.ok(r.ok); assert.strictEqual(r.novas.length, 0); assert.strictEqual(r.repetidas, 2);
  const o = JSON.parse(e.texto); o.vendas.push(o.vendas[0]);   // a mesma venda duas vezes dentro do ficheiro
  const sha = async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map(x => x.toString(16).padStart(2, '0')).join('');
  o.resumo = await sha(JSON.stringify(o.vendas)); r = await C.validar(JSON.stringify(o), PERFIL, [], AGORA); assert.ok(r.ok); assert.strictEqual(r.novas.length, 2); assert.strictEqual(r.repetidas, 1);
});

test('cópia: exportar avisa das vendas que não consegue incluir (nunca falha em silêncio)', async () => {
  const mau = Object.assign(venda(2), { pagamento: 'Inventado' });
  const e = await C.exportar([venda(1), mau], PERFIL, AGORA); assert.strictEqual(e.n, 1); assert.strictEqual(e.ignoradas, 1);
  const vazio = await C.exportar([], PERFIL, AGORA); assert.strictEqual(vazio.n, 0);
});

// ---------------------- navegador ----------------------
const FAKE = `(function(){
  window.__rpcs = []; window.__servidor = window.__servidor || {};
  const sbf = { auth:{ getSession: async()=>({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}) },
    rpc: (n, a) => { window.__rpcs.push({ n, a });
      let r = { data: null, error: null };
      if (n === 'registar_venda') { const k = a.p_ref; if (!window.__servidor[k]) window.__servidor[k] = { id: 'v-' + k, ref_cliente: k }; r = { data: window.__servidor[k], error: null }; }   // idempotente, como o servidor
      if (n === 'produtos_loja' || n === 'lotes_loja' || n === 'vendas_loja') r = { data: [], error: null };
      const b = { range(){ return b; }, order(){ return b; }, then(res, rej){ return Promise.resolve(r).then(res, rej); } }; return b; },
    channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){},
    from: () => { const b = { select(){return b;}, order(){return b;}, range(){return b;}, eq(){return b;}, limit(){return b;}, then(res, rej){ return Promise.resolve({ data: [], error: null }).then(res, rej); } }; return b; } };
  window.supabase = { createClient: () => sbf };
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });

test('cópia no navegador: guardar, "reinstalar" (apagar dados), restaurar, enviar sem duplicar', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch(); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copia-'));
  try {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
    await p.goto(url); await p.waitForSelector('#f');
    const preparar = fila => p.evaluate(([pf, f]) => { S.perfil = pf; S.loja = { id: pf.loja_id, nome: 'Loja', configurada: true, operacional: true }; Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); localStorage.setItem('gestmz_fila', JSON.stringify(f)); }, [PERFIL, fila]);
    await preparar([venda(1), venda(2)]);
    await p.evaluate(() => { const m = document.createElement('div'); m.id = 'main'; document.body.appendChild(m); GestCopia.cartaoConta(m); });
    assert.ok(/Vendas feitas sem internet ainda não enviadas: 2/.test(await p.locator('#main').innerText()), 'mostra 2 pendentes');
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('#cpg')]); const ficheiro = path.join(dir, d.suggestedFilename()); await d.saveAs(ficheiro);
    assert.ok(/^gestmz-vendas-pendentes-\d{4}-\d{2}-\d{2}\.json$/.test(d.suggestedFilename()));
    const texto = fs.readFileSync(ficheiro, 'utf8'); assert.ok(!/custo|password|senha|token/i.test(texto), 'ficheiro sem custos nem credenciais');
    // "reinstalar": apagar todos os dados locais
    await p.evaluate(() => localStorage.clear()); assert.strictEqual(await p.evaluate(() => lerFila().length), 0);
    await preparar([]);
    // ficheiro de outra conta é recusado e não importa nada
    const alheio = JSON.parse(texto); alheio.uid = U(2); const f2 = path.join(dir, 'alheio.json'); fs.writeFileSync(f2, JSON.stringify(alheio));
    const importar = async f => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#cpr')]); await fc.setFiles(f); await p.waitForTimeout(400); };
    await importar(f2); assert.strictEqual(await p.evaluate(() => lerFila().length), 0, 'ficheiro de outra conta não importa'); assert.ok(/outro utilizador|resumo|corromp/i.test(await p.locator('#toast, .toast').allInnerTexts().then(t => t.join(' '))), 'diz porquê');
    // restaurar o ficheiro bom
    await importar(ficheiro); await p.waitForSelector('.modal'); await p.click('.modal button:has-text("Restaurar")'); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => lerFila().length), 2, 'duas vendas restauradas');
    assert.deepStrictEqual(await p.evaluate(() => lerFila().map(x => x.ref)), [U(1001), U(1002)]);
    // restaurar outra vez: tudo repetido, nada novo
    await importar(ficheiro); await p.waitForTimeout(300); assert.strictEqual(await p.evaluate(() => lerFila().length), 2, 'restaurar duas vezes não duplica'); assert.strictEqual(await p.locator('.modal').count(), 0, 'sem pergunta quando tudo é repetido');
    // volta a internet: envia com a MESMA referência e a fila esvazia
    await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true }); return sincronizarFila(); });
    const rpcs = await p.evaluate(() => window.__rpcs.filter(x => x.n === 'registar_venda').map(x => x.a.p_ref)); assert.deepStrictEqual(rpcs, [U(1001), U(1002)], 'enviou as referências originais');
    assert.strictEqual(await p.evaluate(() => lerFila().length), 0, 'fila vazia depois de enviar');
    // restaurar depois de já enviado: o servidor devolve a venda existente (não regista outra)
    await importar(ficheiro); await p.waitForSelector('.modal'); await p.click('.modal button:has-text("Restaurar")'); await p.waitForTimeout(600);
    await p.evaluate(() => sincronizarFila()); assert.strictEqual(await p.evaluate(() => Object.keys(window.__servidor).length), 2, 'o servidor continua com 2 vendas (idempotente)');
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

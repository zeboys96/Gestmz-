// Vendas e seleção do cliente na área de vendas (Chromium + cliente Supabase simulado). SIMULAÇÃO: não usa o Supabase real.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
// cliente Supabase simulado: tabelas em window.__T, venda controlada por window.__venda ('ok' | 'erro' | 'rede')
const FAKE = `(function(){
  window.__chamadas = []; window.__T = window.__T || {};
  const build = (t) => { const b = { select(){ return b; }, order(){ return b; }, range(){ return b; }, eq(){ return b; }, gt(){ return b; }, gte(){ return b; }, lt(){ return b; }, limit(){ return b; }, update(){ return b; }, insert(){ return b; }, delete(){ return b; },
      then(res, rej){ return Promise.resolve(window.__falhaLeitura ? { data: null, error: { message: 'Failed to fetch' } } : { data: (window.__T[t] || []), error: null }).then(res, rej); } }; return b; };
  const sbf = { auth:{ getSession: async()=>({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}) },
    rpc: (n, a) => { window.__chamadas.push({ n, a });
      if (n === 'registar_venda') { const m = window.__venda || 'ok';
        if (m === 'rede') return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } });
        if (m === 'erro') return Promise.resolve({ data: null, error: { message: 'Stock insuficiente: X' } });
        return Promise.resolve({ data: { id: 'v1', num: 7, data: new Date().toISOString(), usuario_nome: 'Teste', pagamento: a.p_pagamento, subtotal: 10, desconto: 0, iva: 0, total: 10, recebido: 0, troco: 0, itens: [{ nome: 'Produto', qtd: 1, preco: 10, total: 10, un: 1 }], cliente_id: a.p_cliente }, error: null }); }
      return Promise.resolve({ data: null, error: null }); },
    channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}, from: build };
  window.supabase = { createClient: () => sbf };
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
async function abrirPdv(b, url, papel) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(url); await p.waitForSelector('#f');
  await p.evaluate(pp => {
    window.__T.clientes = [{ id: 'c1', nome: 'Ana Fiada', divida: 5 }, { id: 'c2', nome: 'Beto', divida: 0 }];
    S.perfil = { papel: pp, nome: 'Teste', id: 'u1', loja_id: 'L1' }; S.loja = { id: 'L1', nome: 'Loja', estado: 'ativa', valido_ate: '2099-01-01', operacional: true };
    S.clientes = window.__T.clientes; S.cats = [];
    S.produtos = [{ id: 'p1', nome: 'Produto', preco: 10, iva: 0, ativo: true, unidade: 'un', minimo: 1, custo: 1, lotes: [{ id: 'l1', qtd: 50, soltas: 50, validade: null }] }];
    shell(navLoja()); window.__T.produtos = [{ id: 'p1', nome: 'Produto', preco: 10, iva: 0, ativo: true, unidade: 'un', minimo: 1, custo: 1 }]; window.__T.lotes = [{ id: 'l1', produto_id: 'p1', qtd: 50, soltas: 50, validade: null }];
  }, papel);
  await p.evaluate(() => go('pdv')); await p.waitForSelector('#cli');
  return { ctx, p, erros };
}
const adicionar = async p => { await p.evaluate(() => pdvAdd('p1', false)); };
test('venda: o cliente selecionado só é limpo depois da venda concluída com sucesso', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    // 1) venda a crédito concluída → cliente limpo, carrinho vazio, cliente e dívida não apagados
    let { ctx, p, erros } = await abrirPdv(b, url, 'dono'); await adicionar(p);
    await p.selectOption('#cli', 'c1'); await p.selectOption('#pag', 'Fiado'); await p.click('#fin'); await p.waitForSelector('#pr');
    assert.strictEqual(await p.inputValue('#cli'), '', 'após venda a crédito, o cliente deve voltar a «Consumidor final»');
    assert.strictEqual(await p.inputValue('#pag'), 'Numerário', 'a forma de pagamento volta ao padrão');
    assert.strictEqual(await p.evaluate(() => cart.length), 0, 'carrinho vazio');
    assert.strictEqual(await p.evaluate(() => S.clientes.length), 2, 'o cliente não foi eliminado');
    assert.strictEqual(await p.evaluate(() => S.clientes.find(c => c.id === 'c1').divida), 5, 'a dívida (guardada no servidor) não foi alterada pelo cliente');
    const ch = await p.evaluate(() => window.__chamadas.filter(c => c.n === 'registar_venda')); assert.strictEqual(ch.length, 1); assert.strictEqual(ch[0].a.p_cliente, 'c1', 'a venda foi enviada com o cliente escolhido');
    // a venda seguinte não herda o cliente
    await p.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.remove()); });
    await adicionar(p); await p.click('#fin'); await p.waitForSelector('#pr');
    const ch2 = await p.evaluate(() => window.__chamadas.filter(c => c.n === 'registar_venda')); assert.strictEqual(ch2[1].a.p_cliente, null, 'a 2.ª venda não herdou o cliente');
    assert.deepStrictEqual(erros, []); await ctx.close();
    // 2) venda a dinheiro com cliente escolhido → também limpa
    ({ ctx, p, erros } = await abrirPdv(b, url, 'gerente')); await adicionar(p); await p.selectOption('#cli', 'c2'); await p.click('#fin'); await p.waitForSelector('#pr');
    assert.strictEqual(await p.inputValue('#cli'), '', 'após venda a dinheiro, o cliente é limpo'); await ctx.close();
    // 3) falha de gravação → NADA é limpo (cliente, carrinho, pagamento)
    ({ ctx, p, erros } = await abrirPdv(b, url, 'dono')); await p.evaluate(() => { window.__venda = 'erro'; }); await adicionar(p);
    await p.selectOption('#cli', 'c1'); await p.selectOption('#pag', 'Fiado'); await p.click('#fin'); await p.waitForTimeout(600);
    assert.strictEqual(await p.inputValue('#cli'), 'c1', 'venda falhada: o cliente continua selecionado'); assert.strictEqual(await p.inputValue('#pag'), 'Fiado');
    assert.strictEqual(await p.evaluate(() => cart.length), 1, 'venda falhada: o carrinho mantém-se'); assert.strictEqual(await p.locator('#pr').count(), 0, 'sem recibo');
    assert.strictEqual(await p.evaluate(() => (jGet('gestmz_fila', []) || []).length), 0, 'um erro do servidor não vai para a fila offline'); await ctx.close();
    // 4) sem Internet → a venda fica na fila e a seleção é limpa (venda concluída localmente)
    ({ ctx, p, erros } = await abrirPdv(b, url, 'dono')); await adicionar(p); await p.selectOption('#cli', 'c1'); await p.selectOption('#pag', 'Fiado');
    await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => false }); }); await p.click('#fin'); await p.waitForSelector('#pr');
    assert.strictEqual(await p.inputValue('#cli'), '', 'venda guardada offline: cliente limpo'); assert.strictEqual(await p.evaluate(() => jGet('gestmz_fila', []).length), 1, 'a venda ficou na fila'); await ctx.close();
    // 5) cancelamento: o carrinho e o cliente só são limpos depois da autorização; sem autorização mantém-se
    ({ ctx, p, erros } = await abrirPdv(b, url, 'dono')); await adicionar(p); await p.selectOption('#cli', 'c1');
    await p.click('#lmp'); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => cart.length), 0, 'o dono pode cancelar a venda em curso'); assert.strictEqual(await p.inputValue('#cli'), '', 'cancelada: o cliente não fica herdado'); await ctx.close();
    ({ ctx, p, erros } = await abrirPdv(b, url, 'caixa')); await adicionar(p); await p.selectOption('#cli', 'c1');
    await p.click('#lmp'); await p.waitForSelector('.modal'); await p.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.remove())); await p.waitForTimeout(200);
    assert.strictEqual(await p.evaluate(() => cart.length), 1, 'o caixa sem autorização não cancela'); assert.strictEqual(await p.inputValue('#cli'), 'c1', 'sem autorização, o cliente mantém-se'); await ctx.close();
    // 6) a venda grava, mas a atualização posterior dos dados falha: o cliente é limpo na mesma e o recibo aparece
    ({ ctx, p, erros } = await abrirPdv(b, url, 'dono')); await adicionar(p); await p.selectOption('#cli', 'c1'); await p.selectOption('#pag', 'Fiado');
    await p.evaluate(() => { window.__falhaLeitura = true; }); await p.click('#fin'); await p.waitForSelector('#pr');
    assert.strictEqual(await p.inputValue('#cli'), '', 'venda gravada + leitura falhada: cliente limpo'); assert.strictEqual(await p.evaluate(() => cart.length), 0); await ctx.close();
  } finally { await b.close(); s.close(); }
});

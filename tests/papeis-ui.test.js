// Interface por papel (Chromium + cliente Supabase simulado): o caixa não vê stock; o gerente não vê custos nem lucro; só o dono vê o plano.
// SIMULAÇÃO da interface. A garantia real está no servidor (tests/db/04_permissoes_papeis.sql, migração 12) e só vale depois de a migração ser aplicada.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `(function(){
  window.__chamadas = []; window.__T = window.__T || {};
  const build = (t) => { const b = { select(){ return b; }, order(){ return b; }, range(){ return b; }, eq(){ return b; }, gt(){ return b; }, gte(){ return b; }, lt(){ return b; }, lte(){ return b; }, limit(){ return b; }, update(){ return b; }, insert(){ return b; }, delete(){ return b; },
      then(res, rej){ window.__chamadas.push('from:' + t); return Promise.resolve({ data: (window.__T[t] || []), error: null }).then(res, rej); } }; return b; };
  const sbf = { auth:{ getSession: async()=>({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}) },
    rpc: (n, a) => { window.__chamadas.push('rpc:' + n); const dados = n === 'produtos_loja' ? window.__T.produtos : n === 'lotes_loja' ? window.__T.lotes : n === 'vendas_loja' ? (window.__T.vendas || []) : n === 'minha_loja_info' ? window.__T.loja : null;
      const b = { range(){ return b; }, order(){ return b; }, then(res, rej){ return Promise.resolve(window.__semFuncoes && n !== 'registar_venda' ? { data: null, error: { message: 'Could not find the function public.' + n + ' in the schema cache' } } : { data: dados, error: null }).then(res, rej); } }; return b; },
    channel: () => ({ on(){ return this; }, subscribe(){ return this; } }), removeChannel(){}, from: build };
  window.supabase = { createClient: () => sbf };
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
const hoje = new Date().toISOString();
async function abrir(b, url, papel, loja, semFuncoes) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(url); await p.waitForSelector('#f');
  await p.evaluate(([pp, lj, sf]) => {
    window.__semFuncoes = sf; window.__T.loja = lj; window.__T.lojas = [lj];
    window.__T.produtos = [{ id: 'p1', nome: 'Paracetamol', preco: 10, iva: 0, ativo: true, unidade: 'un', minimo: 5, custo: 4, categoria: 'Geral', un_por_caixa: null }];
    window.__T.lotes = [{ id: 'l1', produto_id: 'p1', qtd: 2, soltas: 2, validade: null }];
    window.__T.vendas = [{ id: 'v1', num: 1, data: new Date().toISOString(), usuario_id: 'u1', usuario_nome: 'T', total: 10, pagamento: 'Numerário', anulada: false, desconto: 0, subtotal: 10, iva: 0, itens: [{ nome: 'Paracetamol', qtd: 1, un: 1, preco: 10, total: 10, custo_un: pp === 'dono' ? 4 : undefined }] }];
    S.perfil = { papel: pp, nome: 'Teste', id: 'u1', loja_id: 'L1' };
  }, [papel, loja, !!semFuncoes]);
  await p.evaluate(async () => { await carregarLoja(); shell(navLoja()); });
  return { ctx, p, erros };
}
const LOJA_DONO = { id: 'L1', nome: 'Loja', estado: 'ativa', valido_ate: '2099-01-01', configurada: true, operacional: true };
const LOJA_OUTROS = { id: 'L1', nome: 'Loja', configurada: true, operacional: true };            // o servidor novo não envia estado/validade
const LOJA_SUSP = { id: 'L1', nome: 'Loja', configurada: true, operacional: false };
const PROIBIDAS_PLANO = /subscri|assinatura|teste gr|per[ií]odo de teste|renovar|administrador|plano|suporte do gestmz/i;
test('interface por papel: caixa sem stock, gerente sem lucro/custos, plano só para o dono', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    // ---------- CAIXA ----------
    let { ctx, p, erros } = await abrir(b, url, 'caixa', LOJA_OUTROS);
    let ch = await p.evaluate(() => window.__chamadas);
    assert.ok(!ch.includes('rpc:lotes_loja') && !ch.includes('from:lotes'), 'o caixa nem sequer pede os lotes');
    assert.strictEqual(await p.evaluate(() => S.produtos[0].lotes.length), 0, 'o caixa não tem lotes na memória');
    await p.evaluate(() => go('pdv')); await p.waitForSelector('#lista .pi');
    let txt = await p.locator('#lista').innerText(); assert.ok(!/stock|esgotad|sem stock/i.test(txt), 'PDV do caixa sem stock: ' + txt);
    assert.ok(!(await p.locator('#lista .pi').first().getAttribute('style')), 'produto com stock 2 não aparece esbatido/esgotado ao caixa');
    await p.evaluate(() => go('produtos')); await p.waitForSelector('#tb table');
    txt = await p.locator('#main').innerText(); assert.ok(!/stock|esgotad|validade|em ordem|expira/i.test(txt), 'produtos do caixa sem informação de inventário: ' + txt);
    assert.strictEqual(await p.locator('#f').count(), 0, 'sem filtro de estado de stock');
    // o caixa consegue pôr 3 unidades na venda mesmo "havendo" 2 (o servidor é que decide)
    await p.evaluate(() => { go('pdv'); }); await p.waitForSelector('#lista .pi');
    await p.evaluate(() => { pdvAdd('p1', false); pdvAdd('p1', false); pdvAdd('p1', false); }); assert.strictEqual(await p.evaluate(() => cart[0].qtd), 3, 'o cliente não limita pelo stock (decide o servidor)');
    assert.ok(!PROIBIDAS_PLANO.test(await p.locator('#nav').innerText()), 'menu do caixa sem plano/assinatura/suporte: ' + await p.locator('#nav').innerText());
    assert.strictEqual(await p.locator('#banner').innerText(), '', 'sem avisos de plano para o caixa');
    assert.deepStrictEqual(erros, []); await ctx.close();
    // loja indisponível: mensagem genérica, sem plano
    ({ ctx, p, erros } = await abrir(b, url, 'caixa', LOJA_SUSP)); await p.evaluate(() => banner());
    txt = await p.locator('#banner').innerText(); assert.ok(/indispon/i.test(txt) && !PROIBIDAS_PLANO.test(txt), 'mensagem genérica: ' + txt);
    await p.evaluate(() => go('pdv')); await p.waitForSelector('#fin'); assert.ok(await p.locator('#fin').isDisabled(), 'sem vender com a loja indisponível'); assert.ok(!PROIBIDAS_PLANO.test(await p.locator('#main').innerText())); await ctx.close();
    // ---------- GERENTE ----------
    ({ ctx, p, erros } = await abrir(b, url, 'gerente', LOJA_OUTROS));
    await p.evaluate(() => go('painel')); await p.waitForSelector('.grid');
    txt = await p.locator('#main').innerText(); assert.ok(!/lucro|valor do stock|custo/i.test(txt), 'painel do gerente sem lucro/custo: ' + txt); assert.ok(/stock baixo/i.test(txt), 'mantém os avisos de stock');
    await p.evaluate(() => go('relatorios')); await p.waitForSelector('#r .grid');
    txt = await p.locator('#r').innerText(); assert.ok(!/lucro|resultado|custo/i.test(txt), 'relatórios do gerente sem lucro: ' + txt); assert.ok(/vendas/i.test(txt));
    await p.evaluate(() => go('produtos')); await p.waitForSelector('#tb table'); assert.ok(/stock/i.test(await p.locator('#tb').innerText()), 'o gerente continua a ver stock');
    await p.evaluate(() => formProduto()); await p.waitForSelector('.modal form');
    assert.strictEqual(await p.locator('.modal [name=custo]').count(), 0, 'formulário de produto sem custo'); assert.strictEqual(await p.locator('.modal [name=custo_caixa]').count(), 0);
    await p.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.remove()));
    await p.evaluate(() => formEntrada(prodById('p1'))); await p.waitForSelector('.modal form'); assert.strictEqual(await p.locator('.modal [name=custo]').count(), 0, 'entrada de stock sem custo'); assert.ok(await p.locator('.modal [name=qtd]').count() === 1, 'continua a poder dar entrada');
    assert.ok(!PROIBIDAS_PLANO.test(await p.locator('#nav').innerText()), 'menu do gerente sem plano/assinatura/suporte'); assert.strictEqual(await p.locator('#banner').innerText(), '');
    assert.deepStrictEqual(erros, []); await ctx.close();
    // ---------- DONO ----------
    ({ ctx, p, erros } = await abrir(b, url, 'dono', LOJA_DONO));
    await p.evaluate(() => go('painel')); await p.waitForSelector('.grid'); txt = await p.locator('#main').innerText(); assert.ok(/lucro bruto hoje/i.test(txt) && /valor do stock/i.test(txt), 'o dono vê lucro e valor do stock');
    await p.evaluate(() => go('relatorios')); await p.waitForSelector('#r .grid'); assert.ok(/lucro bruto/i.test(await p.locator('#r').innerText()));
    await p.evaluate(() => formProduto()); await p.waitForSelector('.modal form'); assert.ok(await p.locator('.modal [name=custo]').count() === 1, 'o dono vê o custo'); await p.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.remove()));
    assert.ok(/assinatura/i.test(await p.locator('#nav').innerText()), 'o dono vê a Assinatura');
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

test('compatibilidade: com o servidor antigo (funções da migração 12 ainda inexistentes) a app nova continua a ler os dados', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono', LOJA_DONO, true);
    assert.strictEqual(await p.evaluate(() => S.produtos.length), 1, 'produtos lidos pela leitura direta antiga');
    assert.strictEqual(await p.evaluate(() => S.produtos[0].lotes.length), 1, 'lotes lidos pela leitura direta antiga');
    assert.ok((await p.evaluate(() => window.__chamadas)).includes('from:produtos'));
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

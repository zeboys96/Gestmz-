// Novidades da interface (migração 16): caixa só com produtos disponíveis, carrinho livre, fotografias, notificações e fecho de caixa.
// SIMULAÇÃO: Chromium real + cliente Supabase simulado (window.supabase). NÃO usa o Supabase real nem um telemóvel Android.
// As garantias do servidor (RLS, atomicidade, isolamento entre lojas) são testadas em tests/db/06_stock_fotos_notif_caixa.sql.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `(function(){
  window.__ch = []; window.__T = {}; window.__rpc = {}; window.__rt = []; window.__up = []; window.__dl = 0; window.__rm = [];
  const reg = (x) => window.__ch.push(x);
  const build = (t) => { const o = { t, filtros: [] }, b = { select(){ return b; }, order(){ return b; }, range(){ return b; }, eq(k, v){ o.filtros.push([k, v]); return b; }, gt(){ return b; }, gte(){ return b; }, lt(){ return b; }, lte(){ return b; }, limit(){ return b; },
    update(v){ o.upd = v; return b; }, insert(v){ o.ins = v; return b; }, delete(){ o.del = true; return b; },
    then(res, rej){ if (o.upd || o.ins || o.del) reg({ tab: t, upd: o.upd, ins: o.ins, del: o.del, filtros: o.filtros }); const dados = window.__T[t]; return Promise.resolve({ data: o.upd || o.ins || o.del ? (o.ins ? [Object.assign({ id: 'novo-' + t }, o.ins)] : []) : (typeof dados === 'function' ? dados() : (dados || [])), error: null }).then(res, rej); } }; return b; };
  const storage = { from: (bk) => ({
    upload: async (p, blob, o) => { window.__up.push({ bk, p, tipo: o && o.contentType, tam: blob.size }); return window.__upErro ? { data: null, error: { message: window.__upErro } } : { data: { path: p }, error: null }; },
    download: async (p) => { window.__dl++; if (window.__dlAtraso) await new Promise(r => setTimeout(r, window.__dlAtraso)); if (window.__dlFalha) return { data: null, error: { message: 'falhou' } }; return { data: new Blob(['x'.repeat(2000)], { type: 'image/jpeg' }), error: null }; },
    remove: async (l) => { window.__rm.push(...l); return { data: l, error: null }; } }) };
  const sbf = { auth:{ getSession: async()=>({data:{session:null}}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut: async()=>({}) },
    rpc: (n, a) => { reg({ rpc: n, a }); const f = window.__rpc[n]; const b = { range(){ return b; }, order(){ return b; }, then(res, rej){ let r; try { r = f ? f(a) : { data: null, error: null }; } catch (e) { r = { data: null, error: { message: String(e.message) } }; } return Promise.resolve(r).then(res, rej); } }; return b; },
    channel: (nome) => { const c = { on(tipo, cfg, cb){ window.__rt.push({ nome, cfg, cb }); return c; }, subscribe(){ return c; } }; return c; }, removeChannel(){}, from: build, storage };
  window.supabase = { createClient: () => sbf };
})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
const LOJA = { id: '11111111-1111-1111-1111-111111111111', nome: 'Loja', estado: 'ativa', valido_ate: '2099-01-01', configurada: true, operacional: true };
const PID = i => '22222222-2222-2222-2222-' + String(i).padStart(12, '0');
const ok = data => ({ data, error: null });

async function abrir(b, url, papel, extra) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 800 } }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
  await p.goto(url); await p.waitForSelector('#f');
  await p.evaluate(([pp, lj, ex]) => {
    window.__T.loja = lj; window.__T.clientes = []; window.__T.categorias = [];
    window.__rpc.minha_loja_info = () => ({ data: lj, error: null }); window.__rpc.vendas_loja = () => ({ data: [], error: null }); window.__rpc.sinais_loja = () => ({ data: [], error: null });
    Object.assign(window.__rpc, ex && ex.rpc ? Object.fromEntries(Object.entries(ex.rpc).map(([k, v]) => [k, new Function('a', 'return (' + v + ')(a)')])) : {});
    S.perfil = { papel: pp, nome: 'Teste', id: 'u1', loja_id: lj.id }; S.loja = lj; S.clientes = []; S.cats = []; S.produtos = [];
  }, [papel, LOJA, extra || null]);
  return { ctx, p, erros };
}

test('caixa: só vê produtos com stock; código sem stock avisa; reposição faz reaparecer; carrinho livre; anular venda concluída continua protegido', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url, 'caixa');
    await p.evaluate(() => {
      const base = { categoria: 'Geral', iva: 0, controlado: false, un_por_caixa: null, preco_caixa: null, embalagem: null, codigo_caixa: null, foto_ver: null, disp_cx: 0 };
      window.__lista = [{ ...base, id: 'A', nome: 'Sabonete', codigo: '111', preco: 30, disp_un: 5 }, { ...base, id: 'B', nome: 'Arroz', codigo: '222', preco: 50, disp_un: 9 }];
      window.__rpc.produtos_venda = () => ({ data: window.__lista, error: null }); window.__rpc.lotes_loja = () => ({ data: [], error: null });
      window.__rpc.produto_por_codigo = a => a.p_codigo === '333' ? { data: { encontrado: true, id: 'C', nome: 'Açúcar', caixa: false, preco: 20, foto_ver: null, disp_un: 0, disp_cx: 0, disponivel: false }, error: null } : { data: { encontrado: false }, error: null };
    });
    await p.evaluate(async () => { await recarregarProdutos(); shell(navLoja()); go('pdv'); }); await p.waitForSelector('#lista .pi');
    let nomes = await p.locator('#lista .pi .main b').allInnerTexts(); assert.deepStrictEqual(nomes.sort(), ['Arroz', 'Sabonete'], 'o caixa só vê os produtos devolvidos como vendáveis');
    assert.ok((await p.evaluate(() => window.__ch.filter(c => c.rpc === 'produtos_venda').length)) >= 1, 'o caixa lê a lista de venda do servidor');
    assert.ok(!/Açúcar/.test(await p.locator('#lista').innerText()), 'produto sem stock não aparece na lista do caixa');
    assert.ok(!/stock/i.test(await p.locator('#lista').innerText()), 'a lista do caixa não mostra stock');
    // código de um produto sem stock: mensagem clara, nada entra no carrinho, não é apagado
    await p.fill('#q', '333'); await p.press('#q', 'Enter'); await p.waitForSelector('#scan .scancard.sem');
    assert.ok(/sem stock/i.test(await p.locator('#scan').innerText()), 'painel diz sem stock'); assert.ok(/Açúcar/.test(await p.locator('#scan').innerText()) && /20,00 MT/.test(await p.locator('#scan').innerText()), 'mostra nome e preço');
    assert.ok(/sem stock/i.test(await p.locator('.toast').innerText()), 'mensagem clara de produto sem stock'); assert.strictEqual(await p.evaluate(() => cart.length), 0, 'não entra no carrinho');
    // código desconhecido ≠ sem stock
    await p.fill('#q', '999'); await p.press('#q', 'Enter'); await p.waitForTimeout(250); assert.ok(/não encontrado/i.test(await p.locator('.toast').innerText()), 'código desconhecido é outra mensagem');
    // reposição: o produto reaparece sozinho (a lista volta a ser lida)
    await p.fill('#q', ''); await p.evaluate(async () => { window.__lista.push({ id: 'C', nome: 'Açúcar', codigo: '333', categoria: 'Geral', preco: 20, iva: 0, controlado: false, un_por_caixa: null, preco_caixa: null, embalagem: null, codigo_caixa: null, foto_ver: null, disp_un: 12, disp_cx: 0 }); await recarregarProdutos(); pdvLista(); });
    assert.ok(/Açúcar/.test(await p.locator('#lista').innerText()), 'depois da reposição o produto reaparece'); await p.fill('#q', '333'); await p.press('#q', 'Enter'); await p.waitForTimeout(250);
    assert.strictEqual(await p.evaluate(() => cart.length), 1, 'e já pode ser vendido'); assert.ok(/Disponível/.test(await p.locator('#scan').innerText()), 'ao ler o código vê a quantidade disponível para venda');
    // não se passa do disponível (servidor também recusa)
    await p.evaluate(() => { cart = []; pdvDraw(); for (let i = 0; i < 7; i++) pdvAdd('A', false); }); assert.strictEqual(await p.evaluate(() => cart[0].qtd), 5, 'não passa do disponível');
    // carrinho: retirar e diminuir SEM autorização; total atualiza
    await p.evaluate(() => { cart = []; pdvDraw(); pdvAdd('A', false); pdvAdd('A', false); pdvAdd('B', false); });
    assert.ok(/110,00 MT/.test(await p.locator('#tot').innerText()), 'total 2×30+50');
    await p.click('#cart button[data-a="-"] >> nth=0'); assert.strictEqual(await p.locator('.modal').count(), 0, 'diminuir não pede gerente'); assert.ok(/80,00 MT/.test(await p.locator('#tot').innerText()), 'total atualizado');
    await p.click('#cart button[data-a="x"] >> nth=0'); assert.strictEqual(await p.locator('.modal').count(), 0, 'retirar não pede gerente'); assert.strictEqual(await p.evaluate(() => cart.length), 1);
    assert.ok(/50,00 MT/.test(await p.locator('#tot').innerText()), 'total atualizado ao retirar');
    // vendas concluídas: a autorização do gerente continua a ser exigida ao caixa
    await p.evaluate(() => { window.__aut = autorizar('Anular', 'pedido_anulacao', 'x'); }); await p.waitForSelector('.modal'); assert.ok(/Autoriza/.test(await p.locator('.modal').innerText()), 'caixa: anular venda concluída pede o gerente');
    await p.evaluate(() => document.querySelectorAll('.modal [data-x]')[0].click()); assert.strictEqual(await p.evaluate(() => window.__aut.then(x => x)), null, 'cancelar o pedido não autoriza');
    const fonte = fs.readFileSync(path.join(WWW, 'loja.js'), 'utf8'); assert.ok(/autorizar\(`Anular a venda/.test(fonte), 'anularVenda continua a exigir autorização'); assert.ok(!/autorizar\([^)]*retirar_item/.test(fonte) && !/diminuir_item/.test(fonte), 'retirar/diminuir já não pedem autorização');
    assert.deepStrictEqual(erros, []); await ctx.close();
    // o gerente continua a ver produtos sem stock (esbatidos) e a repor
    const g = await abrir(b, url, 'gerente'); await g.p.evaluate(async () => {
      window.__rpc.produtos_loja = () => ({ data: [{ id: 'A', nome: 'Sabonete', codigo: '111', categoria: 'Geral', preco: 30, iva: 0, un_por_caixa: null, minimo: 2 }], error: null });
      window.__rpc.lotes_loja = () => ({ data: [], error: null }); await recarregarProdutos(); shell(navLoja()); go('pdv'); });
    await g.p.waitForSelector('#lista .pi'); assert.ok(/stock 0/.test(await g.p.locator('#lista').innerText()), 'gerente vê o produto sem stock'); await g.ctx.close();
  } finally { await b.close(); s.close(); }
});

test('fotografias: comprimir, miniaturas, lazy loading em catálogo grande, cache, internet lenta, falha sem bloquear vendas, substituir e remover', { skip: !chromium && 'playwright indisponível', timeout: 240000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono');
    // 1) compressão e redimensionamento de uma fotografia de câmara grande
    const r = await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const x = c.getContext('2d'); for (let i = 0; i < 3000; i += 8) for (let j = 0; j < 2000; j += 8) { x.fillStyle = `rgb(${(i * 7 + j * 3) % 256},${(i + j * 11) % 256},${(i * 5 ^ j) % 256})`; x.fillRect(i, j, 8, 8); }
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .97)); const file = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
      const prep = await fotoPreparar(file); return { original: file.size, f: prep.f.size, t: prep.t.size, wF: prep.wF, hF: prep.hF, wT: prep.wT, hT: prep.hT, tipo: prep.f.type };
    });
    assert.ok(r.original > 600000, 'a fotografia de teste é grande: ' + r.original); assert.ok(r.f <= 280 * 1024, 'versão grande comprimida: ' + r.f); assert.ok(r.f < r.original / 3, 'bem mais pequena que o original');
    assert.ok(Math.max(r.wF, r.hF) <= 960 && Math.max(r.wT, r.hT) <= 160, `dimensões ${r.wF}x${r.hF} e ${r.wT}x${r.hT}`); assert.ok(r.t < 30 * 1024, 'miniatura leve: ' + r.t); assert.strictEqual(r.tipo, 'image/jpeg');
    // ficheiros inválidos
    const inv = await p.evaluate(async () => { const o = []; for (const f of [new File(['x'], 'a.pdf', { type: 'application/pdf' }), new File(['x'], 'a.txt', { type: 'text/plain' })]) { try { await fotoPreparar(f); o.push('aceite'); } catch (e) { o.push(e.message); } } try { fotoValidar({ type: 'image/jpeg', size: 30 * 1048576, name: 'a.jpg' }); o.push('aceite'); } catch (e) { o.push(e.message); } return o; });
    assert.ok(inv.every(m => m !== 'aceite'), 'tipos e tamanhos inválidos são recusados: ' + inv.join(' | '));
    // 2) enviar: caminho respeita o formato que o servidor exige; produto só é ligado depois do envio; substituir apaga a versão anterior; remover limpa
    await p.evaluate(async ([pid]) => { const prep = { t: new Blob(['t'], { type: 'image/jpeg' }), f: new Blob(['f'], { type: 'image/jpeg' }) }; window.__v = await fotoEnviar(pid, prep, 'antigav1'); }, [PID(1)]);
    const ups = await p.evaluate(() => window.__up), re = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-z0-9]{6,24}-[tf]\.jpg$/;
    assert.strictEqual(ups.length, 2); assert.ok(ups.every(u => re.test(u.p) && u.p.startsWith(LOJA.id + '/' + PID(1) + '/') && u.bk === 'produtos-fotos' && u.tipo === 'image/jpeg'), 'caminhos válidos e na pasta da loja: ' + JSON.stringify(ups.map(u => u.p)));
    const chs = await p.evaluate(() => window.__ch.filter(c => c.tab === 'produtos' && c.upd)); assert.strictEqual(chs.length, 1); assert.ok(/^[a-z0-9]{6,24}$/.test(chs[0].upd.foto_ver), 'só a versão (texto curto) vai para a tabela, nunca a imagem');
    assert.deepStrictEqual((await p.evaluate(() => window.__rm)).sort(), [LOJA.id + '/' + PID(1) + '/antigav1-f.jpg', LOJA.id + '/' + PID(1) + '/antigav1-t.jpg'], 'a versão anterior é apagada');
    await p.evaluate(async ([pid]) => { window.__rm = []; await fotoRemover(pid, 'v2v2v2v2'); }, [PID(1)]);
    assert.ok((await p.evaluate(() => window.__ch.filter(c => c.tab === 'produtos' && c.upd && c.upd.foto_ver === null).length)) === 1, 'remover põe foto_ver a nulo'); assert.strictEqual((await p.evaluate(() => window.__rm)).length, 2);
    // falha no envio: o produto não é alterado
    await p.evaluate(() => { window.__up = []; window.__ch = []; window.__upErro = 'Bucket not found'; });
    const msg = await p.evaluate(async ([pid]) => { try { await fotoEnviar(pid, { t: new Blob(['t']), f: new Blob(['f']) }, null); return 'enviou'; } catch (e) { return e.message; } }, [PID(1)]);
    assert.ok(/ainda não estão disponíveis/.test(msg), msg); assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.tab === 'produtos' && c.upd).length), 0, 'sem upload, o produto não é tocado'); await p.evaluate(() => { window.__upErro = null; });
    // 3) catálogo grande: carregamento preguiçoso (só o que está perto do ecrã) e cache
    await p.evaluate(async () => {
      S.produtos = Array.from({ length: 300 }, (_, i) => ({ id: '22222222-2222-2222-2222-' + String(i).padStart(12, '0'), nome: 'Produto ' + i, preco: 10, iva: 0, categoria: 'Geral', unidade: 'un', minimo: 1, custo: 1, foto_ver: 'ver' + String(i).padStart(4, '0'), lotes: [{ id: 'l' + i, qtd: 5, soltas: 5, validade: null }] }));
      window.__rpc.produtos_loja = () => ({ data: S.produtos.map(({ lotes, ...x }) => x), error: null }); shell(navLoja()); pf = { q: '', f: 'todos', c: '' }; window.__dl = 0; await go('produtos');
    });
    await p.waitForSelector('#tb table'); await p.waitForTimeout(700);
    const d1 = await p.evaluate(() => window.__dl); assert.ok(d1 > 0 && d1 < 40, `só as fotografias visíveis foram pedidas (${d1} de 300)`);
    assert.strictEqual(await p.locator('#tb tr img.pfoto').count(), 300, '300 produtos, 300 miniaturas (as restantes à espera)');
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(900); const d2 = await p.evaluate(() => window.__dl); assert.ok(d2 > d1 && d2 < 300, `ao deslocar pede mais, mas nunca tudo (${d2})`);
    // cache: reabrir a lista não volta a descarregar
    await p.evaluate(async () => { await go('produtos'); }); await p.waitForTimeout(700); const d3 = await p.evaluate(() => window.__dl); assert.ok(d3 - d2 <= 12, `as já vistas não voltam a ser descarregadas (${d3 - d2} novas)`);
    // cache do aparelho (sem memória): usa a Cache API em vez da rede
    const cc = await p.evaluate(async () => { fotoMem.clear(); const antes = window.__dl, c0 = fotoEstat.cache; const u = await fotoUrl(S.produtos[0].id ? fotoCaminho(S.produtos[0], 't') : ''); return { dl: window.__dl - antes, cache: fotoEstat.cache - c0, u: u.slice(0, 5) }; });
    assert.strictEqual(cc.dl, 0, 'sem rede: veio da cache'); assert.strictEqual(cc.cache, 1); assert.strictEqual(cc.u, 'blob:');
    await ctx.close();
    // 4) internet lenta e falha: a venda nunca fica à espera da fotografia
    const l = await abrir(b, url, 'dono'); await l.p.evaluate(async () => {
      window.__dlAtraso = 3000; S.produtos = [{ id: '22222222-2222-2222-2222-000000000001', nome: 'Lento', preco: 10, iva: 0, categoria: 'G', unidade: 'un', minimo: 1, custo: 1, foto_ver: 'verlento1', lotes: [{ id: 'l', qtd: 5, soltas: 5, validade: null }] }]; shell(navLoja()); go('pdv'); });
    await l.p.waitForSelector('#lista .pi'); assert.ok(/^data:image\/svg/.test(await l.p.locator('#lista img').getAttribute('src')), 'imagem temporária enquanto carrega');
    await l.p.click('#lista button.main'); assert.strictEqual(await l.p.evaluate(() => cart.length), 1, 'dá para vender enquanto a fotografia ainda carrega (internet lenta)');
    await l.p.click('#fin'); await l.p.waitForSelector('#pr', { timeout: 8000 }).catch(() => { }); await l.ctx.close();
    const f = await abrir(b, url, 'dono'); await f.p.evaluate(async () => {
      window.__dlFalha = true; S.produtos = [{ id: '22222222-2222-2222-2222-000000000002', nome: 'Sem net', preco: 10, iva: 0, categoria: 'G', unidade: 'un', minimo: 1, custo: 1, foto_ver: 'verfalha1', lotes: [{ id: 'l', qtd: 5, soltas: 5, validade: null }] }]; shell(navLoja()); go('pdv'); });
    await f.p.waitForSelector('#lista .pi'); await f.p.waitForFunction(() => document.querySelector('#lista img').dataset.estado === 'erro'); const alvo = await f.p.locator('#lista img').getAttribute('src'); assert.ok(/^data:image\/svg/.test(alvo) && alvo !== await f.p.evaluate(() => FOTO_ESPERA), 'falhou: imagem padrão');
    await f.p.click('#lista button.main'); assert.strictEqual(await f.p.evaluate(() => cart.length), 1, 'a falha da fotografia não impede a venda');
    // produto sem fotografia: imagem padrão e nenhum pedido de rede
    const n0 = await f.p.evaluate(() => { window.__dl = 0; S.produtos[0].foto_ver = null; pdvLista(); return window.__dl; }); assert.strictEqual(n0, 0); assert.deepStrictEqual(erros, []); assert.deepStrictEqual(f.erros, []); await f.ctx.close();
  } finally { await b.close(); s.close(); }
});

test('formulário do produto: o dono vê o campo da fotografia (câmara, galeria, pré-visualização, remover); o gerente não', { skip: !chromium && 'playwright indisponível', timeout: 120000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  try {
    for (const papel of ['dono', 'gerente']) {
      const { ctx, p, erros } = await abrir(b, url, papel); await p.evaluate(() => { S.cats = [{ id: 'c1', nome: 'Geral' }]; shell(navLoja()); formProduto(); });
      await p.waitForSelector('.modal form');
      if (papel === 'dono') {
        assert.ok(await p.locator('#fcam').isVisible() && await p.locator('#fgal').isVisible(), 'botões tirar fotografia / galeria');
        assert.strictEqual(await p.locator('#fin-cam').getAttribute('capture'), 'environment', 'a câmara abre direto (sem passar pela galeria)'); assert.ok(!(await p.locator('#fin-gal').getAttribute('capture')), 'a galeria não força a câmara');
        assert.ok(await p.locator('#frem').isHidden(), 'sem fotografia, «Remover» escondido');
        // escolher uma imagem: pré-visualização e botão remover
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
        await p.setInputFiles('#fin-gal', { name: 'f.png', mimeType: 'image/png', buffer: png }); await p.waitForFunction(() => /Pronta/.test(document.querySelector('#finfo').textContent));
        assert.ok(/^blob:/.test(await p.locator('#fprev').getAttribute('src')), 'visualiza antes de guardar'); assert.ok(await p.locator('#frem').isVisible());
        await p.click('#frem'); assert.ok(!/^blob:/.test(await p.locator('#fprev').getAttribute('src')), 'removida: volta à imagem padrão');
        await p.setInputFiles('#fin-gal', { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') }); await p.waitForFunction(() => document.querySelector('#ferr').textContent.length > 0);
        assert.ok(/Formato/.test(await p.locator('#ferr').innerText()), 'formato inválido: erro junto ao campo');
        assert.ok(await p.locator('[name=minimo]').count() === 1, 'o dono define o limite de stock baixo');
      } else {
        assert.strictEqual(await p.locator('#fcam').count(), 0, 'o gerente não tem o campo da fotografia'); assert.strictEqual(await p.locator('[name=minimo]').count(), 0, 'nem o limite de stock baixo');
      }
      assert.deepStrictEqual(erros, []); await ctx.close();
    }
  } finally { await b.close(); s.close(); }
});

test('notificações: sino com contador para dono e gerente; caixa sem acesso; marcar lidas; sem duplicados; servidor antigo esconde o sino', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  const lista = () => [
    { id: 'n1', tipo: 'caixa_fechado', titulo: 'Caixa fechado com sucesso.', dados: { caixa: 'Caixa de Ana', funcionario: 'Ana', fim: new Date().toISOString(), n_vendas: 4, total_vendido: 200, dinheiro: 150, outros: 50, esperado: 150, contado: 145, diferenca: -5, obs: 'troco' }, criada_em: new Date().toISOString(), lida: false },
    { id: 'n2', tipo: 'stock_zero', titulo: 'Sem stock: Arroz', dados: { produto: 'Arroz', em: new Date().toISOString() }, criada_em: new Date().toISOString(), lida: false },
    { id: 'n3', tipo: 'venda', titulo: 'Venda V-00007 concluída', dados: { num: 'V-00007', funcionario: 'Ana', total: 80, pagamento: 'M-Pesa', data: new Date().toISOString() }, criada_em: new Date().toISOString(), lida: true }];
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono');
    await p.evaluate(l => { window.__n = l; window.__rpc.notificacoes_nao_lidas = () => ok(window.__n.filter(x => !x.lida).length); window.__rpc.minhas_notificacoes = () => ({ data: window.__n, error: null });
      window.__rpc.marcar_notificacao_lida = a => { window.__n.find(x => x.id === a.p_id).lida = true; return { data: null, error: null }; }; window.__rpc.marcar_todas_lidas = () => { window.__n.forEach(x => x.lida = true); return { data: 2, error: null }; };
      window.ok = d => ({ data: d, error: null }); window.__rpc.produtos_loja = () => ({ data: [], error: null }); window.__rpc.lotes_loja = () => ({ data: [], error: null }); }, lista());
    await p.evaluate(async () => { await carregarLoja(); shell(navLoja()); iniciarRT(); }); await p.waitForSelector('#sino .sn:not([hidden])');
    assert.strictEqual((await p.locator('#sino .sn').innerText()).trim(), '2', 'contador de não lidas'); assert.ok(await p.locator('#sino').isVisible());
    assert.ok((await p.evaluate(() => window.__rt.filter(r => r.cfg.table === 'notificacoes' && r.cfg.filter === 'loja_id=eq.' + S.perfil.loja_id).length)) === 1, 'tempo real ligado à tabela de notificações da loja');
    await p.click('#sino'); await p.waitForSelector('.nt'); assert.strictEqual(await p.locator('.nt').count(), 3, 'histórico (lidas e por ler)'); assert.strictEqual(await p.locator('.nt.nova').count(), 2);
    const t = await p.locator('#ntLista').innerText(); assert.ok(/Caixa fechado com sucesso\./.test(t) && /Caixa de Ana/.test(t) && /falta/i.test(t) && /145,00 MT/.test(t), 'fecho: caixa, funcionário, contado e diferença destacada'); assert.ok(/Sem stock: Arroz/.test(t), 'stock zero identifica o produto'); assert.ok(/V-00007/.test(t) && /M-Pesa/.test(t) && /80,00 MT/.test(t), 'venda: identificação, valor e pagamento');
    assert.ok(!/custo|lucro|margem/i.test(t), 'nada de custos/lucros/margens');
    assert.strictEqual(await p.locator('.nt.alerta').count(), 2, 'diferença no caixa e stock zero destacados');
    await p.click('.nt.nova >> nth=0'); await p.waitForFunction(() => document.querySelectorAll('.nt.nova').length === 1); assert.strictEqual((await p.locator('#sino .sn').innerText()).trim(), '1', 'ao ler uma, o contador desce');
    await p.click('#ntTodas'); await p.waitForFunction(() => document.querySelector('#sino .sn').hidden); assert.strictEqual(await p.locator('.nt.nova').count(), 0, 'marcar todas como lidas');
    await p.keyboard.press('Escape');
    // a mesma notificação vinda duas vezes (tempo real + sondeamento): um só aviso
    await p.evaluate(() => { window.__n.push({ id: 'n4', tipo: 'venda_anulada', titulo: 'Venda V-00008 anulada', dados: { num: 'V-00008', funcionario: 'Ana', anulada_por: 'Gerente', motivo: 'erro', total: 10, pagamento: 'Numerário', data: new Date().toISOString() }, criada_em: new Date().toISOString(), lida: false }); const h = window.__rt.find(r => r.cfg.table === 'notificacoes').cb; h({ new: { id: 'n4' } }); h({ new: { id: 'n4' } }); });
    await p.waitForFunction(() => !document.querySelector('#sino .sn').hidden); assert.strictEqual((await p.locator('#sino .sn').innerText()).trim(), '1', 'duplicados no tempo real não contam duas vezes');
    assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.rpc === 'notificacoes_nao_lidas').length) >= 2, true);
    assert.deepStrictEqual(erros, []); await ctx.close();
    // gerente também tem sino; caixa não tem sino nem pede notificações
    const g = await abrir(b, url, 'gerente'); await g.p.evaluate(() => { window.__rpc.notificacoes_nao_lidas = () => ({ data: 1, error: null }); window.__rpc.produtos_loja = () => ({ data: [], error: null }); window.__rpc.lotes_loja = () => ({ data: [], error: null }); }); await g.p.evaluate(async () => { await carregarLoja(); shell(navLoja()); iniciarRT(); });
    await g.p.waitForSelector('#sino .sn:not([hidden])'); await g.ctx.close();
    const c = await abrir(b, url, 'caixa'); await c.p.evaluate(async () => { window.__rpc.produtos_venda = () => ({ data: [], error: null }); await carregarLoja(); shell(navLoja()); iniciarRT(); }); await c.p.waitForTimeout(300);
    assert.strictEqual(await c.p.locator('#sino').count(), 0, 'o caixa não tem sino'); assert.ok(!(await c.p.evaluate(() => window.__ch.some(x => /notifica/.test(x.rpc || '') || (x.tab || '') === 'notificacoes'))), 'o caixa nem sequer pede notificações');
    assert.strictEqual(await c.p.locator('#btnFecho').count(), 1, 'o caixa tem o botão «Fechar caixa» sempre visível'); await c.ctx.close();
    // servidor sem a migração: o sino esconde-se e nada quebra
    const o = await abrir(b, url, 'dono'); await o.p.evaluate(async () => { window.__rpc.notificacoes_nao_lidas = () => ({ data: null, error: { message: 'Could not find the function public.notificacoes_nao_lidas in the schema cache' } }); window.__rpc.produtos_loja = () => ({ data: [], error: null }); window.__rpc.lotes_loja = () => ({ data: [], error: null }); await carregarLoja(); shell(navLoja()); iniciarRT(); });
    await o.p.waitForTimeout(400); assert.ok(await o.p.locator('#sino').isHidden(), 'sino escondido com servidor antigo'); assert.deepStrictEqual(o.erros, []); await o.ctx.close();
  } finally { await b.close(); s.close(); }
});

test('fecho de caixa: resumo, contagem, falta e excesso, confirmação, sem duplicar, pendente offline e envio ao voltar a internet', { skip: !chromium && 'playwright indisponível', timeout: 240000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  const resumo = { inicio: new Date(Date.now() - 36e5).toISOString(), fim: new Date().toISOString(), data_mov: '2026-11-01', n_vendas: 3, total_vendido: 200, dinheiro: 120, outros: 80, fiado: 0, recebimentos_dinheiro: 0, por_metodo: { 'Numerário': 120, 'M-Pesa': 80 }, n_anuladas: 1, total_anuladas: 30, ja_fechado: false, caixa_nome: 'Caixa de Ana', usuario_nome: 'Ana' };
  try {
    const { ctx, p, erros } = await abrir(b, url, 'caixa');
    await p.evaluate(r => { window.__resumo = r; window.__fechos = []; window.__rpc.produtos_venda = () => ({ data: [], error: null }); window.__rpc.resumo_caixa = () => ({ data: window.__resumo, error: null });
      window.__rpc.fechar_caixa = a => { const ex = window.__fechos.find(f => f.ref_cliente === a.p_ref); if (ex) return { data: { ...ex, repetido: true }, error: null };
        const esp = (a.p_fundo || 0) + window.__resumo.dinheiro, f = { id: 'f' + (window.__fechos.length + 1), ref_cliente: a.p_ref, caixa_nome: 'Caixa de Ana', usuario_nome: 'Ana', fim: new Date().toISOString(), n_vendas: 3, total_vendido: 200, dinheiro: 120, outros: 80, esperado: esp, contado: a.p_contado, diferenca: a.p_contado - esp, obs: a.p_obs, estado: 'fechado' }; window.__fechos.push(f); return { data: { ...f, repetido: false }, error: null }; };
      window.__T.caixa_fechos = () => window.__fechos; }, resumo);
    await p.evaluate(async () => { await carregarLoja(); shell(navLoja()); go('fecho'); }); await p.waitForSelector('#fcForm');
    let t = await p.locator('#main').innerText(); assert.ok(/Caixa de Ana/.test(t) && /Vendas concluídas\s*3/.test(t) && /200,00 MT/.test(t) && /120,00 MT/.test(t) && /80,00 MT/.test(t) && /Vendas canceladas\s*1/.test(t), 'resumo: caixa, funcionário, nº de vendas, total, dinheiro, outros e canceladas: ' + t);
    // falta
    await p.fill('[name=contado]', '115'); assert.ok(/falta 5,00 MT/.test(await p.locator('#fcCalc').innerText()), 'mostra a falta'); await p.fill('[name=contado]', '130'); assert.ok(/excesso 10,00 MT/.test(await p.locator('#fcCalc').innerText()), 'mostra o excesso');
    await p.fill('[name=fundo]', '10'); assert.ok(/Esperado: 130,00 MT/.test(await p.locator('#fcCalc').innerText()), 'valor inicial entra no esperado'); await p.fill('[name=fundo]', '0');
    // sem contagem: não avança
    await p.fill('[name=contado]', ''); await p.click('#fcRever'); assert.ok(/Indique o dinheiro/.test(await p.locator('#fcErr').innerText()), 'erro junto ao campo'); assert.strictEqual(await p.locator('.modal').count(), 0);
    // contagem com falta e observação: resumo final e confirmação ANTES de gravar
    await p.fill('[name=contado]', '115'); await p.fill('[name=obs]', 'troco a mais'); await p.click('#fcRever'); await p.waitForSelector('.modal');
    assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.rpc === 'fechar_caixa').length), 0, 'nada foi gravado antes da confirmação'); const m = await p.locator('.modal').innerText(); assert.ok(/falta 5,00 MT/.test(m) && /troco a mais/.test(m) && /115,00 MT/.test(m), 'resumo final antes de confirmar');
    await p.dblclick('.modal [data-ok]'); await p.waitForSelector('.fecho-ok');   // duplo toque: um só fecho
    assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.rpc === 'fechar_caixa').length), 1, 'duplo clique não duplica o fecho'); t = await p.locator('.fecho-ok').innerText();
    assert.ok(/Caixa fechado com sucesso\./.test(t) && /Ana/.test(t) && /115,00 MT/.test(t) && /falta 5,00 MT/.test(t) && /troco a mais/.test(t), 'confirmação do servidor com os valores gravados: ' + t);
    const chamada = await p.evaluate(() => window.__ch.find(c => c.rpc === 'fechar_caixa').a); assert.ok(/^[0-9a-f-]{36}$/.test(chamada.p_ref), 'cada fecho leva uma referência única'); assert.strictEqual(chamada.p_contado, 115);
    // OFFLINE: guarda como pendente, NUNCA como confirmado; ao voltar a internet envia uma só vez
    await p.evaluate(() => { window.__fechos = []; window.__ch = []; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); go('fecho'); }); await p.waitForSelector('#fcForm');
    assert.ok(/Sem internet/.test(await p.locator('#main').innerText()), 'avisa que está sem internet'); await p.fill('[name=contado]', '120'); await p.click('#fcRever'); await p.waitForSelector('.modal'); await p.click('.modal [data-ok]'); await p.waitForSelector('.toast');
    assert.ok(/não está confirmado/i.test(await p.locator('.toast').innerText()), 'mensagem: ainda não confirmado'); assert.strictEqual(await p.locator('.fecho-ok').count(), 0, 'não mostra «fechado com sucesso» sem o servidor'); assert.ok(!/Caixa fechado com sucesso/.test(await p.locator('body').innerText()));
    assert.strictEqual(await p.evaluate(() => fechosPendentes().length), 1, 'ficou pendente neste aparelho'); assert.ok(/fecho de caixa por confirmar/.test(await p.locator('#net').innerText()), 'indicador visível'); assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.rpc === 'fechar_caixa').length), 0);
    await p.waitForSelector('#fcForm'); assert.ok(await p.locator('#fcRever').isDisabled(), 'não se cria um segundo fecho enquanto há um pendente');
    const ref = await p.evaluate(() => fechosPendentes()[0].ref);
    await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); });
    await p.evaluate(async () => { await Promise.all([sincronizarFechos(), sincronizarFechos()]); await sincronizarFechos(); });   // vários disparos (reconexão + temporizador): só um envio
    const env = await p.evaluate(() => window.__ch.filter(c => c.rpc === 'fechar_caixa')); assert.strictEqual(env.length, 1, 'enviado uma só vez'); assert.strictEqual(env[0].a.p_ref, ref, 'com a mesma referência'); assert.ok(env[0].a.p_data, 'com a hora em que foi feito');
    assert.strictEqual(await p.evaluate(() => fechosPendentes().length), 0, 'pendente limpo depois da confirmação'); assert.strictEqual(await p.evaluate(() => window.__fechos.length), 1);
    // resposta perdida: o envio chega ao servidor mas a ligação cai; reenviar com a mesma referência não duplica
    await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); window.__fechos = []; window.__ch = []; const orig = window.__rpc.fechar_caixa; let n = 0; window.__rpc.fechar_caixa = a => { const r = orig(a); if (n++ === 0) return { data: null, error: { message: 'Failed to fetch' } }; return r; }; go('fecho'); });
    await p.waitForSelector('#fcForm'); await p.fill('[name=contado]', '120'); await p.click('#fcRever'); await p.waitForSelector('.modal'); await p.click('.modal [data-ok]'); await p.waitForSelector('.toast');
    await p.waitForFunction(() => fechosPendentes().length === 0 && window.__fechos.length === 1, null, { timeout: 8000 });   // a app reenvia sozinha (já há internet)
    const refs = await p.evaluate(() => window.__ch.filter(c => c.rpc === 'fechar_caixa').map(c => c.a.p_ref)); assert.ok(refs.length >= 2 && new Set(refs).size === 1, 'resposta perdida: o reenvio usa a MESMA referência (' + refs.length + ' envios)'); await p.evaluate(async () => { await sincronizarFechos(); });
    assert.strictEqual(await p.evaluate(() => window.__fechos.length), 1, 'o servidor continua com UM só fecho'); assert.strictEqual(await p.evaluate(() => fechosPendentes().length), 0);
    // servidor recusa (ex.: já fechado): o fecho fica visível com o erro e não se repete
    await p.evaluate(() => { window.__ch = []; window.__rpc.fechar_caixa = () => ({ data: null, error: { message: 'Este caixa já está fechado.' } }); enfileirarFecho('ffffffff-ffff-4fff-8fff-ffffffffffff', { contado: 5, obs: '', fundo: 0 }); });
    await p.evaluate(async () => { await sincronizarFechos(); await sincronizarFechos(); }); assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.rpc === 'fechar_caixa').length), 1, 'recusa não se repete'); assert.ok(await p.evaluate(() => fechosPendentes()[0].erro), 'erro guardado para o utilizador ver');
    assert.deepStrictEqual(erros, []); await ctx.close();
  } finally { await b.close(); s.close(); }
});

test('fechos de caixa (dono): histórico, quem fechou, detalhe, reabrir com motivo; gerente e caixa não têm o histórico geral', { skip: !chromium && 'playwright indisponível', timeout: 180000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch();
  const f = (id, uid, nome, fim, dif, estado) => ({ id, usuario_id: uid, usuario_nome: nome, caixa_nome: 'Caixa de ' + nome, inicio: fim, fim, n_vendas: 2, total_vendido: 100, dinheiro: 60, outros: 40, fiado: 0, recebimentos_dinheiro: 0, por_metodo: { 'Numerário': 60, 'e-Mola': 40 }, n_anuladas: 0, total_anuladas: 0, fundo_inicial: 0, esperado: 60, contado: 60 + dif, diferenca: dif, obs: dif ? 'conferir' : null, estado: estado || 'fechado', reaberto_em: null, reaberto_por: null, reaberto_motivo: null });
  try {
    const { ctx, p, erros } = await abrir(b, url, 'dono');
    await p.evaluate(([a, b2, c]) => { window.__T.caixa_fechos = () => [a, b2, c]; window.__rpc.produtos_loja = () => ({ data: [], error: null }); window.__rpc.lotes_loja = () => ({ data: [], error: null }); window.__rpc.reabrir_caixa = x => ({ data: null, error: null }); }, [f('f3', 'ua', 'Ana', '2026-11-01T18:00:00Z', -5), f('f2', 'ub', 'Beto', '2026-11-01T17:00:00Z', 0), f('f1', 'ua', 'Ana', '2026-10-31T18:00:00Z', 2)]);
    await p.evaluate(async () => { await carregarLoja(); shell(navLoja()); go('fechos'); }); await p.waitForSelector('#fTab table');
    assert.strictEqual(await p.locator('#fTab tbody tr').count() >= 3, true); const t = await p.locator('#fTab').innerText(); assert.ok(/Ana/.test(t) && /Beto/.test(t) && /falta 5,00 MT/.test(t) && /excesso 2,00 MT/.test(t) && /sem diferença/.test(t), 'histórico com quem fechou e diferenças');
    await p.selectOption('#fQuem', 'ub'); assert.strictEqual((await p.locator('#fTab tr:has(button)').count()), 1, 'filtro por funcionário');
    await p.selectOption('#fQuem', ''); await p.click('#fTab button[data-f="f1"]'); await p.waitForSelector('.modal'); assert.strictEqual(await p.locator('#fReab').count(), 0, 'só o fecho MAIS RECENTE de cada caixa se reabre'); await p.click('.modal [data-x]');
    await p.click('#fTab button[data-f="f3"]'); await p.waitForSelector('#fReab'); await p.click('#fReab'); await p.waitForSelector('[name=motivo]'); await p.click('.modal [data-ok]'); await p.waitForTimeout(250);
    assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.rpc === 'reabrir_caixa').length), 0, 'sem motivo não reabre'); await p.fill('[name=motivo]', 'faltou um recebimento'); await p.click('.modal [data-ok]'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => window.__ch.find(c => c.rpc === 'reabrir_caixa')); assert.ok(r && r.a.p_fecho === 'f3' && r.a.p_motivo === 'faltou um recebimento', 'reabertura com motivo');
    // nenhuma escrita direta na tabela de fechos (só pelas funções do servidor)
    assert.strictEqual(await p.evaluate(() => window.__ch.filter(c => c.tab === 'caixa_fechos' && (c.upd || c.ins || c.del)).length), 0, 'a app nunca escreve diretamente em caixa_fechos');
    assert.ok(/fechos de caixa/i.test(await p.locator('#nav').innerText()), 'dono: menu «Fechos de caixa»'); assert.deepStrictEqual(erros, []); await ctx.close();
    const g = await abrir(b, url, 'gerente'); await g.p.evaluate(() => { window.__rpc.produtos_loja = () => ({ data: [], error: null }); window.__rpc.lotes_loja = () => ({ data: [], error: null }); shell(navLoja()); });
    const nav = await g.p.locator('#nav').innerText(); assert.ok(/Fechar caixa/.test(nav) && !/Fechos de caixa/.test(nav), 'gerente: fecha o seu caixa mas não tem o histórico geral'); await g.ctx.close();
    const c = await abrir(b, url, 'caixa'); await c.p.evaluate(() => { shell(navLoja()); }); const nav2 = await c.p.locator('#nav').innerText(); assert.ok(/Fechar caixa/.test(nav2) && !/Fechos de caixa/.test(nav2) && !/Despesas|Relatórios|Equipa/.test(nav2), 'caixa: botão de fechar caixa e nada administrativo'); await c.ctx.close();
  } finally { await b.close(); s.close(); }
});

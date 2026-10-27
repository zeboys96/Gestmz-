// Barra de navegação inferior em vários tamanhos de ecrã, papéis e áreas seguras (Chromium + cliente Supabase simulado).
// É uma SIMULAÇÃO de ecrãs: não substitui testes em telefones Android reais.
const test = require('node:test'); const assert = require('node:assert');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { /* sem playwright */ }
const WWW = path.join(__dirname, '..', 'www');
const FAKE = `(function(){const sbf={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},rpc:async()=>({data:'fechada',error:null}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},from:()=>new Proxy({},{get:()=>function(){return this}})};window.supabase={createClient:()=>sbf};})();`;
const srv = () => http.createServer((req, res) => { const u = req.url.split('?')[0]; if (u === '/supabase.js') { res.setHeader('content-type', 'text/javascript'); return res.end(FAKE); }
  const f = path.join(WWW, u === '/' ? 'index.html' : u); if (!f.startsWith(WWW) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.end(fs.readFileSync(f)); });
const TAMANHOS = [[320, 568], [360, 640], [360, 780], [375, 667], [390, 844], [412, 915], [430, 932], [480, 800], [600, 960], [740, 360], [899, 700], [900, 700], [901, 700], [1024, 768], [1280, 800]];
test('barra inferior: visível, não cortada, sem tapar conteúdo (tamanhos × papéis × áreas seguras)', { skip: !chromium && 'playwright indisponível', timeout: 240000 }, async () => {
  const s = srv(); await new Promise(r => s.listen(0, r)); const url = 'http://127.0.0.1:' + s.address().port + '/'; const b = await chromium.launch(); const falhas = [];
  try {
    for (const [w, h] of TAMANHOS) for (const papel of ['dono', 'caixa']) for (const sab of [0, 34]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: w < 900 }); const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message));
      await p.goto(url); await p.waitForSelector('#f');
      await p.addStyleTag({ content: `:root{--sab:${sab}px !important}` });
      await p.evaluate(pp => { S.perfil = { papel: pp, nome: 'Teste', id: 'x' }; S.loja = { nome: 'Loja' }; shell(navLoja()); $('#main').innerHTML = '<div style="height:3000px" id="fim">conteúdo</div>'; window.scrollTo(0, 99999); }, papel);
      const m = await p.evaluate(() => { const r = e => e.getBoundingClientRect(); const side = r($('.side')); const bt = [...document.querySelectorAll('#nav button')].map(x => ({ r: r(x), t: x.textContent.trim() }));
        const fim = r($('#fim')); return { vh: innerHeight, vw: innerWidth, side, bt, fimBottom: fim.bottom, sw: document.documentElement.scrollWidth }; });
      const id = `${w}x${h} ${papel} sab=${sab}`;
      if (erros.length) falhas.push(id + ': erros JS ' + erros);
      if (w <= 900) {
        if (Math.abs(m.side.bottom - m.vh) > 1) falhas.push(`${id}: a barra não está colada ao fundo (${m.side.bottom} vs ${m.vh})`);
        if (m.side.height < 62 + sab - 1) falhas.push(`${id}: barra baixa demais (${m.side.height})`);
        const util = m.side.bottom - sab; const cort = m.bt.filter(x => x.r.height < 40 || x.r.bottom > util + 1 || x.r.top < m.side.top - 1);
        if (cort.length) falhas.push(`${id}: botões cortados/sobrepostos à área do sistema: ${cort.map(x => x.t).join(',')}`);
        if (m.bt[0].r.left < -1 || m.bt[0].r.right > m.vw + 1) falhas.push(`${id}: o primeiro botão não está visível`);
        if (m.fimBottom > m.side.top + 1 && m.fimBottom - m.side.top > 1) falhas.push(`${id}: a barra tapa o fim do conteúdo (${m.fimBottom} > ${m.side.top})`);
        if (m.sw > m.vw + 1) falhas.push(`${id}: scroll horizontal da página (${m.sw} > ${m.vw})`);
      } else {
        if (m.side.left !== 0 || m.side.width < 200) falhas.push(`${id}: menu lateral inesperado ${JSON.stringify(m.side)}`);
      }
      await ctx.close();
    }
  } finally { await b.close(); s.close(); }
  assert.deepStrictEqual(falhas, []);
});

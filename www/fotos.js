'use strict';
/* GestMZ — fotografias dos produtos.
   Guardadas no Supabase Storage (contentor privado "produtos-fotos"), nunca nas tabelas. Cada produto tem duas versões:
   miniatura (≈160 px, para listas e ecrã de vendas) e grande (≈960 px, só quando é preciso ver melhor).
   Caminho: <loja>/<produto>/<versão>-t.jpg e <versão>-f.jpg. A versão muda a cada fotografia nova, por isso a cache nunca fica desatualizada.
   Uma fotografia nunca impede uma venda: tudo aqui é assíncrono e, se falhar, aparece a imagem padrão. */

const FOTO_BUCKET = 'produtos-fotos', FOTO_CACHE = 'gestmz-fotos-v1';
const FOTO_MAX_ORIGINAL = 25 * 1024 * 1024;    // máximo antes de comprimir (fotografia de câmara)
const FOTO_MAX_FINAL = 280 * 1024;             // o contentor recusa acima de 300 KB
const FOTO_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const FOTO_PADRAO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#E3ECE8"/><path d="M32 14 16 22v20l16 8 16-8V22z" fill="none" stroke="#7C9187" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 22l16 8 16-8M32 30v20" fill="none" stroke="#7C9187" stroke-width="2.4" stroke-linejoin="round"/></svg>');
const FOTO_ESPERA = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#EEF3F1"/></svg>');
const FOTO_TIMEOUT = 15000;
const fotoMem = new Map();      // caminho → endereço (objectURL) já pronto
const fotoVoo = new Map();      // caminho → promessa em curso (evita descarregar duas vezes a mesma)
const fotoFalhou = new Map();   // caminho → quando falhou (não insiste a cada desenho; tenta de novo passado 1 minuto)
const fotoEstat = { descargas: 0, cache: 0, falhas: 0 };   // só para testes e diagnóstico
let fotoFila = [], fotoAtivos = 0, fotoObs = null;
const FOTO_PARALELO = 3;

const fotoCaminho = (p, tipo) => (p && p.foto_ver && S.loja ? `${S.loja.id}/${p.id}/${p.foto_ver}-${tipo}.jpg` : '');

function fotoComTempo(promessa, ms) {
  return new Promise((ok, no) => { const t = setTimeout(() => no(new Error('A fotografia demorou demasiado.')), ms); promessa.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); }); });
}
function fotoNaFila(tarefa) {   // no máximo FOTO_PARALELO descargas ao mesmo tempo, para não afogar uma ligação lenta
  return new Promise((ok, no) => { fotoFila.push({ tarefa, ok, no }); fotoAvancar(); });
}
function fotoAvancar() {
  while (fotoAtivos < FOTO_PARALELO && fotoFila.length) {
    const x = fotoFila.shift(); fotoAtivos++;
    x.tarefa().then(x.ok, x.no).finally(() => { fotoAtivos--; fotoAvancar(); });
  }
}
/* Devolve um endereço utilizável num <img>. Ordem: memória → cache do aparelho → rede (com a sessão do utilizador). */
async function fotoUrl(caminho) {
  if (!caminho) throw new Error('sem fotografia');
  if (fotoMem.has(caminho)) return fotoMem.get(caminho);
  const f0 = fotoFalhou.get(caminho); if (f0 && Date.now() - f0 < 60000) throw new Error('fotografia indisponível');
  if (fotoVoo.has(caminho)) return fotoVoo.get(caminho);
  const chave = 'https://fotos.gestmz.local/' + caminho;
  const p = (async () => {
    let blob = null;
    try { if (window.caches) { const c = await caches.open(FOTO_CACHE), r = await c.match(chave); if (r) { blob = await r.blob(); fotoEstat.cache++; } } } catch (e) { /* sem cache */ }
    if (!blob) {
      const r = await fotoNaFila(() => fotoComTempo(sb.storage.from(FOTO_BUCKET).download(caminho), FOTO_TIMEOUT));
      if (!r || r.error || !r.data) throw new Error('fotografia indisponível');
      blob = r.data; fotoEstat.descargas++;
      try { if (window.caches) { const c = await caches.open(FOTO_CACHE); await c.put(chave, new Response(blob, { headers: { 'content-type': 'image/jpeg' } })); } } catch (e) { /* cache cheia: segue sem */ }
    }
    const u = URL.createObjectURL(blob); fotoMem.set(caminho, u); return u;
  })();
  fotoVoo.set(caminho, p);
  try { return await p; } catch (e) { fotoFalhou.set(caminho, Date.now()); fotoEstat.falhas++; throw e; } finally { fotoVoo.delete(caminho); }
}
async function fotoLimpar() {
  fotoMem.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* ok */ } }); fotoMem.clear(); fotoFalhou.clear(); fotoFila = [];
  try { if (window.caches) await caches.delete(FOTO_CACHE); } catch (e) { /* ok */ }
}

/* <img> com imagem temporária; a verdadeira só é pedida quando o elemento está perto do ecrã (lazy loading). */
function fotoImg(p, tipo, cls) {
  tipo = tipo || 't'; const c = fotoCaminho(p, tipo);
  return `<img class="pfoto ${cls || ''}" src="${c ? FOTO_ESPERA : FOTO_PADRAO}" ${c ? `data-foto="${esc(c)}"` : ''} alt="" width="48" height="48" loading="lazy" decoding="async">`;
}
function fotosObservar(raiz) {
  const imgs = $$('img[data-foto]', raiz || document); if (!imgs.length) return;
  const carregar = img => {
    const c = img.dataset.foto; if (!c || img.dataset.estado) return; img.dataset.estado = 'a';
    fotoUrl(c).then(u => { if (img.isConnected) { img.src = u; img.dataset.estado = 'ok'; img.classList.add('pronta'); } })
      .catch(() => { img.src = FOTO_PADRAO; img.dataset.estado = 'erro'; });   // falhou: imagem padrão; a venda segue
  };
  if (!('IntersectionObserver' in window)) { imgs.forEach(carregar); return; }
  if (!fotoObs) fotoObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fotoObs.unobserve(e.target); carregar(e.target); } }), { rootMargin: '160px' });
  imgs.forEach(i => { if (!i.dataset.estado) fotoObs.observe(i); });
}
/* ecrã de vendas ao ler um código: mostra já a miniatura (se estiver em memória/cache) e troca pela grande quando chega (carregamento progressivo) */
function fotoProgressiva(img, p) {
  if (!img || !p) return;
  const t = fotoCaminho(p, 't'), f = fotoCaminho(p, 'f'); if (!t) { img.src = FOTO_PADRAO; return; }
  img.src = FOTO_ESPERA;
  fotoUrl(t).then(u => { if (img.isConnected) img.src = u; }).catch(() => { if (img.isConnected) img.src = FOTO_PADRAO; });
  fotoUrl(f).then(u => { if (img.isConnected) { img.src = u; img.classList.add('pronta'); } }).catch(() => { /* fica a miniatura ou a imagem padrão */ });
}

/* ---------- preparar a fotografia antes de enviar (comprimir e redimensionar) ---------- */
function fotoValidar(file) {
  if (!file) throw new Error('Escolha uma fotografia.');
  const t = String(file.type || '').toLowerCase();
  if (t && !FOTO_TIPOS.includes(t) && !/^image\/(heic|heif)$/.test(t)) throw new Error('Formato não suportado. Use uma fotografia JPEG, PNG ou WebP.');
  if (!t && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '')) throw new Error('Formato não suportado. Use uma fotografia JPEG, PNG ou WebP.');
  if (file.size > FOTO_MAX_ORIGINAL) throw new Error('A fotografia é demasiado grande (máx. 25 MB).');
}
function fotoDesenhar(file, max) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)), w = Math.max(1, Math.round((img.naturalWidth || img.width) * k)), h = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); ok(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('Não foi possível ler esta fotografia. Tente outra.')); };
    img.src = url;
  });
}
const fotoParaBlob = (c, q) => new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('Não foi possível comprimir a fotografia.')), 'image/jpeg', q));
/* devolve { t: miniatura, f: grande, ... } já comprimidas; baixa a qualidade até caber no limite */
async function fotoPreparar(file) {
  fotoValidar(file);
  const gF = await fotoDesenhar(file, 960), gT = await fotoDesenhar(file, 160);
  let q = .82, f = await fotoParaBlob(gF, q);
  while (f.size > FOTO_MAX_FINAL && q > .35) { q -= .1; f = await fotoParaBlob(gF, q); }
  const t = await fotoParaBlob(gT, .72);
  if (f.size > FOTO_MAX_FINAL) throw new Error('Não foi possível reduzir esta fotografia o suficiente. Tente outra.');
  return { t, f, wF: gF.width, hF: gF.height, wT: gT.width, hT: gT.height, original: file.size };
}
/* envia as duas versões e só depois aponta o produto para elas (se algo falhar, o produto continua como estava) */
async function fotoEnviar(pid, prep, antiga) {
  if (!S.loja) throw new Error('Sem loja.');
  const ver = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), base = `${S.loja.id}/${pid}/${ver}`;
  const up = (suf, b) => sb.storage.from(FOTO_BUCKET).upload(`${base}-${suf}.jpg`, b, { contentType: 'image/jpeg', upsert: false });
  const erro1 = e => new Error(/not found|bucket/i.test(String(e && e.message)) ? 'As fotografias ainda não estão disponíveis neste servidor.' : /row-level|policy|unauthor/i.test(String(e && e.message)) ? 'Só o dono da loja pode guardar fotografias.' : 'Não foi possível enviar a fotografia: ' + ((e && e.message) || 'erro'));
  let r = await up('t', prep.t); if (r.error) throw erro1(r.error);
  r = await up('f', prep.f); if (r.error) { await sb.storage.from(FOTO_BUCKET).remove([`${base}-t.jpg`]).catch(() => { }); throw erro1(r.error); }
  try { await q(sb.from('produtos').update({ foto_ver: ver }).eq('id', pid)); }
  catch (e) { await sb.storage.from(FOTO_BUCKET).remove([`${base}-t.jpg`, `${base}-f.jpg`]).catch(() => { }); throw e; }
  if (antiga) fotoApagarFicheiros(pid, antiga);
  return ver;
}
function fotoApagarFicheiros(pid, ver) {   // melhor esforço: ficheiros que já não são usados
  const b = `${S.loja.id}/${pid}/${ver}`; return sb.storage.from(FOTO_BUCKET).remove([`${b}-t.jpg`, `${b}-f.jpg`]).then(() => { }, () => { });
}
async function fotoRemover(pid, ver) {
  await q(sb.from('produtos').update({ foto_ver: null }).eq('id', pid));
  if (ver) fotoApagarFicheiros(pid, ver);
}

/* ---------- campo de fotografia no formulário do produto (só o dono) ---------- */
/* devolve { html, ligar(form), estado() } — estado(): { acao: 'nada' | 'nova' | 'remover', prep } */
function campoFoto(p) {
  const est = { acao: 'nada', prep: null, prevUrl: '' };
  const html = `<div class="field fotocampo"><span class="lbl">Fotografia do produto (opcional)</span>
    <div class="fotorow"><img id="fprev" class="pfoto grande" src="${p && p.foto_ver ? FOTO_ESPERA : FOTO_PADRAO}" alt="Pré-visualização da fotografia" width="96" height="96">
    <div class="fotobtn"><button type="button" class="btn ghost sm" id="fcam">${ico('camera', 18)} Tirar fotografia</button><button type="button" class="btn ghost sm" id="fgal">${ico('foto', 18)} Escolher da galeria</button><button type="button" class="btn ghost sm" id="frem" ${p && p.foto_ver ? '' : 'hidden'}>Remover</button></div></div>
    <input type="file" id="fin-cam" accept="image/*" capture="environment" hidden><input type="file" id="fin-gal" accept="image/jpeg,image/png,image/webp,image/*" hidden>
    <span class="hint" id="finfo">A fotografia é reduzida automaticamente antes de ser guardada.</span><span class="ferr" id="ferr" role="alert"></span></div>`;
  const ligar = f => {
    const prev = $('#fprev', f), info = $('#finfo', f), er = $('#ferr', f), rem = $('#frem', f);
    if (p && p.foto_ver) fotoUrl(fotoCaminho(p, 't')).then(u => { if (est.acao === 'nada' && prev.isConnected) prev.src = u; }).catch(() => { if (est.acao === 'nada' && prev.isConnected) prev.src = FOTO_PADRAO; });
    const escolher = async file => {
      er.textContent = ''; if (!file) return;
      info.textContent = 'A preparar a fotografia…';
      try {
        const prep = await fotoPreparar(file); est.acao = 'nova'; est.prep = prep;
        if (est.prevUrl) URL.revokeObjectURL(est.prevUrl); est.prevUrl = URL.createObjectURL(prep.f); prev.src = est.prevUrl; prev.classList.add('pronta'); rem.hidden = false;
        info.textContent = `Pronta: ${Math.round(prep.f.size / 1024)} KB (original ${(prep.original / 1048576).toFixed(1)} MB). Toque em «Guardar produto» para a enviar.`;
      } catch (e) { er.textContent = e.message; info.textContent = ''; }
    };
    $('#fcam', f).onclick = () => $('#fin-cam', f).click();
    $('#fgal', f).onclick = () => $('#fin-gal', f).click();
    $('#fin-cam', f).onchange = e => { escolher(e.target.files[0]); e.target.value = ''; };
    $('#fin-gal', f).onchange = e => { escolher(e.target.files[0]); e.target.value = ''; };
    rem.onclick = () => { est.acao = p && p.foto_ver ? 'remover' : 'nada'; est.prep = null; if (est.prevUrl) { URL.revokeObjectURL(est.prevUrl); est.prevUrl = ''; } prev.src = FOTO_PADRAO; prev.classList.remove('pronta'); rem.hidden = true; info.textContent = est.acao === 'remover' ? 'A fotografia será removida ao guardar.' : 'A fotografia é reduzida automaticamente antes de ser guardada.'; er.textContent = ''; };
  };
  return { html, ligar, estado: () => est };
}

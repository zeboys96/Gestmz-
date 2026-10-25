'use strict';
/* GestMZ — núcleo: utilitários, entrada, estrutura e ligação ao Supabase */
var CFG = Object.assign({ SUPABASE_URL: '', SUPABASE_KEY: '', STAFF_DOMAIN: 'gestmz.app' }, window.GESTMZ_CONFIG || {});
const PAGAMENTOS = ['Numerário', 'M-Pesa', 'e-Mola', 'mKesh', 'Cartão/POS', 'Transferência', 'Fiado'];
const PAPEL = { super: 'Dono do sistema', dono: 'Dono da loja', gerente: 'Gerente', caixa: 'Caixa' };
const TIPOS_LOJA = ['Mercearia', 'Supermercado', 'Minimercado / Cantina', 'Farmácia', 'Clínica / Posto de saúde', 'Padaria e pastelaria', 'Restaurante / Bar', 'Papelaria', 'Cosméticos e beleza', 'Roupa e calçado', 'Electrónicos e telemóveis', 'Material de construção', 'Outro'];
const eSaude = t => ['Farmácia', 'Clínica / Posto de saúde'].includes(t);
const UNIDADES = ['un', 'pacote', 'caixa', 'kg', 'g', 'litro', 'ml', 'par', 'dúzia', 'saco'];

const ICONS = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  vender: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
  vendas: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  produtos: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  clientes: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  despesas: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  relatorios: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  equipa: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c3 0 5 1.5 5 4.5"/>',
  assinatura: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  registo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  conta: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  lojas: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18"/><path d="M9 20v-6h6v6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  barcode: '<path d="M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M20 5v14"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'
};
const ico = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const logo = (s = 36) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#F4B400"/><rect x="10" y="26" width="7" height="12" rx="2" fill="#00453A"/><rect x="20.5" y="18" width="7" height="20" rx="2" fill="#00453A"/><rect x="31" y="9" width="7" height="29" rx="2" fill="#00453A"/></svg>`;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mt = n => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0) + ' MT';
const ymd = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fd = v => { if (!v) return '—'; const p = String(v).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
const fdt = v => new Date(v).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fh = v => new Date(v).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const r2 = n => Math.round(n * 100) / 100;
const diasPara = v => Math.round((new Date(v + 'T00:00:00') - new Date(ymd() + 'T00:00:00')) / 864e5);
const nvenda = v => v.num == null ? 'por enviar' : 'V-' + String(v.num).padStart(5, '0');
const inicial = n => (String(n || '?').trim()[0] || '?').toUpperCase();
const avatar = (p, c = '') => p && p.foto ? `<img class="avatar ${c}" src="${esc(p.foto)}" alt="">` : `<span class="avatar ${c}">${esc(inicial(p && p.nome))}</span>`;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } };

let sb = null, S = { perfil: null, loja: null, plat: null, cats: [], produtos: [], clientes: [], equipa: [] };
let cur = '', cart = [], canais = [], hb = null, poll = null;
const VIEWS = {};

/* ---------- mensagens ---------- */
function traduz(m) {
  m = String(m || '');
  const t = [
    [/failed to fetch|networkerror|load failed|network request failed|fetch failed/i, 'Sem ligação à internet.'],
    [/Invalid login credentials/i, 'Utilizador ou senha incorrectos.'],
    [/User already registered|already been registered/i, 'Este utilizador já existe. Escolha outro nome ou e-mail.'],
    [/Password should be at least/i, 'A senha deve ter pelo menos 6 caracteres.'],
    [/Unable to validate email|invalid format|is invalid/i, 'O e-mail não é válido.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Sem ligação à internet. Verifique os dados móveis ou o Wi-Fi e tente de novo.'],
    [/row-level security|permission denied/i, 'Não tem permissão para esta acção.'],
    [/duplicate key.*codigo/i, 'Já existe um produto com este código de barras.'],
    [/duplicate key/i, 'Já existe um registo igual.'],
    [/email rate limit|rate limit/i, 'Demasiados pedidos. Espere um minuto e tente de novo.'],
    [/JWT expired/i, 'A sessão expirou. Entre de novo.']
  ];
  for (const [re, txt] of t) if (re.test(m)) return txt;
  return m;
}
async function q(p) {
  const { data, error } = await p;
  if (error) throw new Error(traduz(error.message));
  return data;
}
async function all(build) {
  let out = [], from = 0;
  for (;;) {
    const d = await q(build().range(from, from + 999));
    out = out.concat(d || []);
    if (!d || d.length < 1000) break;
    from += 1000;
  }
  return out;
}
function toast(t, bad) {
  $$('.toast').forEach(x => x.remove());
  const e = document.createElement('div'); e.className = 'toast' + (bad ? ' bad' : ''); e.setAttribute('role', 'status'); e.textContent = t;
  document.body.appendChild(e); setTimeout(() => e.remove(), bad ? 4200 : 2800);
}
const erro = e => toast(e && e.message ? e.message : String(e), true);

/* ---------- janelas ---------- */
function modal(title, body, o = {}) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="box ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="mh"><b>${title}</b><button type="button" class="x" data-x aria-label="Fechar">✕</button></div><form class="mb" autocomplete="off">${body}<div class="mf"><button type="button" class="btn ghost" data-x>${o.cancelText || (o.onOk ? 'Cancelar' : 'Fechar')}</button>${o.onOk ? `<button class="btn ${o.danger ? 'red' : ''}" data-ok>${o.okText || 'Guardar'}</button>` : ''}</div></form></div>`;
  document.body.appendChild(m);
  let fechado = false;
  const close = () => { if (fechado) return; fechado = true; m.remove(); if (o.onClose) o.onClose(); };
  $$('[data-x]', m).forEach(b => b.onclick = close);
  m.addEventListener('mousedown', e => { if (e.target === m && !o.sticky) close(); });
  const f = $('form', m);
  f.onsubmit = async e => {
    e.preventDefault();
    if (!o.onOk) return;
    const b = $('[data-ok]', m), old = b.textContent; b.disabled = true; b.textContent = 'Um momento…';
    try {
      const r = await o.onOk(Object.fromEntries(new FormData(f)), f, m);
      if (r !== false) { o.keepOnClose ? (fechado = true, m.remove()) : close(); } else { b.disabled = false; b.textContent = old; }
    } catch (err) { erro(err); b.disabled = false; b.textContent = old; }
  };
  const first = $('input:not([type=hidden]):not([type=checkbox]),select', f); if (first && !o.noFocus && !matchMedia('(pointer:coarse)').matches) setTimeout(() => { try { first.focus(); } catch (e) { /* ok */ } }, 30);
  return { m, f, close };
}
function ask(msg, fn, txt, danger) { return modal('Confirmar', `<p>${esc(msg)}</p>`, { okText: txt || 'Confirmar', danger, onOk: async () => { await fn(); } }); }
const fld = (l, n, v, t, x, hint) => `<label>${l}<input class="in" name="${n}" type="${t || 'text'}" value="${esc(v == null ? '' : v)}" ${x || ''}>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
const opts = (arr, sel) => arr.map(a => { const v = Array.isArray(a) ? a[0] : a, t = Array.isArray(a) ? a[1] : a; return `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
async function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  try {
    const f = new File([blob], name, { type: type || 'text/plain' });
    if (/Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function imprimir(html) { $('#recibo').innerHTML = html; window.print(); }
function imgToData(file, max, quality, square) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height, sx = 0, sy = 0, sw = w, sh = h;
      if (square) { const s = Math.min(w, h); sx = (w - s) / 2; sy = (h - s) / 2; sw = sh = s; w = h = Math.min(s, max); }
      else { const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}
function bip() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .08; o.start(); setTimeout(() => { o.stop(); a.close(); }, 180); } catch (e) { /* sem som */ } }

/* ---------- câmara (ler código de barras) ---------- */
async function lerCamera(onCode) {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) return toast('Este navegador não lê códigos pela câmara. Use um leitor USB/Bluetooth ou escreva o código.', true);
  let det; try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] }); } catch (e) { return toast('Leitura por câmara indisponível neste aparelho.', true); }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch (e) { return toast('Permita o acesso à câmara para ler códigos.', true); }
  const w = document.createElement('div'); w.className = 'cam';
  w.innerHTML = '<video playsinline muted></video><div class="cb"><span>Aponte para o código de barras</span><button class="btn ghost" type="button">Fechar</button></div>';
  document.body.appendChild(w);
  const v = $('video', w); v.srcObject = stream; await v.play().catch(() => { });
  let vivo = true; const fim = () => { vivo = false; stream.getTracks().forEach(t => t.stop()); w.remove(); };
  $('button', w).onclick = fim;
  (async function loop() {
    while (vivo) {
      try { const r = await det.detect(v); if (r.length) { const c = r[0].rawValue; fim(); if (navigator.vibrate) navigator.vibrate(60); onCode(c); return; } } catch (e) { /* tenta de novo */ }
      await new Promise(r => setTimeout(r, 250));
    }
  })();
}

/* ---------- entrada ---------- */
function authShell(inner) {
  $('#app').innerHTML = `<div class="auth"><aside class="auth-art"><div class="art-in">${logo(46)}<h1>GestMZ</h1><p>Gestão empresarial de comércios em Moçambique.</p><ul><li>Vendas, stock e validades num só lugar</li><li>Cada loja vê apenas os seus dados</li><li>Funciona no telemóvel e no computador</li></ul></div></aside><main class="auth-main"><div class="auth-card">${inner}</div></main></div>`;
}

function vFalta() {
  authShell(`<h2>Falta ligar o banco de dados</h2><p>Abra o ficheiro <b>config.js</b> e cole a chave pública do Supabase no campo <b>SUPABASE_KEY</b>. Depois volte a abrir esta página.</p><p class="muted small">O passo a passo está no ficheiro LEIA-ME.md.</p>`);
}
function vErro(msg) {
  authShell(`<h2>Algo correu mal</h2><div class="msg bad">${esc(msg)}</div><button class="btn block" id="t">Tentar de novo</button><button class="link" id="s">Sair</button>`);
  $('#t').onclick = () => entrar(); $('#s').onclick = sair;
}
async function vLogin(msg) {
  let temSuper = true; try { const { data } = await sb.rpc('existe_super'); temSuper = !!data; } catch (e) { /* offline */ }
  authShell(`<h2>Entrar</h2>${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
    <form id="f">${fld('E-mail', 'e', lsGet('gestmz_email') || '', 'email', 'required autocapitalize="none" autocomplete="username" inputmode="email"')}${fld('Senha', 'p', '', 'password', 'required autocomplete="current-password"')}
    <button class="btn block" id="go">Entrar</button></form>
    <p class="muted small" style="text-align:center;margin:16px 0 0">O acesso é dado pelo administrador do GestMZ (lojas) ou pelo dono da loja (funcionários).</p>
    ${!temSuper ? '<div style="margin-top:10px;text-align:center"><button class="link" id="sup">Configurar o dono do sistema</button></div>' : ''}`);
  $('#f').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), b = $('#go'); b.disabled = true; b.textContent = 'A entrar…';
    try {
      lsSet('gestmz_email', d.e.trim());
      const { error } = await sb.auth.signInWithPassword({ email: d.e.trim(), password: d.p });
      if (error) throw new Error(traduz(error.message));
      await entrar();
    } catch (err) { erro(err); b.disabled = false; b.textContent = 'Entrar'; }
  };
  const s = $('#sup'); if (s) s.onclick = vSetupSuper;
}
function vSemAcesso() {
  authShell(`<h2>Sem acesso</h2><div class="msg">Esta conta ainda não foi activada no GestMZ. Peça ao administrador (ou ao dono da loja) para lhe dar acesso.</div><button class="btn block" id="s">Sair</button>`);
  $('#s').onclick = sair;
}
/* Funcionários (gerente/caixa): depois do e-mail e senha, confirmam-se com o código de acesso dado pelo responsável. */
function vPin(perfil, loja) {
  authShell(`<div style="text-align:center">${avatar(perfil, 'lg')}<h2 style="margin:10px 0 2px">${esc(perfil.nome)}</h2>
    <div class="muted">${PAPEL[perfil.papel]} · ${esc(loja.nome)}</div></div>
    <form id="f" style="margin-top:18px"><label>Código de acesso<input class="in pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" required placeholder="••••••" style="text-align:center;font-size:22px;letter-spacing:6px"><span class="hint">Foi-lhe dado pelo dono ou gerente da loja.</span></label>
    <button class="btn block" id="go">Aceder</button></form>
    <div style="text-align:center;margin-top:8px"><button class="link" id="v">Não sou eu · sair</button></div>`);
  $('#v').onclick = sair;
  setTimeout(() => { try { $('[name=pin]').focus(); } catch (e) { /* ok */ } }, 50);
  $('#f').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), b = $('#go'); b.disabled = true; b.textContent = 'A verificar…';
    try {
      const ok = await q(sb.rpc('verificar_pin', { p_pin: d.pin.trim() }));
      if (!ok) throw new Error('Código de acesso incorrecto.');
      guardarPinLocal(perfil.id, d.pin.trim());
      await entrar();
    } catch (err) { erro(err); b.disabled = false; b.textContent = 'Aceder'; e.target.reset(); }
  };
}
/* Primeiro acesso do lojista: dados da loja. */
function vConfigurarLoja(perfil, loja) {
  authShell(`<h2>Bem-vindo ao GestMZ</h2><p class="muted">Preencha os dados da sua loja para começar. Pode alterá-los depois em <b>Conta</b>.</p>
    <form id="f">${fld('O seu nome completo', 'dono', perfil.nome === 'Lojista' ? '' : perfil.nome, 'text', 'required autocomplete="name"')}
    ${fld('Nome da loja', 'nome', /por configurar/i.test(loja.nome) ? '' : loja.nome, 'text', 'required')}
    <label>Tipo de loja<select class="in" name="tipo">${opts(TIPOS_LOJA, loja.tipo)}</select></label>
    ${fld('Localização (cidade, bairro, rua)', 'endereco', '', 'text', 'required placeholder="Ex.: Maputo, Matola, Av. Samora Machel"')}
    <div class="row">${fld('Telefone da loja', 'tel', '', 'tel', 'placeholder="84 000 0000"')}${fld('NUIT (opcional)', 'nuit', '', 'text', 'inputmode="numeric"')}</div>
    <button class="btn block" id="go">Guardar e entrar</button></form><div style="text-align:center;margin-top:8px"><button class="link" id="v">Sair</button></div>`);
  $('#v').onclick = sair;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), b = $('#go'); b.disabled = true; b.textContent = 'A guardar…';
    try {
      await q(sb.rpc('configurar_loja', { p_dono_nome: d.dono, p_nome: d.nome, p_tipo: d.tipo, p_endereco: d.endereco, p_tel: d.tel, p_nuit: d.nuit }));
      await entrar();
    } catch (err) { erro(err); b.disabled = false; b.textContent = 'Guardar e entrar'; }
  };
}
function vSetupSuper() {
  authShell(`<h2>Dono do sistema</h2><p class="muted">Esta conta controla todas as lojas, confirma pagamentos e define os preços. Só pode ser criada uma vez.</p>
    <form id="f">${fld('O seu nome', 'nome', '', 'text', 'required')}${fld('E-mail', 'email', '', 'email', 'required autocapitalize="none"')}${fld('Senha (mínimo 6 caracteres)', 'senha', '', 'password', 'required minlength="6"')}
    <button class="btn block" id="go">Criar conta do dono do sistema</button></form><div style="text-align:center;margin-top:8px"><button class="link" id="v">Voltar</button></div>`);
  $('#v').onclick = () => vLogin();
  $('#f').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)), b = $('#go'); b.disabled = true;
    try {
      const { data, error } = await sb.auth.signUp({ email: d.email.trim(), password: d.senha });
      if (error) throw new Error(traduz(error.message));
      if (!data.session) throw new Error('Precisa de desligar "Confirm email" no Supabase (veja o LEIA-ME).');
      await q(sb.rpc('reivindicar_super', { p_nome: d.nome }));
      await entrar();
    } catch (err) { erro(err); b.disabled = false; }
  };
}
async function sair() {
  pararRT(); cart = []; limparCache();
  try { await sb.auth.signOut(); } catch (e) { /* ok */ }
  S = { perfil: null, loja: null, plat: null, cats: [], produtos: [], clientes: [], equipa: [] };
  netUpdate(); vLogin();
}

/* ---------- arranque ---------- */
async function boot() {
  if (!CFG.SUPABASE_KEY || /^COLE/.test(CFG.SUPABASE_KEY) || !window.supabase) return vFalta();
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && S.perfil) { S.perfil = null; pararRT(); vLogin('A sessão terminou. Entre de novo.'); } });
  if (!navigator.onLine && jGet('gestmz_cache', null)) return entrarOffline();
  const { data } = await sb.auth.getSession();
  if (!data || !data.session) return vLogin();
  await entrar();
}
async function entrar() {
  try {
    const { data } = await sb.auth.getSession(); if (!data.session) return vLogin();
    const r = await q(sb.from('perfis').select('*').eq('id', data.session.user.id));
    const perfil = r[0];
    if (!perfil) return vSemAcesso();
    if (!perfil.ativo) { await sb.auth.signOut(); return vLogin('Esta conta foi desativada. Fale com o dono da loja.'); }
    S.perfil = perfil;
    if (perfil.papel === 'super') { await carregarSuper(); shell(navSuper()); iniciarSuperRT(); return go('s_lojas'); }
    if (perfil.papel !== 'dono' && await q(sb.rpc('pin_exigido'))) {   // o servidor só abre os dados depois do código de acesso
      const lb = await q(sb.rpc('loja_basica'));
      if (!lb) return vSemAcesso();
      return vPin(perfil, lb);
    }
    const lj = (await q(sb.from('lojas').select('*').eq('id', perfil.loja_id)))[0];
    if (!lj) return vSemAcesso();
    if (perfil.papel === 'dono' && lj.configurada === false) return vConfigurarLoja(perfil, lj);
    await carregarLoja(); S.offline = false; shell(navLoja()); iniciarRT(); go(perfil.papel === 'caixa' ? 'pdv' : 'painel'); primeiraAjuda(); sincronizarFila(); netUpdate();
  } catch (e) { if (ehRede(e) && jGet('gestmz_cache', null)) return entrarOffline(); vErro(e.message); }
}

/* ---------- estrutura ---------- */
const NAV_LOJA = [
  ['painel', 'painel', 'Painel', 'dono,gerente'], ['pdv', 'vender', 'Vender', 'dono,gerente,caixa'], ['vendas', 'vendas', 'Vendas', 'dono,gerente,caixa'],
  ['produtos', 'produtos', 'Produtos', 'dono,gerente,caixa'], ['clientes', 'clientes', 'Clientes', 'dono,gerente,caixa'], ['despesas', 'despesas', 'Despesas', 'dono,gerente'],
  ['relatorios', 'relatorios', 'Relatórios', 'dono,gerente'], ['equipa', 'equipa', 'Equipa', 'dono,gerente'], ['assinatura', 'assinatura', 'Assinatura', 'dono'],
  ['registo', 'registo', 'Registo', 'dono,gerente'], ['suporte', 'ajuda', 'Suporte', 'dono'], ['ajuda', 'ajuda', 'Ajuda', 'dono,gerente,caixa'], ['perfil', 'conta', 'Conta', 'dono,gerente,caixa'], ['sair', 'sair', 'Sair', 'dono,gerente,caixa']
];
const navLoja = () => NAV_LOJA.filter(n => n[3].split(',').includes(S.perfil.papel));
const navSuper = () => [['s_lojas', 'lojas', 'Lojas'], ['s_pagamentos', 'assinatura', 'Pagamentos'], ['s_suporte', 'ajuda', 'Suporte'], ['s_config', 'conta', 'Preços e conta'], ['perfil', 'registo', 'Senha'], ['sair', 'sair', 'Sair']];
function shell(items) {
  const sub = S.loja ? S.loja.nome : 'Dono do sistema';
  $('#app').innerHTML = `<div class="shell"><aside class="side"><div class="brandrow">${logo(34)}<div><b>GestMZ</b><small>${esc(sub)}</small></div></div><nav id="nav" aria-label="Menu principal"></nav><div class="me">${avatar(S.perfil)}<div><b>${esc(S.perfil.nome)}</b><span>${PAPEL[S.perfil.papel]}</span></div></div></aside><div style="flex:1;min-width:0"><div id="banner"></div><main id="main"></main></div></div>`;
  $('#nav').innerHTML = items.map(n => `<button data-v="${n[0]}">${ico(n[1])}<span>${n[2]}</span><span class="badge" hidden></span></button>`).join('');
  $('#nav').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.v === 'sair') return sair(); go(b.dataset.v); };
  banner();
}
async function go(v, silencioso) {
  cur = v; $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (!silencioso) { $('#main').innerHTML = '<div class="loading">A carregar…</div>'; }
  try { await VIEWS[v](); } catch (e) { $('#main').innerHTML = `<div class="card"><div class="msg bad">${esc(e.message)}</div><button class="btn" onclick="go('${v}')">Tentar de novo</button></div>`; }
  if (!silencioso) window.scrollTo(0, 0);
}
function badge(v, n) { const b = $(`#nav button[data-v="${v}"] .badge`); if (b) { b.hidden = !n; b.textContent = n; } }

/* ---------- dados da loja ---------- */
async function carregarLoja() {
  const id = S.perfil.loja_id;
  const [lj, pl, cats, prods, lotes, cli, eq] = await Promise.all([
    q(sb.from('lojas').select('*').eq('id', id)), q(sb.from('plataforma').select('*')),
    all(() => sb.from('categorias').select('*').order('nome')),
    all(() => sb.from('produtos').select('*').eq('ativo', true).order('nome')),
    all(() => sb.from('lotes').select('*').gt('qtd', 0)),
    all(() => sb.from('clientes').select('*').order('nome')),
    all(() => sb.from('perfis').select('id,nome,usuario,papel,foto,ativo,ultimo_acesso').eq('loja_id', id).order('nome'))
  ]);
  S.loja = lj[0]; S.plat = pl[0]; S.cats = cats; S.clientes = cli; S.equipa = eq;
  S.produtos = juntar(prods, lotes); guardarCache();
}
const juntar = (prods, lotes) => prods.map(p => ({ ...p, lotes: lotes.filter(l => l.produto_id === p.id) }));
async function recarregarProdutos() {
  const [prods, lotes] = await Promise.all([all(() => sb.from('produtos').select('*').eq('ativo', true).order('nome')), all(() => sb.from('lotes').select('*').gt('qtd', 0))]);
  S.produtos = juntar(prods, lotes); guardarCache();
}
async function recarregarLoja() { const r = await q(sb.from('lojas').select('*').eq('id', S.perfil.loja_id)); S.loja = r[0]; banner(); }
const prodById = id => S.produtos.find(p => p.id === id);
const estoque = p => p.lotes.reduce((a, l) => a + l.qtd, 0);
const vendavel = p => p.lotes.filter(l => !l.validade || diasPara(l.validade) >= 0).reduce((a, l) => a + l.qtd, 0);
const proxVal = p => { const ls = p.lotes.filter(l => l.validade).sort((a, b) => a.validade.localeCompare(b.validade)); return ls[0] ? ls[0].validade : ''; };
function estado(p) {
  const ls = p.lotes.filter(l => l.validade);
  if (ls.some(l => diasPara(l.validade) < 0)) return 'expirado';
  if (ls.some(l => diasPara(l.validade) <= 90)) return 'expira';
  const e = estoque(p); if (e <= 0) return 'sem'; if (e <= p.minimo) return 'baixo'; return 'ok';
}
const ESTADO_TXT = { ok: 'Em ordem', baixo: 'Stock baixo', expira: 'A expirar', expirado: 'Expirado', sem: 'Sem stock' };
function assin() {
  const l = S.loja, d = diasPara(l.valido_ate);
  if (l.estado === 'suspensa') return { k: 'suspensa', ok: false, d, txt: 'Conta suspensa. Contacte o suporte do GestMZ.' };
  if (d < 0) return { k: 'expirada', ok: false, d, txt: 'A subscrição expirou. Só é possível consultar dados até renovar.' };
  if (l.estado === 'teste') return { k: 'teste', ok: true, d, txt: `Teste grátis: ${d === 0 ? 'termina hoje' : d === 1 ? 'falta 1 dia' : 'faltam ' + d + ' dias'}.` };
  return { k: 'ativa', ok: true, d, txt: d <= 7 ? `A subscrição termina ${d === 0 ? 'hoje' : 'em ' + d + ' dia(s)'}.` : '' };
}
function banner() {
  const el = $('#banner'); if (!el || !S.loja) return;
  const a = assin();
  if (!a.txt) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="banner ${a.ok ? '' : 'bad'}"><span>${esc(a.txt)}</span>${S.perfil.papel === 'dono' ? '<button class="btn sun" id="renovar">Renovar assinatura</button>' : '<span class="small">Peça ao dono da loja para renovar.</span>'}</div>`;
  const r = $('#renovar'); if (r) r.onclick = () => go('assinatura');
}

/* ---------- tempo real e presença ---------- */
function pararRT() {
  canais.forEach(c => { try { sb.removeChannel(c); } catch (e) { /* ok */ } }); canais = [];
  clearInterval(hb); clearInterval(poll); hb = poll = null;
}
function iniciarRT() {
  pararRT();
  const id = S.perfil.loja_id, f = 'loja_id=eq.' + id;
  const deb = fn => { let t; return () => { clearTimeout(t); t = setTimeout(fn, 700); }; };
  const stock = deb(async () => { try { await recarregarProdutos(); if (cur === 'pdv' && window.pdvLista) pdvLista(); else if (cur === 'produtos' || cur === 'painel') go(cur, true); } catch (e) { /* ok */ } });
  const vend = deb(() => { if (cur === 'painel' || cur === 'vendas') go(cur, true); });
  try {
    const ch = sb.channel('loja-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lotes', filter: f }, stock)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', filter: f }, stock)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vendas', filter: f }, vend)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'suporte_tickets', filter: f }, () => contarSuporte(true))
      .subscribe();
    canais.push(ch);
  } catch (e) { /* sem tempo real: a app continua a funcionar */ }
  const batida = () => { sb.from('perfis').update({ ultimo_acesso: new Date().toISOString() }).eq('id', S.perfil.id).then(() => { }, () => { }); };
  batida(); hb = setInterval(batida, 60000);
  if (S.perfil.papel === 'dono') { contarSuporte(false); poll = setInterval(() => contarSuporte(true), 120000); }
}
async function contarSuporte(avisar) {
  try {
    const l = await q(sb.from('suporte_tickets').select('id,nao_lido_loja').eq('nao_lido_loja', true));
    const n = l.length; if (avisar && n > (window._tkn || 0)) { bip(); toast('O GestMZ respondeu ao seu pedido de suporte.'); }
    window._tkn = n; badge('suporte', n); if (avisar && cur === 'suporte') go('suporte', true);
  } catch (e) { /* ok */ }
}

/* ---------- autorização do gerente ---------- */
async function verificarGerente(email, p, codigo) {
  const aux = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gestmz-aux' } });
  const { data, error } = await aux.auth.signInWithPassword({ email: String(email).trim(), password: p });
  if (error) throw new Error('E-mail ou senha do gerente incorrectos.');
  const r = await q(aux.from('perfis').select('id,nome,papel,loja_id,ativo').eq('id', data.user.id));
  const pf = r[0];
  if (!pf || !pf.ativo || pf.loja_id !== S.loja.id || !['gerente', 'dono'].includes(pf.papel)) { await aux.auth.signOut(); throw new Error('Esse utilizador não é gerente nem dono desta loja.'); }
  if (pf.papel === 'gerente') {   // o gerente confirma-se também com o código de acesso (o servidor só lhe abre os dados depois disso)
    let ok = false; try { ok = await q(aux.rpc('verificar_pin', { p_pin: String(codigo || '').trim() })); } catch (e) { await aux.auth.signOut(); throw e; }
    if (!ok) { await aux.auth.signOut(); throw new Error('Código de acesso do gerente incorrecto.'); }
  }
  return { aux, nome: pf.nome, fim: () => aux.auth.signOut().catch(() => { }) };
}
/* Devolve { nome, aux, fim } quando autorizado, ou null se cancelado. Gerente/dono autorizam-se a si próprios. */
function autorizar(texto, acao, detalhe) {
  if (['gerente', 'dono'].includes(S.perfil.papel)) return Promise.resolve({ nome: S.perfil.nome, aux: sb, fim: () => { } });
  return new Promise(res => {
    let dado = null;
    modal('Autorização do gerente', `<p class="muted">${esc(texto)}</p><p class="small muted">Só o gerente ou o dono podem autorizar. A acção fica registada.</p>${fld('E-mail do gerente', 'u', '', 'email', 'required autocapitalize="none"')}${fld('Senha do gerente', 'p', '', 'password', 'required')}${fld('Código de acesso do gerente (o dono não precisa)', 'c', '', 'password', 'inputmode="numeric" autocomplete="off"')}`,
      { okText: 'Autorizar', sticky: true, keepOnClose: true,
        onOk: async d => {
          const g = await verificarGerente(d.u, d.p, d.c);
          await g.aux.rpc('registar_auditoria', { p_acao: acao, p_detalhe: `${detalhe} — pedido por ${S.perfil.nome}, autorizado por ${g.nome}` });
          dado = g; res(g);
        },
        onClose: () => { if (!dado) res(null); } });
  });
}

/* ---------- ajuda: primeiro uso ---------- */
function primeiraAjuda() { const k = 'gestmz_ajuda_' + S.perfil.id; if (!lsGet(k)) { lsSet(k, '1'); if (VIEWS.ajudaSlides) VIEWS.ajudaSlides(); } }

/* campos: ao tocar, selecciona o conteúdo (números pré-preenchidos como 0 ou 10 apagam-se ao escrever) e garante que ficam visíveis acima do teclado */
document.addEventListener('focusin', e => {
  const t = e.target; if (!t || !t.matches) return;
  if (t.matches('input.in:not([type=file]):not([type=checkbox]):not([type=date]):not([type=password]),textarea.in')) { try { if (/^(decimal|numeric)$/.test(t.getAttribute('inputmode') || '') || t.type === 'number') t.select(); } catch (x) { /* ok */ } }
  if (t.matches('input,select,textarea')) setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { /* ok */ } }, 320);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);

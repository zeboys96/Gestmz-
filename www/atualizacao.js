/* GestMZ — atualizações da aplicação (Android e Windows).
   Na versão web não faz nada: o navegador já recebe sempre a versão publicada.
   A lógica de decisão (versões, requisitos, validação) está em funções puras, testadas em tests/versoes.test.js. */
(function (raiz) {
  'use strict';

  // Só se oferecem transferências que venham das Releases deste repositório.
  const PADRAO_URL = /^https:\/\/github\.com\/zeboys96\/Gestmz-\/releases\/download\/v\d+\.\d+\.\d+\/[A-Za-z0-9._-]+$/;
  const PACOTE_ANDROID = 'mz.gestmz.app';

  function lerVersao(v) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v == null ? '' : v).trim());
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  /** -1, 0, 1, ou null se alguma versão for inválida. */
  function comparar(a, b) {
    const x = lerVersao(a), y = lerVersao(b);
    if (!x || !y) return null;
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }
  /** versionCode do Android: 1.2.3 → 10203 (minor e patch têm de ser < 100). */
  function codigoDe(v) {
    const x = lerVersao(v);
    return x && x[1] < 100 && x[2] < 100 ? x[0] * 10000 + x[1] * 100 + x[2] : null;
  }

  /** Valida a entrada de uma plataforma em versions.json. Devolve texto de erro ou null. */
  function validarEntrada(e, plataforma) {
    if (!e || typeof e !== 'object') return 'entrada em falta';
    if (e.ultima === null || e.ultima === undefined) return null; // ainda sem versão publicada
    if (!lerVersao(e.ultima)) return 'versão "ultima" inválida';
    if (e.minima != null && !lerVersao(e.minima)) return 'versão "minima" inválida';
    if (e.minima != null && comparar(e.minima, e.ultima) > 0) return '"minima" é maior que "ultima"';
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(e.publicada_em || ''))) return 'data de publicação em falta';
    if (!e.url || !PADRAO_URL.test(e.url)) return 'endereço de transferência não permitido';
    if (plataforma === 'android' && !/\.apk$/i.test(e.url)) return 'o endereço Android tem de terminar em .apk';
    if (plataforma === 'windows' && !/\.exe$/i.test(e.url)) return 'o endereço Windows tem de terminar em .exe';
    if (e.url.indexOf('/v' + e.ultima + '/') < 0) return 'o endereço não corresponde à versão ' + e.ultima;
    if (e.sha256 != null && !/^[0-9a-f]{64}$/.test(e.sha256)) return 'sha256 inválido';
    if (e.notas != null && !(Array.isArray(e.notas) && e.notas.every(n => typeof n === 'string'))) return 'notas inválidas';
    return null;
  }

  /** Decide o que fazer. `sistema` = { android: 13 } ou { windows: '10.0.19045' }. */
  function decidir(o) {
    const instalada = o.instalada, e = o.entrada, sis = o.sistema || {};
    if (!lerVersao(instalada)) return { estado: 'desconhecida' };
    const erro = validarEntrada(e, o.plataforma);
    if (erro) return { estado: 'invalida', erro };
    if (e.ultima == null) return { estado: 'sem-versao' };
    if (comparar(e.ultima, instalada) <= 0) return { estado: 'atualizada', ultima: e.ultima };
    const r = e.requisitos || {};
    if (r.android_min != null && sis.android != null && sis.android < r.android_min) return { estado: 'incompativel', motivo: 'Precisa do Android ' + r.android_min + ' ou mais recente.' };
    if (r.windows_min && sis.windows) {
      const a = String(sis.windows).split('.').map(Number), b = String(r.windows_min).split('.').map(Number);
      for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) { if ((a[i] || 0) < (b[i] || 0)) return { estado: 'incompativel', motivo: 'Precisa do Windows ' + r.windows_min + ' ou mais recente.' }; break; } }
    }
    const obrig = e.minima != null && comparar(instalada, e.minima) < 0;
    return { estado: obrig ? 'obrigatoria' : 'disponivel', ultima: e.ultima, bloquear: !!(obrig && e.bloquear), notas: e.notas || [], url: e.url, sha256: e.sha256 || null, publicada_em: e.publicada_em };
  }

  function texto(d, instalada) {
    switch (d.estado) {
      case 'atualizada': return 'Está na versão mais recente (' + instalada + ').';
      case 'sem-versao': return 'Ainda não há versões publicadas para esta aplicação. Está na versão ' + instalada + '.';
      case 'disponivel': return 'Há uma versão nova: ' + d.ultima + ' (instalada: ' + instalada + ').';
      case 'obrigatoria': return 'É preciso atualizar para a versão ' + d.ultima + ' (instalada: ' + instalada + ').';
      case 'incompativel': return 'Há uma versão nova, mas este aparelho não é compatível. ' + (d.motivo || '');
      case 'invalida': return 'A informação de versões não está correta. Tente mais tarde.';
      case 'desconhecida': return 'Não foi possível saber que versão está instalada.';
      default: return 'Não foi possível verificar.';
    }
  }

  const api = { PADRAO_URL, PACOTE_ANDROID, lerVersao, comparar, codigoDe, validarEntrada, decidir, texto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!raiz.document) return; // execução em Node (testes): sem interface

  /* ---------------- interface (só dentro da app Android ou Windows) ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ADIAR_K = 'gestmz_upd_adiado', DOZE_H = 12 * 3600 * 1000, UM_DIA = 24 * 3600 * 1000;

  function plataforma() {
    if (raiz.gestmzDesktop) return 'windows';
    try { const C = raiz.Capacitor; if (C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'android') return 'android'; } catch (e) { /* web */ }
    return null;
  }
  async function infoInstalada(p) {
    if (p === 'windows') { const i = await raiz.gestmzDesktop.info(); return { versao: i.versao, sistema: { windows: i.sistema } }; }
    const P = (raiz.Capacitor && raiz.Capacitor.Plugins) || {};
    if (!P.App || !P.App.getInfo) throw new Error('sem-plugin');
    const i = await P.App.getInfo();
    if (i.id && i.id !== PACOTE_ANDROID) throw new Error('pacote');
    const m = /Android\s+(\d+)/i.exec(navigator.userAgent || '');
    return { versao: i.version, sistema: { android: m ? +m[1] : null } };
  }
  async function buscarVersoes() {
    const base = raiz.GESTMZ_CONFIG && raiz.GESTMZ_CONFIG.VERSOES_URL;
    if (!base) throw new Error('sem-url');
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(base + (base.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
      if (!r.ok) throw new Error('http-' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  /** Verifica e devolve { estado, texto, plataforma, instalada, ... }. Nunca lança: os erros viram estados. */
  async function verificar() {
    const p = plataforma();
    if (!p) return { estado: 'web', texto: 'A versão web atualiza-se sozinha.' };
    let inst;
    try { inst = await infoInstalada(p); } catch (e) { const d = { estado: 'desconhecida' }; d.texto = texto(d); return d; }
    let dados;
    try {
      if (navigator.onLine === false) throw new Error('offline');
      dados = await buscarVersoes();
    } catch (e) {
      const off = navigator.onLine === false;
      return { estado: off ? 'sem-internet' : 'falha', plataforma: p, instalada: inst.versao, texto: off ? 'Sem internet. Ligue-se para procurar atualizações.' : 'Não foi possível procurar atualizações agora. Tente mais tarde.' };
    }
    const d = decidir({ plataforma: p, instalada: inst.versao, entrada: dados && dados.plataformas && dados.plataformas[p], sistema: inst.sistema });
    d.plataforma = p; d.instalada = inst.versao; d.texto = texto(d, inst.versao);
    return d;
  }

  /* --- transferir e instalar --- */
  function abrirTransferencia(url) {
    if (!PADRAO_URL.test(url)) return raiz.toast ? raiz.toast('Endereço de transferência não permitido.', true) : null;
    const P = (raiz.Capacitor && raiz.Capacitor.Plugins) || {};
    if (P.Browser && P.Browser.open) return P.Browser.open({ url });
    raiz.open(url, '_blank', 'noopener');
  }
  const MSG_ANDROID = 'O Android vai transferir o ficheiro. Quando terminar, toque nele na notificação e escolha Instalar. Se o Android pedir, permita instalar a partir desta origem. Os seus dados mantêm-se.';

  function notasHTML(d) { return d.notas && d.notas.length ? '<ul>' + d.notas.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : ''; }

  function detalhes(d) {
    if (typeof raiz.modal !== 'function') return;
    const win = d.plataforma === 'windows';
    if (!win) {
      raiz.modal('Atualização ' + esc(d.ultima), '<p>' + esc(d.texto) + '</p>' + notasHTML(d) + '<p class="muted small">' + esc(MSG_ANDROID) + '</p>', { okText: 'Transferir ' + esc(d.ultima), onOk: async () => { abrirTransferencia(d.url); } });
      return;
    }
    const w = raiz.modal('Atualização ' + esc(d.ultima), '<p>' + esc(d.texto) + '</p>' + notasHTML(d) + '<p class="muted small" id="upd-estado">A atualização é transferida em segundo plano e instalada quando reiniciar a aplicação. Os seus dados mantêm-se.</p><div id="upd-barra"></div><button type="button" class="btn block" id="upd-go">Transferir</button>', {});
    $('#upd-go', w.m).onclick = () => iniciarTransferenciaWindows(w.m);
  }
  function iniciarTransferenciaWindows(m) {
    const est = $('#upd-estado', m), barra = $('#upd-barra', m), go = $('#upd-go', m), G = raiz.gestmzDesktop;
    const falhou = msg => { est.textContent = msg || 'Não foi possível transferir a atualização. Tente mais tarde.'; barra.innerHTML = ''; go.disabled = false; go.textContent = 'Tentar de novo'; go.onclick = () => iniciarTransferenciaWindows(m); };
    G.aoEstado(s => {
      if (s.estado === 'a-descarregar') { const n = Math.round(s.percentagem || 0); est.textContent = 'A transferir… ' + n + '%'; barra.innerHTML = '<progress max="100" value="' + n + '" style="width:100%"></progress>'; }
      if (s.estado === 'pronto') { est.textContent = 'Pronta. Reinicie para instalar (os dados mantêm-se).'; barra.innerHTML = ''; go.disabled = false; go.textContent = 'Reiniciar e instalar'; go.onclick = () => G.instalar(); }
      if (s.estado === 'erro') falhou(s.mensagem);
    });
    go.disabled = true; go.textContent = 'A transferir…';
    G.descarregar().then(r => { if (r && r.estado === 'erro') falhou(r.mensagem); }, () => falhou());
  }

  /* --- aviso discreto --- */
  function foiAdiado(ver) { try { const [v, t] = (localStorage.getItem(ADIAR_K) || '').split('|'); return v === ver && Date.now() - (+t || 0) < UM_DIA; } catch (e) { return false; } }
  function adiar(ver) { try { localStorage.setItem(ADIAR_K, ver + '|' + Date.now()); } catch (e) { /* ok */ } }
  function mostrarAviso(d) {
    const velho = $('#upd'); if (velho) velho.remove();
    const el = document.createElement('div');
    el.id = 'upd'; el.className = 'upd' + (d.bloquear ? ' bloq' : ''); el.setAttribute('role', 'alert');
    el.innerHTML = '<div class="upd-c"><b>' + esc(d.bloquear ? 'Atualização obrigatória' : 'Nova versão do GestMZ') + '</b><span>' + esc(d.texto) + '</span><div class="upd-b"><button type="button" class="btn sun" data-ver>Ver e atualizar</button>' + (d.bloquear ? '' : '<button type="button" class="btn ghost" data-depois>Mais tarde</button>') + '</div></div>';
    document.body.appendChild(el);
    $('[data-ver]', el).onclick = () => detalhes(d);
    const dp = $('[data-depois]', el); if (dp) dp.onclick = () => { adiar(d.ultima); el.remove(); };
  }
  async function verificarEmSilencio() {
    try {
      const d = await verificar();
      if ((d.estado === 'disponivel' && !foiAdiado(d.ultima)) || d.estado === 'obrigatoria') mostrarAviso(d);
    } catch (e) { /* nunca incomoda o utilizador */ }
  }

  /* --- cartão na página "A minha conta" --- */
  function cartaoConta(main) {
    const p = plataforma(); if (!p || !main) return;
    const c = document.createElement('div'); c.className = 'card'; c.id = 'cartao-versao';
    c.innerHTML = '<h3>Versão da aplicação</h3><p class="muted" id="cv-txt">A ler a versão…</p><button type="button" class="btn ghost" id="cv-btn">Procurar atualizações</button><p class="small" id="cv-res" role="status"></p>';
    main.appendChild(c);
    infoInstalada(p).then(i => { $('#cv-txt', c).textContent = 'GestMZ ' + i.versao + (p === 'windows' ? ' para Windows' : ' para Android'); }).catch(() => { $('#cv-txt', c).textContent = 'Não foi possível ler a versão instalada.'; });
    $('#cv-btn', c).onclick = async () => {
      const b = $('#cv-btn', c), r = $('#cv-res', c); b.disabled = true; r.textContent = 'A procurar…';
      const d = await verificar(); r.textContent = d.texto; b.disabled = false;
      if (d.estado === 'disponivel' || d.estado === 'obrigatoria') { const v = document.createElement('button'); v.type = 'button'; v.className = 'btn'; v.textContent = 'Ver e atualizar'; v.onclick = () => detalhes(d); r.appendChild(document.createElement('br')); r.appendChild(v); }
    };
  }

  function iniciar() {
    if (!plataforma()) return;
    setTimeout(verificarEmSilencio, 6000);
    setInterval(verificarEmSilencio, DOZE_H);
  }
  raiz.GestMZAtualizacao = Object.assign({ verificar, cartaoConta, iniciar }, api);
  iniciar();
})(typeof window !== 'undefined' ? window : globalThis);

'use strict';
// Exercita desktop/main.js SEM Electron instalado: substitui os módulos "electron" e "electron-updater" por simulações
// e verifica a lógica nossa (protocolo app://, permissões, navegação, atualizações). Não valida o Electron real nem o instalador.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), Module = require('module'), { EventEmitter } = require('events');
const MAIN = path.join(__dirname, '..', 'desktop', 'main.js');

process.getSystemVersion = process.getSystemVersion || (() => '10.0.19045'); // só existe no Electron
function carregar({ empacotado }) {
  const reg = { ipc: {}, protocolo: null, schemes: null, permReq: null, permChk: null, janelas: [], app: new EventEmitter(), updater: new EventEmitter(), externos: [], menu: 'x', fetched: [] };
  Object.assign(reg.app, { isPackaged: !!empacotado, getVersion: () => '1.1.0', requestSingleInstanceLock: () => true, quit() { }, whenReady: () => ({ then: f => { reg.pronto = f; } }) });
  class Janela extends EventEmitter {
    constructor(o) { super(); this.opcoes = o; this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: f => { this.abrir = f; }, send: (c, s) => { this.enviados = (this.enviados || []).concat([[c, s]]); }, getURL: () => this.url }); reg.janelas.push(this); }
    loadURL(u) { this.url = u; }
    once() { } show() { } isMinimized() { return false; } isDestroyed() { return false; }
    static getAllWindows() { return reg.janelas; }
  }
  const electron = { app: reg.app, BrowserWindow: Janela, Menu: { setApplicationMenu: v => { reg.menu = v; } },
    protocol: { registerSchemesAsPrivileged: s => { reg.schemes = s; }, handle: (n, f) => { reg.protocolo = f; } },
    net: { fetch: u => { reg.fetched.push(u); return Promise.resolve({ ok: true }); } },
    session: { defaultSession: { setPermissionRequestHandler: f => { reg.permReq = f; }, setPermissionCheckHandler: f => { reg.permChk = f; } } },
    shell: { openExternal: u => reg.externos.push(u) }, ipcMain: { handle: (c, f) => { reg.ipc[c] = f; } } };
  Object.assign(reg.updater, { autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true, checks: 0, downloads: 0, instalou: null,
    checkForUpdates: async () => { reg.updater.checks++; }, downloadUpdate: async () => { reg.updater.downloads++; }, quitAndInstall: (a, b) => { reg.updater.instalou = [a, b]; } });
  if (empacotado) process.resourcesPath = path.join(__dirname, 'fake-resources'); // o Electron define isto na app instalada
  const orig = Module._load;
  Module._load = function (req, ...r) { if (req === 'electron') return electron; if (req === 'electron-updater') return { autoUpdater: reg.updater }; return orig.call(this, req, ...r); };
  delete require.cache[MAIN];
  try { require(MAIN); } finally { Module._load = orig; }
  reg.pronto(); // dispara app.whenReady
  return reg;
}

test('Electron: janela segura (sem Node na página) e instância única', () => {
  const r = carregar({ empacotado: true }); const o = r.janelas[0].opcoes.webPreferences;
  assert.equal(o.contextIsolation, true); assert.equal(o.nodeIntegration, false); assert.equal(o.sandbox, true);
  assert.equal(r.janelas[0].url, 'app://gestmz/index.html'); assert.equal(r.menu, null);
  assert.ok(r.schemes[0].privileges.secure && r.schemes[0].privileges.standard, 'app:// tem de ser origem segura (câmara, armazenamento local)');
});

test('Electron: protocolo app:// serve só a pasta www e recusa saídas dela', async () => {
  const r = carregar({ empacotado: false });
  assert.equal((await r.protocolo({ url: 'app://gestmz/' })).status === 404, false); assert.ok(r.fetched[0].endsWith('/desktop/www/index.html'), r.fetched[0]);
  const dentro = f => new URL(f).pathname.includes('/desktop/www/');
  // o URL normaliza "..", "%2e%2e" (ficam dentro de www); "%2f" e "\\" são o que o main.js tem de travar por si
  for (const u of ['app://gestmz/../main.js', 'app://gestmz/%2e%2e/package.json', 'app://gestmz/..%2fpackage.json', 'app://gestmz/..%2f..%2fetc/passwd', 'app://gestmz/%2e%2e%5cpackage.json']) {
    const antes = r.fetched.length, x = await r.protocolo({ url: u });
    if (x.status === 403) assert.equal(r.fetched.length, antes, u + ': recusado sem tocar no disco');
    else { assert.equal(r.fetched.length, antes + 1, u); assert.ok(dentro(r.fetched.at(-1)), u + ' saiu de www: ' + r.fetched.at(-1)); }
  }
  assert.equal((await r.protocolo({ url: 'app://gestmz/..%2fpackage.json' })).status, 403, 'a barra codificada tem de ser recusada');
  assert.ok(r.fetched.every(dentro), 'nenhum pedido chegou fora de desktop/www');
  assert.equal((await r.protocolo({ url: 'app://outro/index.html' })).status, 404);
});

test('Electron: só a própria app pode usar a câmara; navegação externa vai para o navegador', () => {
  const r = carregar({ empacotado: true }), wc = r.janelas[0].webContents, ok = { getURL: () => 'app://gestmz/index.html' }, fora = { getURL: () => 'https://evil.example/' };
  const dec = (wc, p) => { let v; r.permReq(wc, p, x => { v = x; }); return v; };
  assert.equal(dec(ok, 'media'), true); assert.equal(dec(fora, 'media'), false); assert.equal(dec(ok, 'geolocation'), false); assert.equal(dec(ok, 'notifications'), false);
  assert.equal(r.permChk(ok, 'media'), true); assert.equal(r.permChk(fora, 'media'), false);
  let prevenido = false; wc.emit('will-navigate', { preventDefault() { prevenido = true; } }, 'https://exemplo.com/x'); assert.ok(prevenido); assert.deepEqual(r.externos, ['https://exemplo.com/x']);
  assert.deepEqual(r.janelas[0].abrir({ url: 'file:///C:/x' }), { action: 'deny' }); assert.equal(r.externos.length, 1, 'só https abre fora da app');
});

test('Electron: atualizações nunca descarregam nem instalam sozinhas, nem descem de versão', async () => {
  const r = carregar({ empacotado: true }), u = r.updater;
  assert.equal(u.autoDownload, false); assert.equal(u.autoInstallOnAppQuit, false); assert.equal(u.allowPrerelease, false); assert.equal(u.allowDowngrade, false);
  assert.deepEqual(await r.ipc['gestmz:info'](), { versao: '1.1.0', sistema: process.getSystemVersion() });
  assert.equal(u.downloads, 0); await r.ipc['gestmz:descarregar'](); assert.equal(u.downloads, 1);
  u.emit('download-progress', { percent: 42.4 }); u.emit('update-downloaded'); u.emit('error', new Error('segredo-interno'));
  const env = r.janelas[0].enviados.map(x => x[1]); assert.deepEqual(env.map(x => x.estado), ['a-descarregar', 'pronto', 'erro']);
  assert.ok(!JSON.stringify(env).includes('segredo-interno'), 'não expõe detalhes do erro');
  assert.equal(u.instalou, null); await r.ipc['gestmz:instalar'](); assert.deepEqual(u.instalou, [false, true]);
});

test('Electron: em desenvolvimento (não instalado) as atualizações dão mensagem clara e não tocam em nada', async () => {
  const r = carregar({ empacotado: false });
  for (const c of ['gestmz:verificar', 'gestmz:descarregar']) { const x = await r.ipc[c](); assert.equal(x.estado, 'erro'); assert.match(x.mensagem, /instalada/); }
  assert.equal(r.updater.checks, 0);
});

test('Electron: configuração do instalador (NSIS por utilizador, dados preservados, Releases do repositório)', () => {
  const y = require('fs').readFileSync(path.join(__dirname, '..', 'desktop', 'electron-builder.yml'), 'utf8');
  assert.match(y, /perMachine:\s*false/); assert.match(y, /deleteAppDataOnUninstall:\s*false/); assert.match(y, /owner:\s*zeboys96/); assert.match(y, /repo:\s*Gestmz-/);
  assert.match(y, /artifactName:\s*GestMZ-Setup-\$\{version\}\.exe/);
  const d = require('../desktop/package.json'); assert.ok(d.dependencies['electron-updater']); assert.equal(d.main, 'main.js');
});

'use strict';
const { app, BrowserWindow, Menu, protocol, net, session, shell, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

const ESQUEMA = 'app', HOST = 'gestmz', ORIGEM = ESQUEMA + '://' + HOST;
const WWW = app.isPackaged ? path.join(process.resourcesPath, 'www') : path.join(__dirname, 'www');

// "app://gestmz" é tratado como origem segura (necessário para câmara e armazenamento local), ao contrário de file://
protocol.registerSchemesAsPrivileged([{ scheme: ESQUEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); }
let janela = null;
app.on('second-instance', () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });

function servir() {
  protocol.handle(ESQUEMA, req => {
    const u = new URL(req.url);
    if (u.host !== HOST) return new Response('Não encontrado', { status: 404 });
    let rel = decodeURIComponent(u.pathname); if (rel === '/' || rel === '') rel = '/index.html';
    const f = path.normalize(path.join(WWW, rel));
    if (f !== WWW && !f.startsWith(WWW + path.sep)) return new Response('Proibido', { status: 403 });
    return net.fetch(pathToFileURL(f).toString());
  });
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280, height: 820, minWidth: 360, minHeight: 600, show: false, backgroundColor: '#00453A', title: 'GestMZ',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  janela.once('ready-to-show', () => janela.show());
  janela.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  janela.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGEM + '/')) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); } });
  janela.loadURL(ORIGEM + '/index.html');
}

/* ---------- atualizações (electron-updater, Releases do GitHub) ---------- */
autoUpdater.autoDownload = false;          // o utilizador decide quando transferir
autoUpdater.autoInstallOnAppQuit = false;  // só instala quando o utilizador pedir
autoUpdater.allowPrerelease = false;       // pré-lançamentos e rascunhos nunca são oferecidos
autoUpdater.allowDowngrade = false;        // nunca volta a uma versão mais antiga
const enviar = (estado, extra) => { if (janela && !janela.isDestroyed()) janela.webContents.send('gestmz:estado', Object.assign({ estado }, extra || {})); };
const MSG = 'Não foi possível procurar ou transferir a atualização. Verifique a internet e tente mais tarde.';
autoUpdater.on('update-available', i => enviar('disponivel', { versao: i.version }));
autoUpdater.on('update-not-available', () => enviar('sem-atualizacao'));
autoUpdater.on('download-progress', p => enviar('a-descarregar', { percentagem: p.percent }));
autoUpdater.on('update-downloaded', () => enviar('pronto'));
autoUpdater.on('error', () => enviar('erro', { mensagem: MSG }));

ipcMain.handle('gestmz:info', () => ({ versao: app.getVersion(), sistema: process.getSystemVersion() }));
ipcMain.handle('gestmz:verificar', async () => {
  if (!app.isPackaged) return { estado: 'erro', mensagem: 'As atualizações só funcionam na aplicação instalada.' };
  try { await autoUpdater.checkForUpdates(); return { estado: 'ok' }; } catch (e) { return { estado: 'erro', mensagem: MSG }; }
});
ipcMain.handle('gestmz:descarregar', async () => {
  if (!app.isPackaged) return { estado: 'erro', mensagem: 'As atualizações só funcionam na aplicação instalada.' };
  try { await autoUpdater.checkForUpdates(); await autoUpdater.downloadUpdate(); return { estado: 'ok' }; } catch (e) { return { estado: 'erro', mensagem: MSG }; }
});
ipcMain.handle('gestmz:instalar', () => { autoUpdater.quitAndInstall(false, true); });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  servir();
  // só a própria aplicação pode usar a câmara; tudo o resto é recusado
  const origemApp = wc => { try { return wc.getURL().startsWith(ORIGEM + '/'); } catch (e) { return false; } };
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' && origemApp(wc)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' && !!wc && origemApp(wc));
  criarJanela();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) criarJanela(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

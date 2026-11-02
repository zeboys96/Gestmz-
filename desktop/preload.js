'use strict';
// Ponte mínima e segura entre a página e o processo principal (sem acesso a Node na página).
const { contextBridge, ipcRenderer } = require('electron');
let ouvintes = [];
ipcRenderer.on('gestmz:estado', (_e, s) => ouvintes.forEach(f => { try { f(s); } catch (e) { /* ignora */ } }));
contextBridge.exposeInMainWorld('gestmzDesktop', {
  plataforma: 'windows',
  info: () => ipcRenderer.invoke('gestmz:info'),
  verificar: () => ipcRenderer.invoke('gestmz:verificar'),
  descarregar: () => ipcRenderer.invoke('gestmz:descarregar'),
  instalar: () => ipcRenderer.invoke('gestmz:instalar'),
  aoEstado: f => { if (typeof f === 'function') ouvintes.push(f); }
});

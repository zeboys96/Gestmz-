const CACHE = 'gestmz-v8';
const FILES = ['./', './index.html', './style.css', './config.js', './core.js', './super.js', './loja.js', './loja2.js', './extra.js', './recibo.js', './versao.js', './atualizacao.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Rede primeiro (actualizações chegam sozinhas); cache como reserva para abrir a app sem internet.
// Os pedidos ao Supabase (outro domínio, métodos não-GET) nunca passam pelo cache.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('supabase.co') || u.hostname === 'raw.githubusercontent.com' || u.pathname.endsWith('/versions.json')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

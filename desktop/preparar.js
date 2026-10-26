// Copia a aplicação web (../www) para desktop/www, que o instalador leva dentro. Nada é alterado em ../www.
'use strict';
const fs = require('fs'), path = require('path');
const origem = path.join(__dirname, '..', 'www'), destino = path.join(__dirname, 'www');
if (!fs.existsSync(path.join(origem, 'index.html'))) { console.error('Não encontrei ../www/index.html'); process.exit(1); }
for (const f of ['supabase.js', 'zxing.js']) if (!fs.existsSync(path.join(origem, f))) { console.error('Falta www/' + f + ' (o workflow copia-o do npm antes; ver LEIA-ME).'); process.exit(1); }
fs.rmSync(destino, { recursive: true, force: true });
fs.cpSync(origem, destino, { recursive: true });
fs.rmSync(path.join(destino, 'sw.js'), { force: true }); // sem service worker: a app já vai toda dentro do instalador
console.log('www copiado para desktop/www');

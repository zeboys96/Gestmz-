const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const core = fs.readFileSync(path.join(__dirname, '../www/core.js'), 'utf8');
test('boot separa falta de chave de componente não carregado', () => {
  assert.match(core, /return vFalta\('config'\)/);
  assert.match(core, /return vFalta\('supabase-js'\)/);
  assert.match(core, /id="tn">Tentar de novo/);
});
test('index.html carrega supabase.js com alternativa e config.js', () => {
  const h = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  assert.match(h, /src="supabase\.js"/); assert.match(h, /cdn\.jsdelivr\.net/); assert.match(h, /config\.js/);
});

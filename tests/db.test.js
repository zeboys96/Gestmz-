// Corre a suíte SQL (tests/db) numa réplica Postgres local. Ignorada se não houver Postgres local.
const test = require('node:test'); const assert = require('node:assert');
const { spawnSync } = require('node:child_process'); const path = require('node:path');
const H = process.env.PGHOST || '/tmp/pg', P = process.env.PGPORT || '5544', U = process.env.PGUSER || 'postgres';
const tem = spawnSync('psql', ['-X', '-At', '-h', H, '-p', P, '-U', U, '-d', 'postgres', '-c', 'select 1']).status === 0;
test('base de dados: inicialização segura, isolamento entre lojas, PIN', { skip: !tem && 'sem Postgres local (PGHOST/PGPORT/PGUSER)' }, () => {
  for (const sh of ['correr.sh', 'atualizacao.sh', 'reversao.sh']) {
    const r = spawnSync('bash', [path.join(__dirname, 'db', sh)], { encoding: 'utf8' });
    const falhas = r.stdout.split('\n').filter(l => l.startsWith('FALHA'));
    assert.deepStrictEqual(falhas, [], sh + '\n' + r.stdout.slice(-3000) + r.stderr.slice(-500));
    assert.strictEqual(r.status, 0, sh);
  }
});

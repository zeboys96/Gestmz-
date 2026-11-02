// Corre a suíte SQL (tests/db) numa réplica Postgres local. Ignorada se não houver Postgres local.
const test = require('node:test'); const assert = require('node:assert');
const { spawnSync } = require('node:child_process'); const path = require('node:path');
const H = process.env.PGHOST || '/tmp/pg', P = process.env.PGPORT || '5544', U = process.env.PGUSER || 'postgres';
const tem = spawnSync('psql', ['-X', '-At', '-h', H, '-p', P, '-U', U, '-d', 'postgres', '-c', 'select 1']).status === 0;
test('base de dados: inicialização segura, isolamento, PIN, permissões por papel, reversões', { skip: !tem && 'sem Postgres local (PGHOST/PGPORT/PGUSER)' }, () => {
  const corridas = [['correr.sh', {}], ['correr.sh', { GESTMZ_COM12: '1' }], ['atualizacao.sh', {}], ['reversao.sh', {}], ['permissoes.sh', {}], ['reversao12.sh', {}]];
  for (const [sh, env] of corridas) {
    const r = spawnSync('bash', [path.join(__dirname, 'db', sh)], { encoding: 'utf8', env: { ...process.env, ...env } });
    const falhas = r.stdout.split('\n').filter(l => l.startsWith('FALHA'));
    assert.deepStrictEqual(falhas, [], sh + JSON.stringify(env) + '\n' + r.stdout.slice(-3000) + r.stderr.slice(-500));
    assert.strictEqual(r.status, 0, sh + JSON.stringify(env));
  }
});

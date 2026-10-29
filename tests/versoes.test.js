'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const R = path.join(__dirname, '..');
const A = require(path.join(R, 'www', 'atualizacao.js'));

const URL_A = v => 'https://github.com/zeboys96/Gestmz-/releases/download/v' + v + '/GestMZ-' + v + '-android.apk';
const entrada = (o) => Object.assign({ ultima: '1.2.0', minima: '1.0.0', bloquear: false, publicada_em: '2026-10-26', url: URL_A('1.2.0'), sha256: 'a'.repeat(64), notas: ['x'] }, o || {});

test('versões: leitura, comparação e versionCode', () => {
  assert.deepEqual(A.lerVersao('1.2.3'), [1, 2, 3]);
  for (const v of ['1.2', 'v1.2.3', '1.2.3-rc1', '', null, undefined, '1.2.x']) assert.equal(A.lerVersao(v), null, String(v));
  assert.equal(A.comparar('1.2.0', '1.10.0'), -1);   // comparação numérica, não de texto
  assert.equal(A.comparar('2.0.0', '1.99.99'), 1);
  assert.equal(A.comparar('1.1.0', '1.1.0'), 0);
  assert.equal(A.comparar('1.1', '1.1.0'), null);
  assert.equal(A.codigoDe('1.1.0'), 10100);
  assert.equal(A.codigoDe('2.13.7'), 21307);
  assert.equal(A.codigoDe('1.100.0'), null);
});

test('validação de versions.json: aceita o certo e recusa o perigoso', () => {
  assert.equal(A.validarEntrada(entrada(), 'android'), null);
  assert.equal(A.validarEntrada({ ultima: null }, 'android'), null);               // ainda sem versão
  assert.match(A.validarEntrada(entrada({ url: 'https://exemplo.com/a.apk' }), 'android'), /não permitido/);
  assert.match(A.validarEntrada(entrada({ url: 'http://github.com/zeboys96/Gestmz-/releases/download/v1.2.0/a.apk' }), 'android'), /não permitido/);
  assert.match(A.validarEntrada(entrada({ url: 'https://github.com/outro/Gestmz-/releases/download/v1.2.0/a.apk' }), 'android'), /não permitido/);
  assert.match(A.validarEntrada(entrada({ url: URL_A('1.1.0') }), 'android'), /não corresponde/);
  assert.match(A.validarEntrada(entrada({ url: URL_A('1.2.0').replace('.apk', '.exe') }), 'android'), /\.apk/);
  assert.match(A.validarEntrada(entrada({ minima: '1.3.0' }), 'android'), /minima/);
  assert.match(A.validarEntrada(entrada({ sha256: 'xyz' }), 'android'), /sha256/);
  assert.match(A.validarEntrada(entrada({ publicada_em: '' }), 'android'), /data/);
  assert.match(A.validarEntrada(entrada({ ultima: 'abc' }), 'android'), /inválida/);
  assert.ok(A.validarEntrada(undefined, 'android'));
});

test('decisão: só oferece versões MAIORES e respeita requisitos', () => {
  const d = (inst, e, sis, p) => A.decidir({ plataforma: p || 'android', instalada: inst, entrada: e, sistema: sis });
  assert.equal(d('1.1.0', entrada()).estado, 'disponivel');
  assert.equal(d('1.1.0', entrada()).url, URL_A('1.2.0'));
  assert.equal(d('1.2.0', entrada()).estado, 'atualizada');
  assert.equal(d('2.0.0', entrada()).estado, 'atualizada');                        // nunca volta atrás
  assert.equal(d('1.1.0', entrada({ ultima: null })).estado, 'sem-versao');
  assert.equal(d('abc', entrada()).estado, 'desconhecida');
  assert.equal(d('1.1.0', entrada({ url: 'https://mau.com/x.apk' })).estado, 'invalida');
  const ob = d('0.9.0', entrada({ minima: '1.0.0', bloquear: true }));
  assert.equal(ob.estado, 'obrigatoria'); assert.equal(ob.bloquear, true);
  assert.equal(d('0.9.0', entrada({ minima: '1.0.0' })).bloquear, false);           // só bloqueia se for decidido explicitamente
  assert.equal(d('1.1.0', entrada({ requisitos: { android_min: 9 } }), { android: 8 }).estado, 'incompativel');
  assert.equal(d('1.1.0', entrada({ requisitos: { android_min: 9 } }), { android: 13 }).estado, 'disponivel');
  const w = o => entrada(Object.assign({ url: URL_A('1.2.0').replace('-android.apk', '-Setup.exe').replace('GestMZ-1.2.0', 'GestMZ'), requisitos: { windows_min: '10.0.17763' } }, o));
  assert.equal(d('1.1.0', w(), { windows: '10.0.19045' }, 'windows').estado, 'disponivel');
  assert.equal(d('1.1.0', w(), { windows: '6.3.9600' }, 'windows').estado, 'incompativel');
  for (const e of ['atualizada', 'sem-versao', 'disponivel', 'obrigatoria', 'incompativel', 'invalida', 'desconhecida']) assert.ok(A.texto({ estado: e, ultima: '1.2.0' }, '1.1.0').length > 10, e);
});

test('o repositório está consistente (versão única e versions.json válido)', () => {
  const r = cp.spawnSync(process.execPath, [path.join(R, 'scripts', 'verificar-versoes.js')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('atualizar-versions.js: calcula o SHA-256, gera o endereço e recusa versões não maiores', () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'gmz-')), f = path.join(t, 'GestMZ-1.1.0-android.apk');
  fs.writeFileSync(f, 'conteudo de teste');
  const run = (...a) => cp.spawnSync(process.execPath, [path.join(R, 'scripts', 'atualizar-versions.js'), ...a], { encoding: 'utf8' });
  const sai = path.join(t, 'p.json');
  const ok = run('--plataforma', 'android', '--versao', '1.1.0', '--ficheiro', f, '--notas', 'Primeira;Segunda', '--saida', sai);
  assert.equal(ok.status, 0, ok.stderr);
  const p = JSON.parse(fs.readFileSync(sai, 'utf8')).plataformas.android;
  assert.equal(p.ultima, '1.1.0'); assert.equal(p.url, URL_A('1.1.0')); assert.deepEqual(p.notas, ['Primeira', 'Segunda']);
  assert.equal(p.sha256, require('crypto').createHash('sha256').update('conteudo de teste').digest('hex'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(R, 'www', 'versions.json'), 'utf8')).plataformas.android.ultima, null, 'o script não pode alterar o ficheiro do repositório');
  assert.notEqual(run('--plataforma', 'android', '--versao', '1.1.0', '--ficheiro', f).status, 0, 'sem --saida tem de falhar');
  assert.notEqual(run('--plataforma', 'linux', '--versao', '1.1.0', '--ficheiro', f, '--saida', sai).status, 0);
  // não deixa publicar uma versão igual ou mais antiga do que a já publicada
  const pub = JSON.parse(fs.readFileSync(sai, 'utf8')); const alt = path.join(t, 'alt'); fs.mkdirSync(alt);
  fs.mkdirSync(path.join(alt, 'www'), { recursive: true }); fs.mkdirSync(path.join(alt, 'scripts'));
  fs.copyFileSync(path.join(R, 'www', 'atualizacao.js'), path.join(alt, 'www', 'atualizacao.js')); fs.writeFileSync(path.join(alt, 'www', 'versions.json'), JSON.stringify(pub));
  fs.copyFileSync(path.join(R, 'scripts', 'atualizar-versions.js'), path.join(alt, 'scripts', 'atualizar-versions.js'));
  const r2 = cp.spawnSync(process.execPath, [path.join(alt, 'scripts', 'atualizar-versions.js'), '--plataforma', 'android', '--versao', '1.0.5', '--ficheiro', f, '--saida', path.join(t, 'q.json')], { encoding: 'utf8' });
  assert.notEqual(r2.status, 0); assert.match(r2.stderr, /não é maior/);
});

test('aplicar-android.py: define versão e assinatura sem quebrar o fluxo antigo', { skip: cp.spawnSync('python3', ['--version']).status !== 0 }, () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'gmz-and-'));
  fs.cpSync(path.join(R, 'resources'), path.join(t, 'resources'), { recursive: true, filter: s => !s.includes('__pycache__') });
  fs.copyFileSync(path.join(R, 'package.json'), path.join(t, 'package.json'));
  const M = path.join(t, 'android', 'app', 'src', 'main'), res = path.join(M, 'res');
  for (const d of ['values', 'mipmap-xxxhdpi', 'drawable']) fs.mkdirSync(path.join(res, d), { recursive: true });
  fs.writeFileSync(path.join(M, 'AndroidManifest.xml'), '<manifest xmlns:android="x"><application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round" android:theme="@style/AppTheme"><activity android:theme="@style/AppTheme.NoActionBarLaunch"/></application></manifest>');
  fs.writeFileSync(path.join(res, 'values', 'styles.xml'), '<resources><style name="AppTheme.NoActionBar" parent="Theme.AppCompat.NoActionBar"></style><style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen"></style></resources>');
  const gr = path.join(t, 'android', 'app', 'build.gradle');
  fs.writeFileSync(gr, 'android {\n  defaultConfig {\n    applicationId "mz.gestmz.app"\n    versionCode 1\n    versionName "1.0"\n  }\n}\n');
  const py = env => cp.spawnSync('python3', ['-B', path.join(t, 'resources', 'aplicar-android.py')], { encoding: 'utf8', env: Object.assign({}, process.env, env) });
  let r = py({}); assert.equal(r.status, 0, r.stdout + r.stderr);
  const v = require(path.join(R, 'package.json')).version;
  let g = fs.readFileSync(gr, 'utf8');
  assert.match(g, new RegExp('versionCode ' + A.codigoDe(v))); assert.match(g, new RegExp('versionName "' + v.replace(/\./g, '\\.') + '"'));
  assert.ok(!g.includes('gestmz-assinatura'), 'sem keystore não pode ligar a assinatura');
  const man = fs.readFileSync(path.join(M, 'AndroidManifest.xml'), 'utf8');
  assert.ok(man.includes('android.permission.CAMERA'), 'a permissão da câmara tem de continuar a ser aplicada');
  const ks = path.join(t, 'k.jks'); fs.writeFileSync(ks, 'x');
  r = py({ GESTMZ_KEYSTORE: ks, GESTMZ_EXIGIR_VERSAO: '1' }); assert.equal(r.status, 0, r.stdout + r.stderr);
  r = py({ GESTMZ_KEYSTORE: ks }); assert.equal(r.status, 0);
  g = fs.readFileSync(gr, 'utf8'); assert.equal(g.split("apply from: 'gestmz-assinatura.gradle'").length - 1, 1, 'aplica a assinatura uma única vez');
  assert.ok(fs.existsSync(path.join(t, 'android', 'app', 'gestmz-assinatura.gradle')));
  assert.ok(!(r.stdout + r.stderr).includes('x'.repeat(8)), 'não escreve o conteúdo do keystore');
  fs.writeFileSync(gr, 'android { defaultConfig { applicationId "mz.gestmz.app" } }\n');
  assert.equal(py({}).status, 0, 'o fluxo antigo (apk.yml) só avisa quando não encontra a versão');
  assert.notEqual(py({ GESTMZ_EXIGIR_VERSAO: '1' }).status, 0, 'o fluxo de versões exige que a versão seja definida');
});

test('workflow versao.yml: nunca publica; só cria rascunho, com aprovação, e não toca no workflow antigo do APK', () => {
  const y = fs.readFileSync(path.join(R, '.github', 'workflows', 'versao.yml'), 'utf8');
  assert.ok(y.includes('--draft'), 'a Release tem de ser rascunho');
  assert.ok(!/--draft=false|--latest|release edit|prerelease=false/.test(y), 'não pode publicar');
  assert.match(y, /environment:\s*aprovacao-release/);
  const gat = y.split('jobs:')[0]; assert.ok(!/(^|\n)\s*(schedule|pull_request):/.test(gat) && !/branches:\s*\[(?!desenvolvimento\/atualizacoes\])/.test(gat), 'só arranca à mão (ou, temporariamente, no ramo de desenvolvimento)');
  const antigo = fs.readFileSync(path.join(R, '.github', 'workflows', 'apk.yml'), 'utf8');
  assert.ok(antigo.includes('assembleDebug') && antigo.includes('GestMZ-apk'), 'apk.yml continua a gerar o APK de teste');
  assert.ok(!/secrets\./.test(antigo), 'apk.yml não usa segredos');
});

test('workflow versao.yml: o APK de teste mostra o seu certificado (informativo, sem segredos, sem falhar)', () => {
  const y = fs.readFileSync(path.join(R, '.github', 'workflows', 'versao.yml'), 'utf8');
  assert.match(y, /SHA-256 do certificado do APK de TESTE/);
  assert.match(y, /GITHUB_STEP_SUMMARY/);
  const ramoTeste = y.slice(y.indexOf('APK de TESTE (chave de depuração efémera'), y.indexOf('mkdir -p saida'));
  assert.ok(ramoTeste.length > 100 && !/\bexit 1\b/.test(ramoTeste), 'o ramo de teste nunca falha por causa do certificado');
  assert.ok(!/KS_PASS|KEYSTORE_PASSWORD|KEY_PASSWORD|KS_B64/.test(ramoTeste), 'não toca em segredos');
});

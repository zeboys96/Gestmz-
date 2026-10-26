#!/usr/bin/env node
// Confere que a versão é a mesma em todo o lado e que www/versions.json é válido. Corre no CI e à mão: node scripts/verificar-versoes.js
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const A = require(path.join(R, 'www', 'atualizacao.js'));
const lerJSON = f => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
const erros = [];
const pkg = lerJSON('package.json').version;
if (!A.lerVersao(pkg)) erros.push('package.json: versão inválida "' + pkg + '" (use x.y.z)');
if (A.codigoDe(pkg) == null) erros.push('package.json: minor e patch têm de ser menores que 100');
if (fs.existsSync(path.join(R, 'desktop', 'package.json'))) { const d = lerJSON('desktop/package.json').version; if (d !== pkg) erros.push('desktop/package.json tem ' + d + ' e package.json tem ' + pkg); }
const vj = fs.readFileSync(path.join(R, 'www', 'versao.js'), 'utf8');
const m = /versao:\s*'([^']+)',\s*codigo:\s*(\d+)/.exec(vj);
if (!m) erros.push('www/versao.js: formato não reconhecido');
else { if (m[1] !== pkg) erros.push('www/versao.js tem ' + m[1] + ' e package.json tem ' + pkg); if (+m[2] !== A.codigoDe(pkg)) erros.push('www/versao.js: código ' + m[2] + ' não corresponde a ' + A.codigoDe(pkg)); }
const v = lerJSON('www/versions.json');
if (v.esquema !== 1) erros.push('versions.json: esquema desconhecido');
for (const p of ['android', 'windows']) {
  const e = v.plataformas && v.plataformas[p];
  const er = A.validarEntrada(e, p);
  if (er) erros.push('versions.json (' + p + '): ' + er);
  else if (e.ultima && A.comparar(e.ultima, pkg) > 0) erros.push('versions.json (' + p + '): a versão publicada ' + e.ultima + ' é maior do que a do código (' + pkg + ')');
}
if (erros.length) { console.error('Verificação de versões FALHOU:\n - ' + erros.join('\n - ')); process.exit(1); }
console.log('Versões consistentes: ' + pkg + ' (versionCode ' + A.codigoDe(pkg) + ').');

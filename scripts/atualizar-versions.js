#!/usr/bin/env node
// Prepara uma NOVA versão de www/versions.json (nunca publica nada). Calcula o SHA-256 e o tamanho do ficheiro.
// Uso: node scripts/atualizar-versions.js --plataforma android --versao 1.1.0 --ficheiro GestMZ-1.1.0-android.apk \
//        --notas "Primeira nota;Segunda nota" [--minima 1.0.0] [--bloquear] [--publicada-em 2026-10-26] --saida versions-proposta.json
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const R = path.join(__dirname, '..');
const A = require(path.join(R, 'www', 'atualizacao.js'));
const a = process.argv.slice(2), arg = n => { const i = a.indexOf('--' + n); return i < 0 ? null : a[i + 1]; };
const sai = m => { console.error('Erro: ' + m); process.exit(1); };
const plat = arg('plataforma'), ver = arg('versao'), fich = arg('ficheiro'), saida = arg('saida');
if (!['android', 'windows'].includes(plat)) sai('--plataforma tem de ser android ou windows');
if (!A.lerVersao(ver)) sai('--versao inválida (use x.y.z)');
if (!fich || !fs.existsSync(fich)) sai('--ficheiro não existe');
if (!saida) sai('--saida em falta (este script nunca altera www/versions.json sozinho)');
const nome = path.basename(fich);
if (!/^[A-Za-z0-9._-]+$/.test(nome)) sai('nome de ficheiro com caracteres não permitidos');
const atual = JSON.parse(fs.readFileSync(path.join(R, 'www', 'versions.json'), 'utf8'));
const ant = atual.plataformas[plat];
if (ant.ultima && A.comparar(ver, ant.ultima) <= 0) sai('a versão ' + ver + ' não é maior do que a já publicada (' + ant.ultima + ')');
const hoje = arg('publicada-em') || new Date().toISOString().slice(0, 10);
const entrada = Object.assign({}, ant, {
  ultima: ver, minima: arg('minima') || ant.minima || ver, bloquear: a.includes('--bloquear'), publicada_em: hoje,
  url: 'https://github.com/zeboys96/Gestmz-/releases/download/v' + ver + '/' + nome,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(fich)).digest('hex'), tamanho: fs.statSync(fich).size,
  notas: (arg('notas') || '').split(';').map(s => s.trim()).filter(Boolean)
});
const er = A.validarEntrada(entrada, plat); if (er) sai(er);
atual.plataformas[plat] = entrada; atual.atualizado_em = hoje;
fs.writeFileSync(saida, JSON.stringify(atual, null, 2) + '\n');
console.log('Proposta gravada em ' + saida + ' (' + plat + ' ' + ver + ', sha256 ' + entrada.sha256.slice(0, 12) + '…). Reveja e só depois faça commit em www/versions.json.');

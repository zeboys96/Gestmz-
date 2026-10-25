// Gera os recursos Android (ícone e splash) a partir do logótipo do GestMZ (www/icon.svg: cores #00453A e #F4B400).
// Uso (só quando o logótipo mudar): node resources/gerar-icones.js   — precisa do Playwright.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs'), path = require('path');
const V = '#00453A', A = '#F4B400', out = path.join(__dirname, 'android', 'res');
const barras = (fill) => `<rect x="10" y="26" width="7" height="12" rx="2" fill="${fill}"/><rect x="20.5" y="18" width="7" height="20" rx="2" fill="${fill}"/><rect x="31" y="9" width="7" height="29" rx="2" fill="${fill}"/>`;
// ícone completo (como o www/icon.svg): quadrado arredondado verde com barras amarelas
const icone = (r) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="${r}" fill="${V}"/>${barras(A)}</svg>`;
// primeiro plano adaptativo: só as barras, dentro da zona segura (≈40 % da tela de 108 dp), fundo transparente
const frente = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(54 54) scale(${(108 * 0.40 / 28).toFixed(4)}) translate(-24 -23.5)">${barras(A)}</g></svg>`;
// logótipo do splash: o mesmo do ecrã inicial da app (quadrado amarelo com barras verdes)
const splash = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${48 + 2 * pad} ${48 + 2 * pad}"><rect width="48" height="48" rx="12" fill="${A}"/>${barras(V)}</svg>`;
const D = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  const png = async (svg, px, file) => {
    await p.setViewportSize({ width: px, height: px });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await p.screenshot({ omitBackground: true }));
  };
  for (const [d, [l, f]] of Object.entries(D)) {
    const m = path.join(out, 'mipmap-' + d);
    await png(icone(12), l, path.join(m, 'ic_launcher.png'));
    await png(icone(24), l, path.join(m, 'ic_launcher_round.png'));
    await png(frente, f, path.join(m, 'ic_launcher_foreground.png'));
  }
  await png(splash(0), 320, path.join(out, 'drawable-nodpi', 'gestmz_splash_logo.png'));          // splash até ao Android 11
  await png(splash(12), 960, path.join(out, 'drawable-nodpi', 'gestmz_splash_icon.png'));         // splash do Android 12+ (logótipo no meio, com margem)
  await png(icone(12), 512, path.join(__dirname, 'icone-512.png'));
  await b.close();
})();

'use strict';
/* GestMZ — presença: avisa o servidor, de vez em quando, que a app está aberta (só "quando" e "com que versão"; nunca vendas, produtos ou valores).
   Serve para o dono do sistema ver se as lojas estão a usar a app. Silencioso: nunca mostra erros nem atrasa nada, e funciona sem a migração no servidor. */
(function (raiz) {
  const CADA = 2 * 60 * 1000;   // 2 minutos (o servidor considera «online» quem deu sinal nos últimos 3)
  let tmr = 0, ligado = false, ultimo = 0;
  function plataforma() {
    if (raiz.gestmzDesktop) return 'windows';
    try { const C = raiz.Capacitor; if (C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform && C.getPlatform() === 'android') return 'android'; } catch (e) { /* web */ }
    return 'web';
  }
  async function enviar() {
    if (!ligado || typeof sb === 'undefined' || !sb || typeof S === 'undefined' || !S.perfil || S.perfil.papel === 'super') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    ultimo = Date.now();
    try { await sb.rpc('registar_atividade', { p_versao: (raiz.GESTMZ_VERSAO && raiz.GESTMZ_VERSAO.versao) || null, p_plataforma: plataforma() }); } catch (e) { /* silencioso */ }
  }
  function iniciar() {
    ligado = true; clearInterval(tmr); tmr = setInterval(enviar, CADA); enviar();
    if (!iniciar.ouvinte) { iniciar.ouvinte = true; document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimo > 30000) enviar(); }); raiz.addEventListener('online', () => enviar()); }
  }
  function parar() { ligado = false; clearInterval(tmr); }
  raiz.GestAtividade = { iniciar, parar, enviar, plataforma };
})(window);

/* GestMZ — autenticador TOTP (Google Authenticator e compatíveis) + códigos de recuperação.
   Só para o dono do sistema e donos de loja. É OPCIONAL: nada muda para quem não ativar. O servidor (migração 15) é quem garante as regras;
   esta interface só as mostra. Os códigos de recuperação aparecem uma única vez e nunca são guardados no aparelho.
   Se o servidor ainda não tem a migração 15 (mfa_estado não existe), o cartão não aparece e o início de sessão não muda. */
(function (raiz) {
  'use strict';
  const mfa = () => (typeof sb !== 'undefined' && sb && sb.auth && sb.auth.mfa) || null;
  const soDigitos = v => String(v || '').replace(/\D/g, '');
  const mensagem = e => { const m = (e && e.message) || String(e || ''); return /invalid.*(code|totp)|code.*invalid|Invalid TOTP/i.test(m) ? 'Código incorreto ou expirado. Confira a hora do telemóvel e tente de novo.' : /rate limit|too many/i.test(m) ? 'Demasiadas tentativas. Espere um minuto.' : traduz(m); };

  /* true se esta sessão ainda só passou pela senha (aal1) e a conta tem autenticador verificado (aal2 é o próximo nível) */
  async function precisaDesafio() {
    const m = mfa(); if (!m || !m.getAuthenticatorAssuranceLevel) return false;
    try { const { data, error } = await m.getAuthenticatorAssuranceLevel(); return !error && !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'; } catch (e) { return false; }   // sem rede: não bloqueia; o servidor decide
  }
  async function fatorVerificado() {
    const { data, error } = await mfa().listFactors(); if (error) throw new Error(error.message);
    return ((data && data.totp) || []).find(f => f.status === 'verified') || null;
  }
  async function verificar(factorId, codigo) {
    const c = soDigitos(codigo); if (c.length !== 6) throw new Error('O código tem 6 números.');
    const r = await mfa().challengeAndVerify({ factorId, code: c }); if (r.error) throw new Error(mensagem(r.error));
  }

  /* ---------- início de sessão: pedir o código ---------- */
  function vDesafio(depois) {
    authShell(`<h2>Confirme com o autenticador</h2><div class="msg">Abra o Google Authenticator (ou a sua aplicação de códigos) e escreva o código de 6 números do GestMZ.</div>
      <form id="ft">${fld('Código de 6 números', 'c', '', 'text', 'required inputmode="numeric" autocomplete="one-time-code" maxlength="8" autocapitalize="none"')}<button class="btn block" id="tok">Confirmar</button></form>
      <div style="text-align:center;margin-top:10px"><button class="link" id="perdi">Perdi o telemóvel ou a aplicação</button> · <button class="link" id="sair">Sair</button></div>`);
    $('#sair').onclick = () => sair();
    $('#perdi').onclick = () => vRecuperar(depois);
    $('#ft').onsubmit = async e => {
      e.preventDefault(); const b = $('#tok'); b.disabled = true; const d = Object.fromEntries(new FormData(e.target));
      try { const f = await fatorVerificado(); if (!f) throw new Error('Não encontrei o autenticador desta conta.'); await verificar(f.id, d.c); await depois(); }
      catch (er) { erro(er); b.disabled = false; e.target.reset(); }
    };
  }
  /* ---------- perdi o telemóvel: um código de recuperação remove o autenticador (a Edge Function faz o resto) ---------- */
  async function chamarFuncao(corpo) {
    const r = await sb.functions.invoke('recuperar-totp', { body: corpo });
    if (r.error) {
      let msg = 'Não foi possível concluir. Tente mais tarde.';
      try { const j = r.error.context && typeof r.error.context.json === 'function' ? await r.error.context.json() : null; if (j && j.erro) msg = j.erro; } catch (e) { /* mensagem genérica */ }
      throw new Error(msg);
    }
    return r.data;
  }
  function vRecuperar(depois) {
    authShell(`<h2>Perdi o telemóvel</h2><div class="msg">Escreva <b>um</b> dos códigos de recuperação que guardou quando ativou o autenticador. O autenticador antigo é removido; depois pode ativar um novo em «Conta». Cada código só funciona uma vez.</div>
      <form id="fr">${fld('Código de recuperação', 'c', '', 'text', 'required autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="40" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"')}<button class="btn block" id="rok">Remover o autenticador</button></form>
      <div class="msg" style="margin-top:12px">Sem códigos? O administrador do GestMZ pode ajudar depois de confirmar quem você é (fora da aplicação).</div>
      <div style="text-align:center;margin-top:10px"><button class="link" id="volta">Voltar</button> · <button class="link" id="sair">Sair</button></div>`);
    $('#sair').onclick = () => sair(); $('#volta').onclick = () => vDesafio(depois);
    $('#fr').onsubmit = async e => {
      e.preventDefault(); const b = $('#rok'); b.disabled = true; const d = Object.fromEntries(new FormData(e.target));
      try {
        await chamarFuncao({ acao: 'codigo', codigo: String(d.c || '').trim() });
        try { if (sb.auth.refreshSession) await sb.auth.refreshSession(); } catch (x) { /* ok */ }
        toast('Autenticador removido. Ative um novo em «Conta».'); await depois();
      } catch (er) { erro(er); b.disabled = false; e.target.reset(); }
    };
  }

  /* ---------- «Conta»: ativar, códigos, desativar ---------- */
  function mostrarCodigos(codigos, depois) {
    const texto = 'Códigos de recuperação do GestMZ — cada um só funciona uma vez.\nGuarde-os fora do telemóvel de trabalho (papel, gestor de palavras-passe).\n\n' + codigos.join('\n') + '\n';
    const mdl = modal('Códigos de recuperação', `<div class="msg bad"><b>Guarde-os agora.</b> Não voltam a ser mostrados. Se perder o telemóvel e estes códigos, só o administrador do GestMZ pode ajudar.</div>
      <pre class="codigos" id="cods" style="font-size:16px;line-height:1.7;user-select:all;white-space:pre-wrap">${esc(codigos.join('\n'))}</pre>
      <div class="mf" style="justify-content:flex-start"><button type="button" class="btn ghost" id="cc">Copiar</button><button type="button" class="btn ghost" id="cd">Guardar ficheiro</button></div>
      <label class="chk"><input type="checkbox" id="gu"> Já guardei os códigos num sítio seguro</label>`, { okText: 'Concluir', sticky: true, noFocus: true, onOk: async () => { if (!$('#gu', mdl.m).checked) { toast('Confirme que guardou os códigos.', true); return false; } if (depois) depois(); } });
    $('[data-x]', mdl.m).style.display = 'none';
    $('#cc', mdl.m).onclick = async () => { try { await navigator.clipboard.writeText(texto); toast('Copiados.'); } catch (e) { toast('Não foi possível copiar; selecione e copie à mão.', true); } };
    $('#cd', mdl.m).onclick = () => download('gestmz-codigos-recuperacao.txt', texto, 'text/plain');
  }
  async function gerarCodigos(depois) {
    const c = await q(sb.rpc('mfa_gerar_codigos')); mostrarCodigos(c || [], depois);
  }
  /* pede um código ao utilizador e eleva a sessão a aal2 (necessário para gerar códigos e desativar) */
  async function elevar(titulo) {
    const f = await fatorVerificado(); if (!f) throw new Error('O autenticador não está ativo.');
    return new Promise((res, rej) => {
      let feito = false;
      modal(titulo, `<p class="muted">Escreva o código de 6 números que a aplicação mostra agora.</p>${fld('Código', 'c', '', 'text', 'required inputmode="numeric" autocomplete="one-time-code" maxlength="8"')}`, {
        okText: 'Confirmar', onOk: async d => { await verificar(f.id, d.c); feito = true; res(true); }, onClose: () => { if (!feito) rej(new Error('cancelado')); }
      });
    });
  }
  async function ativar(depois) {
    const m = mfa(); const r = await m.enroll({ factorType: 'totp', friendlyName: 'GestMZ ' + new Date().toISOString().slice(0, 10) });
    if (r.error) throw new Error(mensagem(r.error)); const t = r.data.totp, id = r.data.id; let concluido = false;
    const qr = typeof t.qr_code === 'string' && /^data:image\/svg\+xml/i.test(t.qr_code) ? t.qr_code : '';
    modal('Ativar o autenticador', `<ol class="small"><li>Instale o <b>Google Authenticator</b> (ou outra aplicação de códigos).</li><li>Toque em «+» e leia este desenho (ou escreva a chave à mão).</li><li>Escreva abaixo o código de 6 números que aparecer.</li></ol>
      ${qr ? `<div style="text-align:center"><img alt="Código QR para o autenticador" src="${qr.replace(/"/g, '%22')}" style="width:200px;height:200px;background:#fff;padding:6px;border-radius:8px"></div>` : ''}
      <p class="muted small" style="text-align:center">Chave: <b style="user-select:all;word-break:break-all">${esc(t.secret || '')}</b></p>${fld('Código de 6 números', 'c', '', 'text', 'required inputmode="numeric" autocomplete="one-time-code" maxlength="8"')}`, {
      okText: 'Ativar', sticky: true,
      onOk: async d => { await verificar(id, d.c); concluido = true; await gerarCodigos(depois); },
      onClose: () => { if (!concluido) m.unenroll({ factorId: id }).catch(() => { }); }   // não deixa um fator a meio
    });
  }
  async function desativar(depois) {
    await elevar('Confirme para desativar');
    const f = await fatorVerificado(); if (!f) return depois();
    ask('Desativar o autenticador? A conta volta a pedir só a senha e os códigos de recuperação deixam de servir.', async () => { const r = await mfa().unenroll({ factorId: f.id }); if (r.error) throw new Error(mensagem(r.error)); toast('Autenticador desativado.'); depois(); }, 'Desativar', true);
  }

  async function cartaoConta(main) {
    const m = mfa(); if (!m || !main || !S.perfil || !['dono', 'super'].includes(S.perfil.papel)) return;
    let est; try { est = await q(sb.rpc('mfa_estado')); } catch (e) { return; }   // migração 15 por aplicar: sem cartão
    if (!est || !est.permitido) return;
    const d = document.createElement('div'); d.className = 'card'; d.id = 'cartao-totp'; main.appendChild(d);
    const desenhar = async () => {
      let e2 = est; try { e2 = await q(sb.rpc('mfa_estado')); } catch (x) { /* mantém */ }
      const ativo = !!e2.tem_fator, obr = S.perfil.papel === 'super' && e2.super_obrigatorio === true;
      d.innerHTML = `<h3>Autenticador (Google Authenticator)</h3>
        <p class="muted small">${ativo ? 'Ativo. Ao entrar, além da senha pede um código de 6 números.' : 'Desligado. Ative para proteger a sua conta com um código do telemóvel além da senha.'}${S.perfil.papel === 'super' ? (obr ? ' É obrigatório para o administrador.' : ' Será obrigatório para o administrador mais tarde; ative e guarde os códigos já.') : ''}</p>
        ${ativo ? `<p class="small">Códigos de recuperação por usar: <b>${+e2.codigos_restantes || 0}</b>${(+e2.codigos_restantes || 0) < 3 ? ' — gere novos.' : ''}</p>` : ''}
        <div class="mf" style="justify-content:flex-start;flex-wrap:wrap">${ativo ? '<button type="button" class="btn ghost" id="tg">Gerar novos códigos</button>' + (obr ? '' : '<button type="button" class="btn ghost" id="td">Desativar</button>') : '<button type="button" class="btn" id="ta">Ativar o autenticador</button>'}</div>`;
      const por = (id, f) => { const b = d.querySelector(id); if (b) b.onclick = async () => { b.disabled = true; try { await f(); } catch (er) { if (er && er.message !== 'cancelado') erro(er); } finally { b.disabled = false; } }; };
      por('#ta', () => ativar(desenhar)); por('#td', () => desativar(desenhar));
      por('#tg', async () => { if (e2.aal !== 'aal2') await elevar('Confirme para gerar códigos'); await gerarCodigos(desenhar); });
    };
    await desenhar();
  }

  const api = { precisaDesafio, vDesafio, vRecuperar, cartaoConta, soDigitos };
  raiz.GestTOTP = api;
})(typeof window !== 'undefined' ? window : globalThis);

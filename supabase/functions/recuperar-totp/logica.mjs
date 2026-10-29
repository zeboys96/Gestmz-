// GestMZ — Edge Function «recuperar-totp»: lógica pura (testável em Node sem Deno nem Supabase).
// NÃO está publicada nem ativa. Só corre depois de ser criada no Supabase com autorização explícita.
//
// Duas ações, ambas exigem uma sessão válida (token Bearer verificado pelo servidor de autenticação):
//  • "codigo":       o titular (que entrou com a senha mas perdeu o telemóvel) apresenta UM código de recuperação.
//                    O alvo é SEMPRE o utilizador do token — o corpo do pedido nunca escolhe a conta.
//  • "remover_dono": o dono do sistema, com sessão aal2, remove o autenticador de UM dono de loja (que perdeu telemóvel e códigos).
// O servidor (RPCs mfa_*) valida, consome o código uma única vez, limita tentativas e audita. Esta camada nunca regista códigos nem tokens.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CORPO = 2048;

const json = (corpo, estado, cors) => new Response(JSON.stringify(corpo), { status: estado, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, cors || {}) });

// Lê o nível de garantia (aal) do token. SÓ depois de o servidor de autenticação ter validado o token (getUser).
export function aalDoToken(jwt) {
  try {
    const p = String(jwt).split('.')[1]; if (!p) return '';
    const s = p.replace(/-/g, '+').replace(/_/g, '/'), txt = typeof atob === 'function' ? atob(s + '='.repeat((4 - s.length % 4) % 4)) : Buffer.from(s, 'base64').toString('utf8');
    const a = JSON.parse(txt).aal; return typeof a === 'string' ? a : '';
  } catch (e) { return ''; }
}

function cabecalhosCors(req, origens) {
  const o = req.headers.get('origin'); const base = { vary: 'Origin' };
  if (o && (origens || []).includes(o)) return Object.assign(base, { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' });
  return base;
}

/* deps: { getUser(jwt) → {id}|null, rpc(nome, args) → {data,error}, listarFatores(userId) → [{id,factor_type,status}],
           apagarFator(userId, factorId) → {error}, origens: string[], log?(evento) }  (todas assíncronas) */
export async function tratar(req, deps) {
  const cors = cabecalhosCors(req, deps.origens), log = e => { try { deps.log && deps.log(e); } catch (x) { /* ignora */ } };
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405, cors);
    const auth = req.headers.get('authorization') || '', m = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/.exec(auth);
    if (!m) return json({ erro: 'Sessão inválida.' }, 401, cors);
    const jwt = m[1];
    let texto = await req.text(); if (texto.length > MAX_CORPO) return json({ erro: 'Pedido demasiado grande.' }, 413, cors);
    let corpo; try { corpo = JSON.parse(texto); } catch (e) { return json({ erro: 'Pedido inválido.' }, 400, cors); }
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return json({ erro: 'Pedido inválido.' }, 400, cors);
    const u = await deps.getUser(jwt); if (!u || !UUID.test(String(u.id))) return json({ erro: 'Sessão inválida.' }, 401, cors);
    const ator = u.id, aal = aalDoToken(jwt);

    // remove TODOS os fatores TOTP de um utilizador; devolve {n} ou {falhou:true}
    const removerFatores = async alvo => {
      const fs = (await deps.listarFatores(alvo)) || []; let n = 0;
      for (const f of fs) { const r = await deps.apagarFator(alvo, f.id); if (r && r.error) return { falhou: true, n }; n++; }
      return { n };
    };

    if (corpo.acao === 'codigo') {
      const codigo = corpo.codigo;
      if (typeof codigo !== 'string' || codigo.length < 1 || codigo.length > 64) return json({ erro: 'Código inválido ou já usado.' }, 400, cors);
      const r = await deps.rpc('mfa_consumir_codigo', { p_user: ator, p_codigo: codigo });   // o alvo é o dono do token, nunca o corpo
      if (r.error || !r.data) { log({ ev: 'erro_rpc', acao: 'codigo' }); return json({ erro: 'Não foi possível concluir. Tente mais tarde.' }, 500, cors); }
      const estado = r.data.estado;
      if (estado === 'bloqueado') return json({ erro: 'Demasiadas tentativas. Tente mais tarde.' }, 429, cors);
      if (estado !== 'ok') return json({ erro: 'Código inválido ou já usado.' }, 400, cors);   // «inválido» e «sem permissão» respondem igual
      let rem; try { rem = await removerFatores(ator); } catch (e) { rem = { falhou: true, n: 0 }; }
      if (rem.falhou) {
        try { await deps.rpc('mfa_devolver_codigo', { p_user: ator, p_id: r.data.id }); } catch (e) { /* o código fica gasto: o titular usa outro */ }
        log({ ev: 'remocao_falhou', acao: 'codigo' }); return json({ erro: 'Não foi possível remover o autenticador. O código não foi gasto; tente de novo.' }, 500, cors);
      }
      try { await deps.rpc('mfa_auditar', { p_ator: ator, p_acao: 'mfa_fator_removido', p_detalhe: { via: 'codigo', removidos: rem.n } }); } catch (e) { /* já auditado ao consumir */ }
      return json({ ok: true, removidos: rem.n }, 200, cors);
    }

    if (corpo.acao === 'remover_dono') {
      if (typeof corpo.alvo !== 'string' || !UUID.test(corpo.alvo)) return json({ erro: 'Pedido inválido.' }, 400, cors);
      const r = await deps.rpc('mfa_autorizar_remocao', { p_ator: ator, p_alvo: corpo.alvo, p_aal: aal });
      if (r.error || !r.data) { log({ ev: 'erro_rpc', acao: 'remover_dono' }); return json({ erro: 'Não foi possível concluir. Tente mais tarde.' }, 500, cors); }
      if (r.data.estado !== 'ok') return json({ erro: 'Não autorizado.' }, 403, cors);
      let rem; try { rem = await removerFatores(corpo.alvo); } catch (e) { rem = { falhou: true, n: 0 }; }
      if (rem.falhou) { log({ ev: 'remocao_falhou', acao: 'remover_dono' }); return json({ erro: 'Não foi possível remover o autenticador. Tente de novo.' }, 500, cors); }
      try { await deps.rpc('mfa_auditar', { p_ator: ator, p_acao: 'mfa_fator_removido', p_detalhe: { via: 'super', alvo: corpo.alvo, removidos: rem.n } }); } catch (e) { /* ignora */ }
      return json({ ok: true, removidos: rem.n }, 200, cors);
    }
    return json({ erro: 'Pedido inválido.' }, 400, cors);
  } catch (e) {
    log({ ev: 'excecao' });   // nunca a mensagem nem o pedido (podem conter códigos ou tokens)
    return json({ erro: 'Erro interno.' }, 500, cors);
  }
}

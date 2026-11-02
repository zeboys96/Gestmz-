// Edge Function «recuperar-totp» (supabase/functions/recuperar-totp/logica.mjs): lógica testada em Node com dependências SIMULADAS.
// Prova o comportamento da função perante cada resposta do servidor. A semântica dos RPCs (uso único, limite, auditoria) está em tests/db/05_totp.sql.
// NÃO foi executada sob Deno nem contra um Supabase real.
const test = require('node:test'); const assert = require('node:assert'); const path = require('node:path'); const { pathToFileURL } = require('node:url');
const L = () => import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', 'recuperar-totp', 'logica.mjs')).href);

const U1 = '00000000-0000-4000-8000-0000000000a1', U2 = '00000000-0000-4000-8000-0000000000b1', U0 = '00000000-0000-4000-8000-0000000000a0';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, aal) => 'eyJhbGciOiJIUzI1NiJ9.' + b64({ sub, aal }) + '.assinatura_falsa';
const TOKENS = { [jwt(U1, 'aal1')]: { id: U1 }, [jwt(U0, 'aal2')]: { id: U0 }, [jwt(U0, 'aal1')]: { id: U0 } };
const CODIGO = 'abcd-1234-abcd-1234-abcd';

function mundo(opc) {
  opc = opc || {}; const w = { chamadas: [], logs: [], fatores: { [U1]: [{ id: 'f1', factor_type: 'totp', status: 'verified' }, { id: 'f1b', factor_type: 'totp', status: 'unverified' }], [U2]: [{ id: 'g1', factor_type: 'totp', status: 'verified' }] }, apagados: [] };
  w.deps = {
    origens: ['https://gestmz.exemplo'],
    getUser: async j => { w.chamadas.push(['getUser']); return TOKENS[j] || null; },
    rpc: async (n, a) => { w.chamadas.push(['rpc', n, a]); if (opc.rpcErro) throw new Error('boom ' + JSON.stringify(a)); return (opc.rpc && opc.rpc[n] ? opc.rpc[n](a) : { data: null, error: null }); },
    listarFatores: async u => { w.chamadas.push(['listar', u]); return w.fatores[u] || []; },
    apagarFator: async (u, id) => { w.chamadas.push(['apagar', u, id]); if (opc.apagarFalha) return { error: { message: 'falhou' } }; w.apagados.push(u + ':' + id); return { error: null }; },
    log: e => w.logs.push(e)
  };
  return w;
}
const pedido = (corpo, token, extra) => new Request('https://x.exemplo/functions/v1/recuperar-totp', Object.assign({ method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}, (extra && extra.headers) || {}), body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) }, extra && extra.init));
const rpcs = (w, n) => w.chamadas.filter(c => c[0] === 'rpc' && c[1] === n);
const T1 = jwt(U1, 'aal1');
const OK = id => ({ data: { estado: 'ok', id: id || 7 }, error: null });

test('função: sem sessão válida nada acontece', async () => {
  const { tratar } = await L();
  for (const [nome, req] of [['sem cabeçalho', pedido({ acao: 'codigo', codigo: CODIGO })], ['token vazio', pedido({ acao: 'codigo', codigo: CODIGO }, '')], ['esquema errado', pedido({ acao: 'codigo', codigo: CODIGO }, null, { headers: { authorization: 'Basic abc' } })], ['token desconhecido', pedido({ acao: 'codigo', codigo: CODIGO }, 'tok.en.falso')]]) {
    const w = mundo(); const r = await tratar(req, w.deps); assert.strictEqual(r.status, 401, nome); assert.deepStrictEqual(w.chamadas.filter(c => c[0] !== 'getUser'), [], nome + ': nenhuma operação');
  }
});

test('função: método, tamanho e formato do pedido', async () => {
  const { tratar } = await L(); let w = mundo();
  assert.strictEqual((await tratar(new Request('https://x.exemplo/', { method: 'GET' }), w.deps)).status, 405);
  assert.strictEqual((await tratar(pedido('x'.repeat(5000), T1), w.deps)).status, 413);
  assert.strictEqual((await tratar(pedido('não é json', T1), w.deps)).status, 400);
  assert.strictEqual((await tratar(pedido('[1,2]', T1), w.deps)).status, 400);
  assert.strictEqual((await tratar(pedido({ acao: 'apagar_tudo' }, T1), w.deps)).status, 400);
  for (const c of [undefined, null, 5, '', 'x'.repeat(65), {}, ['a']]) assert.strictEqual((await tratar(pedido({ acao: 'codigo', codigo: c }, T1), w.deps)).status, 400, 'código ' + JSON.stringify(c));
  assert.deepStrictEqual(w.chamadas.filter(c => c[0] === 'rpc' || c[0] === 'apagar'), [], 'nada foi consumido nem apagado');
});

test('função: CORS só para origens autorizadas', async () => {
  const { tratar } = await L(); const w = mundo();
  let r = await tratar(new Request('https://x.exemplo/', { method: 'OPTIONS', headers: { origin: 'https://gestmz.exemplo' } }), w.deps); assert.strictEqual(r.status, 204); assert.strictEqual(r.headers.get('access-control-allow-origin'), 'https://gestmz.exemplo');
  r = await tratar(new Request('https://x.exemplo/', { method: 'OPTIONS', headers: { origin: 'https://mau.exemplo' } }), w.deps); assert.strictEqual(r.headers.get('access-control-allow-origin'), null, 'origem desconhecida não recebe permissão');
  r = await tratar(pedido({ acao: 'x' }, T1, { headers: { origin: 'https://mau.exemplo' } }), w.deps); assert.strictEqual(r.headers.get('access-control-allow-origin'), null);
  assert.strictEqual((await tratar(pedido({ acao: 'x' }, T1), mundo().deps)).headers.get('cache-control'), 'no-store');
});

test('função: código válido remove os fatores do DONO DO TOKEN (nunca de outra conta) e audita', async () => {
  const { tratar } = await L(); const w = mundo({ rpc: { mfa_consumir_codigo: () => OK(7) } });
  const r = await tratar(pedido({ acao: 'codigo', codigo: CODIGO, user_id: U2, alvo: U2, p_user: U2 }, T1), w.deps);   // o corpo tenta apontar para outra conta
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(await r.json(), { ok: true, removidos: 2 });
  assert.deepStrictEqual(rpcs(w, 'mfa_consumir_codigo')[0][2], { p_user: U1, p_codigo: CODIGO }, 'o utilizador vem do token');
  assert.deepStrictEqual(w.apagados, [U1 + ':f1', U1 + ':f1b'], 'só os fatores do titular do token');
  assert.ok(!w.chamadas.some(c => (c[0] === 'listar' || c[0] === 'apagar') && c[1] === U2), 'a outra conta nunca é tocada');
  assert.strictEqual(rpcs(w, 'mfa_auditar')[0][2].p_acao, 'mfa_fator_removido'); assert.strictEqual(rpcs(w, 'mfa_auditar')[0][2].p_ator, U1);
});

test('função: código inválido, bloqueado ou sem permissão não remove nada, e «inválido» = «sem permissão» para quem pede', async () => {
  const { tratar } = await L(); const corpos = {};
  for (const [estado, esperado] of [['invalido', 400], ['sem_permissao', 400], ['bloqueado', 429], ['qualquer_coisa', 400]]) {
    const w = mundo({ rpc: { mfa_consumir_codigo: () => ({ data: { estado }, error: null }) } }); const r = await tratar(pedido({ acao: 'codigo', codigo: CODIGO }, T1), w.deps);
    assert.strictEqual(r.status, esperado, estado); corpos[estado] = await r.text(); assert.deepStrictEqual(w.apagados, [], estado + ': nada apagado'); assert.ok(!w.chamadas.some(c => c[0] === 'listar'), estado + ': nem listou fatores');
  }
  assert.strictEqual(corpos.invalido, corpos.sem_permissao, 'não revela se a conta pode usar a recuperação');
});

test('função: se o servidor falhar, não remove nada e não revela detalhes', async () => {
  const { tratar } = await L();
  let w = mundo({ rpcErro: true }); let r = await tratar(pedido({ acao: 'codigo', codigo: CODIGO }, T1), w.deps); assert.strictEqual(r.status, 500); assert.deepStrictEqual(w.apagados, []);
  assert.ok(!(await r.clone().text()).includes(CODIGO) && !(await r.clone().text()).includes('boom'), 'a resposta não leva o código nem a mensagem interna');
  w = mundo({ rpc: { mfa_consumir_codigo: () => ({ data: null, error: { message: 'erro SQL com segredo' } }) } }); r = await tratar(pedido({ acao: 'codigo', codigo: CODIGO }, T1), w.deps);
  assert.strictEqual(r.status, 500); assert.ok(!(await r.text()).includes('segredo'));
});

test('função: se a remoção do fator falhar, o código é DEVOLVIDO (o titular não fica sem código)', async () => {
  const { tratar } = await L(); const w = mundo({ apagarFalha: true, rpc: { mfa_consumir_codigo: () => OK(42) } });
  const r = await tratar(pedido({ acao: 'codigo', codigo: CODIGO }, T1), w.deps); assert.strictEqual(r.status, 500);
  assert.deepStrictEqual(rpcs(w, 'mfa_devolver_codigo').map(c => c[2]), [{ p_user: U1, p_id: 42 }], 'devolveu o código certo, da conta certa');
  assert.strictEqual(rpcs(w, 'mfa_auditar').length, 0, 'não audita uma remoção que não aconteceu');
});

test('função: o dono do sistema com aal2 remove o fator de UM dono de loja; sem aal2 ou fora das regras, não', async () => {
  const { tratar } = await L();
  // o servidor decide; aqui simula-se o contrato de mfa_autorizar_remocao
  const decide = a => ({ data: { estado: a.p_aal === 'aal2' && a.p_ator === U0 && a.p_alvo === U2 ? 'ok' : 'recusado' }, error: null });
  let w = mundo({ rpc: { mfa_autorizar_remocao: decide } }); let r = await tratar(pedido({ acao: 'remover_dono', alvo: U2 }, jwt(U0, 'aal2')), w.deps);
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(w.apagados, [U2 + ':g1']); assert.deepStrictEqual(rpcs(w, 'mfa_autorizar_remocao')[0][2], { p_ator: U0, p_alvo: U2, p_aal: 'aal2' }, 'aal vem do token verificado');
  assert.strictEqual(rpcs(w, 'mfa_auditar')[0][2].p_detalhe.via, 'super');
  w = mundo({ rpc: { mfa_autorizar_remocao: decide } }); r = await tratar(pedido({ acao: 'remover_dono', alvo: U2 }, jwt(U0, 'aal1')), w.deps);
  assert.strictEqual(r.status, 403); assert.deepStrictEqual(w.apagados, [], 'sem aal2 nada é apagado'); assert.strictEqual(rpcs(w, 'mfa_autorizar_remocao')[0][2].p_aal, 'aal1');
  w = mundo({ rpc: { mfa_autorizar_remocao: decide } }); r = await tratar(pedido({ acao: 'remover_dono', alvo: U2 }, T1), w.deps);   // um dono de loja tenta remover o fator de outro
  assert.strictEqual(r.status, 403); assert.deepStrictEqual(w.apagados, []);
  for (const alvo of [undefined, 'não-uuid', 5, "'; drop table x;--", U2.toUpperCase().slice(0, 30)]) { w = mundo({ rpc: { mfa_autorizar_remocao: decide } }); r = await tratar(pedido({ acao: 'remover_dono', alvo }, jwt(U0, 'aal2')), w.deps); assert.strictEqual(r.status, 400, 'alvo ' + alvo); assert.strictEqual(rpcs(w, 'mfa_autorizar_remocao').length, 0); }
  // token com claim aal falsificado no corpo: o corpo não é lido para o aal
  w = mundo({ rpc: { mfa_autorizar_remocao: decide } }); r = await tratar(pedido({ acao: 'remover_dono', alvo: U2, aal: 'aal2', p_aal: 'aal2' }, jwt(U0, 'aal1')), w.deps); assert.strictEqual(r.status, 403);
});

test('função: o aal é lido do token; tokens malformados dão vazio (nunca aal2)', async () => {
  const { aalDoToken } = await L();
  assert.strictEqual(aalDoToken(jwt(U0, 'aal2')), 'aal2'); assert.strictEqual(aalDoToken(jwt(U0, 'aal1')), 'aal1'); assert.strictEqual(aalDoToken(jwt(U0)), '');
  for (const x of ['', 'a', 'a.b', 'a.!!!.c', 'a.' + b64('texto') + '.c', null, undefined, 42]) assert.strictEqual(aalDoToken(x), '', String(x));
  assert.strictEqual(aalDoToken('a.' + b64({ aal: { x: 'aal2' } }) + '.c'), '', 'aal não-texto não conta');
});

test('função: nenhum segredo (código, token) aparece nos registos nem nas respostas', async () => {
  const { tratar } = await L(); const cenarios = [{ rpcErro: true }, { apagarFalha: true, rpc: { mfa_consumir_codigo: () => OK(1) } }, { rpc: { mfa_consumir_codigo: () => ({ data: { estado: 'invalido' } }) } }, { rpc: { mfa_consumir_codigo: () => OK(2) } }];
  for (const c of cenarios) {
    const w = mundo(c); const r = await tratar(pedido({ acao: 'codigo', codigo: CODIGO }, T1), w.deps), t = await r.text(), logs = JSON.stringify(w.logs);
    for (const s of [CODIGO, CODIGO.replace(/-/g, ''), T1, 'assinatura_falsa', 'boom']) { assert.ok(!t.includes(s), 'resposta sem ' + s); assert.ok(!logs.includes(s), 'registos sem ' + s); }
  }
  const w = mundo({ getUser: null }); w.deps.getUser = async () => { throw new Error('rede em baixo: ' + T1); };
  const r = await tratar(pedido({ acao: 'codigo', codigo: CODIGO }, T1), w.deps); assert.strictEqual(r.status, 500); assert.ok(!(await r.text()).includes(T1)); assert.ok(!JSON.stringify(w.logs).includes(T1));
});

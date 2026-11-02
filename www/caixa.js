'use strict';
/* GestMZ — fecho de caixa.
   Cada funcionário fecha o seu caixa. Os totais são calculados e gravados no servidor (os números mostrados antes de confirmar são os que ficam),
   o fecho confirmado não se altera nem se apaga, e só o dono pode reabri-lo (o fecho original fica guardado).
   Sem internet, a contagem fica neste aparelho como PENDENTE e segue sozinha quando a ligação voltar (a mesma referência impede duplicados).
   Um fecho só aparece como confirmado depois de o servidor responder. */

const FECHO_K = 'gestmz_fechos';
const lerFechos = () => jGet(FECHO_K, []);
const fechosPendentes = () => lerFechos().filter(x => S.perfil && x.uid === S.perfil.id);
const difTxt = d => { d = r2(+d || 0); return d === 0 ? 'sem diferença' : d < 0 ? 'falta ' + mt(-d) : 'excesso ' + mt(d); };
const difCls = d => { d = r2(+d || 0); return d === 0 ? 'dif-ok' : d < 0 ? 'dif-mau' : 'dif-exc'; };
const semFuncaoFecho = e => semFuncao(e) || /relation .*caixa_fechos.* does not exist|Could not find the table/i.test(String((e && e.message) || ''));

function enfileirarFecho(ref, d) {
  const f = lerFechos();
  f.push({ ref, uid: S.perfil.id, loja: S.perfil.loja_id, contado: d.contado, obs: d.obs || null, fundo: d.fundo || 0, data: new Date().toISOString(), erro: null });
  if (!jSet(FECHO_K, f)) throw new Error('Não há espaço neste aparelho para guardar o fecho. Ligue-se à internet.');
  netUpdate();
}
let fechoSincA = false;
async function sincronizarFechos() {
  if (fechoSincA || !S.perfil || S.perfil.papel === 'super' || !navigator.onLine) return 0;
  const pend = fechosPendentes().filter(x => !x.erro); if (!pend.length) return 0;
  fechoSincA = true; let ok = 0;
  try {
    for (const it of pend) {
      try {
        const r = await q(sb.rpc('fechar_caixa', { p_contado: it.contado, p_obs: it.obs || null, p_fundo: it.fundo || 0, p_ref: it.ref, p_data: it.data }));
        jSet(FECHO_K, lerFechos().filter(x => x.ref !== it.ref)); ok++; toast(r && r.repetido ? 'O fecho de caixa já estava registado.' : 'Caixa fechado com sucesso.');
      } catch (e) {
        if (ehRede(e) || /sem acesso|jwt|sessão|autentic/i.test(e.message)) break;
        const f = lerFechos(), x = f.find(y => y.ref === it.ref); if (x) { x.erro = e.message; jSet(FECHO_K, f); }   // recusado pelo servidor: fica visível, não se repete
      }
    }
  } finally { fechoSincA = false; }
  netUpdate(); if (cur === 'fecho' || cur === 'fechos') go(cur, true);
  return ok;
}
/* grava o fecho; devolve { confirmado: true, fecho } ou { confirmado: false } (guardado neste aparelho, por confirmar) */
async function fecharCaixa(d) {
  const ref = uuid();
  try {
    if (!navigator.onLine) throw new Error(SEM_NET);
    const r = await q(sb.rpc('fechar_caixa', { p_contado: d.contado, p_obs: d.obs || null, p_fundo: d.fundo || 0, p_ref: ref }));
    return { confirmado: true, fecho: r };
  } catch (e) { if (!ehRede(e)) throw e; enfileirarFecho(ref, d); return { confirmado: false }; }
}

const linhaFecho = (k, v, cls) => `<div class="tot ${cls || ''}"><span>${k}</span><span>${v}</span></div>`;
function resumoHTML(c) {
  const met = Object.entries(c.por_metodo || {}).filter(([k]) => k !== 'Numerário' && k !== 'Fiado');
  return `${linhaFecho('Data do movimento', esc(fd(c.data_mov)))}${linhaFecho('Caixa', esc(c.caixa_nome))}${linhaFecho('Funcionário', esc(c.usuario_nome))}
    ${linhaFecho('Desde', esc(fdt(c.inicio)))}${linhaFecho('Vendas concluídas', esc(c.n_vendas))}${linhaFecho('Total vendido', `<b>${mt(c.total_vendido)}</b>`)}
    ${linhaFecho('Recebido em dinheiro (vendas)', mt(c.dinheiro))}${+c.recebimentos_dinheiro ? linhaFecho('Dívidas recebidas em dinheiro', mt(c.recebimentos_dinheiro)) : ''}
    ${linhaFecho('Recebido por outros métodos', mt(c.outros))}${met.map(([k, v]) => linhaFecho('&nbsp;&nbsp;' + esc(k), mt(v), 'muted small')).join('')}${+c.fiado ? linhaFecho('Vendido a fiado (por receber)', mt(c.fiado), 'muted') : ''}
    ${+c.n_anuladas ? linhaFecho('Vendas canceladas', `${esc(c.n_anuladas)} · ${mt(c.total_anuladas)}`, 'muted') : ''}`;
}

VIEWS.fecho = async function () {
  const m = $('#main'), pend = fechosPendentes(), online = navigator.onLine;
  if (online) { try { await sincronizarFila(); } catch (e) { /* ok */ } }
  let c = null, falha = '';
  if (online) { try { c = await q(sb.rpc('resumo_caixa')); } catch (e) { falha = semFuncaoFecho(e) ? 'O fecho de caixa ainda não está disponível neste servidor.' : e.message; } }
  const pendentes = minhaFila().filter(x => !x.erro).length;
  const hist = online && !falha ? await q(sb.from('caixa_fechos').select('*').order('fim', { ascending: false }).limit(8)).catch(() => []) : [];
  m.innerHTML = `<div class="bar"><h2>Fechar caixa</h2><span class="muted">${esc(S.perfil.nome)} · ${PAPEL[S.perfil.papel]}</span></div>
  ${pend.length ? `<div class="msg ${pend.some(x => x.erro) ? 'bad' : ''}"><b>Fecho pendente neste aparelho.</b> ${pend.some(x => x.erro) ? 'O servidor recusou: ' + esc(pend.find(x => x.erro).erro) : 'Ainda <b>não está confirmado</b>: segue sozinho quando houver internet.'}${pend.some(x => x.erro) ? ' <button type="button" class="link" id="fcDesc">Descartar</button>' : ''}</div>` : ''}
  ${falha ? `<div class="msg bad">${esc(falha)}</div>` : ''}
  ${!online ? '<div class="msg">Sem internet. Pode registar a contagem do dinheiro agora: o servidor calcula os totais e só confirma o fecho quando a ligação voltar.</div>' : ''}
  ${pendentes ? `<div class="msg">Há ${pendentes} venda(s) feita(s) sem internet por enviar. O fecho só conta as vendas que já chegaram ao servidor — espere que sigam antes de fechar.</div>` : ''}
  <div class="cols"><div class="card"><h3>Resumo do movimento</h3>${c ? resumoHTML(c) : '<div class="empty">O resumo aparece quando houver ligação ao servidor.</div>'}</div>
  <form class="card" id="fcForm" novalidate><h3>Contagem do dinheiro</h3>
    <label>Valor inicial do caixa (MT, se começou com troco)<input class="in" name="fundo" inputmode="decimal" value="0" autocomplete="off"></label>
    <label>Dinheiro contado na gaveta (MT) *<input class="in" name="contado" inputmode="decimal" placeholder="0,00" autocomplete="off" required><span class="ferr" id="fcErr" role="alert"></span></label>
    <div id="fcCalc" class="calc" aria-live="polite"></div>
    <label>Observação (opcional, útil se houver diferença)<input class="in" name="obs" maxlength="500" autocomplete="off" placeholder="Ex.: troco dado a mais"></label>
    <button class="btn block" id="fcRever" type="submit" ${c && c.ja_fechado || pend.length ? 'disabled' : ''}>Rever e fechar caixa</button>
    ${c && c.ja_fechado ? '<p class="muted small">Este caixa já está fechado e não há movimento novo desde o último fecho.</p>' : ''}</form></div>
  ${hist.length ? `<div class="card"><h3>Os meus últimos fechos</h3>${fechosTabela(hist, false)}</div>` : ''}`;
  const f = $('#fcForm'), esperado = () => r2(num(f.fundo.value) + (c ? +c.dinheiro + +c.recebimentos_dinheiro : 0));
  const calc = () => {
    const txt = f.contado.value.trim(); if (!txt) { $('#fcCalc').innerHTML = c ? `Esperado na gaveta: <b>${mt(esperado())}</b>` : ''; return; }
    if (!c) { $('#fcCalc').innerHTML = `Contado: <b>${mt(num(txt))}</b>`; return; }
    const d = r2(num(txt) - esperado()); $('#fcCalc').innerHTML = `Esperado: <b>${mt(esperado())}</b> · Contado: <b>${mt(num(txt))}</b><br><span class="${difCls(d)}">Diferença: <b>${difTxt(d)}</b></span>`;
  };
  f.addEventListener('input', calc); calc();
  const dd = $('#fcDesc'); if (dd) dd.onclick = () => { jSet(FECHO_K, lerFechos().filter(x => !(S.perfil && x.uid === S.perfil.id && x.erro))); netUpdate(); go('fecho', true); };
  f.onsubmit = async e => {
    e.preventDefault(); const er = $('#fcErr'); er.textContent = '';
    if (!f.contado.value.trim() || !(num(f.contado.value) >= 0) || isNaN(parseFloat(String(f.contado.value).replace(',', '.')))) { er.textContent = 'Indique o dinheiro que contou na gaveta (pode ser 0).'; f.contado.focus(); return; }
    if (num(f.fundo.value) < 0) { er.textContent = 'O valor inicial não pode ser negativo.'; return; }
    let cf = c;
    if (navigator.onLine && c) { try { cf = await q(sb.rpc('resumo_caixa')); } catch (x) { return erro(x); } }   // valores frescos antes de confirmar
    if (cf && cf.ja_fechado) return toast('Este caixa já está fechado.', true);
    confirmarFecho(cf, { contado: r2(num(f.contado.value)), obs: f.obs.value.trim(), fundo: r2(num(f.fundo.value)) });
  };
};
function confirmarFecho(c, d) {
  const esp = c ? r2(d.fundo + +c.dinheiro + +c.recebimentos_dinheiro) : null, dif = c ? r2(d.contado - esp) : null;
  modal('Confirmar o fecho do caixa', `<p class="muted small">Confirme só depois de contar o dinheiro. Um fecho confirmado <b>não se pode alterar</b>; só o dono o pode reabrir.</p>
    ${c ? resumoHTML(c) : '<div class="msg">Sem internet: os totais serão calculados pelo servidor quando o fecho for enviado.</div>'}
    ${linhaFecho('Valor inicial', mt(d.fundo))}${c ? linhaFecho('Esperado em dinheiro', `<b>${mt(esp)}</b>`) : ''}${linhaFecho('Contado na gaveta', `<b>${mt(d.contado)}</b>`)}
    ${c ? linhaFecho('Diferença', `<b class="${difCls(dif)}">${difTxt(dif)}</b>`, 'big') : ''}${d.obs ? linhaFecho('Observação', esc(d.obs)) : ''}`,
    { okText: navigator.onLine ? 'Confirmar fecho' : 'Guardar fecho (envia depois)', danger: dif != null && dif !== 0, wide: false,
      onOk: async () => {
        const r = await fecharCaixa(d);
        if (r.confirmado) fechoConfirmado(r.fecho, c && +r.fecho.esperado !== esp);
        else { toast('Fecho guardado neste aparelho. Ainda não está confirmado: segue quando houver internet.'); go('fecho', true); }
      } });
}
function fechoConfirmado(f, mudou) {
  $('#main').innerHTML = `<div class="card fecho-ok"><h2>Caixa fechado com sucesso.</h2>${f.repetido ? '<p class="muted">Este fecho já estava registado.</p>' : ''}${mudou ? '<div class="msg">O movimento mudou entre a pré-visualização e a confirmação. Os valores abaixo são os que ficaram gravados.</div>' : ''}
    ${linhaFecho('Caixa', esc(f.caixa_nome))}${linhaFecho('Funcionário', esc(f.usuario_nome))}${linhaFecho('Data e hora', esc(fdt(f.fim)))}${linhaFecho('Vendas', esc(f.n_vendas) + ' · ' + mt(f.total_vendido))}
    ${linhaFecho('Em dinheiro', mt(f.dinheiro))}${linhaFecho('Outros métodos', mt(f.outros))}${linhaFecho('Esperado', mt(f.esperado))}${linhaFecho('Contado', mt(f.contado))}
    ${linhaFecho('Diferença', `<b class="${difCls(f.diferenca)}">${difTxt(f.diferenca)}</b>`, 'big')}${f.obs ? linhaFecho('Observação', esc(f.obs)) : ''}
    <div class="row" style="margin-top:14px"><button class="btn" id="fcOk" type="button">Concluir</button></div></div>`;
  $('#fcOk').onclick = () => go(S.perfil.papel === 'dono' ? 'fechos' : 'pdv');
}

/* tabela de fechos (dono: todos; os outros: só os seus, o servidor filtra) */
function fechosTabela(l, acoes) {
  return `<div class="tw"><table><tr><th>Fecho</th><th>Caixa</th><th class="n">Vendas</th><th class="n">Dinheiro</th><th class="n">Contado</th><th class="n">Diferença</th><th>Estado</th>${acoes ? '<th></th>' : ''}</tr>${l.map(f => `<tr class="${f.estado === 'reaberto' ? 'off' : ''}"><td>${esc(fdt(f.fim))}</td><td>${esc(f.caixa_nome)}<br><span class="muted small">${esc(f.usuario_nome)}</span></td><td class="n">${esc(f.n_vendas)}<br><span class="muted small">${mt(f.total_vendido)}</span></td><td class="n">${mt(f.dinheiro)}</td><td class="n">${mt(f.contado)}</td><td class="n ${difCls(f.diferenca)}">${difTxt(f.diferenca)}</td><td>${f.estado === 'reaberto' ? '<span class="tag baixo">reaberto</span>' : '<span class="tag ok">fechado</span>'}</td>${acoes ? `<td class="act"><button class="btn ghost sm" type="button" data-f="${f.id}">Ver</button></td>` : ''}</tr>`).join('')}</table></div>`;
}
VIEWS.fechos = async function () {
  const m = $('#main'); let l;
  try { l = await all(() => sb.from('caixa_fechos').select('*').order('fim', { ascending: false })); }
  catch (e) { m.innerHTML = `<div class="bar"><h2>Fechos de caixa</h2></div><div class="msg bad">${esc(semFuncaoFecho(e) ? 'O fecho de caixa ainda não está disponível neste servidor.' : e.message)}</div>`; return; }
  let quem = '';
  const nomes = [...new Map(l.map(f => [f.usuario_id, f.usuario_nome])).entries()];
  m.innerHTML = `<div class="bar"><h2>Fechos de caixa</h2><div class="act"><button class="btn" id="fMeu" type="button">${ico('caixa', 18)} Fechar o meu caixa</button></div></div>
    ${fechosPendentes().length ? '<div class="msg"><b>Fecho pendente neste aparelho</b>, ainda não confirmado pelo servidor.</div>' : ''}
    <div class="card"><div class="row"><label>Funcionário<select class="in" id="fQuem"><option value="">Todos</option>${opts(nomes.map(([id, n]) => [id, n]))}</select></label></div><div id="fTab"></div>
    <p class="muted small">Fechar um caixa não fecha os outros, e não encerra o dia da loja. Os fechos confirmados não se alteram nem se apagam; a reabertura fica registada.</p></div>`;
  const ultimo = f => !l.some(x => x.usuario_id === f.usuario_id && x.estado === 'fechado' && x.fim > f.fim);
  const draw = () => { const v = l.filter(f => !quem || f.usuario_id === quem); $('#fTab').innerHTML = v.length ? fechosTabela(v, true) : '<div class="empty">Ainda não há fechos de caixa.</div>'; };
  draw(); $('#fQuem').onchange = e => { quem = e.target.value; draw(); }; $('#fMeu').onclick = () => go('fecho');
  $('#fTab').onclick = e => {
    const b = e.target.closest('button[data-f]'); if (!b) return; const f = l.find(x => x.id === b.dataset.f); if (!f) return;
    const pode = f.estado === 'fechado' && ultimo(f), met = Object.entries(f.por_metodo || {});
    const w = modal('Fecho de ' + esc(f.caixa_nome), `${linhaFecho('Funcionário', esc(f.usuario_nome))}${linhaFecho('Movimento', esc(fdt(f.inicio)) + ' → ' + esc(fdt(f.fim)))}${linhaFecho('Vendas', esc(f.n_vendas) + ' · ' + mt(f.total_vendido))}
      ${linhaFecho('Em dinheiro', mt(f.dinheiro))}${+f.recebimentos_dinheiro ? linhaFecho('Dívidas recebidas em dinheiro', mt(f.recebimentos_dinheiro)) : ''}${linhaFecho('Outros métodos', mt(f.outros))}${met.filter(([k]) => k !== 'Numerário' && k !== 'Fiado').map(([k, v]) => linhaFecho('&nbsp;&nbsp;' + esc(k), mt(v), 'muted small')).join('')}
      ${+f.fiado ? linhaFecho('A fiado', mt(f.fiado), 'muted') : ''}${+f.n_anuladas ? linhaFecho('Vendas canceladas', esc(f.n_anuladas) + ' · ' + mt(f.total_anuladas)) : ''}
      ${linhaFecho('Valor inicial', mt(f.fundo_inicial))}${linhaFecho('Esperado', mt(f.esperado))}${linhaFecho('Contado', mt(f.contado))}${linhaFecho('Diferença', `<b class="${difCls(f.diferenca)}">${difTxt(f.diferenca)}</b>`, 'big')}
      ${f.obs ? linhaFecho('Observação', esc(f.obs)) : ''}${f.estado === 'reaberto' ? `<div class="msg" style="margin-top:10px">Reaberto por ${esc(f.reaberto_por)} em ${esc(fdt(f.reaberto_em))}: ${esc(f.reaberto_motivo)}</div>` : ''}
      ${pode ? '<div class="mf"><button type="button" class="btn red" id="fReab">Reabrir este caixa</button></div>' : ''}`, {});
    const r = $('#fReab', w.m); if (r) r.onclick = () => { w.close(); reabrirCaixa(f); };
  };
};
function reabrirCaixa(f) {
  modal('Reabrir o caixa de ' + esc(f.usuario_nome), `<p class="muted small">O fecho de ${esc(fdt(f.fim))} <b>fica guardado</b> no histórico; só o seu estado passa a «reaberto». O funcionário poderá fechar de novo, e o movimento volta a contar desde o fecho anterior.</p>${fld('Motivo da reabertura', 'motivo', '', 'text', 'required maxlength="300" placeholder="Ex.: faltou registar um recebimento"')}`, {
    okText: 'Reabrir', danger: true,
    onOk: async d => { if (!d.motivo.trim()) throw new Error('Indique o motivo.'); await q(sb.rpc('reabrir_caixa', { p_fecho: f.id, p_motivo: d.motivo.trim() })); toast('Caixa reaberto. Fica registado.'); go('fechos', true); }
  });
}

'use strict';
/* GestMZ — painel do dono do sistema (você): lojas, comprovativos e preços */
S.lojas = []; S.pf = []; S.pags = [];
async function carregarSuper() {
  const [pl, lj, pf, pg] = await Promise.all([
    q(sb.from('plataforma').select('*')),
    all(() => sb.from('lojas').select('*').order('criado_em', { ascending: false })),
    all(() => sb.from('perfis').select('id,loja_id,papel,ativo,nome')),
    all(() => sb.from('pagamentos_assinatura').select('*').order('criado_em', { ascending: false }))
  ]);
  S.plat = pl[0]; S.lojas = lj; S.pf = pf; S.pags = pg;
}
const pendentes = () => S.pags.filter(p => p.estado === 'pendente');
function estadoLoja(l) { if (l.estado === 'suspensa') return 'suspensa'; if (diasPara(l.valido_ate) < 0) return 'expirada'; return l.estado; }
const TXT_ESTADO = { teste: 'Em teste', ativa: 'Ativa', expirada: 'Expirada', suspensa: 'Suspensa', pendente: 'Pendente', confirmado: 'Confirmado', rejeitado: 'Rejeitado' };
const nomeLoja = id => { const l = S.lojas.find(x => x.id === id); return l ? l.nome : '—'; };

function iniciarSuperRT() {
  pararRT();
  badge('s_pagamentos', pendentes().length);
  try {
    const ch = sb.channel('super').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pagamentos_assinatura' }, async () => {
      await carregarSuper(); badge('s_pagamentos', pendentes().length); bip(); toast('Novo comprovativo de pagamento recebido.');
      if (cur === 's_pagamentos' || cur === 's_lojas') go(cur, true);
    }).subscribe();
    canais.push(ch);
  } catch (e) { /* sem tempo real */ }
  poll = setInterval(async () => {
    try { const antes = pendentes().length; await carregarSuper(); const n = pendentes().length; badge('s_pagamentos', n); if (n > antes) { bip(); toast('Novo comprovativo de pagamento recebido.'); if (cur === 's_pagamentos' || cur === 's_lojas') go(cur, true); } } catch (e) { /* ok */ }
  }, 60000);
}

VIEWS.s_lojas = async function () {
  await carregarSuper(); badge('s_pagamentos', pendentes().length);
  const mes = ymd().slice(0, 8) + '01';
  const receita = r2(S.pags.filter(p => p.estado === 'confirmado' && p.confirmado_em && ymd(new Date(p.confirmado_em)) >= mes).reduce((s, p) => s + +p.valor, 0));
  const cont = { ativa: 0, teste: 0, expirada: 0, suspensa: 0 }; S.lojas.forEach(l => cont[estadoLoja(l)]++);
  const pend = pendentes().length;
  $('#main').innerHTML = `<div class="bar"><h2>Lojas</h2><span class="muted">${S.lojas.length} registadas</span></div>
  <div class="grid">
    <div class="stat hi"><span>Recebido este mês</span><b>${mt(receita)}</b></div>
    <div class="stat ok"><span>Lojas ativas</span><b>${cont.ativa}</b></div>
    <div class="stat warn"><span>Em teste grátis</span><b>${cont.teste}</b></div>
    <div class="stat bad"><span>Expiradas / suspensas</span><b>${cont.expirada + cont.suspensa}</b></div>
    <div class="stat ${pend ? 'warn' : ''}"><span>Comprovativos por confirmar</span><b>${pend}</b></div>
  </div>
  <div class="card">${S.lojas.length ? `<div class="tw"><table><tr><th>Loja</th><th>Código</th><th class="n">Equipa</th><th>Estado</th><th>Válida até</th><th></th></tr>${S.lojas.map(l => {
    const e = estadoLoja(l), d = diasPara(l.valido_ate), n = S.pf.filter(p => p.loja_id === l.id && p.ativo).length;
    return `<tr><td><b>${esc(l.nome)}</b><br><span class="muted small">${esc(l.tipo)} · ${esc(l.tel || 'sem telefone')}</span></td><td>${esc(l.codigo)}</td><td class="n">${n}</td><td><span class="tag ${e}">${TXT_ESTADO[e]}</span></td><td>${fd(l.valido_ate)}<br><span class="muted small">${d >= 0 ? d + ' dia(s)' : 'há ' + (-d) + ' dia(s)'}</span></td>
    <td class="act"><button class="btn ghost sm" data-a="ver" data-id="${l.id}">Ver</button><button class="btn ghost sm" data-a="dias" data-id="${l.id}">+30 dias</button><button class="btn ghost sm" data-a="susp" data-id="${l.id}">${l.estado === 'suspensa' ? 'Reativar' : 'Suspender'}</button></td></tr>`;
  }).join('')}</table></div>` : '<div class="empty">Ainda não há lojas registadas. Quando alguém criar uma loja, ela aparece aqui.</div>'}</div>`;
  $('#main').onclick = async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const l = S.lojas.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'ver') return verLoja(l);
    if (b.dataset.a === 'dias') return ask(`Dar mais 30 dias grátis a «${l.nome}»?`, async () => {
      const base = diasPara(l.valido_ate) < 0 ? new Date() : new Date(l.valido_ate + 'T12:00:00'); base.setDate(base.getDate() + 30);
      await q(sb.from('lojas').update({ valido_ate: ymd(base) }).eq('id', l.id)); toast('30 dias adicionados.'); go('s_lojas', true);
    }, 'Dar 30 dias');
    if (b.dataset.a === 'susp') {
      const susp = l.estado === 'suspensa';
      ask(susp ? `Reativar «${l.nome}»?` : `Suspender «${l.nome}»? Ninguém da loja poderá vender.`, async () => {
        const novo = susp ? (S.pags.some(p => p.loja_id === l.id && p.estado === 'confirmado') ? 'ativa' : 'teste') : 'suspensa';
        await q(sb.from('lojas').update({ estado: novo }).eq('id', l.id)); toast(susp ? 'Loja reativada.' : 'Loja suspensa.'); go('s_lojas', true);
      }, susp ? 'Reativar' : 'Suspender', !susp);
    }
  };
};
function verLoja(l) {
  const eq = S.pf.filter(p => p.loja_id === l.id), pg = S.pags.filter(p => p.loja_id === l.id);
  modal(esc(l.nome), `<p class="muted">${esc(l.tipo)} · NUIT ${esc(l.nuit || '—')} · ${esc(l.tel || '—')}<br>${esc(l.endereco || '')}<br>Código da loja: <b>${esc(l.codigo)}</b> · Registada em ${fd(l.criado_em)}</p>
  <h3>Equipa (${eq.filter(p => p.ativo).length} ativos)</h3><p>${eq.map(p => `${esc(p.nome)} (${PAPEL[p.papel]})`).join(', ') || '—'}</p>
  <h3>Pagamentos</h3>${pg.length ? `<table>${pg.map(p => `<tr><td>${fd(p.criado_em)}</td><td>${esc(p.plano)}</td><td class="n">${mt(p.valor)}</td><td><span class="tag ${p.estado}">${TXT_ESTADO[p.estado]}</span></td></tr>`).join('')}</table>` : '<p class="muted">Sem pagamentos.</p>'}`, {});
}

VIEWS.s_pagamentos = async function () {
  await carregarSuper(); badge('s_pagamentos', pendentes().length);
  const pend = pendentes(), hist = S.pags.filter(p => p.estado !== 'pendente');
  $('#main').innerHTML = `<div class="bar"><h2>Pagamentos</h2><span class="muted">${S.plat.metodo} · ${esc(S.plat.numero)} · ${esc(S.plat.titular)}</span></div>
  <h3>Por confirmar (${pend.length})</h3>
  ${pend.length ? `<div class="cols">${pend.map(p => `<div class="card"><div class="bar" style="margin-bottom:6px"><b>${esc(nomeLoja(p.loja_id))}</b><span class="tag pendente">Pendente</span></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:8px"><div><span class="muted small">Plano</span><br><b>${esc(p.plano)} (${p.meses} ${p.meses === 1 ? 'mês' : 'meses'})</b></div><div><span class="muted small">Valor</span><br><b>${mt(p.valor)}</b></div></div>
    <p class="small muted">Enviado ${fdt(p.criado_em)}<br>Referência: ${esc(p.referencia || '—')}</p>
    <div class="act" style="justify-content:flex-start"><button class="btn ghost sm" data-a="ver" data-id="${p.id}">Ver comprovativo</button><button class="btn sm" data-a="ok" data-id="${p.id}">Confirmar pagamento</button><button class="btn red sm" data-a="no" data-id="${p.id}">Rejeitar</button></div></div>`).join('')}</div>` : '<div class="card empty">Nenhum comprovativo à espera. Quando uma loja enviar, recebe aqui um aviso.</div>'}
  <h3 style="margin-top:22px">Histórico</h3><div class="card">${hist.length ? `<div class="tw"><table><tr><th>Data</th><th>Loja</th><th>Plano</th><th class="n">Valor</th><th>Estado</th></tr>${hist.map(p => `<tr><td>${fd(p.criado_em)}</td><td>${esc(nomeLoja(p.loja_id))}</td><td>${esc(p.plano)}</td><td class="n">${mt(p.valor)}</td><td><span class="tag ${p.estado}">${TXT_ESTADO[p.estado]}</span>${p.nota ? `<br><span class="small muted">${esc(p.nota)}</span>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="empty">Sem histórico.</div>'}</div>`;
  $('#main').onclick = async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const p = S.pags.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'ver') {
      b.disabled = true;
      try { const r = await q(sb.from('comprovativos').select('imagem').eq('pagamento_id', p.id)); modal('Comprovativo — ' + esc(nomeLoja(p.loja_id)), r[0] ? `<img class="proof" src="${esc(r[0].imagem)}" alt="Comprovativo de pagamento">` : '<p>Sem imagem.</p>', { wide: true }); } catch (err) { erro(err); }
      b.disabled = false; return;
    }
    if (b.dataset.a === 'ok') return ask(`Confirmar ${mt(p.valor)} de «${nomeLoja(p.loja_id)}»? A loja fica com o plano ${p.plano} ativo.`, async () => { await q(sb.rpc('confirmar_pagamento', { p_id: p.id })); toast('Pagamento confirmado. A loja já tem acesso.'); go('s_pagamentos', true); }, 'Confirmar');
    if (b.dataset.a === 'no') modal('Rejeitar pagamento', fld('Motivo (a loja vai ver)', 'nota', '', 'text', 'required placeholder="Ex.: valor não recebido"'), { okText: 'Rejeitar', danger: true, onOk: async d => { await q(sb.rpc('rejeitar_pagamento', { p_id: p.id, p_nota: d.nota })); toast('Pagamento rejeitado.'); go('s_pagamentos', true); } });
  };
};

VIEWS.s_config = async function () {
  await carregarSuper(); const p = S.plat;
  $('#main').innerHTML = `<div class="bar"><h2>Preços e conta de recebimento</h2></div>
  <form class="card" id="f"><h3>Para onde as lojas pagam</h3>
    <div class="row">${fld('Nome do titular', 'titular', p.titular, 'text', 'required')}${fld('Número', 'numero', p.numero, 'text', 'required')}<label>Método<select class="in" name="metodo">${opts(['e-Mola', 'M-Pesa', 'mKesh'], p.metodo)}</select></label></div>
    <h3 style="margin-top:6px">Preços da assinatura (MT)</h3>
    <div class="row">${fld('Mensal', 'preco_mensal', p.preco_mensal, 'text', 'inputmode="decimal" required')}${fld('Trimestral (3 meses)', 'preco_trimestral', p.preco_trimestral, 'text', 'inputmode="decimal" required')}${fld('Anual (12 meses)', 'preco_anual', p.preco_anual, 'text', 'inputmode="decimal" required')}</div>
    ${fld('Dias de teste grátis para lojas novas', 'teste_dias', p.teste_dias, 'number', 'min="0" max="90" required')}
    <p class="muted small">Estes valores aparecem na página de assinatura de cada loja. As lojas que já pagaram não mudam.</p>
    <button class="btn">Guardar</button></form>`;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try {
      await q(sb.from('plataforma').update({ titular: d.titular.trim(), numero: d.numero.trim(), metodo: d.metodo, preco_mensal: num(d.preco_mensal), preco_trimestral: num(d.preco_trimestral), preco_anual: num(d.preco_anual), teste_dias: parseInt(d.teste_dias) || 0 }).eq('id', 1));
      toast('Guardado.'); await carregarSuper();
    } catch (err) { erro(err); }
  };
};

'use strict';
/* GestMZ — painel do dono do sistema (você): lojas, comprovativos e preços */
S.lojas = []; S.pf = []; S.pags = []; S.tks = [];
async function carregarSuper() {
  const [pl, lj, pf, pg, tk] = await Promise.all([
    q(sb.from('plataforma').select('*')),
    lerLista('admin_listar_lojas', {}, () => sb.from('lojas').select('*').order('criado_em', { ascending: false }), ['criado_em', { ascending: false }]),
    all(() => sb.from('perfis').select('id,loja_id,papel,ativo,nome,email')),
    all(() => sb.from('pagamentos_assinatura').select('*').order('criado_em', { ascending: false })),
    all(() => sb.from('suporte_tickets').select('*').order('atualizado_em', { ascending: false }))
  ]);
  S.plat = pl[0]; S.lojas = lj; S.pf = pf; S.pags = pg; S.tks = tk;
}
const pendentes = () => S.pags.filter(p => p.estado === 'pendente');
const tkNovos = () => S.tks.filter(t => t.nao_lido_super && t.estado !== 'fechado');
const donoDe = id => S.pf.find(p => p.loja_id === id && p.papel === 'dono');
function estadoLoja(l) { if (l.estado === 'suspensa') return 'suspensa'; if (diasPara(l.valido_ate) < 0) return 'expirada'; return l.estado; }
const TXT_ESTADO = { teste: 'Em teste', ativa: 'Ativa', expirada: 'Expirada', suspensa: 'Suspensa', pendente: 'Pendente', confirmado: 'Confirmado', rejeitado: 'Rejeitado' };
const nomeLoja = id => { const l = S.lojas.find(x => x.id === id); return l ? l.nome : '—'; };

function iniciarSuperRT() {
  pararRT();
  badge('s_pagamentos', pendentes().length); badge('s_suporte', tkNovos().length);
  try {
    const ch = sb.channel('super').on('postgres_changes', { event: '*', schema: 'public', table: 'suporte_tickets' }, async () => {
      const antes = tkNovos().length; await carregarSuper(); badge('s_suporte', tkNovos().length);
      if (tkNovos().length > antes) { bip(); toast('Nova mensagem de suporte.'); }
      if (cur === 's_suporte') go(cur, true);
    }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pagamentos_assinatura' }, async () => {
      await carregarSuper(); badge('s_pagamentos', pendentes().length); bip(); toast('Novo comprovativo de pagamento recebido.');
      if (cur === 's_pagamentos' || cur === 's_lojas') go(cur, true);
    }).subscribe();
    canais.push(ch);
  } catch (e) { /* sem tempo real */ }
  poll = setInterval(async () => {
    try { const antes = pendentes().length; await carregarSuper(); const n = pendentes().length; badge('s_pagamentos', n); badge('s_suporte', tkNovos().length); if (n > antes) { bip(); toast('Novo comprovativo de pagamento recebido.'); if (cur === 's_pagamentos' || cur === 's_lojas') go(cur, true); } } catch (e) { /* ok */ }
  }, 60000);
}

VIEWS.s_lojas = async function () {
  await carregarSuper(); badge('s_pagamentos', pendentes().length);
  const mes = ymd().slice(0, 8) + '01';
  const receita = r2(S.pags.filter(p => p.estado === 'confirmado' && p.confirmado_em && ymd(new Date(p.confirmado_em)) >= mes).reduce((s, p) => s + +p.valor, 0));
  const cont = { ativa: 0, teste: 0, expirada: 0, suspensa: 0 }; S.lojas.forEach(l => cont[estadoLoja(l)]++);
  const pend = pendentes().length;
  $('#main').innerHTML = `<div class="bar"><h2>Lojas</h2><div class="act"><span class="muted">${S.lojas.length} registadas</span><button class="btn" id="novol">+ Novo lojista</button></div></div>
  <div class="grid">
    <div class="stat hi"><span>Recebido este mês</span><b>${mt(receita)}</b></div>
    <div class="stat ok"><span>Lojas ativas</span><b>${cont.ativa}</b></div>
    <div class="stat warn"><span>Em teste grátis</span><b>${cont.teste}</b></div>
    <div class="stat bad"><span>Expiradas / suspensas</span><b>${cont.expirada + cont.suspensa}</b></div>
    <div class="stat ${pend ? 'warn' : ''}"><span>Comprovativos por confirmar</span><b>${pend}</b></div>
  </div>
  <div class="card">${S.lojas.length ? `<div class="tw"><table><tr><th>Loja</th><th>Localização</th><th>Contacto</th><th>Estado</th><th>Válida até</th><th></th></tr>${S.lojas.map(l => {
    const e = estadoLoja(l), d = diasPara(l.valido_ate), dn = donoDe(l.id);
    return `<tr><td><b>${esc(l.nome)}</b><br><span class="muted small">${l.configurada === false ? 'Por configurar' : esc(l.tipo)}</span></td><td>${esc(l.endereco || '—')}</td><td>${esc(l.tel || '—')}<br><span class="muted small">${esc(dn ? dn.email : '')}</span></td><td><span class="tag ${e}">${TXT_ESTADO[e]}</span></td><td>${fd(l.valido_ate)}<br><span class="muted small">${d >= 0 ? d + ' dia(s)' : 'há ' + (-d) + ' dia(s)'}</span></td>
    <td class="act"><button class="btn ghost sm" data-a="ver" data-id="${l.id}">Ver</button><button class="btn ghost sm" data-a="dias" data-id="${l.id}">+30 dias</button><button class="btn ghost sm" data-a="susp" data-id="${l.id}">${l.estado === 'suspensa' ? 'Reativar' : 'Suspender'}</button></td></tr>`;
  }).join('')}</table></div>` : '<div class="empty">Ainda não há lojas registadas. Quando alguém criar uma loja, ela aparece aqui.</div>'}</div>`;
  $('#novol').onclick = formLojista;
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
  const dn = donoDe(l.id), pg = S.pags.filter(p => p.loja_id === l.id), tel = String(l.tel || '').replace(/[^0-9+]/g, '');
  const wa = tel ? 'https://wa.me/' + (tel.startsWith('+') ? tel.slice(1) : (tel.length <= 9 ? '258' + tel : tel)) : '';
  modal(esc(l.nome), `<p class="muted">${l.configurada === false ? 'O lojista ainda não preencheu os dados da loja.' : esc(l.tipo)}<br>${esc(l.endereco || 'Sem localização')}</p>
  <h3>Contacto</h3><p>${dn ? `<b>${esc(dn.nome)}</b><br>` : ''}${l.tel ? `Telefone: <b>${esc(l.tel)}</b><br>` : 'Sem telefone<br>'}${dn && dn.email ? `E-mail: <b>${esc(dn.email)}</b>` : ''}</p>
  <div class="act" style="justify-content:flex-start;margin-bottom:10px">${tel ? `<a class="btn ghost sm" href="tel:${esc(tel)}">Ligar</a><a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(wa)}">WhatsApp</a>` : ''}${dn && dn.email ? `<a class="btn ghost sm" href="mailto:${esc(dn.email)}">E-mail</a>` : ''}</div>
  <p class="muted small">Registada em ${fd(l.criado_em)} · Válida até ${fd(l.valido_ate)}. Por privacidade, não vê produtos, stock, clientes, vendas nem a equipa da loja.</p>
  <h3>Pagamentos</h3>${pg.length ? `<table>${pg.map(p => `<tr><td>${fd(p.criado_em)}</td><td>${esc(p.plano)}</td><td class="n">${mt(p.valor)}</td><td><span class="tag ${p.estado}">${TXT_ESTADO[p.estado]}</span></td></tr>`).join('')}</table>` : '<p class="muted">Sem pagamentos.</p>'}`, {});
}

/* Criar a conta de um lojista (único caminho para uma loja entrar no sistema) */
const gerarSenha = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let r = ''; for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
function formLojista() {
  const w = modal('Novo lojista', `<p class="muted small" style="margin-top:0">Crie a conta com o e-mail do lojista e uma senha. Ele entra, e preenche sozinho o nome, o nome da loja, o tipo e a localização.</p>
    ${fld('E-mail do lojista', 'email', '', 'email', 'required autocapitalize="none" autocomplete="off"')}
    <label>Senha inicial<div class="row" style="gap:8px;flex-wrap:nowrap"><input class="in" name="senha" id="sn" type="text" required minlength="6" autocomplete="off" value="${gerarSenha()}"><button type="button" class="btn ghost sm" id="gs" style="flex:none">Gerar</button></div><span class="hint">Mínimo 6 caracteres. Pode dizer-lhe para a mudar em Conta.</span></label>
    ${fld('Nome da loja (opcional)', 'loja', '', 'text', 'autocomplete="off"')}`, {
    okText: 'Criar conta', keepOnClose: true,
    onOk: async d => {
      const email = d.email.trim().toLowerCase();
      const aux = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gestmz-aux' } });
      const { data, error } = await aux.auth.signUp({ email, password: d.senha });
      if (error) throw new Error(traduz(error.message));
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) throw new Error('Este e-mail já tem conta no sistema.');
      aux.auth.signOut().catch(() => { });
      await q(sb.rpc('cadastrar_lojista', { p_user: data.user.id, p_email: email, p_loja_nome: d.loja }));
      if (!data.session) toast('Criada, mas o Supabase pede confirmação por e-mail. Desligue "Confirm email" (veja o LEIA-ME).', true);
      const url = location.origin + location.pathname.replace(/index\.html$/, '');
      const msg = `Olá! O seu acesso ao GestMZ já está criado.\nEndereço: ${url}\nE-mail: ${email}\nSenha: ${d.senha}\nNa primeira vez, preencha os dados da sua loja.`;
      go('s_lojas', true);
      const w2 = modal('Acesso criado', `<p>Envie estes dados ao lojista:</p><pre class="acesso" style="white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:10px;user-select:all">${esc(msg)}</pre>`, { okText: 'Copiar', cancelText: 'Fechar',
        onOk: async () => { try { await navigator.clipboard.writeText(msg); toast('Copiado.'); } catch (e) { toast('Seleccione o texto e copie.', true); } return false; } });
      const f = $('.mf', w2.m); if (f) f.insertAdjacentHTML('afterbegin', `<a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">WhatsApp</a>`);
    }
  });
  $('#gs', w.m).onclick = () => { $('#sn', w.m).value = gerarSenha(); };
}

/* ======================= SUPORTE ======================= */
const TIPO_TK = { duvida: 'Dúvida', sugestao: 'Sugestão', problema: 'Problema' };
VIEWS.s_suporte = async function () {
  await carregarSuper(); badge('s_suporte', tkNovos().length);
  $('#main').innerHTML = `<div class="bar"><h2>Suporte</h2><span class="muted">${tkNovos().length} à espera de resposta</span></div>
  <div class="card">${S.tks.length ? `<div class="tw"><table><tr><th>Loja</th><th>Assunto</th><th>Tipo</th><th>Estado</th><th>Última</th><th></th></tr>${S.tks.map(t => `<tr class="${t.estado === 'fechado' ? 'off' : ''}"><td><b>${esc(nomeLoja(t.loja_id))}</b></td><td>${t.nao_lido_super ? '<span class="dot on"></span> ' : ''}${esc(t.assunto)}</td><td>${TIPO_TK[t.tipo]}</td><td><span class="tag ${t.estado === 'aberto' ? 'pendente' : t.estado === 'fechado' ? 'suspensa' : 'confirmado'}">${t.estado === 'aberto' ? 'Por responder' : t.estado === 'fechado' ? 'Fechado' : 'Respondido'}</span></td><td>${fdt(t.atualizado_em)}</td><td class="act"><button class="btn ghost sm" data-id="${t.id}">Abrir</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Ainda não há pedidos. Quando um lojista escrever, recebe aqui um aviso.</div>'}</div>`;
  $('#main').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) abrirTicket(S.tks.find(t => t.id === b.dataset.id), true); };
};
/* conversa de um pedido — usada pelo dono do sistema (super) e pelo lojista */
async function abrirTicket(t, super_) {
  const ms = await q(sb.from('suporte_msgs').select('*').eq('ticket_id', t.id).order('criado_em'));
  const lado = super_ ? 'super' : 'loja';
  const w = modal(esc(t.assunto), `<p class="muted small" style="margin-top:0">${super_ ? esc(nomeLoja(t.loja_id)) + ' · ' : ''}${TIPO_TK[t.tipo]} · ${fdt(t.criado_em)}</p>
    <div class="chat" style="max-height:45vh;overflow:auto;display:grid;gap:8px;margin-bottom:12px">${ms.map(m => `<div style="justify-self:${m.de === lado ? 'end' : 'start'};max-width:86%;background:${m.de === lado ? 'var(--brand-soft)' : 'var(--bg)'};padding:8px 12px;border-radius:12px"><div class="small muted">${esc(m.autor_nome || '')} · ${fdt(m.criado_em)}</div><div style="white-space:pre-wrap">${esc(m.texto)}</div></div>`).join('')}</div>
    ${t.estado === 'fechado' ? '<p class="muted">Pedido fechado.</p>' : `<label>Resposta<textarea class="in" name="texto" rows="3" required></textarea></label>`}`, {
    okText: 'Enviar', cancelText: 'Fechar', keepOnClose: true,
    onOk: async d => {
      if (t.estado === 'fechado') return;
      await q(sb.rpc('responder_ticket', { p_ticket: t.id, p_texto: d.texto })); toast('Enviado.'); await q(sb.rpc('ticket_lido', { p_ticket: t.id }));
      if (super_) go('s_suporte', true); else go('suporte', true);
    }
  });
  if (t.estado !== 'fechado') {
    const f = $('.mf', w.m); f.insertAdjacentHTML('afterbegin', '<button type="button" class="btn ghost" id="fch">Fechar pedido</button>');
    $('#fch', w.m).onclick = async () => { try { await q(sb.rpc('fechar_ticket', { p_ticket: t.id })); w.close(); toast('Pedido fechado.'); go(super_ ? 's_suporte' : 'suporte', true); } catch (e) { erro(e); } };
  } else { const o = $('[data-ok]', w.m); if (o) o.hidden = true; }
  if ((super_ && t.nao_lido_super) || (!super_ && t.nao_lido_loja)) { sb.rpc('ticket_lido', { p_ticket: t.id }).then(() => { }, () => { }); t.nao_lido_super = t.nao_lido_loja = false; }
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
    ${fld('Dias de teste grátis para lojas novas', 'teste_dias', p.teste_dias, 'text', 'inputmode="numeric" required')}
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

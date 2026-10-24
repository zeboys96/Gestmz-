'use strict';
/* GestMZ — loja: clientes, despesas, relatórios, equipa, assinatura, registo, conta e ajuda */

/* ======================= CLIENTES ======================= */
function formCliente(c, done) {
  const novo = !c; c = c || { nome: '', tel: '' };
  modal(novo ? 'Novo cliente' : 'Editar cliente', fld('Nome', 'nome', c.nome, 'text', 'required') + fld('Telefone', 'tel', c.tel, 'tel'), {
    onOk: async d => {
      let r;
      if (novo) { const x = await q(sb.from('clientes').insert({ loja_id: S.loja.id, nome: d.nome.trim(), tel: d.tel }).select()); r = x[0]; S.clientes.push(r); }
      else { await q(sb.from('clientes').update({ nome: d.nome.trim(), tel: d.tel }).eq('id', c.id)); Object.assign(c, { nome: d.nome.trim(), tel: d.tel }); r = c; }
      S.clientes.sort((a, b) => a.nome.localeCompare(b.nome)); if (done) done(r); if (cur === 'clientes') go('clientes', true);
    }
  });
}
VIEWS.clientes = async function () {
  S.clientes = await all(() => sb.from('clientes').select('*').order('nome'));
  $('#main').innerHTML = `<div class="bar"><h2>Clientes</h2><button class="btn" id="novo">+ Novo cliente</button></div><div class="card" id="c"></div>`;
  const total = r2(S.clientes.reduce((s, c) => s + +c.divida, 0));
  $('#c').innerHTML = S.clientes.length ? `<div class="tw"><table><tr><th>Nome</th><th>Telefone</th><th class="n">Dívida (fiado)</th><th></th></tr>${S.clientes.map(c => `<tr><td><b>${esc(c.nome)}</b></td><td>${esc(c.tel || '')}</td><td class="n" ${+c.divida > 0 ? 'style="color:var(--danger);font-weight:800"' : ''}>${mt(c.divida)}</td><td class="act">${+c.divida > 0 ? `<button class="btn sm" data-a="pg" data-id="${c.id}">Receber</button>` : ''}<button class="btn ghost sm" data-a="ed" data-id="${c.id}">Editar</button>${isGestor() && +c.divida === 0 ? `<button class="btn ghost sm" data-a="del" data-id="${c.id}">Apagar</button>` : ''}</td></tr>`).join('')}</table></div><p class="muted">Total em dívida: <b>${mt(total)}</b></p>` : '<div class="empty">Ainda não há clientes. Registe quem compra a fiado.</div>';
  $('#novo').onclick = () => formCliente();
  $('#c').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const c = S.clientes.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'ed') formCliente(c);
    if (b.dataset.a === 'del') ask(`Apagar o cliente ${c.nome}?`, async () => { await q(sb.from('clientes').delete().eq('id', c.id)); S.clientes = S.clientes.filter(x => x !== c); go('clientes', true); }, 'Apagar', true);
    if (b.dataset.a === 'pg') modal('Receber de ' + esc(c.nome), `<p>Dívida actual: <b>${mt(c.divida)}</b></p>${fld('Valor recebido (MT)', 'v', c.divida, 'text', 'inputmode="decimal" required')}<label>Método<select class="in" name="m">${opts(PAGAMENTOS.filter(x => x !== 'Fiado'))}</select></label>`, {
      okText: 'Registar', onOk: async d => { await q(sb.rpc('receber_fiado', { p_cliente: c.id, p_valor: num(d.v), p_metodo: d.m })); toast('Pagamento registado.'); go('clientes', true); }
    });
  };
};

/* ======================= DESPESAS ======================= */
VIEWS.despesas = async function () {
  let mes = ymd().slice(0, 7);
  $('#main').innerHTML = `<div class="bar"><h2>Despesas</h2><div class="act"><input class="in" type="month" id="m" value="${mes}" style="width:auto" aria-label="Mês"><button class="btn" id="novo">+ Despesa</button></div></div><div class="card" id="c"></div>`;
  const draw = async () => {
    const ini = mes + '-01', fim = new Date(ini + 'T12:00:00'); fim.setMonth(fim.getMonth() + 1);
    const l = await all(() => sb.from('despesas').select('*').gte('data', ini).lt('data', ymd(fim).slice(0, 8) + '01').order('data', { ascending: false }));
    $('#c').innerHTML = l.length ? `<div class="tw"><table><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="n">Valor</th><th></th></tr>${l.map(d => `<tr><td>${fd(d.data)}</td><td>${esc(d.descricao)}</td><td>${esc(d.categoria || '')}</td><td class="n">${mt(d.valor)}</td><td class="act"><button class="btn ghost sm" data-id="${d.id}">Apagar</button></td></tr>`).join('')}</table></div><p class="muted">Total do mês: <b>${mt(r2(l.reduce((s, d) => s + +d.valor, 0)))}</b></p>` : '<div class="empty">Sem despesas neste mês.</div>';
  };
  $('#m').onchange = e => { mes = e.target.value || mes; draw().catch(erro); };
  $('#novo').onclick = () => modal('Nova despesa', fld('Data', 'data', ymd(), 'date', 'required') + fld('Descrição', 'descricao', '', 'text', 'required') + `<label>Categoria<select class="in" name="categoria">${opts(['Renda', 'Salários', 'Electricidade e água', 'Transporte', 'Reposição de stock', 'Impostos e licenças', 'Outros'])}</select></label>` + fld('Valor (MT)', 'valor', '', 'text', 'inputmode="decimal" required'), {
    onOk: async d => { await q(sb.from('despesas').insert({ loja_id: S.loja.id, data: d.data, descricao: d.descricao.trim(), categoria: d.categoria, valor: num(d.valor), usuario_nome: S.perfil.nome })); await draw(); }
  });
  $('#c').onclick = e => { const b = e.target.closest('button'); if (b) ask('Apagar esta despesa?', async () => { await q(sb.from('despesas').delete().eq('id', b.dataset.id)); await draw(); }, 'Apagar', true); };
  await draw();
};

/* ======================= RELATÓRIOS ======================= */
VIEWS.relatorios = async function () {
  const h = ymd(); let a = h.slice(0, 8) + '01', b = h;
  $('#main').innerHTML = `<div class="bar"><h2>Relatórios</h2><div class="act"><input class="in" type="date" id="a" value="${a}" style="width:auto" aria-label="De"><input class="in" type="date" id="b" value="${b}" style="width:auto" aria-label="Até"><button class="btn ghost" id="csv">Exportar CSV</button></div></div><div id="r"></div>`;
  let vs = [];
  const draw = async () => {
    const [v0, ds] = await Promise.all([
      all(() => sb.from('vendas').select('*').gte('data', diaIso(a)).lt('data', diaIso(b, 1)).order('data', { ascending: false })),
      all(() => sb.from('despesas').select('valor').gte('data', a).lte('data', b))
    ]);
    vs = v0.filter(v => !v.anulada);
    const tot = r2(vs.reduce((s, v) => s + +v.total, 0)), luc = r2(vs.reduce((s, v) => s + lucroVenda(v), 0)), desp = r2(ds.reduce((s, d) => s + +d.valor, 0)), iva = r2(vs.reduce((s, v) => s + +v.iva, 0));
    const pg = {}, vd = {}, tp = {};
    vs.forEach(v => { pg[v.pagamento] = (pg[v.pagamento] || 0) + +v.total; const x = vd[v.usuario_nome] = vd[v.usuario_nome] || { n: 0, t: 0 }; x.n++; x.t += +v.total; v.itens.forEach(i => { const t = tp[i.nome] = tp[i.nome] || { q: 0, v: 0 }; t.q += i.un; t.v += i.total; }); });
    const top = Object.entries(tp).sort((x, y) => y[1].v - x[1].v).slice(0, 10), vend = Object.entries(vd).sort((x, y) => y[1].t - x[1].t);
    $('#r').innerHTML = `<div class="grid"><div class="stat hi"><span>Vendas</span><b>${mt(tot)}</b></div><div class="stat"><span>Nº de vendas</span><b>${vs.length}</b></div><div class="stat ok"><span>Lucro bruto</span><b>${mt(luc)}</b></div><div class="stat warn"><span>Despesas</span><b>${mt(desp)}</b></div><div class="stat ${luc - desp >= 0 ? 'ok' : 'bad'}"><span>Resultado (lucro − despesas)</span><b>${mt(luc - desp)}</b></div><div class="stat"><span>IVA incluído</span><b>${mt(iva)}</b></div></div>
    <div class="cols"><div class="card"><h3>Por forma de pagamento</h3>${Object.keys(pg).length ? `<table>${Object.entries(pg).map(([k, x]) => `<tr><td>${esc(k)}</td><td class="n">${mt(x)}</td></tr>`).join('')}</table>` : '<div class="empty">Sem dados</div>'}</div>
    <div class="card"><h3>Por vendedor</h3>${vend.length ? `<table>${vend.map(([k, x]) => `<tr><td>${esc(k)}</td><td class="n">${x.n} venda(s)</td><td class="n">${mt(x.t)}</td></tr>`).join('')}</table>` : '<div class="empty">Sem dados</div>'}</div>
    <div class="card"><h3>10 produtos mais vendidos</h3>${top.length ? `<table>${top.map(([k, x]) => `<tr><td>${esc(k)}</td><td class="n">${x.q} un.</td><td class="n">${mt(x.v)}</td></tr>`).join('')}</table>` : '<div class="empty">Sem dados</div>'}</div></div>
    <p class="muted small">Os valores de IVA são indicativos. Confirme o enquadramento fiscal dos seus produtos com o seu contabilista.</p>`;
  };
  $('#a').onchange = e => { a = e.target.value || a; draw().catch(erro); }; $('#b').onchange = e => { b = e.target.value || b; draw().catch(erro); };
  $('#csv').onclick = () => { const rows = [['Nº', 'Data', 'Vendedor', 'Pagamento', 'Subtotal', 'Desconto', 'IVA', 'Total']]; vs.forEach(v => rows.push([nvenda(v), fdt(v.data), v.usuario_nome, v.pagamento, v.subtotal, v.desconto, v.iva, v.total])); download(`vendas_${a}_${b}.csv`, '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n'), 'text/csv'); };
  await draw();
};

/* ======================= EQUIPA ======================= */
const quando = v => { if (!v) return 'nunca entrou'; const m = Math.round((Date.now() - new Date(v).getTime()) / 60000); if (m < 3) return 'a trabalhar agora'; if (m < 60) return `visto há ${m} min`; if (m < 1440) return `visto há ${Math.round(m / 60)} h`; return 'visto ' + fd(v); };
VIEWS.equipa = async function () {
  S.equipa = await all(() => sb.from('perfis').select('id,nome,usuario,papel,foto,ativo,ultimo_acesso').eq('loja_id', S.loja.id).order('nome'));
  const dono = S.perfil.papel === 'dono';
  $('#main').innerHTML = `<div class="bar"><h2>Equipa</h2><button class="btn" id="novo" ${assin().ok ? '' : 'disabled'}>+ Novo funcionário</button></div>
  <div class="card"><b>Como os funcionários entram:</b> no ecrã inicial, separador <b>Funcionário</b>, com o código da loja <b style="font-size:20px;font-family:var(--f-display)">${esc(S.loja.codigo)}</b>, o seu utilizador e a sua senha.</div>
  <div class="team">${S.equipa.map(u => `<div class="member" ${u.ativo ? '' : 'style="opacity:.55"'}>${avatar(u, 'lg')}<div class="info"><b>${esc(u.nome)}</b><span class="muted small">${PAPEL[u.papel]}${u.usuario ? ' · ' + esc(u.usuario) : ''}</span><br><span class="small"><span class="dot ${online(u) ? 'on' : ''}"></span> ${u.ativo ? quando(u.ultimo_acesso) : 'acesso retirado'}</span>${dono && u.id !== S.perfil.id ? `<br><button class="link small" data-id="${u.id}">Editar</button>` : ''}</div></div>`).join('')}</div>`;
  $('#novo').onclick = () => formEquipa();
  $('#main').onclick = e => { const b = e.target.closest('button.link'); if (b) formEquipa(S.equipa.find(u => u.id === b.dataset.id)); };
};
function fotoCampo(atual) {
  return `<label>Foto (opcional)<input class="in" type="file" name="fotoarq" accept="image/*" capture="user" id="fotoarq"><img class="preview" id="fotoprev" ${atual ? `src="${esc(atual)}"` : 'hidden'} alt="Pré-visualização" style="max-height:96px;border-radius:50%"></label>`;
}
function ligarFoto(m) {
  const i = $('#fotoarq', m), p = $('#fotoprev', m); const st = { v: null };
  i.onchange = async () => { if (!i.files[0]) return; try { st.v = await imgToData(i.files[0], 160, .8, true); p.src = st.v; p.hidden = false; } catch (e) { erro(e); } };
  return st;
}
function formEquipa(u) {
  const novo = !u, dono = S.perfil.papel === 'dono'; u = u || { nome: '', usuario: '', papel: 'caixa', ativo: true, foto: null };
  const papeis = dono ? [['caixa', 'Caixa (vende e consulta)'], ['gerente', 'Gerente (gere stock, anula vendas, vê relatórios)']] : [['caixa', 'Caixa (vende e consulta)']];
  const w = modal(novo ? 'Novo funcionário' : 'Editar ' + esc(u.nome), `${fotoCampo(u.foto)}${fld('Nome completo', 'nome', u.nome, 'text', 'required')}
    ${novo ? fld('Utilizador (para entrar)', 'usuario', '', 'text', 'required pattern="[A-Za-z0-9_.\\-]{3,20}" autocapitalize="none"', 'Só letras e números, sem espaços. Ex.: paulo.antonio') + fld('Senha (mínimo 6 caracteres)', 'senha', '', 'password', 'required minlength="6"') : ''}
    <label>Função<select class="in" name="papel">${opts(papeis, u.papel)}</select></label>
    ${!novo ? `<label class="chk"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Tem acesso ao sistema</label>` : ''}`, {
    okText: novo ? 'Criar funcionário' : 'Guardar',
    onOk: async d => {
      const foto = st.v || undefined;
      if (novo) {
        const usuario = d.usuario.trim().toLowerCase();
        const aux = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gestmz-aux' } });
        const { data, error } = await aux.auth.signUp({ email: staffEmail(usuario, S.loja.codigo), password: d.senha });
        if (error) throw new Error(traduz(error.message));
        if (!data.user || (data.user.identities && data.user.identities.length === 0)) throw new Error('Este utilizador já existe. Escolha outro nome de utilizador.');
        try {
          await q(sb.rpc('criar_perfil', { p_user: data.user.id, p_nome: d.nome, p_usuario: usuario, p_papel: d.papel }));
          if (foto) await q(sb.from('perfis').update({ foto }).eq('id', data.user.id));
        } finally { aux.auth.signOut().catch(() => { }); }
        if (!data.session) toast('Criado, mas o Supabase pede confirmação por e-mail. Desligue "Confirm email" (veja o LEIA-ME).', true); else toast('Funcionário criado. Pode entrar com o código da loja.');
      } else {
        const o = { nome: d.nome.trim(), papel: d.papel, ativo: !!d.ativo }; if (foto) o.foto = foto;
        await q(sb.from('perfis').update(o).eq('id', u.id)); toast('Guardado.');
      }
      go('equipa', true);
    }
  });
  const st = ligarFoto(w.m);
}

/* ======================= ASSINATURA ======================= */
const OPERADORA = { 'e-Mola': 'Movitel', 'M-Pesa': 'Vodacom', 'mKesh': 'Tmcel' };
VIEWS.assinatura = async function () {
  const [pg] = await Promise.all([all(() => sb.from('pagamentos_assinatura').select('*').order('criado_em', { ascending: false })), recarregarLoja(), q(sb.from('plataforma').select('*')).then(r => { S.plat = r[0]; })]);
  const a = assin(), p = S.plat; let plano = 'trimestral', img = null;
  const preco = { mensal: +p.preco_mensal, trimestral: +p.preco_trimestral, anual: +p.preco_anual }, meses = { mensal: 1, trimestral: 3, anual: 12 };
  const eco = k => { const x = Math.round((1 - preco[k] / (preco.mensal * meses[k])) * 100); return x > 0 ? `Poupa ${x}%` : ''; };
  const pendente = pg.find(x => x.estado === 'pendente');
  $('#main').innerHTML = `<div class="bar"><h2>Assinatura</h2></div>
  <div class="card"><div class="bar" style="margin:0"><div><span class="tag ${a.k}">${TXT_ESTADO[a.k]}</span> <b style="margin-left:6px">Válida até ${fd(S.loja.valido_ate)}</b><br><span class="muted small">${a.d >= 0 ? a.d + ' dia(s) restantes' : 'expirou há ' + (-a.d) + ' dia(s)'}</span></div></div></div>
  ${pendente ? `<div class="msg">Já enviou um comprovativo (${fd(pendente.criado_em)}). Aguarde a confirmação — assim que for confirmado, a validade é actualizada automaticamente.</div>` : ''}
  <div class="card"><h3>1. Escolha o plano</h3><div class="plans" id="plans">${['mensal', 'trimestral', 'anual'].map(k => `<button type="button" class="plan" data-k="${k}">${eco(k) ? `<span class="eco">${eco(k)}</span>` : ''}<span class="muted small">${k === 'mensal' ? 'Mensal' : k === 'trimestral' ? 'Trimestral' : 'Anual'}</span><b>${mt(preco[k])}</b><span class="small muted">${meses[k]} ${meses[k] === 1 ? 'mês' : 'meses'}</span></button>`).join('')}</div>
  <h3>2. Faça a transferência</h3><div class="pay"><span class="sel"><img src="emola.png" alt="" onerror="this.remove()"><span class="mk">${esc(p.metodo)}</span>${OPERADORA[p.metodo] ? esc(OPERADORA[p.metodo]) : ''}</span><div><div class="num" id="numero">${esc(p.numero)}</div><span class="muted">em nome de <b>${esc(p.titular)}</b></span></div><button class="btn ghost sm" type="button" id="cp">Copiar número</button></div>
  <p class="small muted">Confirme que o nome do destinatário é <b>${esc(p.titular)}</b> antes de enviar o dinheiro. O valor é <b id="valor">${mt(preco[plano])}</b>.</p>
  <h3>3. Envie o comprovativo</h3><form id="f">${fld('Referência da transação (opcional)', 'ref', '', 'text', 'placeholder="Ex.: ID da mensagem de confirmação"')}<label>Foto ou captura do comprovativo<input class="in" type="file" id="comp" accept="image/*" required></label><img class="preview" id="prev" hidden alt="Pré-visualização do comprovativo"><br><button class="btn" id="env" ${pendente ? '' : ''}>Enviar comprovativo</button></form></div>
  <div class="card"><h3>Histórico de pagamentos</h3>${pg.length ? `<div class="tw"><table><tr><th>Data</th><th>Plano</th><th class="n">Valor</th><th>Estado</th></tr>${pg.map(x => `<tr><td>${fd(x.criado_em)}</td><td>${esc(x.plano)}</td><td class="n">${mt(x.valor)}</td><td><span class="tag ${x.estado}">${TXT_ESTADO[x.estado]}</span>${x.nota ? `<br><span class="small muted">${esc(x.nota)}</span>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="empty">Ainda sem pagamentos.</div>'}</div>`;
  const marca = () => { $$('#plans .plan').forEach(b => b.classList.toggle('on', b.dataset.k === plano)); $('#valor').textContent = mt(preco[plano]); };
  $('#plans').onclick = e => { const b = e.target.closest('.plan'); if (b) { plano = b.dataset.k; marca(); } };
  $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(p.numero.replace(/\s/g, '')); toast('Número copiado.'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#numero')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Seleccionado. Copie o número.'); } };
  $('#comp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { img = await imgToData(f, 1100, .72, false); $('#prev').src = img; $('#prev').hidden = false; } catch (er) { erro(er); } };
  $('#f').onsubmit = async e => {
    e.preventDefault(); if (!img) return toast('Escolha a imagem do comprovativo.', true);
    const b = $('#env'); b.disabled = true; b.textContent = 'A enviar…';
    try { await q(sb.rpc('enviar_comprovativo', { p_plano: plano, p_referencia: $('[name=ref]').value, p_imagem: img })); toast('Comprovativo enviado. Vamos confirmar em breve.'); go('assinatura', true); }
    catch (er) { erro(er); b.disabled = false; b.textContent = 'Enviar comprovativo'; }
  };
  marca();
};

/* ======================= REGISTO ======================= */
VIEWS.registo = async function () {
  let tab = 'aud';
  $('#main').innerHTML = `<div class="bar"><h2>Registo de actividade</h2></div><div class="tabs" id="tabs" style="max-width:420px"><button type="button" data-t="aud" class="on">Acções sensíveis</button><button type="button" data-t="mov">Movimentos de stock</button></div><div class="card" id="c"></div>`;
  const draw = async () => {
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'aud') {
      const l = await q(sb.from('auditoria').select('*').order('data', { ascending: false }).limit(200));
      $('#c').innerHTML = l.length ? `<div class="tw"><table><tr><th>Quando</th><th>Quem</th><th>Acção</th><th>Detalhe</th></tr>${l.map(x => `<tr><td class="nowrap">${fdt(x.data)}</td><td>${esc(x.usuario_nome)}</td><td>${esc(x.acao.replace(/_/g, ' '))}</td><td>${esc(x.detalhe)}</td></tr>`).join('')}</table></div>` : '<div class="empty">Ainda não há acções registadas. Anulações, retiradas de itens e baixas de stock aparecem aqui.</div>';
    } else {
      const l = await q(sb.from('movimentos').select('*').order('data', { ascending: false }).limit(200));
      $('#c').innerHTML = l.length ? `<div class="tw"><table><tr><th>Quando</th><th>Produto</th><th>Tipo</th><th class="n">Qtd</th><th>Quem</th><th>Nota</th></tr>${l.map(x => `<tr><td class="nowrap">${fdt(x.data)}</td><td>${esc(x.produto_nome)}</td><td>${esc(x.tipo)}</td><td class="n">${x.qtd > 0 ? '+' : ''}${x.qtd}</td><td>${esc(x.usuario_nome)}</td><td>${esc(x.nota || '')}</td></tr>`).join('')}</table></div>` : '<div class="empty">Sem movimentos.</div>';
    }
  };
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; draw().catch(erro); } };
  await draw();
};

/* ======================= CONTA ======================= */
VIEWS.perfil = async function () {
  const p = S.perfil, dono = p.papel === 'dono';
  $('#main').innerHTML = `<div class="bar"><h2>A minha conta</h2></div>
  <form class="card" id="fp"><h3>Perfil</h3><div class="row" style="align-items:center"><div style="flex:none">${avatar(p, 'xl')}</div><div>${fotoCampo(null).replace(' hidden', ' hidden')}</div></div>${fld('Nome', 'nome', p.nome, 'text', 'required')}<p class="muted small">Função: ${PAPEL[p.papel]}${S.loja ? ' · Código da loja: ' + esc(S.loja.codigo) : ''}</p><button class="btn">Guardar perfil</button></form>
  <form class="card" id="fs"><h3>Mudar senha</h3>${fld('Nova senha (mínimo 6 caracteres)', 'senha', '', 'password', 'required minlength="6" autocomplete="new-password"')}<button class="btn">Mudar senha</button></form>
  ${dono ? `<form class="card" id="fl"><h3>Dados do estabelecimento</h3>${fld('Nome', 'nome', S.loja.nome, 'text', 'required')}<label>Tipo<select class="in" name="tipo">${opts(TIPOS_LOJA, S.loja.tipo)}</select></label><div class="row">${fld('NUIT', 'nuit', S.loja.nuit || '')}${fld('Telefone', 'tel', S.loja.tel || '', 'tel')}</div>${fld('Endereço', 'endereco', S.loja.endereco || '')}<p class="muted small">Estes dados aparecem no recibo.</p><button class="btn">Guardar dados</button></form>` : ''}`;
  const st = ligarFoto($('#fp'));
  $('#fp').onsubmit = async e => { e.preventDefault(); try { const o = { nome: $('[name=nome]', e.target).value.trim() }; if (st.v) o.foto = st.v; await q(sb.from('perfis').update(o).eq('id', p.id)); Object.assign(S.perfil, o); toast('Perfil guardado.'); shell(S.perfil.papel === 'super' ? navSuper() : navLoja()); go('perfil', true); } catch (er) { erro(er); } };
  $('#fs').onsubmit = async e => { e.preventDefault(); try { const { error } = await sb.auth.updateUser({ password: $('[name=senha]', e.target).value }); if (error) throw new Error(traduz(error.message)); e.target.reset(); toast('Senha alterada.'); } catch (er) { erro(er); } };
  const fl = $('#fl'); if (fl) fl.onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(fl)); try { await q(sb.rpc('atualizar_loja', { p_nome: d.nome, p_tipo: d.tipo, p_nuit: d.nuit, p_tel: d.tel, p_endereco: d.endereco })); await recarregarLoja(); shell(navLoja()); go('perfil', true); toast('Dados guardados.'); } catch (er) { erro(er); } };
};

/* ======================= AJUDA ======================= */
const SLIDES = [
  ['painel', 'Bem-vindo ao GestMZ', 'Vendas, stock, validades, equipa e assinatura num só lugar. Funciona no telemóvel e no computador, e todos os aparelhos da loja veem os mesmos dados.'],
  ['vender', 'Vender é rápido', 'Passe o leitor de código de barras e o produto entra na venda. Escolha como o cliente paga (dinheiro, M-Pesa, e-Mola, mKesh…), finalize e imprima o recibo. No telemóvel, use o botão da câmara para ler o código.'],
  ['produtos', 'Produtos e categorias', 'Ao registar um produto, escolha a categoria numa lista (bolachas, bebidas, medicamentos, cosméticos, papelaria…). Falta uma? Crie uma nova na hora, sem sair do ecrã.'],
  ['barcode', 'Caixa fechada ou unidade', 'Uma caixa de bolachas com 50 pacotes: regista o pacote com o código dele e a caixa com o código dela, e diz que a caixa traz 50. Ler a caixa na entrada de stock soma 50 unidades. Ler o pacote no caixa vende 1. Se só existir o código da caixa, vende a caixa inteira.'],
  ['registo', 'Stock e validades', 'Cada entrada tem lote e validade. O sistema vende primeiro o que expira primeiro e nunca vende lotes expirados. O painel avisa o que está a acabar e o que está para expirar.'],
  ['equipa', 'Equipa com perfil e foto', 'O dono cria gerentes e caixas, cada um com o seu utilizador, senha e foto. O painel mostra quem está a trabalhar e quem vendeu mais hoje. Cada caixa vê só as suas vendas.'],
  ['sair', 'O caixa não apaga nada sozinho', 'Para retirar um produto da venda ou anular uma venda, o caixa precisa que o gerente escreva o seu utilizador e senha. Tudo fica registado em “Registo”, com data e nome.'],
  ['clientes', 'Fiado e clientes', 'Registe o cliente e venda a fiado. A dívida fica guardada e, quando ele pagar, use “Receber”. O dono vê o total em dívida no painel.'],
  ['assinatura', 'Assinatura', 'Pague por e-Mola, M-Pesa ou mKesh para o número indicado, envie a foto do comprovativo em “Assinatura” e espere a confirmação. Quando confirmada, a validade actualiza sozinha.'],
  ['check', 'Pronto para começar', 'Comece por registar alguns produtos. Se precisar de rever este guia, abra “Ajuda” no menu. Boas vendas!']
];
VIEWS.ajudaSlides = function () {
  let i = 0;
  const w = modal('Como funciona', '<div class="slides" id="sl"></div><div class="dots" id="dots"></div>', {});
  const f = $('.mf', w.m); f.innerHTML = '<button type="button" class="btn ghost" id="pv">Anterior</button><button type="button" class="btn" id="nx">Seguinte</button>';
  const draw = () => {
    const s = SLIDES[i];
    $('#sl', w.m).innerHTML = `<div class="slide"><div class="big">${ico(s[0], 38)}</div><h3>${esc(s[1])}</h3><p>${esc(s[2])}</p></div>`;
    $('#dots', w.m).innerHTML = SLIDES.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('#pv', w.m).disabled = i === 0; $('#nx', w.m).textContent = i === SLIDES.length - 1 ? 'Concluir' : 'Seguinte';
  };
  $('#pv', w.m).onclick = () => { if (i > 0) { i--; draw(); } };
  $('#nx', w.m).onclick = () => { if (i < SLIDES.length - 1) { i++; draw(); } else w.close(); };
  draw();
};
VIEWS.ajuda = async function () {
  const faq = [
    ['O leitor de código de barras precisa de instalação?', 'Não. A maioria dos leitores USB ou Bluetooth funciona como um teclado: ao ler, escreve o número e carrega em Enter. Basta o cursor estar na caixa de pesquisa do ecrã “Vender”.'],
    ['E se o produto não tiver código de barras?', 'Pesquise pelo nome e toque no produto. Pode também usar um código inventado por si no campo de código do produto.'],
    ['Posso usar em vários caixas ao mesmo tempo?', 'Sim. Cada caixa entra com o seu utilizador, e o stock actualiza em todos os aparelhos.'],
    ['Preciso de internet?', 'Sim, para vender e actualizar o stock em todos os caixas. A app abre sem internet, mas as vendas só são guardadas com ligação.'],
    ['Um funcionário esqueceu a senha. E agora?', 'O funcionário pode mudar a senha em “Conta” enquanto estiver com sessão aberta. Se já perdeu o acesso, retire o acesso na “Equipa” e crie um novo utilizador.'],
    ['Como instalo no telemóvel?', 'Abra o endereço no Chrome, toque nos três pontos e escolha “Instalar aplicação” ou “Adicionar ao ecrã inicial”. Fica com um ícone como qualquer outra app.']
  ];
  $('#main').innerHTML = `<div class="bar"><h2>Ajuda</h2><button class="btn" id="sl">Ver apresentação passo a passo</button></div><div class="cols">${faq.map(f => `<div class="card"><h3>${esc(f[0])}</h3><p style="margin:0">${esc(f[1])}</p></div>`).join('')}</div>`;
  $('#sl').onclick = VIEWS.ajudaSlides;
};

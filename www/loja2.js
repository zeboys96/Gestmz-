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
      lerVendas(diaIso(a), diaIso(b, 1)),
      all(() => sb.from('despesas').select('valor').gte('data', a).lte('data', b))
    ]);
    vs = v0.filter(v => !v.anulada);
    const tot = r2(vs.reduce((s, v) => s + +v.total, 0)), luc = r2(vs.reduce((s, v) => s + lucroVenda(v), 0)), desp = r2(ds.reduce((s, d) => s + +d.valor, 0)), iva = r2(vs.reduce((s, v) => s + +v.iva, 0));
    const pg = {}, vd = {}, tp = {};
    vs.forEach(v => { pg[v.pagamento] = (pg[v.pagamento] || 0) + +v.total; const x = vd[v.usuario_nome] = vd[v.usuario_nome] || { n: 0, t: 0 }; x.n++; x.t += +v.total; v.itens.forEach(i => { const t = tp[i.nome] = tp[i.nome] || { q: 0, v: 0 }; t.q += i.un; t.v += i.total; }); });
    const top = Object.entries(tp).sort((x, y) => y[1].v - x[1].v).slice(0, 10), vend = Object.entries(vd).sort((x, y) => y[1].t - x[1].t);
    $('#r').innerHTML = `<div class="grid"><div class="stat hi"><span>Vendas</span><b>${mt(tot)}</b></div><div class="stat"><span>Nº de vendas</span><b>${vs.length}</b></div>${veCustos() ? `<div class="stat ok"><span>Lucro bruto</span><b>${mt(luc)}</b></div>` : ''}<div class="stat warn"><span>Despesas</span><b>${mt(desp)}</b></div>${veCustos() ? `<div class="stat ${luc - desp >= 0 ? 'ok' : 'bad'}"><span>Resultado (lucro − despesas)</span><b>${mt(luc - desp)}</b></div>` : ''}<div class="stat"><span>IVA incluído</span><b>${mt(iva)}</b></div></div>
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
  S.equipa = await all(() => sb.from('perfis').select('id,nome,email,papel,foto,ativo,ultimo_acesso').eq('loja_id', S.loja.id).order('nome'));
  const dono = S.perfil.papel === 'dono';
  const gere = u => u.id !== S.perfil.id && (dono ? u.papel !== 'dono' : u.papel === 'caixa');
  $('#main').innerHTML = `<div class="bar"><h2>Equipa</h2><button class="btn" id="novo" ${assin().ok ? '' : 'disabled'}>+ Novo funcionário</button></div>
  <div class="card"><b>Como dar acesso a um funcionário:</b> toque em <b>Novo funcionário</b>, escreva o nome, o e-mail e uma senha, escolha o cargo (${dono ? 'gerente ou caixa' : 'caixa'}) e defina um <b>código de acesso</b> de 6 a 10 números. Dê-lhe o e-mail, a senha e o código. Ao entrar, o funcionário vê o seu nome e a sua foto e digita o código para abrir o sistema.</div>
  <div class="team">${S.equipa.map(u => `<div class="member" ${u.ativo ? '' : 'style="opacity:.55"'}>${avatar(u, 'lg')}<div class="info"><b>${esc(u.nome)}</b><span class="muted small">${PAPEL[u.papel]}${u.email ? ' · ' + esc(u.email) : ''}</span><br><span class="small"><span class="dot ${online(u) ? 'on' : ''}"></span> ${u.ativo ? quando(u.ultimo_acesso) : 'acesso retirado'}</span>${gere(u) ? `<br><button class="link small" data-id="${u.id}">Editar ou remover</button>` : ''}</div></div>`).join('')}</div>`;
  $('#novo').onclick = () => formEquipa();
  $('#main').onclick = e => { const b = e.target.closest('button.link'); if (b) formEquipa(S.equipa.find(u => u.id === b.dataset.id)); };
};
function fotoCampo(atual) {
  return `<div class="foto-campo"><span class="lbl">Foto (opcional)</span><img class="preview" id="fotoprev" ${atual ? `src="${esc(atual)}"` : 'hidden'} alt="Pré-visualização" style="max-height:96px;border-radius:50%">
  <div class="row" style="margin-top:6px"><label class="btn ghost sm filebtn">Escolher ficheiro<input type="file" id="fotoarq" accept="image/*" hidden></label><label class="btn ghost sm filebtn">Tirar foto<input type="file" id="fotocam" accept="image/*" capture="user" hidden></label></div></div>`;
}
function ligarFoto(m) {
  const p = $('#fotoprev', m); const st = { v: null };
  const lido = async i => { if (!i.files[0]) return; try { st.v = await imgToData(i.files[0], 160, .8, true); p.src = st.v; p.hidden = false; } catch (e) { erro(e); } };
  ['#fotoarq', '#fotocam'].forEach(id => { const i = $(id, m); if (i) i.onchange = () => lido(i); });
  return st;
}
const gerarCodigo = () => String(Math.floor(Math.random() * 9e7) + 1e7);
function formEquipa(u) {
  const novo = !u, dono = S.perfil.papel === 'dono'; u = u || { nome: '', email: '', papel: 'caixa', ativo: true, foto: null };
  const papeis = dono ? [['caixa', 'Caixa (vende e consulta)'], ['gerente', 'Gerente (gere stock, anula vendas, vê relatórios e os caixas)']] : [['caixa', 'Caixa (vende e consulta)']];
  const w = modal(novo ? 'Novo funcionário' : 'Editar ' + esc(u.nome), `${fotoCampo(u.foto)}${fld('Nome completo', 'nome', u.nome, 'text', 'required')}
    ${novo ? fld('E-mail do funcionário', 'email', '', 'email', 'required autocapitalize="none" autocomplete="off"', 'É com este e-mail que ele entra.') + fld('Senha (mínimo 6 caracteres)', 'senha', '', 'text', 'required minlength="6" autocomplete="off"') : `<p class="muted small">E-mail: <b>${esc(u.email || '—')}</b></p>`}
    <label>Cargo<select class="in" name="papel">${opts(papeis, u.papel)}</select></label>
    <label>Código de acesso${novo ? '' : ' (deixe em branco para manter)'}<div class="row" style="gap:8px;flex-wrap:nowrap"><input class="in" name="pin" id="pin" inputmode="numeric" pattern="[0-9]{6,10}" maxlength="10" autocomplete="off" ${novo ? 'required' : ''} placeholder="6 a 10 números"><button type="button" class="btn ghost sm" id="gp" style="flex:none">Gerar</button></div><span class="hint">Dê este código ao funcionário. Ele digita-o depois de entrar com o e-mail e a senha.</span></label>
    ${!novo ? `<label class="chk"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Tem acesso ao sistema</label><button type="button" class="btn red sm" id="rm">Remover funcionário</button>` : ''}`, {
    okText: novo ? 'Criar funcionário' : 'Guardar',
    onOk: async d => {
      const foto = st.v || undefined, pin = (d.pin || '').trim();
      if (pin && !/^[0-9]{6,10}$/.test(pin)) throw new Error('O código de acesso deve ter de 6 a 10 números.');
      if (novo) {
        const email = d.email.trim().toLowerCase();
        const aux = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gestmz-aux' } });
        const { data, error } = await aux.auth.signUp({ email, password: d.senha });
        if (error) throw new Error(traduz(error.message));
        if (!data.user || (data.user.identities && data.user.identities.length === 0)) throw new Error('Este e-mail já tem conta no sistema. Use outro e-mail.');
        try {
          await q(sb.rpc('criar_perfil', { p_user: data.user.id, p_nome: d.nome, p_email: email, p_papel: d.papel, p_pin: pin }));
          if (foto) await q(sb.from('perfis').update({ foto }).eq('id', data.user.id));
        } finally { aux.auth.signOut().catch(() => { }); }
        if (!data.session) toast('Criado, mas o Supabase pede confirmação por e-mail. Desligue "Confirm email" (veja o LEIA-ME).', true); else toast('Funcionário criado. Dê-lhe o e-mail, a senha e o código de acesso.');
      } else {
        const o = { nome: d.nome.trim(), papel: d.papel, ativo: !!d.ativo }; if (foto) o.foto = foto;
        await q(sb.from('perfis').update(o).eq('id', u.id));
        if (pin) await q(sb.rpc('definir_pin', { p_user: u.id, p_pin: pin }));
        toast('Guardado.');
      }
      go('equipa', true);
    }
  });
  const st = ligarFoto(w.m);
  $('#gp', w.m).onclick = () => { $('#pin', w.m).value = gerarCodigo(); };
  const rm = $('#rm', w.m);
  if (rm) rm.onclick = () => ask(`Remover «${u.nome}»? Perde o acesso de imediato e o e-mail fica livre. As vendas que fez continuam no histórico.`, async () => {
    await q(sb.rpc('remover_funcionario', { p_id: u.id })); w.close(); toast('Funcionário removido.'); go('equipa', true);
  }, 'Remover', true);
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
  <h3>3. Envie o comprovativo</h3><form id="f">${fld('Referência da transação (opcional)', 'ref', '', 'text', 'placeholder="Ex.: ID da mensagem de confirmação"')}<div class="foto-campo"><span class="lbl">Foto ou captura do comprovativo</span><div class="row" style="margin-top:6px"><label class="btn ghost filebtn">Escolher ficheiro / galeria<input type="file" id="comp" accept="image/*" hidden></label><label class="btn ghost filebtn">Tirar foto<input type="file" id="compcam" accept="image/*" capture="environment" hidden></label></div></div><img class="preview" id="prev" hidden alt="Pré-visualização do comprovativo"><br><button class="btn" id="env" ${pendente ? '' : ''}>Enviar comprovativo</button></form></div>
  <div class="card"><h3>Histórico de pagamentos</h3>${pg.length ? `<div class="tw"><table><tr><th>Data</th><th>Plano</th><th class="n">Valor</th><th>Estado</th></tr>${pg.map(x => `<tr><td>${fd(x.criado_em)}</td><td>${esc(x.plano)}</td><td class="n">${mt(x.valor)}</td><td><span class="tag ${x.estado}">${TXT_ESTADO[x.estado]}</span>${x.nota ? `<br><span class="small muted">${esc(x.nota)}</span>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="empty">Ainda sem pagamentos.</div>'}</div>`;
  const marca = () => { $$('#plans .plan').forEach(b => b.classList.toggle('on', b.dataset.k === plano)); $('#valor').textContent = mt(preco[plano]); };
  $('#plans').onclick = e => { const b = e.target.closest('.plan'); if (b) { plano = b.dataset.k; marca(); } };
  $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(p.numero.replace(/\s/g, '')); toast('Número copiado.'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#numero')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Seleccionado. Copie o número.'); } };
  ['#comp', '#compcam'].forEach(id => $(id).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { img = await imgToData(f, 1100, .72, false); $('#prev').src = img; $('#prev').hidden = false; } catch (er) { erro(er); } });
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
  <form class="card" id="fp"><h3>Perfil</h3><div class="row" style="align-items:center"><div style="flex:none">${avatar(p, 'xl')}</div><div>${fotoCampo(null).replace(' hidden', ' hidden')}</div></div>${fld('Nome', 'nome', p.nome, 'text', 'required')}<p class="muted small">Função: ${PAPEL[p.papel]}${S.loja ? ' · ' + esc(S.loja.nome) : ''}</p><button class="btn">Guardar perfil</button></form>
  <form class="card" id="fs"><h3>Mudar senha</h3>${fld('Senha atual', 'atual', '', 'password', 'required autocomplete="current-password"')}${fld('Nova senha (mínimo 6 caracteres)', 'senha', '', 'password', 'required minlength="6" autocomplete="new-password"')}${fld('Repita a nova senha', 'conf', '', 'password', 'required minlength="6" autocomplete="new-password"')}<p class="muted small">Se não se lembra da senha atual, não use este formulário: peça a recuperação de acesso.</p><button class="btn">Mudar senha</button></form>
  ${dono ? `<form class="card" id="fl"><h3>Dados do estabelecimento</h3>${fld('Nome', 'nome', S.loja.nome, 'text', 'required')}<label>Tipo<select class="in" name="tipo">${opts(TIPOS_LOJA, S.loja.tipo)}</select></label><div class="row">${fld('NUIT', 'nuit', S.loja.nuit || '')}${fld('Telefone', 'tel', S.loja.tel || '', 'tel')}</div>${fld('Endereço', 'endereco', S.loja.endereco || '')}<p class="muted small">Estes dados aparecem no recibo.</p><button class="btn">Guardar dados</button></form>` : ''}`;
  const st = ligarFoto($('#fp'));
  $('#fp').onsubmit = async e => { e.preventDefault(); try { const o = { nome: $('[name=nome]', e.target).value.trim() }; if (st.v) o.foto = st.v; await q(sb.from('perfis').update(o).eq('id', p.id)); Object.assign(S.perfil, o); toast('Perfil guardado.'); shell(S.perfil.papel === 'super' ? navSuper() : navLoja()); go('perfil', true); } catch (er) { erro(er); } };
  $('#fs').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = $('button', f);
    const atual = $('[name=atual]', f).value, nova = $('[name=senha]', f).value, conf = $('[name=conf]', f).value; b.disabled = true;
    try {
      if (nova.length < 6) throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
      if (nova !== conf) throw new Error('As duas senhas novas não são iguais.');
      if (nova === atual) throw new Error('A nova senha tem de ser diferente da atual.');
      // Reautenticação: confirma a senha atual com um cliente à parte (não altera a sessão em uso). A recuperação de acesso é outro processo.
      const { data: ses } = await sb.auth.getSession(); const email = ses && ses.session && ses.session.user && ses.session.user.email;
      if (!email) throw new Error('Inicie sessão de novo para mudar a senha.');
      const aux = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'gestmz-aux' } });
      const { error: ea } = await aux.auth.signInWithPassword({ email, password: atual });
      aux.auth.signOut().catch(() => { });
      if (ea) throw new Error(/network|fetch|rede/i.test(ea.message || '') ? 'Sem ligação. Tente de novo com Internet.' : 'A senha atual está incorreta.');
      const { error } = await sb.auth.updateUser({ password: nova }); if (error) throw new Error(traduz(error.message));
      f.reset(); toast('Senha alterada.');
    } catch (er) { erro(er); } finally { b.disabled = false; }
  };
  const fl = $('#fl'); if (fl) fl.onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(fl)); try { await q(sb.rpc('atualizar_loja', { p_nome: d.nome, p_tipo: d.tipo, p_nuit: d.nuit, p_tel: d.tel, p_endereco: d.endereco })); await recarregarLoja(); shell(navLoja()); go('perfil', true); toast('Dados guardados.'); } catch (er) { erro(er); } };
  if (window.GestMZAtualizacao) GestMZAtualizacao.cartaoConta($('#main'));
};

/* ======================= SUPORTE (dono da loja) ======================= */
VIEWS.suporte = async function () {
  const l = await all(() => sb.from('suporte_tickets').select('*').order('atualizado_em', { ascending: false }));
  $('#main').innerHTML = `<div class="bar"><h2>Suporte</h2><button class="btn" id="novo">+ Novo pedido</button></div>
  <div class="card"><p style="margin-top:0">Tem uma dúvida, uma sugestão ou um problema? Escreva aqui e o GestMZ responde. As suas sugestões ajudam a melhorar o sistema.</p>
  ${l.length ? `<div class="tw"><table><tr><th>Assunto</th><th>Tipo</th><th>Estado</th><th>Última mensagem</th><th></th></tr>${l.map(t => `<tr class="${t.estado === 'fechado' ? 'off' : ''}"><td>${t.nao_lido_loja ? '<span class="dot on"></span> ' : ''}<b>${esc(t.assunto)}</b></td><td>${TIPO_TK[t.tipo]}</td><td>${t.estado === 'aberto' ? 'À espera de resposta' : t.estado === 'fechado' ? 'Fechado' : 'Respondido'}</td><td>${fdt(t.atualizado_em)}</td><td class="act"><button class="btn ghost sm" data-id="${t.id}">Abrir</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Ainda não enviou nenhum pedido.</div>'}</div>`;
  badge('suporte', l.filter(t => t.nao_lido_loja).length);
  $('#novo').onclick = () => modal('Novo pedido ao suporte', `<label>Tipo<select class="in" name="tipo">${opts([['duvida', 'Dúvida'], ['sugestao', 'Sugestão'], ['problema', 'Problema']])}</select></label>${fld('Assunto', 'assunto', '', 'text', 'required maxlength="120"')}<label>Mensagem<textarea class="in" name="texto" rows="5" required></textarea></label>`, {
    okText: 'Enviar', onOk: async d => { await q(sb.rpc('abrir_ticket', { p_tipo: d.tipo, p_assunto: d.assunto, p_texto: d.texto })); toast('Pedido enviado. Vamos responder em breve.'); go('suporte', true); } });
  $('#main').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) abrirTicket(l.find(t => t.id === b.dataset.id), false); };
};

/* ======================= AJUDA ======================= */
const SLIDES = [
  ['painel', 'Bem-vindo ao GestMZ', 'Vendas, stock, validades, equipa e assinatura num só lugar. Funciona no telemóvel e no computador, e todos os aparelhos da loja veem os mesmos dados.'],
  ['vender', 'Vender é rápido', 'Passe o leitor de código de barras e o produto entra na venda. Escolha como o cliente paga (dinheiro, M-Pesa, e-Mola, mKesh…), finalize e imprima o recibo. No telemóvel, use o botão da câmara para ler o código.'],
  ['produtos', 'Produtos e categorias', 'Ao registar um produto, escolha a categoria numa lista (bebidas, cereais, higiene, cosméticos, papelaria, medicamentos…). Falta uma? Crie uma nova na hora, sem sair do ecrã.'],
  ['barcode', 'Embalagem e unidade', 'Registe o produto uma só vez. Exemplo: o sabonete vem em caixas de 20. Indique o código da caixa, o código da unidade, o custo e o preço da caixa e o preço de cada unidade. Ler a caixa vende a caixa inteira (e baixa 20 do stock); ler a unidade vende 1. O stock conta-se sempre em unidades, por isso nunca há stock duplicado.'],
  ['registo', 'Stock e validades', 'Cada entrada tem lote e validade. O sistema vende primeiro o que expira primeiro e nunca vende lotes expirados. O painel avisa o que está a acabar e o que está para expirar.'],
  ['equipa', 'Equipa com perfil e foto', 'O dono cria gerentes e caixas com e-mail, senha, foto e um código de acesso. Ao entrar, o funcionário vê o seu nome e foto e digita o código. Cada cargo vê só o que lhe cabe: o caixa só as suas vendas, o gerente também a equipa de caixas, e o dono vê tudo da loja.'],
  ['sair', 'O caixa não apaga nada sozinho', 'Para retirar um produto da venda ou anular uma venda, o caixa precisa que o gerente escreva o seu e-mail e senha. Tudo fica registado em “Registo”, com data e nome.'],
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

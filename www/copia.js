/* GestMZ — cópia de segurança e restauro das vendas ainda não enviadas (fila deste aparelho).
   Serve para a passagem para o APK assinado (reinstalar apaga a fila) e para qualquer troca de aparelho.
   Princípios: o ficheiro não leva senhas, tokens nem custos; só se aceita para a MESMA loja e o MESMO utilizador;
   cada venda é validada e reconstruída campo a campo; as repetidas (mesma referência) são ignoradas; e o servidor
   continua a ser quem decide: recusa duplicados (índice único loja+referência) e recalcula preços e stock. */
(function (raiz) {
  'use strict';
  const FORMATO = 'gestmz-fila', VERSAO = 1, MAX_BYTES = 2 * 1024 * 1024, MAX_VENDAS = 500;
  const PAGAMENTOS = ['Numerário', 'M-Pesa', 'e-Mola', 'mKesh', 'Cartão/POS', 'Transferência', 'Fiado'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const num = (v, min, max) => typeof v === 'number' && isFinite(v) && v >= min && v <= max;

  async function sha256(t) {
    const b = await raiz.crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  // texto canónico: o mesmo conteúdo dá sempre o mesmo resumo
  const canon = v => JSON.stringify(v);

  // deixa passar só texto curto, números finitos e booleanos
  function simples(o, texto, numeros, bools) {
    const r = {};
    texto.forEach(k => { if (typeof o[k] === 'string') r[k] = o[k].slice(0, 200); });
    numeros.forEach(k => { if (num(o[k], -1e12, 1e12)) r[k] = o[k]; });
    (bools || []).forEach(k => { if (typeof o[k] === 'boolean') r[k] = o[k]; });
    return r;
  }
  function limparVenda(v) {
    if (!v || typeof v !== 'object') return null;
    const r = simples(v, ['id', 'data', 'usuario_nome', 'cliente_id', 'pagamento'], ['num', 'subtotal', 'desconto', 'iva', 'total', 'recebido', 'troco'], ['pendente']);
    r.itens = (Array.isArray(v.itens) ? v.itens : []).slice(0, 200).filter(i => i && typeof i === 'object')
      .map(i => simples(i, ['produto_id', 'nome', 'codigo', 'apresentacao'], ['qtd', 'un_por_caixa', 'un', 'preco', 'total', 'iva', 'desconto'], ['caixa']));   // sem custo_un
    return r;
  }

  /* Valida uma venda da fila e devolve-a reconstruída, ou { erro }. */
  function limparEntrada(x, perfil, agora) {
    if (!x || typeof x !== 'object') return { erro: 'entrada inválida' };
    if (typeof x.ref !== 'string' || !UUID.test(x.ref)) return { erro: 'referência inválida' };
    if (x.uid !== perfil.id || x.loja !== perfil.loja_id) return { erro: 'pertence a outro utilizador ou outra loja' };
    if (!PAGAMENTOS.includes(x.pagamento)) return { erro: 'forma de pagamento inválida' };
    if (x.cliente != null && !(typeof x.cliente === 'string' && UUID.test(x.cliente))) return { erro: 'cliente inválido' };
    if (x.pagamento === 'Fiado' && !x.cliente) return { erro: 'venda a fiado sem cliente' };
    if (!Array.isArray(x.itens) || !x.itens.length || x.itens.length > 200) return { erro: 'itens inválidos' };
    const itens = [];
    for (const i of x.itens) {
      if (!i || typeof i.produto_id !== 'string' || !UUID.test(i.produto_id)) return { erro: 'produto inválido' };
      if (!Number.isInteger(i.qtd) || i.qtd < 1 || i.qtd > 100000) return { erro: 'quantidade inválida' };
      itens.push({ produto_id: i.produto_id, qtd: i.qtd, caixa: i.caixa === true });
    }
    if (!num(x.desconto == null ? 0 : x.desconto, 0, 1e9)) return { erro: 'desconto inválido' };
    if (!num(x.recebido == null ? 0 : x.recebido, 0, 1e12)) return { erro: 'valor recebido inválido' };
    const t = Date.parse(x.data);
    if (typeof x.data !== 'string' || isNaN(t) || t > agora + 24 * 3600 * 1000 || t < Date.UTC(2020, 0, 1)) return { erro: 'data inválida' };
    const venda = limparVenda(x.venda);
    if (!venda || !num(venda.total, 0, 1e12)) return { erro: 'recibo provisório inválido' };
    venda.id = 'local-' + x.ref; venda.pendente = true;
    return { ok: { ref: x.ref, uid: x.uid, loja: x.loja, itens, pagamento: x.pagamento, cliente: x.cliente || null, desconto: x.desconto || 0, recebido: x.recebido || 0, data: new Date(t).toISOString(), venda, erro: null } };
  }

  /* Cria o ficheiro de cópia com as vendas deste utilizador. */
  async function exportar(fila, perfil, agora) {
    const dele = fila.filter(x => x && x.uid === perfil.id), minhas = dele.map(x => limparEntrada(Object.assign({}, x, { erro: null }), perfil, (agora || Date.now())).ok).filter(Boolean);
    const corpo = { formato: FORMATO, versao: VERSAO, criado: new Date(agora || Date.now()).toISOString(), uid: perfil.id, loja: perfil.loja_id, vendas: minhas };
    const texto = JSON.stringify(Object.assign({}, corpo, { resumo: await sha256(canon(minhas)) }));
    return { texto, n: minhas.length, ignoradas: dele.length - minhas.length, nome: 'gestmz-vendas-pendentes-' + corpo.criado.slice(0, 10) + '.json' };
  }

  /* Analisa um ficheiro de cópia SEM mexer em nada. Devolve o que seria importado. */
  async function validar(texto, perfil, filaAtual, agora) {
    agora = agora || Date.now();
    if (typeof texto !== 'string' || !texto.length) return { erro: 'Ficheiro vazio.' };
    if (texto.length > MAX_BYTES) return { erro: 'Ficheiro demasiado grande para ser uma cópia de vendas.' };
    let o; try { o = JSON.parse(texto); } catch (e) { return { erro: 'O ficheiro não é uma cópia do GestMZ (não é JSON válido).' }; }
    if (!o || o.formato !== FORMATO || o.versao !== VERSAO || !Array.isArray(o.vendas)) return { erro: 'O ficheiro não é uma cópia de vendas do GestMZ, ou é de uma versão que não conheço.' };
    if (o.vendas.length > MAX_VENDAS) return { erro: 'Demasiadas vendas no ficheiro.' };
    if (o.uid !== perfil.id || o.loja !== perfil.loja_id) return { erro: 'Esta cópia pertence a outro utilizador ou a outra loja. Entre com a conta que a criou.' };
    if (typeof o.resumo !== 'string' || o.resumo !== await sha256(canon(o.vendas))) return { erro: 'O ficheiro está corrompido ou foi alterado (o resumo não confere). Nada foi importado.' };
    const ja = new Set((filaAtual || []).map(x => x.ref)), vistos = new Set(), novas = [], rejeitadas = [];
    let repetidas = 0;
    for (const x of o.vendas) {
      const r = limparEntrada(x, perfil, agora);
      if (r.erro) { rejeitadas.push({ ref: x && x.ref, motivo: r.erro }); continue; }
      if (ja.has(r.ok.ref) || vistos.has(r.ok.ref)) { repetidas++; continue; }
      vistos.add(r.ok.ref); novas.push(r.ok);
    }
    // tudo ou nada: se alguma venda for inválida, não se importa nenhuma (evita uma restauração parcial enganadora)
    if (rejeitadas.length) return { erro: rejeitadas.length + ' venda(s) do ficheiro são inválidas (' + rejeitadas[0].motivo + '). Nada foi importado.', rejeitadas };
    return { ok: true, novas, repetidas, total: o.vendas.length };
  }

  const api = { exportar, validar, limparEntrada, FORMATO, VERSAO };
  raiz.GestCopia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---------- interface (só no navegador) ---------- */
  if (typeof document === 'undefined') return;
  const pedirFicheiro = () => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.style.display = 'none';
    i.onchange = () => { const f = i.files && i.files[0]; i.remove(); if (!f) return res(null); if (f.size > MAX_BYTES) return res(''); const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsText(f); };
    document.body.appendChild(i); i.click();
  });
  api.guardarCopia = async function () {
    const p = S.perfil; if (!p) return;
    const e = await exportar(lerFila(), p);
    if (!e.n) return toast('Não há vendas por enviar neste aparelho.');
    await download(e.nome, e.texto, 'application/json');
    toast(e.n + ' venda(s) guardadas no ficheiro. Guarde-o fora do telemóvel (e-mail, Drive…).' + (e.ignoradas ? ' ATENÇÃO: ' + e.ignoradas + ' venda(s) não puderam ser incluídas (dados inválidos); não reinstale sem as verificar.' : ''), !!e.ignoradas);
  };
  api.restaurarCopia = async function () {
    const p = S.perfil; if (!p) return;
    const t = await pedirFicheiro(); if (t === null) return;
    const v = await validar(t, p, lerFila());
    if (v.erro) return toast(v.erro, true);
    if (!v.novas.length) return toast(v.repetidas ? 'Todas as vendas do ficheiro já estão neste aparelho. Nada a fazer.' : 'O ficheiro não tem vendas.');
    ask('Restaurar ' + v.novas.length + ' venda(s)?' + (v.repetidas ? ' (' + v.repetidas + ' já existiam e serão ignoradas.)' : '') + ' Seguem para o servidor quando houver internet; o servidor recusa repetidas.', () => {
      const f = lerFila(); v.novas.forEach(x => f.push(x));
      if (!jSet(FILA_K, f)) return toast('Não há espaço neste aparelho. Nada foi restaurado.', true);
      netUpdate(); toast(v.novas.length + ' venda(s) restauradas.'); sincronizarFila().catch(() => { });
    }, 'Restaurar');
  };
  // cartão na página «A minha conta» (todas as contas de loja)
  api.cartaoConta = function (main) {
    if (!main || !S.perfil || S.perfil.papel === 'super') return;
    const n = minhaFila().length, d = document.createElement('div'); d.className = 'card';
    d.innerHTML = '<h3>Cópia das vendas por enviar</h3><p class="muted small">Vendas feitas sem internet ainda não enviadas: <b>' + n + '</b>. Antes de trocar de telemóvel ou reinstalar a aplicação, deixe chegar a 0 (com internet) ou guarde uma cópia. O ficheiro não leva senhas.</p><div class="mf"><button type="button" class="btn ghost" id="cpg">Guardar cópia</button><button type="button" class="btn ghost" id="cpr">Restaurar de um ficheiro</button></div>';
    main.appendChild(d); d.querySelector('#cpg').onclick = () => api.guardarCopia().catch(e => toast(e.message, true)); d.querySelector('#cpr').onclick = () => api.restaurarCopia().catch(e => toast(e.message, true));
  };
})(typeof window !== 'undefined' ? window : globalThis);

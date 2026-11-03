'use strict';
/* GestMZ — Termos de utilização e Política de privacidade (textos curtos, escritos a partir do que a app realmente faz).
   Mostram-se uma vez, no primeiro acesso depois de a conta existir, a qualquer utilizador de loja (dono, gerente, caixa).
   A aceitação (versão + data) fica na própria conta (user_metadata do Supabase Auth) e neste aparelho; não se repete em cada entrada,
   só quando a VERSAO mudar por uma alteração relevante. Se a internet falhar, a aceitação fica no aparelho e sincroniza depois.
   Texto de boa-fé, em linguagem simples; convém revisão por um advogado em Moçambique antes de uso comercial alargado. */
(function (raiz) {
  const VERSAO = '2026-11-01';   // só mudar quando a alteração for relevante (obriga a nova aceitação)
  const CONTACTO = '';           // opcional: e-mail ou telefone público do responsável (vazio = usa-se o separador «Suporte»)
  const quando = 'Versão ' + VERSAO;
  const contacto = () => CONTACTO
    ? `<b>${CONTACTO.replace(/[<>&]/g, '')}</b> ou, no caso do dono da loja, pelo separador «Suporte» da aplicação`
    : 'o dono da loja (se for funcionário) ou, no caso do dono da loja, o separador «Suporte» da aplicação';

  const TEXTOS = {
    termos: {
      titulo: 'Termos de utilização',
      html: () => `<p class="muted small">${quando}</p>
<h4>1. Para que serve o GestMZ</h4>
<p>O GestMZ é uma aplicação para gerir lojas, farmácias e outros comércios: vendas, stock e validades, clientes e fiado, caixa e relatórios. Funciona no telemóvel, no computador e no navegador.</p>
<h4>2. O seu acesso</h4>
<p>Não há registo público. O dono da loja é criado pelo administrador do GestMZ e os funcionários (gerente e caixa) pelo dono da loja. O que cada pessoa vê e faz depende do cargo que lhe foi atribuído: o caixa vende e fecha o seu caixa; o gerente também gere produtos e stock; o dono vê tudo da sua loja, incluindo custos, despesas e lucros.</p>
<h4>3. Os seus deveres</h4>
<ul><li>Guarde a sua senha e o seu código de acesso. São pessoais: não os partilhe.</li>
<li>Registe informação verdadeira e use a aplicação só para a atividade da loja.</li>
<li>Não tente aceder a dados de outras lojas nem contornar os limites de acesso.</li>
<li>Se suspeitar que alguém usou a sua conta, mude a senha e avise o dono da loja ou o Suporte.</li>
<li>O dono da loja responde pelas contas dos seus funcionários e deve retirar o acesso a quem sair.</li></ul>
<h4>4. Os dados da loja</h4>
<p>Os dados que a loja regista pertencem à loja. A aplicação trata-os apenas para prestar o serviço, como explica a Política de privacidade.</p>
<h4>5. Trabalhar sem internet</h4>
<p>Pode vender sem internet: a venda fica guardada no aparelho e segue quando a ligação voltar. Até seguir, só existe nesse aparelho; por isso não desinstale a aplicação nem apague os dados do aparelho com vendas por enviar.</p>
<h4>6. Recibos e impostos</h4>
<p>Os recibos da aplicação são comprovativos simples e não substituem as obrigações fiscais e contabilísticas da loja.</p>
<h4>7. Disponibilidade</h4>
<p>Fazemos o possível para manter o serviço disponível e seguro, mas não garantimos funcionamento sem interrupções (internet, energia e serviços de terceiros podem falhar). O acesso pode ser suspenso por falta de subscrição, uso indevido ou ordem legal.</p>
<h4>8. Alterações e contacto</h4>
<p>Estes termos podem mudar; se a alteração for relevante, a aplicação pede nova aceitação. Aplica-se a lei da República de Moçambique. Dúvidas: ${contacto()}.</p>`
    },
    privacidade: {
      titulo: 'Política de privacidade',
      html: () => `<p class="muted small">${quando}</p>
<div class="card" style="margin:8px 0"><b>Em resumo</b>
<ul><li>Usamos só os dados necessários para a loja funcionar: vender, controlar o stock, fechar o caixa e gerir a conta.</li>
<li>Não vendemos os seus dados, não os usamos para publicidade e a aplicação não faz análise nem rastreio do seu comportamento.</li>
<li>Os dados ficam guardados em servidores seguros fora de Moçambique, e cada loja só vê os seus.</li>
<li>Pode pedir para ver, corrigir ou apagar os seus dados.</li></ul></div>
<h4>1. Dados que tratamos e para quê</h4>
<ul><li><b>Conta:</b> nome, e-mail, cargo, fotografia de perfil (opcional) e data do último acesso, para o identificar e aplicar as suas permissões. A senha nunca é guardada em texto legível; o código de acesso dos funcionários é guardado só de forma cifrada.</li>
<li><b>Loja:</b> nome, tipo de negócio, NUIT, telefone, endereço, estado da subscrição e comprovativos de pagamento, para gerir o serviço.</li>
<li><b>Atividade da loja:</b> produtos, preços, stock e validades, fotografias de produtos, vendas e quem as fez, clientes (nome, telefone e dívida), recebimentos, despesas, fechos de caixa, notificações e um registo de ações importantes, para o funcionamento diário e os relatórios.</li>
<li><b>Suporte:</b> as mensagens que enviar.</li>
<li><b>No seu aparelho:</b> uma cópia para trabalhar sem internet, as vendas por enviar, a sessão e preferências.</li></ul>
<h4>2. Câmara</h4>
<p>A câmara só é usada quando a abre, para ler códigos de barras ou fotografar um produto. A leitura de códigos não guarda imagens; as fotografias de produtos ficam num espaço privado da loja.</p>
<h4>3. Quem recebe os dados</h4>
<p>Os dados são tratados por fornecedores que nos prestam serviços: <b>alojamento e base de dados na nuvem</b> (servidores na Europa, fora de Moçambique), <b>serviços de distribuição da aplicação e das atualizações</b> e um <b>serviço externo de tipos de letra</b>. Estes fornecedores tratam os dados só para nos prestar o serviço. Não vendemos nem cedemos dados a terceiros para outros fins, salvo se a lei o exigir.</p>
<p><b>Endereço de internet (IP):</b> sempre que a aplicação se liga à internet, o fornecedor que a serve e o serviço de tipos de letra podem ver o endereço IP do aparelho e a data do pedido. Os fornecedores de distribuição da aplicação e de tipos de letra não recebem as vendas nem os dados das lojas.</p>
<h4>4. Quem vê o quê</h4>
<p>O dono vê tudo da sua loja. O gerente e o caixa veem só o que o seu cargo permite (o caixa não vê custos, lucros nem despesas). A administração do GestMZ vê dados básicos e de contacto das lojas, a subscrição, comprovativos e pedidos de suporte; no uso normal não consulta as vendas nem o stock.</p>
<h4>5. Como protegemos</h4>
<p>Cada loja está isolada das outras; as permissões são verificadas no servidor e não só no ecrã; as ligações são cifradas e as ações sensíveis ficam registadas. Nenhum sistema é infalível: guarde bem a sua senha.</p>
<h4>6. Quanto tempo guardamos</h4>
<p>Os dados ficam enquanto a conta existir. Não os apagamos automaticamente; pode pedir a eliminação (ver abaixo), salvo o que a lei obrigar a manter.</p>
<h4>7. Os seus direitos</h4>
<p>Pode pedir para ver os seus dados, corrigi-los, eliminá-los (quando a lei o permitir), opor-se ao tratamento ou receber uma cópia dos dados da loja. Peça a: ${contacto()}. Os dados de clientes da loja são da responsabilidade da loja: registe apenas o necessário.</p>
<h4>8. Menores e alterações</h4>
<p>O GestMZ é de uso profissional e não se destina a menores de 18 anos. Se esta política mudar de forma relevante, a aplicação pede nova aceitação.</p>`
    }
  };

  const css = '.legal h4{margin:16px 0 4px;font-size:15px}.legal p,.legal li{line-height:1.5;font-size:14px}.legal ul{padding-left:20px;margin:4px 0}';
  function estilo() { if (document.getElementById('legal-css')) return; const s = document.createElement('style'); s.id = 'legal-css'; s.textContent = css; document.head.appendChild(s); }

  function abrir(qual) {
    const t = TEXTOS[qual]; if (!t) return null; estilo();
    return modal(t.titulo, `<div class="legal">${t.html()}</div>`, { wide: true });
  }
  /* ligações só dentro da app (cartão «Conta» e ecrã de primeira aceitação); nunca no ecrã de entrada */
  function ligacoes() {
    return `<div class="legal-links"><button type="button" class="link" data-legal="termos">Termos de utilização</button> · <button type="button" class="link" data-legal="privacidade">Política de privacidade</button></div>`;
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-legal]'); if (b) { e.preventDefault(); abrir(b.dataset.legal); } });

  const chave = id => 'gestmz_termos_' + id;
  async function guardarAceitacao() {
    const dados = { termos_versao: VERSAO, termos_em: new Date().toISOString() };
    const { error } = await sb.auth.updateUser({ data: dados });
    if (error) throw new Error(error.message);
  }
  /* Primeiro acesso (ou nova versão relevante): pede a aceitação. Falha de rede nunca bloqueia a loja. */
  async function exigirAceitacao() {
    try {
      if (!S.perfil || !['dono', 'gerente', 'caixa'].includes(S.perfil.papel)) return;
      const { data } = await sb.auth.getSession(); const user = data && data.session && data.session.user; if (!user) return;
      const meta = user.user_metadata || {};
      if (meta.termos_versao === VERSAO) { lsSet(chave(user.id), VERSAO); return; }
      if (lsGet(chave(user.id)) === VERSAO) { guardarAceitacao().catch(() => { }); return; }   // aceitou sem internet: sincroniza agora
      if (document.getElementById('legal-gate')) return;
      estilo();
      const m = document.createElement('div'); m.className = 'modal'; m.id = 'legal-gate';
      m.innerHTML = `<div class="box wide" role="dialog" aria-modal="true" aria-labelledby="lg-t"><div class="mh"><b id="lg-t">Termos e privacidade</b></div><div class="mb legal">
        <p>Antes de começar, leia os documentos abaixo.</p>
        <ul><li><button type="button" class="link" data-legal="termos">Termos de utilização</button></li><li><button type="button" class="link" data-legal="privacidade">Política de privacidade</button></li></ul>
        <label style="display:flex;gap:10px;align-items:flex-start;margin:14px 0"><input type="checkbox" id="lg-ck" style="margin-top:3px"><span>Li e concordo.</span></label>
        <span class="ferr" id="lg-er" role="alert"></span>
        <div class="mf"><button type="button" class="btn ghost" id="lg-sair">Sair</button><button type="button" class="btn" id="lg-ok" disabled>Avançar</button></div></div></div>`;
      document.body.appendChild(m);
      const ck = m.querySelector('#lg-ck'), ok = m.querySelector('#lg-ok'), er = m.querySelector('#lg-er');
      ck.onchange = () => { ok.disabled = !ck.checked; };
      m.querySelector('#lg-sair').onclick = () => { m.remove(); sair(); };
      ok.onclick = async () => {
        ok.disabled = true; er.textContent = '';
        try { await guardarAceitacao(); lsSet(chave(user.id), VERSAO); m.remove(); toast('Obrigado. Aceitação registada.'); }
        catch (x) {
          if (typeof ehRede === 'function' && ehRede(x)) { lsSet(chave(user.id), VERSAO); m.remove(); toast('Aceitação guardada neste aparelho; fica registada quando houver internet.'); }
          else { er.textContent = 'Não foi possível registar agora: ' + x.message; ok.disabled = false; }
        }
      };
    } catch (e) { /* nunca bloquear a loja por causa disto */ }
  }
  /* cartão em «Conta» */
  function cartaoConta(main) {
    if (!main || !S.perfil || S.perfil.papel === 'super') return;
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<h3>Termos e privacidade</h3><p class="muted small">Versão ${VERSAO}.</p>${ligacoes().replace('legal-links', 'legal-links" style="text-align:left')}`;
    main.appendChild(d);
  }
  raiz.GestLegal = { VERSAO, TEXTOS, abrir, ligacoes, exigirAceitacao, cartaoConta };
})(typeof window !== 'undefined' ? window : globalThis);

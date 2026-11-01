'use strict';
/* GestMZ — Termos de uso, Política de privacidade e Contrato de subscrição (resumo).
   Textos versionados dentro da app (funcionam sem internet). O dono da loja aceita uma vez por versão; a aceitação fica guardada
   nos dados da própria conta (user_metadata do Supabase Auth) e neste aparelho. Funcionários e visitantes podem ler os textos.
   Estes textos são um modelo de boa-fé escrito em linguagem simples; devem ser revistos por um advogado em Moçambique antes de uso comercial alargado. */
(function (raiz) {
  const VERSAO = '2026-11-01';
  const CONTACTO = '';   // opcional: e-mail ou telefone público do prestador (se vazio, o contacto é pelo separador «Suporte» da app)
  const quando = 'Em vigor desde 1 de novembro de 2026 · versão ' + VERSAO;
  const contacto = () => CONTACTO ? `<b>${CONTACTO.replace(/[<>&]/g, '')}</b> ou pelo separador «Suporte» da aplicação` : 'pelo separador «Suporte» da aplicação';

  const TEXTOS = {
    termos: {
      titulo: 'Termos de uso',
      html: () => `<p class="muted small">${quando}</p>
<h4>1. O que é o GestMZ</h4>
<p>O GestMZ é uma aplicação de gestão para lojas, farmácias e outros comércios: vendas, stock, validades, clientes, caixa e relatórios. Funciona no telemóvel, no computador e no navegador. Estes termos aplicam-se a quem usa a aplicação, em nome próprio ou de uma loja. «Prestador» é a entidade que gere o GestMZ; «Loja» é o comércio que subscreve o serviço.</p>
<h4>2. Contas e acesso</h4>
<ul><li>Não há registo público: as contas dos donos de loja são criadas pelo administrador do GestMZ, e as dos funcionários (gerente e caixa) pelo dono da loja.</li>
<li>Cada pessoa tem o seu e-mail e a sua senha, e os funcionários têm também um código de acesso. São pessoais: não os partilhe.</li>
<li>O dono da loja é responsável pelas contas dos seus funcionários e por tudo o que é feito com elas. Deve retirar o acesso a quem sair.</li>
<li>Se suspeitar que alguém usou a sua conta, mude a senha e avise o Suporte.</li></ul>
<h4>3. Teste grátis, subscrição e pagamento</h4>
<ul><li>Cada loja pode ter um período de teste gratuito. Depois, o acesso completo depende de uma subscrição (mensal, trimestral ou anual) pelos preços indicados na aplicação.</li>
<li>O pagamento é feito por transferência móvel (por exemplo e-Mola, M-Pesa ou mKesh) para o número indicado na aplicação, com envio do comprovativo. O acesso é ativado depois de o Prestador confirmar o pagamento.</li>
<li>Os preços podem mudar; a alteração aplica-se a períodos futuros e não a um período já pago.</li>
<li>Não há renovação automática: quando o período termina, a loja renova se quiser.</li>
<li>Sem subscrição válida, a loja deixa de poder registar vendas e passa a poder apenas consultar os seus dados, até renovar.</li></ul>
<h4>4. Os dados da loja são da loja</h4>
<p>Os dados que a Loja regista (produtos, vendas, clientes, despesas, fotografias) pertencem à Loja. O Prestador só os usa para prestar o serviço, como explica a Política de privacidade. A Loja pode guardar cópias das suas vendas e exportar relatórios.</p>
<h4>5. Uso correto</h4>
<p>Não use o GestMZ para atividades ilegais, para tentar aceder a dados de outras lojas, para contornar limites de acesso, para enviar conteúdo ilícito (por exemplo nas fotografias ou nas mensagens de suporte) ou para prejudicar o serviço. O Prestador pode suspender contas que o façam.</p>
<h4>6. Trabalhar sem internet</h4>
<p>A aplicação permite vender sem internet: a venda fica guardada no aparelho e segue quando a ligação voltar. Até seguir, ela só existe nesse aparelho. Por isso, não desinstale a aplicação nem apague os dados do aparelho com vendas por enviar; use a cópia das vendas em «A minha conta» quando for necessário. O Prestador não responde por vendas perdidas por apagamento ou perda do aparelho antes de serem enviadas.</p>
<h4>7. Impostos e documentos fiscais</h4>
<p>Os recibos e os valores de IVA da aplicação são comprovativos simples e indicativos. Não substituem as obrigações fiscais e contabilísticas da Loja. Confirme o seu enquadramento fiscal com o seu contabilista.</p>
<h4>8. Disponibilidade e responsabilidade</h4>
<p>O Prestador faz o possível para manter o serviço disponível e seguro, mas não garante funcionamento sem interrupções (internet, energia e serviços de terceiros podem falhar). O serviço é prestado «como está». Dentro do que a lei permite, a responsabilidade do Prestador limita-se ao valor pago pela Loja nos 3 meses anteriores ao problema, e não abrange lucros cessantes nem danos indiretos. Nada aqui limita direitos que a lei não permite limitar.</p>
<h4>9. Suspensão e fim</h4>
<p>A Loja pode deixar de usar o serviço quando quiser. O Prestador pode suspender ou terminar uma conta por falta de pagamento, uso indevido ou ordem legal, avisando sempre que possível. Depois do fim, os dados são tratados como explica a Política de privacidade.</p>
<h4>10. Alterações e lei aplicável</h4>
<p>Estes termos podem ser atualizados; as alterações importantes são mostradas na aplicação e pedem nova aceitação ao dono da loja. Aplica-se a lei da República de Moçambique. Dúvidas: ${contacto()}.</p>`
    },
    privacidade: {
      titulo: 'Política de privacidade',
      html: () => `<p class="muted small">${quando}</p>
<h4>1. Resumo</h4>
<p>Guardamos só o que é preciso para a loja funcionar. <b>Não vendemos dados, não os usamos para publicidade e não usamos reconhecimento facial.</b> Cada loja só vê os seus dados.</p>
<h4>2. Que dados tratamos</h4>
<ul><li><b>Conta:</b> nome, e-mail, função (dono, gerente, caixa), fotografia de perfil (opcional), data do último acesso. As senhas são tratadas pelo serviço de autenticação e nunca são guardadas em texto legível; o código de acesso dos funcionários é guardado de forma protegida e verificado no servidor.</li>
<li><b>Loja:</b> nome, tipo de negócio, NUIT, telefone, endereço, estado e validade da subscrição, comprovativos de pagamento enviados.</li>
<li><b>Operação da loja:</b> produtos, preços, stock e lotes, fotografias de produtos, vendas e quem as fez, clientes (nome, telefone e dívidas), recebimentos, despesas, fechos de caixa, notificações e um registo de ações importantes (auditoria).</li>
<li><b>No seu aparelho:</b> uma cópia para trabalhar sem internet, a fila de vendas por enviar e preferências. Os ficheiros de cópia das vendas que guardar ficam consigo.</li></ul>
<h4>3. Para que usamos</h4>
<p>Para prestar o serviço (vender, controlar o stock, fechar o caixa, mostrar relatórios), gerir subscrições e pagamentos, dar suporte, manter a segurança e prevenir abusos, e cumprir obrigações legais. Não tomamos decisões automáticas sobre pessoas.</p>
<h4>4. Câmara e permissões</h4>
<p>A câmara só é usada quando o utilizador a abre, para ler códigos de barras ou tirar a fotografia de um produto. As imagens de leitura de códigos não são guardadas. As fotografias de produtos são comprimidas e guardadas num espaço privado da loja.</p>
<h4>5. Quem vê o quê</h4>
<ul><li><b>Dono da loja:</b> todos os dados da sua loja, incluindo custos, lucros e despesas.</li>
<li><b>Gerente:</b> vendas e stock, sem custos, lucros, despesas nem plano da loja.</li>
<li><b>Caixa:</b> apenas o necessário para vender e fechar o seu caixa.</li>
<li><b>Administração do GestMZ:</b> dados básicos e de contacto das lojas, estado da subscrição, comprovativos e pedidos de suporte; não consulta as vendas e o stock das lojas no uso normal.</li></ul>
<h4>6. Onde ficam os dados e quem nos ajuda</h4>
<p>Os dados são guardados na plataforma Supabase (base de dados, autenticação e armazenamento), em servidores na Europa (Irlanda). O código da aplicação é distribuído através do GitHub e de serviços de alojamento web. Estes fornecedores tratam dados apenas para nos prestar o serviço. Como os servidores ficam fora de Moçambique, os dados podem ser transferidos para fora do país.</p>
<h4>7. Clientes da loja</h4>
<p>Quando a Loja regista dados dos seus clientes (nome, telefone, dívidas), a Loja decide para que os usa e é responsável por isso; o GestMZ trata esses dados por conta da Loja. Registe apenas o necessário.</p>
<h4>8. Segurança</h4>
<p>Cada loja está isolada das outras por regras na base de dados, as permissões são validadas no servidor e não apenas no ecrã, as ligações são cifradas, e as ações sensíveis ficam registadas. Nenhum sistema é infalível: guarde a sua senha em segurança e avise-nos de qualquer suspeita.</p>
<h4>9. Quanto tempo guardamos</h4>
<p>Enquanto a conta existir. Depois do fim da subscrição, mantemos os dados da loja durante 90 dias para que possa voltar; passado esse prazo podem ser apagados, salvo se a lei exigir que se mantenham. Os registos de auditoria e de pagamento podem ser guardados por mais tempo por razões de segurança e contabilidade.</p>
<h4>10. Os seus direitos</h4>
<p>Pode pedir acesso aos seus dados, a correção de dados errados, a sua eliminação (quando a lei o permitir) e a cópia dos dados da loja. Peça ${contacto()}. Respondemos com a maior brevidade possível.</p>
<h4>11. Crianças</h4>
<p>O GestMZ é para uso profissional e não se destina a menores de 18 anos.</p>
<h4>12. Alterações</h4>
<p>Se mudarmos esta política de forma importante, mostramos o aviso na aplicação e pedimos nova aceitação ao dono da loja.</p>`
    },
    contrato: {
      titulo: 'Contrato de subscrição (resumo)',
      html: () => `<p class="muted small">${quando}</p>
<p>Este resumo junta, numa página, o essencial do contrato entre o <b>Prestador</b> (GestMZ) e a <b>Loja</b> (o comércio do dono que aceita). Faz parte dele o que está nos Termos de uso e na Política de privacidade.</p>
<table class="legal-t"><tr><th>Objeto</th><td>Acesso à aplicação GestMZ para gerir a loja (vendas, stock, validades, clientes, caixa, relatórios), com suporte pelo separador «Suporte».</td></tr>
<tr><th>Quem aceita</th><td>O dono da loja, em nome da Loja, ao clicar «Li e aceito». A aceitação eletrónica fica registada com a data e a versão do texto.</td></tr>
<tr><th>Duração</th><td>Pelo período pago (1, 3 ou 12 meses) a contar da confirmação do pagamento, mais o período de teste, se houver. Sem renovação automática.</td></tr>
<tr><th>Preço</th><td>O indicado na aplicação para o plano escolhido, em meticais (MT). Pago por transferência móvel com envio de comprovativo.</td></tr>
<tr><th>Ativação</th><td>Depois de o Prestador confirmar o pagamento. Pagamentos rejeitados são comunicados com o motivo.</td></tr>
<tr><th>Fim do período</th><td>A loja passa a modo de consulta até renovar. Os dados mantêm-se durante 90 dias.</td></tr>
<tr><th>Reembolsos</th><td>Os períodos já iniciados não são reembolsados, salvo falha grave do serviço imputável ao Prestador, caso em que se compensa com tempo de utilização.</td></tr>
<tr><th>Os dados</th><td>São da Loja. O Prestador só os usa para prestar o serviço. A Loja pode pedir uma cópia.</td></tr>
<tr><th>Responsabilidades da Loja</th><td>Guardar as credenciais, gerir os seus funcionários, registar dados verdadeiros, cumprir as suas obrigações fiscais e legais, e não apagar os dados do aparelho com vendas por enviar.</td></tr>
<tr><th>Cessação</th><td>A Loja pode parar a qualquer momento. O Prestador pode suspender por falta de pagamento ou uso indevido.</td></tr>
<tr><th>Lei</th><td>Lei da República de Moçambique.</td></tr></table>
<p class="muted small">Dúvidas: ${contacto()}.</p>`
    }
  };

  const css = '.legal h4{margin:16px 0 4px;font-size:15px}.legal p,.legal li{line-height:1.5;font-size:14px}.legal ul{padding-left:20px;margin:4px 0}.legal-t{width:100%;border-collapse:collapse;font-size:14px}.legal-t th{text-align:left;vertical-align:top;width:34%;padding:8px 8px 8px 0;border-bottom:1px solid var(--b,#e2e8f0)}.legal-t td{padding:8px 0;border-bottom:1px solid var(--b,#e2e8f0)}.legal-links{margin-top:14px;text-align:center;font-size:12px}.legal-links .link{font-size:12px}';
  function estilo() { if (document.getElementById('legal-css')) return; const s = document.createElement('style'); s.id = 'legal-css'; s.textContent = css; document.head.appendChild(s); }

  function abrir(qual) {
    const t = TEXTOS[qual]; if (!t) return null; estilo();
    return modal(t.titulo, `<div class="legal">${t.html()}</div>`, { wide: true });
  }
  function ligacoes() {
    return `<div class="legal-links"><button type="button" class="link" data-legal="termos">Termos de uso</button> · <button type="button" class="link" data-legal="privacidade">Privacidade</button> · <button type="button" class="link" data-legal="contrato">Contrato</button></div>`;
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-legal]'); if (b) { e.preventDefault(); abrir(b.dataset.legal); } });

  const chave = id => 'gestmz_termos_' + id;
  async function guardarAceitacao(user) {
    const dados = { termos_versao: VERSAO, termos_em: new Date().toISOString() };
    const { error } = await sb.auth.updateUser({ data: dados });
    if (error) throw new Error(error.message);
  }
  /* Dono da loja: pede a aceitação da versão atual. Falha de rede nunca bloqueia a loja (fica pendente e volta a tentar-se). */
  async function exigirAceitacao() {
    try {
      if (!S.perfil || S.perfil.papel !== 'dono') return;
      const { data } = await sb.auth.getSession(); const user = data && data.session && data.session.user; if (!user) return;
      const meta = user.user_metadata || {};
      if (meta.termos_versao === VERSAO) { lsSet(chave(user.id), VERSAO); return; }
      if (lsGet(chave(user.id)) === VERSAO) { guardarAceitacao(user).catch(() => { }); return; }   // aceitou sem internet: sincroniza agora
      if (document.getElementById('legal-gate')) return;
      estilo();
      const m = document.createElement('div'); m.className = 'modal'; m.id = 'legal-gate';
      m.innerHTML = `<div class="box wide" role="dialog" aria-modal="true" aria-labelledby="lg-t"><div class="mh"><b id="lg-t">Termos, privacidade e contrato</b></div><div class="mb legal">
        <p>Antes de continuar, leia e aceite as condições de uso do GestMZ para a sua loja.</p>
        <ul><li><button type="button" class="link" data-legal="termos">Termos de uso</button></li><li><button type="button" class="link" data-legal="privacidade">Política de privacidade</button></li><li><button type="button" class="link" data-legal="contrato">Contrato de subscrição (resumo)</button></li></ul>
        <label style="display:flex;gap:10px;align-items:flex-start;margin:14px 0"><input type="checkbox" id="lg-ck" style="margin-top:3px"><span>Li e aceito os Termos de uso, a Política de privacidade e o Contrato de subscrição, em nome da minha loja.</span></label>
        <span class="ferr" id="lg-er" role="alert"></span>
        <div class="mf"><button type="button" class="btn ghost" id="lg-sair">Sair</button><button type="button" class="btn" id="lg-ok" disabled>Aceitar e continuar</button></div></div></div>`;
      document.body.appendChild(m);
      const ck = m.querySelector('#lg-ck'), ok = m.querySelector('#lg-ok'), er = m.querySelector('#lg-er');
      ck.onchange = () => { ok.disabled = !ck.checked; };
      m.querySelector('#lg-sair').onclick = () => { m.remove(); sair(); };
      ok.onclick = async () => {
        ok.disabled = true; er.textContent = '';
        try { await guardarAceitacao(user); lsSet(chave(user.id), VERSAO); m.remove(); toast('Obrigado. Aceitação registada.'); }
        catch (x) {
          if (typeof ehRede === 'function' && ehRede(x)) { lsSet(chave(user.id), VERSAO); m.remove(); toast('Aceitação guardada neste aparelho; fica registada quando houver internet.'); }
          else { er.textContent = 'Não foi possível registar agora: ' + x.message; ok.disabled = false; }
        }
      };
    } catch (e) { /* nunca bloquear a loja por causa disto */ }
  }
  /* cartão em «A minha conta» */
  function cartaoConta(main) {
    if (!main || !S.perfil || S.perfil.papel === 'super') return;
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<h3>Termos e privacidade</h3><p class="muted small">Versão ${VERSAO}.${S.perfil.papel === 'dono' ? ' A aceitação do dono da loja fica registada na conta.' : ''}</p>${ligacoes().replace('legal-links', 'legal-links" style="text-align:left')}`;
    main.appendChild(d);
  }
  raiz.GestLegal = { VERSAO, TEXTOS, abrir, ligacoes, exigirAceitacao, cartaoConta };
})(typeof window !== 'undefined' ? window : globalThis);

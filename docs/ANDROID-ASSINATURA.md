# GestMZ — Android: assinatura, atualização e dados locais

Estado: **nenhuma chave foi criada nem alterada; nenhum segredo foi mexido.** Este documento é a proposta a aprovar.

## 1. O que se sabe (e como se sabe)
- `applicationId` = `mz.gestmz.app` (`capacitor.config.json`); o workflow confere-o com `aapt2` em cada build.
- `versionName` = `package.json`; `versionCode` = major×10000 + minor×100 + patch (1.1.0 ⇒ 10100). O workflow falha se o APK não bater certo.
- O APK instalado vem do workflow `apk.yml`, que corre `./gradlew assembleDebug` **sem qualquer keystore**. O Gradle assina builds debug com `~/.android/debug.keystore`, que **é criado de novo em cada máquina do GitHub Actions**. Logo, cada APK descarregado do GitHub tem, quase certamente, um certificado diferente.
- **Não consegui inspecionar o APK instalado no seu telefone** (não há acesso ao aparelho; as descargas de artefactos do GitHub estão bloqueadas neste ambiente). A conclusão acima vem do desenho do workflow, não de `apksigner` sobre o ficheiro. **Não afirmo que a versão nova atualiza a instalada — a expectativa é que NÃO atualize.**

## 2. Efeito no telemóvel
O Android recusa atualizar uma app por cima se o certificado for diferente («App não instalada»). A recusa **não apaga nada**: a app antiga fica intacta. A única forma de passar para a versão assinada é desinstalar e instalar, **o que apaga os dados locais** (a app guarda no `localStorage` do WebView: sessão, cópia offline de produtos/clientes e a fila `gestmz_fila` de vendas ainda por sincronizar).

Plano de transição (uma única vez), sem perder vendas:
1. Com Internet, entrar com cada conta usada no aparelho; abrir o painel de vendas pendentes (ícone de fila) e sincronizar até ficar **0 pendentes**. As vendas já sincronizadas estão no Supabase (não dependem do telefone).
2. Confirmar no painel web que as últimas vendas aparecem.
3. Só então desinstalar e instalar o APK assinado; entrar de novo (a sessão é refeita; o código de acesso dos funcionários continua no servidor).
4. A partir daí, as atualizações são por cima, sem perda.
Lacuna conhecida: **não existe exportação das vendas pendentes**. Se houver vendas por sincronizar e não houver Internet, não desinstale. (Posso acrescentar um botão «guardar cópia das pendentes» se quiser.)

## 3. Como gerar e guardar a chave de produção sem Termux nem computador
Opção recomendada — **GitHub Codespaces no navegador do telemóvel** (terminal Linux com `keytool`; a chave nasce numa máquina descartável):
1. No repositório → Code → Codespaces → New (ou github.com/codespaces). Ramo `desenvolvimento/atualizacoes`.
2. No terminal: `keytool -genkeypair -v -keystore ~/gestmz-producao.jks -alias gestmz -keyalg RSA -keysize 4096 -validity 10000` (a palavra-passe é digitada por si, **nunca** escrita em comandos nem em ficheiros do repositório).
3. Impressão digital pública (para a variável de verificação): `keytool -list -v -keystore ~/gestmz-producao.jks -alias gestmz | grep SHA256`.
4. Em base64 para o segredo: `base64 -w0 ~/gestmz-producao.jks` — copiar do terminal e colar diretamente em Settings → Secrets → `ANDROID_KEYSTORE_BASE64` (e `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Fora do repositório, nunca em `git add`.
5. **Cópias de segurança (indispensável: perder a chave = todos os utilizadores têm de reinstalar outra vez):** descarregar o `.jks` para o telefone e guardá-lo em **dois** sítios independentes protegidos por palavra-passe (gestor de palavras-passe com anexos e/ou cofre encriptado + cópia offline). Guardar as palavras-passe separadamente do ficheiro.
6. Apagar o Codespace (Settings → Codespaces → Delete) — destrói a cópia na máquina.
7. Criar a variável de repositório (não segredo) `ANDROID_CERT_SHA256` com a impressão digital do passo 3.
Alternativas piores: gerar a chave dentro de um workflow (o ficheiro teria de sair num artefacto — acessível a quem tiver escrita — ou ser impresso nos registos); usar um serviço externo (envia a chave por canal que não controlamos).
Proteção contra fuga por workflow: segredos do repositório ficam acessíveis a qualquer workflow executado por quem tiver escrita. Melhor: mover os 4 segredos para **segredos de ambiente** no ambiente `aprovacao-release` (revisor obrigatório = você; ramo permitido = `main`) e fazer o job `android` da «candidata» usar esse ambiente. Não o fiz porque obrigaria a aprovação também nos testes do gatilho temporário.

## 4. O que o `versao.yml` já faz / o que acrescentei
- Modo `teste`: APK **debug** (chave efémera) — nunca atualiza o instalado. Modo `candidata`: exige os 4 segredos, compila `assembleRelease`, confere `applicationId`/`versionName`/`versionCode` e `apksigner verify`.
- **Novo (commit desta fase):** a candidata exige também a variável `ANDROID_CERT_SHA256` e **falha** se a impressão digital do APK for diferente ou se a variável não existir — evita publicar com a chave errada.
- Workflow só cria **rascunho** de Release, no job com `environment: aprovacao-release`. **Não consegui ler a configuração desse ambiente** (API bloqueada): confirme no GitHub → Settings → Environments que tem *Required reviewers* (você) e restrição de ramos.
- Descarga: o app abre o URL de `https://github.com/zeboys96/Gestmz-/releases/download/vX.Y.Z/…` (regex rígida) no navegador do sistema, mostra o SHA-256 e **é o instalador do Android que valida a assinatura**; versões menores/iguais não são oferecidas (sem downgrade). Verificado em testes simulados, não num telefone.

## 5. Antes de usar o APK assinado
1. Chave criada e guardada (secção 3), variável `ANDROID_CERT_SHA256` definida.
2. Correr `versao.yml` em `candidata` (depois do merge, ver `docs/GATILHO-TEMPORARIO.md`), descarregar o APK **assinado**, `apksigner verify --print-certs` e comparar com a impressão digital.
3. Instalar num segundo aparelho primeiro; só depois seguir o plano da secção 2.

## 6. Revisão desta fase (28/10/2026): procedimento seguro e propostas que aguardam a sua decisão
Nada foi criado nem executado: **a chave Android continua por criar.**

**Ordem segura de ponta a ponta**
1. *(Agora, sem risco)* Nada a fazer no telefone. O APK instalado mantém-se; **não desinstale**.
2. Decidir se quer as duas melhorias da secção «Propostas» abaixo (ambas pequenas e testáveis; só as faço com o seu «sim»).
3. Gerar a chave (secção 3) → definir os 4 segredos + `ANDROID_CERT_SHA256`. Passo seu (irreversível na prática: perder a chave obriga todos a reinstalar). Peço autorização imediatamente antes.
4. Após o merge autorizado, correr `versao.yml` em `candidata` → rascunho de Release com APK assinado, SHA-256 do ficheiro e verificação do certificado.
5. Instalar o APK assinado num **segundo telemóvel** de teste. Se «App não instalada» aparecer no telefone principal, **nada se perde**: a app antiga continua intacta.
6. Só no telefone principal, e só quando o painel de vendas pendentes mostrar **0 pendentes** e as últimas vendas aparecerem no painel web: desinstalar → instalar o APK assinado → entrar de novo. Esta passagem é única; daí em diante as atualizações são por cima e preservam tudo.
7. Quem não tiver Internet nesse momento e tiver vendas pendentes **não faz a passagem** até sincronizar.

**Propostas (não implementadas)**
- **A. «Guardar cópia das vendas pendentes»**: botão que descarrega um ficheiro com a fila `gestmz_fila` (sem senhas nem tokens) e permite reimportá-la depois da reinstalação. Fecha a única lacuna que pode perder dinheiro na passagem. Risco: o ficheiro contém dados de vendas e clientes; ficaria só no telefone. A reimportação tem de respeitar a idempotência do servidor para não duplicar vendas — requer testes próprios.
- **B. Prova da chave efémera**: um passo no modo `teste` que imprime o SHA-256 do certificado do APK debug. Duas execuções com valores diferentes provam que cada APK de teste tem chave diferente (hoje é dedução, não medição). Não toca em segredos.

**Riscos que continuam**: certificado do APK instalado não verificado (sem acesso ao aparelho); instalação de APK assinado **nunca testada num telefone real**; ambiente `aprovacao-release` não confirmado.

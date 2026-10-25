#!/usr/bin/env python3
"""Aplica a identidade do GestMZ ao projecto Android que o Capacitor acabou de criar (`npx cap add android`).
A pasta android/ não está no repositório: é gerada em cada compilação, por isso o ícone e o splash do Capacitor
voltavam sempre. Este script corre a seguir e falha (em vez de ignorar) se o modelo do Capacitor não tiver a forma esperada."""
import glob, os, re, shutil, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(RAIZ, 'android', 'app', 'src', 'main', 'res')
MANIFESTO = os.path.join(RAIZ, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
MEUS = os.path.join(RAIZ, 'resources', 'android', 'res')

def erro(m):
    # além do texto normal, escreve uma anotação do GitHub (aparece no resumo da execução) com o conteúdo que interessa para diagnosticar
    extra = ''
    for f in (os.path.join(RES, 'values', 'styles.xml'), MANIFESTO):
        try: extra += '\n--- ' + os.path.relpath(f, RAIZ) + ' ---\n' + open(f, encoding='utf-8').read()[:1800]
        except Exception: pass
    txt = ('ERRO: ' + m + extra).replace('%', '%25').replace('\r', '').replace('\n', '%0A')
    print('::error title=Identidade GestMZ::' + txt); print('ERRO: ' + m); sys.exit(1)

if not os.path.isdir(RES): erro('android/app/src/main/res não existe. Corra primeiro `npx cap add android`.')
man = open(MANIFESTO, encoding='utf-8').read()
for k in ('android:icon="@mipmap/ic_launcher"', 'android:roundIcon="@mipmap/ic_launcher_round"', '@style/AppTheme.NoActionBarLaunch'):
    if k not in man: erro('o AndroidManifest.xml não tem ' + k + ' (modelo do Capacitor mudou).')

# 1) remover o que o Capacitor trouxe (logótipo genérico)
for f in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')): os.remove(f)
for f in glob.glob(os.path.join(RES, 'mipmap-*', 'ic_launcher*')): os.remove(f)
for f in glob.glob(os.path.join(RES, 'drawable*', 'ic_launcher_*.xml')): os.remove(f)
for f in glob.glob(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher*.xml')): os.remove(f)

# 2) copiar os recursos do GestMZ
n = 0
for d, _, fs in os.walk(MEUS):
    for f in fs:
        dst = os.path.join(RES, os.path.relpath(os.path.join(d, f), MEUS)); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(d, f), dst); n += 1
print('copiados %d ficheiros de recursos' % n)

# 3) temas: splash verde (Android 12+ e anteriores) e fundo verde enquanto a WebView arranca (sem flash branco)
sp = os.path.join(RES, 'values', 'styles.xml')
s = open(sp, encoding='utf-8').read()
def bloco(nome):
    m = re.search(r'<style\s+name="%s"[^>]*>.*?</style>' % re.escape(nome), s, re.S)
    if not m: erro('styles.xml não tem o estilo ' + nome)
    return m
def acrescentar(nome, itens, exigir_splash=False):
    global s
    m = bloco(nome); b = m.group(0)
    if exigir_splash and 'SplashScreen' not in b.split('>')[0]: erro('o estilo %s não herda de Theme.SplashScreen: %s' % (nome, b.split('>')[0]))
    for k, v in itens:
        b = re.sub(r'\s*<item name="%s">.*?</item>' % re.escape(k), '', b, flags=re.S)
        b = b.replace('</style>', '    <item name="%s">%s</item>\n</style>' % (k, v))
    s = s.replace(m.group(0), b)
acrescentar('AppTheme.NoActionBarLaunch', [
    ('android:background', '@drawable/gestmz_splash'),
    ('windowSplashScreenBackground', '@color/gestmz_verde'),
    ('windowSplashScreenAnimatedIcon', '@drawable/gestmz_splash_icon'),
], exigir_splash=True)
acrescentar('AppTheme.NoActionBar', [('android:windowBackground', '@color/gestmz_verde')])
open(sp, 'w', encoding='utf-8').write(s)

# 4) verificações finais
if glob.glob(os.path.join(RES, 'drawable*', 'splash.png')): erro('ficou um splash.png do Capacitor')
for f in ('mipmap-xxxhdpi/ic_launcher.png', 'mipmap-xxxhdpi/ic_launcher_foreground.png', 'mipmap-anydpi-v26/ic_launcher.xml', 'drawable/gestmz_splash.xml', 'drawable-nodpi/gestmz_splash_icon.png'):
    if not os.path.isfile(os.path.join(RES, f)): erro('falta ' + f)
print('Identidade GestMZ aplicada ao projecto Android.')

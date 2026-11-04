package mz.gestmz.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Pattern;
import java.security.MessageDigest;

/* GestMZ — instala uma atualização que a própria app descarregou para a sua cache.
   Nunca instala nada sozinho: abre o instalador do Android, que pede a confirmação da pessoa e só aceita um APK
   assinado com o mesmo certificado da app instalada. Antes disso confere (1) que o ficheiro está na cache da app,
   (2) o SHA-256 esperado e (3) que o pacote é mesmo o GestMZ. */
@CapacitorPlugin(name = "GestMZInstalador")
public class GestMZInstalador extends Plugin {

    @PluginMethod
    public void podeInstalar(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject();
        r.put("pode", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void abrirPermissao(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("permissao");
        }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    /* Descarregador próprio (não depende de plugins genéricos). Só aceita o endereço oficial das versões, segue redirecionamentos
       apenas por HTTPS para domínios do GitHub, grava na cache da app e confere o SHA-256. Devolve {caminho} ou rejeita com um código curto. */
    private static final Pattern URL_OK = Pattern.compile("^https://github\\.com/zeboys96/Gestmz-/releases/download/v\\d+\\.\\d+\\.\\d+/GestMZ-\\d+\\.\\d+\\.\\d+-android\\.apk$");
    private static boolean hostOk(String h) {
        return h != null && (h.equals("github.com") || h.endsWith(".githubusercontent.com") || h.equals("githubusercontent.com"));
    }

    @PluginMethod
    public void transferir(final PluginCall call) {
        final String url = call.getString("url");
        final String esperado = call.getString("sha256");
        if (url == null || esperado == null || esperado.length() != 64 || !URL_OK.matcher(url).matches()) { call.reject("pedido"); return; }
        new Thread(new Runnable() {
            @Override
            public void run() {
                File dir = new File(getContext().getCacheDir(), "gestmz-update");
                File destino = new File(dir, "GestMZ-update.apk"), parcial = new File(dir, "GestMZ-update.apk.part");
                HttpURLConnection c = null;
                try {
                    if (!dir.exists() && !dir.mkdirs()) { call.reject("cache"); return; }
                    File[] velhos = dir.listFiles();
                    if (velhos != null) for (File v : velhos) v.delete();
                    String atual = url;
                    for (int salto = 0; ; salto++) {
                        if (salto > 6) { call.reject("redirecionamentos"); return; }
                        URL u = new URL(atual);
                        if (!"https".equals(u.getProtocol()) || !hostOk(u.getHost())) { call.reject("destino"); return; }
                        c = (HttpURLConnection) u.openConnection();
                        c.setInstanceFollowRedirects(false);
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(60000);
                        c.setRequestProperty("Accept", "application/octet-stream");
                        c.setRequestProperty("User-Agent", "GestMZ");
                        int cod = c.getResponseCode();
                        if (cod == 301 || cod == 302 || cod == 303 || cod == 307 || cod == 308) {
                            String loc = c.getHeaderField("Location");
                            c.disconnect();
                            if (loc == null) { call.reject("redirecionamento"); return; }
                            atual = new URL(u, loc).toString();
                            continue;
                        }
                        if (cod != 200) { call.reject("http-" + cod); return; }
                        break;
                    }
                    long total = c.getContentLengthLong();
                    long lido = 0, ultimo = 0;
                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                    try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(parcial)) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            md.update(buf, 0, n);
                            lido += n;
                            long agora = System.currentTimeMillis();
                            if (agora - ultimo > 250) {
                                ultimo = agora;
                                JSObject p = new JSObject();
                                p.put("bytes", lido);
                                p.put("total", total);
                                notifyListeners("progresso", p);
                            }
                        }
                    }
                    if (total > 0 && lido != total) { parcial.delete(); call.reject("incompleto"); return; }
                    if (!hex(md.digest()).equalsIgnoreCase(esperado)) { parcial.delete(); call.reject("sha256"); return; }
                    if (!parcial.renameTo(destino)) { parcial.delete(); call.reject("cache"); return; }
                    JSObject r = new JSObject();
                    r.put("caminho", destino.getAbsolutePath());
                    call.resolve(r);
                } catch (java.net.SocketTimeoutException e) {
                    parcial.delete();
                    call.reject("tempo");
                } catch (java.io.IOException e) {
                    parcial.delete();
                    String m = String.valueOf(e.getMessage());
                    call.reject(m.contains("ENOSPC") ? "espaco" : "rede");
                } catch (Exception e) {
                    parcial.delete();
                    call.reject("erro");
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }

    @PluginMethod
    public void instalar(PluginCall call) {
        try {
            String caminho = call.getString("caminho");
            String esperado = call.getString("sha256");
            if (caminho == null || esperado == null || esperado.length() != 64) { call.reject("pedido"); return; }
            if (caminho.startsWith("file://")) caminho = caminho.substring(7);
            File f = new File(caminho).getCanonicalFile();
            File cache = getContext().getCacheDir().getCanonicalFile();
            if (!f.getPath().startsWith(cache.getPath() + File.separator) || !f.getName().endsWith(".apk") || !f.isFile()) {
                call.reject("caminho");
                return;
            }
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            }
            if (!hex(md.digest()).equalsIgnoreCase(esperado)) {
                f.delete();
                call.reject("sha256");
                return;
            }
            PackageInfo pi = getContext().getPackageManager().getPackageArchiveInfo(f.getPath(), 0);
            if (pi == null || !getContext().getPackageName().equals(pi.packageName)) {
                f.delete();
                call.reject("pacote");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".gestmzprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("erro");
        }
    }
}

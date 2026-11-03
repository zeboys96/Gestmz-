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

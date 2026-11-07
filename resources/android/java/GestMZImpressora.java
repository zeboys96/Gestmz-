package mz.gestmz.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/* GestMZ — envia comandos ESC/POS para uma impressora térmica Bluetooth JÁ EMPARELHADA no Android (perfil série SPP).
   Só aceita impressoras da lista de emparelhadas do próprio Android; nunca emparelha nem procura aparelhos novos.
   Os dados são só os bytes do recibo gerados pela app. */
@CapacitorPlugin(
    name = "GestMZImpressora",
    permissions = { @Permission(alias = "bt", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class GestMZImpressora extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private boolean temPermissao() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private BluetoothAdapter adaptador() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    @PluginMethod
    public void emparelhadas(PluginCall call) {
        if (!temPermissao()) { requestPermissionForAlias("bt", call, "aposPermissao"); return; }
        listar(call);
    }

    @PluginMethod
    public void imprimir(PluginCall call) {
        if (!temPermissao()) { requestPermissionForAlias("bt", call, "aposPermissao"); return; }
        enviar(call);
    }

    @PermissionCallback
    private void aposPermissao(PluginCall call) {
        if (getPermissionState("bt") != PermissionState.GRANTED) { call.reject("Permissão de Bluetooth recusada. Autorize-a nas definições da app."); return; }
        if ("imprimir".equals(call.getMethodName())) enviar(call); else listar(call);
    }

    private void listar(PluginCall call) {
        try {
            BluetoothAdapter a = adaptador();
            if (a == null) { call.reject("Este aparelho não tem Bluetooth."); return; }
            if (!a.isEnabled()) { call.reject("O Bluetooth está desligado. Ligue-o e tente de novo."); return; }
            JSArray lista = new JSArray();
            Set<BluetoothDevice> ps = a.getBondedDevices();
            if (ps != null) for (BluetoothDevice d : ps) { JSObject o = new JSObject(); o.put("nome", d.getName() == null ? d.getAddress() : d.getName()); o.put("endereco", d.getAddress()); lista.put(o); }
            JSObject r = new JSObject(); r.put("dispositivos", lista); call.resolve(r);
        } catch (SecurityException e) { call.reject("Sem permissão de Bluetooth."); }
        catch (Exception e) { call.reject("Não foi possível listar as impressoras: " + e.getMessage()); }
    }

    private void enviar(final PluginCall call) {
        final String endereco = call.getString("endereco");
        final String dados = call.getString("dados");
        if (endereco == null || dados == null || dados.length() > 4000000) { call.reject("Pedido inválido."); return; }
        new Thread(new Runnable() { public void run() {
            BluetoothSocket s = null;
            try {
                BluetoothAdapter a = adaptador();
                if (a == null || !a.isEnabled()) { call.reject("O Bluetooth está desligado. Ligue-o e tente de novo."); return; }
                BluetoothDevice alvo = null;
                for (BluetoothDevice d : a.getBondedDevices()) if (d.getAddress().equalsIgnoreCase(endereco)) alvo = d;   // só emparelhadas
                if (alvo == null) { call.reject("A impressora não está emparelhada. Emparelhe-a nas definições de Bluetooth."); return; }
                byte[] bytes = Base64.decode(dados, Base64.DEFAULT);
                a.cancelDiscovery();
                s = alvo.createRfcommSocketToServiceRecord(SPP);
                s.connect();
                OutputStream o = s.getOutputStream();
                for (int i = 0; i < bytes.length; i += 512) { o.write(bytes, i, Math.min(512, bytes.length - i)); o.flush(); Thread.sleep(15); }
                Thread.sleep(400);   // deixa a impressora acabar o buffer antes de fechar
                call.resolve();
            } catch (SecurityException e) { call.reject("Sem permissão de Bluetooth.");
            } catch (java.io.IOException e) { call.reject("Não consegui ligar à impressora. Confirme que está ligada, perto e sem outra ligação.");
            } catch (Exception e) { call.reject("Falha ao imprimir: " + e.getMessage());
            } finally { try { if (s != null) s.close(); } catch (Exception e) { /* ok */ } }
        } }).start();
    }
}

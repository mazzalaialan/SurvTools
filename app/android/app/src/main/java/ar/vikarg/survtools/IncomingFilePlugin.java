package ar.vikarg.survtools;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Parcelable;
import android.provider.OpenableColumns;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Archivos que llegan desde afuera: «Abrir con VikArg» (ACTION_VIEW) y «Compartir» (ACTION_SEND) de un recorrido (.gpx, .kml, .kmz, .tcx) o de un
 * backup (.vikarg), desde el administrador de archivos, WhatsApp, el correo, etc.
 *
 * Android entrega un `content://` que la web no puede leer: acá se copia, de a pedazos, a la caché de la app (`incoming/`) y se le devuelve a la
 * web la ruta del archivo copiado (la web lo lee con `fetch` sobre `Capacitor.convertFileSrc`, sin pasar un backup de decenas de MB por base64).
 * Solo se guarda UN archivo pendiente; la web lo pide con `take()` al arrancar y cada vez que la app vuelve al frente. La copia se borra al pedir
 * el siguiente y al arrancar: un backup o un recorrido no tiene por qué quedar sin cifrar en la caché.
 */
@CapacitorPlugin(name = "IncomingFile")
public class IncomingFilePlugin extends Plugin {

    /** Tope de lo que se copia: un backup grande con fotos pesa decenas de MB. */
    private static final long MAX_BYTES = 512L * 1024 * 1024;

    private Uri pending = null;
    private String pendingMime = null;

    @Override
    public void load() {
        remember(getActivity().getIntent());
        clearCache();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        remember(intent);
    }

    private void remember(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            Parcelable p = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (p instanceof Uri) uri = (Uri) p;
        }
        if (uri == null) return;
        pending = uri;
        pendingMime = intent.getType();
        // Para que el mismo intent no se vuelva a procesar al girar la pantalla o volver a la app.
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        intent.removeExtra(Intent.EXTRA_STREAM);
    }

    private File dir() {
        return new File(getContext().getCacheDir(), "incoming");
    }

    private void clearCache() {
        File[] files = dir().listFiles();
        if (files == null) return;
        for (File f : files) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    private String nameOf(Uri uri) {
        String name = null;
        if (ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) {
            try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) {}
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null) name = "archivo";
        name = name.replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001f]", "_");
        return name.length() > 120 ? name.substring(name.length() - 120) : name;
    }

    /** Devuelve `{ path, name, mime }` del archivo pendiente (copiado a la caché) o `{}` si no hay ninguno. */
    @PluginMethod
    public void take(PluginCall call) {
        final Uri uri = pending;
        final String mime = pendingMime;
        pending = null;
        pendingMime = null;
        JSObject out = new JSObject();
        if (uri == null) {
            call.resolve(out);
            return;
        }
        // Se copia fuera del hilo principal: puede ser un archivo grande.
        new Thread(() -> {
            try {
                clearCache();
                File d = dir();
                if (!d.exists() && !d.mkdirs()) throw new Exception("sin caché");
                String name = nameOf(uri);
                File dest = new File(d, name);
                long total = 0;
                try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream os = new FileOutputStream(dest)) {
                    if (in == null) throw new Exception("no se pudo abrir");
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > MAX_BYTES) throw new Exception("archivo demasiado grande");
                        os.write(buf, 0, n);
                    }
                }
                out.put("path", dest.getAbsolutePath());
                out.put("name", name);
                out.put("mime", mime == null ? "" : mime);
                call.resolve(out);
            } catch (Exception e) {
                call.reject("No se pudo leer el archivo: " + e.getMessage());
            }
        }).start();
    }
}

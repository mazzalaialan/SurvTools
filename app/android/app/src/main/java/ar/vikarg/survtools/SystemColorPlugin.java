package ar.vikarg.survtools;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ajustes de la ventana de la app: el color del fondo detrás de las barras del sistema (`setBackground`) y ocultar la app en «recientes» y en las
 * capturas de pantalla (`setSecure`).
 *
 * Color del fondo detrás de las barras del sistema (la de estado y la de navegación). Capacitor acomoda la web entre las dos barras y lo que se
 * ve en esas franjas es el fondo de la ventana de Android, que por defecto es un gris que no combina con el tema de la app (y en «Rojo nocturno»
 * deslumbra). La app lo pone del color de su cabecera cada vez que cambia el tema (ver src/core/systemBars.ts).
 *
 * Android 14 o menos: el color de las barras sale de sus propios atributos (`statusBarColor` y `navigationBarColor`). Android 15 o más: las
 * barras son transparentes y se ve el fondo de la ventana. Se fijan los dos, así anda en las dos. Todo esto es de LA VENTANA de VikArg: al
 * minimizar o cerrar la app mandan las barras de la pantalla de inicio o de la otra app, y no queda nada cambiado en el sistema.
 */
@CapacitorPlugin(name = "SystemColor")
public class SystemColorPlugin extends Plugin {

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void setBackground(PluginCall call) {
        String hex = call.getString("color");
        final int color;
        try {
            color = Color.parseColor(hex);
        } catch (Exception e) {
            call.reject("Color inválido: " + hex);
            return;
        }
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.setBackgroundDrawable(new ColorDrawable(color));
            window.getDecorView().setBackgroundColor(color);
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);
            call.resolve();
        });
    }

    /** Oculta (o muestra) la app en «recientes» y bloquea las capturas de pantalla (FLAG_SECURE). Apagado por defecto: lo decide la persona en Ajustes. */
    @PluginMethod
    public void setSecure(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            if (enabled) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
            else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }
}

package ar.vikarg.survtools;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios de la app se registran antes de que arranque el puente de Capacitor.
        registerPlugin(SystemColorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

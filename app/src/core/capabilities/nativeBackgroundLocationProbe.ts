import { BackgroundGeolocation } from '@capgo/background-geolocation';

/**
 * ¿Tiene la app el permiso de ubicación «todo el tiempo» (también con la pantalla apagada o la app fuera de la vista)? La grabación nativa lo declara
 * (`ACCESS_BACKGROUND_LOCATION`) y el plugin lo pide al empezar una grabación. Se lee sin mostrar ningún diálogo. Con «solo mientras se usa la app»,
 * sin permiso o si no se puede leer, responde `false`: es mejor mostrarlo que ocultarlo.
 */
export async function backgroundLocationGranted(): Promise<boolean> {
  try {
    const s = await BackgroundGeolocation.checkPermissions();
    return s.location === 'granted' && (s.backgroundLocation === 'granted' || s.backgroundLocation === 'always');
  } catch {
    return false;
  }
}

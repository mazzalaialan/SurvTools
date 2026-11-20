import { BackgroundGeolocation } from '@capgo/background-geolocation';

/**
 * ¿Tiene la app el permiso de ubicación «todo el tiempo» (también con la pantalla apagada)? Lee el estado sin mostrar ningún diálogo.
 * Con «solo mientras se usa la app» o sin permiso responde `false`; si no se puede leer, también.
 */
export async function backgroundLocationGranted(): Promise<boolean> {
  try {
    const s = await BackgroundGeolocation.checkPermissions();
    return s.location === 'granted' && (s.backgroundLocation === 'granted' || s.backgroundLocation === 'always');
  } catch {
    return false;
  }
}

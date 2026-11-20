import { BackgroundGeolocation } from '@capgo/background-geolocation';

/**
 * ¿Puede la app grabar la ubicación con la pantalla apagada? La grabación nativa va con un servicio en primer plano de tipo ubicación (con su
 * notificación fija) y NO usa el permiso «todo el tiempo» de Android (`ACCESS_BACKGROUND_LOCATION` no está declarado en la app): alcanza con el
 * permiso de ubicación normal. Se lee sin mostrar ningún diálogo; si se lo negaron o no se puede leer, responde `false`.
 */
export async function backgroundLocationGranted(): Promise<boolean> {
  try {
    const s = await BackgroundGeolocation.checkPermissions();
    return s.location === 'granted';
  } catch {
    return false;
  }
}

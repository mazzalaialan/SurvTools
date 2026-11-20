import type { TFunction } from 'i18next';
import { isNativePlatform } from '@/core/platform';

/**
 * Mensaje de error del GPS en la plataforma que corresponde: sin permiso, en la app de Android hay que ir a los Ajustes del teléfono, y en el
 * navegador a los permisos del sitio. Un solo lugar para todas las pantallas, así dicen lo mismo.
 */
export function gpsErrorText(t: TFunction, code: string): string {
  return t(`gps.error.${code === 'denied' && isNativePlatform() ? 'deniedNative' : code}`);
}

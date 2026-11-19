/**
 * En qué plataforma corre la app: el navegador (web, instalada o no como PWA) o una app nativa de Android o iPhone hecha con Capacitor
 * (ver docs/PENDIENTES.md, «App nativa»). Se detecta en un solo lugar: Capacitor deja un objeto global `Capacitor` en el WebView; en el
 * navegador no existe. Todo lo que cambie entre web y nativa (notificaciones, cachés sin service worker…) pregunta acá.
 */
export type Platform = 'web' | 'android' | 'ios';

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

export function currentPlatform(root: { Capacitor?: CapacitorGlobal } = globalThis as { Capacitor?: CapacitorGlobal }): Platform {
  const cap = root.Capacitor;
  if (!cap?.isNativePlatform?.()) return 'web';
  const p = cap.getPlatform?.();
  return p === 'ios' ? 'ios' : 'android';
}

export const isNativePlatform = (): boolean => currentPlatform() !== 'web';

/** Solo la app de Android: lo que depende de un plugin propio en Java, de un APK o de cómo Android guarda los archivos (en iPhone no existe o es distinto). */
export const isAndroid = (): boolean => currentPlatform() === 'android';

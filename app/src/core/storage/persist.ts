import { isNativePlatform } from '@/core/platform';

let asked: Promise<boolean> | null = null;

/**
 * Pide al navegador que no borre los datos del sitio si el disco se llena (`navigator.storage.persist()`). Se llama antes de las descargas
 * grandes (libros, mapas, datos de un país): son caras de volver a bajar. Una sola vez por sesión. En la app nativa no se pide: el WebView de
 * Android siempre contesta que no (los datos ahí se protegen con la copia automática y el backup).
 */
export function requestPersistence(): Promise<boolean> {
  if (isNativePlatform() || typeof navigator === 'undefined' || !navigator.storage?.persist) return Promise.resolve(false);
  asked ??= navigator.storage
    .persisted()
    .then((already) => already || navigator.storage.persist())
    .catch(() => false);
  return asked;
}

/**
 * Rescate de la actualización de la web (PWA). Dos cosas, ambas solo del navegador (la app nativa no tiene service worker):
 *
 * - `staleRegistrations`: service workers de nombres de sitio viejos que siguen registrados en el teléfono (la app vivió en `/PrepperApp/` y hoy está
 *   en `/SurvTools/`: el archivo viejo da 404 y queda un worker muerto que comparte el canal del aviso de actualización y la memoria del navegador).
 * - `forceWebUpdate`: el camino de último recurso cuando el aviso de «Descargar ahora» no arranca: da de baja los service workers de la app y borra la
 *   copia de la app guardada (SOLO el precaché de la app: nunca los datos de países, mapas, libros ni la bóveda) y recarga; al volver a abrir con
 *   conexión se instala la versión publicada completa.
 */

/** Nombres de ruta que la app tuvo antes y ya no usa. */
const LEGACY_PATHS = ['/PrepperApp/'];

interface RegistrationLike {
  scope: string;
  unregister: () => Promise<boolean>;
}

/** Los registros de service worker que quedaron de un nombre de sitio viejo (mismo origen que `currentScope`). */
export function staleRegistrations<T extends RegistrationLike>(registrations: readonly T[], currentScope: string): T[] {
  const current = new URL(currentScope);
  return registrations.filter((r) => {
    const scope = new URL(r.scope);
    return scope.origin === current.origin && scope.pathname !== current.pathname && LEGACY_PATHS.includes(scope.pathname);
  });
}

/** Da de baja los service workers de nombres viejos. Devuelve cuántos. Falla en silencio. */
export async function removeStaleRegistrations(currentScope: string): Promise<number> {
  try {
    const stale = staleRegistrations(await navigator.serviceWorker.getRegistrations(), currentScope);
    await Promise.all(stale.map((r) => r.unregister().catch(() => false)));
    return stale.length;
  } catch {
    return 0;
  }
}

/** Los cachés que son SOLO de la app (su copia sin conexión): el precaché de Workbox. Los datos (`vikarg-*`) no se tocan. */
export const isAppShellCache = (name: string): boolean => name.startsWith('workbox-precache') || name.startsWith('sw-precache');

/** Forzar la actualización: da de baja los service workers, borra la copia de la app guardada y recarga. Necesita conexión para volver a bajarla. */
export async function forceWebUpdate(reload: () => void = () => window.location.reload()): Promise<void> {
  const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  const names = await caches.keys().catch(() => [] as string[]);
  await Promise.all(names.filter(isAppShellCache).map((n) => caches.delete(n).catch(() => false)));
  reload();
}

import { useSettings, type Country } from '@/core/settings/settings';
import { countryPackState, type PackState } from '@/modules/emergency/countryDownload';
import { bookUrl, BOOKS_CACHE } from '@/modules/library/books';
import { useLibrary } from '@/modules/library/store';
import { zoneKeys, useMapZones } from '@/modules/maps/store';
import { MAP_CACHE } from '@/modules/maps/tiles';
import { checkBook, checkZone, type DownloadCheck, type Has } from './verifyDownloads';

export interface VerifyReport {
  checks: DownloadCheck[];
  books: number;
  zones: number;
  /**
   * El paquete del país elegido (el que se usa sin conexión). Los demás países no se revisan acá: el selector de país de Ajustes ya muestra el
   * estado de cada uno (✓ al día, ↻ hay una versión nueva, ⬇ falta) mirando todos sus archivos.
   */
  country: { code: Country; state: PackState; files: number; bytes: number };
}

/** La pregunta real al dispositivo: ¿está ese archivo en la Cache API? */
export const cacheHas: Has = async (cacheName, url) => {
  if (!('caches' in globalThis)) return false;
  try {
    return !!(await (await caches.open(cacheName)).match(url));
  } catch {
    return false;
  }
};

/** Revisa todos los libros y zonas de mapas que figuran como bajados. */
export async function verifyAllDownloads(has: Has = cacheHas): Promise<VerifyReport> {
  const library = useLibrary.getState();
  if (!library.ready) await library.load();
  const zonesStore = useMapZones.getState();
  if (!zonesStore.loaded) await zonesStore.load();
  const books = [...useLibrary.getState().installed.values()];
  const zones = useMapZones.getState().zones;
  const checks: DownloadCheck[] = [];
  for (const b of books) checks.push(await checkBook(b, BOOKS_CACHE, (f) => bookUrl(b.id, f), has));
  for (const z of zones) checks.push(await checkZone(z, zoneKeys(z), MAP_CACHE, has));
  const code = useSettings.getState().settings.country;
  const pack = await countryPackState(code, true).catch(() => ({ state: 'ready' as PackState, files: [] as string[], bytes: 0 }));
  return { checks, books: books.length, zones: zones.length, country: { code, state: pack.state, files: pack.files.length, bytes: pack.bytes } };
}

import { bookUrl, BOOKS_CACHE } from '@/modules/library/books';
import { useLibrary } from '@/modules/library/store';
import { zoneKeys, useMapZones } from '@/modules/maps/store';
import { MAP_CACHE } from '@/modules/maps/tiles';
import { checkBook, checkZone, type DownloadCheck, type Has } from './verifyDownloads';

export interface VerifyReport {
  checks: DownloadCheck[];
  books: number;
  zones: number;
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
  return { checks, books: books.length, zones: zones.length };
}

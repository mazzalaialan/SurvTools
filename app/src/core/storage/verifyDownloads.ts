import type { InstalledBook } from '@/modules/library/books';
import type { MapZone } from '@/modules/maps/store';

/**
 * «Verificar descargas»: comprueba que lo que la app dice tener bajado (libros y zonas de mapas) esté de verdad en el dispositivo. Los archivos
 * viven en la Cache API del WebView; si el sistema los borra o algo se corta, la app seguiría mostrándolos como bajados y fallarían en el campo,
 * sin conexión. Lógica pura: quien llama pasa cómo preguntar si un archivo está (`Has`) y las listas.
 */
export type DownloadStatus = 'ok' | 'partial' | 'missing';

export interface DownloadCheck {
  kind: 'book' | 'zone';
  id: string;
  name: string;
  status: DownloadStatus;
  /** Archivos revisados que están. */
  present: number;
  /** Archivos revisados. */
  total: number;
}

export type Has = (cacheName: string, url: string) => Promise<boolean>;

/** Posiciones repartidas parejo de 0 a `n - 1` (incluye la primera y la última): una muestra de `count` elementos de una lista larga. */
export function sampleIndexes(n: number, count: number): number[] {
  if (n <= 0) return [];
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  return [...new Set(Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1))))];
}

/** Una zona tolera hasta 1 de cada 5 teselas de la muestra ausentes: al bajarla pueden haber fallado algunas (`zone.failed`). */
const ZONE_OK_RATIO = 0.8;

function statusOf(present: number, total: number, okRatio: number): DownloadStatus {
  if (total === 0) return 'ok';
  if (present === 0) return 'missing';
  return present / total >= okRatio ? 'ok' : 'partial';
}

/** Un libro: están todos sus capítulos (un capítulo menos ya es un libro roto). */
export async function checkBook(book: InstalledBook, cacheName: string, urlOf: (file: string) => string, has: Has): Promise<DownloadCheck> {
  const files = book.chapters.length ? book.chapters.map((c) => c.file) : ['index.html'];
  let present = 0;
  for (const f of files) if (await has(cacheName, urlOf(f))) present++;
  return { kind: 'book', id: book.id, name: book.title, status: statusOf(present, files.length, 1), present, total: files.length };
}

/** Una zona: se revisa una muestra repartida de sus teselas (revisarlas todas son decenas de miles). */
export async function checkZone(zone: Pick<MapZone, 'id' | 'name'>, keys: string[], cacheName: string, has: Has, sample = 9): Promise<DownloadCheck> {
  const picked = sampleIndexes(keys.length, sample).map((i) => keys[i]!);
  let present = 0;
  for (const k of picked) if (await has(cacheName, k)) present++;
  return { kind: 'zone', id: zone.id, name: zone.name, status: statusOf(present, picked.length, ZONE_OK_RATIO), present, total: picked.length };
}

/** Lo que no está bien, primero lo que falta del todo. */
export function problemsOf(checks: DownloadCheck[]): DownloadCheck[] {
  return checks.filter((c) => c.status !== 'ok').sort((a, b) => Number(b.status === 'missing') - Number(a.status === 'missing'));
}

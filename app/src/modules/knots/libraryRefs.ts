import { resolveAssetPath } from '@/modules/library/bookAssets';
import { BOOKS_CACHE, bookText, bookUrl, type InstalledBook } from '@/modules/library/books';
import type { Knot } from './knots';

/**
 * Dónde aparece un nudo en los libros de la biblioteca que el usuario bajó
 * (ARQUITECTURA §10.2): se busca en el celular, sin conexión, por los nombres
 * del nudo y su número de Ashley. Las figuras salen de la copia del usuario;
 * la app no lleva imágenes de libros con derechos.
 */

export interface KnotRef {
  bookId: string;
  bookTitle: string;
  file: string;
  chapter: string;
  snippet: string;
  /** Lo que se encontró (para resaltarlo en el lector). */
  term: string;
  /** Figura cercana a la mención: ruta dentro del libro guardado (se muestra con `useBookImage`), si hay. */
  image: string | null;
}

export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Palabras sueltas que aparecen en cualquier texto de nudos: no sirven para ubicar uno. */
const GENERIC = new Set(['lazo', 'cotes', 'ocho', 'tensor', 'cadena', 'tope', 'nudo', 'cote', 'gaza', 'rizo', 'lona', 'muelle', 'stopper', 'noose', 'half hitch', 'overhand']);

/** Nombres para buscar: el principal sin lo que va entre paréntesis, en los dos idiomas, y los alias específicos. */
export function knotTerms(k: Knot): string[] {
  const names = [k.name.es, k.name.en].map((n) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim());
  const all = [...names, ...k.aliases].map((s) => fold(s).trim()).filter((s) => s.length >= 5 && !GENERIC.has(s));
  // Los más largos primero: "pescador doble" antes que "pescador".
  return [...new Set(all)].sort((a, b) => b.length - a.length);
}

/** ¿Es un libro de nudos? Los de Cabuyería, y los que lo dicen en el título. */
export function isKnotBook(b: InstalledBook): boolean {
  return b.categoryId === 'cabuyeria' || /\b(nud|knot|cabuy|cabull|cuerd|rope|amarre|marlin)/.test(fold(b.title));
}

const isLetter = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/** Primera aparición de algún término como palabra completa (no "prusiks" dentro de otra palabra). */
export function firstMatch(folded: string, terms: string[], abok?: number): { at: number; term: string } | null {
  let best: { at: number; term: string } | null = null;
  for (const term of terms) {
    let at = folded.indexOf(term);
    while (at >= 0 && (isLetter(folded[at - 1]) || isLetter(folded[at + term.length]))) at = folded.indexOf(term, at + 1);
    if (at >= 0 && (!best || at < best.at)) best = { at, term };
  }
  if (abok) {
    // "ABOK #1010", "ABoK 1010" o, en el libro de Ashley, el párrafo que empieza "1010. ".
    const m = new RegExp(`abok\\s*(?:no\\.?|#)?\\s*${abok}\\b|(?:^|\\n)\\s*${abok}\\.\\s`).exec(folded);
    if (m && (!best || m.index < best.at)) best = { at: m.index, term: m[0].trim() };
  }
  return best;
}

/** Texto de cada libro leído una vez por versión (si el libro se actualiza, cambia el sha256). */
const textCache = new Map<string, Promise<{ file: string; text: string; folded: string }[]>>();
function cachedText(b: InstalledBook) {
  const key = `${b.id}:${b.sha256}`;
  let hit = textCache.get(key);
  if (!hit) {
    hit = bookText(b.id).then((parts) => parts.map((p) => ({ ...p, folded: fold(p.text) })));
    textCache.set(key, hit);
  }
  return hit;
}

/** La figura más cercana después de la mención, en el capítulo guardado. */
async function nearbyImage(bookId: string, file: string, term: string): Promise<string | null> {
  const res = await caches.match(bookUrl(bookId, file), { cacheName: BOOKS_CACHE }).catch(() => undefined);
  if (!res) return null;
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const items = [...doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, figcaption, td, img')];
  const start = items.findIndex((el) => el.tagName !== 'IMG' && fold(el.textContent ?? '').includes(term));
  if (start < 0) return null;
  // Una figura poco después del texto (o justo antes, si el texto es su epígrafe).
  const near = [...items.slice(start + 1, start + 9), ...items.slice(Math.max(0, start - 2), start).reverse()];
  const img = near.find((el) => el.tagName === 'IMG' && el.getAttribute('src')) as HTMLImageElement | undefined;
  const src = img?.getAttribute('src');
  if (!src || /^(https?:|data:)/.test(src)) return null;
  return resolveAssetPath(file, src);
}

/** Referencias del nudo en los libros de nudos bajados: hasta `perBook` por libro y `max` en total. */
export async function findKnotRefs(knot: Knot, books: InstalledBook[], perBook = 2, max = 8): Promise<KnotRef[]> {
  const terms = knotTerms(knot);
  const out: KnotRef[] = [];
  for (const b of books.filter(isKnotBook)) {
    const parts = await cachedText(b);
    const found: (KnotRef & { score: number })[] = [];
    for (const part of parts) {
      const m = firstMatch(part.folded, terms, knot.abok);
      if (!m) continue;
      const chapter = b.chapters.find((c) => c.file === part.file)?.title ?? '';
      const from = Math.max(0, m.at - 70);
      found.push({
        bookId: b.id,
        bookTitle: b.title,
        file: part.file,
        chapter,
        snippet: `${from > 0 ? '…' : ''}${part.text.slice(from, m.at + m.term.length + 110).replace(/\s+/g, ' ').trim()}…`,
        term: m.term,
        image: null,
        // Mejor un capítulo que se llama como el nudo; después, el que lo nombra antes.
        score: (terms.some((t) => fold(chapter).includes(t)) ? 0 : 1e6) + m.at,
      });
    }
    found.sort((a, b2) => a.score - b2.score);
    for (const r of found.slice(0, perBook)) {
      out.push({ bookId: r.bookId, bookTitle: r.bookTitle, file: r.file, chapter: r.chapter, snippet: r.snippet, term: r.term, image: await nearbyImage(b.id, r.file, r.term) });
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

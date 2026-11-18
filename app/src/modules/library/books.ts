import { requestPersistence } from '@/core/storage/persist';
import { strFromU8, unzipSync } from 'fflate';

/**
 * Biblioteca (ARQUITECTURA §11): el catálogo del servidor propio y los libros
 * bajados al dispositivo. Los libros con derechos llegan cifrados
 * (PBKDF2-SHA256 + AES-256-GCM con la clave de la biblioteca) y se descifran
 * acá; los libres, como ZIP común. Cada libro se guarda descomprimido en
 * Cache Storage y el service worker lo sirve sin conexión (sw.ts).
 */

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  lang: 'es' | 'en' | string;
  section: string | null;
  license: 'public' | 'private';
  licenseReason: string;
  encrypted: boolean;
  pages: number;
  chapters: number;
  bytes: number;
  sha256: string;
}

export interface LibraryCategory {
  id: string;
  name: string;
  books: LibraryBook[];
}

export interface LibraryCatalog {
  generatedAt: string;
  categories: LibraryCategory[];
  /** El servidor tiene clave configurada: se pueden bajar los con derechos. */
  privateAvailable: boolean;
  encryption?: { kdf: string; iterations: number; salt: string; cipher: string; check: string };
}

export const BOOKS_CACHE = 'vikarg-library-books';
const META_CACHE = 'vikarg-library';
const CATALOG_KEY = 'catalog.json';

/** Dónde queda cada archivo de un libro bajado (lo sirve el service worker). */
export const bookUrl = (id: string, file = 'index.html') => `${import.meta.env.BASE_URL}library/books/${id}/${file}`;

export class LibraryError extends Error {
  constructor(public readonly code: 'offline' | 'no-library' | 'bad-key' | 'key-required' | 'too-many-tries' | 'download' | 'corrupt' | 'no-storage' | 'cancelled') {
    super(code);
  }
}

const base = (serverUrl: string) => serverUrl.replace(/\/+$/, '');

/** El catálogo: del servidor si hay conexión (y se guarda); si no, el último guardado. */
export async function loadCatalog(serverUrl: string): Promise<{ catalog: LibraryCatalog; offline: boolean } | null> {
  const cache = 'caches' in globalThis ? await caches.open(META_CACHE) : null;
  if (serverUrl && navigator.onLine) {
    try {
      const res = await fetch(`${base(serverUrl)}/api/library`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        const catalog = (await res.clone().json()) as LibraryCatalog;
        await cache?.put(CATALOG_KEY, res);
        return { catalog, offline: false };
      }
    } catch {
      // Sin respuesta: lo guardado.
    }
  }
  const stored = await cache?.match(CATALOG_KEY);
  return stored ? { catalog: (await stored.json()) as LibraryCatalog, offline: true } : null;
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Clave de descifrado a partir de la clave de la biblioteca (tarda un poco: 600.000 iteraciones). */
export async function deriveLibraryKey(passphrase: string, enc: NonNullable<LibraryCatalog['encryption']>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

const MAGIC = new TextEncoder().encode('VKLB1');

/** Descifra un archivo "VKLB1" + IV + texto cifrado. Lanza `bad-key` si la clave no corresponde. */
export async function openSealed(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array> {
  if (blob.length < 33 || MAGIC.some((b, i) => blob[i] !== b)) throw new LibraryError('corrupt');
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(5, 17) }, key, blob.slice(17)));
  } catch {
    throw new LibraryError('bad-key');
  }
}

/** Comprueba la clave con la prueba del catálogo, sin conexión y sin bajar nada. */
export async function checkKey(key: CryptoKey, catalog: LibraryCatalog): Promise<boolean> {
  if (!catalog.encryption) return false;
  try {
    return strFromU8(await openSealed(key, b64(catalog.encryption.check))) === 'VikArg biblioteca';
  } catch {
    return false;
  }
}

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', webp: 'image/webp', json: 'application/json', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg' };

async function sha256Hex(data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface InstalledBook {
  id: string;
  sha256: string;
  title: string;
  categoryId: string;
  license: 'public' | 'private';
  bytes: number;
  installedAt: string;
  /** Capítulos (archivos) en orden, con su título. */
  chapters: { title: string; file: string }[];
}

/** Baja, verifica, descifra y guarda un libro. `passphrase` solo para los con derechos. */
export async function installBook(
  serverUrl: string,
  book: LibraryBook,
  categoryId: string,
  opts: { key?: CryptoKey; passphrase?: string; onProgress?: (done: number, total: number) => void; signal?: AbortSignal },
): Promise<InstalledBook> {
  if (!navigator.onLine) throw new LibraryError('offline');
  if (!('caches' in globalThis)) throw new LibraryError('no-storage');
  // Que el navegador no borre el libro si se queda sin espacio.
  void requestPersistence();
  const headers: Record<string, string> = {};
  if (book.license !== 'public') {
    if (!opts.key || !opts.passphrase) throw new LibraryError('key-required');
    headers['x-library-key'] = opts.passphrase;
  }
  let res: Response;
  try {
    res = await fetch(`${base(serverUrl)}/api/library/books/${encodeURIComponent(book.id)}`, { headers, signal: opts.signal });
  } catch {
    throw new LibraryError(opts.signal?.aborted ? 'cancelled' : 'download');
  }
  if (res.status === 403) throw new LibraryError('bad-key');
  if (res.status === 429) throw new LibraryError('too-many-tries');
  if (!res.ok || !res.body) throw new LibraryError('download');
  // Con progreso.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      opts.onProgress?.(got, book.bytes);
    }
  } catch {
    throw new LibraryError(opts.signal?.aborted ? 'cancelled' : 'download');
  }
  // Cancelada justo al terminar de bajar: no se guarda.
  if (opts.signal?.aborted) throw new LibraryError('cancelled');
  const raw = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) {
    raw.set(c, off);
    off += c.length;
  }
  if ((await sha256Hex(raw)) !== book.sha256) throw new LibraryError('corrupt');
  const zip = book.encrypted ? await openSealed(opts.key!, raw) : raw;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new LibraryError('corrupt');
  }
  const cache = await caches.open(BOOKS_CACHE);
  await removeBookFiles(book.id);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const ext = name.split('.').pop()!.toLowerCase();
    await cache.put(bookUrl(book.id, name), new Response(data as Uint8Array<ArrayBuffer>, { headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream' } }));
  }
  const meta = files['book.json'] ? (JSON.parse(strFromU8(files['book.json'])) as { chapters?: { title: string; file: string }[] }) : {};
  return {
    id: book.id,
    sha256: book.sha256,
    title: book.title,
    categoryId,
    license: book.license,
    bytes: Object.values(files).reduce((s, f) => s + f.length, 0),
    installedAt: new Date().toISOString(),
    chapters: meta.chapters?.length ? meta.chapters : [{ title: book.title, file: 'index.html' }],
  };
}

export async function removeBookFiles(id: string): Promise<void> {
  if (!('caches' in globalThis)) return;
  const cache = await caches.open(BOOKS_CACHE);
  const prefix = new URL(bookUrl(id, ''), location.href).href;
  for (const req of await cache.keys()) if (req.url.startsWith(prefix)) await cache.delete(req);
}

/** Texto del libro (para buscar), separado por capítulo. */
export async function bookText(id: string): Promise<{ file: string; text: string }[]> {
  const res = await caches.match(bookUrl(id, 'text.txt'), { cacheName: BOOKS_CACHE });
  if (!res) return [];
  return (await res.text())
    .split('\f')
    .filter(Boolean)
    .map((part) => {
      const nl = part.indexOf('\n');
      return { file: part.slice(0, nl).trim(), text: part.slice(nl + 1) };
    });
}

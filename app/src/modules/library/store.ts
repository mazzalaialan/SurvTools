import { strFromU8, strToU8 } from 'fflate';
import { create } from 'zustand';
import { blobStore } from '@/core/db/repository';
import { isUnlocked, onSessionChange } from '@/core/security/session';
import { checkKey, deriveLibraryKey, installBook, LibraryError, loadCatalog, removeBookFiles, type InstalledBook, type LibraryBook, type LibraryCatalog } from './books';

const INDEX_ID = 'library-index';
const KEY_ID = 'library-key';

export interface DownloadProgress {
  /** Libro que se está bajando. */
  title: string;
  n: number;
  total: number;
  bytes: number;
  bookBytes: number;
}

interface LibraryState {
  catalog: LibraryCatalog | null;
  /** Ya se leyó qué libros hay en el dispositivo. */
  ready: boolean;
  offline: boolean;
  loading: boolean;
  installed: Map<string, InstalledBook>;
  selected: Set<string>;
  /** Clave de descifrado en memoria (se borra al bloquear). */
  key: CryptoKey | null;
  passphrase: string | null;
  progress: DownloadProgress | null;
  /** Errores por libro de la última descarga. */
  failures: Map<string, LibraryError['code']>;
  /** Por qué se cortó la última descarga antes de terminar. */
  stopped: 'cancelled' | 'cellular' | null;
  load: () => Promise<void>;
  clear: () => void;
  refresh: (serverUrl: string) => Promise<void>;
  toggle: (id: string) => void;
  setSelected: (ids: string[], on: boolean) => void;
  /** Comprueba la clave con el catálogo y, si se pide, la guarda cifrada en la bóveda. */
  unlockPrivate: (passphrase: string, remember: boolean) => Promise<boolean>;
  forgetKey: () => Promise<void>;
  download: (serverUrl: string) => Promise<void>;
  /** Vuelve a bajar un libro que figura como bajado pero le faltan archivos: trae el catálogo, lo baja y devuelve por qué falló (o `null`). */
  redownload: (serverUrl: string, id: string) => Promise<LibraryError['code'] | null>;
  /** Corta la descarga en curso: lo ya bajado queda; lo que falta sigue seleccionado para después. */
  cancelDownload: (reason?: 'cancelled' | 'cellular') => void;
  remove: (id: string) => Promise<void>;
  /** Borra varios libros del dispositivo (el índice se guarda una sola vez). */
  removeMany: (ids: string[]) => Promise<void>;
}

/** Descarga en curso (para cancelarla). */
let current: AbortController | null = null;
let stopReason: 'cancelled' | 'cellular' | null = null;

/** Conexión del dispositivo (Network Information API: Chrome para Android la tiene; Safari y Firefox no). */
type Connection = EventTarget & { type?: string };
const connection = () => (navigator as Navigator & { connection?: Connection }).connection;

async function saveIndex(installed: Map<string, InstalledBook>) {
  await blobStore.put(INDEX_ID, strToU8(JSON.stringify([...installed.values()])) as Uint8Array<ArrayBuffer>);
}

/** Libros del catálogo por id (con su categoría). */
export function catalogBooks(c: LibraryCatalog | null): Map<string, { book: LibraryBook; categoryId: string }> {
  return new Map((c?.categories ?? []).flatMap((cat) => cat.books.map((b) => [b.id, { book: b, categoryId: cat.id }] as const)));
}

/** Biblioteca: catálogo del servidor, libros bajados (índice cifrado en la bóveda) y descargas. */
export const useLibrary = create<LibraryState>((set, get) => ({
  catalog: null,
  ready: false,
  offline: false,
  loading: false,
  installed: new Map(),
  selected: new Set(),
  key: null,
  passphrase: null,
  progress: null,
  stopped: null,
  failures: new Map(),

  async load() {
    const idx = await blobStore.get(INDEX_ID);
    const list = idx ? (JSON.parse(strFromU8(idx)) as InstalledBook[]) : [];
    set({ installed: new Map(list.map((b) => [b.id, b])), ready: true });
    const saved = await blobStore.get(KEY_ID);
    if (saved) set({ passphrase: strFromU8(saved) });
  },

  clear() {
    set({ ready: false, installed: new Map(), selected: new Set(), key: null, passphrase: null, progress: null, failures: new Map(), stopped: null });
  },

  async refresh(serverUrl) {
    set({ loading: true });
    try {
      const r = await loadCatalog(serverUrl);
      set({ catalog: r?.catalog ?? null, offline: r?.offline ?? true });
      // Clave recordada: se deriva cuando ya está el catálogo (la sal viene con él).
      const { passphrase, key } = get();
      if (r?.catalog.encryption && passphrase && !key) {
        const k = await deriveLibraryKey(passphrase, r.catalog.encryption);
        if (await checkKey(k, r.catalog)) set({ key: k });
      }
    } finally {
      set({ loading: false });
    }
  },

  toggle(id) {
    const selected = new Set(get().selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    set({ selected });
  },

  setSelected(ids, on) {
    const selected = new Set(get().selected);
    for (const id of ids) {
      if (on) selected.add(id);
      else selected.delete(id);
    }
    set({ selected });
  },

  async unlockPrivate(passphrase, remember) {
    const catalog = get().catalog;
    if (!catalog?.encryption) return false;
    const key = await deriveLibraryKey(passphrase, catalog.encryption);
    if (!(await checkKey(key, catalog))) return false;
    set({ key, passphrase });
    if (remember) await blobStore.put(KEY_ID, strToU8(passphrase) as Uint8Array<ArrayBuffer>);
    return true;
  },

  async forgetKey() {
    await blobStore.remove(KEY_ID);
    set({ key: null, passphrase: null });
  },

  async download(serverUrl) {
    const books = catalogBooks(get().catalog);
    const ids = [...get().selected].filter((id) => books.has(id));
    const failures = new Map<string, LibraryError['code']>();
    void navigator.storage?.persist?.();
    const ctrl = new AbortController();
    current = ctrl;
    stopReason = null;
    set({ stopped: null });
    // Si empezó con Wi-Fi (o cable) y el celular pasa a datos móviles, se pausa sola para no gastar el plan.
    const conn = connection();
    const startedOnCellular = conn?.type === 'cellular';
    const onChange = () => {
      if (!startedOnCellular && conn?.type === 'cellular') get().cancelDownload('cellular');
    };
    conn?.addEventListener('change', onChange);
    // Dos a la vez: un bloque grande baja más rápido sin saturar el celular.
    let next = 0;
    let done = 0;
    let stop = false;
    const totalBytes = ids.reduce((s, id) => s + books.get(id)!.book.bytes, 0);
    const got = new Map<string, number>();
    const report = (title: string) =>
      set({ progress: { title, n: Math.min(done + 1, ids.length), total: ids.length, bytes: [...got.values()].reduce((a, b) => a + b, 0), bookBytes: totalBytes } });
    async function worker() {
      while (!stop && !ctrl.signal.aborted && next < ids.length) {
        const id = ids[next++]!;
        const { book, categoryId } = books.get(id)!;
        report(book.title);
        try {
          const inst = await installBook(serverUrl, book, categoryId, {
            key: get().key ?? undefined,
            passphrase: get().passphrase ?? undefined,
            signal: ctrl.signal,
            onProgress: (bytes) => {
              got.set(id, bytes);
              report(book.title);
            },
          });
          const installed = new Map(get().installed).set(id, inst);
          set({ installed });
          await saveIndex(installed);
          const selected = new Set(get().selected);
          selected.delete(id);
          set({ selected });
        } catch (e) {
          if (ctrl.signal.aborted) break; // cancelada: no es un error del libro
          failures.set(id, e instanceof LibraryError ? e.code : 'download');
          // Sin conexión o clave mal: no tiene sentido seguir con los demás.
          if (e instanceof LibraryError && (e.code === 'offline' || e.code === 'too-many-tries')) stop = true;
        }
        done++;
        got.set(id, book.bytes);
      }
    }
    await Promise.all([worker(), worker()]);
    conn?.removeEventListener('change', onChange);
    if (current === ctrl) current = null;
    set({ progress: null, failures, stopped: ctrl.signal.aborted ? stopReason : null });
  },

  async redownload(serverUrl, id) {
    await get().refresh(serverUrl);
    if (!catalogBooks(get().catalog).has(id)) return get().offline ? 'offline' : 'download';
    // Se baja solo este libro; lo que el usuario tenía elegido en la biblioteca se respeta.
    const before = get().selected;
    set({ selected: new Set([id]) });
    try {
      await get().download(serverUrl);
    } finally {
      const after = new Set(before);
      after.delete(id);
      set({ selected: after });
    }
    return get().failures.get(id) ?? null;
  },

  cancelDownload(reason = 'cancelled') {
    if (!current || current.signal.aborted) return;
    stopReason = reason;
    current.abort();
  },

  async remove(id) {
    await get().removeMany([id]);
  },

  async removeMany(ids) {
    const installed = new Map(get().installed);
    for (const id of ids) {
      await removeBookFiles(id);
      installed.delete(id);
    }
    set({ installed });
    await saveIndex(installed);
  },
}));

onSessionChange(() => {
  if (isUnlocked()) void useLibrary.getState().load();
  else useLibrary.getState().clear();
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledBook, LibraryBook, LibraryCatalog } from './books';

const mocks = vi.hoisted(() => ({
  loadCatalog: vi.fn(),
  removeBookFiles: vi.fn(async () => undefined),
  put: vi.fn(async (_id: string, _data: Uint8Array) => undefined),
}));

vi.mock('./books', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./books')>()),
  loadCatalog: mocks.loadCatalog,
  removeBookFiles: mocks.removeBookFiles,
}));
vi.mock('@/core/db/repository', () => ({
  blobStore: { get: vi.fn(async () => undefined), put: mocks.put, remove: vi.fn(async () => undefined) },
}));
vi.mock('@/core/security/session', () => ({ isUnlocked: () => false, onSessionChange: () => () => undefined }));

import { useLibrary } from './store';

const book = (id: string): LibraryBook => ({
  id,
  title: id,
  author: '',
  lang: 'es',
  section: null,
  license: 'private',
  licenseReason: '',
  encrypted: true,
  pages: 10,
  chapters: 1,
  bytes: 100,
  sha256: 'x',
});

const catalog = (ids: string[]): LibraryCatalog => ({
  generatedAt: '2026-11-23',
  privateAvailable: true,
  categories: [{ id: 'cat', name: 'Categoría', books: ids.map(book) }],
});

const installedBook = (id: string): InstalledBook => ({
  id,
  sha256: 'x',
  title: id,
  categoryId: 'cat',
  license: 'private',
  bytes: 100,
  installedAt: '2026-11-01',
  chapters: [{ title: 'Uno', file: 'index.html' }],
});

function install(ids: string[]) {
  useLibrary.setState({ installed: new Map(ids.map((id) => [id, installedBook(id)])) });
}

describe('biblioteca: limpieza de libros bajados cuyo id ya no está en el catálogo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibrary.setState({ catalog: null, installed: new Map(), offline: false });
  });

  it('con el catálogo en línea borra los libros huérfanos (id renombrado) y conserva los vigentes', async () => {
    install(['viejo-id', 'sigue-igual']);
    mocks.loadCatalog.mockResolvedValue({ catalog: catalog(['sigue-igual', 'nuevo-id']), offline: false });

    await useLibrary.getState().refresh('https://servidor.test');

    expect([...useLibrary.getState().installed.keys()]).toEqual(['sigue-igual']);
    expect(mocks.removeBookFiles).toHaveBeenCalledTimes(1);
    expect(mocks.removeBookFiles).toHaveBeenCalledWith('viejo-id');
    // el índice guardado ya no incluye al huérfano
    expect(mocks.put).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(new TextDecoder().decode(mocks.put.mock.calls[0]![1])) as InstalledBook[];
    expect(saved.map((b) => b.id)).toEqual(['sigue-igual']);
  });

  it('no borra nada con el catálogo guardado (sin conexión)', async () => {
    install(['viejo-id']);
    mocks.loadCatalog.mockResolvedValue({ catalog: catalog(['nuevo-id']), offline: true });

    await useLibrary.getState().refresh('https://servidor.test');

    expect(useLibrary.getState().installed.has('viejo-id')).toBe(true);
    expect(mocks.removeBookFiles).not.toHaveBeenCalled();
  });

  it('no borra nada si el catálogo en línea viene vacío', async () => {
    install(['viejo-id']);
    mocks.loadCatalog.mockResolvedValue({ catalog: catalog([]), offline: false });

    await useLibrary.getState().refresh('https://servidor.test');

    expect(useLibrary.getState().installed.has('viejo-id')).toBe(true);
    expect(mocks.removeBookFiles).not.toHaveBeenCalled();
  });

  it('si el servidor no responde (sin catálogo) tampoco borra', async () => {
    install(['viejo-id']);
    mocks.loadCatalog.mockResolvedValue(null);

    await useLibrary.getState().refresh('https://servidor.test');

    expect(useLibrary.getState().installed.has('viejo-id')).toBe(true);
    expect(mocks.removeBookFiles).not.toHaveBeenCalled();
  });

  it('si todos los libros bajados siguen en el catálogo no toca nada', async () => {
    install(['a', 'b']);
    mocks.loadCatalog.mockResolvedValue({ catalog: catalog(['a', 'b', 'c']), offline: false });

    await useLibrary.getState().refresh('https://servidor.test');

    expect(useLibrary.getState().installed.size).toBe(2);
    expect(mocks.removeBookFiles).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
});

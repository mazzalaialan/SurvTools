import { describe, expect, it } from 'vitest';
import type { InstalledBook } from '@/modules/library/books';
import { checkBook, checkZone, problemsOf, sampleIndexes, type Has } from './verifyDownloads';

const book = (chapters: string[]): InstalledBook => ({ id: 'b1', sha256: 'x', title: 'Manual', categoryId: 'c', license: 'public', bytes: 1, installedAt: '2026-01-01', chapters: chapters.map((file) => ({ title: file, file })) });
const hasOnly = (present: Set<string>): Has => async (_cache, url) => present.has(url);

describe('verificar descargas', () => {
  it('una muestra repartida incluye la primera y la última posición', () => {
    expect(sampleIndexes(0, 9)).toEqual([]);
    expect(sampleIndexes(4, 9)).toEqual([0, 1, 2, 3]);
    const s = sampleIndexes(100_000, 9);
    expect(s).toHaveLength(9);
    expect(s[0]).toBe(0);
    expect(s.at(-1)).toBe(99_999);
    expect([...s].sort((a, b) => a - b)).toEqual(s);
  });

  it('libro completo, incompleto y ausente', async () => {
    const urlOf = (f: string) => `/b1/${f}`;
    const all = new Set(['/b1/cap-1.html', '/b1/cap-2.html', '/b1/cap-3.html']);
    expect(await checkBook(book(['cap-1.html', 'cap-2.html', 'cap-3.html']), 'libros', urlOf, hasOnly(all))).toMatchObject({ status: 'ok', present: 3, total: 3 });
    expect(await checkBook(book(['cap-1.html', 'cap-2.html', 'cap-3.html']), 'libros', urlOf, hasOnly(new Set(['/b1/cap-1.html', '/b1/cap-3.html'])))).toMatchObject({ status: 'partial', present: 2, total: 3 });
    expect(await checkBook(book(['cap-1.html', 'cap-2.html']), 'libros', urlOf, hasOnly(new Set()))).toMatchObject({ status: 'missing', present: 0, total: 2 });
  });

  it('un libro sin capítulos declarados se revisa por su índice', async () => {
    const r = await checkBook(book([]), 'libros', (f) => `/b1/${f}`, hasOnly(new Set(['/b1/index.html'])));
    expect(r).toMatchObject({ status: 'ok', total: 1 });
  });

  it('un solo capítulo que falta ya es un libro roto', async () => {
    const files = Array.from({ length: 20 }, (_, i) => `cap-${i}.html`);
    const present = new Set(files.slice(1).map((f) => `/b1/${f}`));
    expect((await checkBook(book(files), 'libros', (f) => `/b1/${f}`, hasOnly(present))).status).toBe('partial');
  });

  it('zona: tolera una tesela de la muestra ausente (pudo fallar al bajarla), no más', async () => {
    const keys = Array.from({ length: 5000 }, (_, i) => `/tiles/${i}`);
    const picked = sampleIndexes(keys.length, 9).map((i) => keys[i]!);
    const zone = { id: 'z', name: 'Bariloche' };
    expect((await checkZone(zone, keys, 'mapas', hasOnly(new Set(keys)))).status).toBe('ok');
    expect((await checkZone(zone, keys, 'mapas', hasOnly(new Set(picked.slice(1))))).status).toBe('ok');
    expect((await checkZone(zone, keys, 'mapas', hasOnly(new Set(picked.slice(3))))).status).toBe('partial');
    expect((await checkZone(zone, keys, 'mapas', hasOnly(new Set()))).status).toBe('missing');
  });

  it('una zona sin teselas que revisar no se marca como rota', async () => {
    expect((await checkZone({ id: 'z', name: 'Vacía' }, [], 'mapas', hasOnly(new Set()))).status).toBe('ok');
  });

  it('los problemas salen primero los que faltan del todo, y lo bueno no aparece', () => {
    const c = (id: string, status: 'ok' | 'partial' | 'missing') => ({ kind: 'book' as const, id, name: id, status, present: 0, total: 1 });
    expect(problemsOf([c('a', 'ok'), c('b', 'partial'), c('c', 'missing')]).map((x) => x.id)).toEqual(['c', 'b']);
    expect(problemsOf([c('a', 'ok')])).toEqual([]);
  });
});

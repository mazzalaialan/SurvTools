import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { convertFileSrc: (p: string) => `http://localhost/_f_${p}` }, registerPlugin: () => ({}) }));

const { classifyIncoming, checkIncoming, useIncoming } = await import('./incomingFile');
const enc = (s: string) => new TextEncoder().encode(s);

describe('classifyIncoming', () => {
  it('reconoce por la extensión', () => {
    expect(classifyIncoming('vikarg-backup-2026-11-18.vikarg', enc('x'))).toBe('backup');
    expect(classifyIncoming('Cerro.GPX', enc('x'))).toBe('track');
    expect(classifyIncoming('ruta.kmz', enc('x'))).toBe('track');
    expect(classifyIncoming('act.tcx.gz', enc('x'))).toBe('track');
  });
  it('si el nombre no ayuda, mira el contenido', () => {
    expect(classifyIncoming('archivo', enc('<?xml version="1.0"?><gpx version="1.1">'))).toBe('track');
    expect(classifyIncoming('archivo', new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('track');
    expect(classifyIncoming('archivo', new Uint8Array([0x1f, 0x8b, 8]))).toBe('track');
  });
  it('ignora lo que no es nada de eso', () => {
    expect(classifyIncoming('foto.jpg', new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(classifyIncoming('notas.txt', enc('hola'))).toBeNull();
  });
});

describe('checkIncoming', () => {
  it('sin archivo pendiente no hace nada', async () => {
    useIncoming.setState({ file: null });
    expect(await checkIncoming({ take: async () => ({}) })).toBeNull();
    expect(useIncoming.getState().file).toBeNull();
  });
  it('lee el archivo copiado y lo deja pendiente', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe('http://localhost/_f_/cache/incoming/a.vikarg');
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    }));
    const f = await checkIncoming({ take: async () => ({ path: '/cache/incoming/a.vikarg', name: 'a.vikarg' }) });
    expect(f?.kind).toBe('backup');
    expect(useIncoming.getState().file?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    useIncoming.getState().clear();
    expect(useIncoming.getState().file).toBeNull();
  });
  it('ignora un archivo que no es de VikArg', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => enc('hola').buffer })));
    expect(await checkIncoming({ take: async () => ({ path: '/x', name: 'notas.txt' }) })).toBeNull();
    expect(useIncoming.getState().file).toBeNull();
  });
});

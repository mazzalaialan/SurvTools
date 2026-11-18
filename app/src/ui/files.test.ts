import { afterEach, describe, expect, it, vi } from 'vitest';

const native = { shareNative: vi.fn(async () => 'shared' as const), saveNative: vi.fn(async () => 'Documentos/VikArg/a.txt'), openNative: vi.fn(async () => undefined) };
vi.mock('./nativeFiles', () => native);
let isNative = false;
vi.mock('@/core/platform', () => ({ isNativePlatform: () => isNative }));

const { deliverFile, saveFile, openFile } = await import('./files');
const data = new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>;

afterEach(() => {
  isNative = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('entrega de archivos: navegador y app nativa', () => {
  it('en la app nativa, compartir, guardar y abrir van al manejo nativo', async () => {
    isNative = true;
    expect(await deliverFile(data, 'a.txt')).toBe('shared');
    expect(await saveFile(data, 'a.txt')).toEqual({ how: 'saved', where: 'Documentos/VikArg/a.txt' });
    expect(await openFile(data, 'a.pdf', 'application/pdf')).toBe('opened');
    expect(native.shareNative).toHaveBeenCalledWith(data, 'a.txt');
    expect(native.openNative).toHaveBeenCalledWith(data, 'a.pdf', 'application/pdf');
  });

  it('en el navegador no se toca el manejo nativo: se descarga con un enlace', async () => {
    const click = vi.fn();
    const link = { click, href: '', download: '' };
    vi.stubGlobal('document', { createElement: () => link });
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    expect(await deliverFile(data, 'a.txt')).toBe('downloaded');
    expect(link.download).toBe('a.txt');
    expect(click).toHaveBeenCalled();
    expect(await saveFile(data, 'b.txt')).toEqual({ how: 'downloaded' });
    expect(native.shareNative).not.toHaveBeenCalled();
    expect(native.saveNative).not.toHaveBeenCalled();
  });

  it('en el navegador, si se bloquea la pestaña del PDF, se descarga y lo avisa', async () => {
    const link = { click: vi.fn(), href: '', download: '' };
    vi.stubGlobal('document', { createElement: () => link });
    vi.stubGlobal('window', { open: () => null });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    expect(await openFile(data, 'a.pdf', 'application/pdf')).toBe('blocked');
    expect(link.download).toBe('a.pdf');
    vi.stubGlobal('window', { open: () => ({}) });
    expect(await openFile(data, 'a.pdf', 'application/pdf')).toBe('opened');
  });
});

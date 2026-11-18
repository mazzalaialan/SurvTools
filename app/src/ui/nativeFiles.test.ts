import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = {
  writeFile: vi.fn(async (o: { path: string; data?: string }) => ({ uri: `file:///cache/${o.path}` })),
  appendFile: vi.fn(async (_o: { data?: string }) => undefined),
  rmdir: vi.fn(async () => undefined),
};
const share = { share: vi.fn(async () => ({ activityType: undefined })) };
const opener = { open: vi.fn(async () => undefined) };
vi.mock('@capacitor/filesystem', () => ({ Filesystem: fs, Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' } }));
vi.mock('@capacitor/share', () => ({ Share: share }));
vi.mock('@capacitor-community/file-opener', () => ({ FileOpener: opener }));

const { safeName, toBase64, isCancel, shareNative, saveNative, openNative, clearExports } = await import('./nativeFiles');

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);
const fromBase64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

beforeEach(() => vi.clearAllMocks());

describe('archivos en la app nativa', () => {
  it('base64 de cualquier byte, también de archivos grandes', () => {
    const b = bytes(100_000);
    expect(Buffer.from(fromBase64(toBase64(b))).equals(Buffer.from(b))).toBe(true);
    expect(toBase64(new Uint8Array(0))).toBe('');
  });

  it('el nombre del archivo no puede traer barras ni caracteres que Android rechaza', () => {
    expect(safeName('backup 2026/11/18: casa?.vikarg')).toBe('backup 2026_11_18_ casa_.vikarg');
    expect(safeName('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(safeName('...')).toBe('archivo');
    expect(safeName('')).toBe('archivo');
    expect(safeName('a'.repeat(300))).toHaveLength(120);
  });

  it('un archivo chico se escribe de una vez en la caché y se comparte con su dirección', async () => {
    expect(await shareNative(bytes(10), 'recorrido.gpx')).toBe('shared');
    expect(fs.rmdir).toHaveBeenCalledWith(expect.objectContaining({ path: 'exports', directory: 'CACHE', recursive: true }));
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'exports/recorrido.gpx', directory: 'CACHE', recursive: true }));
    expect(fs.appendFile).not.toHaveBeenCalled();
    expect(share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/exports/recorrido.gpx'], title: 'recorrido.gpx' }));
  });

  it('un archivo grande se escribe por tandas y vuelve a armarse idéntico', async () => {
    const big = bytes(4_000_000); // más de dos tandas de 1,5 MiB
    const written: string[] = [];
    fs.writeFile.mockImplementationOnce(async (o) => (written.push(o.data!), { uri: `file:///cache/${o.path}` }));
    fs.appendFile.mockImplementationOnce(async (o) => void written.push(o.data!)).mockImplementationOnce(async (o) => void written.push(o.data!));
    await shareNative(big, 'backup.vikarg');
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.appendFile).toHaveBeenCalledTimes(2);
    const joined = Buffer.concat(written.map((d) => Buffer.from(d, 'base64')));
    expect(joined.length).toBe(big.length);
    expect(joined.equals(Buffer.from(big))).toBe(true);
  });

  it('cerrar el menú de compartir sin elegir es un AbortError, no un error', async () => {
    share.share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(shareNative(bytes(3), 'x.txt')).rejects.toMatchObject({ name: 'AbortError' });
    expect(isCancel(new Error('Share canceled'))).toBe(true);
    expect(isCancel('cancelled by user')).toBe(true);
    share.share.mockRejectedValueOnce(new Error('sin app para compartir'));
    await expect(shareNative(bytes(3), 'x.txt')).rejects.toThrow('sin app');
  });

  it('guardar en el teléfono: queda en Documentos/VikArg y devuelve dónde', async () => {
    expect(await saveNative(bytes(10), 'mapa 1.pdf')).toBe('Documentos/VikArg/mapa 1.pdf');
    expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'VikArg/mapa 1.pdf', directory: 'DOCUMENTS', recursive: true }));
  });

  it('si no se puede guardar, el error llega a quien llama (la pantalla lo avisa)', async () => {
    fs.writeFile.mockRejectedValueOnce(new Error('sin permiso'));
    await expect(saveNative(bytes(3), 'a.txt')).rejects.toThrow('sin permiso');
  });

  it('abrir un PDF: se escribe en la caché y lo abre el visor del sistema con su tipo', async () => {
    await openNative(bytes(10), 'mapa.pdf', 'application/pdf');
    expect(opener.open).toHaveBeenCalledWith({ filePath: 'file:///cache/exports/mapa.pdf', contentType: 'application/pdf' });
  });

  it('limpiar lo exportado no falla aunque la carpeta no exista', async () => {
    fs.rmdir.mockRejectedValueOnce(new Error('no existe'));
    await expect(clearExports()).resolves.toBeUndefined();
  });
});

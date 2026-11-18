import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FileOpener } from '@capacitor-community/file-opener';

/**
 * Entrega de archivos en la app nativa (Capacitor). El WebView de Android no baja archivos con un enlace `download` ni abre pestañas con un
 * `blob:`, como hace el navegador: el archivo se escribe en el dispositivo con `@capacitor/filesystem` y se entrega con el menú Compartir
 * (`@capacitor/share`), el visor del sistema (`@capacitor-community/file-opener`) o se guarda en Documentos/VikArg.
 * Lo usa `files.ts` solo en la nativa (se carga recién ahí).
 */

/** Tanda de escritura: múltiplo de 3 para que cada una sea base64 completo. Un backup puede pesar decenas de MB: de a poco no se ahoga el puente. */
const CHUNK = 3 * 512 * 1024;
const EXPORTS = 'exports';

/** Nombre de archivo seguro (sin barras ni caracteres que Android no acepta). */
export const safeName = (name: string): string => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'archivo';

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** El usuario cerró el menú de compartir (no es un error). */
export const isCancel = (e: unknown): boolean => /cancel/i.test(e instanceof Error ? e.message : String(e));

async function write(path: string, bytes: Uint8Array, directory: Directory): Promise<string> {
  let uri = '';
  for (let off = 0; off === 0 || off < bytes.length; off += CHUNK) {
    const data = toBase64(bytes.subarray(off, off + CHUNK));
    if (off === 0) uri = (await Filesystem.writeFile({ path, data, directory, recursive: true })).uri;
    else await Filesystem.appendFile({ path, data, directory });
  }
  return uri;
}

/** Lo que se dejó en la caché para compartir se borra antes de cada entrega nueva (puede ser un recorrido sin cifrar). */
export async function clearExports(): Promise<void> {
  await Filesystem.rmdir({ path: EXPORTS, directory: Directory.Cache, recursive: true }).catch(() => undefined);
}

/** Abre el menú Compartir con el archivo. Si se cierra sin elegir, lanza un `AbortError` (como el navegador). */
export async function shareNative(bytes: Uint8Array, name: string): Promise<'shared'> {
  await clearExports();
  const uri = await write(`${EXPORTS}/${safeName(name)}`, bytes, Directory.Cache);
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: name });
  } catch (e) {
    if (isCancel(e)) throw new DOMException('cancelado', 'AbortError');
    throw e;
  }
  return 'shared';
}

/** Guarda el archivo en Documentos/VikArg del teléfono (queda a la vista en la app «Archivos»). Devuelve dónde quedó. */
export async function saveNative(bytes: Uint8Array, name: string): Promise<string> {
  const path = `VikArg/${safeName(name)}`;
  await write(path, bytes, Directory.Documents);
  return `Documentos/${path}`;
}

/** Abre el archivo con el visor que tenga el teléfono para ese tipo. */
export async function openNative(bytes: Uint8Array, name: string, mime: string): Promise<void> {
  await clearExports();
  const uri = await write(`${EXPORTS}/${safeName(name)}`, bytes, Directory.Cache);
  await FileOpener.open({ filePath: uri, contentType: mime });
}

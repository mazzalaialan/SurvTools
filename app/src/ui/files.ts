import { isNativePlatform } from '@/core/platform';

/**
 * Entrega un archivo al usuario: en Android abre el menú "Compartir"
 * (Quick Share, Bluetooth, mensajería…) si el navegador acepta el tipo;
 * si no, lo descarga. En la app nativa el archivo se escribe en el
 * dispositivo y se comparte con el menú del sistema (`nativeFiles.ts`):
 * el WebView no baja archivos con un enlace.
 */
export async function deliverFile(bytes: Uint8Array<ArrayBuffer>, name: string, mime = 'application/octet-stream'): Promise<'shared' | 'downloaded'> {
  if (isNativePlatform()) return (await import('./nativeFiles')).shareNative(bytes, name);
  const file = new File([bytes], name, { type: mime });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (err) {
    // El usuario cerró el menú: no es un error, pero tampoco se entregó.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
  }
  downloadBlob(file, name);
  return 'downloaded';
}

/** Descarga con un enlace temporal (solo el navegador). */
function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Guarda el archivo en el dispositivo, sin menú de compartir: en el navegador se descarga; en la app nativa queda en Documentos/VikArg
 * (`where` dice dónde, para mostrárselo a la persona).
 */
export async function saveFile(bytes: Uint8Array<ArrayBuffer>, name: string, mime = 'application/octet-stream'): Promise<{ how: 'downloaded' | 'saved'; where?: string }> {
  if (isNativePlatform()) return { how: 'saved', where: await (await import('./nativeFiles')).saveNative(bytes, name) };
  downloadBlob(new File([bytes], name, { type: mime }), name);
  return { how: 'downloaded' };
}

/**
 * Abre el archivo en un visor del mismo dispositivo (un PDF, por ejemplo). En el navegador es una pestaña nueva; si la bloquea, se descarga
 * y devuelve `'blocked'`. En la app nativa se abre con el visor del sistema.
 */
export async function openFile(bytes: Uint8Array<ArrayBuffer>, name: string, mime: string): Promise<'opened' | 'blocked'> {
  if (isNativePlatform()) {
    await (await import('./nativeFiles')).openNative(bytes, name, mime);
    return 'opened';
  }
  const file = new File([bytes], name, { type: mime });
  const url = URL.createObjectURL(file);
  const win = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  if (win) return 'opened';
  downloadBlob(file, name);
  return 'blocked';
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

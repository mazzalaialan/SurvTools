import { BOOKS_CACHE, bookUrl } from './books';

/**
 * Archivos de los libros bajados, leídos de lo guardado en el dispositivo y entregados desde la página (no desde el service worker): en la
 * app nativa (Capacitor) no hay service worker, y así la web y la nativa usan el mismo camino. Ver docs/PENDIENTES.md, «App nativa».
 */

/** ¿Una ruta de imagen del libro es relativa a su carpeta (y no una dirección completa o un dato incrustado)? */
export const isRelativeAsset = (src: string): boolean => !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src.trim());

/** Ruta dentro del libro de lo que un capítulo referencia: `file` = «cap-1.html» o «sub/cap-1.html», `src` = «img/a.webp», «./a.webp» o «../a.webp». */
export function resolveAssetPath(file: string, src: string): string {
  const parts = file.split('/').slice(0, -1);
  for (const seg of src.split('#')[0]!.split('?')[0]!.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export async function bookBlob(id: string, path: string): Promise<Blob | null> {
  if (!('caches' in globalThis)) return null;
  const res = await caches.match(bookUrl(id, path), { cacheName: BOOKS_CACHE }).catch(() => undefined);
  return res ? res.blob() : null;
}

/** Direcciones `blob:` de lo que se mostró; se liberan todas juntas al salir de la pantalla (si no, ocupan memoria). */
export class ObjectUrls {
  private urls = new Map<string, Promise<string | null>>();
  get(id: string, path: string): Promise<string | null> {
    const key = `${id}/${path}`;
    let hit = this.urls.get(key);
    if (!hit) {
      hit = bookBlob(id, path).then((b) => (b ? URL.createObjectURL(b) : null));
      this.urls.set(key, hit);
    }
    return hit;
  }
  revokeAll(): void {
    for (const p of this.urls.values()) void p.then((u) => u && URL.revokeObjectURL(u));
    this.urls.clear();
  }
}

/**
 * El capítulo listo para mostrar en un `iframe` (`srcdoc`): sus imágenes apuntan a direcciones `blob:` y lleva la hoja de estilo del visor.
 * `null` si el capítulo no está en el dispositivo.
 */
export async function chapterHtml(id: string, file: string, css: string, urls: ObjectUrls): Promise<string | null> {
  if (!('caches' in globalThis)) return null;
  const res = await caches.match(bookUrl(id, file), { cacheName: BOOKS_CACHE }).catch(() => undefined);
  if (!res) return null;
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  await Promise.all(
    [...doc.querySelectorAll('img[src]')].map(async (img) => {
      const src = img.getAttribute('src')!;
      if (!isRelativeAsset(src)) return;
      const url = await urls.get(id, resolveAssetPath(file, src));
      if (url) img.setAttribute('src', url);
      else img.removeAttribute('src');
    }),
  );
  const style = doc.createElement('style');
  style.id = 'vikarg-reader';
  style.textContent = css;
  doc.head.appendChild(style);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

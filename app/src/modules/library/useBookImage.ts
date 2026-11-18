import { useEffect, useState } from 'react';
import { ObjectUrls } from './bookAssets';

/** Dirección mostrable de una imagen de un libro bajado (o `null` mientras carga o si no está). Se libera al salir. */
export function useBookImage(bookId: string, path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const urls = new ObjectUrls();
    void urls.get(bookId, path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
      urls.revokeAll();
      setUrl(null);
    };
  }, [bookId, path]);
  return url;
}

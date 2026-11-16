import { useEffect, useState } from 'react';

/**
 * Un texto grande (GeoJSON) como enlace local (`blob:`): MapLibre lo baja y lo lee en su propio proceso, así el hilo principal no recibe
 * ni copia el objeto. El enlace anterior se libera al cambiar el texto o al salir.
 */
export function useBlobUrl(text: string | null, type = 'application/json'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (text === null) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(new Blob([text], { type }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [text, type]);
  return url;
}

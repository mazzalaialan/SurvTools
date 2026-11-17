import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * «Conexiones» (la dirección del servidor VikArg, la del clima y el origen de los mapas) no se muestra en Ajustes: es configuración interna
 * para quien monta su propio servidor. Se abre tocando 7 veces el número de versión, o con `#/settings?conexiones=1`, y queda abierta
 * mientras dure la sesión del navegador. Los valores por defecto funcionan sin tocar nada.
 */
const KEY = 'vikarg.connections';
export const TAPS_TO_OPEN = 7;

function stored(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useConnectionsAccess(): { visible: boolean; tap: () => void } {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(stored);
  const [taps, setTaps] = useState(0);
  const fromLink = params.has('conexiones');
  return {
    visible: open || fromLink,
    tap: () => {
      const n = taps + 1;
      setTaps(n);
      if (n >= TAPS_TO_OPEN) {
        try {
          sessionStorage.setItem(KEY, '1');
        } catch {
          // Sin almacenamiento: queda abierta hasta salir de la pantalla.
        }
        setOpen(true);
      }
    },
  };
}

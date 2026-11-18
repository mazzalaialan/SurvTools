import { useEffect, useState } from 'react';
import { isNativePlatform } from '@/core/platform';

/**
 * Precisión de la brújula que informa Android (app nativa) con `@capgo/capacitor-compass` (MPL-2.0): es el mismo dato con el que Google Maps pide
 * mover el teléfono haciendo un 8. El navegador no lo da. Niveles de Android: 3 alta (error menor a 5°), 2 media (menor a 10°), 1 baja (menor a
 * 15°), 0 poco fiable (más de 15°).
 */
export type CompassAccuracyLevel = 'high' | 'medium' | 'low' | 'unreliable';

export function accuracyLevel(value: number): CompassAccuracyLevel | null {
  if (value === 3) return 'high';
  if (value === 2) return 'medium';
  if (value === 1) return 'low';
  if (value === 0) return 'unreliable';
  return null; // -1: sin dato
}

/** `null` si no hay dato (en el navegador, o todavía sin lectura). Solo escucha mientras `active`. */
export function useCompassAccuracy(active: boolean): CompassAccuracyLevel | null {
  const [level, setLevel] = useState<CompassAccuracyLevel | null>(null);
  useEffect(() => {
    if (!active || !isNativePlatform()) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void (async () => {
      try {
        const { CapgoCompass } = await import('@capgo/capacitor-compass');
        // Los sensores solo corren con la brújula en pantalla; las lecturas de rumbo del plugin no se usan (eso lo hace la app), por eso el
        // intervalo es largo.
        await CapgoCompass.startListening({ minInterval: 2000, minHeadingChange: 90 });
        const handle = await CapgoCompass.addListener('accuracyChange', (e) => !cancelled && setLevel(accuracyLevel(e.accuracy)));
        await CapgoCompass.watchAccuracy();
        cleanup = () => {
          void handle.remove();
          void CapgoCompass.unwatchAccuracy().catch(() => undefined);
          void CapgoCompass.stopListening().catch(() => undefined);
        };
        if (cancelled) cleanup();
      } catch {
        /* sin el plugin (la web) o sin sensor magnético: no hay dato */
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
      setLevel(null);
    };
  }, [active]);
  return level;
}

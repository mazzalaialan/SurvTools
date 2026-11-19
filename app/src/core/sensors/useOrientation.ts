import { useEffect, useState } from 'react';
import { sensorFrameMs, useSensorActive } from '@/core/power/saver';
import { orientationFrom, smoothAngle, type Orientation } from './heading';
import { hasOrientationSensor, screenAngle, subscribeOrientation, useSensorPermissionOnTap } from './orientationSource';

/** Las lecturas llegan a ~60 Hz; se redibuja como mucho a este ritmo. */
const FRAME_MS = 50;

/**
 * Orientación magnética del celular mientras el componente está montado.
 * `null` hasta la primera lectura (o siempre, si no hay brújula).
 */
export function useOrientation(enabled = true): Orientation | null {
  const [state, setState] = useState<Orientation | null>(null);
  const { active, saver } = useSensorActive(enabled);
  // iPhone: pide el permiso de los sensores con el próximo toque.
  useSensorPermissionOnTap(active);

  useEffect(() => {
    if (!active || !hasOrientationSensor()) return;
    const frameMs = sensorFrameMs(FRAME_MS, saver);
    let smoothed: number | null = null;
    let lastMode: Orientation['mode'] | null = null;
    let lastEmit = 0;

    const handler = (e: { alpha: number; beta: number; gamma: number }) => {
      const raw = orientationFrom(e.alpha, e.beta, e.gamma);
      // Acostado, la referencia es la parte de arriba de la pantalla: en horizontal es un costado del aparato.
      if (raw.mode === 'flat') raw.heading = (raw.heading + screenAngle()) % 360;
      // Al pasar de acostado a parado el rumbo cambia de referencia: no se suaviza ese salto.
      smoothed = raw.mode === lastMode ? smoothAngle(smoothed, raw.heading) : raw.heading;
      lastMode = raw.mode;
      const now = performance.now();
      if (now - lastEmit < frameMs) return;
      lastEmit = now;
      setState({ ...raw, heading: smoothed });
    };

    return subscribeOrientation(handler);
  }, [active, saver]);

  return state;
}

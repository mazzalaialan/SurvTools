import { useEffect, useState } from 'react';
import { sensorFrameMs, useSensorActive } from '@/core/power/saver';
import { hasOrientationSensor, screenAngle, subscribeOrientation, useSensorPermissionOnTap } from './orientationSource';

export interface DeviceAngles {
  alpha: number;
  beta: number;
  gamma: number;
  /** Rotación de la pantalla (0 vertical, 90/270 horizontal). */
  screenAngle: number;
}

const FRAME_MS = 33;

/**
 * Ángulos crudos (absolutos: norte magnético; en iPhone ver orientationSource.ts), para armar
 * una cámara completa. El suavizado se hace sobre los vectores de la cámara,
 * donde no hay saltos de 359° a 0°.
 */
export function useDeviceAngles(enabled: boolean): DeviceAngles | null {
  const [angles, setAngles] = useState<DeviceAngles | null>(null);
  const { active, saver } = useSensorActive(enabled);
  // iPhone: pide el permiso de los sensores con el próximo toque.
  useSensorPermissionOnTap(active);

  useEffect(() => {
    if (!active || !hasOrientationSensor()) return;
    const frameMs = sensorFrameMs(FRAME_MS, saver);
    let last = 0;
    const handler = (e: { alpha: number; beta: number; gamma: number }) => {
      const now = performance.now();
      if (now - last < frameMs) return;
      last = now;
      setAngles({ alpha: e.alpha, beta: e.beta, gamma: e.gamma, screenAngle: screenAngle() });
    };
    return subscribeOrientation(handler);
  }, [active, saver]);

  return angles;
}

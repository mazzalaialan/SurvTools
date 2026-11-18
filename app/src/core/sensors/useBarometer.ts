import { useEffect, useState } from 'react';
import { barometer } from './barometer';

/**
 * Presión del barómetro (hPa) mientras la pantalla está abierta. `available` es `null` hasta saber si el dispositivo tiene barómetro;
 * `pressure` es la última lectura. Con `enabled` en falso no se enciende el sensor.
 */
export function useBarometer(enabled = true): { available: boolean | null; pressure: { hPa: number; at: number } | null } {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pressure, setPressure] = useState<{ hPa: number; at: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void barometer()
      .available()
      .then((a) => alive && setAvailable(a));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !available) return;
    let stop: (() => void) | null = null;
    let alive = true;
    void barometer()
      .watch((hPa, at) => setPressure({ hPa, at }))
      .then((s) => (alive ? (stop = s) : s()));
    return () => {
      alive = false;
      stop?.();
    };
  }, [enabled, available]);

  return { available, pressure };
}

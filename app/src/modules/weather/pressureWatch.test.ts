import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBarometer, noBarometer, type BarometerBackend } from '@/core/sensors/barometer';

let fixAlt: number | null = 30;
let fixFails = false;
vi.mock('@/core/geo/useGeolocation', () => ({
  currentPosition: async () => {
    if (fixFails) throw new Error('sin GPS');
    return { lat: -34, lon: -58, alt: fixAlt, altAccuracy: 5, accuracy: 5, timestamp: Date.now() };
  },
}));

import { readPressure, takeSample, usePressureWatch } from './pressureWatch';

/** Barómetro falso que entrega las lecturas dadas apenas se empieza a escuchar. */
const fake = (values: number[]): BarometerBackend => ({
  available: async () => true,
  watch: async (cb) => {
    values.forEach((v, i) => setTimeout(() => cb(v, Date.now() + i), 0));
    return () => undefined;
  },
});

const mem = new Map<string, string>();
beforeEach(() => {
  // El entorno de pruebas es `node`: sin localStorage.
  mem.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
  fixAlt = 30;
  fixFails = false;
  usePressureWatch.setState({ samples: [], lastHPa: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setBarometer(noBarometer);
});

describe('lectura y registro de la presión', () => {
  it('la lectura es la mediana de las primeras 5 (corta un valor suelto)', async () => {
    setBarometer(fake([1000.1, 1000.2, 1013, 1000.1, 1000.3]));
    expect(await readPressure(500)).toBeCloseTo(1000.2, 5);
  });
  it('sin barómetro que responda devuelve null al vencer el tiempo', async () => {
    setBarometer({ available: async () => true, watch: async () => () => undefined });
    expect(await readPressure(30)).toBeNull();
  });
  it('guarda la lectura con la altura del GPS y la deja en el dispositivo', async () => {
    setBarometer(fake([1001, 1001, 1001, 1001, 1001]));
    await takeSample(1_000_000);
    const s = usePressureWatch.getState().samples;
    expect(s).toEqual([{ t: 1_000_000, hPa: 1001, altM: 30 }]);
    expect(JSON.parse(mem.get('vikarg.pressureLog')!)).toEqual(s);
  });
  it('sin GPS (o con altura dudosa) la lectura queda sin altura y no cuenta para la tendencia', async () => {
    setBarometer(fake([1001, 1001, 1001, 1001, 1001]));
    fixFails = true;
    await takeSample(1_000_000);
    expect(usePressureWatch.getState().samples[0]!.altM).toBeNull();
    fixFails = false;
    fixAlt = null;
    await takeSample(1_300_000);
    expect(usePressureWatch.getState().samples[1]!.altM).toBeNull();
    expect(usePressureWatch.getState().trend.state).toBe('learning');
  });
});

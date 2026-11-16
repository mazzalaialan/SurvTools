import { describe, expect, it } from 'vitest';
import { asShnEvents, nearestOfficial, officialBetween, officialEvents, type OfficialPort } from './officialTides';

// Montevideo, primeros extremos del 1 y 2 de enero de 2026 (SOHMA; huso +3).
const mvd: OfficialPort = {
  id: 'MVD',
  name: 'Montevideo',
  src: 'SOHMA',
  lat: -34.9033,
  lon: -56.2564,
  huso: 3,
  meanCm: 91,
  k: 'lhlh',
  // 04:04, 11:00, 16:50 del 1/1 y 00:42 del 2/1 (hora local), en minutos desde el 1 de enero 00:00.
  t: [244, 416, 350, 472],
  h: [77, 109, 62, 105],
};
const ba: OfficialPort = { ...mvd, id: 'BSAS', name: 'Buenos Aires', src: 'SHN', lat: -34.567, lon: -58.4 };

describe('tablas de marea oficiales', () => {
  it('pone cada extremo en su instante (hora local = UTC−3) con su altura en metros', () => {
    const e = officialEvents(mvd, 2026);
    expect(e).toHaveLength(4);
    expect(new Date(e[0]!.at).toISOString()).toBe('2026-01-01T07:04:00.000Z'); // 04:04 hora local
    expect(new Date(e[1]!.at).toISOString()).toBe('2026-01-01T14:00:00.000Z');
    expect(e[1]).toMatchObject({ high: true, height: 1.09 });
    expect(e[2]).toMatchObject({ high: false, height: 0.62 });
    expect(new Date(e[3]!.at).toISOString()).toBe('2026-01-02T03:42:00.000Z');
  });
  it('recorta por fechas y convierte para compararlos con la marea calculada', () => {
    const from = Date.parse('2026-01-01T15:00:00Z');
    const to = Date.parse('2026-01-02T00:00:00Z');
    const got = officialBetween(mvd, 2026, from, to);
    expect(got).toHaveLength(1); // solo la bajamar de las 16:50 locales
    expect(asShnEvents(got)[0]).toMatchObject({ type: 'low', height: 0.62 });
  });
  it('elige el puerto oficial más cercano y no llega lejos', () => {
    expect(nearestOfficial([mvd, ba], -34.6, -58.38)?.port.id).toBe('BSAS');
    expect(nearestOfficial([mvd, ba], -34.9, -56.2)?.port.id).toBe('MVD');
    expect(nearestOfficial([mvd, ba], -42.77, -65.04)).toBeNull(); // Puerto Madryn: a más de 60 km de estos dos
  });
});

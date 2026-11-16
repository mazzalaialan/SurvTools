import { describe, expect, it } from 'vitest';
import { compareWithCalculated, nearestShn, shnExpired, type ShnStation } from './shnTides';

const ba: ShnStation = {
  id: 'buenos-aires',
  name: 'PUERTO DE BUENOS AIRES (Muelle de Pescadores)',
  section: 'interior',
  lat: -34.567,
  lon: -58.4,
  events: [
    { type: 'low', at: '2026-11-16T18:30:00-03:00', height: 0.35 },
    { type: 'high', at: '2026-11-17T01:00:00-03:00', height: 1.1 },
  ],
};
const sf: ShnStation = { ...ba, id: 'san-fernando', name: 'SAN FERNANDO', lat: -34.443, lon: -58.532 };

describe('pronóstico mareológico del SHN en la app', () => {
  it('elige el puerto más cercano dentro del estuario y nada lejos', () => {
    expect(nearestShn([ba, sf], -34.6, -58.38)?.station.id).toBe('buenos-aires');
    expect(nearestShn([ba, sf], -34.45, -58.5)?.station.id).toBe('san-fernando');
    expect(nearestShn([ba, sf], -38.0, -57.5)).toBeNull(); // Mar del Plata: el pronóstico no llega
  });
  it('vence a la hora de validez', () => {
    const f = { validTo: '2026-11-17T03:00:00-03:00' };
    expect(shnExpired(f, Date.parse('2026-11-17T01:00:00-03:00'))).toBe(false);
    expect(shnExpired(f, Date.parse('2026-11-17T04:00:00-03:00'))).toBe(true);
  });
  it('compara la hora con la pleamar y la bajamar calculadas del mismo tipo', () => {
    // El 17/11 la tabla da 00:09 y el pronóstico 01:00: llega 51 minutos más tarde.
    const calculated = [
      { time: new Date('2026-11-16T23:30:00-03:00'), level: 0.5, high: false },
      { time: new Date('2026-11-17T00:09:00-03:00'), level: 1.37, high: true },
      { time: new Date('2026-11-17T08:00:00-03:00'), level: 0.77, high: false },
    ];
    const rows = compareWithCalculated(ba.events, calculated);
    expect(rows[0]!.calculated).toBeNull(); // la bajamar calculada más cercana está a más de 4 h
    expect(rows[1]!.calculated?.high).toBe(true);
    expect(rows[1]!.diffMin).toBe(51);
  });
});

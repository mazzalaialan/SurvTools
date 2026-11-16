import { describe, expect, it } from 'vitest';
import { nearestPy, readingAgeDays, type PyStation } from './paraguayRivers';
import { pyPoints } from '../weathermap/navLayers';

const st = (over: Partial<PyStation>): PyStation => ({
  code: '1',
  name: 'Asunción',
  river: 'Paraguay',
  lat: -25.2759,
  lon: -57.6411,
  approx: false,
  level: 1.81,
  date: '2026-11-15',
  changeCm: -4,
  trend: 'falling',
  min: { level: -0.5, date: '2021-10-01' },
  max: { level: 9.01, date: '1983-05-29' },
  ...over,
});

describe('ríos de Paraguay (DMH)', () => {
  it('nearestPy: ordena por distancia y descarta lo lejano', () => {
    const list = [st({ code: 'a', name: 'Pilar', lat: -26.87, lon: -58.32 }), st({ code: 'b' }), st({ code: 'c', name: 'Bahía Negra', lat: -20.2, lon: -58.18 })];
    const r = nearestPy(list, -25.3, -57.6, 6, 250);
    expect(r.map((n) => n.station.code)).toEqual(['b', 'a']);
    expect(r[0]!.km).toBeLessThan(10);
  });

  it('readingAgeDays: días desde la lectura de la DMH (hay estaciones con lecturas de meses atrás)', () => {
    const now = Date.parse('2026-11-16T12:00:00-03:00');
    expect(readingAgeDays('2026-11-15', now)).toBe(1);
    expect(readingAgeDays('2025-02-28', now)).toBeGreaterThan(400);
    expect(readingAgeDays('2026-11-20', now)).toBe(0);
  });

  it('pyPoints: un punto por estación, sin umbrales (estado desconocido), con la variación en metros y el histórico', () => {
    const [p] = pyPoints({ fetchedAt: 1, stations: [st({})] });
    expect(p).toMatchObject({ id: 'py-1', source: 'py', state: 'unknown', level: 1.81, at: '2026-11-15', alert: null, evac: null, trend: 'falling', approx: false });
    expect(p!.change).toBeCloseTo(-0.04);
    expect(p!.histMax).toEqual({ level: 9.01, date: '1983-05-29' });
    expect(pyPoints(null)).toEqual([]);
  });
});

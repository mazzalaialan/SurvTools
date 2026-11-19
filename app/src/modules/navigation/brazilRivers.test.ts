import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrLoadingError, brState, fetchBrLevels, nearestBr, readingAgeHours, type BrStation } from './brazilRivers';
import { NAV_SOURCES, sourceEnabled } from './sources';

// Estación como la sirve el servidor (lectura real de la ANA del 19-nov-2026) y cotas del SGB/CPRM de 2023.
const st = (over: Partial<BrStation>): BrStation => ({
  code: '77150000',
  name: 'Uruguaiana',
  river: 'Uruguai',
  muni: 'Uruguaiana-RS',
  lat: -29.7486,
  lon: -57.0886,
  basin: 'uruguai',
  thresholds: { attention: 650, alert: 750, flood: 850 },
  level: 556.3,
  at: '2026-11-19T16:30:00-03:00',
  flow: 6666.76,
  changeCm: -14.9,
  changeHours: 6,
  trend: 'falling',
  ...over,
});

describe('ríos de Brasil (ANA)', () => {
  it('brState: compara con las cotas de atención, alerta e inundación (en cm), justo en la cota ya cuenta', () => {
    const th = { attention: 650, alert: 750, flood: 850 };
    expect(brState(556.3, th)).toBe('normal');
    expect(brState(650, th)).toBe('attention');
    expect(brState(749.9, th)).toBe('attention');
    expect(brState(750, th)).toBe('alert');
    expect(brState(850, th)).toBe('flood');
    expect(brState(900, th)).toBe('flood');
  });

  it('brState: sin cotas oficiales no hay estado (Iguazú, Paraná); con cotas parciales usa las que hay', () => {
    expect(brState(209, null)).toBeNull();
    expect(brState(209, { attention: null, alert: null, flood: null })).toBeNull();
    const partial = { attention: 600, alert: 650, flood: null };
    expect(brState(640, partial)).toBe('attention');
    expect(brState(2000, partial)).toBe('alert');
  });

  it('nearestBr: ordena por distancia y descarta lo lejano', () => {
    const list = [st({ code: 'a', name: 'Itaqui', lat: -29.1175, lon: -56.5544 }), st({ code: 'b' }), st({ code: 'c', name: 'Iraí', lat: -27.1756, lon: -53.2297 })];
    const r = nearestBr(list, -29.75, -57.09, 6, 250);
    expect(r.map((n) => n.station.code)).toEqual(['b', 'a']);
    expect(r[0]!.km).toBeLessThan(2);
  });

  it('readingAgeHours: horas desde la lectura (con la hora de Brasilia)', () => {
    const now = Date.parse('2026-11-19T20:30:00Z'); // 17:30 en Brasilia
    expect(readingAgeHours('2026-11-19T16:30:00-03:00', now)).toBeCloseTo(1);
    expect(readingAgeHours('2026-11-17T17:00:00-03:00', now)).toBeGreaterThan(48);
    expect(readingAgeHours('2026-11-20T10:00:00-03:00', now)).toBe(0);
  });

  describe('fetchBrLevels', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('lee las estaciones del servidor propio', async () => {
      const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ fetchedAt: 1, stations: [st({})], failed: [] })));
      vi.stubGlobal('fetch', fetchMock);
      const r = await fetchBrLevels('https://srv.example/');
      expect(fetchMock.mock.calls[0]![0]).toBe('https://srv.example/api/rivers/br');
      expect(r.stations).toHaveLength(1);
    });
    it('503 «loading» (primera ronda) es un error distinguible; otro error o respuesta rara, también falla', async () => {
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'loading' }), { status: 503 }));
      await expect(fetchBrLevels('https://srv.example')).rejects.toBeInstanceOf(BrLoadingError);
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }));
      await expect(fetchBrLevels('https://srv.example')).rejects.not.toBeInstanceOf(BrLoadingError);
      vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ nada: 1 })));
      await expect(fetchBrLevels('https://srv.example')).rejects.toThrow('respuesta inesperada');
    });
  });

  it('la fuente «ana-br» está declarada con crédito, enlace y licencia sin declarar, y se apaga solo si la copia comercial lo pide', () => {
    const s = NAV_SOURCES.find((x) => x.id === 'ana-br')!;
    expect(s.license).toBe('undeclared');
    expect(s.cite).toMatch(/ANA/);
    expect(s.cite).toMatch(/SGB/);
    expect(sourceEnabled('ana-br', true)).toBe(true);
  });
});

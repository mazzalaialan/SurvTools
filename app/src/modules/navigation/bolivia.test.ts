import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ageDays, boThreatLine, nearestBo, OLD_READING_DAYS, planillaFor, type BoCatalog, type BoLevels, type BoPlanillaRow } from './bolivia';

const catalog = JSON.parse(readFileSync(new URL('../../../public/data/rivers-BO.json', import.meta.url), 'utf8')) as BoCatalog;
const reading = (station: string, river: string, lastCm: number, lastDate = '2026-11-12') => ({ station, river, prevDate: '2026-11-11', prevCm: lastCm - 1, lastDate, lastCm, zeroCm: null, trend: 'steady' as const });
const levels: BoLevels = {
  reportDate: '2026-11-12',
  fetchedAt: 1,
  url: 'https://x/r.pdf',
  readings: [reading('HUATAJATA', 'TITICACA', 320), reading('CAMIACO', 'MAMORÉ', 487), reading('SIN COORDENADAS', 'X', 1), reading('GUANAY', 'MAPIRI', 100, '2026-06-01')],
};

describe('niveles de ríos de Bolivia', () => {
  it('el catálogo trae estaciones con coordenadas dentro de Bolivia y marca las aproximadas', () => {
    expect(catalog.stations.length).toBeGreaterThanOrEqual(25);
    for (const s of catalog.stations) {
      expect(s.lat).toBeLessThan(-9);
      expect(s.lat).toBeGreaterThan(-23);
      expect(s.lon).toBeLessThan(-57);
      expect(s.lon).toBeGreaterThan(-70);
      expect(typeof s.approx).toBe('boolean');
    }
    expect(catalog.stations.find((s) => s.name === 'HUATAJATA')?.approx).toBe(true);
    expect(catalog.stations.find((s) => s.name === 'CAMIACO')?.approx).toBe(false);
    expect(catalog.source).toContain('SENAMHI');
  });

  it('las estaciones más cercanas a un punto, sin las que no tienen ubicación', () => {
    // Orilla del Titicaca.
    const near = nearestBo(levels, catalog, -16.2, -68.7);
    expect(near[0]!.reading.station).toBe('HUATAJATA');
    expect(near[0]!.km).toBeLessThan(3);
    expect(near.some((n) => n.reading.station === 'SIN COORDENADAS')).toBe(false);
    // Nada a menos de 300 km del Atlántico argentino.
    expect(nearestBo(levels, catalog, -38, -57)).toEqual([]);
  });

  it('una lectura vieja se distingue por los días que lleva respecto del reporte', () => {
    expect(ageDays('2026-11-12', '2026-11-12')).toBe(0);
    expect(ageDays('2026-11-11', '2026-11-12')).toBe(1);
    expect(ageDays('2026-06-01', '2026-11-12')).toBeGreaterThan(OLD_READING_DAYS);
  });

  it('cruza el catálogo con la planilla del pronóstico: nombres con otra forma, palabras partidas y la peor amenaza', () => {
    const row = (station: string, threat: BoPlanillaRow['threat']): BoPlanillaRow => ({ station, river: 'x', threat, trend: 'rises', untilOverflow: null, unit: null, period: '' });
    const rows = [row('Guayaram erin', 'yellow'), row('Pico de Loro', 'orange'), row('Pico de loro', 'orange'), row('Puerto Villarroel', 'yellow'), row('Puerto Villarroel', 'red'), row('Tupiza-1', 'yellow')];
    expect(planillaFor(rows, 'GUAYARAMERIN')?.station).toBe('Guayaram erin');
    expect(planillaFor(rows, 'PICO DE LORO')?.threat).toBe('orange');
    expect(planillaFor(rows, 'PUERTO VILLARROEL')?.threat).toBe('red');
    expect(planillaFor(rows, 'TUPIZA')?.station).toBe('Tupiza-1');
    expect(planillaFor(rows, 'ABAPO')).toBeNull();
    expect(planillaFor(undefined, 'ABAPO')).toBeNull();
    expect(planillaFor(rows, 'EL')).toBeNull(); // un nombre corto no se cruza por prefijo
  });

  it('la línea de la amenaza: nivel, tendencia y cuánto falta, con su unidad', () => {
    const t = (key: string, o?: Record<string, unknown>) => `${key}${o ? JSON.stringify(o) : ''}`;
    const line = boThreatLine({ station: 'Corani', river: 'Corani', threat: 'orange', trend: 'rises', untilOverflow: 218.69, unit: 'm3s', period: '' }, t, 'es');
    expect(line).toContain('"unit":"m³/s"');
    expect(line).toContain('"value":"218,69"');
    expect(boThreatLine({ station: 'X', river: 'x', threat: 'yellow', trend: null, untilOverflow: null, unit: null, period: '' }, t, 'es')).not.toContain('until');
  });
});

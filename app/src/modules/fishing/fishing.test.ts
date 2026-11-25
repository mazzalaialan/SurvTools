import { describe, expect, it } from 'vitest';
import { releaseActive, rulesExpired, distanceToSector, isStale, seasonStatus, sectorsInZone, sectorsNear, sectorsWithSpecies, speciesClosedUntil, speciesInZone, waters, zoneNear, type FishData, type FishSector } from './fishing';

const sector = (id: string, water: string, coords: [number, number][], species: string[]): FishSector => ({
  id,
  region: 'neuquen',
  water,
  name: `tramo ${id}`,
  geometry: { type: 'LineString', coordinates: coords },
  species: species.map((s) => ({ id: s })),
  source: 'prueba',
});

const lago: FishSector = {
  id: 'lago',
  region: 'neuquen',
  water: 'Lago Prueba',
  name: 'todo el lago',
  geometry: { type: 'Polygon', coordinates: [[[-71, -40], [-70.9, -40], [-70.9, -40.1], [-71, -40.1], [-71, -40]]] },
  species: [{ id: 'perca' }],
  source: 'prueba',
};

const data: FishData = {
  version: 1,
  generatedAt: '2026-11-23',
  sources: [],
  species: [],
  regions: [{ id: 'neuquen', name: 'Neuquén', source: 'prueba', season: { from: '11-01', to: '05-01' } }],
  sectors: [sector('a', 'Río Chimehuin', [[-71.2, -39.9], [-71.1, -39.95]], ['arcoiris', 'marron']), sector('b', 'Río Aluminé', [[-70.9, -39.2], [-70.8, -39.3]], ['arcoiris']), lago],
};

describe('pesca: temporada', () => {
  const s = { from: '11-01', to: '05-01' };
  it('una temporada que cruza el año está abierta en enero y dice hasta cuándo', () => {
    const r = seasonStatus(s, new Date(2026, 0, 15));
    expect(r.state).toBe('open');
    expect(r.state === 'open' && r.until?.toDateString()).toBe(new Date(2026, 4, 1).toDateString());
  });
  it('en noviembre ya abrió (hasta mayo del año siguiente)', () => {
    const r = seasonStatus(s, new Date(2026, 10, 23));
    expect(r.state === 'open' && r.until?.toDateString()).toBe(new Date(2027, 4, 1).toDateString());
  });
  it('en julio está en veda y dice cuándo abre', () => {
    const r = seasonStatus(s, new Date(2026, 6, 10));
    expect(r.state).toBe('closed');
    expect(r.state === 'closed' && r.from?.toDateString()).toBe(new Date(2026, 10, 1).toDateString());
  });
  it('el último día cuenta como abierto', () => {
    expect(seasonStatus(s, new Date(2026, 4, 1, 18)).state).toBe('open');
    expect(seasonStatus(s, new Date(2026, 4, 2)).state).toBe('closed');
  });
  it('temporada con años fijos y todo el año', () => {
    expect(seasonStatus({ from: '2025-11-01', to: '2026-05-01' }, new Date(2026, 6, 1)).state).toBe('closed');
    expect(seasonStatus({ allYear: true }).state).toBe('open');
    expect(seasonStatus(undefined).state).toBe('unknown');
  });
});

describe('pesca: búsquedas', () => {
  it('tramos por especie y ríos agrupados', () => {
    expect(sectorsWithSpecies(data, 'arcoiris').map((s) => s.id)).toEqual(['a', 'b']);
    expect(waters(data).map((w) => w.water)).toEqual(['Lago Prueba', 'Río Aluminé', 'Río Chimehuin']);
  });
  it('distancia a un tramo de río y dentro de un lago', () => {
    // A unos 1,1 km al norte del primer punto del Chimehuin.
    expect(distanceToSector([-71.2, -39.89], data.sectors[0]!)).toBeGreaterThan(1000);
    expect(distanceToSector([-71.2, -39.89], data.sectors[0]!)).toBeLessThan(1200);
    expect(distanceToSector([-70.95, -40.05], lago)).toBe(0);
  });
  it('tramos cerca de un punto, del más cercano al más lejano', () => {
    const near = sectorsNear(data, [-71.15, -39.93], 50_000);
    expect(near[0]!.sector.id).toBe('a');
    expect(near.map((n) => n.sector.id)).not.toContain('b');
  });
  it('avisa con datos de más de un año', () => {
    expect(isStale(data, new Date(2026, 11, 1))).toBe(false);
    expect(isStale(data, new Date(2028, 0, 1))).toBe(true);
  });
});

describe('pesca: zonas y vedas por especie', () => {
  const zoned: FishData = {
    ...data,
    zones: [{ id: 'patagonia', name: { es: 'Patagonia' } }, { id: 'litoral', name: { es: 'Litoral' } }],
    regions: [{ id: 'neuquen', name: 'Neuquén', zone: 'patagonia', source: 'x' }, { id: 'lit-santa-fe', name: 'Santa Fe', zone: 'litoral', source: 'x' }],
    species: [{ id: 'arcoiris', scientific: '', native: false, name: { es: 'Trucha' } }, { id: 'dorado', scientific: '', native: true, name: { es: 'Dorado' } }],
    sectors: [...data.sectors, { ...sector('p', 'Río Paraná', [[-60.6, -31.6], [-60.5, -31.8]], ['dorado']), region: 'lit-santa-fe' }],
  };
  it('cada zona con sus tramos y sus peces', () => {
    expect(sectorsInZone(zoned, 'litoral').map((s) => s.id)).toEqual(['p']);
    expect(speciesInZone(zoned, 'litoral').map((s) => s.id)).toEqual(['dorado']);
    expect(speciesInZone(zoned, 'patagonia').map((s) => s.id)).toEqual(['arcoiris']);
  });
  it('la zona del lugar es la del tramo más cercano', () => {
    expect(zoneNear(zoned, [-60.52, -31.74])).toBe('litoral');
    expect(zoneNear(zoned, [-71.1, -39.9])).toBe('patagonia');
  });
  it('veda anual de una especie (surubí del 1/11 al 31/12)', () => {
    expect(speciesClosedUntil({ id: 's', closures: [{ from: '11-01', to: '12-31' }] }, new Date(2026, 10, 24))?.getMonth()).toBe(11);
    expect(speciesClosedUntil({ id: 's', closures: [{ from: '11-01', to: '12-31' }] }, new Date(2026, 1, 1))).toBeNull();
  });
});

describe('pesca: reglas por fecha', () => {
  it('devolución obligatoria desde una fecha', () => {
    const sp = { id: 'arcoiris', limit: 1, releaseFrom: '2027-05-02' };
    expect(releaseActive(sp, new Date(2027, 4, 1))).toBe(false);
    expect(releaseActive(sp, new Date(2027, 4, 2))).toBe(true);
  });
  it('temporada con un período extra (octubre)', () => {
    const season = { from: '2026-11-01', to: '2027-05-31', also: [{ from: '2027-10-01', to: '2027-10-31' }] };
    expect(seasonStatus(season, new Date(2027, 6, 1)).state).toBe('closed');
    const st = seasonStatus(season, new Date(2027, 6, 1));
    expect(st.state === 'closed' && st.from?.getMonth()).toBe(9);
    expect(seasonStatus(season, new Date(2027, 9, 15)).state).toBe('open');
  });
});

describe('pesca: vencimiento de la norma', () => {
  it('pasada la vigencia, la norma cargada no vale', () => {
    expect(rulesExpired({ validUntil: '2027-10-31' }, new Date(2027, 9, 31, 12))).toBe(false);
    expect(rulesExpired({ validUntil: '2027-10-31' }, new Date(2027, 10, 1))).toBe(true);
    expect(rulesExpired({}, new Date(2030, 0, 1))).toBe(false);
  });
});

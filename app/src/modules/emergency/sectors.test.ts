import { beforeEach, describe, expect, it } from 'vitest';
import { COUNTRIES, useSettings } from '@/core/settings/settings';
import { mergeParks } from './data';
import { mergePackages } from './country';
import { countryFiles, deletableFiles } from './countryDownload';
import { BR_SECTORS, BR_SECTOR_IDS, sectorAt, sectorFiles, sectorOfState } from './sectors';
import { mergeServiceData, type ServiceData } from './services';
import geo from '@/modules/weathermap/geo-data.json';

describe('sectores de Brasil', () => {
  it('son las cinco macrorregiones del IBGE y cubren los 26 estados y el Distrito Federal una sola vez', () => {
    expect(BR_SECTOR_IDS).toEqual(['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte']);
    const all = BR_SECTORS.flatMap((s) => s.states);
    expect(all).toHaveLength(27);
    expect(new Set(all).size).toBe(27);
    // Y son los mismos estados que trae el mapa base.
    const geoStates = geo.regions.filter((r) => r.country === 'BR').map((r) => r.id.replace('BR-', ''));
    expect([...geoStates].sort()).toEqual([...all].sort());
  });

  it('cada sector tiene su paquete, los diez servicios y los parques', () => {
    const files = sectorFiles('sul');
    expect(files).toContain('BR-sul.json');
    expect(files).toContain('parks-BR-sul.json');
    expect(files).toContain('fuel-BR-sul.json');
    expect(files.filter((f) => /^[a-z]+-BR-sul\.json$/.test(f))).toHaveLength(11);
  });

  it('sectorOfState y sectorAt ubican un estado y un punto', () => {
    expect(sectorOfState('BR-RS')).toBe('sul');
    expect(sectorOfState('SP')).toBe('sudeste');
    expect(sectorOfState('BR-MS')).toBe('centro-oeste');
    expect(sectorOfState('BR-BA')).toBe('nordeste');
    expect(sectorOfState('AM')).toBe('norte');
    expect(sectorOfState('AR')).toBeNull();
    const regions = geo.regions as { id: string; rings: number[][] }[];
    expect(sectorAt(regions, -25.43, -49.27)).toBe('sul'); // Curitiba
    expect(sectorAt(regions, -23.55, -46.63)).toBe('sudeste'); // São Paulo
    expect(sectorAt(regions, -15.79, -47.88)).toBe('centro-oeste'); // Brasília
    expect(sectorAt(regions, -12.97, -38.5)).toBe('nordeste'); // Salvador
    expect(sectorAt(regions, -3.12, -60.02)).toBe('norte'); // Manaus
    expect(sectorAt(regions, -34.6, -58.4)).toBeNull(); // Buenos Aires
  });
});

describe('archivos de Brasil según los sectores elegidos', () => {
  beforeEach(() => {
    useSettings.setState({ settings: { ...useSettings.getState().settings, brSectors: [] } });
  });
  const pick = (brSectors: ('sul' | 'norte')[]) => useSettings.setState({ settings: { ...useSettings.getState().settings, brSectors } });

  it('sin sectores elegidos, Brasil solo trae lo compartido; con sectores, sus archivos', () => {
    expect(countryFiles('BR')).toEqual(['ecoregions.json']);
    pick(['sul']);
    expect(countryFiles('BR')).toEqual(['ecoregions.json', ...sectorFiles('sul')]);
    pick(['sul', 'norte']);
    expect(countryFiles('BR')).toEqual(expect.arrayContaining(sectorFiles('norte')));
  });

  it('al borrar un país no se borra lo que usa otro (ecorregiones; parques de Chile que usa Argentina)', () => {
    const cl = deletableFiles('CL');
    expect(cl).not.toContain('ecoregions.json');
    expect(cl).not.toContain('parks-CL.json');
    expect(cl).toContain('CL.json');
    expect(deletableFiles('PY')).toContain('PY.json');
    for (const c of COUNTRIES) expect(deletableFiles(c)).not.toContain('ecoregions.json');
  });
});

describe('juntar sectores', () => {
  const pkg = (province: string, places: [string, number, number, number, number][], extra = {}) =>
    ({
      country: 'BR' as const,
      generatedAt: '2026-11-19',
      osm: true,
      sources: { fire: 'OSM', police: 'OSM', health: 'OSM', radio: '' },
      fire: [{ name: `fire-${province}` }],
      police: [],
      health: [],
      radio: [],
      provinces: [province],
      places,
      ...extra,
    }) as unknown as Parameters<typeof mergePackages>[0][number];

  it('las localidades se suman con el índice de estado corrido y ordenadas por relevancia', () => {
    const merged = mergePackages([pkg('Paraná', [['Curitiba', 0, -25.4, -49.3, 100]]), pkg('Santa Catarina', [['Joinville', 0, -26.3, -48.8, 120], ['Blumenau', 0, -26.9, -49.1, 90]])]);
    expect(merged.provinces).toEqual(['Paraná', 'Santa Catarina']);
    expect(merged.places.map((p) => p[0])).toEqual(['Joinville', 'Curitiba', 'Blumenau']);
    expect(merged.places.find((p) => p[0] === 'Joinville')![1]).toBe(1);
    expect(merged.places.find((p) => p[0] === 'Curitiba')![1]).toBe(0);
    expect(merged.fire).toHaveLength(2);
    expect(merged.osm).toBe(true);
  });

  it('los servicios de varios sectores quedan en un solo archivo', () => {
    const part = (n: number): ServiceData => ({ country: 'BR', category: 'fuel', generatedAt: `2026-11-0${n}`, osm: true, source: 'OSM', places: Array.from({ length: n }, (_, i) => ({ name: `s${n}${i}`, lat: 0, lon: 0 })) });
    const merged = mergeServiceData('fuel', [part(1), part(2)]);
    expect(merged.places).toHaveLength(3);
    expect(merged.generatedAt).toBe('2026-11-02');
    expect(merged.osm).toBe(true);
  });

  it('un parque que cruza de un sector a otro queda una sola vez', () => {
    const park = (name: string, cnuc: string) => ({ name, cnuc, lat: 0, lon: 0, url: '', address: '', phone: '', phones: '', area: [] }) as unknown as Parameters<typeof mergeParks>[0][number]['parks'][number];
    const merged = mergeParks([
      { source: 'CNUC', parks: [park('Aparados da Serra', '1'), park('Iguaçu', '2')] },
      { source: 'CNUC', parks: [park('Aparados da Serra', '1'), park('Itatiaia', '3')] },
    ]);
    expect(merged.parks.map((p) => p.name)).toEqual(['Aparados da Serra', 'Iguaçu', 'Itatiaia']);
    expect(merged.source).toBe('CNUC');
  });
});

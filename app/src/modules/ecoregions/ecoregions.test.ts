import { describe, expect, it } from 'vitest';
import data from '../../../public/data/ecoregions.json';
import veg from '../../../public/data/vegetation-CL.json';
import { biomeName, distanceM, finerLookup, offsetBiomes, ecoregionAt, ecoregionName, ecoregionsAlong, ecoregionsGeoJSON, type EcoregionData } from './ecoregions';

const d = data as unknown as EcoregionData;
const at = (lat: number, lon: number) => ecoregionAt(d, lat, lon)?.name;

describe('ecorregiones', () => {
  it('Lago Lolog (San Martín de los Andes): bosque valdiviano; hacia Junín de los Andes, estepa', () => {
    expect(at(-40.0, -71.45)).toBe('Valdivian temperate forests');
    expect(at(-39.95, -71.07)).toBe('Patagonian steppe');
  });
  it('otros lugares conocidos', () => {
    expect(at(-34.6, -58.4)).toBe('Humid Pampas'); // Buenos Aires
    expect(at(-33.45, -70.67)).toBe('Chilean Matorral'); // Santiago
    expect(at(-16.5, -68.15)).toBe('Central Andean wet puna'); // La Paz
    expect(at(-25.3, -57.6)).toBe('Humid Chaco'); // Asunción
  });
  it('en la costa el punto apenas afuera del contorno cae en la ecorregión cercana; mar adentro, ninguna', () => {
    expect(at(-34.9, -56.2)).toBe('Uruguayan savanna'); // Montevideo
    expect(at(-40, -60)).toBeUndefined();
  });
  it('nombres y biomas', () => {
    const e = ecoregionAt(d, -40.0, -71.45)!;
    expect(ecoregionName(e, 'es-AR')).toBe('Bosques templados valdivianos');
    expect(ecoregionName(e, 'en')).toBe('Valdivian temperate forests');
    expect(biomeName(d, e)).toMatch(/templados/);
  });
  it('un recorrido que cruza de bosque a estepa lista las dos con sus metros', () => {
    const line: [number, number][] = [[-71.45, -40.0], [-71.3, -39.98], [-71.15, -39.96], [-71.07, -39.95]];
    const r = ecoregionsAlong(d, line);
    expect(r.map((x) => x.ecoregion.name)).toEqual(['Valdivian temperate forests', 'Patagonian steppe']);
    expect(Math.round(r.reduce((n, x) => n + x.meters, 0))).toBe(Math.round(distanceM(line[0]!, line[1]!) + distanceM(line[1]!, line[2]!) + distanceM(line[2]!, line[3]!)));
  });
  it('GeoJSON para el mapa', () => {
    const g = ecoregionsGeoJSON(d, 'es');
    expect(g.features.length).toBe(d.ecoregions.length);
    expect((g.features[0]!.geometry as GeoJSON.MultiPolygon).coordinates[0]![0]![0]).toHaveLength(2);
  });
  it('pisos de vegetación de Chile: la fina manda donde hay y la gruesa en el resto', () => {
    const cl = offsetBiomes(veg as unknown as EcoregionData, 100);
    const { lookup, fineAt } = finerLookup(d, cl);
    // Pucón: un piso de Nothofagus; Argentina (sin dato fino) sigue con RESOLVE.
    expect(fineAt(-39.28, -71.98)?.name).toMatch(/Nothofagus/);
    expect(lookup(-39.28, -71.98)?.id).toBeLessThan(100_000);
    expect(fineAt(-34.6, -58.4)).toBeNull();
    expect(lookup(-34.6, -58.4)?.name).toBe('Humid Pampas');
    // Los biomas corridos no se pisan con los de RESOLVE y se pueden nombrar.
    const e = fineAt(-33.45, -70.67)!;
    expect(e.biome).toBeGreaterThan(100);
    expect(biomeName(cl, e)).toBeTruthy();
  });
});

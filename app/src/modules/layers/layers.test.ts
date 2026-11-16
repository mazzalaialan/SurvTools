import { describe, expect, it } from 'vitest';
import base from '../../../public/data/geology-AR.json';
import { geologyAlong, geologyAt, geologyGeoJSON, boxedFrom, inGeologyCoverage, unitAge, unitColor, type GeologyData, type GeologyIndex } from './geology';
import { periodColor } from './periods';
import { layerKey, layerTiles, MAX_LAYER_TILES, mergeForest, zoneLayerTiles } from './zoneLayers';
import { zoneKeys } from '@/modules/maps/store';
import type { EcoregionData } from '@/modules/ecoregions/ecoregions';

const idx: GeologyIndex = { detail: [], base: boxedFrom(base as unknown as GeologyData), credits: [] };

describe('geología: base nacional', () => {
  it('cubre el país y da una unidad con edad en puntos conocidos', () => {
    const lolog = geologyAt(idx, -40.0, -71.4);
    expect(lolog?.unit.name).toBeTruthy();
    expect(lolog?.detail).toBe(false);
    expect(geologyAt(idx, -34.6, -58.4)?.unit.name).toBeTruthy(); // Buenos Aires
    expect(geologyAt(idx, -24.2, -65.3)?.unit.name).toBeTruthy(); // Jujuy
    expect(geologyAt(idx, 10, 10)).toBeNull();
  });
  it('el detalle de una zona manda sobre la base', () => {
    const detail = boxedFrom({ units: [{ name: 'Formación de prueba', litho: 'Basaltos', from: 'Plioceno', to: 'Plioceno' }], polys: [{ u: 0, p: [[-71.5, -40.1, -71.3, -40.1, -71.3, -39.9, -71.5, -39.9, -71.5, -40.1]] }] });
    const both = { ...idx, detail };
    const hit = geologyAt(both, -40.0, -71.4)!;
    expect(hit.unit.name).toBe('Formación de prueba');
    expect(hit.detail).toBe(true);
    expect(geologyAt(both, -34.6, -58.4)!.detail).toBe(false);
  });
  it('un recorrido lista las unidades con sus metros y los colores salen del período', () => {
    const r = geologyAlong(idx, [[-71.45, -40.0], [-71.3, -39.98], [-71.0, -39.95]]);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.meters > 0)).toBe(true);
    expect(periodColor('Plioceno')).not.toBe(periodColor('Devónico'));
    expect(periodColor('Neoproterozoico')).toBe('#fea8a8');
    expect(periodColor(null)).toBe('#bdbdbd');
    expect(unitColor({ name: 'x', litho: '', from: '', to: 'Cretácico' })).toBe('#7fc64e');
    expect(unitAge({ name: 'x', litho: '', from: 'Devónico', to: 'Carbonífero' })).toBe('Devónico – Carbonífero');
    expect(unitAge({ name: 'x', litho: '', from: 'Plioceno', to: 'Plioceno' })).toBe('Plioceno');
  });
  it('GeoJSON para el mapa y cobertura', () => {
    const g = geologyGeoJSON(idx);
    expect(g.features.length).toBeGreaterThan(1000);
    expect(inGeologyCoverage(-40, -71)).toBe(true);
    expect(inGeologyCoverage(40, -3)).toBe(false); // Madrid
    // En una copia comercial no entran los paquetes de uso no comercial (Chile y Perú); Argentina sí (Arica, Chile, queda afuera).
    expect(inGeologyCoverage(-18.5, -70.3, true)).toBe(false);
    expect(inGeologyCoverage(-18.5, -70.3, false)).toBe(true);
    expect(inGeologyCoverage(-40, -71, true)).toBe(true);
  });
});

describe('capas por zona: teselas', () => {
  const lolog = { west: -71.5, south: -40.1, east: -71.3, north: -39.9 };
  it('el Lolog necesita pocas teselas de cada tipo, con claves propias', () => {
    const t = zoneLayerTiles(lolog);
    expect(t.filter((x) => x.kind === 'geology').length).toBeGreaterThanOrEqual(1);
    expect(t.filter((x) => x.kind === 'forest').length).toBeGreaterThanOrEqual(2);
    expect(t.every((x) => x.key === layerKey(x.kind, x.x, x.y))).toBe(true);
  });
  it('sin datos fuera de la zona de cobertura y sin detalle si la zona es muy grande', () => {
    expect(zoneLayerTiles({ west: -58.5, south: -34.7, east: -58.3, north: -34.5 }).filter((x) => x.kind === 'forest')).toHaveLength(0);
    expect(zoneLayerTiles({ west: -10, south: 40, east: -9, north: 41 })).toHaveLength(0);
    expect(layerTiles('forest', { west: -73, south: -50, east: -70, north: -40 })).toBeNull();
    expect(MAX_LAYER_TILES).toBe(16);
  });
  it('las claves de la zona incluyen sus teselas solo si se bajó con detalle', () => {
    const z = { lat: -40, lon: -71.4, radiusKm: 10, maxZoom: 10 };
    const plain = zoneKeys(z);
    const withLayers = zoneKeys({ ...z, layers: true });
    expect(withLayers.length).toBeGreaterThan(plain.length);
    expect(withLayers.filter((k) => k.includes('/layers/')).length).toBe(withLayers.length - plain.length);
    expect(plain.some((k) => k.includes('/layers/'))).toBe(false);
  });
  it('junta las teselas de bosque vecinas por cobertura', () => {
    const tile = (poly: number[]): EcoregionData => ({ generatedAt: '', source: '', biomes: { 1: 'Bosque' }, ecoregions: [{ id: 7, name: 'Bosque de lenga', nameEs: 'Bosque de lenga', biome: 1, color: '#2e7d32', polys: [[poly]] }] });
    const m = mergeForest([tile([0, 0, 1, 0, 1, 1, 0, 0]), tile([2, 0, 3, 0, 3, 1, 2, 0])])!;
    expect(m.ecoregions).toHaveLength(1);
    expect(m.ecoregions[0]!.polys).toHaveLength(2);
    expect(mergeForest([])).toBeNull();
  });
});

describe('geología: paquetes de los demás países', () => {
  const load = async (cc: string) => {
    const mod = (await import(`../../../public/data/geology-${cc}.json`)).default as unknown as GeologyData;
    return { data: mod, idx: { detail: [], base: boxedFrom(mod), credits: [] } as GeologyIndex };
  };
  it.each(['AR', 'CL', 'PE', 'UY', 'BO', 'PY'])('%s: formato válido, con cita y colores', async (cc) => {
    const { data } = await load(cc);
    expect(data.source).toBeTruthy();
    expect(data.units.length).toBeGreaterThan(5);
    for (const p of data.polys) {
      expect(data.units[p.u]).toBeTruthy();
      for (const r of p.p) {
        expect(r.length % 2).toBe(0);
        expect(r.length).toBeGreaterThanOrEqual(8);
      }
    }
    expect(JSON.stringify(data)).not.toMatch(/�|Ã/);
  });
  it('puntos conocidos', async () => {
    const at = async (cc: string, lat: number, lon: number) => geologyAt((await load(cc)).idx, lat, lon)?.unit;
    expect((await at('CL', -39.28, -71.98))?.name).toMatch(/Q1g1/); // Pucón
    expect((await at('CL', -33.05, -71.62))?.to).toBe('Jurásico'); // Valparaíso
    expect(await at('PE', -13.52, -71.97)).toBeTruthy(); // Cusco
    expect(await at('PE', -12.05, -77.04)).toBeTruthy(); // Lima
    expect((await at('BO', -16.5, -68.15))?.name).toMatch(/Devónico/); // La Paz
    expect((await at('PY', -25.3, -57.6))?.name).toMatch(/Cretácico/); // Asunción
    expect((await at('PY', -25.51, -54.61))?.name).toMatch(/basálticas/); // Ciudad del Este
    expect((await at('UY', -33.12, -58.3))?.name).toMatch(/Fray Bentos/);
  });
});

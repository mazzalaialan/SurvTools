import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { hasLocal, hasLocalParks, localByCountry, localRiversNearStations, parksByCountry, parksById, selectorToPredicate, stationsKey } from './osm-local.mjs';

const dirs = [];
afterEach(() => {
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
  delete process.env.OSM_LOCAL_DIR;
  delete process.env.OSM_LOCAL;
});

describe('filtros de OpenStreetMap (los mismos que se le pasan a Overpass)', () => {
  it('igualdad, regex, existencia de la clave y negaciones', () => {
    assert.equal(selectorToPredicate('nwr["amenity"="fuel"]')({ amenity: 'fuel' }), true);
    assert.equal(selectorToPredicate('nwr["amenity"="fuel"]')({ amenity: 'pharmacy' }), false);
    const hospital = selectorToPredicate('nwr["amenity"~"^(hospital|clinic)$"]');
    assert.equal(hospital({ amenity: 'clinic' }), true);
    assert.equal(hospital({ amenity: 'hospital_ship' }), false);
    assert.equal(hospital({}), false);
    const withPhone = selectorToPredicate('nwr["amenity"~"^(police|doctors)$"]["phone"]');
    assert.equal(withPhone({ amenity: 'police', phone: '911' }), true);
    assert.equal(withPhone({ amenity: 'police' }), false);
    // `!=` y `!~` (muelles: no privados; amarras: «mooring» distinto de «no»).
    const pier = selectorToPredicate('nwr["man_made"="pier"]["name"]["access"!~"^(private|no)$"]');
    assert.equal(pier({ man_made: 'pier', name: 'Muelle', access: 'yes' }), true);
    assert.equal(pier({ man_made: 'pier', name: 'Muelle', access: 'private' }), false);
    assert.equal(pier({ man_made: 'pier', name: 'Muelle' }), true);
    assert.equal(pier({ man_made: 'pier', access: 'yes' }), false);
    const mooring = selectorToPredicate('nwr["mooring"]["mooring"!="no"]');
    assert.equal(mooring({ mooring: 'yes' }), true);
    assert.equal(mooring({ mooring: 'no' }), false);
    assert.throws(() => selectorToPredicate('way(around:10,0,0)'), /no soportado/);
  });
});

describe('archivo local por país', () => {
  function withFile(lines) {
    const dir = mkdtempSync(join(tmpdir(), 'osm-local-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'places-UY.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    process.env.OSM_LOCAL_DIR = dir;
  }
  it('lee los elementos con la forma de Overpass, con los ids de áreas traducidos', async () => {
    withFile([
      { id: 'n10', lat: -34.9, lon: -56.1, tags: { amenity: 'fire_station' } },
      { id: 'a246', lat: -34.8, lon: -56.2, tags: { amenity: 'police' } }, // área de un camino (123 × 2)
      { id: 'a247', lat: -34.7, lon: -56.3, tags: { amenity: 'hospital' } }, // área de una relación (123 × 2 + 1)
      { id: 'n11', lat: -34.6, lon: -56.4, tags: { amenity: 'fuel' } },
    ]);
    assert.equal(hasLocal('UY'), true);
    assert.equal(hasLocal('AR'), false);
    const els = await localByCountry('UY', ['nwr["amenity"="fire_station"]', 'nwr["amenity"="police"]', 'nwr["amenity"="hospital"]']);
    assert.deepEqual(els.map((e) => `${e.type}/${e.id}`), ['node/10', 'way/123', 'relation/123']);
    assert.equal(els[1].lat, -34.8);
  });
  it('OSM_LOCAL=0 lo apaga (se usa Overpass)', () => {
    withFile([]);
    process.env.OSM_LOCAL = '0';
    assert.equal(hasLocal('UY'), false);
  });
});

describe('áreas protegidas y ríos cerca de las estaciones', () => {
  function dirWith(files) {
    const dir = mkdtempSync(join(tmpdir(), 'osm-local-'));
    dirs.push(dir);
    for (const [name, lines] of Object.entries(files)) writeFileSync(join(dir, name), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    process.env.OSM_LOCAL_DIR = dir;
  }
  it('los filtros respetan el tipo (relation/way) y la marca ,i de mayúsculas', () => {
    const rel = selectorToPredicate('relation["boundary"~"^(protected_area|national_park)$"]["operator"~"SERNAP|Servicio Nacional",i]');
    assert.equal(rel({ boundary: 'national_park', operator: 'sernap' }, 'relation'), true);
    assert.equal(rel({ boundary: 'national_park', operator: 'sernap' }, 'way'), false);
    assert.equal(rel({ boundary: 'national_park', operator: 'otro' }, 'relation'), false);
    assert.equal(selectorToPredicate('nwr["leisure"="nature_reserve"]["name"]')({ leisure: 'nature_reserve', name: 'X' }, 'way'), true);
  });
  it('las áreas protegidas salen en el orden de Overpass (caminos antes que relaciones) y se piden por id', async () => {
    dirWith({
      'parks-UY.jsonl': [
        { type: 'relation', id: 5, tags: { boundary: 'protected_area', name: 'Igual' }, members: [] },
        { type: 'way', id: 9, tags: { boundary: 'protected_area', name: 'Igual' }, geometry: [] },
        { type: 'way', id: 2, tags: { leisure: 'nature_reserve', name: 'Otra' }, geometry: [] },
      ],
    });
    assert.equal(hasLocalParks('UY'), true);
    const els = await parksByCountry('UY', ['nwr["boundary"="protected_area"]["name"]', 'nwr["leisure"="nature_reserve"]["name"]']);
    assert.deepEqual(els.map((e) => `${e.type}/${e.id}`), ['way/2', 'way/9', 'relation/5']);
    assert.deepEqual((await parksById('UY', 'relation', [5])).map((e) => e.id), [5]);
    assert.deepEqual(await parksById('UY', 'way', []), []);
  });
  it('los ríos locales solo valen si se armaron con la misma lista de estaciones y radio', async () => {
    const stations = [{ lat: -34.6, lon: -58.4 }, { lat: -26.8, lon: -65.2 }];
    dirWith({ 'rivers-near-stations.jsonl': [{ meta: { stations: stationsKey(stations), radiusM: 12000 } }, { type: 'way', id: 1, tags: { name: 'Río X', waterway: 'river' }, geometry: [] }] });
    assert.equal((await localRiversNearStations(stations, 12000)).length, 1);
    assert.equal(await localRiversNearStations(stations, 5000), null);
    assert.equal(await localRiversNearStations([...stations, { lat: 0, lon: 0 }], 12000), null);
  });
});

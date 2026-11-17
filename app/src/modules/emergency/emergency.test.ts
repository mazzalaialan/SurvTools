import { describe, expect, it } from 'vitest';
import data from './emergency-data.json';
import { mergeNearby, nearestPerKind, nearestRadio, officialNearby, type EmergencyData, type NearbyPlace } from './data';
import { dialable, mapsUrl } from './national';
import { completeAddress, describeAddress, sameStreet, streetKey, osmKind, parseNearby, parseSurroundings } from './osm';

const D = data as EmergencyData;

describe('datos oficiales incluidos', () => {
  it('cuarteles de todo el país, comisarías y salud de la Provincia de Buenos Aires, radios', () => {
    expect(D.fire.length).toBeGreaterThan(1000);
    expect(D.police.length).toBeGreaterThan(300);
    expect(D.health.length).toBeGreaterThan(2000);
    expect(D.radio.find((r) => r.call === 'LRA 30')).toMatchObject({ am: 590, fm: 95.5 });
  });

  it('cerca de Bariloche aparece algún cuartel; la emisora más cercana es LRA 30', () => {
    const near = officialNearby(D, -41.1335, -71.3103, 15_000);
    expect(near.some((p) => p.kind === 'fire')).toBe(true);
    expect(near.every((p) => p.distance <= 15_000)).toBe(true);
    expect(nearestRadio(D, -41.1335, -71.3103)[0]!.call).toBe('LRA 30');
  });

  it('en zona agreste, lo más cercano de cada tipo aunque esté lejos', () => {
    // Meseta de Somuncurá: no hay nada a menos de 30 km.
    const all = officialNearby(D, -41.3, -67.2, Infinity);
    expect(all.filter((p) => p.distance <= 30_000)).toHaveLength(0);
    const nearest = nearestPerKind(all, 1);
    const fire = nearest.find((p) => p.kind === 'fire')!;
    expect(fire.distance).toBeGreaterThan(30_000);
    expect(nearest.filter((p) => p.kind === 'fire')).toHaveLength(1);
    // Ordenados del más cercano al más lejano.
    expect(nearest.map((p) => p.distance)).toEqual([...nearest.map((p) => p.distance)].sort((a, b) => a - b));
  });
});

describe('unión de fuentes', () => {
  const place = (over: Partial<NearbyPlace>): NearbyPlace => ({
    key: 'k', kind: 'fire', name: 'X', phone: '', address: '', lat: -34.6, lon: -58.4, distance: 100, source: 'official', detail: '', ...over,
  });

  it('el mismo cuartel en las dos fuentes queda uno, con el teléfono de OpenStreetMap', () => {
    const merged = mergeNearby([place({ key: 'o' })], [place({ key: 'osm', source: 'osm', phone: '100', lat: -34.6005, distance: 120 }), place({ key: 'far', source: 'osm', lat: -34.7, distance: 11_000 })]);
    expect(merged.map((p) => p.key)).toEqual(['o', 'far']);
    expect(merged[0]!.phone).toBe('100');
  });

  it('un hospital y un centro de salud en el mismo lugar cuentan como el mismo', () => {
    const merged = mergeNearby([place({ kind: 'hospital' })], [place({ kind: 'medical', source: 'osm', key: 'm' })]);
    expect(merged).toHaveLength(1);
  });
});

describe('teléfonos y mapas', () => {
  it('para marcar: solo dígitos, y el primero si hay varios', () => {
    expect(dialable('0800-333-0160')).toBe('08003330160');
    expect(dialable('0336-5408830/36')).toBe('03365408830');
    expect(dialable('+54 11 4361 4444')).toBe('+541143614444');
    expect(dialable('-')).toBe('');
    // Números cortos de celular (Chile, Uruguay).
    expect(dialable('*4141')).toBe('*4141');
  });

  it('Google Maps: por dirección o, si no hay, por coordenadas', () => {
    expect(mapsUrl('Pellegrini 1151, Carhué', null, null)).toBe('https://www.google.com/maps/search/?api=1&query=Pellegrini%201151%2C%20Carhu%C3%A9');
    expect(mapsUrl('', -34.6, -58.38)).toContain('query=-34.600000%2C-58.380000');
    expect(mapsUrl('', null, null)).toBeNull();
  });
});

describe('OpenStreetMap', () => {
  it('tipo de lugar según sus etiquetas', () => {
    expect(osmKind({ amenity: 'police' })).toBe('police');
    expect(osmKind({ emergency: 'ambulance_station' })).toBe('medical');
    expect(osmKind({ office: 'government', name: 'Defensa Civil Municipal' })).toBe('civilDefense');
    expect(osmKind({ amenity: 'school' })).toBeNull();
  });

  it('lugares cercanos con teléfono, dirección y distancia', () => {
    const [p] = parseNearby(
      [{ type: 'way', id: 7, center: { lat: -34.61, lon: -58.38 }, tags: { amenity: 'fire_station', name: 'Cuartel 1', 'contact:phone': '100', 'addr:street': 'Av. Siempreviva', 'addr:housenumber': '742' } }],
      -34.6,
      -58.38,
    );
    expect(p).toMatchObject({ key: 'osm-way-7', kind: 'fire', phone: '100', address: 'Av. Siempreviva 742' });
    expect(p!.distance).toBeGreaterThan(1000);
  });

  it('dirección, calles cercanas, ruta y mojón', () => {
    expect(describeAddress({ address: { road: 'Av. Corrientes', house_number: '1000', suburb: 'San Nicolás', city: 'Buenos Aires' } })).toEqual({
      address: 'Av. Corrientes 1000',
      locality: 'San Nicolás, Buenos Aires',
      road: 'Av. Corrientes',
      houseNumber: '1000',
    });
    const s = parseSurroundings(
      [
        { type: 'way', id: 1, center: { lat: -41.2436, lon: -71.3004 }, tags: { highway: 'trunk', ref: 'RN 40', name: 'Ruta Nacional 40' } },
        { type: 'way', id: 2, center: { lat: -41.2437, lon: -71.3 }, tags: { highway: 'residential', name: 'Los Coihues' } },
        { type: 'way', id: 3, center: { lat: -41.2436, lon: -71.3004 }, tags: { highway: 'footway', name: 'Sendero' } },
        { type: 'node', id: 4, lat: -41.25, lon: -71.3, tags: { highway: 'milestone', distance: '1990' } },
      ],
      -41.2435,
      -71.3003,
      'Ruta Nacional 40',
    );
    expect(s.roads).toEqual(['RN 40']);
    expect(s.nearbyStreets).toEqual(['Los Coihues']);
    expect(s.milestone?.km).toBe('1990');
  });
});

describe('calle: mismo nombre aunque se escriba distinto', () => {
  it('ignora tildes, mayúsculas y el tipo de calle', () => {
    expect(streetKey('Avenida Hipólito Yrigoyen')).toBe('hipolito yrigoyen');
    expect(sameStreet('Av. Hipólito Yrigoyen', 'Hipolito Yrigoyen')).toBe(true);
    expect(sameStreet('Bartolomé Mitre', 'Mitre')).toBe(true);
    expect(sameStreet('Calle 25 de Mayo', '25 de Mayo')).toBe(true);
    expect(sameStreet('Moreno', 'Rolando')).toBe(false);
    expect(sameStreet('', 'Moreno')).toBe(false);
  });
  it('de varias puertas cercanas elige la más cercana de la calle donde estás, no la de una que cruza', () => {
    const els = [
      { type: 'node' as const, id: 1, lat: -41.13351, lon: -71.3103, tags: { 'addr:street': 'Rolando', 'addr:housenumber': '10' } }, // ~11 m, pero es otra calle
      { type: 'node' as const, id: 2, lat: -41.1337, lon: -71.3103, tags: { 'addr:street': 'Moreno', 'addr:housenumber': '248' } }, // ~22 m
      { type: 'node' as const, id: 3, lat: -41.134, lon: -71.3103, tags: { 'addr:street': 'Moreno', 'addr:housenumber': '260' } },
    ];
    expect(parseSurroundings(els, -41.1335, -71.3103, 'Calle Moreno').nearestNumber).toMatchObject({ number: '248', street: 'Moreno' });
    // Una puerta a 140 m también cuenta (una cuadra y media), a 200 m no.
    const far = [{ type: 'node' as const, id: 4, lat: -41.1348, lon: -71.3103, tags: { 'addr:street': 'Moreno', 'addr:housenumber': '300' } }];
    expect(parseSurroundings(far, -41.1335, -71.3103, 'Moreno').nearestNumber?.number).toBe('300');
    const tooFar = [{ type: 'node' as const, id: 5, lat: -41.1355, lon: -71.3103, tags: { 'addr:street': 'Moreno', 'addr:housenumber': '300' } }];
    expect(parseSurroundings(tooFar, -41.1335, -71.3103, 'Moreno').nearestNumber).toBeNull();
  });
  it('con otro nombre para la misma calle igual da la altura', () => {
    const around = { roads: [] as string[], milestone: null, nearestNumber: { street: 'Hipólito Yrigoyen', number: '120', distance: 40 } };
    expect(completeAddress({ address: 'Avenida Hipólito Yrigoyen', houseNumber: '', road: 'Avenida Hipólito Yrigoyen' }, around, 'es')).toBe('Avenida Hipólito Yrigoyen 120 (aprox.)');
  });
});

describe('altura de la calle o kilómetro de la ruta en la dirección', () => {
  const none = { nearestNumber: null, roads: [] as string[], milestone: null };
  it('con número de puerta exacto no cambia nada', () => {
    expect(completeAddress({ address: 'Mitre 250', houseNumber: '250', road: 'Mitre' }, none, 'es')).toBe('Mitre 250');
  });
  it('sin número exacto, usa el de la puerta más cercana de la misma calle y lo marca aproximado', () => {
    const around = { ...none, nearestNumber: { street: 'mitre', number: '248', distance: 30 } };
    expect(completeAddress({ address: 'Mitre', houseNumber: '', road: 'Mitre' }, around, 'es')).toBe('Mitre 248 (aprox.)');
    expect(completeAddress({ address: 'Mitre', houseNumber: '', road: 'Mitre' }, around, 'en')).toBe('Mitre 248 (approx.)');
    // Un número de otra calle no sirve.
    expect(completeAddress({ address: 'Moreno', houseNumber: '', road: 'Moreno' }, around, 'es')).toBe('Moreno');
  });
  it('en una ruta, da el kilómetro del mojón más cercano', () => {
    const around = { ...none, roads: ['RN 40'], milestone: { km: '1990', road: 'RN 40', distance: 800 } };
    expect(completeAddress({ address: 'Ruta Nacional 40', houseNumber: '', road: 'Ruta Nacional 40' }, around, 'es')).toBe('Ruta Nacional 40 km 1990 (aprox.)');
    expect(completeAddress({ address: '', houseNumber: '', road: '' }, around, 'es')).toBe('RN 40 km 1990 (aprox.)');
    // Un mojón a más de 3 km no cuenta.
    expect(completeAddress({ address: 'Ruta Nacional 40', houseNumber: '', road: 'Ruta Nacional 40' }, { ...around, milestone: { km: '1990', road: '', distance: 4000 } }, 'es')).toBe('Ruta Nacional 40');
  });
});

describe('lo más cercano de cada tipo', () => {
  const p = (kind: NearbyPlace['kind'], distance: number): NearbyPlace => ({
    key: `${kind}${distance}`, kind, name: '', phone: '', address: '', lat: 0, lon: 0, distance, source: 'official', detail: '',
  });

  it('hospitales y ambulancias cuentan juntos como salud', () => {
    const out = nearestPerKind([p('fire', 90), p('hospital', 50), p('medical', 40), p('fire', 10), p('police', 300)], 1);
    expect(out.map((x) => x.key)).toEqual(['fire10', 'medical40', 'police300']);
  });
});

describe('datos oficiales de todo el país (IGN)', async () => {
  const { default: data } = await import('./emergency-data.json');
  const near = (list: { lat: number; lon: number }[], lat: number, lon: number, km: number) =>
    list.filter((p) => Math.hypot((p.lat - lat) * 111, (p.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180)) < km).length;

  it('hay policía y salud fuera de la Provincia de Buenos Aires', () => {
    expect(data.police.length).toBeGreaterThan(3000);
    expect(data.health.length).toBeGreaterThan(8000);
    // Córdoba, Rosario y Bariloche.
    for (const [lat, lon] of [
      [-31.42, -64.19],
      [-32.95, -60.65],
      [-41.13, -71.31],
    ] as const) {
      expect(near(data.police, lat, lon, 10)).toBeGreaterThan(3);
      expect(near(data.health, lat, lon, 10)).toBeGreaterThan(3);
    }
  });
});

import { distanceMeters } from '@/core/geo/geo';
import type { ContactKind } from '@/core/model/types';
import type { FuelType, NearbyPlace } from './data';
import { NAUTICAL_LABEL } from './nautical';
import { CATEGORY_KIND, type ServiceCategory } from './services';

/**
 * Consultas a OpenStreetMap, solo con conexión y solo cuando el usuario lo
 * pide (políticas de uso de Overpass y Nominatim: pocas consultas y
 * puntuales).
 * - Overpass: comisarías, bomberos, hospitales y centros de salud cercanos (y,
 *   con su filtro, los servicios: estaciones, farmacias, agua, refugios…);
 *   calles, rutas y mojones alrededor de un punto.
 * - Nominatim: dirección de un punto.
 */

/** Servidores públicos de Overpass: si el principal está saturado o rechaza el pedido, se prueba el espejo. */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const TIMEOUT_MS = 30_000;
/** Hasta dónde se busca el número de puerta más cercano (una cuadra y media): igual que la base del servidor. */
export const NUMBER_M = 150;

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Los dos servidores a la vez: gana el primero que responde (antes se probaba uno y, si fallaba, el otro: hasta 60 s). */
async function overpass(query: string, timeoutMs = TIMEOUT_MS): Promise<OsmElement[]> {
  const controllers = OVERPASS.map(() => new AbortController());
  const attempts = OVERPASS.map(async (url, i) => {
    const timer = setTimeout(() => controllers[i]!.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: controllers[i]!.signal });
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      return ((await res.json()) as { elements: OsmElement[] }).elements;
    } finally {
      clearTimeout(timer);
    }
  });
  try {
    return await Promise.any(attempts);
  } finally {
    // Ya hay respuesta (o fallaron las dos): se corta lo que quede abierto.
    for (const c of controllers) c.abort();
  }
}

const pos = (e: OsmElement) => (e.lat !== undefined ? { lat: e.lat, lon: e.lon! } : e.center ?? null);

/**
 * ¿Es un servicio náutico? Combustible para embarcaciones (`waterway=fuel`, o una estación con `boat`/`marine=yes`), marinas,
 * rampas, guarderías y alquiler de embarcaciones, talleres y comercios náuticos, amarras y boyas (sirven para kayak y remo en un río).
 * Muelles: solo los que tienen nombre y no son privados (hay miles, casi sin nombre y muchos privados). Las mismas etiquetas que usa tools/services-data/build.mjs.
 */
export function isNautical(tags: Record<string, string>): boolean {
  // Un muelle sin nombre o privado no entra por ninguna vía (ni siquiera porque tenga `mooring=*`).
  if (tags.man_made === 'pier' && !isNamedPublicPier(tags)) return false;
  return (
    tags.waterway === 'fuel' ||
    (tags.amenity === 'fuel' && (tags.boat === 'yes' || tags.marine === 'yes')) ||
    tags.leisure === 'marina' ||
    tags.leisure === 'slipway' ||
    tags.amenity === 'boat_storage' ||
    tags.amenity === 'boat_rental' ||
    tags.shop === 'boat' ||
    tags.shop === 'boat_repair' ||
    tags.shop === 'ship_chandler' ||
    tags.craft === 'boatbuilder' ||
    (!!tags.mooring && tags.mooring !== 'no') ||
    tags['seamark:type'] === 'mooring' ||
    isNamedPublicPier(tags)
  );
}

/** Un muelle con nombre y que no esté marcado como privado: los demás son miles, sin nombre y muchos privados. */
export function isNamedPublicPier(tags: Record<string, string>): boolean {
  return tags.man_made === 'pier' && !!tags.name && tags.access !== 'private' && tags.access !== 'no';
}

/** Qué es, para mostrar en la lista. */
export function nauticalType(tags: Record<string, string>): string {
  if (tags.waterway === 'fuel' || tags.amenity === 'fuel') return NAUTICAL_LABEL.fuel;
  if (tags.leisure === 'marina') return NAUTICAL_LABEL.marina;
  if (tags.leisure === 'slipway') return NAUTICAL_LABEL.slipway;
  if (tags.amenity === 'boat_storage') return NAUTICAL_LABEL.storage;
  if (tags.amenity === 'boat_rental') return NAUTICAL_LABEL.rental;
  if (tags.man_made === 'pier') return NAUTICAL_LABEL.pier;
  if (tags.shop || tags.craft) return NAUTICAL_LABEL.shop;
  return NAUTICAL_LABEL.mooring;
}

export function osmKind(tags: Record<string, string>): ContactKind | null {
  if (tags.amenity === 'police') return 'police';
  if (tags.amenity === 'fire_station') return 'fire';
  if (isNautical(tags)) return 'nautical';
  if (tags.amenity === 'fuel') return 'fuel';
  if (tags.amenity === 'pharmacy' || tags.healthcare === 'pharmacy') return 'pharmacy';
  if (tags.emergency === 'defibrillator') return 'aed';
  if (tags.amenity === 'veterinary') return 'vet';
  if (tags.shop === 'tyres') return 'tyres';
  if (tags.shop === 'car_repair') return 'carRepair';
  if (['drinking_water', 'water_point'].includes(tags.amenity ?? '') || tags.man_made === 'water_tap' || tags.natural === 'spring') return 'water';
  if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut' || tags.amenity === 'shelter') return 'shelter';
  if (tags.amenity === 'atm' || tags.amenity === 'bank') return 'atm';
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'clinic' || tags.amenity === 'doctors' || tags.emergency === 'ambulance_station') return 'medical';
  if (/defensa civil|protecci[oó]n civil/i.test(tags.name ?? '')) return 'civilDefense';
  return null;
}

/** Combustibles de una estación según sus etiquetas `fuel:*=yes` (como en tools/fuel-data). */
export function osmFuels(tags: Record<string, string>): FuelType[] {
  const found = new Set<FuelType>();
  for (const [k, v] of Object.entries(tags)) {
    if (v !== 'yes' || !k.startsWith('fuel:')) continue;
    const f = k.slice(5);
    if (/^(octane_\d+|e\d+|gasoline|petrol)$/.test(f)) found.add('gasoline');
    else if (/^(diesel|gtl_diesel|hgv_diesel|biodiesel)$/.test(f)) found.add('diesel');
    else if (f === 'cng') found.add('cng');
    else if (f === 'lpg') found.add('lpg');
  }
  return (['gasoline', 'diesel', 'cng', 'lpg'] as const).filter((f) => found.has(f));
}

/**
 * Lo que se le pide a Overpass de cada categoría de servicios: las mismas
 * etiquetas que usa tools/services-data/build.mjs para los archivos sin conexión.
 */
export const NAUTICAL_SELECTORS = [
  'nwr["waterway"="fuel"]',
  'nwr["amenity"="fuel"]["boat"="yes"]',
  'nwr["amenity"="fuel"]["marine"="yes"]',
  'nwr["leisure"="marina"]',
  'nwr["leisure"="slipway"]',
  'nwr["amenity"="boat_storage"]',
  'nwr["amenity"="boat_rental"]',
  'nwr["shop"~"^(boat|boat_repair|ship_chandler)$"]',
  'nwr["craft"="boatbuilder"]',
  'nwr["mooring"]["mooring"!="no"]',
  'nwr["seamark:type"="mooring"]',
  'nwr["man_made"="pier"]["name"]["access"!~"^(private|no)$"]',
];
const SHELTER_TYPES = 'basic_hut|lean_to|rock_shelter|weather_shelter';
export const SERVICE_SELECTORS: Record<ServiceCategory, string[]> = {
  fuel: ['nwr["amenity"="fuel"]'],
  tyres: ['nwr["shop"="tyres"]'],
  repair: ['nwr["shop"="car_repair"]'],
  pharmacy: ['nwr["amenity"="pharmacy"]', 'nwr["healthcare"="pharmacy"]'],
  aed: ['nwr["emergency"="defibrillator"]'],
  vet: ['nwr["amenity"="veterinary"]'],
  water: ['nwr["amenity"="drinking_water"]', 'nwr["amenity"="water_point"]', 'nwr["man_made"="water_tap"]["drinking_water"="yes"]', 'nwr["natural"="spring"]'],
  shelter: ['nwr["tourism"="alpine_hut"]', 'nwr["tourism"="wilderness_hut"]', `nwr["amenity"="shelter"]["shelter_type"~"^(${SHELTER_TYPES})$"]`],
  atm: ['nwr["amenity"="atm"]', 'nwr["amenity"="bank"]["atm"="yes"]'],
  nautical: NAUTICAL_SELECTORS,
};

/** Tipo que se muestra de un servicio (como en los archivos sin conexión): bandera, red del cajero, clase de refugio o de agua. */
export function serviceDetail(kind: ContactKind, tags: Record<string, string>): string {
  if (kind === 'water') {
    if (tags.natural !== 'spring') return tags.amenity === 'water_point' ? 'Punto de agua' : 'Agua potable';
    return tags.drinking_water === 'yes' ? 'Vertiente (potable)' : tags.drinking_water === 'no' ? 'Vertiente (no potable)' : 'Vertiente (potabilidad desconocida)';
  }
  if (kind === 'shelter') return tags.tourism === 'alpine_hut' ? 'Refugio de montaña' : tags.tourism === 'wilderness_hut' ? 'Refugio no atendido' : 'Vivac o reparo';
  if (kind === 'atm') return tags.network ?? tags.brand ?? tags.operator ?? '';
  if (kind === 'nautical') return nauticalType(tags);
  return tags.brand ?? tags.operator ?? '';
}

/** Aclaración de un servicio: dónde está el desfibrilador; altura y capacidad de un refugio. */
function serviceNote(kind: ContactKind, tags: Record<string, string>): string {
  if (kind === 'aed') return tags['defibrillator:location'] ?? tags['defibrillator:location:es'] ?? tags.description ?? '';
  if (kind === 'nautical' && tags.man_made === 'pier') return 'Confirmá que sea de uso público';
  if (kind === 'shelter') return [tags.ele && `${tags.ele} m`, tags.capacity && `capacidad ${tags.capacity}`].filter(Boolean).join(' · ');
  return '';
}

const SERVICE_KIND_SET = new Set<ContactKind>(Object.values(CATEGORY_KIND));

export function osmAddress(tags: Record<string, string>): string {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  return [street, tags['addr:city'] ?? tags['addr:suburb']].filter(Boolean).join(', ');
}

export function parseNearby(elements: OsmElement[], lat: number, lon: number): NearbyPlace[] {
  const out: NearbyPlace[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    const kind = osmKind(tags);
    const p = pos(e);
    if (!kind || !p) continue;
    // Un punto de agua marcado como no potable no sirve.
    if (kind === 'water' && tags.natural !== 'spring' && tags.drinking_water === 'no') continue;
    const service = SERVICE_KIND_SET.has(kind);
    const fuels = kind === 'fuel' ? osmFuels(tags) : [];
    const note = service ? serviceNote(kind, tags) : '';
    out.push({
      key: `osm-${e.type}-${e.id}`,
      kind,
      name: tags.name ?? tags.official_name ?? (kind === 'fuel' ? (tags.brand ?? '') : ''),
      phone: tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile'] ?? '',
      address: osmAddress(tags),
      lat: p.lat,
      lon: p.lon,
      distance: distanceMeters({ lat, lon }, p),
      source: 'osm',
      detail: service ? serviceDetail(kind, tags) : (tags.healthcare ?? tags.amenity ?? tags.emergency ?? ''),
      ...(fuels.length > 0 && { fuels }),
      ...(note && { note: note.slice(0, 160) }),
    });
  }
  return out;
}

/**
 * `service`: también esa categoría de servicios (solo la que se está mirando:
 * hay muchos y agrandan la consulta).
 */
export async function fetchOsmNearby(lat: number, lon: number, radiusM: number, service: ServiceCategory | null = null, serverUrl?: string): Promise<NearbyPlace[]> {
  // Primero la base de tu servidor (tools/osm-index): milisegundos y sin servicios públicos; si no está o no responde, Overpass.
  const local = await fetchLocalNearby(serverUrl, lat, lon, radiusM, service);
  if (local) return parseNearby(local, lat, lon);
  const around = `(around:${Math.round(radiusM)},${lat.toFixed(5)},${lon.toFixed(5)})`;
  const query = `[out:json][timeout:25];(
    nwr["amenity"~"^(police|fire_station|hospital|clinic)$"]${around};
    nwr["emergency"="ambulance_station"]${around};
    nwr["office"="government"]["name"~"Defensa Civil|Protecci.n Civil",i]${around};${service ? SERVICE_SELECTORS[service].map((sel) => `
    ${sel}${around};`).join('') : ''}
  );out center tags;`;
  return parseNearby(await overpass(query), lat, lon);
}

/** Los lugares cercanos de la base propia del servidor; `null` si no hay servidor, no tiene la base o no responde. */
export async function fetchLocalNearby(serverUrl: string | undefined, lat: number, lon: number, radiusM: number, service: ServiceCategory | null, timeoutMs = 8000): Promise<OsmElement[] | null> {
  const base = serverUrl?.trim().replace(/\/+$/, '');
  if (!base) return null;
  try {
    const params = new URLSearchParams({ lat: lat.toFixed(5), lon: lon.toFixed(5), radius: String(Math.round(radiusM)) });
    if (service) params.set('service', service);
    const res = await fetch(`${base}/api/osm/nearby?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const json = (await res.json()) as { elements?: OsmElement[] };
    return Array.isArray(json.elements) ? json.elements : null;
  } catch {
    return null;
  }
}

// ---------- Dónde estoy, para los socorristas ----------

export interface LocationInfo {
  /** Calle y altura según Nominatim, o el nombre del lugar. */
  address: string;
  locality: string;
  /** Las dos calles con nombre más cercanas además de la propia. */
  nearbyStreets: string[];
  /** Rutas cercanas (p. ej. "RN 40"). */
  roads: string[];
  /** El número de puerta más cercano (a menos de 150 m), para dar la altura aproximada cuando no hay uno exacto. */
  nearestNumber: { street: string; number: string; distance: number } | null;
  /** Mojón kilométrico más cercano, si hay alguno cargado. */
  milestone: { km: string; road: string; distance: number } | null;
}

interface NominatimReverse {
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

export function describeAddress(r: NominatimReverse): { address: string; locality: string; road: string; houseNumber: string; country: string } {
  const a = r.address ?? {};
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? '';
  const address = [road, a.house_number].filter(Boolean).join(' ') || r.name || '';
  const locality = [a.suburb ?? a.neighbourhood ?? a.hamlet, a.city ?? a.town ?? a.village ?? a.municipality, a.state].filter(Boolean).join(', ');
  return { address, locality, road, houseNumber: a.house_number ?? '', country: a.country_code ?? '' };
}

export function parseSurroundings(elements: OsmElement[], lat: number, lon: number, ownRoad: string): Omit<LocationInfo, 'address' | 'locality'> {
  const here = { lat, lon };
  let nearestNumber: LocationInfo['nearestNumber'] = null;
  const streets = new Map<string, number>();
  const roads = new Map<string, number>();
  let milestone: LocationInfo['milestone'] = null;
  for (const e of elements) {
    const tags = e.tags ?? {};
    const p = pos(e);
    if (!p) continue;
    const d = distanceMeters(here, p);
    if (tags['addr:housenumber'] && tags['addr:street'] && d <= NUMBER_M) {
      // La puerta más cercana de la calle donde estás (la de una calle que cruza no sirve); sin calle conocida, la más cercana.
      const onOwnRoad = !ownRoad || sameStreet(ownRoad, tags['addr:street']);
      if (onOwnRoad && (!nearestNumber || d < nearestNumber.distance)) nearestNumber = { street: tags['addr:street'], number: tags['addr:housenumber'], distance: d };
      continue;
    }
    if (tags.highway === 'milestone') {
      const km = tags.distance ?? tags.pk ?? tags.name ?? '';
      if (km && (!milestone || d < milestone.distance)) milestone = { km, road: tags.ref ?? tags['highway:ref'] ?? '', distance: d };
      continue;
    }
    if (tags.ref && /^(motorway|trunk|primary|secondary|tertiary)/.test(tags.highway ?? '')) {
      for (const ref of tags.ref.split(';').map((s) => s.trim())) if (!roads.has(ref) || d < roads.get(ref)!) roads.set(ref, d);
    }
    if (tags.name && tags.name !== ownRoad && !/^(footway|path|steps|cycleway|service)$/.test(tags.highway ?? '')) {
      if (!streets.has(tags.name) || d < streets.get(tags.name)!) streets.set(tags.name, d);
    }
  }
  const byDistance = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  return { nearbyStreets: byDistance(streets).slice(0, 2), roads: byDistance(roads).slice(0, 2), nearestNumber, milestone };
}

/** Nombre de calle sin tildes, sin «Avenida/Calle/Diagonal…» ni puntuación: «Av. Hipólito Yrigoyen» y «Hipólito Yrigoyen» son la misma. */
export function streetKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(avenida|av|calle|boulevard|bulevar|blvd|diagonal|pasaje|pje|peatonal|camino|ruta)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sameStreet(a: string, b: string): boolean {
  const x = streetKey(a);
  const y = streetKey(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));
}

/**
 * La dirección con su altura: la exacta si Nominatim encontró el número de puerta; si no, la de la puerta más cercana de la misma calle
 * (a menos de 150 m, «aprox.»); y en una ruta, el kilómetro del mojón más cercano (a menos de 3 km, «aprox.»).
 */
export function completeAddress(
  own: { address: string; houseNumber: string; road: string },
  around: Pick<LocationInfo, 'nearestNumber' | 'roads' | 'milestone'>,
  lang: string,
  /** Altura de Georef (Argentina), si el servidor la dio. */
  georef: number | null = null,
): string {
  if (own.houseNumber) return own.address;
  const approx = lang.startsWith('en') ? 'approx.' : 'aprox.';
  const n = around.nearestNumber;
  const osm = n && (!own.road || sameStreet(own.road, n.street)) ? n : null;
  // Una puerta de OpenStreetMap a menos de 40 m es lo más preciso; si no, la altura oficial de Georef; si no, la puerta más cercana.
  if (osm && osm.distance <= 40) return `${own.road || osm.street} ${osm.number} (${approx})`;
  if (georef !== null && own.road) return `${own.road} ${georef} (${approx})`;
  if (osm) return `${own.road || osm.street} ${osm.number} (${approx})`;
  const m = around.milestone;
  if (m && m.distance <= 3000 && around.roads.length > 0) return `${own.road || around.roads[0]} km ${m.km} (${approx})`;
  return own.address;
}

/** Altura aproximada de la calle según Georef, vía el servidor propio (solo Argentina); `null` si no se pudo. */
export async function fetchGeorefNumber(serverUrl: string | undefined, lat: number, lon: number, street: string, timeoutMs = 10_000): Promise<number | null> {
  const base = serverUrl?.trim().replace(/\/+$/, '');
  if (!base || !street) return null;
  try {
    const params = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6), street });
    const res = await fetch(`${base}/api/address/ar?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const json = (await res.json()) as { found?: boolean; address?: { number?: number } };
    return json.found && typeof json.address?.number === 'number' ? json.address.number : null;
  } catch {
    return null;
  }
}

/** Plazo para cada consulta de los alrededores: la dirección no espera por ellas y cada una se suma apenas llega. */
const AROUND_TIMEOUT_MS = 30_000;

/**
 * La dirección (Nominatim, rápido) se entrega apenas llega por `onPartial`. Las calles y números de puerta, las rutas y el kilómetro
 * (Overpass) van en tres consultas chicas a la vez: cada una vuelve a llamar a `onPartial` con lo acumulado cuando llega, así lo
 * liviano aparece primero y lo pesado (el mojón a 3 km) se suma después. El resultado final tiene todo.
 */
/** La base propia del servidor (tools/osm-index): rápida y sin depender de servicios públicos. `null` si no hay servidor, no la tiene o no responde. */
export async function fetchLocalAround(serverUrl: string | undefined, lat: number, lon: number, timeoutMs = 5000): Promise<OsmElement[] | null> {
  const base = serverUrl?.trim().replace(/\/+$/, '');
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/osm/around?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const json = (await res.json()) as { elements?: OsmElement[] };
    return Array.isArray(json.elements) ? json.elements : null;
  } catch {
    return null;
  }
}

export async function describeLocation(lat: number, lon: number, lang: string, onPartial?: (info: LocationInfo) => void, serverUrl?: string): Promise<LocationInfo> {
  const params = new URLSearchParams({ format: 'jsonv2', lat: lat.toFixed(6), lon: lon.toFixed(6), zoom: '18', addressdetails: '1', 'accept-language': lang });
  const reversing = fetch(`${NOMINATIM}?${params}`, { signal: AbortSignal.timeout(15_000) })
    .then((r) => (r.ok ? (r.json() as Promise<NominatimReverse>) : {}))
    .catch(() => ({}) as NominatimReverse);
  const at = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const queries = [
    `[out:json][timeout:25];(way(around:120,${at})["highway"]["name"];nwr(around:${NUMBER_M},${at})["addr:housenumber"]["addr:street"];);out center tags;`,
    `[out:json][timeout:25];way(around:400,${at})["highway"]["ref"];out center tags;`,
    `[out:json][timeout:25];node(around:3000,${at})["highway"="milestone"];out center tags;`,
  ];
  let own: { address: string; locality: string; road: string; houseNumber: string; country: string } | null = null;
  let georef: number | null = null;
  const found: OsmElement[] = [];
  const build = (): LocationInfo => {
    const o = own!;
    const around = parseSurroundings(found, lat, lon, o.road);
    return { ...around, address: completeAddress(o, around, lang, georef), locality: o.locality };
  };
  // Primero la base de tu servidor; solo si no está o no responde se consulta a los servicios públicos de OpenStreetMap.
  const arounding = fetchLocalAround(serverUrl, lat, lon).then(async (local) => {
    if (local) {
      found.push(...local);
      if (own) onPartial?.(build());
      return;
    }
    await Promise.all(
      queries.map((q) =>
        overpass(q, AROUND_TIMEOUT_MS)
          .then((els) => {
            found.push(...els);
            // Si la dirección todavía no llegó, se entrega junto con ella más abajo.
            if (own) onPartial?.(build());
          })
          .catch(() => undefined),
      ),
    );
  });
  own = describeAddress(await reversing);
  onPartial?.(build());
  // En Argentina, sin número exacto, la altura oficial de la calle (Georef) en paralelo con las calles de alrededor.
  const georeffing =
    own.country === 'ar' && !own.houseNumber && own.road
      ? fetchGeorefNumber(serverUrl, lat, lon, own.road).then((n) => {
          georef = n;
          if (n !== null) onPartial?.(build());
        })
      : Promise.resolve();
  await Promise.all([arounding, georeffing]);
  return build();
}

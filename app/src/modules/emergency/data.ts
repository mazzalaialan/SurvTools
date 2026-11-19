import type { ContactKind } from '@/core/model/types';
import { distanceMeters } from '@/core/geo/geo';
import type { Country } from '@/core/settings/settings';
import { CountryDataError, loadDataFile, preferNewer } from './dataFile';
import { useSettings } from '@/core/settings/settings';

/**
 * Datos de emergencia incluidos en la app (tools/emergency-data/build.mjs):
 * cuarteles de bomberos de todo el país, comisarías y salud de la Provincia
 * de Buenos Aires, y emisoras de Radio Nacional. Funcionan sin conexión.
 */

export interface Place {
  name: string;
  lat: number;
  lon: number;
  phone?: string;
  address?: string;
  type?: string;
  /** En un paquete con listados oficiales (Uruguay): este lugar viene de OpenStreetMap. */
  osm?: boolean;
  /** Estaciones de servicio: combustibles que vende, si se saben. */
  fuels?: FuelType[];
  /** Aclaración (servicios: dónde está el desfibrilador, altura y capacidad de un refugio). */
  note?: string;
}

export interface RadioStation {
  call: string;
  city: string;
  province: string;
  am: number | null;
  fm: number | null;
  lat: number;
  lon: number;
}

export interface EmergencyData {
  sources: Record<'fire' | 'police' | 'health' | 'radio', string>;
  /** Paquetes de Chile y Uruguay: lugares de OpenStreetMap, no de un listado oficial. */
  osm?: boolean;
  fire: Place[];
  police: Place[];
  health: Place[];
  radio: RadioStation[];
}

let pending: Promise<EmergencyData> | null = null;

export function loadEmergencyData(): Promise<EmergencyData> {
  pending ??= import('./emergency-data.json').then((m) => m.default as EmergencyData);
  return pending;
}

/** Lugar encontrado cerca, de cualquier fuente. */
export interface NearbyPlace {
  key: string;
  kind: ContactKind;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lon: number;
  distance: number;
  source: 'official' | 'osm';
  /** Tipo según la fuente (p. ej. "Hospital", "C.A.P.S"). */
  detail: string;
  /** Otros teléfonos (emergencias del parque, radioestación). */
  extraPhones?: ParkPhone[];
  /** Aclaración (p. ej. internos y otros números de la intendencia). */
  note?: string;
  /** Frecuencias VHF que publica el parque donde está el lugar. */
  radio?: ParkRadio[];
  /** Estaciones de servicio: combustibles que vende. */
  fuels?: FuelType[];
}

/** Combustibles de una estación de servicio: nafta (bencina, gasolina), gasoil, GNC (GNV) y GLP. */
export type FuelType = 'gasoline' | 'diesel' | 'cng' | 'lpg';

// ---------- Parques nacionales (tools/emergency-data/parks.mjs) ----------

export interface ParkPhone {
  label: string;
  phone: string;
}

export interface ParkRadio {
  freq: string;
  label: string;
  /** Dónde la publica el parque (mapa, folleto, cartel). */
  source: string;
}

export interface Park {
  /** País del área (Bolivia y Perú lo traen; en los de Argentina y Chile se deduce de la página). */
  country?: Country;
  name: string;
  /** Página del área (argentina.gob.ar o conaf.cl). */
  url: string;
  /** Quién atiende el teléfono principal, si no es la intendencia (Chile: "CONAF Magallanes"). */
  office?: string;
  address: string;
  /** Número para llamar a la intendencia ('' si la página no publica uno). */
  phone: string;
  /** Texto completo de los teléfonos según la página (internos, otros números). */
  phones: string;
  emergency?: ParkPhone[];
  radio?: ParkRadio[];
  /** Intendencia (ubicada por localidad). */
  lat: number;
  lon: number;
  /** Polígonos: anillos de [lon, lat]; el primero es el borde, los demás, huecos. */
  area: [number, number][][][];
}

export interface ParksData {
  source: string;
  parks: Park[];
}

let parksAR: Promise<ParksData> | null = null;
let parksCL: Promise<ParksData> | null = null;
const parksOther = new Map<string, Promise<ParksData>>();

// Argentina viene con la app; si el servidor propio la regeneró (cada mes), se usa la copia más nueva.
const loadParksAR = () => (parksAR ??= import('./parks-data.json').then((m) => preferNewer('parks-AR.json', m.default as unknown as ParksData)));
/** Chile (CONAF): archivo aparte, se baja una vez y queda guardado como los paquetes por país. */
export function loadParksCL(): Promise<ParksData> {
  parksCL ??= loadDataFile<ParksData>('parks-CL.json');
  // Si falla (sin conexión y sin bajar), se reintenta la próxima vez.
  parksCL.catch(() => (parksCL = null));
  return parksCL;
}

/** Bolivia (SERNAP, de OpenStreetMap), Perú (SERNANP), Paraguay y Uruguay (SNAP; de OpenStreetMap) y Brasil (CNUC, Ministerio de Medio Ambiente): archivos aparte, se bajan una vez y quedan guardados, como el de Chile. */
export function loadParksFile(country: 'BO' | 'PE' | 'PY' | 'UY' | 'BR'): Promise<ParksData> {
  // Brasil: los parques de los sectores elegidos juntos (la clave lleva los sectores, así al cambiar la elección se vuelve a armar).
  const ids = country === 'BR' ? useSettings.getState().settings.brSectors : [];
  if (country === 'BR' && ids.length === 0) return Promise.reject(new CountryDataError());
  const key = country === 'BR' ? `BR:${ids.join(',')}` : country;
  let p = parksOther.get(key);
  if (!p) {
    p = country === 'BR' ? Promise.all(ids.map((id) => loadDataFile<ParksData>(`parks-BR-${id}.json`))).then(mergeParks) : loadDataFile<ParksData>(`parks-${country}.json`);
    parksOther.set(key, p);
    // Si falla (sin conexión y sin bajar), se reintenta la próxima vez.
    p.catch(() => parksOther.delete(key));
  }
  return p;
}

/** Olvida lo que quedó en memoria de los parques de un país (después de borrarlos del dispositivo). */
export function forgetLoadedParks(country: Country): void {
  parksOther.delete(country);
  if (country === 'CL') parksCL = null;
}

/** Junta los parques de varios sectores; un parque que cruza de un sector a otro está en los dos archivos y queda una sola vez (por código CNUC). */
export function mergeParks(parts: ParksData[]): ParksData {
  const seen = new Set<string>();
  const parks: Park[] = [];
  for (const part of parts) {
    for (const park of part.parks) {
      const id = (park as Park & { cnuc?: string }).cnuc ?? `${park.name}|${park.lat}|${park.lon}`;
      if (seen.has(id)) continue;
      seen.add(id);
      parks.push(park);
    }
  }
  return { source: [...new Set(parts.map((d) => d.source).filter(Boolean))].join(' '), parks };
}

/** Países cuyos parques se muestran junto con los de cada uno (en la cordillera se está a pocos km de la frontera). */
const PARK_NEIGHBORS: Record<Country, Country[]> = {
  AR: ['AR', 'CL', 'BO', 'PY'],
  CL: ['CL', 'AR', 'BO', 'PE'],
  UY: ['UY'],
  BO: ['BO', 'PE', 'CL', 'AR', 'PY'],
  PE: ['PE', 'BO', 'CL'],
  PY: ['PY', 'AR', 'BO'],
  // Brasil: las suyas y las de la frontera sur (Foz do Iguaçu, Uruguaiana, Chuí).
  BR: ['BR', 'AR', 'PY', 'UY'],
};

/** País de un área: el que trae el archivo; si no, por la página (conaf.cl es Chile; el resto, Argentina). */
export const parkCountry = (park: Park): Country => park.country ?? (park.url.includes('conaf.cl') ? 'CL' : 'AR');

/**
 * Parques del país elegido y los de los países vecinos con los que comparte
 * cordillera (Argentina y Chile, Bolivia y Perú…); Uruguay, las suyas. El de
 * Argentina viene con la app y los demás se bajan aparte: si no están
 * bajados y no hay conexión, solo los que haya.
 */
export async function loadParks(country: Country): Promise<ParksData> {
  const want = PARK_NEIGHBORS[country];
  if (!want.length) return { source: '', parks: [] };
  const loaded = await Promise.all(
    want.map((c): Promise<ParksData | null> => (c === 'AR' ? loadParksAR() : c === 'CL' ? loadParksCL().catch(() => null) : loadParksFile(c).catch(() => null))),
  );
  const ok = loaded.filter((d): d is ParksData => d !== null);
  return { source: ok.map((d) => d.source).filter(Boolean).join(' '), parks: ok.flatMap((d) => d.parks) };
}

function inRing(ring: [number, number][], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPark(park: Park, lat: number, lon: number): boolean {
  return park.area.some(([outer, ...holes]) => !!outer && inRing(outer, lon, lat) && !holes.some((h) => inRing(h, lon, lat)));
}

/** Distancia aproximada al borde del parque (a sus vértices): 0 si se está adentro. */
export function distanceToPark(park: Park, lat: number, lon: number): number {
  if (inPark(park, lat, lon)) return 0;
  let best = Infinity;
  for (const poly of park.area) for (const [x, y] of poly[0] ?? []) best = Math.min(best, distanceMeters({ lat, lon }, { lat: y, lon: x }));
  return best;
}

/** Parques donde se está o a menos de `maxM` del borde, del más cercano al más lejano. */
export function parksNear(data: ParksData, lat: number, lon: number, maxM: number): { park: Park; distance: number }[] {
  return data.parks
    .map((park) => ({ park, distance: distanceToPark(park, lat, lon) }))
    .filter((p) => p.distance <= maxM)
    .sort((a, b) => a.distance - b.distance);
}

/** Lugares de Parques Nacionales en los datos oficiales (seccionales, destacamentos, guardaparques). */
const isParkOffice = (p: NearbyPlace) => /parques nacionales|guardaparque|conaf|ranger/i.test(`${p.detail} ${p.name}`);

/**
 * Suma las intendencias de los parques (con teléfono o dirección) y les pasa
 * las frecuencias del parque a las seccionales que están adentro.
 */
export function withParks(places: NearbyPlace[], parks: ParksData, lat: number, lon: number): NearbyPlace[] {
  const withRadio = parks.parks.filter((p) => p.radio?.length);
  const out = places.map((p) => {
    if (!isParkOffice(p)) return p;
    const park = withRadio.find((k) => inPark(k, p.lat, p.lon));
    return park ? { ...p, radio: park.radio } : p;
  });
  // Dos áreas con la misma intendencia u oficina (Nahuel Huapi y Los Arrayanes; en Chile, una oficina regional de CONAF para varias áreas): una sola fila, con las frecuencias de todas.
  const rows = new Map<string, NearbyPlace>();
  parks.parks.forEach((park, i) => {
    if (!park.phone && !park.address) return;
    const key = `${park.lat},${park.lon},${park.office ?? ''}`;
    const twin = rows.get(key);
    if (twin) {
      // La fila lleva el nombre de la oficina, no el de una de las áreas.
      if (park.office) twin.name = park.office;
      for (const r of park.radio ?? []) if (!twin.radio?.some((x) => x.freq === r.freq && x.label === r.label)) twin.radio = [...(twin.radio ?? []), r];
      return;
    }
    const row: NearbyPlace = {
      key: `park-${i}`,
      kind: 'police',
      name: `${park.office ?? 'Intendencia'} · ${park.name}`,
      phone: park.phone,
      address: park.address,
      lat: park.lat,
      lon: park.lon,
      distance: distanceMeters({ lat, lon }, park),
      source: 'official',
      detail: park.url.includes('conaf.cl') ? 'CONAF' : 'Administración de Parques Nacionales',
      ...(park.phones && park.phones.replace(/\D/g, '') !== park.phone.replace(/\D/g, '') && { note: park.phones }),
      ...(park.emergency && { extraPhones: park.emergency }),
      ...(park.radio && { radio: park.radio }),
    };
    rows.set(key, row);
    out.push(row);
  });
  return out;
}

/** Del dataset de salud: hospitales y guardias, por un lado; centros de atención primaria, por otro. */
const healthKind = (type = ''): ContactKind => (/hospital|emergencias|u\.p\.a/i.test(type) ? 'hospital' : 'medical');

export function officialNearby(data: EmergencyData, lat: number, lon: number, radiusM: number): NearbyPlace[] {
  const here = { lat, lon };
  const out: NearbyPlace[] = [];
  const add = (p: Place, kind: ContactKind, prefix: string, i: number) => {
    const distance = distanceMeters(here, p);
    if (distance > radiusM) return;
    out.push({
      key: `${prefix}-${i}`,
      kind,
      name: p.name,
      phone: p.phone ?? '',
      address: p.address ?? '',
      lat: p.lat,
      lon: p.lon,
      distance,
      source: data.osm || p.osm ? 'osm' : 'official',
      detail: p.type ?? '',
    });
  };
  const key = data.osm ? 'pkg-' : '';
  data.fire.forEach((p, i) => add(p, 'fire', `${key}fire`, i));
  data.police.forEach((p, i) => add(p, 'police', `${key}police`, i));
  data.health.forEach((p, i) => add(p, healthKind(p.type), `${key}health`, i));
  return out;
}

/**
 * Junta las fuentes: si el mismo lugar aparece en las dos (mismo tipo, a
 * menos de 150 m), queda uno solo, completando teléfono y dirección con lo
 * que falte.
 */
export function mergeNearby(official: NearbyPlace[], osm: NearbyPlace[]): NearbyPlace[] {
  const merged = [...official];
  const sameKind = (a: ContactKind, b: ContactKind) => a === b || (['hospital', 'medical'].includes(a) && ['hospital', 'medical'].includes(b));
  for (const o of osm) {
    const twin = merged.find((m) => sameKind(m.kind, o.kind) && distanceMeters(m, o) < 150);
    if (twin) {
      twin.phone ||= o.phone;
      twin.address ||= o.address;
      if (!twin.fuels && o.fuels) twin.fuels = o.fuels;
    } else merged.push(o);
  }
  return merged.sort((a, b) => a.distance - b.distance);
}

/** Grupo de cada tipo para "lo más cercano": hospitales y ambulancias van juntos (salud); las estaciones de servicio, aparte. */
export const nearbyGroup = (k: ContactKind) => (k === 'hospital' || k === 'medical' ? 'health' : k);

/** Los `count` más cercanos de cada grupo (policía, bomberos, salud, defensa civil, estaciones de servicio), del más cercano al más lejano. */
export function nearestPerKind(places: NearbyPlace[], count: number): NearbyPlace[] {
  const taken = new Map<string, number>();
  const out: NearbyPlace[] = [];
  for (const p of [...places].sort((a, b) => a.distance - b.distance)) {
    const g = nearbyGroup(p.kind);
    const n = taken.get(g) ?? 0;
    if (n >= count) continue;
    taken.set(g, n + 1);
    out.push(p);
  }
  return out;
}

export function nearestRadio(data: EmergencyData, lat: number, lon: number, count = 3): (RadioStation & { distance: number })[] {
  return data.radio
    .map((r) => ({ ...r, distance: distanceMeters({ lat, lon }, r) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

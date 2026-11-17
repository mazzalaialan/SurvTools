import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/**
 * Base propia de calles, números de puerta y kilómetros de ruta (OpenStreetMap, © colaboradores de OpenStreetMap, ODbL), armada con
 * `tools/osm-index/build.sh` desde el extracto de Geofabrik. Responde lo mismo que las consultas a Overpass que hacía la app, pero en
 * milisegundos y sin depender de servidores públicos. Sin la base, `around` da `null` y la app usa los servicios públicos.
 */
export interface AroundElement {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface Around {
  elements: AroundElement[];
  builtAt: string | null;
}

/** Radios iguales a las consultas de la app. */
export const NAME_M = 120;
export const REF_M = 400;
export const NUMBER_M = 80;
export const MILESTONE_M = 3000;

/** Las celdas son las de tools/osm-index/import.mjs: `floor((lat+90)*50)*20000 + floor((lon+180)*50)` (0,02° ≈ 2,2 km). */
const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
function meters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const x = rad(bLon - aLon) * Math.cos(rad((aLat + bLat) / 2));
  const y = rad(bLat - aLat);
  return R * Math.hypot(x, y);
}

/** Celdas dentro de `radiusM` del punto (un cuadrado de celdas vecinas). */
function cells(lat: number, lon: number, radiusM: number): number[] {
  const dLat = radiusM / 111_000;
  const dLon = radiusM / (111_000 * Math.max(0.2, Math.cos(rad(lat))));
  const out: number[] = [];
  const y0 = Math.floor((lat - dLat + 90) * 50);
  const y1 = Math.floor((lat + dLat + 90) * 50);
  const x0 = Math.floor((lon - dLon + 180) * 50);
  const x1 = Math.floor((lon + dLon + 180) * 50);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * 20000 + x);
  return out;
}

export interface NearbyElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface AroundIndex {
  /** `null` si la base todavía no existe (el servidor la abre apenas aparece o cambia). */
  around(lat: number, lon: number): Around | null;
  /** Lugares de «Buscar cercanos» (policía, bomberos, salud, Defensa Civil y, si se pide, una categoría de servicios) a menos de `radiusM`. */
  nearby(lat: number, lon: number, radiusM: number, service: string | null): { elements: NearbyElement[]; builtAt: string | null } | null;
  close(): void;
}

/** Categorías de servicios que existen en la base (las mismas de tools/osm-index/import.mjs). */
export const SERVICE_CATS = ['fuel', 'tyres', 'repair', 'pharmacy', 'aed', 'vet', 'water', 'shelter', 'atm', 'nautical'] as const;
export const MAX_NEARBY_RADIUS_M = 60_000;
export const MAX_NEARBY_RESULTS = 600;

/** Rangos de celdas por fila de latitud (más barato que una lista enorme de celdas cuando el radio es de decenas de km). */
function cellRanges(lat: number, lon: number, radiusM: number): [number, number][] {
  const dLat = radiusM / 111_000;
  const dLon = radiusM / (111_000 * Math.max(0.2, Math.cos(rad(lat))));
  const x0 = Math.floor((lon - dLon + 180) * 50);
  const x1 = Math.floor((lon + dLon + 180) * 50);
  const out: [number, number][] = [];
  for (let y = Math.floor((lat - dLat + 90) * 50); y <= Math.floor((lat + dLat + 90) * 50); y++) out.push([y * 20000 + x0, y * 20000 + x1]);
  return out;
}

interface RoadRow { lat: number; lon: number; name: string | null; ref: string | null; hw: string | null }
interface NumRow { lat: number; lon: number; street: string; number: string }
interface MileRow { lat: number; lon: number; km: string; ref: string | null }

function openFile(path: string): AroundIndex {
  const db = new DatabaseSync(path, { readOnly: true });
  const builtAt = (db.prepare("SELECT value FROM meta WHERE key = 'builtAt'").get() as { value: string } | undefined)?.value ?? null;
  const hasPlaces = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'place'").get();
  return {
    nearby(lat, lon, radiusM, service) {
      if (!hasPlaces) return { elements: [], builtAt };
      const cats = service && (SERVICE_CATS as readonly string[]).includes(service) ? ['core', service] : ['core'];
      const radius = Math.min(Math.max(radiusM, 100), MAX_NEARBY_RADIUS_M);
      const stmt = db.prepare(`SELECT lat, lon, cat, osm, tags FROM place WHERE cell BETWEEN ? AND ? AND cat IN (${cats.map(() => '?').join(',')})`);
      const found = new Map<string, { d: number; el: NearbyElement }>();
      for (const [a, b] of cellRanges(lat, lon, radius)) {
        for (const r of stmt.all(a, b, ...cats) as unknown as { lat: number; lon: number; cat: string; osm: string; tags: string }[]) {
          const d = meters(lat, lon, r.lat, r.lon);
          if (d > radius || found.has(r.osm)) continue;
          const type = r.osm.startsWith('w') ? 'way' : r.osm.startsWith('r') ? 'relation' : 'node';
          found.set(r.osm, { d, el: { type, id: Number(r.osm.slice(1)) || 0, lat: r.lat, lon: r.lon, tags: JSON.parse(r.tags) as Record<string, string> } });
        }
      }
      const elements = [...found.values()].sort((x, y) => x.d - y.d).slice(0, MAX_NEARBY_RESULTS).map((x) => x.el);
      return { elements, builtAt };
    },
    around(lat, lon) {
      const elements: AroundElement[] = [];
      let id = 0;
      const q = (table: string, cols: string, list: number[]) => db.prepare(`SELECT ${cols} FROM ${table} WHERE cell IN (${list.map(() => '?').join(',')})`).all(...list);
      // Calles con nombre a menos de 120 m y rutas (con su referencia) a menos de 400 m.
      for (const r of q('road', 'lat, lon, name, ref, hw', cells(lat, lon, REF_M)) as unknown as RoadRow[]) {
        const d = meters(lat, lon, r.lat, r.lon);
        const tags: Record<string, string> = {};
        if (r.hw) tags.highway = r.hw;
        if (r.name && d <= NAME_M) tags.name = r.name;
        if (r.ref && d <= REF_M) tags.ref = r.ref;
        if (tags.name || tags.ref) elements.push({ type: 'node', id: ++id, lat: r.lat, lon: r.lon, tags });
      }
      for (const r of q('num', 'lat, lon, street, number', cells(lat, lon, NUMBER_M)) as unknown as NumRow[]) {
        if (meters(lat, lon, r.lat, r.lon) <= NUMBER_M) elements.push({ type: 'node', id: ++id, lat: r.lat, lon: r.lon, tags: { 'addr:street': r.street, 'addr:housenumber': r.number } });
      }
      for (const r of q('mile', 'lat, lon, km, ref', cells(lat, lon, MILESTONE_M)) as unknown as MileRow[]) {
        if (meters(lat, lon, r.lat, r.lon) <= MILESTONE_M) elements.push({ type: 'node', id: ++id, lat: r.lat, lon: r.lon, tags: { highway: 'milestone', distance: r.km, ...(r.ref ? { ref: r.ref } : {}) } });
      }
      return { elements, builtAt };
    },
    close: () => db.close(),
  };
}

/**
 * La base se abre cuando aparece y se vuelve a abrir cuando cambia el archivo (el armado mensual lo reemplaza por uno nuevo): no hace falta
 * reiniciar el servidor. Sin ruta, no hay índice; con ruta y sin archivo, `around` y `nearby` dan `null` (la ruta responde 503).
 */
export function openAroundIndex(path: string | null): AroundIndex | null {
  if (!path) return null;
  let current: { index: AroundIndex; mtime: number } | null = null;
  const get = (): AroundIndex | null => {
    let mtime: number;
    try {
      mtime = statSync(path).mtimeMs;
    } catch {
      current?.index.close();
      current = null;
      return null;
    }
    if (!current || current.mtime !== mtime) {
      current?.index.close();
      current = { index: openFile(path), mtime };
    }
    return current.index;
  };
  return {
    around: (lat, lon) => get()?.around(lat, lon) ?? null,
    nearby: (lat, lon, radiusM, service) => get()?.nearby(lat, lon, radiusM, service) ?? null,
    close: () => {
      current?.index.close();
      current = null;
    },
  };
}

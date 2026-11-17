import { existsSync } from 'node:fs';
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

export interface AroundIndex {
  around(lat: number, lon: number): Around;
  close(): void;
}

interface RoadRow { lat: number; lon: number; name: string | null; ref: string | null; hw: string | null }
interface NumRow { lat: number; lon: number; street: string; number: string }
interface MileRow { lat: number; lon: number; km: string; ref: string | null }

export function openAroundIndex(path: string | null): AroundIndex | null {
  if (!path || !existsSync(path)) return null;
  const db = new DatabaseSync(path, { readOnly: true });
  const builtAt = (db.prepare("SELECT value FROM meta WHERE key = 'builtAt'").get() as { value: string } | undefined)?.value ?? null;
  return {
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

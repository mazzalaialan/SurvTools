import { DEM_URL, eachTile, fill, LOCAL_TILE, type ZonePlan } from './tiles';
import { zoneKeys, type MapZone } from './store';

/**
 * Cuánto de una zona nueva ya está descargado por las zonas que tenés: la parte de sus teselas (de mapa y de elevación) que ya están
 * guardadas. Sirve para avisar «esto ya lo tenés» antes de bajarlo; las teselas repetidas igual no se vuelven a bajar.
 */
export function overlapWithZones(zones: MapZone[], plan: ZonePlan): { fraction: number; newBytes: number; tiles: number; newTiles: number } {
  const have = new Set(zones.flatMap((z) => zoneKeys({ lat: z.lat, lon: z.lon, radiusKm: z.radiusKm, maxZoom: z.maxZoom })));
  const keys = [...[...eachTile(plan.vector)].map((t) => fill(LOCAL_TILE, t.z, t.x, t.y)), ...[...eachTile(plan.dem)].map((t) => fill(DEM_URL, t.z, t.x, t.y))];
  const fresh = keys.filter((k) => !have.has(k)).length;
  const fraction = keys.length ? 1 - fresh / keys.length : 0;
  return { fraction, newBytes: Math.round(plan.bytes * (1 - fraction)), tiles: keys.length, newTiles: fresh };
}

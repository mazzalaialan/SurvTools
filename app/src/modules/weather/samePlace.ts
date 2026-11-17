import { distanceMeters } from '@/core/geo/geo';

/** Igual que en el servidor (`server/src/places.ts`): más cerca que esto, «donde estoy» y un waypoint ven la misma lluvia. */
export const SAME_PLACE_KM = 10;

/** «Donde estoy» no se vigila si un waypoint con aviso está a menos de `SAME_PLACE_KM`: avisa solo el waypoint. */
export function hereIsDuplicate(here: { lat: number; lon: number }, watched: { lat: number; lon: number }[]): boolean {
  return watched.some((w) => distanceMeters(here, w) < SAME_PLACE_KM * 1000);
}

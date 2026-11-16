/** Grilla de teselas de las capas por zona: el índice sale de la longitud y la latitud, así dos teléfonos piden la misma tesela y el servidor la guarda una sola vez. */
export interface TileId {
  x: number;
  y: number;
}
export const tileOf = (lat: number, lon: number, size: number): TileId => ({ x: Math.floor((lon + 180) / size), y: Math.floor((lat + 90) / size) });
export function tileBounds(t: TileId, size: number): { west: number; south: number; east: number; north: number } {
  return { west: t.x * size - 180, south: t.y * size - 90, east: (t.x + 1) * size - 180, north: (t.y + 1) * size - 90 };
}

/**
 * Proyección del Mapa de Meteorología: Web Mercator (EPSG:3857), la misma de
 * las imágenes de satélite (NASA GIBS) y de las teselas de radar, para que se
 * superpongan sin reproyectar.
 */

const R = 6_378_137;
const MAX_LAT = 85.05112878;

export interface Point {
  x: number;
  y: number;
}

/** Metros Mercator (y crece hacia el norte). */
export function toMercator(lon: number, lat: number): Point {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  return {
    x: (R * lon * Math.PI) / 180,
    y: R * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)),
  };
}

export function fromMercator(x: number, y: number): { lon: number; lat: number } {
  return { lon: (x / R) * (180 / Math.PI), lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI) };
}

/** Vista: centro en metros Mercator y escala en píxeles por metro. */
export interface View {
  cx: number;
  cy: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Argentina, Chile y Uruguay con las Malvinas (con margen abajo para la barra de tiempo). */
export const REGION_BOUNDS = { west: -76, east: -52, south: -58, north: -21 };
/**
 * Vista inicial según el país actual (el de Ajustes, no el de donde estás parado). Argentina usa la del Cono Sur con las Malvinas; Chile y Uruguay
 * tienen la suya. `homeBounds` cae en la del Cono Sur con un país que no figure acá.
 */
export const COUNTRY_BOUNDS: Record<string, typeof REGION_BOUNDS> = {
  AR: REGION_BOUNDS,
  // Chile es una franja larga y angosta, de Arica al cabo de Hornos (con margen abajo para la barra de tiempo).
  CL: { west: -78, east: -64, south: -58, north: -17 },
  UY: { west: -58.7, east: -53, south: -35.4, north: -30 },
  BO: { west: -70, east: -57.4, south: -23, north: -9.6 },
  PE: { west: -81.5, east: -68.5, south: -18.5, north: 0 },
  PY: { west: -63, east: -53.5, south: -28, north: -19 },
  // Brasil entero (con la costa del Atlántico y el sur de Roraima): el país es enorme, a la altura de toda América del Sur.
  BR: { west: -74, east: -34, south: -34, north: 5.5 },
};
export const homeBounds = (country: string) => COUNTRY_BOUNDS[country] ?? REGION_BOUNDS;
/** Toda América del Sur, América Central y la Península Antártica: hasta donde se puede alejar el mapa. */
export const CONTINENT_BOUNDS = { west: -95, east: -34, south: -75, north: 19 };

/** Hasta dónde llega el mapa dibujado (contornos de todo el mundo y el sector de la Antártida): no se puede arrastrar más allá. */
export const MAP_EXTENT = { west: -180, east: 180, south: -80, north: 83.6 };

/**
 * Mantiene la vista dentro del mapa: el borde de la pantalla no pasa del borde del mapa. Si el mapa es más chico que la pantalla en un
 * sentido (muy alejado), queda centrado en ese sentido.
 */
export function clampView(view: View, size: Size, extent = MAP_EXTENT): View {
  const sw = toMercator(extent.west, extent.south);
  const ne = toMercator(extent.east, extent.north);
  const halfW = size.width / 2 / view.scale;
  const halfH = size.height / 2 / view.scale;
  const fit = (c: number, min: number, max: number, half: number) => (max - min <= half * 2 ? (min + max) / 2 : Math.max(min + half, Math.min(max - half, c)));
  const cx = fit(view.cx, sw.x, ne.x, halfW);
  const cy = fit(view.cy, sw.y, ne.y, halfH);
  return cx === view.cx && cy === view.cy ? view : { ...view, cx, cy };
}

export function fitBounds(b: typeof REGION_BOUNDS, size: Size, padding = 8): View {
  const sw = toMercator(b.west, b.south);
  const ne = toMercator(b.east, b.north);
  const scale = Math.min((size.width - padding * 2) / (ne.x - sw.x), (size.height - padding * 2) / (ne.y - sw.y));
  return { cx: (sw.x + ne.x) / 2, cy: (sw.y + ne.y) / 2, scale };
}

export function project(lon: number, lat: number, view: View, size: Size): Point {
  const m = toMercator(lon, lat);
  return { x: size.width / 2 + (m.x - view.cx) * view.scale, y: size.height / 2 - (m.y - view.cy) * view.scale };
}

export function unproject(px: number, py: number, view: View, size: Size): { lon: number; lat: number } {
  return fromMercator(view.cx + (px - size.width / 2) / view.scale, view.cy - (py - size.height / 2) / view.scale);
}

/** Lo que se ve, en metros Mercator: para pedir la imagen de satélite justa. */
export function viewBBox(view: View, size: Size): { minX: number; minY: number; maxX: number; maxY: number } {
  const halfW = size.width / 2 / view.scale;
  const halfH = size.height / 2 / view.scale;
  return { minX: view.cx - halfW, minY: view.cy - halfH, maxX: view.cx + halfW, maxY: view.cy + halfH };
}

/** Acerca o aleja manteniendo fijo el punto de la pantalla bajo el dedo (o el centro). */
export function zoomAt(view: View, size: Size, factor: number, px = size.width / 2, py = size.height / 2, limits = scaleLimits(size)): View {
  const scale = Math.max(limits.min, Math.min(limits.max, view.scale * factor));
  const mx = view.cx + (px - size.width / 2) / view.scale;
  const my = view.cy - (py - size.height / 2) / view.scale;
  return { scale, cx: mx - (px - size.width / 2) / scale, cy: my + (py - size.height / 2) / scale };
}

export function pan(view: View, dx: number, dy: number): View {
  return { ...view, cx: view.cx - dx / view.scale, cy: view.cy + dy / view.scale };
}

/** De todo el mapa a una ciudad (unos 30 km de ancho), no más. */
export function scaleLimits(size: Size): { min: number; max: number } {
  const whole = fitBounds(CONTINENT_BOUNDS, size).scale;
  return { min: whole * 0.8, max: size.width / 30_000 };
}

/** Teselas XYZ (256 px) que cubren la vista, para un nivel de zoom dado. */
export function tilesFor(view: View, size: Size, z: number): { x: number; y: number; z: number; left: number; top: number; px: number }[] {
  const world = 2 * Math.PI * R;
  const n = 2 ** z;
  const tileM = world / n;
  const b = viewBBox(view, size);
  const tx = (x: number) => Math.floor((x + world / 2) / tileM);
  const ty = (y: number) => Math.floor((world / 2 - y) / tileM);
  const out = [];
  for (let x = tx(b.minX); x <= tx(b.maxX); x++) {
    for (let y = Math.max(0, ty(b.maxY)); y <= Math.min(n - 1, ty(b.minY)); y++) {
      const left = size.width / 2 + (x * tileM - world / 2 - view.cx) * view.scale;
      const top = size.height / 2 - (world / 2 - y * tileM - view.cy) * view.scale;
      out.push({ x: ((x % n) + n) % n, y, z, left, top, px: tileM * view.scale });
    }
  }
  return out;
}

/** Límites de una tesela XYZ en metros Mercator. */
export function tileBBox(x: number, y: number, z: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const world = 2 * Math.PI * R;
  const tileM = world / 2 ** z;
  return { minX: x * tileM - world / 2, maxX: (x + 1) * tileM - world / 2, maxY: world / 2 - y * tileM, minY: world / 2 - (y + 1) * tileM };
}

/** Nivel de zoom de teselas con unos 256 px en pantalla, sin pasar el máximo del servicio. */
export function tileZoom(view: View, maxZoom: number): number {
  const world = 2 * Math.PI * R;
  return Math.max(0, Math.min(maxZoom, Math.round(Math.log2((world * view.scale) / 256))));
}

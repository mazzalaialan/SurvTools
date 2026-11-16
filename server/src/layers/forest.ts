import { flatPolys } from './simplify.ts';
import { tileBounds, type TileId } from './tiles.ts';

/**
 * Cobertura de bosque del Bosque Andino Patagónico 2017 (Ministerio de Ambiente de la Nación, Sentinel-2, 1:40.000):
 * lenga, ñire, coihue, ciprés, raulí, mallín, estepa, arbustal… por teselas de 0,25° que la app baja con cada zona descargada.
 * https://geo.ambiente.gob.ar/geoserver/ows (capas `bosques:cobertura_bosque_bap_2017_<provincia>`). Licencia: **CC BY 4.0** (la del sitio
 * oficial argentina.gob.ar para estos datos; la capa del servicio no la repite): se publica así, citando al Ministerio. Cubre solo el bosque andino.
 */
export const FOREST_TILE_DEG = 0.25;
export const AMBIENTE_URL = 'https://geo.ambiente.gob.ar/geoserver/ows';
const UA = 'VikArg-Survival-Tools/1.0';
const TIMEOUT_MS = 60_000;

/** Capas por provincia y el rango de latitud que cubren (con margen). */
const PROVINCES = [
  { layer: 'neuquen', south: -41.5, north: -36 },
  { layer: 'rionegro', south: -42.2, north: -39 },
  { layer: 'chubut', south: -46.1, north: -41.8 },
  { layer: 'santacruz', south: -52.5, north: -45.9 },
  { layer: 'tdf', south: -55.3, north: -52.3 },
];
/** Cordillera patagónica (con margen): fuera de acá no hay capa. */
export const BAP_BOX = { west: -74, south: -55.3, east: -69.5, north: -36 };

export const inBap = (t: TileId): boolean => {
  const b = tileBounds(t, FOREST_TILE_DEG);
  return b.east > BAP_BOX.west && b.west < BAP_BOX.east && b.north > BAP_BOX.south && b.south < BAP_BOX.north;
};

/** El servicio manda «Ñire» con la codificación rota («ÃƒÆ’Ã¢â‚¬Ëœire»), a veces en medio de un nombre: se arregla. */
export function cleanName(raw: string): string {
  return raw.replace(/Ã[^\s-]*?(?=ire\b)/g, 'Ñ').trim();
}

const norm = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Clase de cobertura (la fuente trae decenas de variantes y mezclas: se juntan en pocas clases legibles) con su color. Lo desconocido
 * conserva su nombre limpio en un gris verdoso.
 */
export function describeCover(name: string): { nameEs: string; color: string; biome: number } {
  const n = norm(name);
  const c = (nameEs: string, color: string, biome: number) => ({ nameEs, color, biome });
  if (/achaparrada/.test(n)) return c('Lenga achaparrada', '#6fa86a', 1);
  if (/nire.*bajo/.test(n)) return c('Ñire bajo', '#9ccc65', 1);
  if (/araucaria|pehuen/.test(n)) return c('Bosque de araucaria', '#00695c', 1);
  if (/^coihue-?\s?rauli$|^rauli-?\s?coihue$|^coihue$|^rauli$|roble pellin|^roble/.test(n)) return c('Bosque de coihue, raulí y roble', '#1b5e20', 1);
  if (/^mixto|-/.test(n)) return c('Bosque mixto', '#388e5c', 1);
  if (/^lenga/.test(n)) return c('Bosque de lenga', '#2e7d32', 1);
  if (/^nire/.test(n)) return c('Bosque de ñire', '#7cb342', 1);
  if (/cipres/.test(n)) return c('Bosque de ciprés', '#4e8f6a', 1);
  if (/maiten|radal|chacay|bosque/.test(n)) return c('Bosque mixto', '#388e5c', 1);
  if (/mallin|humedal|turbal|vega/.test(n)) return c('Mallín / humedal', '#8ec6c0', 3);
  if (/matorral|arbustal|remanente|disturbio/.test(n)) return c('Matorral y arbustal', '#a5a05a', 2);
  if (/estepa|pastizal|pastura|pradera/.test(n)) return c('Estepa y pastizal', '#d7c77a', 2);
  if (/erial|suelo desnudo|roca|nieve|hielo/.test(n)) return c('Erial, roca o hielo', '#cfc6b0', 4);
  if (/^agua|lago|laguna|rio/.test(n)) return c('Agua', '#90caf9', 4);
  if (/plantacion|forestacion|exotic/.test(n)) return c('Plantación forestal', '#9ccc65', 5);
  return c(name, '#9aa88a', 6);
}
export const FOREST_BIOMES: Record<string, string> = { 1: 'Bosque andino patagónico', 2: 'Estepa y matorral', 3: 'Humedales', 4: 'Sin vegetación', 5: 'Plantaciones', 6: 'Otras coberturas' };

export interface ForestTile {
  x: number;
  y: number;
  biomes: Record<string, string>;
  ecoregions: { id: number; name: string; nameEs: string; biome: number; color: string; polys: number[][][] }[];
}

/** Identificador estable por nombre (la misma cobertura en teselas distintas se junta en la app). */
export const coverId = (name: string): number => {
  let h = 2166136261;
  for (const c of name.toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return 100_000 + ((h >>> 0) % 900_000);
};

interface Feature {
  properties: { leyenda_n3?: string | null; leyenda_n2?: string | null };
  geometry: { type: string; coordinates: unknown } | null;
}

export function toForestTile(t: TileId, features: Feature[]): ForestTile {
  const byClass = new Map<string, { d: ReturnType<typeof describeCover>; polys: number[][][] }>();
  for (const f of features) {
    const raw = f.properties.leyenda_n3 || f.properties.leyenda_n2;
    if (!raw) continue;
    const d = describeCover(cleanName(raw));
    const polys = flatPolys(f.geometry, 0.001, 1e-8, 4);
    if (!polys.length) continue;
    const cur = byClass.get(d.nameEs) ?? { d, polys: [] };
    cur.polys.push(...polys);
    byClass.set(d.nameEs, cur);
  }
  const ecoregions = [...byClass].map(([nameEs, { d, polys }]) => ({ id: coverId(nameEs), name: nameEs, nameEs, biome: d.biome, color: d.color, polys }));
  return { x: t.x, y: t.y, biomes: FOREST_BIOMES, ecoregions };
}

export async function fetchForestTile(t: TileId, url = AMBIENTE_URL): Promise<ForestTile> {
  const b = tileBounds(t, FOREST_TILE_DEG);
  const layers = PROVINCES.filter((p) => b.north > p.south && b.south < p.north);
  const parts = await Promise.all(
    layers.map(async (p) => {
      const q = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: `bosques:cobertura_bosque_bap_2017_${p.layer}`,
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        propertyName: 'leyenda_n3,leyenda_n2,geom',
        CQL_FILTER: `BBOX(geom,${b.west},${b.south},${b.east},${b.north},'EPSG:4326')`,
      });
      const res = await fetch(`${url}?${q}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { features?: Feature[] }).features ?? [];
    }),
  );
  return toForestTile(t, parts.flat());
}

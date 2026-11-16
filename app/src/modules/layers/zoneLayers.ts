import { MAP_CACHE } from '@/modules/maps/tiles';
import { offsetBiomes, type EcoregionData } from '@/modules/ecoregions/ecoregions';
import type { GeologyData } from './geology';

/**
 * Capas por zona (geología 1:250.000 de SEGEMAR y cobertura de bosque andino patagónico): teselas ya procesadas por el servidor propio
 * (server/src/layers) que se bajan con cada zona del mapa sin conexión y se guardan en la misma caché de mapas, así que editar o borrar
 * una zona las agrega o las limpia junto con sus teselas (store.ts). Sin servidor propio la zona queda sin detalle (queda la base nacional).
 */
/** Cita del Ministerio de Ambiente (CC BY 4.0). */
export const FOREST_CREDIT = 'Ministerio de Ambiente y Desarrollo Sostenible de la Nación, Cobertura de bosque del Bosque Andino Patagónico 2017 (CC BY 4.0)';
export type LayerKind = 'geology' | 'forest';
export const LAYER_TILE_DEG: Record<LayerKind, number> = { geology: 0.4, forest: 0.25 };
/** Más teselas que esto en una zona: no se baja el detalle (la zona es muy grande para estas capas). */
export const MAX_LAYER_TILES = 16;
/** Dónde hay datos (con margen): Argentina y la cordillera patagónica. */
const COVERAGE: Record<LayerKind, { west: number; south: number; east: number; north: number }> = {
  geology: { west: -74, south: -56, east: -53, north: -21 },
  forest: { west: -74, south: -55.3, east: -69.5, north: -36 },
};
const PREFIX = 'https://vikarg.local/layers/';

export interface LayerTile {
  kind: LayerKind;
  x: number;
  y: number;
  key: string;
}
export const layerKey = (kind: LayerKind, x: number, y: number) => `${PREFIX}${kind}/${x}/${y}.json`;

interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Teselas de un tipo que cubren el rectángulo y tienen datos; `null` si son más de `MAX_LAYER_TILES`. */
export function layerTiles(kind: LayerKind, b: Bounds): LayerTile[] | null {
  const size = LAYER_TILE_DEG[kind];
  const cov = COVERAGE[kind];
  const x0 = Math.floor((b.west + 180) / size), x1 = Math.floor((b.east + 180) / size);
  const y0 = Math.floor((b.south + 90) / size), y1 = Math.floor((b.north + 90) / size);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_LAYER_TILES) return null;
  const out: LayerTile[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const w = x * size - 180, s = y * size - 90;
      if (w + size > cov.west && w < cov.east && s + size > cov.south && s < cov.north) out.push({ kind, x, y, key: layerKey(kind, x, y) });
    }
  }
  return out;
}

/** Todas las teselas de capas de una zona (las dos capas; la que no entra no se incluye). */
export const zoneLayerTiles = (b: Bounds): LayerTile[] => [...(layerTiles('geology', b) ?? []), ...(layerTiles('forest', b) ?? [])];

/** Baja las teselas que falten del servidor propio. Devuelve cuántas quedaron guardadas y cuántas fallaron. */
export async function downloadLayerTiles(serverUrl: string, tiles: LayerTile[], signal: AbortSignal, onProgress?: (done: number, total: number) => void): Promise<{ ok: number; failed: number }> {
  const base = serverUrl.trim().replace(/\/+$/, '');
  const cache = await caches.open(MAP_CACHE);
  let ok = 0, failed = 0, done = 0;
  let next = 0;
  async function worker() {
    while (next < tiles.length) {
      if (signal.aborted) return;
      const t = tiles[next++]!;
      try {
        if (await cache.match(t.key)) ok++;
        else {
          const res = await fetch(`${base}/api/layers/${t.kind}/${t.x}/${t.y}`, { signal });
          if (!res.ok) throw new Error(String(res.status));
          const body = await res.text();
          await cache.put(t.key, new Response(body, { headers: { 'content-type': 'application/json' } }));
          ok++;
        }
      } catch {
        if (signal.aborted) return;
        failed++;
      }
      onProgress?.(++done, tiles.length);
    }
  }
  await Promise.all([worker(), worker()]);
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  invalidateLayers();
  return { ok, failed };
}

export interface StoredLayers {
  geology: GeologyData[];
  /** Cobertura de bosque (formato de ecorregiones): una entrada por tesela. */
  forest: EcoregionData[];
}

let stored: Promise<StoredLayers> | null = null;
const listeners = new Set<() => void>();
/** Avisa que cambió lo guardado (se bajó o se borró una zona) para que las pantallas vuelvan a leerlo. */
export function invalidateLayers(): void {
  stored = null;
  for (const l of listeners) l();
}
export function onLayersChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Todo el detalle guardado en el dispositivo. */
export function loadStoredLayers(): Promise<StoredLayers> {
  stored ??= (async () => {
    const out: StoredLayers = { geology: [], forest: [] };
    if (!('caches' in globalThis)) return out;
    const cache = await caches.open(MAP_CACHE);
    for (const req of await cache.keys()) {
      if (!req.url.startsWith(PREFIX)) continue;
      const kind = req.url.slice(PREFIX.length).split('/')[0];
      const res = await cache.match(req);
      const data = await res?.json().catch(() => null);
      if (!data) continue;
      if (kind === 'geology') out.geology.push(data as GeologyData);
      else if (kind === 'forest') out.forest.push(data as EcoregionData);
    }
    return out;
  })();
  return stored;
}

/** Une las teselas de bosque en un solo conjunto de ecorregiones finas (la misma cobertura de teselas vecinas se junta por id). */
export function mergeForest(tiles: EcoregionData[]): EcoregionData | null {
  if (!tiles.length) return null;
  const byId = new Map<number, EcoregionData['ecoregions'][number]>();
  for (const t of tiles) {
    for (const e of t.ecoregions) {
      const cur = byId.get(e.id);
      if (cur) cur.polys = [...cur.polys, ...e.polys];
      else byId.set(e.id, { ...e, polys: [...e.polys] });
    }
  }
  // Los biomas de este conjunto se corren en 200 para no pisarse con los de Chile (+100) ni con los de RESOLVE.
  return offsetBiomes({ generatedAt: tiles[0]!.generatedAt, source: FOREST_CREDIT, biomes: tiles[0]!.biomes, ecoregions: [...byId.values()] }, 200);
}

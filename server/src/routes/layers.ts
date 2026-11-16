import type { FastifyInstance } from 'fastify';
import { fetchForestTile, FOREST_TILE_DEG, inBap, type ForestTile } from '../layers/forest.ts';
import { fetchGeologyPoint, fetchGeologyTile, GEOLOGY_TILE_DEG, inArgentina, type GeologyTile, type GeologyUnit } from '../layers/segemar.ts';

/**
 * Capas por zona de la app (mapa sin conexión), ya procesadas para pesar poco:
 * - `GET /api/layers/geology/:x/:y`: teselas de 0,4° de la geología 1:250.000 de SEGEMAR (CC BY 4.0).
 * - `GET /api/layers/forest/:x/:y`: teselas de 0,25° de la cobertura de bosque andino patagónico (Ministerio de Ambiente).
 * - `GET /api/layers/geology/point?lat=&lon=`: la unidad geológica de un punto (consulta en línea fuera de las zonas descargadas).
 * Los servicios de origen no mandan CORS o pesan mucho: se leen acá, una vez por tesela (se guardan 7 días en memoria y, si falla el
 * servicio, se devuelve la copia vieja hasta 60 días), con un máximo de 2 pedidos a la vez para no cargarlos.
 */
const FRESH_MS = 7 * 86_400_000;
const STALE_MS = 60 * 86_400_000;
const MAX_ENTRIES = 400;
const MAX_PARALLEL = 2;

interface Entry<T> {
  at: number;
  data: T;
}

/** Pedidos de a MAX_PARALLEL: los demás esperan su turno. */
function limiter(max: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (running >= max) await new Promise<void>((r) => queue.push(r));
    running++;
    try {
      return await job();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}

export interface LayerSources {
  geology: (x: number, y: number) => Promise<GeologyTile>;
  forest: (x: number, y: number) => Promise<ForestTile>;
  point: (lat: number, lon: number) => Promise<GeologyUnit | null>;
}

export function layersRoutes(
  app: FastifyInstance,
  src: LayerSources = {
    geology: (x, y) => fetchGeologyTile({ x, y }),
    forest: (x, y) => fetchForestTile({ x, y }),
    point: (lat, lon) => fetchGeologyPoint(lat, lon),
  },
  now: () => number = Date.now,
): void {
  const run = limiter(MAX_PARALLEL);
  const caches = { geology: new Map<string, Entry<GeologyTile>>(), forest: new Map<string, Entry<ForestTile>>() };
  const inflight = new Map<string, Promise<unknown>>();

  async function cached<T>(kind: 'geology' | 'forest', x: number, y: number, load: () => Promise<T>): Promise<{ data: T; stale: boolean }> {
    const store = caches[kind] as unknown as Map<string, Entry<T>>;
    const key = `${kind}/${x}/${y}`;
    const hit = store.get(key);
    if (hit && now() - hit.at < FRESH_MS) return { data: hit.data, stale: false };
    try {
      let p = inflight.get(key) as Promise<T> | undefined;
      if (!p) {
        p = run(load).finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      const data = await p;
      store.set(key, { at: now(), data });
      // La más vieja afuera cuando se llena.
      if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
      return { data, stale: false };
    } catch (err) {
      if (hit && now() - hit.at < STALE_MS) return { data: hit.data, stale: true };
      throw err;
    }
  }

  const int = (s: string): number | null => (/^-?\d{1,6}$/.test(s) ? Number(s) : null);

  app.get<{ Params: { x: string; y: string } }>('/api/layers/geology/:x/:y', async (req, reply) => {
    const x = int(req.params.x);
    const y = int(req.params.y);
    if (x === null || y === null || !inArgentina({ x, y })) return reply.code(404).send({ error: 'out_of_range' });
    try {
      const { data, stale } = await cached('geology', x, y, () => src.geology(x, y));
      reply.header('cache-control', 'public, max-age=86400');
      return { ...data, stale, tileDeg: GEOLOGY_TILE_DEG, source: 'SEGEMAR, SIGAM, 1:250.000, CC BY 4.0' };
    } catch (err) {
      app.log.warn({ err: String(err), x, y }, 'no se pudo leer la geología de SEGEMAR');
      return reply.code(502).send({ error: 'upstream' });
    }
  });

  app.get<{ Params: { x: string; y: string } }>('/api/layers/forest/:x/:y', async (req, reply) => {
    const x = int(req.params.x);
    const y = int(req.params.y);
    if (x === null || y === null || !inBap({ x, y })) return reply.code(404).send({ error: 'out_of_range' });
    try {
      const { data, stale } = await cached('forest', x, y, () => src.forest(x, y));
      reply.header('cache-control', 'public, max-age=86400');
      return { ...data, stale, tileDeg: FOREST_TILE_DEG, source: 'Ministerio de Ambiente y Desarrollo Sostenible de la Nación, Bosque Andino Patagónico 2017' };
    } catch (err) {
      app.log.warn({ err: String(err), x, y }, 'no se pudo leer la cobertura de bosque');
      return reply.code(502).send({ error: 'upstream' });
    }
  });

  app.get<{ Querystring: { lat?: string; lon?: string } }>('/api/layers/geology/point', async (req, reply) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return reply.code(400).send({ error: 'bad_point' });
    if (!inArgentina({ x: Math.floor((lon + 180) / GEOLOGY_TILE_DEG), y: Math.floor((lat + 90) / GEOLOGY_TILE_DEG) })) return { unit: null };
    reply.header('cache-control', 'public, max-age=3600');
    try {
      return { unit: await run(() => src.point(Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4)) };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'no se pudo consultar la geología de un punto');
      return reply.code(502).send({ error: 'upstream' });
    }
  });
}

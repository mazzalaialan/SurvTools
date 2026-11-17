import type { FastifyInstance } from 'fastify';
import { alturaAt, type AlturaResult, type FetchJson, realFetchJson } from '../address/georef.ts';

/**
 * `GET /api/address/ar?lat=&lon=&street=`: altura aproximada de una calle argentina en esa posición (Georef, ver address/georef.ts).
 * Responde `{ found: false }` si no hay calle o altura cerca. Cada resultado se guarda 30 días (por calle y celda de ~10 m) para no repetir
 * las consultas masivas a Georef, y se atienden de a 2 a la vez.
 */
const FRESH_MS = 30 * 86_400_000;
const MAX_ENTRIES = 2000;
const MAX_PARALLEL = 2;

export function addressRoutes(app: FastifyInstance, fetchJson: FetchJson = realFetchJson, now: () => number = Date.now): void {
  const cache = new Map<string, { at: number; value: AlturaResult | null }>();
  let running = 0;
  const queue: (() => void)[] = [];

  app.get('/api/address/ar', async (req, reply) => {
    const q = req.query as { lat?: string; lon?: string; street?: string };
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    const street = (q.street ?? '').trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !street || street.length > 120) {
      return reply.code(400).send({ error: 'lat, lon y street son obligatorios' });
    }
    const key = `${street.toLowerCase()}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < FRESH_MS) return { found: !!hit.value, ...(hit.value ? { address: hit.value } : {}) };
    if (running >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r));
    running++;
    try {
      const value = await alturaAt(lat, lon, street, fetchJson);
      cache.set(key, { at: now(), value });
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      reply.header('Cache-Control', 'public, max-age=86400');
      return { found: !!value, ...(value ? { address: value } : {}) };
    } catch {
      return reply.code(502).send({ error: 'Georef no responde' });
    } finally {
      running--;
      queue.shift()?.();
    }
  });
}

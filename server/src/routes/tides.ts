import type { FastifyInstance } from 'fastify';
import { fetchShn, type ShnForecast } from '../tides/shn.ts';

/**
 * `GET /api/tides/shn`: el pronóstico mareológico oficial del SHN (Río de la Plata, corregido por viento), leído de su página (ver tides/shn.ts).
 * Se guarda 1 hora (el SHN lo emite unas 3 veces por día) y, si falla, se devuelve lo último bueno (hasta 24 horas) marcado como viejo; la app
 * mira `validTo` para saber si todavía vale.
 */
const FRESH_MS = 3_600_000;
const STALE_MS = 24 * 3_600_000;

export function tidesRoutes(app: FastifyInstance, shn: () => Promise<ShnForecast> = () => fetchShn(), now: () => number = Date.now): void {
  let last: ShnForecast | null = null;
  let inflight: Promise<ShnForecast> | null = null;

  app.get('/api/tides/shn', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    if (last && now() - last.fetchedAt < FRESH_MS) return { ...last, stale: false };
    try {
      inflight ??= shn().finally(() => (inflight = null));
      last = await inflight;
      return { ...last, stale: false };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'no se pudo leer el pronóstico mareológico del SHN');
      if (last && now() - last.fetchedAt < STALE_MS) return { ...last, stale: true };
      return reply.code(502).send({ error: 'upstream' });
    }
  });
}

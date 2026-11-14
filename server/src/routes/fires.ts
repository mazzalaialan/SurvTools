import type { FastifyInstance } from 'fastify';
import { fetchFires, type FiresData } from '../fires/firms.ts';

/**
 * `GET /api/fires`: focos de calor de las últimas 24 horas (NASA FIRMS, VIIRS NOAA-20 y NOAA-21) agrupados en celdas de 0,1° con su
 * confianza (ver fires/firms.ts). Se baja solo cuando alguien lo pide y la copia tiene más de 30 minutos; si falla, se devuelve la
 * última buena (hasta 6 horas) marcada como vieja.
 */
const FRESH_MS = 30 * 60_000;
const STALE_MS = 6 * 3_600_000;

export interface FiresSource {
  fetch: (now: number) => Promise<FiresData>;
}

export function firesRoutes(app: FastifyInstance, source: FiresSource = { fetch: (now) => fetchFires(now) }, now: () => number = Date.now): void {
  let last: FiresData | null = null;
  let inflight: Promise<FiresData> | null = null;
  app.get('/api/fires', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    if (last && now() - last.fetchedAt < FRESH_MS) return { ...last, stale: false };
    try {
      inflight ??= source.fetch(now()).finally(() => (inflight = null));
      last = await inflight;
      return { ...last, stale: false };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'no se pudieron bajar los focos de calor de FIRMS');
      if (last && now() - last.fetchedAt < STALE_MS) return { ...last, stale: true };
      return reply.code(503).send({ error: 'unavailable' });
    }
  });
}

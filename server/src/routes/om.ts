import type { FastifyInstance } from 'fastify';
import { archiveFrom, archiveOutOfRange, checkLocalAnswer, type LocalWeatherConfig } from '../weather/openMeteoLocal.ts';

const KINDS = new Set(['forecast', 'archive', 'marine']);

/**
 * `GET /api/om/v1/{forecast|archive|marine}?...`: la API de Open-Meteo servida desde la copia propia (contenedor `openmeteo`).
 * La app la prueba primero y, si responde 404 (esa consulta no está en la copia: otra fecha u otra variable) o 503 (copia apagada
 * o caída), pasa sola al servicio público.
 */
export function omRoutes(app: FastifyInstance, cfg: LocalWeatherConfig, fetchImpl: typeof fetch = fetch): void {
  app.get('/api/om/v1/:kind', async (req, reply) => {
    const { kind } = req.params as { kind: string };
    if (!KINDS.has(kind)) return reply.code(404).send({ error: 'desconocido' });
    if (!cfg.localUrl) return reply.code(503).send({ error: 'sin copia propia de Open-Meteo' });
    const search = new URLSearchParams((req.raw.url ?? '').split('?')[1] ?? '');
    if (kind === 'archive' && archiveOutOfRange(search, archiveFrom(cfg.archiveFromYear))) return reply.code(404).send({ error: 'fechas fuera de la copia propia' });
    let upstream: Response;
    try {
      upstream = await fetchImpl(`${cfg.localUrl.replace(/\/+$/, '')}/v1/${kind}?${search}`, { signal: AbortSignal.timeout(15_000) });
    } catch {
      return reply.code(503).send({ error: 'copia propia sin respuesta' });
    }
    if (upstream.status >= 500) return reply.code(503).send({ error: 'copia propia con error' });
    if (!upstream.ok) return reply.code(404).send({ error: 'la copia propia no entiende la consulta' });
    const body = (await upstream.json()) as unknown;
    if (!checkLocalAnswer(kind as 'forecast' | 'archive' | 'marine', body)) return reply.code(404).send({ error: 'dato fuera de la copia propia' });
    reply.header('Cache-Control', kind === 'archive' ? 'public, max-age=86400' : 'public, max-age=300');
    return body;
  });
}

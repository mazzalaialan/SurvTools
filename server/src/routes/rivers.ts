import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import { fetchBoLevels, type BoLevels } from '../rivers/bo.ts';
import { fetchBoExtras, type BoExtras } from '../rivers/boExtra.ts';
import { fetchUyLevels, type UyLevels } from '../rivers/uy.ts';

/**
 * Niveles de los ríos de Bolivia (SENAMHI Bolivia): `GET /api/rivers/bo`. El reporte es un PDF diario: el servidor lo baja y lo lee solo
 * cuando alguien lo pide y el último tiene más de 3 horas, y si falla devuelve el último bueno (hasta 7 días) marcado como viejo.
 * Catálogo de estaciones con coordenadas: app/public/data/rivers-BO.json (tools/river-data/bolivia.mjs).
 */
const FRESH_MS = 3 * 3_600_000;
const STALE_MS = 7 * 86_400_000;
const UY_FRESH_MS = 2 * 3_600_000;
const UY_STALE_MS = 3 * 86_400_000;
const EXTRA_FRESH_MS = 6 * 3_600_000;
const EXTRA_STALE_MS = 14 * 86_400_000;

export interface BoSource {
  fetch: (stations: { name: string }[]) => Promise<BoLevels>;
}

export function riversRoutes(app: FastifyInstance, config: Config, source: BoSource = { fetch: fetchBoLevels }, now: () => number = Date.now, extras: () => Promise<BoExtras> = () => fetchBoExtras(now()), uy: () => Promise<UyLevels> = () => fetchUyLevels(now(), { caruUrl: config.caruUrl, dinaguaUrl: config.dinaguaUrl })): void {
  let lastUy: UyLevels | null = null;
  let inflightUy: Promise<UyLevels> | null = null;
  let last: BoLevels | null = null;
  let lastExtras: BoExtras | null = null;
  let inflightExtras: Promise<BoExtras> | null = null;
  let inflight: Promise<BoLevels> | null = null;
  let stations: { name: string }[] | null = null;

  function catalog(): { name: string }[] {
    if (!stations) {
      if (!config.appDir) throw new Error('sin catálogo de estaciones de Bolivia');
      stations = (JSON.parse(readFileSync(`${config.appDir}/data/rivers-BO.json`, 'utf8')) as { stations: { name: string }[] }).stations;
    }
    return stations;
  }

  /**
   * `GET /api/rivers/bo/extra`: resumen del pronóstico hidrológico del SENAMHI (~14 días) y boletín semanal del lago Titicaca (ver rivers/boExtra.ts).
   * Cambian una vez por día y por semana: se guardan 6 horas y, si falla, se devuelve lo último bueno (hasta 14 días) marcado como viejo.
   */
  app.get('/api/rivers/bo/extra', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    if (lastExtras && now() - lastExtras.fetchedAt < EXTRA_FRESH_MS) return { ...lastExtras, stale: false };
    try {
      inflightExtras ??= extras().finally(() => (inflightExtras = null));
      lastExtras = await inflightExtras;
      return { ...lastExtras, stale: false };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'no se pudo leer el pronóstico hidrológico ni el boletín del lago de Bolivia');
      if (lastExtras && now() - lastExtras.fetchedAt < EXTRA_STALE_MS) return { ...lastExtras, stale: true };
      return reply.code(503).send({ error: 'unavailable' });
    }
  });

  /**
   * `GET /api/rivers/uy`: niveles de ríos de Uruguay de CARU (río Uruguay, HTML por HTTP) y DINAGUA (API del Observatorio Hidrológico), ver rivers/uy.ts.
   * Se actualizan cada 12 h (CARU) o cada hora (DINAGUA): se guardan 2 horas y, si falla, se devuelve lo último bueno (hasta 3 días) marcado como viejo.
   */
  app.get('/api/rivers/uy', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    if (lastUy && now() - lastUy.fetchedAt < UY_FRESH_MS) return { ...lastUy, stale: false };
    try {
      inflightUy ??= uy().finally(() => (inflightUy = null));
      lastUy = await inflightUy;
      return { ...lastUy, stale: false };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'no se pudieron leer los niveles de CARU ni de DINAGUA');
      if (lastUy && now() - lastUy.fetchedAt < UY_STALE_MS) return { ...lastUy, stale: true };
      return reply.code(503).send({ error: 'unavailable' });
    }
  });

  app.get('/api/rivers/bo', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    if (last && now() - last.fetchedAt < FRESH_MS) return { ...last, stale: false };
    try {
      inflight ??= source.fetch(catalog()).finally(() => (inflight = null));
      last = await inflight;
      return { ...last, stale: false };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'no se pudo leer el reporte de niveles de Bolivia');
      if (last && now() - last.fetchedAt < STALE_MS) return { ...last, stale: true };
      return reply.code(503).send({ error: 'unavailable' });
    }
  });
}

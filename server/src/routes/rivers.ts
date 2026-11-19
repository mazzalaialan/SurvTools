import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import { fetchBoLevels, type BoLevels } from '../rivers/bo.ts';
import { fetchBrLevels, type BrCatalogStation, type BrLevels } from '../rivers/br.ts';
import { fetchBoExtras, type BoExtras } from '../rivers/boExtra.ts';
import { fetchPyLevels, type PyCatalogStation, type PyLevels } from '../rivers/py.ts';
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
const UY_PARTIAL_MS = 10 * 60_000;

/** Junta una lectura incompleta con la anterior: las estaciones de la fuente que falló ahora quedan con su última lectura (la fecha de cada una dice cuándo fue). */
function mergeUy(before: UyLevels, fresh: UyLevels): UyLevels {
  const missing = (source: 'CARU' | 'DINAGUA', ok: boolean) => (ok ? [] : before.stations.filter((s) => s.source === source));
  return { fetchedAt: fresh.fetchedAt, sources: fresh.sources, stations: [...fresh.stations, ...missing('CARU', fresh.sources.caru), ...missing('DINAGUA', fresh.sources.dinagua)] };
}
const PY_FRESH_MS = 2 * 3_600_000;
const PY_STALE_MS = 3 * 86_400_000;
const BR_FRESH_MS = 30 * 60_000;
const BR_STALE_MS = 3 * 86_400_000;
/** La primera lectura de Brasil tarda más de un minuto (33 estaciones, de a una, con pausa): se espera esto y se responde «cargando». */
const BR_FIRST_WAIT_MS = 45_000;
const EXTRA_FRESH_MS = 6 * 3_600_000;
const EXTRA_PARTIAL_MS = 3_600_000;
const EXTRA_STALE_MS = 14 * 86_400_000;

export interface BoSource {
  fetch: (stations: { name: string }[]) => Promise<BoLevels>;
}

export function riversRoutes(app: FastifyInstance, config: Config, source: BoSource = { fetch: fetchBoLevels }, now: () => number = Date.now, extras: () => Promise<BoExtras> = () => fetchBoExtras(now()), uy: () => Promise<UyLevels> = () => fetchUyLevels(now(), { caruUrl: config.caruUrl, dinaguaUrl: config.dinaguaUrl }), py: (catalog: PyCatalogStation[]) => Promise<PyLevels> = (catalog) => fetchPyLevels(catalog, now()), br: (catalog: BrCatalogStation[], previous: BrLevels | null) => Promise<BrLevels> = (catalog, previous) => fetchBrLevels(catalog, now(), previous), brFirstWaitMs = BR_FIRST_WAIT_MS): void {
  let lastPy: PyLevels | null = null;
  let inflightPy: Promise<PyLevels> | null = null;
  let pyStations: PyCatalogStation[] | null = null;

  function pyCatalog(): PyCatalogStation[] {
    if (!pyStations) {
      if (!config.appDir) throw new Error('sin catálogo de estaciones de Paraguay');
      pyStations = (JSON.parse(readFileSync(`${config.appDir}/data/rivers-PY.json`, 'utf8')) as { stations: PyCatalogStation[] }).stations;
    }
    return pyStations;
  }

  /**
   * `GET /api/rivers/py`: niveles de los ríos de Paraguay de la DMH (tabla HTML diaria), ver rivers/py.ts.
   * Se guardan 2 horas y, si falla, se devuelve lo último bueno (hasta 3 días) marcado como viejo.
   */
  app.get('/api/rivers/py', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    if (lastPy && now() - lastPy.fetchedAt < PY_FRESH_MS) return { ...lastPy, stale: false };
    try {
      inflightPy ??= py(pyCatalog()).finally(() => (inflightPy = null));
      lastPy = await inflightPy;
      return { ...lastPy, stale: false };
    } catch (err) {
      app.log.warn({ err: String(err) }, 'no se pudieron leer los niveles de la DMH de Paraguay');
      if (lastPy && now() - lastPy.fetchedAt < PY_STALE_MS) return { ...lastPy, stale: true };
      return reply.code(503).send({ error: 'unavailable' });
    }
  });

  let lastBr: BrLevels | null = null;
  let inflightBr: Promise<BrLevels> | null = null;
  let brStations: BrCatalogStation[] | null = null;

  function brCatalog(): BrCatalogStation[] {
    if (!brStations) {
      if (!config.appDir) throw new Error('sin catálogo de estaciones de Brasil');
      brStations = (JSON.parse(readFileSync(`${config.appDir}/data/rivers-BR.json`, 'utf8')) as { stations: BrCatalogStation[] }).stations;
    }
    return brStations;
  }

  /**
   * `GET /api/rivers/br`: niveles de los ríos de Brasil de la telemetría de la ANA (ver rivers/br.ts). Una ronda lleva más de un minuto, así que
   * se responde con lo último guardado y, si tiene más de 30 minutos, se actualiza por detrás. Sin nada guardado se espera hasta 45 segundos y,
   * si la ronda sigue, se responde 503 «loading» (la ronda sigue sola y el próximo pedido la encuentra lista). Lo guardado vale hasta 3 días.
   */
  app.get('/api/rivers/br', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    const refresh = () => {
      inflightBr ??= br(brCatalog(), lastBr).then(
        (l) => (lastBr = l),
        (err) => {
          app.log.warn({ err: String(err) }, 'no se pudieron leer los niveles de la ANA de Brasil');
          throw err;
        },
      ).finally(() => (inflightBr = null));
      return inflightBr;
    };
    try {
      if (lastBr && now() - lastBr.fetchedAt < BR_STALE_MS) {
        const age = now() - lastBr.fetchedAt;
        if (age >= BR_FRESH_MS) refresh().catch(() => undefined);
        return { ...lastBr, stale: age >= BR_FRESH_MS };
      }
      const pending = refresh();
      pending.catch(() => undefined);
      const result = await Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), brFirstWaitMs).unref())]);
      if (!result) return reply.code(503).send({ error: 'loading' });
      return { ...result, stale: false };
    } catch {
      return reply.code(503).send({ error: 'unavailable' });
    }
  });

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
    // Completo vale 6 horas; si falta el pronóstico, el boletín del lago o la planilla, se reintenta a la hora.
    if (lastExtras && now() - lastExtras.fetchedAt < (lastExtras.forecast && lastExtras.lake && lastExtras.planilla ? EXTRA_FRESH_MS : EXTRA_PARTIAL_MS)) return { ...lastExtras, stale: false };
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
    // Un resultado completo vale 2 horas; si falta una fuente (CARU tarda o DINAGUA no respondió) se vuelve a intentar a los 10 minutos.
    if (lastUy && now() - lastUy.fetchedAt < (lastUy.sources.caru && lastUy.sources.dinagua ? UY_FRESH_MS : UY_PARTIAL_MS)) return { ...lastUy, stale: false };
    try {
      inflightUy ??= uy().finally(() => (inflightUy = null));
      const fresh = await inflightUy;
      // Si ahora salió con menos fuentes que lo que ya teníamos, se conservan las estaciones de la fuente que faltó (marcadas como viejas por su fecha).
      lastUy = lastUy && lastUy.stations.length && fresh.stations.length < lastUy.stations.length && now() - lastUy.fetchedAt < UY_STALE_MS ? mergeUy(lastUy, fresh) : fresh;
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

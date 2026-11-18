import type { FastifyInstance } from 'fastify';
import type { Config } from './config.ts';

/**
 * Límite de pedidos por dirección IP para los endpoints públicos que no piden clave y cuestan algo (CPU del Open-Meteo propio, consultas
 * a Georef en nombre del servidor, la base de calles, subidas de backups). Sin límite, una sola persona podía saturarlos o gastar los
 * topes de un servicio externo. Los topes son holgados (una escuela entera detrás de una sola IP no debería llegar a ellos) y se cambian
 * con variables de entorno (docs/SERVIDOR.md). Al pasarse, responde 429 con `Retry-After`; la app pasa sola al servicio público.
 */
export interface Rule {
  name: string;
  match: (method: string, path: string) => boolean;
  limit: number;
  windowMs: number;
}

export function rulesFor(config: Config): Rule[] {
  const MIN = 60_000;
  return [
    { name: 'om', match: (_m, p) => p.startsWith('/api/om/'), limit: config.rateOmPerMin, windowMs: MIN },
    { name: 'address', match: (_m, p) => p.startsWith('/api/address/'), limit: config.rateAddressPerMin, windowMs: MIN },
    { name: 'osm', match: (_m, p) => p.startsWith('/api/osm/'), limit: config.rateOsmPerMin, windowMs: MIN },
    { name: 'transfer-upload', match: (m, p) => m === 'POST' && p === '/api/transfers', limit: config.rateTransferUploadsPerHour, windowMs: 60 * MIN },
  ];
}

export function createRateLimiter(now: () => number = Date.now) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Cuenta un pedido; devuelve cuántos segundos esperar si se pasó del límite, o `null` si está dentro. */
    hit(key: string, limit: number, windowMs: number): number | null {
      const t = now();
      if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
      let b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        b = { count: 0, resetAt: t + windowMs };
        buckets.set(key, b);
      }
      b.count++;
      return b.count > limit ? Math.max(1, Math.ceil((b.resetAt - t) / 1000)) : null;
    },
    size: () => buckets.size,
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/** Engancha el límite a todos los pedidos de la aplicación. */
export function registerRateLimits(app: FastifyInstance, config: Config, limiter: RateLimiter = createRateLimiter()): void {
  const rules = rulesFor(config).filter((r) => r.limit > 0);
  app.addHook('onRequest', async (req, reply) => {
    const path = (req.raw.url ?? '').split('?')[0]!;
    const rule = rules.find((r) => r.match(req.method, path));
    if (!rule) return;
    const wait = limiter.hit(`${rule.name}|${req.ip}`, rule.limit, rule.windowMs);
    if (wait !== null) return reply.header('retry-after', String(wait)).code(429).send({ error: 'too-many-requests' });
  });
}

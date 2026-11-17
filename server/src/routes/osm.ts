import type { FastifyInstance } from 'fastify';
import type { AroundIndex } from '../osm/around.ts';

/**
 * `GET /api/osm/around?lat=&lon=`: calles con nombre, rutas, números de puerta y mojones kilométricos de alrededor de un punto, de la base
 * propia (ver osm/around.ts). Sin la base responde 503 y la app pasa a los servicios públicos de OpenStreetMap.
 */
export function osmRoutes(app: FastifyInstance, index: AroundIndex | null): void {
  app.get('/api/osm/around', async (req, reply) => {
    const q = req.query as { lat?: string; lon?: string };
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return reply.code(400).send({ error: 'lat y lon inválidos' });
    const result = index?.around(lat, lon);
    if (!result) return reply.code(503).send({ error: 'sin base de calles' });
    reply.header('Cache-Control', 'public, max-age=3600');
    return result;
  });

  /** `GET /api/osm/nearby?lat=&lon=&radius=<metros>&service=<categoría>`: lugares de «Buscar cercanos» (misma respuesta que Overpass). */
  app.get('/api/osm/nearby', async (req, reply) => {
    const q = req.query as { lat?: string; lon?: string; radius?: string; service?: string };
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    const radius = Number(q.radius ?? 25_000);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return reply.code(400).send({ error: 'lat, lon o radius inválidos' });
    const result = index?.nearby(lat, lon, radius, q.service ?? null);
    if (!result) return reply.code(503).send({ error: 'sin base de calles' });
    reply.header('Cache-Control', 'public, max-age=3600');
    return result;
  });
}

import type { FastifyInstance } from 'fastify';
import {
  RADARS,
  RADAR_ATTRIBUTION,
  RADAR_RANGE_KM,
  radarBounds,
  stateOf,
  stampToUtcMs,
  type RadarStore,
} from '../radar/sinarame.ts';

/**
 * Imágenes de los radares argentinos para el mapa de la app. `GET /api/radar` lista los radares (con su posición y los límites de su imagen);
 * con `?ids=RMA1,RMA10` además dice qué imágenes hay de esos y despierta la tarea que las busca (solo se le pregunta al servicio de radares
 * mientras alguien las mira). `GET /api/radar/:id/:stamp.png` es la imagen. Sin clave: son datos públicos (CC BY 4.0, con atribución).
 */
export function radarRoutes(app: FastifyInstance, store: RadarStore, onWake: (ids: string[]) => void, enabled = true): void {
  app.get('/api/radar', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!enabled) return { enabled: false, attribution: RADAR_ATTRIBUTION, rangeKm: RADAR_RANGE_KM, radars: [] };
    const wanted = new Set(
      String((req.query as { ids?: string }).ids ?? '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((id) => RADARS.some((r) => r.id === id))
        .slice(0, 8),
    );
    const now = Date.now();
    for (const id of wanted) stateOf(store, id).requestedAt = now;
    if (wanted.size) onWake([...wanted]);
    return {
      enabled: true,
      attribution: RADAR_ATTRIBUTION,
      rangeKm: RADAR_RANGE_KM,
      radars: RADARS.map((r) => {
        const frames = wanted.has(r.id) ? stateOf(store, r.id).frames : [];
        return {
          id: r.id,
          name: r.name,
          lat: r.lat,
          lon: r.lon,
          bounds: radarBounds(r),
          frames: frames.map((f) => ({ at: new Date(f.at).toISOString(), url: `/api/radar/${r.id}/${f.stamp}.png` })),
        };
      }),
    };
  });
  app.get('/api/radar/:id/:file', async (req, reply) => {
    const { id, file } = req.params as { id: string; file: string };
    const stamp = file.replace(/\.png$/, '');
    if (!enabled || !RADARS.some((r) => r.id === id) || stampToUtcMs(stamp) === null) return reply.code(404).send({ error: 'not-found' });
    const frame = stateOf(store, id).frames.find((f) => f.stamp === stamp);
    if (!frame) return reply.code(404).send({ error: 'not-found' });
    // Cada imagen tiene su propia hora en el nombre y no cambia: se puede guardar mucho tiempo.
    reply.header('cache-control', 'public, max-age=86400, immutable').type('image/png');
    return reply.send(frame.png);
  });
}

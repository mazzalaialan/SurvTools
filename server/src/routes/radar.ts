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
import { checkRadar, type RadarCheckDeps } from '../rain/radarCheck.ts';

/**
 * Imágenes de los radares argentinos para el mapa de la app. `GET /api/radar` lista los radares (con su posición y los límites de su imagen);
 * con `?ids=RMA1,RMA10` además dice qué imágenes hay de esos y despierta la tarea que las busca (solo se le pregunta al servicio de radares
 * mientras alguien las mira). `GET /api/radar/:id/:stamp.png` es la imagen. Sin clave: son datos públicos (CC BY 4.0, con atribución).
 */
export function radarRoutes(app: FastifyInstance, store: RadarStore, onWake: (ids: string[]) => void, enabled = true, check?: RadarCheckDeps): void {
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
  /**
   * Doble chequeo de un aviso de lluvia para la app abierta: `?lat=&lon=&state=raining|soon&minutes=`. Responde `{ verdict: 'clear' | 'echo' | 'unknown' }`;
   * solo `clear` (hay radar con imágenes recientes y no ve nada cerca) permite descartar el aviso, todo lo demás lo deja como está.
   */
  app.get('/api/radar/check', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const q = req.query as { lat?: string; lon?: string; state?: string; minutes?: string };
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    const minutes = Number(q.minutes ?? 0);
    if (!enabled || !check) return { verdict: 'unknown' };
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (q.state !== 'raining' && q.state !== 'soon') || !Number.isFinite(minutes)) {
      return reply.code(400).send({ error: 'invalid-query' });
    }
    const outlook = q.state === 'raining' ? ({ state: 'raining', mm: 0, peakMmH: 0 } as const) : ({ state: 'soon', inMinutes: minutes, startsAt: '', mm: 0, peakMmH: 0 } as const);
    const { verdict, radars } = checkRadar(check, lat, lon, outlook);
    // Primera vez para ese radar: se despierta la tarea para que baje las imágenes (esta respuesta ya no las espera).
    if (radars.some((id) => stateOf(store, id).frames.length === 0)) onWake(radars);
    return { verdict };
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

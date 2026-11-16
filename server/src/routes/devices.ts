import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { deleteDevice } from '../deleteDevice.ts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../db.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';
import { HERE_ID } from '../places.ts';
import { isValidTimeZone } from '../time.ts';

const MAX_ALERTS = 5000;
const MAX_RAIN_PLACES = 100;

const rainPlaceSchema = {
  type: 'object',
  required: ['id', 'lat', 'lon'],
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64 },
    /** Sin nombre = "donde estoy" (la app lo traduce). */
    label: { type: ['string', 'null'], maxLength: 200 },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    /** De cuándo es la ubicación (solo "donde estoy"). */
    fixAt: { type: ['string', 'null'], format: 'date-time' },
  },
} as const;

interface RainPlaceInput {
  id: string;
  label?: string | null;
  lat: number;
  lon: number;
  fixAt?: string | null;
}

/** ~1 km: alcanza para el pronóstico y el servidor no guarda la ubicación exacta. */
const coarse = (x: number) => Math.round(x * 100) / 100;

const subscriptionSchema = {
  type: 'object',
  required: ['endpoint', 'keys'],
  properties: {
    endpoint: { type: 'string', format: 'uri', maxLength: 2048 },
    keys: {
      type: 'object',
      required: ['p256dh', 'auth'],
      properties: { p256dh: { type: 'string', maxLength: 256 }, auth: { type: 'string', maxLength: 256 } },
    },
  },
} as const;

const prefsProperties = {
  timezone: { type: 'string', maxLength: 64 },
  notifyHour: { type: 'integer', minimum: 0, maximum: 23 },
  language: { type: 'string', enum: ['es', 'en'] },
  /** Avisos de actualizaciones importantes (por defecto, sí). */
  updates: { type: 'boolean' },
  /** Avisos de peligros naturales cerca (por defecto, sí). */
  hazards: { type: 'boolean' },
} as const;

const alertSchema = {
  type: 'object',
  required: ['lotId', 'itemName', 'kind', 'notifyFrom'],
  properties: {
    lotId: { type: 'string', maxLength: 64 },
    itemName: { type: 'string', maxLength: 200 },
    kind: { type: 'string', enum: ['expiry', 'capacity', 'shortage', 'minStock'] },
    dueDate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    notifyFrom: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
} as const;

interface Prefs {
  timezone: string;
  notifyHour: number;
  language: 'es' | 'en';
  updates?: boolean;
  hazards?: boolean;
}

interface AlertInput {
  lotId: string;
  itemName: string;
  kind: 'expiry' | 'capacity' | 'shortage' | 'minStock';
  dueDate: string | null;
  notifyFrom: string;
}

const gardenPlaceSchema = {
  type: 'object',
  required: ['id', 'lat', 'lon', 'frost'],
  properties: {
    id: { type: 'string', maxLength: 64 },
    label: { type: ['string', 'null'], maxLength: 300 },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    frost: {
      type: 'array',
      maxItems: 60,
      items: { type: 'object', required: ['name', 'threshold'], properties: { name: { type: 'string', maxLength: 80 }, threshold: { type: 'number' } } },
    },
    water: {
      type: ['object', 'null'],
      required: ['kc', 'thresholdMm', 'wateredOn'],
      properties: {
        kc: { type: 'number', minimum: 0, maximum: 2 },
        thresholdMm: { type: 'number', minimum: 1, maximum: 200 },
        wateredOn: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
    },
  },
} as const;

const gardenTaskSchema = {
  type: 'object',
  required: ['id', 'text', 'date'],
  properties: {
    id: { type: 'string', maxLength: 100 },
    text: { type: 'string', maxLength: 200 },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  },
} as const;

interface GardenPlaceInput {
  id: string;
  label?: string | null;
  lat: number;
  lon: number;
  frost: { name: string; threshold: number }[];
  water?: { kc: number; thresholdMm: number; wateredOn: string | null } | null;
}

interface GardenTaskInput {
  id: string;
  text: string;
  date: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest();

/** Pedidos por minuto y por IP a /api/devices (la app manda pocos: este tope es holgado, incluso detrás de una misma conexión). */
export const DEVICE_REQUESTS_PER_MIN = 300;
/** Intentos con código inválido (401) por IP en 10 minutos antes de frenar: un atacante probando códigos. */
export const DEVICE_FAILURES_PER_10MIN = 30;

/** Límite de pedidos por IP, en memoria (se reinicia con el servidor; alcanza para frenar abusos simples). */
export function createDeviceLimiter(now: () => number = Date.now, limits: { requestsPerMin: number; failuresPer10Min: number } = { requestsPerMin: DEVICE_REQUESTS_PER_MIN, failuresPer10Min: DEVICE_FAILURES_PER_10MIN }) {
  const requests = new Map<string, { count: number; resetAt: number }>();
  const failures = new Map<string, { count: number; resetAt: number }>();
  const bump = (map: Map<string, { count: number; resetAt: number }>, ip: string, windowMs: number) => {
    const t = now();
    const cur = map.get(ip);
    const entry = cur && cur.resetAt > t ? cur : { count: 0, resetAt: t + windowMs };
    entry.count += 1;
    map.set(ip, entry);
    // Se limpia de vez en cuando para que el mapa no crezca sin control.
    if (map.size > 5000) for (const [k, v] of map) if (v.resetAt <= t) map.delete(k);
    return entry.count;
  };
  return {
    /** true si este pedido hay que rechazar con 429. */
    blocked(ip: string): boolean {
      const f = failures.get(ip);
      if (f && f.resetAt > now() && f.count >= limits.failuresPer10Min) return true;
      return bump(requests, ip, 60_000) > limits.requestsPerMin;
    },
    /** Se anota un intento con código inválido. */
    failed(ip: string): void {
      bump(failures, ip, 600_000);
    },
  };
}

export function deviceRoutes(app: FastifyInstance, db: Db, push: PushSender, limits?: { requestsPerMin: number; failuresPer10Min: number }): void {
  const limiter = createDeviceLimiter(Date.now, limits);
  // Solo las rutas de dispositivos: frena el abuso por IP sin tocar al resto del servidor.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/devices')) return;
    if (limiter.blocked(req.ip)) return reply.code(429).header('retry-after', '60').send({ error: 'too-many' });
  });
  app.addHook('onResponse', async (req, reply) => {
    if (req.url.startsWith('/api/devices') && reply.statusCode === 401) limiter.failed(req.ip);
  });

  /** Valida `Authorization: Bearer <token>` contra el dispositivo; responde 401 si no corresponde. */
  function authorize(req: FastifyRequest<{ Params: { id: string } }>): boolean {
    const row = db.prepare('SELECT token_hash FROM devices WHERE id = ?').get(req.params.id) as { token_hash: string } | undefined;
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!row || !token) return false;
    return timingSafeEqual(Buffer.from(row.token_hash, 'hex'), hashToken(token));
  }

  app.post<{ Body: { subscription: PushSubscriptionJson } & Prefs }>(
    '/api/devices',
    {
      schema: {
        body: {
          type: 'object',
          required: ['subscription', 'timezone', 'notifyHour', 'language'],
          properties: { subscription: subscriptionSchema, ...prefsProperties },
        },
      },
    },
    async (req, reply) => {
      const { subscription, timezone, notifyHour, language, updates, hazards } = req.body;
      if (!isValidTimeZone(timezone)) return reply.code(400).send({ error: 'invalid-timezone' });
      const id = randomUUID();
      const token = randomBytes(32).toString('base64url');
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO devices (id, token_hash, subscription, timezone, notify_hour, language, updates, hazards, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, hashToken(token).toString('hex'), JSON.stringify(subscription), timezone, notifyHour, language, updates === false ? 0 : 1, hazards === false ? 0 : 1, now, now);
      // El token se devuelve una sola vez; el servidor solo guarda su hash.
      return reply.code(201).send({ deviceId: id, token });
    },
  );

  app.put<{ Params: { id: string }; Body: Partial<Prefs> & { subscription?: PushSubscriptionJson; alerts: AlertInput[] } }>(
    '/api/devices/:id',
    {
      bodyLimit: 2 * 1024 * 1024,
      schema: {
        body: {
          type: 'object',
          required: ['alerts'],
          properties: {
            subscription: subscriptionSchema,
            ...prefsProperties,
            alerts: { type: 'array', maxItems: MAX_ALERTS, items: alertSchema },
          },
        },
      },
    },
    async (req, reply) => {
      if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
      const { id } = req.params;
      const { subscription, timezone, notifyHour, language, updates, hazards, alerts } = req.body;
      if (timezone && !isValidTimeZone(timezone)) return reply.code(400).send({ error: 'invalid-timezone' });

      db.exec('BEGIN');
      try {
        db.prepare(
          `UPDATE devices SET
             subscription = COALESCE(?, subscription),
             timezone = COALESCE(?, timezone),
             notify_hour = COALESCE(?, notify_hour),
             language = COALESCE(?, language),
             updates = COALESCE(?, updates),
             hazards = COALESCE(?, hazards),
             updated_at = ?
           WHERE id = ?`,
        ).run(
          subscription ? JSON.stringify(subscription) : null,
          timezone ?? null,
          notifyHour ?? null,
          language ?? null,
          updates === undefined ? null : updates ? 1 : 0,
          hazards === undefined ? null : hazards ? 1 : 0,
          new Date().toISOString(),
          id,
        );
        // El índice se reemplaza completo: la app siempre manda el estado actual.
        db.prepare('DELETE FROM alerts WHERE device_id = ?').run(id);
        const insert = db.prepare(
          'INSERT INTO alerts (device_id, lot_id, item_name, kind, due_date, notify_from) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const a of alerts) insert.run(id, a.lotId, a.itemName, a.kind, a.dueDate ?? null, a.notifyFrom);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return reply.code(204).send();
    },
  );

  /**
   * Lugares con aviso de lluvia con la app cerrada. Se reemplaza la lista
   * completa; vacía = apagado. Se conserva si ya se avisó cada lugar, para no
   * repetir el aviso del mismo episodio.
   */
  app.put<{ Params: { id: string }; Body: { places: RainPlaceInput[]; keepHere?: boolean } }>(
    '/api/devices/:id/rain',
    {
      schema: {
        body: {
          type: 'object',
          required: ['places'],
          properties: {
            places: { type: 'array', maxItems: MAX_RAIN_PLACES, items: rainPlaceSchema },
            /** La app todavía no leyó el GPS: conservar el "donde estoy" que ya está. */
            keepHere: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
      const { id } = req.params;
      const places = [...new Map(req.body.places.map((p) => [p.id, p])).values()];
      db.exec('BEGIN');
      try {
        const previous = db.prepare('SELECT place_id, lat, lon, notified FROM rain_places WHERE device_id = ?').all(id) as unknown as {
          place_id: string;
          lat: number;
          lon: number;
          notified: number;
        }[];
        const old = new Map(previous.map((r) => [r.place_id, r]));
        db.prepare(`DELETE FROM rain_places WHERE device_id = ?${req.body.keepHere ? ` AND place_id <> '${HERE_ID}'` : ''}`).run(id);
        const insert = db.prepare(
          'INSERT INTO rain_places (device_id, place_id, label, lat, lon, fix_at, notified) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        for (const p of req.body.keepHere ? places.filter((p) => p.id !== HERE_ID) : places) {
          const lat = coarse(p.lat);
          const lon = coarse(p.lon);
          const before = old.get(p.id);
          // Si se movió menos de ~10 km sigue el mismo episodio de lluvia; si no, se vuelve a avisar.
          const near = before && Math.abs(before.lat - lat) < 0.1 && Math.abs(before.lon - lon) < 0.1;
          const notified = near ? before.notified : 0;
          insert.run(id, p.id, p.label ?? null, lat, lon, p.fixAt ?? null, notified);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return reply.code(204).send();
    },
  );

  /**
   * Huerta con la app cerrada: un lugar por grupo de canteros (~1 km), con lo
   * necesario para la helada y el riego, y las tareas próximas. Se reemplaza
   * todo; se conserva lo ya avisado (misma helada, mismo episodio de riego,
   * misma tarea) para no repetir.
   */
  app.put<{ Params: { id: string }; Body: { places: GardenPlaceInput[]; tasks: GardenTaskInput[] } }>(
    '/api/devices/:id/garden',
    {
      schema: {
        body: {
          type: 'object',
          required: ['places', 'tasks'],
          properties: {
            places: { type: 'array', maxItems: 20, items: gardenPlaceSchema },
            tasks: { type: 'array', maxItems: 100, items: gardenTaskSchema },
          },
        },
      },
    },
    async (req, reply) => {
      if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
      const { id } = req.params;
      db.exec('BEGIN');
      try {
        const oldPlaces = new Map(
          (db.prepare('SELECT place_id, lat, lon, water, frost_notified_date, water_notified, water_checked_day FROM garden_places WHERE device_id = ?').all(id) as unknown as {
            place_id: string;
            lat: number;
            lon: number;
            water: string | null;
            frost_notified_date: string | null;
            water_notified: number;
            water_checked_day: string | null;
          }[]).map((r) => [r.place_id, r]),
        );
        const oldTasks = new Map(
          (db.prepare('SELECT task_id, date, notified FROM garden_tasks WHERE device_id = ?').all(id) as unknown as { task_id: string; date: string; notified: number }[]).map((r) => [r.task_id, r]),
        );
        db.prepare('DELETE FROM garden_places WHERE device_id = ?').run(id);
        db.prepare('DELETE FROM garden_tasks WHERE device_id = ?').run(id);
        const insertPlace = db.prepare(
          `INSERT INTO garden_places (device_id, place_id, label, lat, lon, frost, water, frost_notified_date, water_notified, water_checked_day)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const p of [...new Map(req.body.places.map((x) => [x.id, x])).values()]) {
          const lat = coarse(p.lat);
          const lon = coarse(p.lon);
          const before = oldPlaces.get(p.id);
          const same = before && Math.abs(before.lat - lat) < 0.02 && Math.abs(before.lon - lon) < 0.02;
          const oldWatered = before?.water ? (JSON.parse(before.water) as { wateredOn: string | null }).wateredOn : null;
          // Si marcó "regué" de nuevo, empieza otro episodio de riego.
          const sameWaterEpisode = same && oldWatered === (p.water?.wateredOn ?? null);
          insertPlace.run(
            id,
            p.id,
            p.label ?? null,
            lat,
            lon,
            JSON.stringify(p.frost),
            p.water ? JSON.stringify(p.water) : null,
            same ? before.frost_notified_date : null,
            sameWaterEpisode ? before.water_notified : 0,
            sameWaterEpisode ? before.water_checked_day : null,
          );
        }
        const insertTask = db.prepare('INSERT INTO garden_tasks (device_id, task_id, text, date, notified) VALUES (?, ?, ?, ?, ?)');
        for (const t of [...new Map(req.body.tasks.map((x) => [x.id, x])).values()]) {
          const before = oldTasks.get(t.id);
          insertTask.run(id, t.id, t.text, t.date, before && before.date === t.date ? before.notified : 0);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return reply.code(204).send();
    },
  );

  /**
   * Lugares donde se guarda reserva (ubicaciones del inventario con waypoint),
   * solo para los avisos de peligros naturales. Se reemplaza la lista.
   */
  app.put<{ Params: { id: string }; Body: { places: { id: string; label?: string | null; lat: number; lon: number }[] } }>(
    '/api/devices/:id/stock',
    {
      schema: {
        body: {
          type: 'object',
          required: ['places'],
          properties: {
            places: {
              type: 'array',
              maxItems: 50,
              items: {
                type: 'object',
                required: ['id', 'lat', 'lon'],
                properties: {
                  id: { type: 'string', maxLength: 64 },
                  label: { type: ['string', 'null'], maxLength: 200 },
                  lat: { type: 'number', minimum: -90, maximum: 90 },
                  lon: { type: 'number', minimum: -180, maximum: 180 },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
      const { id } = req.params;
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM stock_places WHERE device_id = ?').run(id);
        const insert = db.prepare('INSERT INTO stock_places (device_id, place_id, label, lat, lon) VALUES (?, ?, ?, ?, ?)');
        for (const p of [...new Map(req.body.places.map((x) => [x.id, x])).values()]) insert.run(id, p.id, p.label ?? null, coarse(p.lat), coarse(p.lon));
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return reply.code(204).send();
    },
  );

  /**
   * Hora límite de regreso de una salida (una por dispositivo): si pasa sin que la app la
   * extienda o la cierre, el servidor avisa al dispositivo (ver outings/watch.ts). Solo
   * se guardan la hora y el texto del aviso, escrito por la app en su idioma.
   */
  app.put<{ Params: { id: string }; Body: { outingId: string; returnBy: string; title: string; body: string } }>(
    '/api/devices/:id/deadline',
    {
      bodyLimit: 2048,
      schema: {
        body: {
          type: 'object',
          required: ['outingId', 'returnBy', 'title', 'body'],
          additionalProperties: false,
          properties: {
            outingId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' },
            returnBy: { type: 'string', format: 'date-time' },
            title: { type: 'string', minLength: 1, maxLength: 120 },
            body: { type: 'string', minLength: 1, maxLength: 300 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
      const returnBy = Date.parse(req.body.returnBy);
      const now = Date.now();
      // Ni de hace más de un día ni de dentro de más de un mes: no es una salida razonable.
      if (!Number.isFinite(returnBy) || returnBy < now - 24 * 3_600_000 || returnBy > now + 30 * 24 * 3_600_000) return reply.code(400).send({ error: 'invalid' });
      const { outingId, title, body } = req.body;
      // Si cambia la hora (la extendió) o es otra salida, se vuelve a empezar a contar los avisos.
      db.prepare(
        `INSERT INTO outing_deadlines (device_id, outing_id, return_by, title, body, notified_count, last_notified)
         VALUES (?, ?, ?, ?, ?, 0, NULL)
         ON CONFLICT(device_id) DO UPDATE SET
           notified_count = CASE WHEN outing_deadlines.outing_id = excluded.outing_id AND outing_deadlines.return_by = excluded.return_by THEN outing_deadlines.notified_count ELSE 0 END,
           last_notified = CASE WHEN outing_deadlines.outing_id = excluded.outing_id AND outing_deadlines.return_by = excluded.return_by THEN outing_deadlines.last_notified ELSE NULL END,
           outing_id = excluded.outing_id, return_by = excluded.return_by, title = excluded.title, body = excluded.body`,
      ).run(req.params.id, outingId, returnBy, title, body);
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>('/api/devices/:id/deadline', async (req, reply) => {
    if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
    db.prepare('DELETE FROM outing_deadlines WHERE device_id = ?').run(req.params.id);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/devices/:id', async (req, reply) => {
    // Eliminar mi cuenta: las demás tablas del dispositivo se borran en cascada.
    if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
    deleteDevice(db, req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/devices/:id/test', async (req, reply) => {
    if (!authorize(req)) return reply.code(401).send({ error: 'unauthorized' });
    const row = db.prepare('SELECT subscription FROM devices WHERE id = ?').get(req.params.id) as { subscription: string };
    const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, { type: 'test' });
    if (!delivered) {
      db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id);
      return reply.code(410).send({ error: 'subscription-gone' });
    }
    return reply.code(204).send();
  });
}

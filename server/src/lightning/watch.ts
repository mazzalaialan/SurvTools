import type { Db } from '../db.ts';
import { bearingDeg, distanceKm, withoutDuplicateHere } from '../places.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';
import type { Flash } from './glm.ts';

interface PlaceRow {
  device_id: string;
  place_id: string;
  label: string | null;
  lat: number;
  lon: number;
  fix_at: string | null;
  lightning_notified_at: number | null;
  subscription: string;
}

export interface LightningOptions {
  /** Avisar si cae un rayo a menos de esto. */
  radiusKm: number;
  /** Como mucho un aviso por lugar en este tiempo, mientras sigan cayendo rayos cerca. */
  everyMs: number;
  /**
   * Excepción: si la tormenta se acercó al menos esto (km) respecto del último aviso, se avisa de nuevo aunque no haya pasado `everyMs`
   * (ahí el aviso trae algo nuevo), pero no antes de `approachAfterMs`.
   */
  approachKm: number;
  approachAfterMs: number;
  hereMaxAgeMs: number;
}

export const LIGHTNING_DEFAULTS: LightningOptions = {
  radiusKm: 30,
  // Con la tormenta encima caen rayos todo el tiempo: un aviso cada 30 minutos alcanza (cada 10 era insistir).
  everyMs: 30 * 60_000,
  approachKm: 10,
  approachAfterMs: 10 * 60_000,
  hereMaxAgeMs: 24 * 3_600_000,
};

/** A qué distancia estaba la tormenta en el último aviso de cada lugar (en memoria: tras un reinicio solo rige el tope de tiempo). */
const lastKm = new WeakMap<Db, Map<string, number>>();

export interface LightningResult {
  sent: number;
  removed: number;
}

/** ¿Hay algún lugar con aviso? Si no, no hace falta bajar los archivos del satélite. */
export function hasPlaces(db: Db): boolean {
  return !!db.prepare('SELECT 1 FROM rain_places LIMIT 1').get();
}

/**
 * Con los rayos nuevos de esta pasada: avisa a cada lugar que tenga uno a
 * menos de `radiusKm`, con la distancia y el rumbo del más cercano. Mientras
 * la tormenta sigue, como mucho un aviso cada `everyMs` (el nuevo reemplaza
 * al anterior en la barra de notificaciones), salvo que se haya acercado
 * `approachKm` o más desde el último aviso.
 */
export async function runLightningWatch(db: Db, push: PushSender, flashes: Flash[], now = new Date(), options: LightningOptions = LIGHTNING_DEFAULTS): Promise<LightningResult> {
  const result: LightningResult = { sent: 0, removed: 0 };
  const rows = withoutDuplicateHere(
    db
      .prepare(
        `SELECT p.device_id, p.place_id, p.label, p.lat, p.lon, p.fix_at, p.lightning_notified_at, d.subscription
         FROM rain_places p JOIN devices d ON d.id = p.device_id`,
      )
      .all() as unknown as PlaceRow[],
  ).filter((r) => r.fix_at === null || now.getTime() - Date.parse(r.fix_at) <= options.hereMaxAgeMs);

  const markNotified = db.prepare('UPDATE rain_places SET lightning_notified_at = ? WHERE device_id = ? AND place_id = ?');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');
  const gone = new Set<string>();
  // Un grado de latitud son ~111 km: descarta rápido los rayos lejanos antes de calcular la distancia.
  const span = options.radiusKm / 111 + 0.1;

  for (const row of rows) {
    if (gone.has(row.device_id)) continue;
    let nearest: { flash: Flash; km: number } | null = null;
    for (const f of flashes) {
      if (Math.abs(f.lat - row.lat) > span) continue;
      const km = distanceKm(row, f);
      if (km <= options.radiusKm && (!nearest || km < nearest.km)) nearest = { flash: f, km };
    }

    if (!nearest) continue;
    const memory = lastKm.get(db) ?? lastKm.set(db, new Map()).get(db)!;
    const key = `${row.device_id}|${row.place_id}`;
    if (row.lightning_notified_at !== null) {
      const elapsed = now.getTime() - row.lightning_notified_at;
      const before = memory.get(key);
      const approaching = before !== undefined && nearest.km <= before - options.approachKm && elapsed >= options.approachAfterMs;
      if (elapsed < options.everyMs && !approaching) continue;
    }
    const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, {
      type: 'lightning',
      lightning: {
        placeId: row.place_id,
        label: row.label,
        distanceKm: Math.round(nearest.km),
        bearing: Math.round(bearingDeg(row, nearest.flash)) % 360,
        fixAt: row.fix_at,
      },
    });
    if (!delivered) {
      removeDevice.run(row.device_id);
      gone.add(row.device_id);
      result.removed++;
      continue;
    }
    markNotified.run(now.getTime(), row.device_id, row.place_id);
    memory.set(key, nearest.km);
    result.sent++;
  }
  return result;
}

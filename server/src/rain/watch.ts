import type { Db } from '../db.ts';
import { withoutDuplicateHere } from '../places.ts';
import type { PushSender, PushSubscriptionJson } from '../push.ts';
import type { RainSource } from './source.ts';
import { nextEpisode } from './episode.ts';

interface PlaceRow {
  device_id: string;
  place_id: string;
  label: string | null;
  lat: number;
  lon: number;
  fix_at: string | null;
  notified: number;
  rain_level: number;
  dry_since: number | null;
  subscription: string;
}

/**
 * `rain_places.notified`: 0 sin aviso; 1 hay un aviso de «está lloviendo» en el celular; 2 hay un aviso de «va a llover»
 * (con su hora); 3 el episodio sigue pero el aviso ya se sacó porque dejó de llover. Así no hace falta una migración nueva.
 */
const NOTIFIED = { none: 0, raining: 1, soon: 2, cleared: 3 } as const;

/** Tiempo seco seguido antes de sacar el aviso: el pronóstico va y viene entre seco y lluvia cada 15 minutos. */
export const CLEAR_AFTER_MS = 20 * 60_000;

export interface RainWatchResult {
  checked: number;
  sent: number;
  removed: number;
}

/**
 * Una pasada de los avisos de lluvia con la app cerrada: consulta cada lugar
 * (los repetidos, una sola vez) y avisa una vez por episodio, igual que la app
 * abierta (app/src/modules/weather/rainWatch.ts): el episodio termina recién
 * después de 3 horas sin lluvia, y dentro de él solo se vuelve a avisar si la
 * lluvia sube de nivel (rain/episode.ts). "Donde estoy" usa la última
 * ubicación que mandó la app; si es más vieja que `hereMaxAgeMs`, no se usa, y
 * si está cerca de un waypoint con aviso, avisa solo el waypoint.
 */
export async function runRainWatch(db: Db, push: PushSender, source: RainSource, now = new Date(), hereMaxAgeMs = 24 * 3_600_000): Promise<RainWatchResult> {
  const result: RainWatchResult = { checked: 0, sent: 0, removed: 0 };
  const rows = withoutDuplicateHere(
    db
      .prepare(
        `SELECT p.device_id, p.place_id, p.label, p.lat, p.lon, p.fix_at, p.notified, p.rain_level, p.dry_since, d.subscription
         FROM rain_places p JOIN devices d ON d.id = p.device_id`,
      )
      .all() as unknown as PlaceRow[],
  ).filter((r) => r.fix_at === null || now.getTime() - Date.parse(r.fix_at) <= hereMaxAgeMs);
  if (rows.length === 0) return result;

  const keyOf = (r: PlaceRow) => `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
  const unique = [...new Map(rows.map((r) => [keyOf(r), { lat: r.lat, lon: r.lon }])).entries()];
  const outlooks = await source.outlooks(unique.map(([, p]) => p));
  const byKey = new Map(unique.map(([key], i) => [key, outlooks[i] ?? null]));
  result.checked = unique.length;

  const save = db.prepare('UPDATE rain_places SET notified = ?, rain_level = ?, dry_since = ? WHERE device_id = ? AND place_id = ?');
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');
  const gone = new Set<string>();

  for (const row of rows) {
    if (gone.has(row.device_id)) continue;
    const outlook = byKey.get(keyOf(row));
    if (!outlook) continue;
    // Después de un «dejó de llover» (notified = 3) una lluvia nueva es otro aviso: ya pasó un rato seco, no es un vaivén del pronóstico.
    const reopened = row.notified === NOTIFIED.cleared && outlook.state !== 'dry';
    const prev = row.notified && !reopened ? { level: row.rain_level || 1, drySince: row.dry_since } : null;
    const { episode, notify } = nextEpisode(prev, outlook, now.getTime());
    const visible = row.notified === NOTIFIED.raining || row.notified === NOTIFIED.soon;
    const store = (notified: number) => save.run(notified, episode?.level ?? 0, episode?.drySince ?? null, row.device_id, row.place_id);
    /** Lo que ya está guardado se conserva (episodio vivo, sin aviso nuevo); sin episodio, nada. */
    const keep = episode ? row.notified || NOTIFIED.raining : NOTIFIED.none;

    // Qué hay que mandar: un aviso nuevo, el cambio de «va a llover» a «está lloviendo», o sacar el aviso porque dejó de llover.
    let kind: 'new' | 'raining' | 'clear' | null = null;
    if (notify && outlook.state !== 'dry') kind = 'new';
    else if (visible && row.notified === NOTIFIED.soon && outlook.state === 'raining') kind = 'raining';
    else if (visible && outlook.state === 'dry' && episode?.drySince != null && now.getTime() - episode.drySince >= CLEAR_AFTER_MS) kind = 'clear';

    if (!kind) {
      if (prev?.level !== episode?.level || prev?.drySince !== episode?.drySince || keep !== row.notified) store(keep);
      continue;
    }
    const base = { placeId: row.place_id, label: row.label, fixAt: row.fix_at };
    const rain =
      kind === 'clear'
        ? { ...base, state: 'raining' as const, inMinutes: 0, mm: 0, clear: true }
        : {
            ...base,
            state: kind === 'raining' ? ('raining' as const) : outlook.state === 'soon' ? ('soon' as const) : ('raining' as const),
            inMinutes: kind !== 'raining' && outlook.state === 'soon' ? outlook.inMinutes : 0,
            // La hora en que empieza, absoluta: «en 105 minutos» deja de ser cierto a los pocos minutos, la hora no.
            ...(kind !== 'raining' && outlook.state === 'soon' ? { startsAt: now.getTime() + outlook.inMinutes * 60_000 } : {}),
            mm: outlook.state === 'dry' ? 0 : Math.round(outlook.mm * 10) / 10,
            ...(outlook.state === 'raining' && outlook.observedMmH !== undefined ? { observedMmH: outlook.observedMmH } : {}),
            ...(kind === 'new' && notify === 'stronger' ? { stronger: true } : {}),
            // El cambio a «está lloviendo» reemplaza al aviso anterior sin volver a sonar.
            ...(kind === 'raining' ? { update: true } : {}),
          };
    const delivered = await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, { type: 'rain', rain });
    if (!delivered) {
      removeDevice.run(row.device_id);
      gone.add(row.device_id);
      result.removed++;
      continue;
    }
    store(kind === 'clear' ? NOTIFIED.cleared : rain.state === 'soon' ? NOTIFIED.soon : NOTIFIED.raining);
    result.sent++;
  }
  return result;
}

import { parseArgs } from 'node:util';
import type { Db } from './db.ts';
import type { PushPayload, PushSender, PushSubscriptionJson } from './push.ts';

/**
 * Aviso de una actualización importante a los dispositivos registrados que
 * no lo apagaron. Se manda a mano, solo cuando una versión lo merece, y cada
 * versión una sola vez:
 *
 *   node src/announce.ts --version 0.23.0 \
 *     --title-es "…" --body-es "…" --title-en "…" --body-en "…" [--title-pt "…" --body-pt "…"] [--dry-run] [--force]
 *
 * En el servidor: `docker compose exec vikarg node src/announce.ts …`.
 */

export interface Announcement {
  version: string;
  title: { es: string; en: string; pt?: string };
  body: { es: string; en: string; pt?: string };
}

export interface AnnounceResult {
  /** Dispositivos con los avisos prendidos. */
  devices: number;
  delivered: number;
  /** Suscripciones que ya no existen (se borran). */
  removed: number;
  failed: number;
  /** Por qué falló cada dispositivo con error (sin datos del dispositivo): sin esto, un fallo no dejaba rastro. */
  errors: string[];
  /** Ya se había anunciado esa versión (no se manda de nuevo sin `force`). */
  already: boolean;
}

export async function announce(db: Db, push: PushSender, a: Announcement, options: { dryRun?: boolean; force?: boolean } = {}): Promise<AnnounceResult> {
  const rows = db.prepare('SELECT id, subscription FROM devices WHERE updates = 1').all() as { id: string; subscription: string }[];
  const already = !!db.prepare('SELECT 1 FROM announcements WHERE version = ?').get(a.version);
  const result: AnnounceResult = { devices: rows.length, delivered: 0, removed: 0, failed: 0, errors: [], already };
  if (options.dryRun || (already && !options.force)) return result;
  const payload: PushPayload = { type: 'update', update: a };
  const removeDevice = db.prepare('DELETE FROM devices WHERE id = ?');
  for (const row of rows) {
    try {
      if (await push.send(JSON.parse(row.subscription) as PushSubscriptionJson, payload)) result.delivered++;
      else {
        removeDevice.run(row.id);
        result.removed++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push((err as Error).message ?? String(err));
    }
  }
  db.prepare('INSERT OR REPLACE INTO announcements (version, sent_at, devices, delivered) VALUES (?, ?, ?, ?)').run(
    a.version,
    new Date().toISOString(),
    rows.length,
    result.delivered,
  );
  return result;
}

const LIMIT = { title: 80, body: 300 };

export function parseAnnouncement(argv: string[]): { announcement: Announcement; dryRun: boolean; force: boolean } {
  const { values } = parseArgs({
    args: argv,
    options: {
      version: { type: 'string' },
      'title-es': { type: 'string' },
      'body-es': { type: 'string' },
      'title-en': { type: 'string' },
      'body-en': { type: 'string' },
      'title-pt': { type: 'string' },
      'body-pt': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const need = (k: keyof typeof values, max: number) => {
    const v = values[k];
    if (typeof v !== 'string' || !v.trim()) throw new Error(`Falta --${k}`);
    if (v.length > max) throw new Error(`--${k} es muy largo (máximo ${max} caracteres)`);
    return v.trim();
  };
  const version = need('version', 32);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('--version tiene que ser como 0.23.0');
  // El portugués es opcional: sin él, los usuarios en portugués reciben el aviso en español.
  const optional = (k: 'title-pt' | 'body-pt', max: number) => (typeof values[k] === 'string' && values[k]!.trim() ? need(k, max) : undefined);
  const titlePt = optional('title-pt', LIMIT.title);
  const bodyPt = optional('body-pt', LIMIT.body);
  return {
    announcement: {
      version,
      title: { es: need('title-es', LIMIT.title), en: need('title-en', LIMIT.title), ...(titlePt ? { pt: titlePt } : {}) },
      body: { es: need('body-es', LIMIT.body), en: need('body-en', LIMIT.body), ...(bodyPt ? { pt: bodyPt } : {}) },
    },
    dryRun: values['dry-run'] === true,
    force: values.force === true,
  };
}

// Como comando.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { loadConfig } = await import('./config.ts');
  const { openDb } = await import('./db.ts');
  const { createPushSender } = await import('./push.ts');
  const { createFcmSender, readServiceAccount } = await import('./fcm.ts');
  try {
    const { announcement, dryRun, force } = parseAnnouncement(process.argv.slice(2));
    const config = loadConfig();
    const db = openDb(config.dataDir);
    // Igual que el servidor: los dispositivos de la app nativa reciben por Firebase. Sin esto, el comando los daba siempre por fallidos
    // («fcm-not-configured») aunque el servidor sí tuviera Firebase (se vio al anunciar la 0.92: llegó a 1 de 2 dispositivos).
    let fcm: ReturnType<typeof createFcmSender> | null = null;
    if (config.fcmServiceAccountFile) fcm = createFcmSender(readServiceAccount(config.fcmServiceAccountFile));
    const r = await announce(db, createPushSender(db, config.vapidSubject, fcm), announcement, { dryRun, force });
    if (r.already && !force) console.log(`La versión ${announcement.version} ya se anunció. Para mandarla de nuevo: --force.`);
    else if (dryRun) console.log(`Prueba: se mandaría a ${r.devices} dispositivos.`);
    else console.log(`Enviado a ${r.devices} dispositivos: ${r.delivered} entregados, ${r.removed} ya no existen (borrados), ${r.failed} con error.`);
    for (const message of r.errors ?? []) console.log(`  - error: ${message}`);
    db.close();
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}

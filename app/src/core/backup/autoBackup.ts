import { ENTITY_TABLES, db } from '@/core/db/db';
import { isNativePlatform } from '@/core/platform';
import { isOpenHeader, readStoredHeader } from '@/core/security/vault';
import { useSettings } from '@/core/settings/settings';
import { backupFileName, exportBackup } from './backup';

/**
 * Copia automática de los datos críticos (app nativa). El inventario, los documentos y los recorridos viven en IndexedDB, dentro del
 * almacenamiento del WebView: si Android o el usuario lo borran (o se desinstala la app), se pierden. Esta copia es el mismo archivo `.vikarg`
 * del backup manual (las filas ya van cifradas y se abre con la contraseña o la clave de recuperación; NO hace falta la contraseña para
 * hacerla, ni siquiera con la app bloqueada) guardado en Documentos/VikArg/copia-automatica, que está fuera del WebView y sobrevive a
 * desinstalar la app. Se guardan las últimas `KEEP_COPIES`. Una copia en el mismo teléfono NO reemplaza al backup en otro lugar (si se pierde
 * el teléfono se pierde todo): por eso el recordatorio de backup sigue igual.
 *
 * Bóveda «sin contraseña»: el backup necesita una contraseña propia. Se elige una vez («contraseña de las copias») y queda guardada en la app, sin
 * cifrar, igual que los datos de ese modo: solo protege el archivo de quien lo encuentre en el teléfono o en la PC; hace falta para abrir la copia.
 */
export const AUTO_DIR = 'VikArg/copia-automatica';
export const KEEP_COPIES = 3;
/** Como mucho una por día, y solo si algo cambió desde la última. */
export const MIN_INTERVAL_MS = 24 * 3_600_000;
const META_KEY = 'autoBackup';
const PASSWORD_KEY = 'autoBackupPassword';

/** Bóveda sin contraseña: la contraseña con la que se cifran las copias automáticas. */
export async function setAutoBackupPassword(password: string): Promise<void> {
  await db.meta.put({ key: PASSWORD_KEY, value: password });
}

export async function hasAutoBackupPassword(): Promise<boolean> {
  return !!(await db.meta.get(PASSWORD_KEY))?.value;
}

export interface AutoBackupState {
  at: string;
  fingerprint: string;
  /** Dónde quedó, para mostrarlo. */
  where: string;
  bytes: number;
}

export type AutoBackupResult = 'done' | 'disabled' | 'unsupported' | 'needs-password' | 'recent' | 'unchanged' | 'error';

export async function autoBackupState(): Promise<AutoBackupState | null> {
  return ((await db.meta.get(META_KEY))?.value as AutoBackupState | undefined) ?? null;
}

/** Huella barata de los datos: cuántas filas y la última modificación de cada tabla (más los adjuntos). Si no cambia, no hay nada nuevo que copiar. */
export async function dataFingerprint(): Promise<string> {
  const parts: string[] = [];
  for (const table of ENTITY_TABLES) {
    const t = db.entityTable(table);
    const last = await t.orderBy('updatedAt').last();
    parts.push(`${table}:${await t.count()}:${last?.updatedAt ?? ''}`);
  }
  parts.push(`blobs:${await db.blobs.count()}`);
  return parts.join('|');
}

/** ¿Toca hacer una copia ahora? (pura, para probarla) */
export function shouldBackup(prev: Pick<AutoBackupState, 'at' | 'fingerprint'> | null, fingerprint: string, now = Date.now(), force = false): 'run' | 'recent' | 'unchanged' {
  if (force || !prev) return 'run';
  if (prev.fingerprint === fingerprint) return 'unchanged';
  return now - new Date(prev.at).getTime() < MIN_INTERVAL_MS ? 'recent' : 'run';
}

let running: Promise<AutoBackupResult> | null = null;

/** Hace la copia si corresponde. `force`: ignora el plazo y la huella (el botón «Hacer una ahora»). */
export function runAutoBackup(opts: { force?: boolean } = {}): Promise<AutoBackupResult> {
  running ??= doBackup(opts.force ?? false).finally(() => (running = null));
  return running;
}

async function doBackup(force: boolean): Promise<AutoBackupResult> {
  if (!isNativePlatform()) return 'unsupported';
  if (!useSettings.getState().settings.autoBackup && !force) return 'disabled';
  try {
    const header = await readStoredHeader();
    if (!header) return 'unchanged'; // todavía no hay bóveda: nada que copiar
    const copyPassword = isOpenHeader(header) ? ((await db.meta.get(PASSWORD_KEY))?.value as string | undefined) : undefined;
    if (isOpenHeader(header) && !copyPassword) return 'needs-password';
    const fingerprint = await dataFingerprint();
    const prev = await autoBackupState();
    const decision = shouldBackup(prev, fingerprint, Date.now(), force);
    if (decision !== 'run') return decision;
    const bytes = await exportBackup(__APP_VERSION__, copyPassword);
    const { saveNative, pruneNative } = await import('@/ui/nativeFiles');
    const where = await saveNative(bytes, backupFileName().replace('vikarg-backup-', 'vikarg-auto-'), AUTO_DIR);
    await pruneNative(AUTO_DIR, KEEP_COPIES, '.vikarg');
    await db.meta.put({ key: META_KEY, value: { at: new Date().toISOString(), fingerprint, where, bytes: bytes.length } satisfies AutoBackupState });
    return 'done';
  } catch (err) {
    console.error('[copia] no se pudo hacer la copia automática', err);
    return 'error';
  }
}

let started = false;

/** App nativa: revisa un rato después de abrir, al volver a la app y cada 6 horas con la app abierta. */
export async function startAutoBackup(): Promise<void> {
  if (started) return;
  started = true;
  const { App } = await import('@capacitor/app');
  const run = () => void runAutoBackup();
  setTimeout(run, 30_000);
  setInterval(run, 6 * 3_600_000);
  void App.addListener('appStateChange', (s) => {
    if (s.isActive) setTimeout(run, 10_000);
  });
}

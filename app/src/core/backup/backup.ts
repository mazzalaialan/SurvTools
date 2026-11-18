import { strFromU8, strToU8, unzipSync, zipSync, Zip, ZipPassThrough } from 'fflate';
import { normalizeRecoveryKey, unwrapDek, wrapDek, WrongSecretError, type Sealed, type WrappedKey } from '@/core/crypto/crypto';
import { ENTITY_TABLES, db, type EncryptedRow } from '@/core/db/db';
import type { EntityTable } from '@/core/model/types';
import { getDek, setDek } from '@/core/security/session';
import { VAULT_HEADER_KEY, isOpenHeader, kdfIterations, openHeaderFor, readStoredHeader } from '@/core/security/vault';
import type { Settings } from '@/core/settings/settings';
import { today } from '@/modules/inventory/domain/dates';

/**
 * Backup `.vikarg` (ARQUITECTURA §8.1). Las filas viajan tal como están en la
 * base, ya cifradas con la DEK, junto con el encabezado que la envuelve: el
 * archivo se abre con la contraseña vigente al exportar o con la clave de
 * recuperación. Restaurar reemplaza todo.
 *
 * Bóveda sin contraseña: el backup igual sale cifrado, con una contraseña que
 * se elige al hacerlo (no hay clave de recuperación). Al restaurarlo, el
 * dispositivo queda otra vez sin contraseña (`vault.open`).
 */

export const BACKUP_FORMAT = 'vikarg-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = '.vikarg';

// ---------- serialización binaria ----------

export function toB64(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export interface SealedJson {
  iv: string;
  ct: string;
}

export const sealedToJson = (s: Sealed): SealedJson => ({ iv: toB64(s.iv), ct: toB64(s.ct) });
export const sealedFromJson = (s: SealedJson): Sealed => ({ iv: fromB64(s.iv), ct: fromB64(s.ct).buffer });

export interface WrappedJson {
  salt: string;
  iterations: number;
  wrapped: SealedJson;
}

export const wrappedToJson = (w: WrappedKey): WrappedJson => ({ salt: toB64(w.salt), iterations: w.iterations, wrapped: sealedToJson(w.wrapped) });
export const wrappedFromJson = (w: WrappedJson): WrappedKey => ({ salt: fromB64(w.salt), iterations: w.iterations, wrapped: sealedFromJson(w.wrapped) });

// ---------- formato ----------

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  dbVersion: number;
  createdAt: string;
  /** `recovery` falta y `open` es true en los backups de una bóveda sin contraseña. */
  vault: { version: 1; createdAt: string; password: WrappedJson; recovery?: WrappedJson; open?: true };
  /** Ajustes no sensibles (idioma, tema, unidades, URLs). */
  settings: Partial<Settings> | null;
  counts: Partial<Record<EntityTable, number>>;
}

interface RowJson extends SealedJson {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

type DataJson = Partial<Record<EntityTable, RowJson[]>>;

// Blob en el ZIP: IV (12 bytes) seguido del texto cifrado.
const IV_LENGTH = 12;

/** Encabezado del backup: la DEK envuelta con la contraseña y, si hay, con la clave de recuperación. */
export interface BackupHeader {
  version: 1;
  createdAt: string;
  password: WrappedKey;
  recovery?: WrappedKey;
  /** Viene de una bóveda sin contraseña: al restaurar queda sin contraseña. */
  open?: true;
}

export interface ParsedBackup {
  manifest: BackupManifest;
  header: BackupHeader;
  data: DataJson;
  blobs: Map<string, Sealed>;
}

export class BackupError extends Error {
  constructor(public readonly code: 'invalid-file' | 'newer-version' | 'no-vault' | 'needs-password') {
    super(code);
    this.name = 'BackupError';
  }
}

// ---------- exportar ----------

/**
 * `backupPassword`: solo con la bóveda sin contraseña (obligatoria en ese caso):
 * con ella se cifra el acceso al backup.
 */
export async function exportBackup(appVersion: string, backupPassword?: string): Promise<Uint8Array<ArrayBuffer>> {
  const { manifest, data } = await backupParts(appVersion, backupPassword);
  const files: Record<string, Uint8Array> = {};
  for (const blob of await db.blobs.toArray()) files[`blobs/${blob.id}`] = blobEntry(blob);
  files['manifest.json'] = manifest;
  files['data.json'] = data;
  // Los datos ya están cifrados (no comprimen): se guardan sin compresión salvo los JSON.
  return zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>;
}

/** Blob en el ZIP: IV (12 bytes) seguido del texto cifrado. */
function blobEntry(blob: { iv: Uint8Array; ct: ArrayBuffer }): Uint8Array {
  const ct = new Uint8Array(blob.ct);
  const bytes = new Uint8Array(IV_LENGTH + ct.length);
  bytes.set(blob.iv, 0);
  bytes.set(ct, IV_LENGTH);
  return bytes;
}

/**
 * Lo mismo que `exportBackup` pero armando el archivo de a pedazos: cada adjunto se lee, se agrega y se entrega a `write` de a uno, así la
 * memoria que hace falta es la de UN adjunto y no tres veces el archivo entero (con 200 MB de fotos el modo en memoria pedía casi 600 MB
 * más, que en un celular modesto cierra la app). El resultado es el mismo `.vikarg` (`readBackup` lo lee igual). Devuelve el tamaño total.
 */
export async function exportBackupStream(
  appVersion: string,
  backupPassword: string | undefined,
  write: (chunk: Uint8Array) => Promise<void>,
): Promise<number> {
  const { manifest, data } = await backupParts(appVersion, backupPassword);
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let total = 0;
  let failure: unknown = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else {
      pending.push(chunk);
      pendingBytes += chunk.length;
    }
  });
  /** Entrega lo acumulado, en bloques de a ~1,5 MB. */
  const flush = async (all = false) => {
    if (failure) throw failure;
    if (!pendingBytes || (!all && pendingBytes < 1_572_864)) return;
    const out = new Uint8Array(pendingBytes);
    let off = 0;
    for (const c of pending) {
      out.set(c, off);
      off += c.length;
    }
    pending = [];
    pendingBytes = 0;
    total += out.length;
    await write(out);
  };
  const add = async (name: string, bytes: Uint8Array) => {
    const file = new ZipPassThrough(name);
    zip.add(file);
    file.push(bytes, true);
    await flush();
  };
  for (const id of await db.blobs.toCollection().primaryKeys()) {
    const blob = await db.blobs.get(id);
    if (blob) await add(`blobs/${blob.id}`, blobEntry(blob));
  }
  await add('manifest.json', manifest);
  await add('data.json', data);
  zip.end();
  await flush(true);
  return total;
}

/** Todo el backup menos los adjuntos: el manifiesto (con el encabezado de la bóveda) y las filas de las tablas. */
async function backupParts(appVersion: string, backupPassword?: string): Promise<{ manifest: Uint8Array; data: Uint8Array }> {
  const stored = await readStoredHeader();
  if (!stored) throw new BackupError('no-vault');
  let vault: BackupManifest['vault'];
  if (isOpenHeader(stored)) {
    if (!backupPassword) throw new BackupError('needs-password');
    vault = { version: 1, createdAt: stored.createdAt, password: wrappedToJson(await wrapDek(getDek(), backupPassword, kdfIterations())), open: true };
  } else {
    vault = { version: stored.version, createdAt: stored.createdAt, password: wrappedToJson(stored.password), recovery: wrappedToJson(stored.recovery) };
  }

  const data: DataJson = {};
  const counts: BackupManifest['counts'] = {};
  for (const table of ENTITY_TABLES) {
    // Incluye los borrados lógicos: sin ellos una futura sincronización no sabría qué se eliminó.
    const rows = await db.entityTable(table).toArray();
    data[table] = rows.map((r) => ({ id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt, ...sealedToJson(r) }));
    counts[table] = rows.filter((r) => !r.deletedAt).length;
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    dbVersion: db.verno,
    createdAt: new Date().toISOString(),
    vault,
    settings: ((await db.settings.get('app'))?.value as Partial<Settings> | undefined) ?? null,
    counts,
  };
  return { manifest: strToU8(JSON.stringify(manifest, null, 2)), data: strToU8(JSON.stringify(data)) };
}

const LAST_BACKUP_KEY = 'lastBackupAt';

export async function markBackupDone(): Promise<void> {
  await db.meta.put({ key: LAST_BACKUP_KEY, value: new Date().toISOString() });
}

export async function lastBackupAt(): Promise<string | null> {
  return ((await db.meta.get(LAST_BACKUP_KEY))?.value as string | undefined) ?? null;
}

export function backupFileName(date = new Date()): string {
  return `vikarg-backup-${today(date)}${BACKUP_EXTENSION}`;
}

// ---------- leer ----------

export function readBackup(bytes: Uint8Array): ParsedBackup {
  let entries: Record<string, Uint8Array>;
  let manifest: BackupManifest;
  try {
    entries = unzipSync(bytes);
    manifest = JSON.parse(strFromU8(entries['manifest.json']!)) as BackupManifest;
  } catch {
    throw new BackupError('invalid-file');
  }
  if (manifest.format !== BACKUP_FORMAT || !entries['data.json']) throw new BackupError('invalid-file');
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION || manifest.dbVersion > db.verno) throw new BackupError('newer-version');

  const blobs = new Map<string, Sealed>();
  for (const [path, content] of Object.entries(entries)) {
    if (!path.startsWith('blobs/')) continue;
    blobs.set(path.slice('blobs/'.length), { iv: content.slice(0, IV_LENGTH), ct: content.slice(IV_LENGTH).buffer });
  }

  return {
    manifest,
    header: {
      version: manifest.vault.version,
      createdAt: manifest.vault.createdAt,
      password: wrappedFromJson(manifest.vault.password),
      ...(manifest.vault.recovery && { recovery: wrappedFromJson(manifest.vault.recovery) }),
      ...(manifest.vault.open && { open: true as const }),
    },
    data: JSON.parse(strFromU8(entries['data.json'])) as DataJson,
    blobs,
  };
}

// ---------- restaurar ----------

export type SecretKind = 'password' | 'recovery';

/** Verifica el secreto contra el backup sin tocar la base. Lanza `WrongSecretError`. */
export async function unlockBackup(backup: ParsedBackup, secret: string, kind: SecretKind): Promise<CryptoKey> {
  if (kind === 'password') return unwrapDek(backup.header.password, secret);
  // Backup de una bóveda sin contraseña: no tiene clave de recuperación.
  if (!backup.header.recovery) throw new WrongSecretError();
  return unwrapDek(backup.header.recovery, normalizeRecoveryKey(secret));
}

/**
 * Reemplaza todos los datos por los del backup y deja la bóveda desbloqueada.
 * Se valida el secreto antes de borrar nada.
 */
export async function restoreBackup(backup: ParsedBackup, secret: string, kind: SecretKind): Promise<void> {
  const dek = await unlockBackup(backup, secret, kind);
  setDek(null);

  // Sin contraseña (como estaba al hacer el backup) o con la contraseña y la clave de recuperación del backup.
  // Se arma antes de la transacción: adentro de una transacción de IndexedDB no se puede esperar a WebCrypto.
  const { open, recovery, ...rest } = backup.header;
  const header = open || !recovery ? await openHeaderFor(dek, rest.createdAt) : { ...rest, recovery };

  const tables = [db.meta, db.blobs, db.alertIndex, ...ENTITY_TABLES.map((t) => db.entityTable(t))];
  await db.transaction('rw', [...tables, db.settings], async () => {
    for (const table of tables) await table.clear();
    await db.meta.put({ key: VAULT_HEADER_KEY, value: header });
    for (const table of ENTITY_TABLES) {
      const rows: EncryptedRow[] = (backup.data[table] ?? []).map((r) => ({
        id: r.id,
        updatedAt: r.updatedAt,
        deletedAt: r.deletedAt,
        ...sealedFromJson(r),
      }));
      await db.entityTable(table).bulkPut(rows);
    }
    await db.blobs.bulkPut([...backup.blobs].map(([id, s]) => ({ id, ...s })));
    if (backup.manifest.settings) await db.settings.put({ key: 'app', value: backup.manifest.settings });
  });

  setDek(dek);
}

import { normalizeRecoveryKey, unwrapDek, WrongSecretError } from '@/core/crypto/crypto';
import { db, UserDb } from '@/core/db/db';
import { lockVault } from './vault';
import { setDek } from './session';
import { isOpenHeader, VAULT_HEADER_KEY, type StoredHeader } from './vault';

/**
 * Bóvedas anteriores guardadas aparte. Quien olvida la contraseña y la clave de recuperación no tiene cómo entrar, pero tampoco hace falta
 * perder lo que había: la bóveda vieja se copia tal cual (sigue cifrada con su clave de siempre, así que guardarla no expone nada) a otra
 * base del navegador y la app empieza de cero. Si más adelante aparece la contraseña o el código, se recupera: la bóveda guardada vuelve a ser
 * la activa (y la que estaba se guarda aparte o se borra). También se puede borrar todo sin guardar nada.
 */
export interface VaultArchive {
  id: string;
  createdAt: string;
  /** Nombre de la base del navegador donde quedó (el original lleva `-user`). */
  dbName: string;
  /** Cantidad de filas guardadas (solo para mostrar). */
  rows: number;
}

const LIST_KEY = 'vikarg.vault.archives';
const CHUNK = 100;

export function listArchives(): VaultArchive[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    return raw ? (JSON.parse(raw) as VaultArchive[]) : [];
  } catch {
    return [];
  }
}
function saveArchives(list: VaultArchive[]): void {
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
}

/** Copia todas las tablas de una base a otra, de a tandas (las fotos cifradas pueden pesar). Devuelve cuántas filas copió. */
async function copyAll(from: UserDb, to: UserDb): Promise<number> {
  let rows = 0;
  for (const table of from.tables) {
    const keys = await table.toCollection().primaryKeys();
    for (let i = 0; i < keys.length; i += CHUNK) {
      const batch = await table.bulkGet(keys.slice(i, i + CHUNK));
      await to.table(table.name).bulkPut(batch.filter((r) => r !== undefined));
      rows += batch.length;
    }
  }
  return rows;
}

async function clearAll(target: UserDb): Promise<void> {
  await target.transaction('rw', target.tables, async () => {
    for (const table of target.tables) await table.clear();
  });
}

/** Lo que la bóveda activa dejó en la caché de mapas (zonas bajadas): al borrar todo se libera el espacio. */
async function dropMapCaches(): Promise<void> {
  if (!('caches' in globalThis)) return;
  await Promise.all(['vikarg-maps'].map((name) => caches.delete(name).catch(() => false)));
}

/** ¿Hay una bóveda para guardar (con o sin contraseña)? */
export async function hasVaultToArchive(): Promise<boolean> {
  return !!(await db.meta.get(VAULT_HEADER_KEY));
}

/** Guarda la bóveda activa aparte (cifrada, tal cual) y deja la app sin bóveda, lista para empezar de cero. */
export async function archiveCurrentVault(): Promise<VaultArchive> {
  lockVault();
  const id = crypto.randomUUID();
  const dbName = `vikarg-user-old-${id}`;
  const archive = new UserDb(dbName);
  try {
    const rows = await copyAll(db, archive);
    // La copia tiene que tener el encabezado criptográfico: sin él no se podría abrir.
    if (!(await archive.meta.get(VAULT_HEADER_KEY))) throw new Error('vault-archive-incomplete');
    await clearAll(db);
    const entry: VaultArchive = { id, createdAt: new Date().toISOString(), dbName, rows };
    saveArchives([...listArchives(), entry]);
    return entry;
  } finally {
    archive.close();
  }
}

/** Borra todo lo de la bóveda activa, sin guardar nada. No se puede deshacer. */
export async function eraseCurrentVault(): Promise<void> {
  lockVault();
  await clearAll(db);
  await dropMapCaches();
}

/** Borra una bóveda guardada aparte. No se puede deshacer. */
export async function deleteArchive(id: string): Promise<void> {
  const list = listArchives();
  const entry = list.find((a) => a.id === id);
  if (!entry) return;
  await new UserDb(entry.dbName).delete();
  saveArchives(list.filter((a) => a.id !== id));
}

export type ArchiveSecretKind = 'password' | 'recovery';

/**
 * Comprueba la contraseña o la clave de recuperación de una bóveda guardada sin cambiar nada. Devuelve la DEK si es correcta;
 * lanza `WrongSecretError` si no.
 */
async function openArchiveKey(entry: VaultArchive, secret: string, kind: ArchiveSecretKind): Promise<CryptoKey> {
  const archive = new UserDb(entry.dbName);
  try {
    const header = (await archive.meta.get(VAULT_HEADER_KEY))?.value as StoredHeader | undefined;
    if (!header || isOpenHeader(header)) throw new Error('vault-archive-unusable');
    return await (kind === 'password' ? unwrapDek(header.password, secret) : unwrapDek(header.recovery, normalizeRecoveryKey(secret)));
  } finally {
    archive.close();
  }
}

/** ¿Es correcta esta contraseña o clave para esa bóveda guardada? (sin recuperarla). */
export async function verifyArchiveSecret(id: string, secret: string, kind: ArchiveSecretKind): Promise<boolean> {
  const entry = listArchives().find((a) => a.id === id);
  if (!entry) return false;
  try {
    await openArchiveKey(entry, secret, kind);
    return true;
  } catch (err) {
    if (err instanceof WrongSecretError) return false;
    throw err;
  }
}

/**
 * Recupera una bóveda guardada: comprueba su contraseña o clave, guarda aparte (`archive`) o borra (`erase`) la que está activa, trae la
 * guardada a su lugar y la deja desbloqueada. Lanza `WrongSecretError` (sin tocar nada) si la contraseña o la clave no coinciden.
 */
export async function restoreArchive(id: string, secret: string, kind: ArchiveSecretKind, current: 'archive' | 'erase'): Promise<void> {
  const entry = listArchives().find((a) => a.id === id);
  if (!entry) throw new Error('vault-archive-missing');
  // Primero se comprueba: con un dato incorrecto no se toca nada.
  const dek = await openArchiveKey(entry, secret, kind);
  if (await hasVaultToArchive()) {
    if (current === 'archive') await archiveCurrentVault();
    else await eraseCurrentVault();
  }
  lockVault();
  await clearAll(db);
  const archive = new UserDb(entry.dbName);
  try {
    await copyAll(archive, db);
  } finally {
    archive.close();
  }
  await deleteArchive(id);
  setDek(dek);
}

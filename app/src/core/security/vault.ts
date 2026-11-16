import {
  PBKDF2_ITERATIONS,
  generateDek,
  generateRecoveryKey,
  normalizeRecoveryKey,
  unwrapDek,
  wrapDek,
  WrongSecretError,
  type WrappedKey,
} from '@/core/crypto/crypto';
import { db } from '@/core/db/db';
import { getDek, setDek } from './session';

/** Encabezado criptográfico persistido en `meta` (ver ARQUITECTURA §7.1). */
export interface VaultHeader {
  version: 1;
  password: WrappedKey;
  recovery: WrappedKey;
  createdAt: string;
  /** Desbloqueo con huella, cara o PIN del dispositivo (ver vaultBiometric.ts): una tercera envoltura de la DEK, propia de este dispositivo. */
  biometric?: BiometricWrap;
}

/** La DEK envuelta con el secreto que el dispositivo devuelve (WebAuthn PRF) después de la biometría. Nada de esto sale del dispositivo (no va en backups). */
export interface BiometricWrap {
  /** Id de la clave de acceso (base64). */
  credentialId: string;
  /** «Sal» que se le pasa al dispositivo para obtener el secreto (base64). */
  salt: string;
  iv: string;
  /** DEK envuelta con AES-GCM (base64). */
  wrapped: string;
  createdAt: string;
}

/**
 * Bóveda sin contraseña (elección del usuario): la DEK se guarda sin envolver
 * junto a los datos y la app entra sola. Los datos siguen con el mismo formato
 * (cifrados con la DEK), así que poner o sacar la contraseña después no
 * re-cifra nada: solo cambia cómo se guarda la DEK.
 */
export interface OpenVaultHeader {
  version: 1;
  open: true;
  /** DEK en crudo, en base64. */
  key: string;
  createdAt: string;
}

export type StoredHeader = VaultHeader | OpenVaultHeader;
export const isOpenHeader = (h: StoredHeader | undefined): h is OpenVaultHeader => !!h && 'open' in h && h.open === true;

const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** La DEK en crudo (base64), para guardarla sin envolver. */
export const exportRawDek = async (dek: CryptoKey) => toB64(await crypto.subtle.exportKey('raw', dek));
export const importRawDek = (key: string) => crypto.subtle.importKey('raw', fromB64(key), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
export const openHeaderFor = async (dek: CryptoKey, createdAt = new Date().toISOString()): Promise<OpenVaultHeader> => ({ version: 1, open: true, key: await exportRawDek(dek), createdAt });

export const VAULT_HEADER_KEY = 'vault';
const HEADER_KEY = VAULT_HEADER_KEY;
export const MIN_PASSWORD_LENGTH = 8;

let iterations = PBKDF2_ITERATIONS;

/** Solo para tests: PBKDF2 completo tarda segundos. */
export function setTestIterations(n: number): void {
  iterations = n;
}

/** Iteraciones de PBKDF2 en uso (las de producción, salvo en los tests). */
export const kdfIterations = (): number => iterations;

export async function readStoredHeader(): Promise<StoredHeader | undefined> {
  return (await db.meta.get(HEADER_KEY))?.value as StoredHeader | undefined;
}

/** Encabezado con contraseña (undefined si no hay bóveda o si es sin contraseña). */
export async function readHeader(): Promise<VaultHeader | undefined> {
  const h = await readStoredHeader();
  return isOpenHeader(h) ? undefined : h;
}

/** ¿La bóveda es sin contraseña? */
export async function isOpenVault(): Promise<boolean> {
  return isOpenHeader(await readStoredHeader());
}

export async function isVaultInitialized(): Promise<boolean> {
  return (await readStoredHeader()) !== undefined;
}

export class WeakPasswordError extends Error {
  constructor() {
    super('weak-password');
    this.name = 'WeakPasswordError';
  }
}

function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
}

/**
 * Configura la bóveda por primera vez y la deja desbloqueada.
 * Devuelve la clave de recuperación: se muestra una única vez y no se guarda.
 */
export async function initializeVault(password: string): Promise<string> {
  assertPassword(password);
  if (await isVaultInitialized()) throw new Error('vault-already-initialized');
  const dek = await generateDek();
  const recoveryKey = generateRecoveryKey();
  const header: VaultHeader = {
    version: 1,
    password: await wrapDek(dek, password, iterations),
    recovery: await wrapDek(dek, normalizeRecoveryKey(recoveryKey), iterations),
    createdAt: new Date().toISOString(),
  };
  await db.meta.put({ key: HEADER_KEY, value: header });
  setDek(dek);
  return recoveryKey;
}

/** Configura la bóveda sin contraseña y la deja abierta. */
export async function initializeOpenVault(): Promise<void> {
  if (await isVaultInitialized()) throw new Error('vault-already-initialized');
  const dek = await generateDek();
  await db.meta.put({ key: HEADER_KEY, value: await openHeaderFor(dek) });
  setDek(dek);
}

/** Bóveda sin contraseña: la abre (al iniciar la app). Devuelve false si tiene contraseña. */
export async function unlockOpenVault(): Promise<boolean> {
  const h = await readStoredHeader();
  if (!isOpenHeader(h)) return false;
  setDek(await importRawDek(h.key));
  return true;
}

/**
 * Bóveda sin contraseña → con contraseña: envuelve la DEK con la contraseña y
 * una clave de recuperación nueva y borra la copia en crudo. Devuelve la clave
 * de recuperación (se muestra una única vez). Hace falta estar desbloqueado.
 */
export async function addPassword(password: string): Promise<string> {
  assertPassword(password);
  const h = await readStoredHeader();
  if (!isOpenHeader(h)) throw new Error('vault-has-password');
  const dek = getDek();
  const recoveryKey = generateRecoveryKey();
  const header: VaultHeader = {
    version: 1,
    password: await wrapDek(dek, password, iterations),
    recovery: await wrapDek(dek, normalizeRecoveryKey(recoveryKey), iterations),
    createdAt: h.createdAt,
  };
  await db.meta.put({ key: HEADER_KEY, value: header });
  return recoveryKey;
}

/**
 * Con contraseña → sin contraseña: comprueba la contraseña actual y guarda la
 * DEK sin envolver. Lanza `WrongSecretError` si la contraseña no es correcta.
 */
export async function removePassword(password: string): Promise<void> {
  const header = await requireHeader();
  const dek = await unwrapDek(header.password, password);
  await db.meta.put({ key: HEADER_KEY, value: await openHeaderFor(dek, header.createdAt) });
  setDek(dek);
}

async function requireHeader(): Promise<VaultHeader> {
  const header = await readHeader();
  if (!header) throw new Error('vault-not-initialized');
  return header;
}

/** Lanza `WrongSecretError` si la contraseña no es correcta. */
export async function unlockWithPassword(password: string): Promise<void> {
  const header = await requireHeader();
  setDek(await unwrapDek(header.password, password));
}

/**
 * Comprueba la contraseña sin cambiar la sesión (para confirmar acciones que
 * no tienen vuelta atrás, como eliminar la cuenta del servidor).
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const header = await requireHeader();
  try {
    await unwrapDek(header.password, password);
    return true;
  } catch (err) {
    if (err instanceof WrongSecretError) return false;
    throw err;
  }
}

/**
 * Desbloquea con la clave de recuperación. Quien la usa olvidó la contraseña,
 * así que la UI debe pedir una nueva a continuación (`changePassword`).
 */
export async function unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
  const header = await requireHeader();
  setDek(await unwrapDek(header.recovery, normalizeRecoveryKey(recoveryKey)));
}

/** Re-envuelve la DEK con la nueva contraseña; los datos no se re-cifran. */
export async function changePassword(newPassword: string): Promise<void> {
  assertPassword(newPassword);
  const header = await requireHeader();
  const updated: VaultHeader = { ...header, password: await wrapDek(getDek(), newPassword, iterations) };
  await db.meta.put({ key: HEADER_KEY, value: updated });
}

export function lockVault(): void {
  setDek(null);
}

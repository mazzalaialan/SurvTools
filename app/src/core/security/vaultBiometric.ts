import { db } from '@/core/db/db';
import { isNativePlatform } from '@/core/platform';
import { browserEnv, kekFrom, type BiometricEnv } from './biometricTest';
import { getDek, setDek } from './session';
import { readHeader, VAULT_HEADER_KEY, type BiometricWrap, type VaultHeader } from './vault';

/**
 * Desbloqueo con huella, cara o PIN del dispositivo. La clave de datos (DEK) se guarda además envuelta con un secreto que solo el dispositivo
 * puede dar después de la biometría (WebAuthn con la extensión PRF), igual que ya se guarda envuelta con la contraseña y con la clave de
 * recuperación. La contraseña y la clave de recuperación siguen valiendo siempre: si se borra la clave de acceso o se cambia de dispositivo, se
 * entra con ellas. La envoltura es de este dispositivo y de este sitio: no va en los backups ni en las transferencias.
 */
export type BiometricErrorCode = 'unsupported' | 'cancelled' | 'no-prf' | 'failed' | 'no-vault';

export class BiometricError extends Error {
  constructor(public readonly code: BiometricErrorCode) {
    super(`biometric-${code}`);
    this.name = 'BiometricError';
  }
}

const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : b)));
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const isCancel = (e: unknown) => e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError');

/** ¿Este dispositivo y navegador pueden dar biometría con PRF? (solo mira si hay autenticador; la prueba completa está en Ajustes). */
export async function biometricSupported(env?: BiometricEnv): Promise<boolean> {
  // App nativa: el secreto va en el Keystore de Android atado a la huella (el WebView no tiene WebAuthn con PRF).
  if (isNativePlatform()) return (await import('./nativeBiometric')).nativeAvailable();
  env ??= browserEnv();
  if (!env.secureContext || !env.credentials) return false;
  try {
    return await env.platformAvailable();
  } catch {
    return false;
  }
}

/** ¿La bóveda activa tiene el desbloqueo biométrico activado? */
export async function biometricEnabled(): Promise<boolean> {
  return !!(await readHeader())?.biometric;
}

/** El secreto del dispositivo para una sal, después de la biometría. */
async function secretFor(env: BiometricEnv, credentialId: ArrayBuffer, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await env.credentials!.get({
      publicKey: {
        rpId: env.rpId,
        challenge: env.random(32),
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw new BiometricError(isCancel(e) ? 'cancelled' : 'failed');
  }
  const first = (assertion?.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } } | undefined)?.prf?.results?.first;
  if (!first || first.byteLength < 32) throw new BiometricError('no-prf');
  return first;
}

async function writeHeader(header: VaultHeader): Promise<void> {
  await db.meta.put({ key: VAULT_HEADER_KEY, value: header });
}

/**
 * Activa el desbloqueo biométrico (hace falta tener la bóveda desbloqueada): crea la clave de acceso, pide la biometría una vez para obtener el
 * secreto y guarda la DEK envuelta con él. Si algo falla no se cambia nada.
 */
export async function enableBiometric(env?: BiometricEnv): Promise<void> {
  const header = await readHeader();
  if (!header) throw new BiometricError('no-vault');
  if (isNativePlatform()) return enableNative(header);
  env ??= browserEnv();
  if (!(await biometricSupported(env))) throw new BiometricError('unsupported');
  const dek = getDek();
  const salt = env.random(32);
  let credentialId: ArrayBuffer;
  try {
    const cred = (await env.credentials!.create({
      publicKey: {
        rp: { name: 'VikArg', id: env.rpId },
        user: { id: env.random(16), name: 'VikArg bóveda', displayName: 'Bóveda de VikArg' },
        challenge: env.random(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new BiometricError('failed');
    const prf = (cred.getClientExtensionResults() as { prf?: { enabled?: boolean } }).prf;
    if (!prf?.enabled) throw new BiometricError('no-prf');
    credentialId = cred.rawId;
  } catch (e) {
    if (e instanceof BiometricError) throw e;
    throw new BiometricError(isCancel(e) ? 'cancelled' : 'failed');
  }
  const secret = await secretFor(env, credentialId, salt);
  const kek = await kekFrom(env.subtle, secret);
  const iv = env.random(12);
  const wrapped = await env.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  const biometric: BiometricWrap = { credentialId: toB64(credentialId), salt: toB64(salt), iv: toB64(iv), wrapped: toB64(wrapped), createdAt: new Date().toISOString() };
  await writeHeader({ ...header, biometric });
}

/**
 * App nativa: guarda un secreto nuevo en el Keystore atado a la huella, lo lee una vez (pide la huella: comprueba que se puede usar) y con él
 * envuelve la DEK. Si algo falla, el secreto se borra y no se cambia nada.
 */
async function enableNative(header: VaultHeader): Promise<void> {
  const native = await import('./nativeBiometric');
  if (!(await native.nativeAvailable())) throw new BiometricError('unsupported');
  const dek = getDek();
  try {
    await native.createNativeSecret();
    const secret = await native.readNativeSecret();
    const kek = await kekFrom(crypto.subtle, secret.buffer as ArrayBuffer);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
    await writeHeader({ ...header, biometric: { credentialId: '', salt: '', iv: toB64(iv), wrapped: toB64(wrapped), createdAt: new Date().toISOString(), native: true } });
  } catch (e) {
    await native.deleteNativeSecret();
    throw new BiometricError(native.nativeErrorCode(e));
  }
}

/** Desactiva el desbloqueo biométrico (hace falta tener la bóveda desbloqueada). La clave de acceso queda en el dispositivo: se borra desde su lista. */
export async function disableBiometric(): Promise<void> {
  getDek();
  const header = await readHeader();
  if (!header?.biometric) return;
  const { biometric: removed, ...rest } = header;
  await writeHeader(rest);
  // App nativa: también se borra el secreto del Keystore.
  if (removed?.native && isNativePlatform()) await (await import('./nativeBiometric')).deleteNativeSecret();
}

/** Desbloquea con la biometría. Lanza `BiometricError` (`cancelled` si la persona cancela; `failed` o `no-prf` si no se pudo: que use la contraseña). */
export async function unlockWithBiometric(env?: BiometricEnv): Promise<void> {
  const header = await readHeader();
  const b = header?.biometric;
  if (!b) throw new BiometricError('no-vault');
  if (b.native) return unlockNative(b);
  env ??= browserEnv();
  if (!env.secureContext || !env.credentials) throw new BiometricError('unsupported');
  const secret = await secretFor(env, fromB64(b.credentialId).buffer, fromB64(b.salt));
  try {
    const kek = await kekFrom(env.subtle, secret);
    const dek = await env.subtle.unwrapKey('raw', fromB64(b.wrapped), kek, { name: 'AES-GCM', iv: fromB64(b.iv) }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    setDek(dek);
  } catch {
    // El secreto no abre la clave: la clave de acceso es otra (por ejemplo, se borró y se creó de nuevo).
    throw new BiometricError('failed');
  }
}

/** App nativa: pide la huella, recibe el secreto del Keystore y abre la DEK con él. */
async function unlockNative(b: BiometricWrap): Promise<void> {
  if (!isNativePlatform()) throw new BiometricError('unsupported');
  const native = await import('./nativeBiometric');
  let secret: Uint8Array;
  try {
    secret = await native.readNativeSecret();
  } catch (e) {
    // Cancelada, o el secreto ya no existe (se agregó otra huella y Android invalidó la clave): se entra con la contraseña.
    throw new BiometricError(native.nativeErrorCode(e));
  }
  try {
    const kek = await kekFrom(crypto.subtle, secret.buffer as ArrayBuffer);
    const dek = await crypto.subtle.unwrapKey('raw', fromB64(b.wrapped), kek, { name: 'AES-GCM', iv: fromB64(b.iv) }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    setDek(dek);
  } catch {
    throw new BiometricError('failed');
  }
}

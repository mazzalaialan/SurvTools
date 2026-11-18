import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric';
import { i18n } from '@/core/i18n/i18n';

/**
 * Biometría de la app nativa (Android) con `@capgo/capacitor-native-biometric` (MPL-2.0). En el navegador el secreto que desbloquea la
 * bóveda sale de WebAuthn con PRF (`vaultBiometric.ts`); el WebView de Android no lo tiene. Acá el secreto es un valor al azar de 32 bytes que
 * se guarda en el Keystore de Android atado a la huella: la clave que lo cifra exige autenticación biométrica para cada uso (`BiometricPrompt`
 * con un objeto criptográfico) y **se invalida si se agrega otra huella o cara** (`BIOMETRY_CURRENT_SET`): quien agregue la suya no abre tu bóveda.
 * Después se usa igual que el secreto de WebAuthn: arma la clave que envuelve la clave de datos (DEK).
 */

/** Nombre con el que se guarda el secreto en el Keystore de esta app. */
export const NATIVE_KEY = 'vikarg-vault-biometric';

/** Códigos de error del plugin (`BiometricAuthError`) que significan «la persona canceló». */
const CANCEL_CODES = new Set([11, 15, 16, 17]);

export function nativeErrorCode(e: unknown): 'cancelled' | 'failed' {
  const code = Number((e as { code?: unknown } | null)?.code);
  return CANCEL_CODES.has(code) || /cancel/i.test((e as Error | null)?.message ?? '') ? 'cancelled' : 'failed';
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const prompt = () => ({
  title: i18n.t('biometricUnlock.prompt.title'),
  reason: i18n.t('biometricUnlock.prompt.reason'),
  negativeButtonText: i18n.t('biometricUnlock.prompt.cancel'),
});

/** ¿El teléfono tiene huella o cara registradas, y de las que sirven para proteger claves? */
export async function nativeAvailable(): Promise<boolean> {
  try {
    const r = await NativeBiometric.isAvailable({ useFallback: false });
    return r.isAvailable === true;
  } catch {
    return false;
  }
}

/** Guarda un secreto nuevo atado a la huella y lo devuelve. Un secreto anterior se reemplaza. */
export async function createNativeSecret(): Promise<Uint8Array> {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  await NativeBiometric.deleteData({ key: NATIVE_KEY }).catch(() => undefined);
  await NativeBiometric.setData({ key: NATIVE_KEY, value: toB64(secret), accessControl: AccessControl.BIOMETRY_CURRENT_SET });
  return secret;
}

/** Pide la huella y devuelve el secreto guardado (falla si se canceló o si se agregó otra huella desde entonces). */
export async function readNativeSecret(): Promise<Uint8Array> {
  const { value } = await NativeBiometric.getSecureData({ key: NATIVE_KEY, ...prompt() });
  const secret = fromB64(value);
  if (secret.length !== 32) throw new Error('secreto inválido');
  return secret;
}

export async function deleteNativeSecret(): Promise<void> {
  await NativeBiometric.deleteData({ key: NATIVE_KEY }).catch(() => undefined);
}

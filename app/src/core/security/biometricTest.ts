/**
 * Prueba de biometría de este dispositivo (WebAuthn con la extensión PRF): comprueba, sin tocar la bóveda, si el dispositivo puede darle
 * a la app un secreto propio después de la huella, la cara o el PIN del teléfono. Ese secreto serviría después para abrir la clave de datos
 * (una tercera envoltura, además de la contraseña y la clave de recuperación). Crea una credencial de prueba (queda en la lista de claves de
 * acceso del dispositivo y se puede borrar desde ahí), la usa dos veces con la misma «sal» y una con otra, y abre y cierra una clave de
 * datos de prueba con lo que devuelve.
 */
export type StepId = 'secure' | 'api' | 'platform' | 'create' | 'prfEnabled' | 'auth' | 'stable' | 'salt' | 'wrap';
export type StepStatus = 'ok' | 'fail' | 'skip';

export interface BiometricStep {
  id: StepId;
  status: StepStatus;
  /** Detalle técnico para el informe (nombre del error, cantidad de bytes…). */
  detail?: string;
}

export interface BiometricReport {
  steps: BiometricStep[];
  /** El dispositivo devolvió el secreto y se pudo usar: sirve para desbloquear con biometría. */
  usable: boolean;
  rpId: string;
  userAgent: string;
  at: string;
}

/** Lo que usa la prueba del navegador (se puede reemplazar en las pruebas). */
export interface BiometricEnv {
  secureContext: boolean;
  rpId: string;
  userAgent: string;
  credentials: Pick<CredentialsContainer, 'create' | 'get'> | null;
  platformAvailable: () => Promise<boolean>;
  subtle: SubtleCrypto;
  random: (n: number) => Uint8Array<ArrayBuffer>;
}

export function browserEnv(): BiometricEnv {
  return {
    secureContext: window.isSecureContext,
    rpId: location.hostname,
    userAgent: navigator.userAgent,
    credentials: 'credentials' in navigator && 'PublicKeyCredential' in window ? navigator.credentials : null,
    platformAvailable: () => (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' ? PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() : Promise.resolve(false)),
    subtle: crypto.subtle,
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  };
}

const b64 = (u: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(u)));
const errName = (e: unknown) => (e instanceof Error ? e.name : String(e));
const INFO = new TextEncoder().encode('vikarg-vault-biometric-v1');

/** La clave que se derivaría del secreto del dispositivo (HKDF) para envolver la clave de datos. */
async function kekFrom(subtle: SubtleCrypto, secret: ArrayBuffer): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: INFO }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

export async function runBiometricTest(env: BiometricEnv = browserEnv()): Promise<BiometricReport> {
  const steps: BiometricStep[] = [];
  const push = (id: StepId, status: StepStatus, detail?: string) => steps.push({ id, status, ...(detail ? { detail } : {}) });
  const report = (): BiometricReport => ({
    steps,
    usable: steps.length > 0 && steps.every((s) => s.status === 'ok'),
    rpId: env.rpId,
    userAgent: env.userAgent,
    at: new Date().toISOString(),
  });
  /** Lo que falta después de un fallo se marca como no probado. */
  const skipRest = (from: StepId) => {
    const order: StepId[] = ['secure', 'api', 'platform', 'create', 'prfEnabled', 'auth', 'stable', 'salt', 'wrap'];
    for (const id of order.slice(order.indexOf(from) + 1)) push(id, 'skip');
  };

  if (!env.secureContext) {
    push('secure', 'fail', 'isSecureContext=false');
    skipRest('secure');
    return report();
  }
  push('secure', 'ok');
  if (!env.credentials) {
    push('api', 'fail', 'sin PublicKeyCredential');
    skipRest('api');
    return report();
  }
  push('api', 'ok');
  let platform = false;
  try {
    platform = await env.platformAvailable();
  } catch (e) {
    push('platform', 'fail', errName(e));
    skipRest('platform');
    return report();
  }
  // Sin autenticador de plataforma todavía puede haber una llave física: se sigue, pero se anota.
  push('platform', platform ? 'ok' : 'fail', platform ? undefined : 'sin biometría ni PIN del dispositivo disponible');
  if (!platform) {
    skipRest('platform');
    return report();
  }

  const salt = env.random(32);
  let credId: ArrayBuffer;
  try {
    const cred = (await env.credentials.create({
      publicKey: {
        rp: { name: 'VikArg', id: env.rpId },
        user: { id: env.random(16), name: 'prueba-biometria', displayName: 'Prueba de biometría de VikArg' },
        challenge: env.random(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error('sin credencial');
    credId = cred.rawId;
    push('create', 'ok');
    const prf = (cred.getClientExtensionResults() as { prf?: { enabled?: boolean } }).prf;
    push('prfEnabled', prf?.enabled ? 'ok' : 'fail', prf?.enabled ? undefined : 'el autenticador no ofrece PRF');
    if (!prf?.enabled) {
      skipRest('prfEnabled');
      return report();
    }
  } catch (e) {
    push('create', 'fail', errName(e));
    skipRest('create');
    return report();
  }

  const get = async (s: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer | undefined> => {
    const a = (await env.credentials!.get({
      publicKey: {
        rpId: env.rpId,
        challenge: env.random(32),
        allowCredentials: [{ type: 'public-key', id: credId }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: s } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    return (a?.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } } | undefined)?.prf?.results?.first;
  };

  let a1: ArrayBuffer | undefined;
  let a2: ArrayBuffer | undefined;
  try {
    a1 = await get(salt);
    a2 = await get(salt);
  } catch (e) {
    push('auth', 'fail', errName(e));
    skipRest('auth');
    return report();
  }
  if (!a1 || !a2 || a1.byteLength < 32) {
    push('auth', 'fail', 'no devolvió el secreto');
    skipRest('auth');
    return report();
  }
  push('auth', 'ok', `${a1.byteLength} bytes`);
  const stable = b64(a1) === b64(a2);
  push('stable', stable ? 'ok' : 'fail', stable ? undefined : 'dos lecturas con la misma sal dieron secretos distintos');
  if (!stable) {
    skipRest('stable');
    return report();
  }
  try {
    const other = await get(env.random(32));
    const differs = !!other && b64(other) !== b64(a1);
    push('salt', differs ? 'ok' : 'fail', differs ? undefined : 'otra sal dio el mismo secreto');
  } catch (e) {
    push('salt', 'fail', errName(e));
  }
  try {
    const dek = await env.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = env.random(12);
    const wrapped = await env.subtle.wrapKey('raw', dek, await kekFrom(env.subtle, a1), { name: 'AES-GCM', iv });
    const back = await env.subtle.unwrapKey('raw', wrapped, await kekFrom(env.subtle, a2), { name: 'AES-GCM', iv }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const same = b64(await env.subtle.exportKey('raw', back)) === b64(await env.subtle.exportKey('raw', dek));
    push('wrap', same ? 'ok' : 'fail', same ? undefined : 'la clave abierta no coincide');
  } catch (e) {
    push('wrap', 'fail', errName(e));
  }
  return report();
}

/** Texto del informe para copiar y compartir (sin datos personales: solo el navegador y el resultado de cada paso). */
export function reportText(r: BiometricReport, label: (id: StepId) => string): string {
  const mark = { ok: 'OK', fail: 'FALLÓ', skip: 'no probado' } as const;
  return [
    `Prueba de biometría de VikArg · ${r.at}`,
    `Sitio: ${r.rpId}`,
    `Navegador: ${r.userAgent}`,
    ...r.steps.map((s) => `- ${label(s.id)}: ${mark[s.status]}${s.detail ? ` (${s.detail})` : ''}`),
    `Resultado: ${r.usable ? 'sirve para desbloquear con biometría' : 'no sirve en este dispositivo'}`,
  ].join('\n');
}

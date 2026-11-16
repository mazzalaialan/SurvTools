import { describe, expect, it } from 'vitest';
import { runBiometricTest, reportText, type BiometricEnv } from './biometricTest';

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Un autenticador falso: el secreto sale de un HMAC de la sal con una clave propia (como el real), igual para la misma sal. */
function fakeEnv(over: Partial<BiometricEnv> & { prf?: boolean; broken?: 'create' | 'get' | 'unstable' } = {}): BiometricEnv {
  const key = rand(32);
  let counter = 0;
  const secretFor = async (salt: ArrayBuffer) => {
    const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', k, salt);
  };
  return {
    secureContext: true,
    rpId: 'vikarg.test',
    userAgent: 'prueba',
    platformAvailable: async () => true,
    subtle: crypto.subtle,
    random: rand,
    credentials: {
      create: async () => {
        if (over.broken === 'create') throw new DOMException('cancelado', 'NotAllowedError');
        return { rawId: rand(16).buffer, getClientExtensionResults: () => ({ prf: { enabled: over.prf ?? true } }) } as unknown as Credential;
      },
      get: async (o?: CredentialRequestOptions) => {
        if (over.broken === 'get') throw new DOMException('cancelado', 'NotAllowedError');
        const salt = (o!.publicKey!.extensions as { prf: { eval: { first: ArrayBuffer } } }).prf.eval.first;
        const first = over.broken === 'unstable' ? new Uint8Array(32).fill(++counter).buffer : await secretFor(salt);
        return { getClientExtensionResults: () => ({ prf: { results: { first } } }) } as unknown as Credential;
      },
    },
    ...over,
  } as BiometricEnv;
}

const status = (r: Awaited<ReturnType<typeof runBiometricTest>>) => Object.fromEntries(r.steps.map((s) => [s.id, s.status]));

describe('prueba de biometría del dispositivo', () => {
  it('un dispositivo con PRF pasa todos los pasos y sirve', async () => {
    const r = await runBiometricTest(fakeEnv());
    expect(r.usable).toBe(true);
    expect(Object.values(status(r)).every((s) => s === 'ok')).toBe(true);
    expect(r.steps.map((s) => s.id)).toEqual(['secure', 'api', 'platform', 'create', 'prfEnabled', 'auth', 'stable', 'salt', 'wrap']);
  });
  it('sin PRF se detiene ahí y no sirve', async () => {
    const r = await runBiometricTest(fakeEnv({ prf: false }));
    expect(r.usable).toBe(false);
    expect(status(r)).toMatchObject({ create: 'ok', prfEnabled: 'fail', auth: 'skip', wrap: 'skip' });
  });
  it('sin biometría del dispositivo o sin conexión segura no se prueba nada más', async () => {
    expect(status(await runBiometricTest(fakeEnv({ platformAvailable: async () => false })))).toMatchObject({ platform: 'fail', create: 'skip' });
    expect(status(await runBiometricTest(fakeEnv({ secureContext: false })))).toMatchObject({ secure: 'fail', api: 'skip' });
    expect(status(await runBiometricTest(fakeEnv({ credentials: null })))).toMatchObject({ api: 'fail' });
  });
  it('si la persona cancela o el secreto no es estable lo dice con el nombre del error', async () => {
    const cancelled = await runBiometricTest(fakeEnv({ broken: 'create' }));
    expect(cancelled.steps.find((s) => s.id === 'create')).toMatchObject({ status: 'fail', detail: 'NotAllowedError' });
    const authCancelled = await runBiometricTest(fakeEnv({ broken: 'get' }));
    expect(authCancelled.steps.find((s) => s.id === 'auth')).toMatchObject({ status: 'fail', detail: 'NotAllowedError' });
    const unstable = await runBiometricTest(fakeEnv({ broken: 'unstable' }));
    expect(status(unstable)).toMatchObject({ auth: 'ok', stable: 'fail', salt: 'skip' });
    expect(unstable.usable).toBe(false);
  });
  it('el informe para compartir trae el resultado de cada paso y no datos personales', async () => {
    const r = await runBiometricTest(fakeEnv({ prf: false }));
    const text = reportText(r, (id) => id);
    expect(text).toContain('prfEnabled: FALLÓ (el autenticador no ofrece PRF)');
    expect(text).toContain('Resultado: no sirve en este dispositivo');
    expect(text).toContain('Navegador: prueba');
  });
});

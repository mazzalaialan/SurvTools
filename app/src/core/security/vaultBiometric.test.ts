import { beforeEach, describe, expect, it } from 'vitest';
import { setTestDb } from '@/core/db/db';
import { repos } from '@/core/db/repository';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import type { BiometricEnv } from './biometricTest';
import { isUnlocked } from './session';
import { changePassword, initializeVault, lockVault, readHeader, setTestIterations, unlockWithPassword } from './vault';
import { BiometricError, biometricEnabled, disableBiometric, enableBiometric, unlockWithBiometric } from './vaultBiometric';

setTestIterations(1_000);
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const waypoint = (name: string) => newEntity<Waypoint>({ name, lat: -41.1, lon: -71.3, alt: 900, icon: 'cabin', notes: '', rainAlerts: false });

/** Un autenticador falso: guarda su clave y da un secreto (HMAC de la sal) cuando se usa su credencial; falla si la credencial es otra. */
function device(opts: { prf?: boolean; cancel?: 'create' | 'get'; platform?: boolean; ids?: Set<string> } = {}) {
  const key = rand(32);
  const ids = opts.ids ?? new Set<string>();
  const state = { cancelNext: opts.cancel };
  const secretFor = async (salt: ArrayBuffer) => crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), salt);
  const env: BiometricEnv = {
    secureContext: true,
    rpId: 'vikarg.test',
    userAgent: 'prueba',
    platformAvailable: async () => opts.platform ?? true,
    subtle: crypto.subtle,
    random: rand,
    credentials: {
      create: async () => {
        if (state.cancelNext === 'create') throw new DOMException('cancelado', 'NotAllowedError');
        const id = rand(16);
        ids.add(btoa(String.fromCharCode(...id)));
        return { rawId: id.buffer, getClientExtensionResults: () => ({ prf: { enabled: opts.prf ?? true } }) } as unknown as Credential;
      },
      get: async (o?: CredentialRequestOptions) => {
        if (state.cancelNext === 'get') throw new DOMException('cancelado', 'NotAllowedError');
        const allowed = o!.publicKey!.allowCredentials![0]!.id as ArrayBuffer;
        if (!ids.has(btoa(String.fromCharCode(...new Uint8Array(allowed))))) throw new DOMException('no existe', 'NotAllowedError');
        const salt = (o!.publicKey!.extensions as { prf: { eval: { first: ArrayBuffer } } }).prf.eval.first;
        const first = await secretFor(salt);
        return { getClientExtensionResults: () => ({ prf: { results: { first } } }) } as unknown as Credential;
      },
    },
  };
  return { env, ids, state };
}

describe('desbloqueo con biometría', () => {
  beforeEach(() => {
    lockVault();
    setTestDb(`test-${crypto.randomUUID()}`);
  });

  it('se activa, desbloquea con la misma clave de datos y la contraseña sigue valiendo', async () => {
    const { env } = device();
    await initializeVault('contraseña-larga');
    await repos.waypoints.put(waypoint('Refugio'));
    expect(await biometricEnabled()).toBe(false);
    await enableBiometric(env);
    expect(await biometricEnabled()).toBe(true);
    expect((await readHeader())!.biometric!.credentialId).toBeTruthy();

    lockVault();
    expect(isUnlocked()).toBe(false);
    await unlockWithBiometric(env);
    expect(isUnlocked()).toBe(true);
    // Los datos se abren: es la misma clave de datos.
    expect((await repos.waypoints.loadAll()).map((w) => w.name)).toEqual(['Refugio']);
    // La contraseña sigue valiendo, y cambiarla no desactiva la biometría.
    lockVault();
    await unlockWithPassword('contraseña-larga');
    await changePassword('otra-contraseña-larga');
    expect(await biometricEnabled()).toBe(true);
    lockVault();
    await unlockWithBiometric(env);
    expect((await repos.waypoints.loadAll()).map((w) => w.name)).toEqual(['Refugio']);
  });

  it('si se desactiva ya no desbloquea, y si la clave de acceso se borró el navegador responde como si se cancelara (se usa la contraseña)', async () => {
    const d = device();
    await initializeVault('contraseña-larga');
    await enableBiometric(d.env);
    d.ids.clear(); // se borró la clave de acceso del dispositivo
    lockVault();
    await expect(unlockWithBiometric(d.env)).rejects.toMatchObject({ code: 'cancelled' });
    expect(isUnlocked()).toBe(false);
    await unlockWithPassword('contraseña-larga');
    await disableBiometric();
    expect(await biometricEnabled()).toBe(false);
    lockVault();
    await expect(unlockWithBiometric(d.env)).rejects.toMatchObject({ code: 'no-vault' });
  });

  it('un secreto de otro dispositivo no abre la clave de datos', async () => {
    const a = device();
    await initializeVault('contraseña-larga');
    await enableBiometric(a.env);
    // Otro autenticador que acepta la misma credencial pero tiene otra clave: da otro secreto y la envoltura no se abre.
    const other = device({ ids: a.ids });
    lockVault();
    await expect(unlockWithBiometric(other.env)).rejects.toMatchObject({ code: 'failed' });
    expect(isUnlocked()).toBe(false);
  });

  it('sin PRF, sin biometría del dispositivo o si la persona cancela no se cambia nada', async () => {
    await initializeVault('contraseña-larga');
    await expect(enableBiometric(device({ prf: false }).env)).rejects.toMatchObject({ code: 'no-prf' });
    await expect(enableBiometric(device({ platform: false }).env)).rejects.toMatchObject({ code: 'unsupported' });
    await expect(enableBiometric(device({ cancel: 'create' }).env)).rejects.toMatchObject({ code: 'cancelled' });
    await expect(enableBiometric(device({ cancel: 'get' }).env)).rejects.toBeInstanceOf(BiometricError);
    expect(await biometricEnabled()).toBe(false);
  });

  it('no se puede activar con la bóveda bloqueada', async () => {
    await initializeVault('contraseña-larga');
    lockVault();
    await expect(enableBiometric(device().env)).rejects.toThrow();
    expect(await biometricEnabled()).toBe(false);
  });
});

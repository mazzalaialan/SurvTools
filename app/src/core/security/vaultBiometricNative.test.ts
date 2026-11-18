import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTestDb } from '@/core/db/db';
import { repos } from '@/core/db/repository';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';

/** Un Keystore de Android simulado: el secreto solo sale si la huella «pasa», y se pierde si se agrega otra huella. */
const keystore = { value: null as Uint8Array | null, fingerprint: 'ok' as 'ok' | 'cancel' | 'locked', available: true, readCalls: 0, createFails: false };
vi.mock('@/core/platform', () => ({ isNativePlatform: () => true }));
vi.mock('./nativeBiometric', () => ({
  nativeAvailable: async () => keystore.available,
  createNativeSecret: async () => {
    if (keystore.createFails) throw { code: 1, message: 'no disponible' };
    keystore.value = crypto.getRandomValues(new Uint8Array(32));
    return keystore.value;
  },
  readNativeSecret: async () => {
    keystore.readCalls++;
    if (keystore.fingerprint === 'cancel') throw { code: 16, message: 'cancelado' };
    if (keystore.fingerprint === 'locked') throw { code: 2, message: 'bloqueado' };
    if (!keystore.value) throw { code: 21, message: 'No protected credentials found' };
    return keystore.value;
  },
  deleteNativeSecret: async () => void (keystore.value = null),
  nativeErrorCode: (e: { code?: number }) => ([11, 15, 16, 17].includes(Number(e?.code)) ? 'cancelled' : 'failed'),
}));

const { setTestIterations, initializeVault, lockVault, readHeader, unlockWithPassword } = await import('./vault');
const { isUnlocked } = await import('./session');
const { BiometricError, biometricEnabled, biometricSupported, disableBiometric, enableBiometric, unlockWithBiometric } = await import('./vaultBiometric');

setTestIterations(1_000);
const waypoint = (name: string) => newEntity<Waypoint>({ name, lat: -41.1, lon: -71.3, alt: 900, icon: 'cabin', notes: '', rainAlerts: false });

describe('desbloqueo con huella en la app nativa (Keystore de Android)', () => {
  beforeEach(() => {
    lockVault();
    setTestDb(`test-${crypto.randomUUID()}`);
    Object.assign(keystore, { value: null, fingerprint: 'ok', available: true, readCalls: 0, createFails: false });
  });

  it('se activa, desbloquea con la misma clave de datos y la contraseña sigue valiendo', async () => {
    await initializeVault('contraseña-larga');
    await repos.waypoints.put(waypoint('Refugio'));
    expect(await biometricSupported()).toBe(true);
    await enableBiometric();
    expect(await biometricEnabled()).toBe(true);
    const wrap = (await readHeader())!.biometric!;
    expect(wrap.native).toBe(true);
    expect(wrap.credentialId).toBe('');
    // Se pidió la huella una vez al activar, para comprobar que el secreto se puede usar.
    expect(keystore.readCalls).toBe(1);

    lockVault();
    expect(isUnlocked()).toBe(false);
    await unlockWithBiometric();
    expect(isUnlocked()).toBe(true);
    expect((await repos.waypoints.loadAll()).map((w: Waypoint) => w.name)).toEqual(['Refugio']);

    lockVault();
    await unlockWithPassword('contraseña-larga');
    expect(isUnlocked()).toBe(true);
  });

  it('si se cancela la huella al activar, no se cambia nada y no queda un secreto guardado', async () => {
    await initializeVault('contraseña-larga');
    keystore.fingerprint = 'cancel';
    await expect(enableBiometric()).rejects.toMatchObject({ code: 'cancelled' });
    expect(await biometricEnabled()).toBe(false);
    expect(keystore.value).toBeNull();
  });

  it('si el teléfono no tiene huella registrada, no se puede activar', async () => {
    await initializeVault('contraseña-larga');
    keystore.available = false;
    expect(await biometricSupported()).toBe(false);
    await expect(enableBiometric()).rejects.toMatchObject({ code: 'unsupported' });
    expect(await biometricEnabled()).toBe(false);
  });

  it('si Android no puede guardar el secreto, falla sin dejar nada activado', async () => {
    await initializeVault('contraseña-larga');
    keystore.createFails = true;
    await expect(enableBiometric()).rejects.toBeInstanceOf(BiometricError);
    expect(await biometricEnabled()).toBe(false);
  });

  it('cancelar la huella al desbloquear deja la bóveda cerrada y distingue «cancelado» de «falló»', async () => {
    await initializeVault('contraseña-larga');
    await enableBiometric();
    lockVault();
    keystore.fingerprint = 'cancel';
    await expect(unlockWithBiometric()).rejects.toMatchObject({ code: 'cancelled' });
    expect(isUnlocked()).toBe(false);
    keystore.fingerprint = 'locked';
    await expect(unlockWithBiometric()).rejects.toMatchObject({ code: 'failed' });
    expect(isUnlocked()).toBe(false);
  });

  it('si se agrega otra huella, Android invalida la clave: la huella ya no abre, pero la contraseña sí', async () => {
    await initializeVault('contraseña-larga');
    await enableBiometric();
    lockVault();
    keystore.value = null; // lo que pasa en el Keystore al registrar una huella nueva (BIOMETRY_CURRENT_SET)
    await expect(unlockWithBiometric()).rejects.toMatchObject({ code: 'failed' });
    expect(isUnlocked()).toBe(false);
    await unlockWithPassword('contraseña-larga');
    expect(isUnlocked()).toBe(true);
  });

  it('un secreto distinto del guardado no abre la clave de datos', async () => {
    await initializeVault('contraseña-larga');
    await enableBiometric();
    lockVault();
    keystore.value = crypto.getRandomValues(new Uint8Array(32));
    await expect(unlockWithBiometric()).rejects.toMatchObject({ code: 'failed' });
    expect(isUnlocked()).toBe(false);
  });

  it('desactivar borra el secreto del Keystore y quita la envoltura', async () => {
    await initializeVault('contraseña-larga');
    await enableBiometric();
    expect(keystore.value).not.toBeNull();
    await disableBiometric();
    expect(await biometricEnabled()).toBe(false);
    expect(keystore.value).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { WrongSecretError } from '@/core/crypto/crypto';
import { db, setTestDb } from '@/core/db/db';
import { blobStore, repos } from '@/core/db/repository';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import { LockedError, isUnlocked } from './session';
import {
  WeakPasswordError,
  addPassword,
  changePassword,
  initializeOpenVault,
  isOpenVault,
  removePassword,
  unlockOpenVault,
  initializeVault,
  isVaultInitialized,
  regenerateRecoveryKey,
  lockVault,
  setTestIterations,
  unlockWithPassword,
  unlockWithRecoveryKey,
  verifyPassword,
} from './vault';

setTestIterations(1_000);

const waypoint = () =>
  newEntity<Waypoint>({ name: 'Refugio Sierra', lat: -41.1, lon: -71.3, alt: 900, icon: 'cabin', notes: '', rainAlerts: false });

describe('vault', () => {
  beforeEach(() => {
    lockVault();
    setTestDb(`test-${crypto.randomUUID()}`);
  });

  it('se inicializa, queda desbloqueada y devuelve clave de recuperación', async () => {
    expect(await isVaultInitialized()).toBe(false);
    const recovery = await initializeVault('una-contraseña');
    expect(recovery).toMatch(/^[A-Z2-9-]{29}$/);
    expect(await isVaultInitialized()).toBe(true);
    expect(isUnlocked()).toBe(true);
  });

  it('rechaza contraseñas cortas', async () => {
    await expect(initializeVault('corta')).rejects.toBeInstanceOf(WeakPasswordError);
  });

  it('guarda las entidades cifradas, sin texto en claro', async () => {
    await initializeVault('una-contraseña');
    const wp = waypoint();
    await repos.waypoints.put(wp);
    const raw = await db.waypoints.get(wp.id);
    expect(raw?.id).toBe(wp.id);
    expect(JSON.stringify(raw)).not.toContain('Refugio');
    expect(await repos.waypoints.get(wp.id)).toEqual(wp);
  });

  it('bloqueada no permite leer datos', async () => {
    await initializeVault('una-contraseña');
    await repos.waypoints.put(waypoint());
    lockVault();
    await expect(repos.waypoints.loadAll()).rejects.toBeInstanceOf(LockedError);
  });

  it('desbloquea con contraseña y rechaza una incorrecta', async () => {
    await initializeVault('una-contraseña');
    const wp = waypoint();
    await repos.waypoints.put(wp);
    lockVault();
    await expect(unlockWithPassword('otra-contraseña')).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithPassword('una-contraseña');
    expect(await repos.waypoints.loadAll()).toEqual([wp]);
  });

  it('verifica la contraseña sin desbloquear ni bloquear', async () => {
    // Contraseñas de prueba, inventadas para el test (no son credenciales reales).
    const TEST_PASSWORD = 'contraseña-larga';
    const WRONG_TEST_PASSWORD = 'no-es-la-contraseña';
    await initializeVault(TEST_PASSWORD);
    lockVault();
    expect(await verifyPassword(TEST_PASSWORD)).toBe(true);
    expect(isUnlocked()).toBe(false);
    expect(await verifyPassword(WRONG_TEST_PASSWORD)).toBe(false);
  });

  it('recupera con la clave de recuperación (tipeada sin guiones) y permite cambiar la contraseña', async () => {
    const recovery = await initializeVault('olvidada-123');
    const wp = waypoint();
    await repos.waypoints.put(wp);
    lockVault();
    await unlockWithRecoveryKey(recovery.toLowerCase().replaceAll('-', ' '));
    await changePassword('nueva-contraseña');
    lockVault();
    await expect(unlockWithPassword('olvidada-123')).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithPassword('nueva-contraseña');
    expect(await repos.waypoints.get(wp.id)).toEqual(wp);
  });

  it('el borrado es lógico', async () => {
    await initializeVault('una-contraseña');
    const wp = waypoint();
    await repos.waypoints.put(wp);
    await repos.waypoints.remove(wp.id);
    expect(await repos.waypoints.loadAll()).toEqual([]);
    const all = await repos.waypoints.loadAll({ includeDeleted: true });
    expect(all[0]?.deletedAt).not.toBeNull();
  });

  it('cifra y recupera binarios', async () => {
    await initializeVault('una-contraseña');
    const bytes = new Uint8Array([1, 2, 3, 250]);
    await blobStore.put('foto-1', bytes);
    expect(await blobStore.get('foto-1')).toEqual(bytes);
  });
});

describe('bóveda sin contraseña', () => {
  beforeEach(() => {
    lockVault();
    setTestDb(`test-${crypto.randomUUID()}`);
  });

  it('se crea abierta, se vuelve a abrir sola y los datos se leen', async () => {
    await initializeOpenVault();
    expect(await isOpenVault()).toBe(true);
    expect(isUnlocked()).toBe(true);
    const wp = waypoint();
    await repos.waypoints.put(wp);
    // Al reiniciar la app (sin la clave en memoria) se abre sola.
    lockVault();
    expect(await unlockOpenVault()).toBe(true);
    expect((await repos.waypoints.loadAll())[0]?.name).toBe('Refugio Sierra');
  });

  it('poner contraseña: después se abre con ella o con la clave de recuperación, sin re-cifrar', async () => {
    await initializeOpenVault();
    await repos.waypoints.put(waypoint());
    const recovery = await addPassword('una-contraseña');
    expect(await isOpenVault()).toBe(false);
    expect(await unlockOpenVault()).toBe(false);
    lockVault();
    await expect(unlockWithPassword('otra-cosa')).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithPassword('una-contraseña');
    expect((await repos.waypoints.loadAll())).toHaveLength(1);
    lockVault();
    await unlockWithRecoveryKey(recovery);
    expect(isUnlocked()).toBe(true);
  });

  it('quitar la contraseña pide la actual y deja la bóveda abierta', async () => {
    await initializeVault('una-contraseña');
    await repos.waypoints.put(waypoint());
    await expect(removePassword('mal')).rejects.toBeInstanceOf(WrongSecretError);
    expect(await isOpenVault()).toBe(false);
    await removePassword('una-contraseña');
    expect(await isOpenVault()).toBe(true);
    lockVault();
    expect(await unlockOpenVault()).toBe(true);
    expect((await repos.waypoints.loadAll())).toHaveLength(1);
  });

  it('un código de recuperación nuevo reemplaza al anterior y conserva los datos y la contraseña', async () => {
    const oldCode = await initializeVault('contraseña-segura');
    await repos.waypoints.put(waypoint());
    const fresh = await regenerateRecoveryKey();
    expect(fresh).not.toBe(oldCode);
    lockVault();
    await expect(unlockWithRecoveryKey(oldCode)).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithRecoveryKey(fresh);
    expect((await repos.waypoints.loadAll()).map((w) => w.name)).toContain('Refugio Sierra');
    lockVault();
    await unlockWithPassword('contraseña-segura');
  });
});

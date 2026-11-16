import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WrongSecretError } from '@/core/crypto/crypto';
import { db, setTestDb } from '@/core/db/db';
import { repos } from '@/core/db/repository';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import { isUnlocked } from './session';
import { initializeVault, isVaultInitialized, lockVault, setTestIterations, unlockWithPassword } from './vault';
import { archiveCurrentVault, deleteArchive, eraseCurrentVault, hasVaultToArchive, listArchives, restoreArchive, verifyArchiveSecret } from './vaultArchive';

setTestIterations(1_000);
const waypoint = (name: string) => newEntity<Waypoint>({ name, lat: -41.1, lon: -71.3, alt: 900, icon: 'cabin', notes: '', rainAlerts: false });

describe('bóvedas anteriores guardadas aparte', () => {
  beforeEach(() => {
    lockVault();
    // El entorno de prueba no trae localStorage: uno mínimo en memoria.
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() });
    setTestDb(`test-${crypto.randomUUID()}`);
  });

  it('guarda la bóveda vieja, deja la app para empezar de cero y la recupera con la contraseña', async () => {
    await initializeVault('contraseña-vieja');
    await repos.waypoints.put(waypoint('Refugio Sierra'));
    expect(await hasVaultToArchive()).toBe(true);
    const entry = await archiveCurrentVault();
    // La app queda sin bóveda y bloqueada: empieza de cero.
    expect(isUnlocked()).toBe(false);
    expect(await isVaultInitialized()).toBe(false);
    expect(listArchives().map((a) => a.id)).toEqual([entry.id]);
    expect(entry.rows).toBeGreaterThan(0);

    // La bóveda nueva no ve nada de la vieja.
    await initializeVault('contraseña-nueva');
    expect(await repos.waypoints.loadAll()).toHaveLength(0);

    // Recuperar la vieja: la nueva se guarda aparte y las dos quedan a mano.
    await restoreArchive(entry.id, 'contraseña-vieja', 'password', 'archive');
    expect(isUnlocked()).toBe(true);
    expect((await repos.waypoints.loadAll()).map((w) => w.name)).toEqual(['Refugio Sierra']);
    const left = listArchives();
    expect(left).toHaveLength(1);
    expect(left[0]!.id).not.toBe(entry.id); // ahora la guardada es la nueva
    // La contraseña vieja vuelve a ser la de la bóveda activa.
    lockVault();
    await unlockWithPassword('contraseña-vieja');
    expect(isUnlocked()).toBe(true);
  });

  it('con una contraseña o clave incorrecta no se toca nada', async () => {
    const recovery = await initializeVault('contraseña-vieja');
    await repos.waypoints.put(waypoint('Cabaña'));
    const entry = await archiveCurrentVault();
    await initializeVault('contraseña-nueva');
    await repos.waypoints.put(waypoint('Lago'));

    expect(await verifyArchiveSecret(entry.id, 'otra', 'password')).toBe(false);
    expect(await verifyArchiveSecret(entry.id, 'contraseña-vieja', 'password')).toBe(true);
    expect(await verifyArchiveSecret(entry.id, recovery, 'recovery')).toBe(true);
    await expect(restoreArchive(entry.id, 'mala-contraseña', 'password', 'archive')).rejects.toBeInstanceOf(WrongSecretError);
    // Sigue la bóveda nueva y la vieja sigue guardada.
    expect((await repos.waypoints.loadAll()).map((w) => w.name)).toEqual(['Lago']);
    expect(listArchives()).toHaveLength(1);
  });

  it('también se recupera con la clave de recuperación', async () => {
    const recovery = await initializeVault('contraseña-vieja');
    await repos.waypoints.put(waypoint('Puesto'));
    const entry = await archiveCurrentVault();
    await restoreArchive(entry.id, recovery, 'recovery', 'erase');
    expect(isUnlocked()).toBe(true);
    expect((await repos.waypoints.loadAll()).map((w) => w.name)).toEqual(['Puesto']);
    expect(listArchives()).toHaveLength(0); // la activa se borró y la guardada se usó
  });

  it('borrar todo deja la app vacía y borrar una guardada la quita de la lista', async () => {
    await initializeVault('contraseña-vieja');
    await repos.waypoints.put(waypoint('Uno'));
    await eraseCurrentVault();
    expect(isUnlocked()).toBe(false);
    expect(await isVaultInitialized()).toBe(false);
    expect(await db.meta.count()).toBe(0);
    expect(listArchives()).toHaveLength(0);

    await initializeVault('otra-contraseña');
    const entry = await archiveCurrentVault();
    expect(listArchives()).toHaveLength(1);
    await deleteArchive(entry.id);
    expect(listArchives()).toHaveLength(0);
    expect(await verifyArchiveSecret(entry.id, 'otra-contraseña', 'password')).toBe(false);
  });
});

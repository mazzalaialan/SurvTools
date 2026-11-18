import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { WrongSecretError } from '@/core/crypto/crypto';
import { db, setTestDb } from '@/core/db/db';
import { blobStore, repos } from '@/core/db/repository';
import { newEntity } from '@/core/model/entity';
import type { Waypoint } from '@/core/model/types';
import { isUnlocked } from '@/core/security/session';
import { initializeOpenVault, initializeVault, isOpenVault, isVaultInitialized, lockVault, setTestIterations } from '@/core/security/vault';
import { BackupError, exportBackup, exportBackupStream, readBackup, restoreBackup } from './backup';

setTestIterations(1_000);

const waypoint = (name: string) => newEntity<Waypoint>({ name, lat: -41, lon: -71, alt: null, icon: 'cabin', notes: '', rainAlerts: false });

async function freshDb() {
  lockVault();
  setTestDb(`test-${crypto.randomUUID()}`);
}

describe('backup', () => {
  beforeEach(freshDb);

  it('exporta y restaura en otro dispositivo con la contraseña', async () => {
    await initializeVault('contraseña-origen');
    const wp = waypoint('Refugio');
    await repos.waypoints.put(wp);
    const gone = waypoint('Viejo');
    await repos.waypoints.put(gone);
    await repos.waypoints.remove(gone.id);
    await blobStore.put('foto', new Uint8Array([9, 8, 7]));
    await db.settings.put({ key: 'app', value: { language: 'en', theme: 'red' } });
    const file = await exportBackup('1.2.3');

    // "Otro dispositivo": base vacía, sin bóveda.
    await freshDb();
    expect(await isVaultInitialized()).toBe(false);
    await restoreBackup(readBackup(file), 'contraseña-origen', 'password');

    expect(isUnlocked()).toBe(true);
    expect(await repos.waypoints.loadAll()).toEqual([wp]);
    expect((await repos.waypoints.loadAll({ includeDeleted: true })).length).toBe(2);
    expect(await blobStore.get('foto')).toEqual(new Uint8Array([9, 8, 7]));
    expect((await db.settings.get('app'))?.value).toEqual({ language: 'en', theme: 'red' });
  });

  it('el archivo no contiene datos en claro', async () => {
    await initializeVault('contraseña-origen');
    await repos.waypoints.put(waypoint('Escondite secreto'));
    const entries = unzipSync(await exportBackup('1.0.0'));
    const text = Object.values(entries).map((e) => strFromU8(e, true)).join('');
    expect(text).not.toContain('Escondite');
  });

  it('reemplaza los datos existentes', async () => {
    await initializeVault('contraseña-origen');
    await repos.waypoints.put(waypoint('Del backup'));
    const file = await exportBackup('1.0.0');

    await freshDb();
    await initializeVault('otra-contraseña');
    await repos.waypoints.put(waypoint('Se pierde'));
    await restoreBackup(readBackup(file), 'contraseña-origen', 'password');
    expect((await repos.waypoints.loadAll()).map((w) => w.name)).toEqual(['Del backup']);
  });

  it('rechaza una contraseña incorrecta sin tocar los datos', async () => {
    await initializeVault('contraseña-origen');
    const file = await exportBackup('1.0.0');

    await freshDb();
    await initializeVault('actual-123');
    const wp = waypoint('Intacto');
    await repos.waypoints.put(wp);
    await expect(restoreBackup(readBackup(file), 'mal-escrita', 'password')).rejects.toBeInstanceOf(WrongSecretError);
    expect(await repos.waypoints.loadAll()).toEqual([wp]);
  });

  it('restaura con la clave de recuperación', async () => {
    const recovery = await initializeVault('contraseña-origen');
    await repos.waypoints.put(waypoint('Refugio'));
    const file = await exportBackup('1.0.0');

    await freshDb();
    await restoreBackup(readBackup(file), recovery.toLowerCase(), 'recovery');
    expect((await repos.waypoints.loadAll()).length).toBe(1);
  });

  it('rechaza archivos inválidos y de versiones más nuevas', async () => {
    expect(() => readBackup(new Uint8Array([1, 2, 3]))).toThrow(BackupError);
    await initializeVault('contraseña-origen');
    const entries = unzipSync(await exportBackup('1.0.0'));
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!));
    entries['manifest.json'] = strToU8(JSON.stringify({ ...manifest, formatVersion: 99 }));
    expect(() => readBackup(zipSync(entries))).toThrow('newer-version');
  });
});

describe('backup de una bóveda sin contraseña', () => {
  beforeEach(freshDb);

  it('pide una contraseña para el backup, sin clave de recuperación, y al restaurar queda sin contraseña', async () => {
    await initializeOpenVault();
    await repos.waypoints.put(waypoint('Refugio'));
    await expect(exportBackup('1.0.0')).rejects.toMatchObject({ code: 'needs-password' });
    const file = await exportBackup('1.0.0', 'clave-del-backup');
    const parsed = readBackup(file);
    expect(parsed.header.recovery).toBeUndefined();
    expect(parsed.header.open).toBe(true);

    await freshDb();
    await expect(restoreBackup(parsed, 'otra-clave', 'password')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(restoreBackup(parsed, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', 'recovery')).rejects.toBeInstanceOf(WrongSecretError);
    await restoreBackup(parsed, 'clave-del-backup', 'password');
    expect(await isOpenVault()).toBe(true);
    expect((await repos.waypoints.loadAll()).map((w) => w.name)).toEqual(['Refugio']);
  });
});

describe('exportBackupStream (de a pedazos)', () => {
  beforeEach(freshDb);

  it('arma el mismo backup que exportBackup: se lee igual y se restaura con la contraseña', async () => {
    await initializeVault('contraseña-origen');
    await repos.waypoints.put(waypoint('Refugio'));
    await repos.waypoints.put(waypoint('Laguna'));
    // Adjuntos de varios tamaños, uno de más de un bloque de escritura.
    const big = new Uint8Array(1_700_000);
    for (let i = 0; i < big.length; i += 65536) crypto.getRandomValues(big.subarray(i, i + 65536));
    await blobStore.put('foto-grande', big);
    await blobStore.put('foto-chica', new Uint8Array([1, 2, 3]));
    await db.settings.put({ key: 'app', value: { language: 'en' } });

    const whole = readBackup(await exportBackup('1.2.3'));
    const chunks: Uint8Array[] = [];
    const size = await exportBackupStream('1.2.3', undefined, async (c) => void chunks.push(c));
    const out = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    expect(off).toBe(size);
    expect(chunks.length).toBeGreaterThan(1);
    const streamed = readBackup(out);

    expect(streamed.manifest.counts).toEqual(whole.manifest.counts);
    expect(streamed.manifest.vault).toEqual(whole.manifest.vault);
    expect([...streamed.blobs.keys()].sort()).toEqual([...whole.blobs.keys()].sort());
    for (const [id, sealed] of whole.blobs) {
      expect(new Uint8Array(streamed.blobs.get(id)!.ct)).toEqual(new Uint8Array(sealed.ct));
      expect(streamed.blobs.get(id)!.iv).toEqual(sealed.iv);
    }
    expect(streamed.data).toEqual(whole.data);

    // Y se restaura en otro dispositivo con la contraseña.
    await freshDb();
    await restoreBackup(streamed, 'contraseña-origen', 'password');
    expect(isUnlocked()).toBe(true);
    expect((await repos.waypoints.loadAll()).map((w) => w.name).sort()).toEqual(['Laguna', 'Refugio']);
    expect(await blobStore.get('foto-grande')).toEqual(big);
  }, 30_000);

  it('si falla la escritura, corta y avisa', async () => {
    await initializeVault('contraseña-origen');
    await blobStore.put('foto', new Uint8Array(2 * 1024 * 1024));
    await expect(
      exportBackupStream('1.2.3', undefined, async () => {
        throw new Error('disco lleno');
      }),
    ).rejects.toThrow('disco lleno');
  });
});

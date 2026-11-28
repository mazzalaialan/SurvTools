import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { ageOn, medTimes, monthsSince, normalizeProfile } from '@/modules/firstAid/medicalStore';
import type { MedicalProfile } from '@/core/model/types';
import { UserDb } from './db';

describe('migraciones', () => {
  it('una base v2 (v0.3) pasa a la versión actual conservando los datos y suma las tablas nuevas', async () => {
    const name = 'upgrade-v2-v3';
    const tables = ['categories', 'locations', 'items', 'lots', 'stockMins', 'documents', 'attachments', 'waypoints', 'householdMembers', 'recommendationRules'];
    const old = new Dexie(name);
    old.version(1).stores({ meta: 'key', settings: 'key', blobs: 'id', alertIndex: 'lotId, dueDate', ...Object.fromEntries(tables.map((t) => [t, 'id, updatedAt'])) });
    old.version(2).stores({ alertIndex: 'lotId, notifyFrom' });
    await old.open();
    await old.table('items').put({ id: 'a', updatedAt: 'x', deletedAt: null, iv: new Uint8Array(12), ct: new ArrayBuffer(4) });
    old.close();

    const upgraded = new UserDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(9);
    expect(await upgraded.items.count()).toBe(1);
    await upgraded.medicalProfiles.put({ id: 'p', updatedAt: 'x', deletedAt: null, iv: new Uint8Array(12), ct: new ArrayBuffer(4) });
    expect(await upgraded.medicalProfiles.count()).toBe(1);
    await upgraded.contacts.put({ id: 'c', updatedAt: 'x', deletedAt: null, iv: new Uint8Array(12), ct: new ArrayBuffer(4) });
    expect(await upgraded.contacts.count()).toBe(1);
    await upgraded.gardenBeds.put({ id: 'b', updatedAt: 'x', deletedAt: null, iv: new Uint8Array(12), ct: new ArrayBuffer(4) });
    expect(await upgraded.gardenBeds.count()).toBe(1);
    upgraded.close();
  });
});

describe('fichas de mascotas', () => {
  it('meses desde una fecha', () => {
    expect(monthsSince('2026-10-05', '2026-10-31')).toBe(0);
    expect(monthsSince('2026-03-10', '2026-10-31')).toBe(7);
    expect(monthsSince('2026-03-31', '2026-10-30')).toBe(6);
    expect(monthsSince('2026-12-01', '2026-10-31')).toBe(0); // fecha futura: no negativo
  });

  it('las fichas anteriores a las mascotas son de personas', () => {
    const old = { id: 'p', name: 'Ana' } as unknown as MedicalProfile;
    expect(normalizeProfile(old)).toMatchObject({ kind: 'person', pet: null });
  });
});

describe('medTimes', () => {
  it('calcula los horarios del día desde la primera toma', () => {
    expect(medTimes(8, '08:00')).toEqual(['08:00', '16:00', '00:00']);
    expect(medTimes(12, '09:30')).toEqual(['09:30', '21:30']);
    expect(medTimes(24, '22:00')).toEqual(['22:00']);
    expect(medTimes(168, '08:00')).toEqual(['08:00']);
    expect(medTimes(0, '08:00')).toEqual([]);
    expect(medTimes(8, null)).toEqual([]);
  });
});

describe('ageOn', () => {
  it('cuenta años cumplidos', () => {
    expect(ageOn('2000-10-31', '2026-10-30')).toBe(25);
    expect(ageOn('2000-10-30', '2026-10-30')).toBe(26);
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25);
  });
});

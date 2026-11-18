import { describe, expect, it } from 'vitest';
import { backupReminder, snoozeUntil } from './reminder';

const now = new Date('2026-11-20T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe('recordatorio de backup', () => {
  it('sin ningún backup: avisa recién a los 3 días de uso', () => {
    expect(backupReminder({ lastBackupAt: null, firstUseAt: ago(1), snoozedUntil: null }, now)).toEqual({ due: false, never: true, days: 1 });
    expect(backupReminder({ lastBackupAt: null, firstUseAt: ago(3), snoozedUntil: null }, now)).toEqual({ due: true, never: true, days: 3 });
    expect(backupReminder({ lastBackupAt: null, firstUseAt: ago(40), snoozedUntil: null }, now).due).toBe(true);
  });
  it('sin saber desde cuándo se usa la app, no molesta', () => {
    expect(backupReminder({ lastBackupAt: null, firstUseAt: null, snoozedUntil: null }, now)).toEqual({ due: false, never: true, days: null });
  });
  it('con un backup hecho: avisa a los 14 días, no antes', () => {
    expect(backupReminder({ lastBackupAt: ago(13), firstUseAt: ago(90), snoozedUntil: null }, now)).toEqual({ due: false, never: false, days: 13 });
    expect(backupReminder({ lastBackupAt: ago(14), firstUseAt: ago(90), snoozedUntil: null }, now)).toEqual({ due: true, never: false, days: 14 });
    expect(backupReminder({ lastBackupAt: ago(60), firstUseAt: ago(90), snoozedUntil: null }, now).days).toBe(60);
  });
  it('un backup reciente cuenta aunque nunca se haya pospuesto nada', () => {
    expect(backupReminder({ lastBackupAt: ago(0), firstUseAt: ago(200), snoozedUntil: null }, now).due).toBe(false);
  });
  it('posponer lo oculta hasta esa fecha y después vuelve', () => {
    const snoozed = snoozeUntil(now);
    expect(Date.parse(snoozed) - now.getTime()).toBe(7 * 86_400_000);
    expect(backupReminder({ lastBackupAt: ago(30), firstUseAt: ago(90), snoozedUntil: snoozed }, now).due).toBe(false);
    const later = new Date(now.getTime() + 8 * 86_400_000);
    expect(backupReminder({ lastBackupAt: ago(30), firstUseAt: ago(90), snoozedUntil: snoozed }, later).due).toBe(true);
  });
});

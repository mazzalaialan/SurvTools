/**
 * Recordatorio de backup. Los datos de VikArg viven solo en este dispositivo (y en la app nativa la copia automática de Android está apagada),
 * así que el backup cifrado de VikArg es la única copia. El backup se cifra con una contraseña que la persona elige y la app NO guarda: por eso
 * no puede hacerse solo, y lo que corresponde es avisar.
 */
export const BACKUP_STALE_DAYS = 14;
/** Días de uso antes del primer aviso de «todavía no hiciste ningún backup». */
export const FIRST_REMINDER_DAYS = 3;
export const SNOOZE_DAYS = 7;

export interface ReminderInput {
  /** Cuándo fue el último backup hecho (null: nunca). */
  lastBackupAt: string | null;
  /** Cuándo se empezó a usar la app en este dispositivo (null: todavía no se sabe). */
  firstUseAt: string | null;
  /** «Recordámelo en una semana»: hasta cuándo no se muestra. */
  snoozedUntil: string | null;
}

export interface Reminder {
  due: boolean;
  /** Nunca hizo un backup. */
  never: boolean;
  /** Días desde el último backup (o desde que empezó a usar la app, si nunca hizo uno). */
  days: number | null;
}

const DAY_MS = 86_400_000;
const daysSince = (iso: string, now: Date): number => Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS);

export function backupReminder(input: ReminderInput, now = new Date()): Reminder {
  const snoozed = input.snoozedUntil !== null && Date.parse(input.snoozedUntil) > now.getTime();
  if (input.lastBackupAt) {
    const days = daysSince(input.lastBackupAt, now);
    return { due: !snoozed && days >= BACKUP_STALE_DAYS, never: false, days };
  }
  if (!input.firstUseAt) return { due: false, never: true, days: null };
  const days = daysSince(input.firstUseAt, now);
  return { due: !snoozed && days >= FIRST_REMINDER_DAYS, never: true, days };
}

/** Hasta cuándo se pospone el aviso si se pide «recordámelo en una semana». */
export function snoozeUntil(now = new Date()): string {
  return new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString();
}

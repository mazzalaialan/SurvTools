import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { lastBackupAt } from '@/core/backup/backup';
import { backupReminder, snoozeUntil } from '@/core/backup/reminder';
import { useSettings } from '@/core/settings/settings';

/**
 * Aviso en el Inicio cuando hace falta un backup: nunca se hizo uno (pasados unos días de uso) o pasaron 14 días o más. Los datos viven solo en
 * este dispositivo, así que el backup de VikArg es la única copia. «Recordármelo en una semana» lo oculta ese tiempo.
 */
export function BackupReminderCard() {
  const { t } = useTranslation();
  const firstUseAt = useSettings((s) => s.settings.firstUseAt);
  const snoozedUntil = useSettings((s) => s.settings.backupReminderSnoozedUntil);
  const update = useSettings((s) => s.update);
  const [last, setLast] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void lastBackupAt().then(setLast);
  }, []);
  if (last === undefined) return null;
  const r = backupReminder({ lastBackupAt: last, firstUseAt, snoozedUntil });
  if (!r.due) return null;
  return (
    <section className="card stack warning-box" aria-labelledby="backup-reminder-title" data-testid="backup-reminder">
      <h2 id="backup-reminder-title" className="section-title" style={{ margin: 0 }}>
        <Archive size={18} aria-hidden /> {t('backupReminder.title')}
      </h2>
      <p style={{ margin: 0 }}>{r.never ? t('backupReminder.never') : t('backupReminder.stale', { days: r.days })}</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link className="btn btn-primary" to="/settings/backup" data-testid="backup-reminder-do">
          {t('backupReminder.do')}
        </Link>
        <button className="btn" type="button" onClick={() => void update({ backupReminderSnoozedUntil: snoozeUntil() })} data-testid="backup-reminder-later">
          {t('backupReminder.later')}
        </button>
      </div>
    </section>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { CONTACT_EMAIL } from '@/core/about';
import { deleteServerAccount, retryPendingDeletes, ServerError } from '@/core/notifications/notifications';
import { readNotificationState, type PushRegistration } from '@/core/notifications/state';
import { useSettings } from '@/core/settings/settings';
import { useVault } from '@/core/security/useVault';
import { verifyPassword } from '@/core/security/vault';
import { Dialog } from '@/ui/Dialog';
import { Collapsible } from '@/ui/Collapsible';

/**
 * Eliminar mi cuenta: VikArg no tiene usuario y contraseña en el servidor; la
 * "cuenta" es este dispositivo, que se registra al activar las notificaciones.
 * Borrarla elimina todo lo que el servidor guarda de él. Pide la contraseña de
 * la app para que no se borre por un toque accidental.
 */
export function AccountSection() {
  const { t } = useTranslation();
  const notificationsEnabled = useSettings((s) => s.settings.notificationsEnabled);
  const [push, setPush] = useState<PushRegistration | null | undefined>(undefined);
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  // Sin contraseña en la app: se confirma escribiendo una palabra (BORRAR).
  const openVault = useVault((s) => s.open);
  const confirmWord = t('account.confirmWord');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void readNotificationState().then((s) => {
      setPush(s.push);
      setPending(s.pendingDeletes.length);
    });
  }, [notificationsEnabled, done]);

  const close = () => {
    setOpen(false);
    setPassword('');
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (openVault ? password.trim().toUpperCase() !== confirmWord.toUpperCase() : !(await verifyPassword(password)))
        return setError(t(openVault ? 'account.wrongWord' : 'account.wrongPassword', { word: confirmWord }));
      await deleteServerAccount();
      setDone(true);
      close();
    } catch (err) {
      if (!(err instanceof ServerError)) throw err;
      setError(t(err.code === 'unreachable' ? 'account.unreachable' : 'account.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    // Texto largo y una acción destructiva de uso raro: va en un desplegable cerrado, con el estado a la vista en el encabezado.
    <Collapsible
      id="account"
      testId="account"
      title={t('account.title')}
      summary={done ? t('account.doneShort') : push === undefined ? undefined : push ? t('account.summaryActive') : pending > 0 ? t('account.pendingShort') : t('account.none')}
    >
      <p className="hint" style={{ margin: 0 }}>{t('account.intro')}</p>
      <ul className="account-list hint">
        {(['subscription', 'prefs', 'alerts', 'places', 'notices'] as const).map((k) => (
          <li key={k}>{t(`account.stored.${k}`)}</li>
        ))}
      </ul>
      <p className="hint" style={{ margin: 0 }}>{t('account.notStored')}</p>

      {done && (
        <p className="account-done" role="status" data-testid="account-done">
          {t('account.done')}
        </p>
      )}
      {push === undefined ? null : push ? (
        <>
          <p className="hint" style={{ margin: 0 }} data-testid="account-device">
            {t('account.device', { server: push.serverUrl, id: push.deviceId })}
          </p>
          <button className="btn btn-danger-outline" type="button" onClick={() => setOpen(true)}>
            <Trash2 size={18} aria-hidden /> {t('account.delete')}
          </button>
        </>
      ) : pending > 0 ? (
        <>
          <p className="hint" style={{ margin: 0 }} data-testid="account-pending">
            {t('account.pending')}
          </p>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const left = await retryPendingDeletes();
              setBusy(false);
              setPending(left);
              if (left) setError(t('account.unreachable'));
              else setDone(true);
            }}
          >
            {t('account.retry')}
          </button>
          {error && !open && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        !done && (
          <p className="empty" data-testid="account-none">
            {t('account.none')}
          </p>
        )
      )}
      <p className="hint" style={{ margin: 0 }}>{t('account.byMail', { email: CONTACT_EMAIL })}</p>

      {open && (
        <Dialog title={t('account.confirmTitle')} onClose={close}>
          <form className="stack" onSubmit={submit}>
            <p style={{ margin: 0 }}>{t('account.confirmText')}</p>
            <div className="field">
              <label htmlFor="account-password">{openVault ? t('account.typeWord', { word: confirmWord }) : t('account.password')}</label>
              <input
                id="account-password"
                className="input"
                type={openVault ? 'text' : 'password'}
                autoComplete={openVault ? 'off' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-danger" type="submit" disabled={!password || busy}>
              <Trash2 size={18} aria-hidden /> {t('account.confirm')}
            </button>
            <button className="btn" type="button" onClick={close}>
              {t('common.cancel')}
            </button>
          </form>
        </Dialog>
      )}
    </Collapsible>
  );
}

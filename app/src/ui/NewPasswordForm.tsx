import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MIN_PASSWORD_LENGTH } from '@/core/security/vault';

interface Props {
  submitLabel: string;
  busyLabel: string;
  onSubmit: (password: string) => Promise<void>;
  /** Pone el cursor en el primer campo al mostrarse. Solo en las pantallas dedicadas a crear la contraseña; en Ajustes no (abriría el teclado al entrar). */
  autoFocus?: boolean;
}

/** Contraseña + confirmación, con las validaciones de la bóveda. */
export function NewPasswordForm({ submitLabel, busyLabel, onSubmit, autoFocus = false }: Props) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('setup.tooShort', { min: MIN_PASSWORD_LENGTH }));
    if (password !== confirm) return setError(t('setup.mismatch'));
    setError(null);
    setBusy(true);
    try {
      await onSubmit(password);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="new-password">{t('setup.password')}</label>
        <input
          id="new-password"
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus={autoFocus}
        />
        <p className="hint">{t('setup.hint', { min: MIN_PASSWORD_LENGTH })}</p>
      </div>
      <div className="field">
        <label htmlFor="confirm-password">{t('setup.confirm')}</label>
        <input
          id="confirm-password"
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}

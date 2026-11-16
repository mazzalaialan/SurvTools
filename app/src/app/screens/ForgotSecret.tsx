import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Trash2 } from 'lucide-react';
import { archiveCurrentVault, eraseCurrentVault } from '@/core/security/vaultArchive';
import { useVault } from '@/core/security/useVault';

/**
 * Salida para quien olvidó la contraseña y también la clave de recuperación: guardar la bóveda anterior aparte (cifrada; se puede recuperar si
 * aparece la contraseña o el código) y empezar de cero, o borrar todo. Sin esta pantalla el dispositivo quedaba trabado.
 */
export function ForgotSecret({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState<'archive' | 'erase' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmWord = t('forgot.confirmWord');

  async function run(kind: 'archive' | 'erase') {
    setBusy(kind);
    setError(null);
    try {
      await (kind === 'archive' ? archiveCurrentVault() : eraseCurrentVault());
      // Sin bóveda: la app pasa sola a la pantalla de empezar de cero.
      await useVault.getState().refresh();
    } catch {
      setError(t('forgot.failed'));
      setBusy(null);
    }
  }

  return (
    <div className="card stack" data-testid="forgot-secret">
      <h2>{t('forgot.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('forgot.intro')}</p>
      <div className="stack" style={{ gap: 6 }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>
          <Archive size={16} aria-hidden /> {t('forgot.archiveTitle')}
        </h3>
        <p className="hint" style={{ margin: 0 }}>{t('forgot.archiveHint')}</p>
        <button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void run('archive')} data-testid="forgot-archive">
          {busy === 'archive' ? t('forgot.working') : t('forgot.archiveButton')}
        </button>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <h3 style={{ fontSize: '1rem', margin: 0 }}>
          <Trash2 size={16} aria-hidden /> {t('forgot.eraseTitle')}
        </h3>
        <p className="warning-box" style={{ margin: 0 }}>{t('forgot.eraseWarning')}</p>
        <div className="field">
          <label htmlFor="forgot-word">{t('forgot.typeWord', { word: confirmWord })}</label>
          <input id="forgot-word" className="input" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="characters" data-testid="forgot-word" />
        </div>
        <button className="btn btn-danger" type="button" disabled={busy !== null || word.trim().toUpperCase() !== confirmWord.toUpperCase()} onClick={() => void run('erase')} data-testid="forgot-erase">
          {busy === 'erase' ? t('forgot.working') : t('forgot.eraseButton')}
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn-link" type="button" onClick={onBack} disabled={busy !== null}>
        {t('forgot.back')}
      </button>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { WrongSecretError } from '@/core/crypto/crypto';
import { BiometricError } from '@/core/security/vaultBiometric';
import { Fingerprint, HeartPulse } from 'lucide-react';
import { readEmergencyCard, type EmergencyCard } from '@/core/security/emergencyCard';
import { useVault } from '@/core/security/useVault';
import { useSettings } from '@/core/settings/settings';
import { EmergencyCardView } from '@/modules/firstAid/EmergencyCardView';
import { useRecorder } from '@/modules/tracks/recorder';
import { BrandHeader } from '@/ui/Brand';
import { ForgotSecret } from './ForgotSecret';

type Mode = 'password' | 'recovery' | 'forgot';

export function UnlockScreen() {
  const { t } = useTranslation();
  const unlock = useVault((s) => s.unlock);
  const recover = useVault((s) => s.recover);
  const unlockBiometric = useVault((s) => s.unlockBiometric);
  const hasBiometric = useVault((s) => s.biometric);
  const recording = useRecorder((s) => s.status === 'recording');
  const [mode, setMode] = useState<Mode>('password');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Datos de emergencia sin desbloquear (si se activaron en Ajustes): para quien te asista.
  const emergencyOnLock = useSettings((s) => s.settings.emergencyOnLock);
  const [card, setCard] = useState<EmergencyCard | null>(null);
  const [showCard, setShowCard] = useState(false);
  useEffect(() => {
    if (emergencyOnLock) void readEmergencyCard().then(setCard);
  }, [emergencyOnLock]);

  function switchMode(next: Mode) {
    setMode(next);
    setSecret('');
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'password' ? unlock(secret) : recover(secret));
    } catch (err) {
      if (!(err instanceof WrongSecretError)) throw err;
      setError(t(mode === 'password' ? 'unlock.wrong' : 'unlock.wrongRecovery'));
      setBusy(false);
    }
  }

  async function handleBiometric() {
    setBusy(true);
    setError(null);
    try {
      await unlockBiometric();
    } catch (err) {
      if (!(err instanceof BiometricError)) throw err;
      // Cancelar no es un error: se puede volver a tocar el botón o usar la contraseña.
      // Los navegadores responden igual cuando se cancela que cuando la clave de acceso ya no existe: se avisa sin tratarlo como error.
      setError(t(err.code === 'cancelled' ? 'unlock.biometricCancelled' : 'unlock.biometricFailed'));
      setBusy(false);
    }
  }

  const isPassword = mode === 'password';
  if (mode === 'forgot') {
    return (
      <main className="gate">
        <div className="gate-panel">
          <BrandHeader />
          <ForgotSecret onBack={() => switchMode('password')} />
        </div>
      </main>
    );
  }

  return (
    <main className="gate">
      <div className="gate-panel">
        <BrandHeader />
        {/* Sin datos del recorrido: con la app bloqueada no se muestra nada propio. */}
        {recording && (
          <p className="hint rec-locked" role="status" data-testid="rec-locked">
            {t('tracks.rec.whileLocked')}
          </p>
        )}
        {emergencyOnLock && (
          <section className="card stack lock-emergency" aria-labelledby="lock-emergency-title">
            <h2 id="lock-emergency-title" className="section-title" style={{ margin: 0 }}>
              <HeartPulse size={20} aria-hidden style={{ color: 'var(--danger)', verticalAlign: 'text-bottom' }} /> {t('lockCard.title')}
            </h2>
            {showCard ? (
              <>
                <EmergencyCardView card={card} />
                <button className="btn" type="button" onClick={() => setShowCard(false)}>
                  {t('lockCard.hide')}
                </button>
              </>
            ) : (
              <>
                <p className="hint" style={{ margin: 0 }}>{t('lockCard.hint')}</p>
                <button className="btn" type="button" onClick={() => setShowCard(true)} data-testid="lock-emergency-show">
                  {t('lockCard.show')}
                </button>
              </>
            )}
          </section>
        )}
        <form className="card stack" onSubmit={handleSubmit}>
          <h2>{t(isPassword ? 'unlock.title' : 'unlock.recoveryTitle')}</h2>
          {isPassword && hasBiometric && (
            <button className="btn btn-primary btn-block" type="button" disabled={busy} onClick={() => void handleBiometric()} data-testid="unlock-biometric">
              <Fingerprint size={18} aria-hidden /> {t('unlock.biometric')}
            </button>
          )}
          <div className="field">
            <label htmlFor="secret">{t(isPassword ? 'unlock.password' : 'unlock.recoveryKey')}</label>
            <input
              id="secret"
              className="input"
              type={isPassword ? 'password' : 'text'}
              autoComplete={isPassword ? 'current-password' : 'off'}
              autoCapitalize={isPassword ? undefined : 'characters'}
              spellCheck={false}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoFocus={!showCard}
            />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !secret}>
            {busy ? t('unlock.unlocking') : t('unlock.submit')}
          </button>
          <button className="btn-link" type="button" onClick={() => switchMode(isPassword ? 'recovery' : 'password')}>
            {t(isPassword ? 'unlock.useRecovery' : 'unlock.usePassword')}
          </button>
          <button className="btn-link" type="button" onClick={() => switchMode('forgot')} data-testid="forgot-link">
            {t('unlock.forgotBoth')}
          </button>
        </form>
      </div>
    </main>
  );
}

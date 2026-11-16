import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint } from 'lucide-react';
import { useVault } from '@/core/security/useVault';
import { BiometricError, biometricSupported, type BiometricErrorCode } from '@/core/security/vaultBiometric';
import { confirmAction } from '@/ui/confirm';

/**
 * Activar o desactivar el desbloqueo con huella, cara o PIN del dispositivo (ver core/security/vaultBiometric.ts). Solo para bóvedas con
 * contraseña (una sin contraseña entra sola). La contraseña y la clave de recuperación siguen valiendo siempre.
 */
export function BiometricUnlockSettings() {
  const { t } = useTranslation();
  const enabled = useVault((s) => s.biometric);
  const enable = useVault((s) => s.enableBiometric);
  const disable = useVault((s) => s.disableBiometric);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    void biometricSupported().then(setSupported);
  }, []);

  const failText = (code: BiometricErrorCode) => t(`biometricUnlock.error.${code}`);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      await enable();
      setMessage({ kind: 'ok', text: t('biometricUnlock.enabledOk') });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof BiometricError ? failText(err.code) : failText('failed') });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!(await confirmAction(t('biometricUnlock.confirmOff')))) return;
    setBusy(true);
    setMessage(null);
    try {
      await disable();
      setMessage({ kind: 'ok', text: t('biometricUnlock.disabledOk') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" data-testid="biometric-unlock" aria-labelledby="biometric-unlock-title">
      <h3 id="biometric-unlock-title" className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
        <Fingerprint size={16} aria-hidden /> {t('biometricUnlock.title')}
      </h3>
      <p className="hint" style={{ margin: 0 }}>{t('biometricUnlock.hint')}</p>
      {enabled ? (
        <>
          <p className="ok-box" style={{ margin: 0 }} data-testid="biometric-unlock-on">{t('biometricUnlock.on')}</p>
          <button className="btn" type="button" disabled={busy} onClick={() => void turnOff()} data-testid="biometric-unlock-off">
            {t('biometricUnlock.turnOff')}
          </button>
        </>
      ) : supported === false ? (
        <p className="warning-box" style={{ margin: 0 }} data-testid="biometric-unlock-unsupported">{t('biometricUnlock.unsupported')}</p>
      ) : (
        <button className="btn" type="button" disabled={busy || supported === null} onClick={() => void turnOn()} data-testid="biometric-unlock-on-button">
          {busy ? t('biometricUnlock.working') : t('biometricUnlock.turnOn')}
        </button>
      )}
      {message && (
        <p className={message.kind === 'ok' ? 'ok-box' : 'error'} role="status" style={{ margin: 0 }} data-testid="biometric-unlock-message">
          {message.text}
        </p>
      )}
    </section>
  );
}

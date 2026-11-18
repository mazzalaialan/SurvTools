import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Printer, Share2 } from 'lucide-react';
import { isNativePlatform } from '@/core/platform';
import { useVault } from '@/core/security/useVault';
import { BrandHeader } from '@/ui/Brand';
import { deliverFile } from '@/ui/files';

export function RecoveryKeyScreen({ recoveryKey }: { recoveryKey: string }) {
  const { t } = useTranslation();
  const acknowledge = useVault((s) => s.acknowledgeRecoveryKey);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
  }

  /** En la app nativa no hay impresión del navegador: la clave se comparte como archivo de texto (a una impresora, a otro equipo, donde se guarde). */
  async function shareKey() {
    const text = `${t('recovery.title')}\n\n${recoveryKey}\n\n${t('recovery.warning')}\n`;
    try {
      await deliverFile(new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>, 'clave-de-recuperacion-vikarg.txt', 'text/plain');
    } catch {
      /* cerró el menú de compartir: no pasa nada */
    }
  }

  return (
    <main className="gate">
      <div className="gate-panel">
        <BrandHeader />
        <div className="card stack">
          <h2>{t('recovery.title')}</h2>
          <p className="hint">{t('recovery.intro')}</p>
          <div className="printable stack">
            <p className="recovery-key" aria-label={t('recovery.title')}>{recoveryKey}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" type="button" onClick={copy} style={{ flex: 1 }}>
              <Copy size={18} /> {copied ? t('common.copied') : t('common.copy')}
            </button>
            {isNativePlatform() ? (
              <button className="btn" type="button" onClick={() => void shareKey()} style={{ flex: 1 }} data-testid="recovery-share">
                <Share2 size={18} /> {t('recovery.shareFile')}
              </button>
            ) : (
              <button className="btn" type="button" onClick={() => window.print()} style={{ flex: 1 }}>
                <Printer size={18} /> {t('common.print')}
              </button>
            )}
          </div>
          <p className="warning-box">{t('recovery.warning')}</p>
          <label className="check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            {t('recovery.confirm')}
          </label>
          <button className="btn btn-primary btn-block" type="button" disabled={!confirmed} onClick={acknowledge}>
            {t('common.continue')}
          </button>
        </div>
      </div>
    </main>
  );
}

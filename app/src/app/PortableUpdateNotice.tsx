import { useTranslation } from 'react-i18next';
import { Download, X } from 'lucide-react';
import { newerRelease, usePortableUpdate } from '@/core/portable/update';

/** Aviso arriba de todo cuando hay una versión nueva del paquete portable. */
export function PortableUpdateNotice() {
  const { t } = useTranslation();
  const { portable, apk, latest, dismissed, dismiss } = usePortableUpdate();
  const newer = portable || apk ? newerRelease(latest, __APP_VERSION__) : null;
  if (!newer || dismissed === newer.version) return null;
  return (
    <div className="rain-notices" role="status">
      <div className="rain-notice update-notice">
        <Download size={20} aria-hidden />
        <span className="update-text">
          <a href={apk ? newer.apkUrl : newer.downloadUrl} target="_blank" rel="noreferrer">
            {t(apk ? 'portable.apkNewVersion' : 'portable.newVersion', { version: newer.version })}
          </a>
          <span className="hint">{t(apk ? 'portable.apkHowTo' : 'portable.howTo')}</span>
        </span>
        <button className="icon-btn" type="button" onClick={dismiss} aria-label={t('common.close')}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

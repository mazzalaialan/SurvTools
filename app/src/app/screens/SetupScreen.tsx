import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseTransferLink } from '@/core/backup/transfer';
import { useIncoming } from '@/core/incomingFile';
import { setLanguage } from '@/core/i18n/i18n';
import { useVault } from '@/core/security/useVault';
import { LANGUAGES, useSettings, type Language } from '@/core/settings/settings';
import { RestoreForm } from '@/modules/backup/RestoreForm';
import { BrandHeader } from '@/ui/Brand';
import { NewPasswordForm } from '@/ui/NewPasswordForm';
import { Segmented } from '@/ui/Segmented';
import { ArchivedVaults } from './ArchivedVaults';

export function SetupScreen() {
  const { t } = useTranslation();
  const create = useVault((s) => s.create);
  const createOpen = useVault((s) => s.createOpen);
  // "Usar sin contraseña": primero se muestra la advertencia y se confirma.
  const [noPassword, setNoPassword] = useState(false);
  const language = useSettings((s) => s.settings.language);
  const update = useSettings((s) => s.update);
  // Dispositivo nuevo abierto desde el QR de transferencia: va directo a restaurar.
  const [linkTransfer] = useState(() => parseTransferLink(window.location.href));
  // Un backup que llegó desde afuera (app nativa) también va directo a restaurar.
  const incomingBackup = useIncoming((s) => s.file?.kind === 'backup');
  const [restoring, setRestoring] = useState(linkTransfer !== null);
  // Se queda en «restaurar» aunque el formulario ya haya tomado el archivo (que lo saca de la lista de pendientes).
  useEffect(() => {
    if (incomingBackup) setRestoring(true);
  }, [incomingBackup]);
  const showRestore = restoring;

  function changeLanguage(lang: Language) {
    setLanguage(lang);
    void update({ language: lang });
  }

  return (
    <main className="gate">
      <div className="gate-panel">
        <BrandHeader />
        <div className="card stack">
          <h2>{showRestore ? t('setup.restoreTitle') : t('setup.welcome')}</h2>
          <Segmented
            label={t('setup.language')}
            value={language}
            options={LANGUAGES.map((l) => ({ value: l, label: t(`language.${l}`) }))}
            onChange={changeLanguage}
          />
          {showRestore ? (
            <>
              <p className="hint">{t('setup.restoreIntro')}</p>
              {/* Al terminar se limpia el link: el código es de un solo uso y no debe reintentarse. */}
              <RestoreForm replacesData={false} initialTransfer={linkTransfer} onDone={() => (window.location.hash = '#/')} />
            </>
          ) : (
            <>
              <p className="hint">{t('setup.intro')}</p>
              <NewPasswordForm submitLabel={t('setup.create')} busyLabel={t('setup.creating')} autoFocus onSubmit={create} />
              {noPassword ? (
                <div className="stack" data-testid="setup-no-password">
                  <p className="warning-box" style={{ margin: 0 }}>{t('setup.noPasswordWarning')}</p>
                  <div className="row-end">
                    <button className="btn" type="button" onClick={() => setNoPassword(false)}>
                      {t('common.cancel')}
                    </button>
                    <button className="btn" type="button" onClick={() => void createOpen()}>
                      {t('setup.noPasswordConfirm')}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn-link" type="button" onClick={() => setNoPassword(true)}>
                  {t('setup.noPassword')}
                </button>
              )}
            </>
          )}
          {/* Bóvedas que se guardaron aparte al empezar de cero: se recuperan con su contraseña o clave. */}
          {!restoring && <ArchivedVaults hasCurrent={false} />}
          <button className="btn-link" type="button" onClick={() => setRestoring(!restoring)}>
            {restoring ? t('setup.createInstead') : t('setup.restoreLink')}
          </button>
        </div>
      </div>
    </main>
  );
}

import { useTranslation } from 'react-i18next';
import { useVault } from '@/core/security/useVault';
import { BrandHeader } from '@/ui/Brand';
import { NewPasswordForm } from '@/ui/NewPasswordForm';

/** Se muestra después de desbloquear con la clave de recuperación. */
export function NewPasswordScreen() {
  const { t } = useTranslation();
  const setNewPassword = useVault((s) => s.setNewPassword);

  return (
    <main className="gate">
      <div className="gate-panel">
        <BrandHeader />
        <div className="card stack">
          <h2>{t('unlock.newPasswordTitle')}</h2>
          <p className="hint">{t('unlock.newPasswordIntro')}</p>
          <NewPasswordForm submitLabel={t('common.save')} busyLabel={t('setup.creating')} autoFocus onSubmit={setNewPassword} />
        </div>
      </div>
    </main>
  );
}

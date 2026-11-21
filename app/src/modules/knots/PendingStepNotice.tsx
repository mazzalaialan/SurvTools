import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';

/** Cartel de un paso con dudas (ver pendingSteps.ts): visible, con ícono y texto (no solo color). */
export function PendingStepNotice({ testId }: { testId: string }) {
  const { t } = useTranslation();
  return (
    <p className="step-pending" role="note" data-testid={testId}>
      <CircleHelp size={18} aria-hidden /> <strong>{t('knots.pendingPill')}</strong> {t('knots.pendingText')}
    </p>
  );
}

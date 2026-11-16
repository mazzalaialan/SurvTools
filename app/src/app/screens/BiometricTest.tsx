import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Fingerprint, Minus, X } from 'lucide-react';
import { reportText, runBiometricTest, type BiometricReport, type StepId } from '@/core/security/biometricTest';

/**
 * «Probar biometría de este dispositivo» (Ajustes → Seguridad): comprueba si el teléfono o la computadora puede dar el secreto que serviría para
 * desbloquear con huella, cara o PIN. No cambia la bóveda ni guarda nada de la app: crea una clave de acceso de prueba en el dispositivo.
 */
export function BiometricTest() {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<BiometricReport | null>(null);
  const [copied, setCopied] = useState(false);
  const label = (id: StepId) => t(`biometric.step.${id}`);

  async function run() {
    setRunning(true);
    setReport(null);
    setCopied(false);
    try {
      setReport(await runBiometricTest());
    } finally {
      setRunning(false);
    }
  }

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportText(report, label));
      setCopied(true);
    } catch {
      /* sin portapapeles: el informe se ve en pantalla */
    }
  }

  return (
    <section className="stack" data-testid="biometric-test" aria-labelledby="biometric-title">
      <h3 id="biometric-title" className="section-title" style={{ margin: 0, fontSize: '1rem' }}>
        <Fingerprint size={16} aria-hidden /> {t('biometric.title')}
      </h3>
      <p className="hint" style={{ margin: 0 }}>{t('biometric.hint')}</p>
      <button className="btn" type="button" onClick={() => void run()} disabled={running} data-testid="biometric-run">
        {running ? t('biometric.running') : t('biometric.run')}
      </button>
      {running && <p className="hint" role="status" style={{ margin: 0 }}>{t('biometric.follow')}</p>}
      {report && (
        <div className="stack" data-testid="biometric-report">
          <p className={report.usable ? 'ok-box' : 'warning-box'} style={{ margin: 0 }} role="status" data-testid="biometric-verdict" data-usable={report.usable}>
            {t(report.usable ? 'biometric.usable' : 'biometric.notUsable')}
          </p>
          <ul className="list">
            {report.steps.map((s) => (
              <li key={s.id} className="list-row" data-testid={`biometric-step-${s.id}`} data-status={s.status}>
                <span aria-hidden>{s.status === 'ok' ? <Check size={16} /> : s.status === 'fail' ? <X size={16} /> : <Minus size={16} />}</span>
                <span className="list-main">
                  <span className="list-title">{label(s.id)}</span>
                  {s.detail && <span className="list-sub">{s.detail}</span>}
                </span>
                <span className="hint">{t(`biometric.status.${s.status}`)}</span>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: 0 }}>{t('biometric.cleanup')}</p>
          <button className="btn" type="button" onClick={() => void copy()}>
            <Copy size={16} aria-hidden /> {copied ? t('biometric.copied') : t('biometric.copy')}
          </button>
        </div>
      )}
    </section>
  );
}

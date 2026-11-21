import { useTranslation } from 'react-i18next';
import { Collapsible } from '@/ui/Collapsible';
import { visibleSources } from './sources';

/** Las fuentes de Navegación con su licencia y la cita que corresponde. */
export function SourcesCard() {
  const { t } = useTranslation();
  return (
    <Collapsible id="sources" title={t('navigation.sources.title')} testId="sources-card">
      <p className="hint" style={{ margin: 0 }}>
        {t('navigation.sources.intro')}
      </p>
      <ul className="list">
        {visibleSources().map((s) => (
          <li key={s.id} className="list-row" data-testid={`source-${s.id}`}>
            <span className="list-main">
              <span className="list-title">
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.name}
                </a>
              </span>
              <span className="list-sub">{s.provides}</span>
              <span className="list-sub">
                {t('navigation.sources.license')}: {s.licenseText}
              </span>
              <span className="list-sub">{s.cite}</span>
            </span>
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

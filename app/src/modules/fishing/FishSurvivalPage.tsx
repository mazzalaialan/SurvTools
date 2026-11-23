import { useTranslation } from 'react-i18next';
import { SURVIVAL_SOURCE, SURVIVAL_TECHNIQUES } from './survival';

type Lang = 'es' | 'en' | 'pt';

/** Técnicas de pesca para una emergencia de supervivencia (ver survival.ts). */
export function FishSurvivalPage() {
  const { t, i18n } = useTranslation();
  const lang = (['es', 'en', 'pt'].includes(i18n.language.slice(0, 2)) ? i18n.language.slice(0, 2) : 'es') as Lang;
  return (
    <div className="stack fish-screen">
      <h1 className="page-title">{t('modules.fishingSurvival.title')}</h1>
      <p className="card fish-survival" data-testid="fish-survival-warning">
        {t('fishing.survival.techWarning')}
      </p>
      {SURVIVAL_TECHNIQUES.map((x) => (
        <details key={x.id} className="card fish-tech" data-testid={`fish-tech-${x.id}`}>
          <summary>
            <strong>{x.title[lang]}</strong>
            <span className="muted small"> · {x.summary[lang]}</span>
          </summary>
          <ol className="fish-tech-steps">
            {x.steps.map((s) => (
              <li key={s.es}>{s[lang]}</li>
            ))}
          </ol>
          {x.dont?.map((d) => (
            <p key={d.es} className="fish-tech-dont">
              {t('fishing.survival.dont')}: {d[lang]}
            </p>
          ))}
        </details>
      ))}
      <p className="muted small">{t('fishing.survival.source', { source: SURVIVAL_SOURCE.name })}</p>
    </div>
  );
}

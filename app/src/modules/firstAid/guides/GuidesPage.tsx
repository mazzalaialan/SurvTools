import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Play, Search } from 'lucide-react';
import { normalize } from '@/modules/inventory/selectors';
import { TOPICS } from './content';
import { CountrySwitch } from '@/modules/emergency/CountrySwitch';
import { useCountry } from '@/modules/emergency/currentCountry';
import { EnvSwitch, useLang } from './parts';
import { fillGuideText } from './types';
import { Notice } from '@/ui/Notice';

/** Guía de primeros auxilios: lo primero, la evaluación paso a paso y todas las situaciones. */
export function GuidesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [query, setQuery] = useState('');
  // Los números de la guía son los del país elegido; el selector de abajo es el mismo de Ajustes.
  const country = useCountry();
  const medical = fillGuideText('{medical}', country, lang);
  const topics = useMemo(() => {
    const q = normalize(query.trim());
    return TOPICS.filter((x) => x.id !== 'assess').filter((x) => !q || normalize(`${x.title[lang]} ${x.keywords[lang]}`).includes(q));
  }, [query, lang]);

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('guides.title')}</h1>
      </div>

      <CountrySwitch />
      <EnvSwitch />

      <section className="card stack guide-first" aria-labelledby="first-title" data-testid="guide-first">
        <h2 id="first-title" className="section-title" style={{ margin: 0 }}>{t('guides.first.title')}</h2>
        <ol className="guide-first-list">
          {(['protect', 'call', 'responds', 'breathing', 'bleeding', 'position'] as const).map((k) => (
            <li key={k}>
              <strong>{t(`guides.first.${k}.title`)}</strong> {t(`guides.first.${k}.text`, { medical })}
            </li>
          ))}
        </ol>
        <Link className="btn btn-primary btn-lg" to="/first-aid/guides/assess">
          <Play size={20} /> {t('guides.start')}
        </Link>
      </section>

      <section className="card stack" aria-labelledby="topics-title">
        <h2 id="topics-title" className="section-title" style={{ margin: 0 }}>{t('guides.topics')}</h2>
        <label className="search">
          <Search size={18} aria-hidden />
          <input className="input" type="search" placeholder={t('guides.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="list" data-testid="guide-topics">
          {topics.map((x) => (
            <li key={x.id}>
              <Link className="list-row" to={`/first-aid/guides/${x.id}`}>
                <span className="list-main">
                  <span className="list-title">{x.title[lang]}</span>
                </span>
                <ChevronRight size={18} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Notice id="guides.disclaimer">{t('guides.disclaimer', { medical })}</Notice>
    </div>
  );
}

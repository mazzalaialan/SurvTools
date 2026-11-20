import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Play, Search } from 'lucide-react';
import { normalize } from '@/modules/inventory/selectors';
import { TOPICS, TOPIC_BY_ID } from './content';
import { CountrySwitch } from '@/modules/emergency/CountrySwitch';
import { useCountry } from '@/modules/emergency/currentCountry';
import { EnvSwitch, TOPIC_ICON, useLang } from './parts';
import { fillGuideText } from './types';
import { Notice } from '@/ui/Notice';

/** Los seis temas que más urgen (RCP, sangrado, atragantamiento, dolor de pecho, ACV, alergia grave). Es solo el orden de acceso rápido; el contenido es el de cada guía. */
const URGENT = ['cpr', 'bleeding', 'choking', 'chest', 'stroke', 'anaphylaxis'];

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
        <h1 className="page-title" style={{ flex: 1 }}>
          {t('guides.title')}
        </h1>
      </div>

      {/* Un toque para empezar, el entorno (cambia los pasos) y lo más urgente; el resumen para leer, después. */}
      <Link className="btn btn-primary btn-lg guide-start" to="/first-aid/guides/assess">
        <Play size={22} aria-hidden /> {t('guides.start')}
      </Link>

      <EnvSwitch compact hint />

      {/* Lo más urgente, a un toque (sin tener que buscar en la lista). Se oculta al buscar. */}
      {!query.trim() && (
        <section className="stack" aria-labelledby="urgent-title">
          <h2 id="urgent-title" className="section-title" style={{ margin: 0 }}>
            {t('guides.quick')}
          </h2>
          <div className="guide-quick">
            {URGENT.map((id) => {
              const topic = TOPIC_BY_ID.get(id);
              const Icon = TOPIC_ICON[id];
              if (!topic) return null;
              return (
                <Link key={id} className="btn guide-quick-btn" to={`/first-aid/guides/${id}`}>
                  {Icon && <Icon size={24} aria-hidden />}
                  <span>{topic.title[lang]}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="card stack guide-first" aria-labelledby="first-title" data-testid="guide-first">
        <h2 id="first-title" className="section-title" style={{ margin: 0 }}>
          {t('guides.first.title')}
        </h2>
        <ol className="guide-first-list">
          {(['protect', 'call', 'responds', 'breathing', 'bleeding', 'position'] as const).map((k) => (
            <li key={k}>
              <strong>{t(`guides.first.${k}.title`)}</strong> {t(`guides.first.${k}.text`, { medical })}
            </li>
          ))}
        </ol>
      </section>

      <section className="card stack" aria-labelledby="topics-title">
        <h2 id="topics-title" className="section-title" style={{ margin: 0 }}>
          {t('guides.topics')}
        </h2>
        <label className="search">
          <Search size={18} aria-hidden />
          <input className="input" type="search" placeholder={t('guides.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <ul className="list" data-testid="guide-topics">
          {topics.map((x) => {
            const Icon = TOPIC_ICON[x.id];
            return (
              <li key={x.id}>
                <Link className="list-row" to={`/first-aid/guides/${x.id}`}>
                  {Icon && <Icon size={22} aria-hidden className="guide-list-icon" />}
                  <span className="list-main">
                    <span className="list-title">{x.title[lang]}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* País: define los números que aparecen en los pasos. Es un ajuste, no lo urgente: abajo. */}
      <CountrySwitch />

      <Notice id="guides.disclaimer">{t('guides.disclaimer', { medical })}</Notice>
    </div>
  );
}

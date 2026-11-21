import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleCheck, Search, Sparkles } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { KnotFigure } from './KnotFigure';
import { KNOT_BY_ID, KNOT_TYPES, KNOT_USES, knotImages, type Knot, type KnotType, type KnotUse, type L } from './knots';
import { ANCHOR_BY_ID } from './anchors';
import { NEEDS } from './content';
import { KNOT_PROPS, searchKnots, type KnotProp } from './search';
import { Notice } from '@/ui/Notice';
import { BetaNotice } from './BetaNotice';

export const tl = (x: L, lang: string) => (lang.startsWith('en') ? x.en : x.es);

/** Una fila de la lista: imagen chica, nombre, para qué sirve y si ya lo aprendí. */
export function KnotRow({ knot, learned }: { knot: Knot; learned: boolean }) {
  const { t, i18n } = useTranslation();
  // El diagrama del último paso (el nudo terminado), con el mismo estilo en toda la lista.
  const thumb = knot.steps[knot.steps.length - 1]?.img ?? knotImages(knot)[0];
  return (
    <li>
      <Link className="list-row knot-row" to={`/knots/guide/${knot.id}`}>
        {thumb ? <KnotFigure className="knot-thumb" file={thumb} alt="" /> : <span className="knot-thumb" />}
        <span className="list-main">
          <span className="list-title">{tl(knot.name, i18n.language)}</span>
          <span className="list-sub">{tl(knot.purpose, i18n.language)}</span>
        </span>
        {learned && <CircleCheck size={20} style={{ color: 'var(--ok)', flexShrink: 0 }} aria-label={t('knots.learned')} />}
      </Link>
    </li>
  );
}

/** Asistente: qué hay que hacer → qué nudo conviene. */
function NeedWizard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [needId, setNeedId] = useState<string | null>(null);
  const need = NEEDS.find((n) => n.id === needId);
  return (
    <details className="card" data-testid="knot-wizard">
      <summary>
        <Sparkles size={18} aria-hidden /> {t('knots.wizard')}
      </summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="chips" role="group" aria-label={t('knots.wizard')}>
          {NEEDS.map((n) => (
            <button key={n.id} type="button" className="chip" aria-pressed={n.id === needId} onClick={() => setNeedId(n.id === needId ? null : n.id)}>
              {tl(n.label, lang)}
            </button>
          ))}
        </div>
        {need && (
          <ul className="list" data-testid="wizard-options">
            {need.options.map((o) => (
              <li key={tl(o.label, 'es')} className="stack" style={{ gap: 6 }}>
                <span className="hint" style={{ margin: 0 }}>
                  {tl(o.label, lang)}
                  {o.note ? ` · ${tl(o.note, lang)}` : ''}
                </span>
                <div className="chips">
                  {o.anchors?.map((id) => {
                    const a = ANCHOR_BY_ID.get(id);
                    return a ? (
                      <Link key={`a-${id}`} className="chip chip-anchor" to={`/knots/anchors/${id}`}>
                        {tl(a.name, lang)}
                      </Link>
                    ) : null;
                  })}
                  {o.knots.map((id) => {
                    const k = KNOT_BY_ID.get(id);
                    return k ? (
                      <Link key={id} className="chip" to={`/knots/guide/${id}`}>
                        {tl(k.name, lang)}
                      </Link>
                    ) : null;
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/** Guía de nudos: buscar por nombre, uso, tipo y propiedades (ARQUITECTURA §10.2). */
export function KnotGuidePage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const learned = useSettings((s) => s.settings.knotsLearned);
  const [query, setQuery] = useState('');
  const [props, setProps] = useState<KnotProp[]>([]);
  const use = (KNOT_USES as readonly string[]).includes(params.get('uso') ?? '') ? (params.get('uso') as KnotUse) : null;
  const type = (KNOT_TYPES as readonly string[]).includes(params.get('tipo') ?? '') ? (params.get('tipo') as KnotType) : null;
  const results = useMemo(() => searchKnots({ query, use, type, props }, i18n.language), [query, use, type, props, i18n.language]);
  const learnedSet = new Set(learned);

  function setFilter(key: 'uso' | 'tipo', value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.knotGuide.title')}</h1>
      <BetaNotice name={t('modules.knotGuide.title')} testId="guide-beta" />
      <p className="hint" style={{ margin: 0 }} data-testid="knots-progress">
        {t('knots.progress', { learned: learned.filter((id) => KNOT_BY_ID.has(id)).length, total: KNOT_BY_ID.size })}
      </p>
      <NeedWizard />

      <section className="card stack">
        <div className="field">
          <label htmlFor="knot-search">{t('knots.search')}</label>
          <div className="input-group">
            <Search size={18} aria-hidden style={{ alignSelf: 'center' }} />
            <input id="knot-search" className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('knots.searchHint')} />
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="hint" style={{ margin: 0 }}>{t('knots.byUse')}</span>
          <div className="chips" role="group" aria-label={t('knots.byUse')}>
            {KNOT_USES.map((u) => (
              <button key={u} type="button" className="chip" aria-pressed={u === use} onClick={() => setFilter('uso', u === use ? null : u)}>
                {t(`knots.uses.${u}`)}
              </button>
            ))}
          </div>
        </div>
        <details>
          <summary>{t('knots.moreFilters')}</summary>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <span className="hint" style={{ margin: 0 }}>{t('knots.byType')}</span>
            <div className="chips" role="group" aria-label={t('knots.byType')}>
              {KNOT_TYPES.map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={k === type} onClick={() => setFilter('tipo', k === type ? null : k)}>
                  {t(`knots.types.${k}`)}
                </button>
              ))}
            </div>
            <span className="hint" style={{ margin: 0 }}>{t('knots.byProp')}</span>
            <div className="chips" role="group" aria-label={t('knots.byProp')}>
              {KNOT_PROPS.map((p) => (
                <button key={p} type="button" className="chip" aria-pressed={props.includes(p)} onClick={() => setProps(props.includes(p) ? props.filter((x) => x !== p) : [...props, p])}>
                  {t(`knots.props.${p}`)}
                </button>
              ))}
            </div>
          </div>
        </details>
      </section>

      {use && (use === 'rappel' || use === 'rescue') && <Notice id="knots.safety" variant="warning">{t('knots.safety')}</Notice>}
      {results.length === 0 ? (
        <p className="hint">{t('knots.noResults')}</p>
      ) : (
        <ul className="list list-flat" data-testid="knot-list">
          {results.map((k) => (
            <KnotRow key={k.id} knot={k} learned={learnedSet.has(k.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

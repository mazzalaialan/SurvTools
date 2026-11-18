import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, CircleCheck, Circle, Dumbbell, Volume2, VolumeX, X } from 'lucide-react';
import { speak, stopSpeaking, useSpeechVoice } from '@/core/speech/speech';
import { useSettings } from '@/core/settings/settings';
import { useLibrary } from '@/modules/library/store';
import { anchorsUsing } from './anchors';
import { useBookImage } from '@/modules/library/useBookImage';
import { findKnotRefs, isKnotBook, type KnotRef } from './libraryRefs';
import { creditFor, KNOT_BY_ID, knotImages, RISKY_USES, type Knot } from './knots';
import { tl } from './KnotGuidePage';
import { KnotFigure } from './KnotFigure';
import { Notice } from '@/ui/Notice';
import { BetaNotice } from './BetaNotice';

const src = (file: string) => `${import.meta.env.BASE_URL}knots/${file}`;

/** Modo práctica: un paso por pantalla, imagen grande y voz. */
function Practice({ knot, onClose }: { knot: Knot; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'es';
  const voice = useSpeechVoice(lang);
  const [voiceOn, setVoiceOn] = useState(true);
  const [i, setI] = useState(0);
  const step = knot.steps[i]!;
  // Paso sin imagen propia: la secuencia completa del nudo.
  const picture = step.img ?? knot.images[0] ?? knotImages(knot)[0];
  const last = i === knot.steps.length - 1;

  useEffect(() => {
    if (voice && voiceOn) speak([`${t('knots.step', { n: i + 1 })}. ${tl(step.text, lang)}`], voice);
    return () => stopSpeaking();
  }, [i, voice, voiceOn]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(knot.steps.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [knot, onClose]);

  return (
    <div className="knot-practice" role="dialog" aria-modal="true" aria-label={t('knots.practiceTitle', { name: tl(knot.name, lang) })} data-testid="knot-practice">
      <header className="knot-practice-head">
        <strong style={{ flex: 1 }}>{tl(knot.name, lang)}</strong>
        {voice && (
          <button className="icon-btn" type="button" onClick={() => setVoiceOn(!voiceOn)} aria-label={voiceOn ? t('knots.voiceOff') : t('knots.voiceOn')} aria-pressed={voiceOn}>
            {voiceOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </button>
        )}
        <button className="icon-btn" type="button" onClick={onClose} aria-label={t('common.close')}>
          <X size={24} />
        </button>
      </header>
      {/* Los dibujos paso a paso son nuevos: se avisa que están en prueba y se puede reportar uno mal. */}
      <BetaNotice name={tl(knot.name, lang)} n={i + 1} testId="practice-beta" onNavigate={onClose} />
      {picture && <KnotFigure className="knot-practice-img" file={picture} alt={t('knots.stepAlt', { n: i + 1 })} testId="practice-figure" />}
      <p className="knot-practice-count">{t('knots.stepOf', { n: i + 1, total: knot.steps.length })}</p>
      <p className="knot-practice-text" data-testid="practice-step">
        {tl(step.text, lang)}
      </p>
      <div className="knot-practice-nav">
        <button className="btn btn-lg" type="button" onClick={() => setI(i - 1)} disabled={i === 0}>
          <ChevronLeft size={22} /> {t('knots.prev')}
        </button>
        {last ? (
          <button className="btn btn-lg btn-primary" type="button" onClick={onClose}>
            {t('knots.done')}
          </button>
        ) : (
          <button className="btn btn-lg btn-primary" type="button" onClick={() => setI(i + 1)} data-testid="practice-next">
            {t('knots.next')} <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Ficha de un nudo (ARQUITECTURA §10.2). */
/** Dónde aparece el nudo en los libros de nudos bajados (sin conexión). */
/** La figura de un libro bajado, leída de lo guardado en el dispositivo (sin service worker). */
function KnotRefImage({ bookId, path }: { bookId: string; path: string | null }) {
  const src = useBookImage(bookId, path);
  return src ? <img src={src} alt="" loading="lazy" className="knot-ref-img" /> : null;
}

function LibraryRefs({ knot }: { knot: Knot }) {
  const { t } = useTranslation();
  const installed = useLibrary((s) => s.installed);
  const ready = useLibrary((s) => s.ready);
  const books = [...installed.values()].filter(isKnotBook);
  const [refs, setRefs] = useState<KnotRef[] | null>(null);
  const key = books.map((b) => b.id + b.sha256).join(',');
  useEffect(() => {
    if (!ready || books.length === 0) return;
    let cancelled = false;
    setRefs(null);
    void findKnotRefs(knot, books).then((r) => !cancelled && setRefs(r));
    return () => {
      cancelled = true;
    };
  }, [knot.id, key, ready]);
  if (!ready) return null;

  return (
    <section className="card stack" aria-labelledby="knot-library" data-testid="knot-library">
      <h2 id="knot-library" className="section-title" style={{ margin: 0 }}>
        {t('knots.library.title')}
      </h2>
      {books.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t('knots.library.none')} <Link to="/library/books">{t('knots.library.go')}</Link>
        </p>
      ) : refs === null ? (
        <p className="hint" style={{ margin: 0 }}>
          {t('knots.library.searching', { count: books.length })}
        </p>
      ) : refs.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          {t('knots.library.notFound', { count: books.length })}
        </p>
      ) : (
        <ul className="list knot-refs">
          {refs.map((r) => (
            <li key={`${r.bookId}-${r.file}`} className="knot-ref">
              <KnotRefImage bookId={r.bookId} path={r.image} />
              <Link className="list-main" to={`/library/read/${r.bookId}?${new URLSearchParams({ cap: r.file, q: r.term }).toString()}`}>
                <span className="list-title">
                  <BookOpen size={16} aria-hidden /> {r.bookTitle}
                </span>
                {r.chapter && r.chapter !== r.bookTitle && <span className="list-sub">{r.chapter}</span>}
                <span className="list-sub knot-ref-snippet">{r.snippet}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function KnotPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const learned = useSettings((s) => s.settings.knotsLearned);
  const update = useSettings((s) => s.update);
  const [practice, setPractice] = useState(false);
  const knot = KNOT_BY_ID.get(id);
  if (!knot) return <Navigate to="/knots/guide" replace />;
  const isLearned = learned.includes(knot.id);
  const credits = [...new Map(knotImages(knot).map((f) => creditFor(f)).filter((c) => !!c).map((c) => [c.source, c])).values()];
  const facts: [string, boolean | undefined][] = [
    ['holdsLoad', knot.holdsLoad],
    ['easyUntie', knot.easyUntie],
    ['needsBackup', knot.needsBackup],
    ['wet', knot.wet],
    ['oneHand', knot.oneHand],
  ];

  return (
    <div className="stack">
      <h1 className="page-title" style={{ margin: 0 }}>{tl(knot.name, lang)}</h1>
      {knot.aliases.length > 0 && (
        <p className="hint" style={{ margin: 0 }}>
          {t('knots.alsoCalled', { list: knot.aliases.join(', ') })}
          {knot.abok ? ` · ABOK #${knot.abok}` : ''}
        </p>
      )}
      <div className="chips">
        {knot.uses.map((u) => (
          <Link key={u} className="chip" to={`/knots/guide?uso=${u}`}>
            {t(`knots.uses.${u}`)}
          </Link>
        ))}
      </div>
      {knot.uses.some((u) => RISKY_USES.has(u)) && (
        <Notice id="knots.safety" variant="warning" testId="knot-safety">
          {t('knots.safety')}
        </Notice>
      )}
      <p style={{ margin: 0 }}>{tl(knot.purpose, lang)}</p>

      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="button" onClick={() => setPractice(true)} data-testid="knot-practice-start">
          <Dumbbell size={18} /> {t('knots.practice')}
        </button>
        <button
          className="btn"
          type="button"
          aria-pressed={isLearned}
          onClick={() => void update({ knotsLearned: isLearned ? learned.filter((x) => x !== knot.id) : [...learned, knot.id] })}
          data-testid="knot-learned"
        >
          {isLearned ? <CircleCheck size={18} style={{ color: 'var(--ok)' }} /> : <Circle size={18} />} {isLearned ? t('knots.learned') : t('knots.markLearned')}
        </button>
      </div>

      {knot.images.length > 0 && (
        <div className="knot-gallery">
          {knot.images.map((f) => (
            <img key={f} src={src(f)} alt={t('knots.imageAlt', { name: tl(knot.name, lang) })} loading="lazy" />
          ))}
        </div>
      )}

      <section className="card stack" aria-labelledby="knot-steps">
        <h2 id="knot-steps" className="section-title" style={{ margin: 0 }}>{t('knots.steps')}</h2>
        <BetaNotice name={tl(knot.name, lang)} testId="steps-beta" />
        <ol className="knot-steps">
          {knot.steps.map((s, n) => (
            <li key={n}>
              <p style={{ margin: 0 }}>{tl(s.text, lang)}</p>
              {s.img && <KnotFigure className="knot-step-img" file={s.img} alt={t('knots.stepAlt', { n: n + 1 })} />}
            </li>
          ))}
        </ol>
      </section>

      <section className="card stack">
        <h2 className="section-title" style={{ margin: 0 }}>{t('knots.facts')}</h2>
        <ul className="knot-facts">
          {facts
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => (
              // Necesitar un nudo de seguridad es lo que hay que tener en cuenta; no necesitarlo, lo bueno.
              <li key={k} className={(k === 'needsBackup' ? !v : v) ? 'yes' : 'no'}>
                {t(`knots.fact.${k}.${v ? 'yes' : 'no'}`)}
              </li>
            ))}
          {knot.strength && <li>{t('knots.strength', { pct: knot.strength })}</li>}
        </ul>
        <h3 className="garden-plan-title">{t('knots.check')}</h3>
        <p style={{ margin: 0 }}>{tl(knot.check, lang)}</p>
        {knot.mistakes.length > 0 && (
          <>
            <h3 className="garden-plan-title">{t('knots.mistakes')}</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {knot.mistakes.map((m) => (
                <li key={m.es}>{tl(m, lang)}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {knot.related.length > 0 && (
        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('knots.related')}</h2>
          <div className="chips">
            {knot.related.map((rid) => {
              const r = KNOT_BY_ID.get(rid);
              return r ? (
                <Link key={rid} className="chip" to={`/knots/guide/${rid}`}>
                  {tl(r.name, lang)}
                </Link>
              ) : null;
            })}
          </div>
        </section>
      )}

      <LibraryRefs knot={knot} />

      {anchorsUsing(knot.id).length > 0 && (
        <section className="card stack">
          <h2 className="section-title" style={{ margin: 0 }}>{t('anchors.usedIn')}</h2>
          <div className="chips" data-testid="knot-anchors">
            {anchorsUsing(knot.id).map((a) => (
              <Link key={a.id} className="chip chip-anchor" to={`/knots/anchors/${a.id}`}>
                {tl(a.name, lang)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {credits.length > 0 && (
        <p className="hint" style={{ margin: 0 }} data-testid="knot-credits">
          {t('knots.images')}:{' '}
          {credits.map((c, n) => (
            <span key={c.source}>
              {n > 0 && ' · '}
              {c.source} ({c.license})
            </span>
          ))}
        </p>
      )}
      {practice && <Practice knot={knot} onClose={() => setPractice(false)} />}
    </div>
  );
}

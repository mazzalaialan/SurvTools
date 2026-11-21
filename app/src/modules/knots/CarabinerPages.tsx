import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { Collapsible } from '@/ui/Collapsible';
import { Notice } from '@/ui/Notice';
import { CarabinerFigure } from './CarabinerFigure';
import {
  CARABINER_CARE, CARABINER_LOADS, CARABINER_LOCKS, CARABINER_METAL, CARABINER_SOURCES, CARABINER_TYPES, CARABINER_WARNING,
  type CarabinerLock, type CarabinerType,
} from './carabiners';
import { tl } from './KnotGuidePage';
import type { L } from './knots';

const l = (es: string, en: string): L => ({ es, en });
const T = {
  shapes: l('Formas y para qué sirve cada una', 'Shapes and what each is for'),
  locks: l('Trabas: cómo se cierra la boca', 'Locks: how the gate closes'),
  loads: l('Cómo se carga', 'How it is loaded'),
  care: l('Revisión, cuidado y descarte', 'Checks, care and retirement'),
  uses: l('Para qué', 'Used for'),
  pros: l('Ventajas', 'Advantages'),
  cons: l('Desventajas', 'Drawbacks'),
  how: l('Cómo funciona', 'How it works'),
  head: l(['Posición', 'Resistencia mínima'].join('|'), ['Position', 'Minimum strength'].join('|')),
  notFor: l('No sirve para sostener carga', 'Not for holding any load'),
  lockHint: l('Con traba: la boca no se abre sola. Es lo que hay que usar en arnés, anclajes, rappel y asegurar.', 'Locking: the gate cannot open on its own. This is what to use on a harness, anchors, rappel and belaying.'),
};

function Facts({ title, items, lang, tone }: { title: L; items: L[]; lang: string; tone?: 'yes' | 'no' }) {
  return (
    <div>
      <h3 className="garden-plan-title">{tl(title, lang)}</h3>
      <ul className="knot-facts">
        {items.map((x) => (
          <li key={x.es} className={tone}>{tl(x, lang)}</li>
        ))}
      </ul>
    </div>
  );
}

function TypeCard({ c, lang }: { c: CarabinerType; lang: string }) {
  return (
    <article className="carabiner" data-testid={`carabiner-${c.id}`}>
      <CarabinerFigure shape={c.shape} crossed={c.shape === 'key'} />
      <div className="carabiner-body stack">
        <h3 className="carabiner-name">{tl(c.name, lang)}</h3>
        <p style={{ margin: 0 }}>{tl(c.summary, lang)}</p>
        {c.shape === 'key' && (
          <p className="carabiner-nofor">
            <TriangleAlert size={16} aria-hidden /> {tl(T.notFor, lang)}
          </p>
        )}
        <Facts title={T.uses} items={c.uses} lang={lang} />
        <Facts title={T.pros} items={c.pros} lang={lang} tone="yes" />
        <Facts title={T.cons} items={c.cons} lang={lang} tone="no" />
      </div>
    </article>
  );
}

function LockCard({ k, lang }: { k: CarabinerLock; lang: string }) {
  return (
    <article className="carabiner" data-testid={`carabiner-lock-${k.id}`}>
      <CarabinerFigure shape="d" lock={k.kind} />
      <div className="carabiner-body stack">
        <h3 className="carabiner-name">{tl(k.name, lang)}</h3>
        <p style={{ margin: 0 }}>{tl(k.how, lang)}</p>
        <Facts title={T.pros} items={k.pros} lang={lang} tone="yes" />
        <Facts title={T.cons} items={k.cons} lang={lang} tone="no" />
      </div>
    </article>
  );
}

/** Mosquetones: tipos, trabas, cómo se cargan y cuidado (Cabuyería). */
export function CarabinersPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [h1, h2] = tl(T.head, lang).split('|');
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.carabiners.title')}</h1>
      <Notice id="carabiners.safety" variant="warning" testId="carabiner-safety">{tl(CARABINER_WARNING, lang)}</Notice>
      <section className="warning-box carabiner-metal" data-testid="carabiner-metal">
        <h2 className="section-title" style={{ margin: 0 }}>{tl(CARABINER_METAL.title, lang)}</h2>
        <p style={{ margin: '6px 0 0' }}>{tl(CARABINER_METAL.body, lang)}</p>
      </section>
      <section className="card stack" data-testid="carabiner-types">
        <h2 className="section-title" style={{ margin: 0 }}>{tl(T.shapes, lang)}</h2>
        {CARABINER_TYPES.map((c) => (
          <TypeCard key={c.id} c={c} lang={lang} />
        ))}
      </section>
      <section className="card stack" data-testid="carabiner-locks">
        <h2 className="section-title" style={{ margin: 0 }}>{tl(T.locks, lang)}</h2>
        <p className="hint" style={{ margin: 0 }}>{tl(T.lockHint, lang)}</p>
        {CARABINER_LOCKS.map((k) => (
          <LockCard key={k.id} k={k} lang={lang} />
        ))}
      </section>
      <section className="card stack" data-testid="carabiner-loads">
        <h2 className="section-title" style={{ margin: 0 }}>{tl(T.loads, lang)}</h2>
        <table className="anchor-table">
          <thead>
            <tr>
              <th>{h1}</th>
              <th>{h2}</th>
            </tr>
          </thead>
          <tbody>
            {CARABINER_LOADS.map((r) => (
              <tr key={r.how.es}>
                <td>
                  {tl(r.how, lang)}
                  <br />
                  <span className="hint">{tl(r.note, lang)}</span>
                </td>
                <td>{r.kn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Collapsible id="carabiner-care" title={tl(T.care, lang)} testId="carabiner-care">
        <ul style={{ margin: 0, paddingLeft: 20 }} className="stack">
          {CARABINER_CARE.map((x) => (
            <li key={x.es}>{tl(x, lang)}</li>
          ))}
        </ul>
      </Collapsible>
      <p className="hint" style={{ margin: 0 }}>{tl(CARABINER_SOURCES, lang)}</p>
    </div>
  );
}

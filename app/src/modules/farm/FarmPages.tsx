import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, Bird, Rabbit } from 'lucide-react';
import { ModuleGrid } from '@/ui/ModuleGrid';
import { Collapsible } from '@/ui/Collapsible';
import { ZoomSvg } from '@/modules/fauna/ZoomSvg';
import { FaunaPackOffer, useFaunaData } from '@/modules/fauna/FaunaPages';
import type { FaunaData } from '@/modules/fauna/fauna';
import data from './farm-AR.json';

/**
 * Animales de granja (sección aparte de Fauna: esto es la cría propia, Fauna es la vida silvestre y la caza). Etapa 1 de docs/GRANJA.md:
 * fichas de gallina, codorniz, pato y conejo y la normativa general. Los datos van dentro de la app (anda sin descargar nada) y los arma
 * tools/farm-data/build.mjs; cada dato trae su fuente y su confianza, y lo que no tiene fuente oficial se muestra como tal.
 * Nunca dosis ni medicamentos: sanidad es prevención y señales de alarma, y la salida es siempre el veterinario.
 */

interface FarmItem {
  label?: string;
  text: string;
  sources?: string[];
  confidence?: string;
}
interface FarmSpecies {
  id: string;
  group: string;
  name: { es: string; en?: string; pt?: string };
  image?: string;
  imageCredit?: { author?: string; license?: string; url?: string };
  warning?: string;
  survivalLaw?: string;
  /** Existencias oficiales por departamento (prov → dept → n) o por provincia (prov → n). */
  range?: { level: 'dept' | 'prov'; year?: number | string; unit?: string; source?: { org?: string; url?: string; date?: string }; data: Record<string, Record<string, number> | number> };
  climate?: { text: string; confidence?: string; sources?: string[] };
  blocks: Record<string, FarmItem[]>;
}
interface FarmData {
  date: string;
  species: FarmSpecies[];
  rules: { topic: string; text: string; confidence?: string; source?: { org?: string; url?: string; date?: string }; contact?: string }[];
  sources: Record<string, { org?: string; title?: string; url?: string; date?: string }>;
}
const farm = data as FarmData;

const BLOCKS = ['breeds', 'space', 'food', 'water', 'production', 'breeding', 'health', 'zoonoses', 'slaughter', 'rules'] as const;
const GROUPS = ['aves', 'conejos', 'rumiantes', 'cerdos', 'equinos', 'camelidos', 'abejas', 'peces'] as const;

const nameOf = (sp: FarmSpecies, lang: string) => (lang.startsWith('en') ? sp.name.en : lang.startsWith('pt') ? sp.name.pt : undefined) ?? sp.name.es;

/** Aviso fijo (no se oculta): es orientativo, manda la norma vigente y ante un animal enfermo, el veterinario. */
export function FarmNotice() {
  const { t } = useTranslation();
  return (
    <div className="fauna-warning" role="note" data-testid="farm-notice">
      <strong className="fauna-bite-title">
        <AlertTriangle size={18} aria-hidden /> {t('farm.noticeTitle')}
      </strong>
      <p>{t('farm.notice', { date: farm.date })}</p>
    </div>
  );
}

export function FarmHomePage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('sections.farm')}</h1>
      <p className="muted">{t('farm.intro')}</p>
      <ModuleGrid section="farm" />
    </div>
  );
}

export function FarmSpeciesPage() {
  const { t, i18n } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.farmSpecies.title')}</h1>
      <FarmNotice />
      {GROUPS.map((g) => {
        const list = farm.species.filter((s) => s.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="stack">
            <h2 className="section-title">{t(`farm.group.${g}`)}</h2>
            <ul className="fish-grid" data-testid={`farm-${g}`}>
              {list.map((sp) => (
                <li key={sp.id}>
                  <Link className="fish-card" to={`/farm/species/${sp.id}`}>
                    <span className="fish-card-img">
                      {sp.image ? <img src={`${import.meta.env.BASE_URL}farm/${sp.image}`} alt="" loading="lazy" /> : g === 'conejos' ? <Rabbit size={36} aria-hidden /> : <Bird size={36} aria-hidden />}
                    </span>
                    <span className="list-main">{nameOf(sp, i18n.language)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Un dato con su fuente: lo oficial va normal; lo «sin confirmar» o «sin dato verificado» se marca. */
function Item({ it }: { it: FarmItem }) {
  const { t } = useTranslation();
  const missing = it.confidence === 'sin dato verificado';
  const unsure = it.confidence === 'sin confirmar';
  const src = (it.sources ?? []).map((id) => farm.sources[id]).filter(Boolean);
  return (
    <li className={missing ? 'muted' : undefined} data-confidence={it.confidence}>
      {it.label && <strong>{it.label}: </strong>}
      {it.text}
      {unsure && <span className="fauna-regulated"> {t('farm.unconfirmed')}</span>}
      {src.length > 0 && (
        <span className="muted small">
          {' ('}
          {src.map((s, i) => (
            <span key={i}>
              {i > 0 && '; '}
              {s!.url ? (
                <a href={s!.url} target="_blank" rel="noreferrer">
                  {s!.org}
                </a>
              ) : (
                s!.org
              )}
            </span>
          ))}
          {')'}
        </span>
      )}
    </li>
  );
}

export function FarmSpeciesDetailPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const sp = farm.species.find((s) => s.id === id);
  if (!sp) return <Navigate to="/farm/species" replace />;
  const name = nameOf(sp, i18n.language);
  return (
    <div className="stack" data-testid="farm-species">
      <h1 className="page-title">{name}</h1>
      <FarmNotice />
      {sp.warning && (
        <p className="fauna-warning" data-status="prohibida" data-testid="farm-warning">
          <AlertTriangle size={18} aria-hidden /> {sp.warning}
        </p>
      )}
      {sp.image && (
        <figure className="fauna-photo">
          <img src={`${import.meta.env.BASE_URL}farm/${sp.image}`} alt={name} />
          {sp.imageCredit && (
            <figcaption className="muted">
              {t('fauna.photo')}{' '}
              {sp.imageCredit.url ? (
                <a href={sp.imageCredit.url} target="_blank" rel="noreferrer">
                  {sp.imageCredit.author}
                </a>
              ) : (
                sp.imageCredit.author
              )}
              {sp.imageCredit.license && `, ${sp.imageCredit.license}`}
            </figcaption>
          )}
        </figure>
      )}
      <FarmRange sp={sp} />
      {BLOCKS.map((b) => {
        const items = sp.blocks[b];
        if (!items?.length) return null;
        const verified = items.filter((x) => x.confidence === 'oficial').length;
        return (
          <Collapsible key={b} id={`farm-${b}`} title={t(`farm.block.${b}`)} defaultOpen={b === 'health'} summary={<span className="muted small">{t('farm.verified', { n: verified, total: items.length })}</span>}>
            {b === 'health' && <p className="fauna-warning">{t(sp.group === 'aves' ? 'farm.healthNoteBirds' : 'farm.healthNote')}</p>}
            <ul className="stack">
              {items.map((it, i) => (
                <Item key={i} it={it} />
              ))}
            </ul>
          </Collapsible>
        );
      })}
      {sp.survivalLaw && (
        <section className="card stack fauna-survival">
          <h2 className="section-title">{t('fauna.field.en_supervivencia')}</h2>
          <p>{sp.survivalLaw}</p>
        </section>
      )}
      <Link className="btn btn-block" to="/farm/rules">
        {t('modules.farmRules.title')}
      </Link>
    </div>
  );
}

export function FarmRulesPage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.farmRules.title')}</h1>
      <FarmNotice />
      {/* Son muchas (36): cada norma plegada con su tema a la vista. */}
      <div className="stack" data-testid="farm-rules">
        {farm.rules.map((r, i) => (
          <Collapsible key={i} id={`farm-rule-${i}`} title={r.topic} summary={r.confidence && r.confidence !== 'oficial' ? <span className="fauna-regulated">{t('farm.unconfirmed')}</span> : undefined}>
            <p>{r.text}</p>
            {r.contact && <p className="muted small">{r.contact}</p>}
            {r.source && (
              <p className="muted small">
                {r.source.url ? (
                  <a href={r.source.url} target="_blank" rel="noreferrer">
                    {r.source.org}
                  </a>
                ) : (
                  r.source.org
                )}
                {r.source.date && ` · ${r.source.date}`}
              </p>
            )}
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

/** Cantidad de un departamento: la propia (dato por departamento) o la de su provincia (dato por provincia). */
const amountIn = (r: NonNullable<FarmSpecies['range']>, prov: string, dept: string) => {
  const v = r.data[prov];
  return typeof v === 'number' ? v : (v?.[dept] ?? 0);
};

/**
 * «Dónde se crían»: clima y zona apta (frase con fuente) y el mapa de existencias oficiales, pintado por departamento o por provincia
 * en tres niveles (tercios de los lugares con animales). Usa los límites de departamentos del paquete de Fauna (IGN): sin ese paquete,
 * muestra las provincias con más animales y ofrece bajarlo.
 */
function FarmRange({ sp }: { sp: FarmSpecies }) {
  const { t } = useTranslation();
  const r = sp.range;
  const top = useMemo(() => {
    if (!r) return [];
    const byProv = Object.entries(r.data).map(([p, v]) => [p, typeof v === 'number' ? v : Object.values(v).reduce((a, b) => a + b, 0)] as const);
    return byProv.sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [r]);
  if (!r && !sp.climate) return null;
  const fmt = new Intl.NumberFormat('es-AR');
  return (
    <Collapsible id="farm-range" testId="farm-range" title={t('farm.range.title')} summary={top.length ? <span className="muted small">{top.slice(0, 3).map(([p]) => p).join(', ')}</span> : undefined}>
      {sp.climate && (
        <p>
          {sp.climate.text}
          {sp.climate.confidence && sp.climate.confidence !== 'oficial' && <span className="fauna-regulated"> {t('farm.unconfirmed')}</span>}
        </p>
      )}
      {r && (
        <>
          <p className="muted small">{t('farm.range.top', { list: top.map(([p, n]) => `${p} (${fmt.format(n)})`).join(', ') })}</p>
          <FarmRangeMap r={r} />
          <p className="muted small">
            {t(r.level === 'dept' ? 'farm.range.noteDept' : 'farm.range.noteProv', { year: r.year ?? '', unit: r.unit ?? '' })}{' '}
            {r.source?.url ? (
              <a href={r.source.url} target="_blank" rel="noreferrer">
                {r.source.org}
              </a>
            ) : (
              r.source?.org
            )}
          </p>
        </>
      )}
    </Collapsible>
  );
}

function FarmRangeMap({ r }: { r: NonNullable<FarmSpecies['range']> }) {
  const state = useFaunaData();
  if (state.status === 'notDownloaded') return <FaunaPackOffer />;
  if (state.status !== 'ready') return null;
  return <RangeSvg r={r} geo={state.data} />;
}

function RangeSvg({ r, geo }: { r: NonNullable<FarmSpecies['range']>; geo: FaunaData }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<{ prov: string; dept: string; n: number } | null>(null);
  const all = useMemo(() => geo.provinces.flatMap((p) => (p.departments ?? []).map((d) => ({ prov: p.name, ...d }))), [geo]);
  const box = useMemo(() => {
    let w = 180, e = -180, s = 90, n = -90;
    for (const d of all)
      for (const ring of d.rings)
        for (let i = 0; i < ring.length; i += 2) {
          w = Math.min(w, ring[i]!); e = Math.max(e, ring[i]!); s = Math.min(s, ring[i + 1]!); n = Math.max(n, ring[i + 1]!);
        }
    return { w, e, s, n, k: Math.cos((((s + n) / 2) * Math.PI) / 180) };
  }, [all]);
  // Niveles por tercios de los lugares con animales (las cantidades van de decenas a millones según la especie).
  const cuts = useMemo(() => {
    const vals = (r.level === 'dept' ? Object.values(r.data).flatMap((v) => (typeof v === 'number' ? [v] : Object.values(v))) : Object.values(r.data).map((v) => (typeof v === 'number' ? v : 0))).filter((v) => v > 0).sort((a, b) => a - b);
    return [vals[Math.floor(vals.length / 3)] ?? 0, vals[Math.floor((2 * vals.length) / 3)] ?? 0];
  }, [r]);
  const level = (n: number) => (!n ? 0 : n >= cuts[1]! ? 3 : n >= cuts[0]! ? 2 : 1);
  const scale = 1000 / Math.max((box.e - box.w) * box.k, box.n - box.s);
  const x = (lon: number) => (lon - box.w) * box.k * scale;
  const y = (lat: number) => (box.n - lat) * scale;
  const path = (ring: number[]) => {
    let d = '';
    for (let i = 0; i < ring.length; i += 2) d += `${i ? 'L' : 'M'}${x(ring[i]!).toFixed(1)},${y(ring[i + 1]!).toFixed(1)}`;
    return `${d}Z`;
  };
  const fmt = new Intl.NumberFormat('es-AR');
  return (
    <>
      <ZoomSvg viewBox={[0, 0, Math.round(x(box.e)), Math.round(y(box.s))]} label={t('farm.range.title')}>
        {all.map((d) => {
          const n = amountIn(r, d.prov, d.name);
          return (
            <path
              key={`${d.prov}|${d.name}`}
              d={d.rings.map(path).join('')}
              className="fauna-range-dept"
              data-level={level(n)}
              style={picked?.dept === d.name && picked.prov === d.prov ? { stroke: 'var(--text)', strokeWidth: 3 } : undefined}
              onClick={() => setPicked({ prov: d.prov, dept: d.name, n })}
            >
              <title>{`${d.name} (${d.prov}): ${n}`}</title>
            </path>
          );
        })}
      </ZoomSvg>
      <span className="fauna-legend">
        {[1, 2, 3].map((l) => (
          <span key={l}>
            <span className="fauna-dot fauna-range-dot" data-level={l} aria-hidden /> {t(`farm.range.level${l}`)}
          </span>
        ))}
      </span>
      {picked && (
        <p className="fauna-dept-picked" data-state={picked.n ? 'total' : 'unknown'} data-testid="farm-range-picked">
          <strong className="fauna-dept-picked-name">{r.level === 'dept' ? `${picked.dept}, ${picked.prov}` : picked.prov}</strong>
          <span>{fmt.format(picked.n)} {r.unit ?? ''}</span>
        </p>
      )}
    </>
  );
}

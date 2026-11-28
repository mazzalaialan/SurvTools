import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, Bird, Rabbit } from 'lucide-react';
import { ModuleGrid } from '@/ui/ModuleGrid';
import { Collapsible } from '@/ui/Collapsible';
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

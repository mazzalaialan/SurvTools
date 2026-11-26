import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/core/settings/settings';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, Shell } from 'lucide-react';
import { Collapsible } from '@/ui/Collapsible';
import { fieldText } from '@/modules/fauna/fauna';
import { FishDataGate } from './parts';
import { useFishData } from './useFishData';
import type { FishData, ShellfishSpecies } from './fishing';

/**
 * Crustáceos y moluscos (cangrejos, camarones, almejas, mejillones…): fichas, lo que dicen las normas de pesca de cada jurisdicción y la
 * marea roja (toxina en moluscos que no se destruye al cocinar). Los datos vienen en el paquete de pesca (tools/fishing-data/shellfish.mjs).
 */

const name = (sp: ShellfishSpecies, lang: string) => (lang.startsWith('en') ? sp.nombre.en : lang.startsWith('pt') ? sp.nombre.pt : undefined) ?? sp.nombre.es;

/** Días entre una fecha («11/11/2026» o ISO) y hoy; null si no se entiende. */
function daysSince(s: string | undefined, now = Date.now()): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : Math.max(0, Math.floor((now - d.getTime()) / 86_400_000));
}
/** Más de esto (días) y el estado cargado se muestra como posiblemente viejo. */
const STALE_DAYS = 15;
const CHUBUT_CACHE = 'vikarg.redtide.chubut';

/**
 * Últimos avisos oficiales de marea roja de Chubut (feed del sitio oficial, leído por el servidor propio: /api/redtide). Se copia el
 * título y la fecha tal cual, con el enlace. Sin servidor o sin conexión, lo último que se pudo leer (guardado en el dispositivo).
 */
function useChubutNotices(): { items: { title: string; url: string; date: string }[]; fetchedAt: string } | null {
  const server = useSettings((s) => s.settings.serverUrl?.trim().replace(/\/+$/, '') || null);
  const [state, setState] = useState<{ items: { title: string; url: string; date: string }[]; fetchedAt: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHUBUT_CACHE) ?? 'null');
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!server || !navigator.onLine) return;
    let alive = true;
    void fetch(`${server}/api/redtide`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const c = j?.chubut;
        if (!alive || !c?.items?.length) return;
        setState(c);
        try {
          localStorage.setItem(CHUBUT_CACHE, JSON.stringify(c));
        } catch {
          /* sin almacenamiento: solo esta vez */
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [server]);
  return state;
}

/** Aviso de marea roja: prevención (fija), últimos avisos oficiales de Chubut y el estado cargado de cada provincia con su fecha. */
function RedTide({ data }: { data: FishData }) {
  const { t, i18n } = useTranslation();
  const rt = data.shellfish?.redTide;
  const chubut = useChubutNotices();
  if (!rt) return null;
  const dateFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <section className="fauna-warning fauna-bite" data-status="prohibida" data-testid="red-tide">
      <strong className="fauna-bite-title">
        <AlertTriangle size={18} aria-hidden /> {t('fishing.shellfish.redTideTitle')}
      </strong>
      <p>{rt.text}</p>
      {chubut && (
        <div className="stack" data-testid="red-tide-chubut">
          <strong>{t('fishing.shellfish.chubutTitle')}</strong>
          <ul>
            {chubut.items.slice(0, 3).map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noreferrer">
                  {n.title}
                </a>{' '}
                <span className="muted small">({dateFmt.format(new Date(n.date))})</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('fishing.shellfish.chubutRead', { date: dateFmt.format(new Date(chubut.fetchedAt)) })}</p>
        </div>
      )}
      <Collapsible
        inline
        id="red-tide-status"
        title={t('fishing.shellfish.redTideStatusTitle')}
        // A la vista aunque esté cerrado: si algún dato tiene más de 15 días, se avisa.
        summary={rt.status.some((s) => (daysSince(s.date) ?? Infinity) > STALE_DAYS) ? <span className="red-tide-stale">{t('fishing.shellfish.staleSummary')}</span> : undefined}
      >
        <ul className="stack">
          {rt.status.map((s) => {
            const days = daysSince(s.date);
            const stale = days === null || days > STALE_DAYS;
            return (
              <li key={s.jurisdiction} data-stale={stale || undefined}>
                <strong>{s.jurisdiction}:</strong> {days === null ? t('fishing.shellfish.noDated') : t('fishing.shellfish.lastLoaded', { date: s.date, days })}{' '}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {t('fishing.shellfish.officialSource')}
                  </a>
                )}
                <div className="muted small">{s.status}</div>
                {stale && <div className="red-tide-stale">{t('fishing.shellfish.staleWarn')}</div>}
              </li>
            );
          })}
        </ul>
        <p className="muted small">{t('fishing.shellfish.redTideCheck')}</p>
      </Collapsible>
    </section>
  );
}

function Row({ sp, lang }: { sp: ShellfishSpecies; lang: string }) {
  const { t } = useTranslation();
  return (
    <li>
      <Link className="fish-card" to={`/fishing/shellfish/${sp.id}`}>
        <span className="fish-card-img">{sp.image ? <img src={`${import.meta.env.BASE_URL}fish/${sp.image}`} alt="" loading="lazy" /> : <Shell size={36} aria-hidden />}</span>
        <span>
          <span className="list-main">{name(sp, lang)}</span>
          <span className="list-sub">
            <i>{sp.cientifico}</i>
          </span>
          {sp.marea_roja && <span className="fauna-banned">{t('fishing.shellfish.redTideBadge')}</span>}
          {sp.invasora && <span className="fauna-regulated">{t('fishing.shellfish.invasive')}</span>}
        </span>
      </Link>
    </li>
  );
}

/** Lista de crustáceos y moluscos, por agua dulce y mar, con el aviso de marea roja arriba. */
export function ShellfishPage() {
  const { t, i18n } = useTranslation();
  const state = useFishData();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.fishingShellfish.title')}</h1>
      <FishDataGate state={state}>
        {(data) => {
          const list = data.shellfish?.species ?? [];
          if (!list.length) return <p className="muted">{t('fishing.shellfish.none')}</p>;
          return (
            <>
              <RedTide data={data} />
              {(['dulce', 'mar'] as const).map((w) => {
                const items = list.filter((sp) => sp.agua === w || sp.agua === 'ambas').sort((a, b) => name(a, i18n.language).localeCompare(name(b, i18n.language), 'es'));
                return items.length ? (
                  <section key={w} className="stack">
                    <h2 className="section-title">{t(`fishing.shellfish.water.${w}`)}</h2>
                    <ul className="fish-grid" data-testid={`shellfish-${w}`}>
                      {items.map((sp) => (
                        <Row key={sp.id} sp={sp} lang={i18n.language} />
                      ))}
                    </ul>
                  </section>
                ) : null;
              })}
            </>
          );
        }}
      </FishDataGate>
    </div>
  );
}

const FIELDS = ['como_reconocerla', 'tamano_peso', 'habitat_distribucion', 'dieta', 'horario_actividad', 'celo_y_cria', 'peligro', 'aprovechamiento', 'en_supervivencia'] as const;

/** Ficha: foto, marea roja (si acumula toxina), lo que dicen las normas de cada jurisdicción y la descripción. */
export function ShellfishDetailPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const state = useFishData();
  return (
    <FishDataGate state={state}>
      {(data) => {
        const sp = data.shellfish?.species.find((s) => s.id === id);
        if (!sp) return <Navigate to="/fishing/shellfish" replace />;
        const rules = (data.shellfish?.rules ?? []).flatMap((j) => j.rules.filter((r) => r.species.includes(sp.id)).map((r) => ({ ...r, jurisdiction: j.jurisdiction })));
        return (
          <div className="stack fish-screen" data-testid="shellfish-page">
            <h1 className="page-title">{name(sp, i18n.language)}</h1>
            <p>
              <i>{sp.cientifico}</i>
              {sp.origen && <span className="muted"> · {sp.origen}</span>}
            </p>
            {sp.marea_roja && <RedTide data={data} />}
            {sp.invasora && <p className="fauna-warning">{t('fishing.shellfish.invasiveLong')}</p>}
            {sp.image && (
              <figure className="fauna-photo">
                <img src={`${import.meta.env.BASE_URL}fish/${sp.image}`} alt={name(sp, i18n.language)} />
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
            <section className="card stack" data-testid="shellfish-rules">
              <h2 className="section-title">{t('fishing.shellfish.rulesTitle')}</h2>
              {rules.length ? (
                <ul className="stack">
                  {rules.map((r, i) => (
                    <li key={i}>
                      <strong>{r.jurisdiction}:</strong> {r.summary}{' '}
                      <span className="muted small">
                        ({[r.norm, r.article].filter(Boolean).join(', ')}
                        {r.url && (
                          <>
                            {' · '}
                            <a href={r.url} target="_blank" rel="noreferrer">
                              {t('fishing.shellfish.source')}
                            </a>
                          </>
                        )}
                        )
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{t('fishing.shellfish.noRules')}</p>
              )}
              <p className="muted small">{t('fishing.shellfish.rulesNote')}</p>
            </section>
            {FIELDS.map((f) => {
              const parts = fieldText(sp[f]);
              if (!parts.length) return null;
              return (
                <section key={f} className={`card stack${f === 'en_supervivencia' ? ' fauna-survival' : ''}`}>
                  <h2 className="section-title">{t(`fauna.field.${f}`)}</h2>
                  {parts.map((x, i) => (
                    <p key={i}>{x.text}</p>
                  ))}
                </section>
              );
            })}
            <Link className="btn btn-block" to={`/fauna/species/${sp.id}`}>
              {t('fishing.shellfish.inFauna')}
            </Link>
          </div>
        );
      }}
    </FishDataGate>
  );
}

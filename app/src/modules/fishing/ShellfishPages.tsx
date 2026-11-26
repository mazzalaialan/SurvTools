import { useTranslation } from 'react-i18next';
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

/** Aviso de marea roja, con el estado de cada provincia que lo informa (desplegable). */
function RedTide({ data }: { data: FishData }) {
  const { t } = useTranslation();
  const rt = data.shellfish?.redTide;
  if (!rt) return null;
  return (
    <section className="fauna-warning fauna-bite" data-status="prohibida" data-testid="red-tide">
      <strong className="fauna-bite-title">
        <AlertTriangle size={18} aria-hidden /> {t('fishing.shellfish.redTideTitle')}
      </strong>
      <p>{rt.text}</p>
      <Collapsible inline id="red-tide-status" title={t('fishing.shellfish.redTideStatus', { date: rt.date })}>
        <ul>
          {rt.status.map((s) => (
            <li key={s.jurisdiction}>
              <strong>{s.jurisdiction}:</strong> {s.status}{' '}
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {t('fishing.shellfish.source')}
                </a>
              )}
            </li>
          ))}
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

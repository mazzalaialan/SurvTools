import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { AlertTriangle, Loader2, PawPrint, Skull } from 'lucide-react';
import { useCountryPackStore } from '@/modules/emergency/useCountryPacks';
import { formatBytes } from '@/modules/emergency/countryDownload';
import { useSettings } from '@/core/settings/settings';
import { loadGeoData, type GeoRegion } from '@/modules/weathermap/geo';
import { SeasonBadge } from '@/modules/fishing/parts';
import { ModuleGrid } from '@/ui/ModuleGrid';
import { Collapsible } from '@/ui/Collapsible';
import { ZoomSvg } from './ZoomSvg';
import {
  FAUNA_COUNTRIES,
  deptState,
  type DeptState,
  hasFaunaData,
  isBanned,
  locateDept,
  faunaName,
  fieldText,
  loadFaunaData,
  provinceBySlug,
  provinceSlug,
  speciesById,
  STATUS_COLOR,
  STATUSES,
  whereHunted,
  type FaunaData,
  type FaunaSpecies,
  type HuntProvince,
  type HuntZone,
} from './fauna';

type State = { status: 'loading' } | { status: 'none' } | { status: 'missing' } | { status: 'notDownloaded' } | { status: 'ready'; data: FaunaData };

function useFaunaData(): State {
  const country = useSettings((s) => s.settings.country);
  const [state, setState] = useState<State>({ status: 'loading' });
  // Se vuelve a leer cuando termina de bajarse o se borra el paquete (desde Ajustes o desde la sección).
  const version = useCountryPackStore((s) => (s.busyFauna ? -1 : JSON.stringify(s.fauna[country] ?? null)));
  useEffect(() => {
    if (!FAUNA_COUNTRIES.includes(country)) {
      setState({ status: 'none' });
      return;
    }
    let alive = true;
    // El paquete de fauna es una descarga aparte (como pesca): si no está guardado, no se baja solo; la pantalla ofrece bajarlo.
    void hasFaunaData(country).then(async (stored) => {
      if (!stored) {
        if (alive) setState({ status: 'notDownloaded' });
        return;
      }
      const data = await loadFaunaData(country);
      if (alive) setState(data ? { status: 'ready', data } : { status: 'missing' });
    });
    return () => {
      alive = false;
    };
  }, [country, version]);
  return state;
}

/** Ofrece bajar el paquete de fauna del país (descarga aparte, como el de pesca). */
function FaunaPackOffer() {
  const { t, i18n } = useTranslation();
  const country = useSettings((s) => s.settings.country);
  const { fauna, busyFauna, downloadFauna, check } = useCountryPackStore();
  useEffect(() => {
    void check();
  }, [check]);
  const f = fauna[country];
  const busy = busyFauna === country;
  const size = f ? formatBytes(f.state === 'missing' ? f.total : f.bytes || f.total, i18n.language) : '';
  return (
    <div className="card stack" data-testid="fauna-pack-offer">
      <p>{navigator.onLine ? t('fauna.pack.offer', { country: t(`country.${country}`) }) : t('fauna.missing')}</p>
      <div>
        <button className="btn btn-primary" type="button" disabled={busy || !navigator.onLine} onClick={() => void downloadFauna(country)} data-testid="fauna-pack-get">
          {busy ? <Loader2 size={18} className="spin" aria-hidden /> : <PawPrint size={18} aria-hidden />} {busy ? t('fauna.pack.downloading') : t('fauna.pack.get')}
          {size && !busy ? ` (${size})` : ''}
        </button>
      </div>
      <p className="muted small">{t('fauna.pack.hint')}</p>
    </div>
  );
}

function Gate({ children }: { children: (data: FaunaData) => ReactNode }) {
  const { t } = useTranslation();
  const state = useFaunaData();
  if (state.status === 'loading') return <p className="muted">{t('fauna.loading')}</p>;
  if (state.status === 'none') return <p className="card" data-testid="fauna-none">{t('fauna.noCountry')}</p>;
  if (state.status === 'missing') return <p className="card">{t('fauna.missing')}</p>;
  if (state.status === 'notDownloaded') return <FaunaPackOffer />;
  return <>{children(state.data)}</>;
}

/** Aviso fijo: la información es orientativa, manda la norma vigente. */
function Notice({ data }: { data: FaunaData }) {
  const { t } = useTranslation();
  return (
    <p className="notice-unofficial" role="note" data-testid="fauna-notice">
      <AlertTriangle size={18} aria-hidden className="notice-unofficial-icon" />
      <span>
        <strong>{t('fauna.noticeTitle')}</strong> {t('fauna.notice', { date: data.generatedAt.slice(0, 10) })}
      </span>
    </p>
  );
}

function StatusChip({ p }: { p: HuntProvince }) {
  const { t } = useTranslation();
  return (
    <span className="fauna-chip" data-status={p.status}>
      <span className="fauna-dot" style={{ background: STATUS_COLOR[p.status] }} aria-hidden />
      {t(`fauna.status.${p.status}`)}
      {p.normYear ? ` (${p.normYear})` : ''}
    </span>
  );
}

/** Mapa de provincias pintadas según el estado de la norma de caza. Tocar una provincia abre su ficha. */
function ProvinceMap({ data }: { data: FaunaData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [regions, setRegions] = useState<GeoRegion[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadGeoData().then((g) => alive && setRegions(g.regions.filter((r) => r.country === 'AR')));
    return () => {
      alive = false;
    };
  }, []);
  const byName = useMemo(() => new Map(data.provinces.map((p) => [p.name, p])), [data]);
  if (!regions) return null;
  // Proyección simple (equirectangular corregida por la latitud media): alcanza para un mapa índice.
  const K = Math.cos((38 * Math.PI) / 180);
  const W = -74;
  const N = -21.7;
  const S = -55.2;
  const E = -53.5;
  const x = (lon: number) => (lon - W) * K * 10;
  const y = (lat: number) => (N - lat) * 10;
  const path = (ring: number[]) => {
    let d = '';
    for (let i = 0; i < ring.length; i += 2) d += `${i ? 'L' : 'M'}${x(ring[i]!).toFixed(1)},${y(ring[i + 1]!).toFixed(1)}`;
    return `${d}Z`;
  };
  return (
    <figure className="fauna-map card">
      <ZoomSvg viewBox={[0, 0, Math.round(x(E) + 2), Math.round(y(S) + 2)]} label={t('fauna.mapLabel')} testId="fauna-country-map">
        {regions
          .filter((r) => r.name !== 'Islas Malvinas')
          .map((r) => {
            const p = byName.get(r.name);
            const fill = p ? STATUS_COLOR[p.status] : 'var(--surface-2, #888)';
            return (
              <path
                key={r.id}
                d={r.rings.map(path).join('')}
                fill={fill}
                fillOpacity={p ? 0.75 : 0.25}
                stroke="var(--bg)"
                strokeWidth={0.8}
                data-province={r.name}
                style={p ? { cursor: 'pointer' } : undefined}
                onClick={p ? () => navigate(`/fauna/p/${provinceSlug(p.name)}`) : undefined}
              >
                <title>{p ? `${r.name}: ${t(`fauna.status.${p.status}`)}` : r.name}</title>
              </path>
            );
          })}
      </ZoomSvg>
      <figcaption className="fauna-legend">
        {STATUSES.map((s) => (
          <span key={s}>
            <span className="fauna-dot" style={{ background: STATUS_COLOR[s] }} aria-hidden /> {t(`fauna.status.${s}`)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Portada de Fauna: las fichas de la sección (caza por provincia, especies). */
export function FaunaHomePage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('sections.fauna')}</h1>
      <ModuleGrid section="fauna" />
    </div>
  );
}

/** Caza por provincia: mapa pintado por estado de la norma y la lista para tocar. */
export function FaunaProvincesPage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.faunaProvinces.title')}</h1>
      <Gate>
        {(data) => (
          <>
            <Notice data={data} />
            <ZoneFinder data={data} />
            <ProvinceMap data={data} />
            <ul className="list" data-testid="fauna-provinces">
              {[...data.provinces]
                .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                .map((p) => (
                  <li key={p.name}>
                    <Link className="list-row" to={`/fauna/p/${provinceSlug(p.name)}`}>
                      <span className="list-main">{p.name}</span>
                      <span className="list-sub">
                        <StatusChip p={p} />
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </>
        )}
      </Gate>
    </div>
  );
}

function bagText(t: (k: string, o?: Record<string, unknown>) => string, s: HuntZone['species'][number]): string[] {
  const out: string[] = [];
  if (s.groupTotal) out.push(t('fauna.bagGroup', { n: s.groupTotal }));
  else if (s.bag != null) out.push(t('fauna.bag', { n: s.bag }));
  if (s.perVehicle) out.push(t('fauna.perVehicle', { n: s.perVehicle }));
  if (s.sex) out.push(s.sex);
  return out;
}

function ZoneCard({ zone, data, lang }: { zone: HuntZone; data: FaunaData; lang: string }) {
  const { t } = useTranslation();
  // Ninguna provincia publica coordenadas: cuando los límites solo dicen eso, el «dónde» está en el texto de la norma y se muestra abierto.
  const vagueLimits = !zone.limits || /^por .*sin coordenadas\.?$/i.test(zone.limits.trim());
  const [open, setOpen] = useState(vagueLimits);
  return (
    <Collapsible
      id={`fauna-zone-${zone.id}`}
      testId="fauna-zone"
      title={zone.name}
      summary={
        <span className="fauna-zone-summary">
          {zone.closed ? (
            <span className="fish-season" data-state="closed">{t('fauna.closed')}</span>
          ) : (
            zone.season?.from && <SeasonBadge season={{ from: zone.season.from, to: zone.season.to ?? zone.season.from }} />
          )}
          {zone.species.length > 0 && <span>{t('fauna.speciesCount', { count: zone.species.length })}</span>}
        </span>
      }
    >
      {/* La temporada (abierta, en veda, cerrada) ya está en el encabezado: no se repite al desplegar. */}
      {zone.season?.note && <p className="muted">{zone.season.note}</p>}
      {zone.limits && !vagueLimits && (
        <p>
          <strong>{t('fauna.limits')}</strong> {zone.limits}
        </p>
      )}
      {zone.species.length > 0 && (
        <ul className="list">
          {zone.species.map((s) => {
            const sp = speciesById(data, s.id);
            return (
              <li key={s.id}>
                <Link className="list-row" to={`/fauna/species/${s.id}`}>
                  <span className="list-main">
                    <span className="list-title">{faunaName(sp, s.id, lang)}</span>
                    <span className="list-sub">
                      {[...bagText(t, s), s.from && s.to ? t('fauna.dates', { from: s.from, to: s.to }) : null].filter(Boolean).join(' · ')}
                      {s.note && <i> {s.note}</i>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {zone.methods && (
        <p>
          <strong>{t('fauna.methods')}</strong> {zone.methods}
        </p>
      )}
      {zone.reserves && (
        <p>
          <strong>{t('fauna.reserves')}</strong> {zone.reserves}
        </p>
      )}
      {zone.text && (
        <>
          <button className="btn btn-small" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
            {t('fauna.normText')}
          </button>
          {open && <p className="fauna-literal">{zone.text}</p>}
        </>
      )}
    </Collapsible>
  );
}

/** Ficha de una provincia: aviso, zonas con temporada y cupos, permiso, áreas protegidas y fuentes. */
export function FaunaProvincePage() {
  const { t, i18n } = useTranslation();
  const { slug = '' } = useParams();
  return (
    <Gate>
      {(data) => {
        const p = provinceBySlug(data, slug);
        if (!p) return <Navigate to="/fauna/provinces" replace />;
        return (
          <div className="stack">
            <h1 className="page-title">{p.name}</h1>
            <Notice data={data} />
            <StatusChip p={p} />
            {p.warning && (
              <p className="fauna-warning" data-status={p.status} data-testid="fauna-warning">
                {p.warning}
              </p>
            )}
            {p.status === 'vieja' && <p className="fish-stale">{t('fauna.oldNorm')}</p>}
            <DeptMap province={p} />
            {p.zones
              .filter((z) => z.species.length || z.season?.from || z.closed)
              .map((z) => (
                <ZoneCard key={z.id} zone={z} data={data} lang={i18n.language} />
              ))}
            {p.permit && (
              <Collapsible id="fauna-permit" title={t('fauna.permit')} summary={p.permit.prices?.[0] ? `${p.permit.prices[0].type}: ${p.permit.prices[0].price}` : p.permit.requirements?.length ? t('fauna.reqCount', { count: p.permit.requirements.length }) : undefined}>
                {p.permit.requirements?.length ? (
                  <ul>
                    {p.permit.requirements.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                {p.permit.prices?.map((x) => (
                  <p key={x.type}>
                    {x.type}: <strong>{x.price}</strong>
                  </p>
                ))}
                {p.permit.priceDate && <p className="muted">{t('fauna.priceDate', { date: p.permit.priceDate })}</p>}
                {p.permit.where && <p>{p.permit.where}</p>}
                {p.permit.phone?.length ? <p>{p.permit.phone.join(' · ')}</p> : null}
                {p.permit.buyUrl && (
                  <a className="btn" href={p.permit.buyUrl} target="_blank" rel="noreferrer">
                    {t('fauna.buy')}
                  </a>
                )}
                {p.permit.infoUrl && (
                  <a href={p.permit.infoUrl} target="_blank" rel="noreferrer">
                    {t('fauna.info')}
                  </a>
                )}
              </Collapsible>
            )}
            {(p.protected.length > 0 || p.protectedSpecies?.length) && (
              <Collapsible id="fauna-protected" title={t('fauna.protected')} defaultOpen={!!p.protectedSpecies?.length} summary={t('fauna.placesCount', { count: p.protected.length + (p.protectedSpecies?.length ?? 0) })}>
                {p.protectedSpecies?.map((x) => (
                  <p key={x.id} className="fauna-warning" data-status="prohibida" data-testid="fauna-protected-species">
                    <strong>
                      <Link to={`/fauna/species/${x.id}`}>{faunaName(speciesById(data, x.id), x.id, i18n.language)}</Link>: {t('fauna.protectedSpecies')}
                    </strong>{' '}
                    {x.note}
                  </p>
                ))}
                <ul>
                  {p.protected.map((x) => (
                    <li key={x.name}>
                      {x.rule && <strong>{x.rule}: </strong>}
                      {x.name}
                      {x.source && <span className="muted"> ({x.source})</span>}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
            {p.sources.length > 0 && (
              <Collapsible id="fauna-sources" title={t('fauna.sources')} summary={t('fauna.sourcesCount', { count: p.sources.length })}>
                <ul>
                  {p.sources.map((s) => (
                    <li key={s.title}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}
                      {s.org && <span className="muted"> · {s.org}</span>}
                      {s.date && <span className="muted"> · {s.date}</span>}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
          </div>
        );
      }}
    </Gate>
  );
}

function SpeciesCard({ sp, lang }: { sp: FaunaSpecies; lang: string }) {
  const { t } = useTranslation();
  return (
    <li>
      <Link className="fish-card" data-threatened={isBanned(sp) ? '' : undefined} to={`/fauna/species/${sp.id}`}>
        <span className="fish-card-img">{sp.image ? <img src={`${import.meta.env.BASE_URL}fauna/${sp.image}`} alt="" loading="lazy" /> : <PawPrint size={36} aria-hidden />}</span>
        <span>
          <span className="list-main">{faunaName(sp, sp.id, lang)}</span>
          {sp.cientifico && (
            <span className="list-sub">
              <i>{sp.cientifico}</i>
            </span>
          )}
          {sp.venomous && (
            <span className="fauna-venomous">
              <Skull size={14} aria-hidden /> {t('fauna.venomous')}
            </span>
          )}
          {isBanned(sp) && <span className="fauna-banned">{bannedText(t, sp)}</span>}
          {!isBanned(sp) && sp.regulated && <span className="fauna-regulated">{t('fauna.regulated')}</span>}
        </span>
      </Link>
    </li>
  );
}

/** Lista de especies cazables (mamíferos y aves) con buscador. */
export function FaunaSpeciesPage() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'hunted' | 'banned' | 'venomous'>('all');
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.faunaSpecies.title')}</h1>
      <Gate>
        {(data) => {
          const match = (sp: FaunaSpecies) => (kind === 'all' || (kind === 'venomous' ? !!sp.venomous : kind === 'banned' ? isBanned(sp) : !isBanned(sp) && !sp.regulated)) && (!q.trim() || norm(`${faunaName(sp, sp.id, i18n.language)} ${sp.cientifico ?? ''} ${(sp.otros_nombres ?? []).join(' ')}`).includes(norm(q.trim())));
          return (
            <>
              <Notice data={data} />
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('fauna.search')} aria-label={t('fauna.search')} />
              <div className="segmented" role="group" aria-label={t('fauna.kind.label')}>
                {(['all', 'hunted', 'banned', 'venomous'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`fauna-kind-${k}`}>
                    {t(`fauna.kind.${k}`)}
                  </button>
                ))}
              </div>
              {(['mammal', 'bird', 'reptile'] as const).map((g) => {
                const list = data.species.filter((s) => s.group === g && match(s)).sort((a, b) => faunaName(a, a.id, i18n.language).localeCompare(faunaName(b, b.id, i18n.language), 'es'));
                return list.length ? (
                  <section key={g} className="stack">
                    <h2 className="section-title">{t(`fauna.group.${g}`)}</h2>
                    <ul className="fish-grid" data-testid={`fauna-${g}s`}>
                      {list.map((sp) => (
                        <SpeciesCard key={sp.id} sp={sp} lang={i18n.language} />
                      ))}
                    </ul>
                  </section>
                ) : null;
              })}
            </>
          );
        }}
      </Gate>
    </div>
  );
}

/** Campos de la ficha, en el orden en que se muestran. */
const FIELDS = ['como_reconocerla', 'tamano_peso', 'habitat_distribucion', 'dieta', 'horario_actividad', 'celo_y_cria', 'peligro', 'aprovechamiento', 'en_supervivencia', 'estado_conservacion'] as const;

/** Ficha de una especie: foto, cómo reconocerla, peligros, dónde se caza y fuentes. */
export function FaunaSpeciesDetailPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  return (
    <Gate>
      {(data) => {
        const sp = speciesById(data, id);
        if (!sp) return <Navigate to="/fauna/species" replace />;
        const credit = sp.imageCredit as { author?: string; license?: string; url?: string } | undefined;
        const where = whereHunted(data, sp.id);
        const sources = Array.isArray(sp.fuentes) ? (sp.fuentes as { fuente?: string; url?: string; fecha?: string }[]) : [];
        return (
          <div className="stack">
            <h1 className="page-title">{faunaName(sp, sp.id, i18n.language)}</h1>
            <Notice data={data} />
            {sp.cientifico && (
              <p>
                <i>{sp.cientifico}</i>
                {sp.origen && <span className="muted"> · {sp.origen}</span>}
              </p>
            )}
            {sp.image && (
              <figure className="fauna-photo">
                <img src={`${import.meta.env.BASE_URL}fauna/${sp.image}`} alt={faunaName(sp, sp.id, i18n.language)} />
                {credit && (
                  <figcaption className="muted">
                    {t('fauna.photo')}{' '}
                    {credit.url ? (
                      <a href={credit.url} target="_blank" rel="noreferrer">
                        {credit.author}
                      </a>
                    ) : (
                      credit.author
                    )}
                    {credit.license && `, ${credit.license}`}
                  </figcaption>
                )}
              </figure>
            )}
            {sp.otros_nombres?.length ? <p className="muted">{t('fauna.aka', { names: sp.otros_nombres.join(', ') })}</p> : null}
            {sp.venomous && sp.bite && (
              <section className="fauna-warning fauna-bite" data-testid="fauna-bite">
                <strong className="fauna-bite-title">
                  <Skull size={18} aria-hidden /> {t('fauna.biteTitle')}
                </strong>
                <p>{sp.bite}</p>
              </section>
            )}
            {!isBanned(sp) && sp.regulated && <p className="fauna-warning">{t('fauna.regulatedLong')}</p>}
            {isBanned(sp) && (
              <p className="fauna-warning" data-status="prohibida" data-testid="fauna-threatened">
                <strong>{bannedText(t, sp)}</strong>
                {sp.naturalMonument && <> {t('fauna.monumentOf', { norm: sp.naturalMonument })}</>}
              </p>
            )}
            {typeof sp.aviso === 'string' && <p className="fauna-warning">{sp.aviso}</p>}
            {typeof sp.aviso_identificacion === 'string' && <p className="fauna-warning">{sp.aviso_identificacion}</p>}
            {FIELDS.map((f) => {
              const parts = fieldText(sp[f]);
              // «Dónde vive» lleva adentro el mapa de registros («Dónde se encuentra»), aunque no tenga texto.
              const range = f === 'habitat_distribucion' ? <SpeciesRange key={sp.id} data={data} sp={sp} /> : null;
              if (!parts.length) return range ? <section key={f} className="card stack"><h2 className="section-title">{t('fauna.field.habitat_distribucion')}</h2>{range}</section> : null;
              return (
                <section key={f} className={`card stack${f === 'en_supervivencia' ? ' fauna-survival' : ''}`}>
                  <h2 className="section-title">{t(`fauna.field.${f}`)}</h2>
                  {parts.map((x, i) => (
                    <p key={i}>
                      {x.label && <strong>{t(`fauna.sub.${x.label}`, { defaultValue: x.label.replace(/_/g, ' ') })}: </strong>}
                      {x.text}
                    </p>
                  ))}
                  {/* `key` (en `range`): al pasar a otra especie, el desplegable vuelve a empezar cerrado. */}
                  {range}
                </section>
              );
            })}
            <section className="card stack">
              <h2 className="section-title">{t('fauna.whereHunted')}</h2>
              {where.length ? (
                <ul className="list">
                  {where.map(({ province, zone, rule }) => (
                    <li key={`${zone.id}-${rule.id}`}>
                      <Link className="list-row" to={`/fauna/p/${provinceSlug(province.name)}`}>
                        <span className="list-main">
                          <span className="list-title">
                            {province.name} <StatusChip p={province} />
                          </span>
                          <span className="list-sub">
                            {zone.name}
                            {bagText(t, rule).length ? ` · ${bagText(t, rule).join(' · ')}` : ''}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{t('fauna.notHunted')}</p>
              )}
            </section>
            {sources.length > 0 && (
              <section className="card stack">
                <h2 className="section-title">{t('fauna.sources')}</h2>
                <ul>
                  {sources.map((s, i) => (
                    <li key={i}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.fuente ?? s.url}
                        </a>
                      ) : (
                        s.fuente
                      )}
                      {s.fecha && <span className="muted"> · {s.fecha}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        );
      }}
    </Gate>
  );
}

const DEPT_FILL: Record<DeptState, string> = {
  total: 'var(--ok)',
  partial: 'url(#fauna-hatch)',
  urban: 'var(--fauna-legal)',
  closed: 'var(--danger)',
  unknown: 'var(--text-muted)',
};

/**
 * Mapa de la provincia por departamentos (IGN): verde se caza en todo el departamento, rayado solo en una parte, rojo en veda y gris
 * sin dato. Ninguna provincia publica coordenadas de sus zonas: lo que se pinta sale de los departamentos que nombra la norma; las
 * partes cortadas por rutas no se dibujan exactas (van rayadas, con el texto de la norma al tocarlas).
 */
function DeptMap({ province }: { province: HuntProvince }) {
  const { t } = useTranslation();
  // Solo las zonas que pintan algo (las de «solo en cotos» no nombran departamentos y quedarían todas en gris).
  const zones = province.zones.filter((z) => province.departments?.some((d) => deptState(z, d.name).state !== 'unknown'));
  const [zoneId, setZoneId] = useState(zones[0]?.id);
  const [params] = useSearchParams();
  const fromUrl = params.get('dept');
  const [picked, setPicked] = useState<string | null>(fromUrl && province.departments?.some((d) => d.name === fromUrl) ? fromUrl : null);
  const mapRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (fromUrl) mapRef.current?.scrollIntoView({ block: 'start' });
  }, [fromUrl]);
  const depts = province.departments;
  const box = useMemo(() => {
    if (!depts?.length) return null;
    let w = 180, e = -180, s = 90, n = -90;
    for (const d of depts)
      for (const r of d.rings)
        for (let i = 0; i < r.length; i += 2) {
          w = Math.min(w, r[i]!); e = Math.max(e, r[i]!); s = Math.min(s, r[i + 1]!); n = Math.max(n, r[i + 1]!);
        }
    return { w, e, s, n, k: Math.cos((((s + n) / 2) * Math.PI) / 180) };
  }, [depts]);
  if (!depts?.length || !box || !zones.length) return null;
  const zone = zones.find((z) => z.id === zoneId) ?? zones[0]!;
  const scale = 1000 / Math.max((box.e - box.w) * box.k, box.n - box.s);
  const x = (lon: number) => (lon - box.w) * box.k * scale;
  const y = (lat: number) => (box.n - lat) * scale;
  const path = (ring: number[]) => {
    let d = '';
    for (let i = 0; i < ring.length; i += 2) d += `${i ? 'L' : 'M'}${x(ring[i]!).toFixed(1)},${y(ring[i + 1]!).toFixed(1)}`;
    return `${d}Z`;
  };
  const sel = picked ? deptState(zone, picked) : null;
  // En Buenos Aires la división se llama «partido».
  const deptKey = province.name === 'Buenos Aires' ? 'fauna.deptBA' : 'fauna.dept';
  return (
    <Collapsible id="fauna-dept-map" title={t(province.name === 'Buenos Aires' ? 'fauna.deptMapBA' : 'fauna.deptMap')} defaultOpen summary={picked ? t(province.name === 'Buenos Aires' ? 'fauna.partyOf' : 'fauna.deptOf', { name: picked }) : undefined}>
    <figure ref={mapRef} className="stack fauna-dept-map" data-testid="fauna-dept-map">
      {zones.length > 1 && (
        <div className="fauna-zone-pick" role="radiogroup" aria-label={t('fauna.deptZone')}>
          {zones.map((z) => {
            const { title, detail } = zoneLabel(z.name, province.name);
            const on = z.id === zone.id;
            return (
              <button
                key={z.id}
                type="button"
                role="radio"
                aria-checked={on}
                className="fauna-zone-option"
                onClick={() => {
                  setZoneId(z.id);
                  setPicked(null);
                }}
              >
                <span className="fauna-zone-radio" aria-hidden />
                <span className="fauna-zone-text">
                  <span className="fauna-zone-title">{title}</span>
                  {detail && <span className="fauna-zone-detail">{detail}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <ZoomSvg viewBox={[-4, -4, Math.round(x(box.e) + 8), Math.round(y(box.s) + 8)]} label={`${t('fauna.deptMap')}: ${province.name}`}>
        <defs>
          <pattern id="fauna-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="14" height="14" fill="var(--ok)" fillOpacity="0.35" />
            <line x1="0" y1="0" x2="0" y2="14" stroke="var(--ok)" strokeWidth="7" />
          </pattern>
        </defs>
        {depts.map((d) => {
          const st = deptState(zone, d.name).state;
          return (
            <path
              key={d.name}
              d={d.rings.map(path).join('')}
              fill={DEPT_FILL[st]}
              fillOpacity={st === 'unknown' ? 0.25 : st === 'partial' ? 1 : 0.7}
              stroke={picked === d.name ? 'var(--text)' : 'var(--bg)'}
              strokeWidth={picked === d.name ? 4 : 1.5}
              data-dept={d.name}
              data-state={st}
              style={{ cursor: 'pointer' }}
              onClick={() => setPicked(d.name)}
            >
              <title>{`${d.name}: ${t(`${deptKey}.${st}`)}`}</title>
            </path>
          );
        })}
      </ZoomSvg>
      <figcaption className="stack">
        <span className="fauna-legend">
          {(['total', 'partial', 'urban', 'closed', 'unknown'] as const).filter((s) => s !== 'urban' || depts.some((d) => deptState(zone, d.name).state === 'urban')).map((s) => (
            <span key={s}>
              <span className={`fauna-dot fauna-dot-${s}`} style={{ background: s === 'partial' ? undefined : DEPT_FILL[s] }} aria-hidden /> {t(`${deptKey}.${s}`)}
            </span>
          ))}
        </span>
        {picked && sel && (
          <div className="fauna-dept-picked" data-state={sel.state} data-testid="fauna-dept-picked" role="status">
            <strong className="fauna-dept-picked-name">
              {t(province.name === 'Buenos Aires' ? 'fauna.partyOf' : 'fauna.deptOf', { name: picked })}
            </strong>
            <span className="fauna-dept-picked-state">
              <span className={`fauna-dot fauna-dot-${sel.state}`} style={{ background: sel.state === 'partial' ? undefined : DEPT_FILL[sel.state] }} aria-hidden /> {t(`${deptKey}.${sel.state}`)}
            </span>
            {sel.text && <span>{sel.text}</span>}
          </div>
        )}
        {zone.departments?.approx && <p className="fauna-warning" data-testid="fauna-dept-approx">{t('fauna.deptApprox')}</p>}
        {zone.departments?.note && <p className="muted small">{zone.departments.note}</p>}
        <p className="muted small">{t('fauna.deptNote')}</p>
      </figcaption>
    </figure>
    </Collapsible>
  );
}

/** Elegir un lugar (GPS, waypoint o coordenadas, como en Clima) y saltar al departamento de su provincia. */
function ZoneFinder({ data }: { data: FaunaData }) {
  const { t } = useTranslation();
  const { place, picker } = usePlacePicker();
  const found = place ? locateDept(data, place.lat, place.lon) : null;
  return (
    <section className="card stack" data-testid="fauna-zone-finder">
      <h2 className="section-title">{t('fauna.finder.title')}</h2>
      {picker}
      {place &&
        (found ? (
          <>
            <p data-testid="fauna-zone-found">
              {t(found.province.name === 'Buenos Aires' ? 'fauna.finder.inBA' : found.province.name === 'Ciudad de Buenos Aires' ? 'fauna.finder.inCABA' : 'fauna.finder.in', { dept: found.dept, province: found.province.name })}
            </p>
            <Link className="btn btn-primary btn-block" to={`/fauna/p/${provinceSlug(found.province.name)}?dept=${encodeURIComponent(found.dept)}`} data-testid="fauna-go-zone">
              {t('fauna.finder.go')}
            </Link>
          </>
        ) : (
          <p className="muted">{t('fauna.finder.outside')}</p>
        ))}
    </section>
  );
}

/**
 * Nombre corto de una zona para el selector del mapa: sin el nombre de la provincia adelante («Córdoba: …», «Provincia de Buenos
 * Aires: …») y con lo que va entre paréntesis como detalle abajo.
 */
function zoneLabel(name: string, province: string): { title: string; detail?: string } {
  let s = name.replace(new RegExp(`^(provincia de )?${province.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:,-]\\s*`, 'i'), '');
  const m = s.match(/^(.*?)\s*\((.*)\)\s*$/);
  let detail: string | undefined;
  if (m) {
    s = m[1]!;
    detail = m[2];
  }
  return { title: s.charAt(0).toUpperCase() + s.slice(1), detail };
}

/** Por qué no se caza: amenazada (con su categoría) o protegida. */
function bannedText(t: (k: string, o?: Record<string, unknown>) => string, sp: FaunaSpecies): string {
  // La categoría va en minúscula en medio de la frase («Especie en peligro crítico: …»).
  return sp.threatened ? t('fauna.threatened', { status: sp.threatened.toLowerCase() }) : t('fauna.protectedBan');
}

/** Cantidad de registros → nivel de color (1: pocos, 2: varios, 3: muchos). */
const rangeLevel = (n: number) => (n >= 100 ? 3 : n >= 10 ? 2 : 1);

/**
 * «Dónde se encuentra»: mapa del país por departamentos, pintado donde hay registros de la especie en GBIF desde 1990. Plegado por
 * defecto. No es un mapa de distribución exacta: donde no hay registros puede igual haber (nadie la vio o no lo cargó).
 */
function SpeciesRange({ data, sp }: { data: FaunaData; sp: FaunaSpecies }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<{ prov: string; dept: string; n: number } | null>(null);
  const all = useMemo(() => data.provinces.flatMap((p) => (p.departments ?? []).map((d) => ({ prov: p.name, ...d }))), [data]);
  const box = useMemo(() => {
    let w = 180, e = -180, s = 90, n = -90;
    for (const d of all)
      for (const r of d.rings)
        for (let i = 0; i < r.length; i += 2) {
          w = Math.min(w, r[i]!); e = Math.max(e, r[i]!); s = Math.min(s, r[i + 1]!); n = Math.max(n, r[i + 1]!);
        }
    return { w, e, s, n, k: Math.cos((((s + n) / 2) * Math.PI) / 180) };
  }, [all]);
  const pres = sp.presence ?? {};
  const count = Object.values(pres).reduce((n, x) => n + Object.keys(x).length, 0);
  const scale = 1000 / Math.max((box.e - box.w) * box.k, box.n - box.s);
  const x = (lon: number) => (lon - box.w) * box.k * scale;
  const y = (lat: number) => (box.n - lat) * scale;
  const path = (ring: number[]) => {
    let d = '';
    for (let i = 0; i < ring.length; i += 2) d += `${i ? 'L' : 'M'}${x(ring[i]!).toFixed(1)},${y(ring[i + 1]!).toFixed(1)}`;
    return `${d}Z`;
  };
  return (
    <Collapsible inline id="fauna-range" testId="fauna-range" title={t('fauna.range.title')} summary={count ? t('fauna.range.summary', { count }) : t('fauna.range.none')}>
      {count > 0 ? (
        <>
          <ZoomSvg viewBox={[0, 0, Math.round(x(box.e)), Math.round(y(box.s))]} label={`${t('fauna.range.title')}: ${faunaName(sp, sp.id, 'es')}`}>
            {all.map((d) => {
              const n = pres[d.prov]?.[d.name] ?? 0;
              return (
                <path
                  key={`${d.prov}|${d.name}`}
                  d={d.rings.map(path).join('')}
                  className="fauna-range-dept"
                  data-level={n ? rangeLevel(n) : 0}
                  // El estilo en línea le gana al CSS de la clase (un atributo `stroke` no).
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
                <span className="fauna-dot fauna-range-dot" data-level={l} aria-hidden /> {t(`fauna.range.level${l}`)}
              </span>
            ))}
          </span>
          {picked && (
            <p className="fauna-dept-picked" data-state={picked.n ? 'total' : 'unknown'} data-testid="fauna-range-picked">
              <strong className="fauna-dept-picked-name">{picked.dept}, {picked.prov}</strong>
              <span>{t('fauna.range.records', { count: picked.n })}</span>
            </p>
          )}
        </>
      ) : (
        <p className="muted">{t('fauna.range.noRecords')}</p>
      )}
      <p className="muted small">{t('fauna.range.note', { date: data.presenceSource?.date ?? '' })}</p>
    </Collapsible>
  );
}

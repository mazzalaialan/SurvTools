import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { LocateFixed, Map as MapIcon } from 'lucide-react';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { ModuleGrid } from '@/ui/ModuleGrid';
import { isStale, sectorsNear, sectorsWithSpecies, speciesById, speciesName, waters, type FishData, type FishSector, type FishSpecies } from './fishing';
import { FishDataGate, GroupHint, keepRule, PermitCard, RulesNotice, SeasonBadge, SectorSeasonBadge, speciesRules } from './parts';
import { useFishData } from './useFishData';

const NEAR_RADIUS_M = 30_000;

/** Portada de Pesca: estado de los datos, botón al mapa y las demás pantallas. */
export function FishingHomePage() {
  const { t } = useTranslation();
  const state = useFishData();
  return (
    <div className="stack">
      <h1 className="page-title">{t('sections.fishing')}</h1>
      <FishDataGate state={state}>
        {(data) => (
          <div className="card stack" data-testid="fish-status">
            <p>{t('fishing.status', { season: data.seasonLabel ?? '', species: data.species.length, sectors: data.sectors.length })}</p>
            {isStale(data) && <p className="fish-stale">{t('fishing.stale')}</p>}
            <RulesNotice data={data} />
            <Link className="btn btn-primary btn-block" to="/fishing/map" data-testid="fish-open-map">
              <MapIcon size={20} aria-hidden /> {t('fishing.openMap')}
            </Link>
          </div>
        )}
      </FishDataGate>
      <ModuleGrid section="fishing" />
    </div>
  );
}

function SpeciesRow({ sp, data, lang }: { sp: FishSpecies; data: FishData; lang: string }) {
  const { t } = useTranslation();
  const n = sectorsWithSpecies(data, sp.id).length;
  return (
    <li>
      <Link className="list-row" to={`/fishing/fish/${sp.id}`}>
        <span className="list-main">
          <span className="list-title">{speciesName(sp, lang)}</span>
          <span className="list-sub">
            <i>{sp.scientific}</i> · {sp.native ? t('fishing.native') : t('fishing.introduced')} · {t('fishing.sectorsCount', { count: n })}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Lista de peces del país. */
export function FishSpeciesPage() {
  const { t, i18n } = useTranslation();
  const state = useFishData();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.fishingSpecies.title')}</h1>
      <FishDataGate state={state}>
        {(data) => (
          <ul className="list" data-testid="fish-species-list">
            {[...data.species]
              .sort((a, b) => speciesName(a, i18n.language).localeCompare(speciesName(b, i18n.language), i18n.language))
              .map((sp) => (
                <SpeciesRow key={sp.id} sp={sp} data={data} lang={i18n.language} />
              ))}
          </ul>
        )}
      </FishDataGate>
    </div>
  );
}

/** Cuántas carnadas se ven antes de «Ver todas» (hay peces con más de 20 moscas). */
const BAITS_SHOWN = 6;

function BaitList({ title, items, columns }: { title: string; items?: string[]; columns?: boolean }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  if (!items?.length) return null;
  const shown = all ? items : items.slice(0, BAITS_SHOWN);
  return (
    <div>
      <h3 className="fish-bait-title">{title}</h3>
      <ul className={columns ? 'fish-baits fish-baits-cols' : 'fish-baits'}>
        {shown.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {items.length > BAITS_SHOWN && (
        <button type="button" className="btn btn-small fish-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? t('fishing.seeLess') : t('fishing.seeAll', { count: items.length })}
        </button>
      )}
    </div>
  );
}

/** Carnadas orientativas de una especie (tabla propia: dieta y experiencia de pescadores). */
export function Baits({ sp }: { sp: FishSpecies }) {
  const { t } = useTranslation();
  const b = sp.baits;
  if (!b || !(b.natural?.length || b.lures?.length || b.fly?.length)) return <p className="muted">{t('fishing.noBaits')}</p>;
  return (
    <section className="card stack" data-testid="fish-baits">
      <h2 className="section-title">{t('fishing.baits')}</h2>
      <BaitList title={t('fishing.baitNatural')} items={b.natural} />
      <BaitList title={t('fishing.baitLures')} items={b.lures} />
      <BaitList title={t('fishing.baitFly')} items={b.fly} columns />
      <p className="muted small">{t('fishing.baitsNote')}</p>
    </section>
  );
}

/** Ficha de un pez: datos, carnadas y en qué tramos se pesca. */
export function FishPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const state = useFishData();
  if (state.status === 'ready' && !speciesById(state.data, id)) return <Navigate to="/fishing/species" replace />;
  return (
    <FishDataGate state={state}>
      {(data) => {
        const sp = speciesById(data, id)!;
        const sectors = sectorsWithSpecies(data, id);
        return (
          <div className="stack fish-screen" data-testid="fish-page">
            <h1 className="page-title">{speciesName(sp, i18n.language)}</h1>
            {sp.image && (
              <figure className="fish-figure" data-testid="fish-image">
                <img src={`${import.meta.env.BASE_URL}fish/${sp.image.file}`} alt={speciesName(sp, i18n.language)} loading="lazy" />
                <figcaption className="muted small">
                  <a href={sp.image.url} target="_blank" rel="noreferrer">
                    {sp.image.credit}
                  </a>{' '}
                  · {sp.image.license}
                </figcaption>
              </figure>
            )}
            <p className="muted">
              <i>{sp.scientific}</i> · {sp.native ? t('fishing.native') : t('fishing.introduced')}
            </p>
            <Link className="btn btn-primary btn-block" to={`/fishing/map?fish=${sp.id}`} data-testid="fish-where">
              <MapIcon size={20} aria-hidden /> {t('fishing.where')}
            </Link>
            {(sp.size || sp.bestSeason || sp.bestTime || sp.diet) && (
              <dl className="card fish-facts">
                {sp.size && (
                  <>
                    <dt>{t('fishing.size')}</dt>
                    <dd>{sp.size}</dd>
                  </>
                )}
                {sp.bestSeason && (
                  <>
                    <dt>{t('fishing.bestSeason')}</dt>
                    <dd>{sp.bestSeason}</dd>
                  </>
                )}
                {sp.bestTime && (
                  <>
                    <dt>{t('fishing.bestTime')}</dt>
                    <dd>{sp.bestTime}</dd>
                  </>
                )}
                {sp.diet && (
                  <>
                    <dt>{t('fishing.diet')}</dt>
                    <dd>{sp.diet}</dd>
                  </>
                )}
              </dl>
            )}
            <Baits sp={sp} />
            {sp.survival && (
              <section className="card stack fish-survival" data-testid="fish-survival">
                <h2 className="section-title">{t('fishing.survival.title')}</h2>
                <p className="small">{t('fishing.survival.warning')}</p>
                <ul className="fish-baits">
                  {sp.survival.baits.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                {sp.survival.tip && <p>{sp.survival.tip}</p>}
                <Link to="/fishing/survival" data-testid="fish-survival-link">
                  {t('fishing.survival.techLink')}
                </Link>
              </section>
            )}
            <h2 className="section-title">{t('fishing.sectorsFor', { count: sectors.length })}</h2>
            <SectorsByRegion data={data} sectors={sectors} speciesId={sp.id} />
            <p className="muted small">{t('fishing.colorsHint')}</p>
            <RulesNotice data={data} />
          </div>
        );
      }}
    </FishDataGate>
  );
}

/** Tramos agrupados por jurisdicción, con un buscador de río o lago cuando son muchos (un pez puede estar en 70 tramos). */
function SectorsByRegion({ data, sectors, speciesId }: { data: FishData; sectors: FishSector[]; speciesId: string }) {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const found = q.trim() ? sectors.filter((s) => norm(`${s.water} ${s.name}`).includes(norm(q.trim()))) : sectors;
  const groups = data.regions.map((r) => ({ region: r, list: found.filter((s) => s.region === r.id) })).filter((g) => g.list.length);
  return (
    <>
      {sectors.length > 12 && (
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('fishing.filterWaters')} aria-label={t('fishing.filterWaters')} data-testid="fish-filter" />
      )}
      {!found.length && <p className="muted">{t('fishing.noMatch')}</p>}
      {groups.map((g) => (
        <section key={g.region.id} className="stack">
          {groups.length > 1 || data.regions.length > 1 ? <h3 className="fish-bait-title">{t('fishing.inRegion', { region: g.region.name, count: g.list.length })}</h3> : null}
          <SectorList data={data} sectors={[...g.list].sort((a, b) => a.water.localeCompare(b.water, i18n.language))} speciesId={speciesId} />
        </section>
      ))}
    </>
  );
}

/** Lista de tramos, con su temporada y (si se pide) las reglas de una especie. */
export function SectorList({ data, sectors, speciesId, distances }: { data: FishData; sectors: FishSector[]; speciesId?: string; distances?: Map<string, number> }) {
  const { t, i18n } = useTranslation();
  if (!sectors.length) return <p className="muted">{t('fishing.noSectors')}</p>;
  return (
    <ul className="list" data-testid="fish-sector-list">
      {sectors.map((s) => {
        const sp = speciesId ? s.species.find((x) => x.id === speciesId) : undefined;
        const rules = sp ? speciesRules(t, sp, s) : [];
        const d = distances?.get(s.id);
        return (
          <li key={s.id}>
            <Link className={sp || s.closed ? 'list-row fish-rule' : 'list-row'} data-rule={sp || s.closed ? keepRule(sp, s) : undefined} to={`/fishing/sector/${s.id}`}>
              <span className="list-main">
                <span className="list-title">{s.water}</span>
                <span className="list-sub">{s.name}</span>
                <span className="list-sub">
                  <SectorSeasonBadge data={data} sector={s} />
                  {rules.length > 0 && ` · ${rules.join(' · ')}`}
                  {d !== undefined && ` · ${(d / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1 })} km`}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Ríos y lagos, con «Cerca de mí» si se pide la ubicación. */
export function FishWatersPage() {
  const { t } = useTranslation();
  const state = useFishData();
  const [near, setNear] = useState(false);
  const { fix } = useGeolocation(near);
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.fishingWaters.title')}</h1>
      <FishDataGate state={state}>
        {(data) => (
          <>
            <button className="btn btn-block" type="button" onClick={() => setNear(true)} data-testid="fish-near">
              <LocateFixed size={20} aria-hidden /> {t('fishing.nearMe')}
            </button>
            {near && <NearSectors data={data} here={fix ? [fix.lon, fix.lat] : null} />}
            {waters(data).map((w) => (
              <section key={w.water} className="stack">
                <h2 className="section-title">{w.water}</h2>
                <SectorList data={data} sectors={w.sectors} />
              </section>
            ))}
          </>
        )}
      </FishDataGate>
    </div>
  );
}

function NearSectors({ data, here }: { data: FishData; here: [number, number] | null }) {
  const { t } = useTranslation();
  const near = useMemo(() => (here ? sectorsNear(data, here, NEAR_RADIUS_M) : []), [data, here]);
  if (!here) return <p className="muted">{t('fishing.locating')}</p>;
  if (!near.length) return <p className="muted">{t('fishing.noneNear', { km: NEAR_RADIUS_M / 1000 })}</p>;
  return (
    <section className="stack" data-testid="fish-near-list">
      <h2 className="section-title">{t('fishing.nearTitle')}</h2>
      <SectorList data={data} sectors={near.map((n) => n.sector)} distances={new Map(near.map((n) => [n.sector.id, n.distanceM]))} />
    </section>
  );
}

/** Lo que dice un reglamento sobre un tramo: temporada, modalidad, peces con sus reglas, texto literal y permiso. */
function SectorRules({ data, s }: { data: FishData; s: FishSector }) {
  const { t, i18n } = useTranslation();
  const region = data.regions.find((r) => r.id === s.region);
  return (
    <>
      <p>{s.name}</p>
      <p>
        <SectorSeasonBadge data={data} sector={s} />
        {region && ` · ${region.name}`}
      </p>
      {s.approx && <p className="fish-stale">{t('fishing.approx', { what: s.approx })}</p>}
      {s.closed && (
        <p className="card fish-rule" data-rule="forbidden" data-testid="fish-forbidden">
          <strong>{t('fishing.season.forbidden')}</strong>
        </p>
      )}
      {(s.modality?.length || s.catchAndRelease) && (
        <p>
          {s.modality?.map((m) => t(`fishing.modality.${m}`)).join(' · ')}
          {s.catchAndRelease && ` · ${t('fishing.rules.release')}`}
        </p>
      )}
      <h2 className="section-title">{t('fishing.speciesHere', { count: s.species.length })}</h2>
      <ul className="list" data-testid="fish-sector-species">
        {s.species.map((x) => {
          const sp = speciesById(data, x.id);
          const rules = speciesRules(t, x, s);
          return (
            <li key={x.id}>
              <Link className="list-row fish-rule" data-rule={keepRule(x, s)} to={`/fishing/fish/${x.id}`}>
                <span className="list-main">
            <span className="list-title">{sp ? speciesName(sp, i18n.language) : x.id}</span>
            {rules.length > 0 && <span className="list-sub">{rules.join(' · ')}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="muted small">{t('fishing.colorsHint')}</p>
      {s.notes && (
        <section className="card stack">
          <h2 className="section-title">{t('fishing.ruleText')}</h2>
          <p className="fish-rule-text">{s.notes}</p>
          <GroupHint text={s.notes} />
        </section>
      )}
      {!s.closed && <PermitCard region={region} />}
    </>
  );
}

/** Ficha de un tramo: temporada, modalidad, peces con sus reglas y carnadas. */
export function FishSectorPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const state = useFishData();
  if (state.status === 'ready' && !state.data.sectors.some((s) => s.id === id)) return <Navigate to="/fishing/waters" replace />;
  return (
    <FishDataGate state={state}>
      {(data) => {
        const s = data.sectors.find((x) => x.id === id)!;
        return (
          <div className="stack fish-screen" data-testid="fish-sector-page">
            <h1 className="page-title">{s.water}</h1>
            {s.rules?.length ? (
              <>
                <p className="fish-hint" data-testid="fish-shared">{t('fishing.shared', { list: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(s.rules.map((r) => r.regionName)) })}</p>
                {s.rules.map((r) => (
                  <section key={r.region} className="stack fish-rule-set" data-testid="fish-rule-set">
                    <h2 className="fish-rule-by">{t('fishing.ruleBy', { region: r.regionName })}</h2>
                    <SectorRules data={data} s={{ ...s, ...r, rules: undefined }} />
                  </section>
                ))}
              </>
            ) : (
              <SectorRules data={data} s={s} />
            )}
            <Link className="btn btn-block" to={`/fishing/map?sector=${s.id}`}>
              <MapIcon size={20} aria-hidden /> {t('fishing.seeOnMap')}
            </Link>
            <RulesNotice data={data} pageRef={s.ref} />
          </div>
        );
      }}
    </FishDataGate>
  );
}

/** Reglas generales por jurisdicción y fuentes. */
export function FishRulesPage() {
  const { t } = useTranslation();
  const state = useFishData();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.fishingRules.title')}</h1>
      <FishDataGate state={state}>
        {(data) => (
          <>
            <RulesNotice data={data} />
            {data.regions.map((r) => (
              <section key={r.id} className="card stack" data-testid="fish-region">
                <h2 className="section-title">{r.name}</h2>
                {r.season && (
                  <p>
                    <SeasonBadge season={r.season} />
                  </p>
                )}
                <PermitCard region={r} />
                {r.rules?.length ? (
                  <ul>
                    {r.rules.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
            <h2 className="section-title">{t('fishing.sources')}</h2>
            <ul className="list">
              {data.sources.map((s) => (
                <li key={s.id} className="list-row">
                  <span className="list-main">
                    <a className="list-title" href={s.url} target="_blank" rel="noreferrer">
                      {s.name}
                    </a>
                    <span className="list-sub">
                      {s.license} · {s.date}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </FishDataGate>
    </div>
  );
}

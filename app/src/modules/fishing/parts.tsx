import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { releaseActive, sectorClosure, seasonStatus, sectorSeason, speciesClosedUntil, zoneName, type FishData, type FishRegion, type FishSector, type Season, type SectorSpecies } from './fishing';
import type { FishDataState } from './useFishData';

/** Colores y trazos para pintar hasta cuatro peces a la vez (Okabe-Ito, aptos para daltonismo; el trazo los distingue en el tema rojo). */
export const FISH_STYLES = [
  { color: '#0072B2', dash: 'solid' },
  { color: '#D55E00', dash: 'dash' },
  { color: '#009E73', dash: 'dashdot' },
  { color: '#CC79A7', dash: 'dot' },
] as const;
export const MAX_FISH = FISH_STYLES.length;

const fmt = (d: Date, lang: string) => d.toLocaleDateString(lang, { day: 'numeric', month: 'long' });

/** «Abierta hasta el 1 de mayo» / «En veda hasta el 1 de noviembre» / «Temporada: ver reglamento». */
export function SeasonBadge({ season, now }: { season: Season | undefined; now?: Date }) {
  const { t, i18n } = useTranslation();
  const s = seasonStatus(season, now);
  if (s.state === 'open')
    return (
      <span className="fish-season" data-state="open">
        {s.until ? t('fishing.season.openUntil', { date: fmt(s.until, i18n.language) }) : t('fishing.season.allYear')}
      </span>
    );
  if (s.state === 'closed')
    return (
      <span className="fish-season" data-state="closed">
        {s.from ? t('fishing.season.closedUntil', { date: fmt(s.from, i18n.language) }) : t('fishing.season.closed')}
      </span>
    );
  return (
    <span className="fish-season" data-state="unknown">
      {t('fishing.season.unknown')}
    </span>
  );
}

export function SectorSeasonBadge({ data, sector }: { data: FishData; sector: FishSector }) {
  const { t } = useTranslation();
  if (sector.closed)
    return (
      <span className="fish-season" data-state="closed">
        {t('fishing.season.forbidden')}
      </span>
    );
  const total = sectorClosure(sector);
  if (total)
    return (
      <span className="fish-season" data-state="closed">
        {t('fishing.season.closedUntil', { date: total.until.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) })}
      </span>
    );
  const season = sectorSeason(data, sector);
  // En el Litoral no hay temporada general: las vedas van por especie (se ven en cada pez).
  if (!season) return null;
  return <SeasonBadge season={season} />;
}

/**
 * Qué se puede hacer con una especie en un tramo: «forbidden» (pesca prohibida en el tramo), «release» (captura y devolución), «keep» (se puede sacrificar hasta el cupo), «free»
 * (sin límite, p. ej. la carpa) o «unknown» (el texto no lo dice: rige el cupo general).
 */
export type KeepRule = 'forbidden' | 'release' | 'keep' | 'free' | 'unknown';
export function keepRule(sp: SectorSpecies | undefined, sector: FishSector): KeepRule {
  if (sector.closed || sectorClosure(sector)) return 'forbidden';
  if (!sp) return 'unknown';
  // Prohibida todo el año o en veda hoy: rojo.
  if (sp.forbidden || speciesClosedUntil(sp)) return 'forbidden';
  if (sector.catchAndRelease || sp.limit === 0 || releaseActive(sp)) return 'release';
  if (sp.limit === null) return 'free';
  if (sp.limit && sp.limit > 0) return 'keep';
  return 'unknown';
}

/** «11-01» → «1/11». */
const fmtMD = (md: string) => md.split('-').slice(-2).reverse().map(Number).join('/');

/** Cupo y talla de una especie en un tramo, en una línea. */
export function speciesRules(t: (k: string, o?: Record<string, unknown>) => string, sp: SectorSpecies, sector: FishSector): string[] {
  const out: string[] = [];
  if (sp.forbidden) return [t('fishing.rules.forbidden'), ...(sp.note ? [sp.note] : [])];
  const until = speciesClosedUntil(sp);
  if (until) out.push(t('fishing.rules.closedUntil', { date: until.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) }));
  const fmtD = (iso: string) => iso.split('-').reverse().map(Number).slice(0, 2).join('/');
  const releaseNow = releaseActive(sp);
  const untilNow = !!sp.releaseUntil && releaseNow && sp.limit !== 0 && !sector.catchAndRelease;
  if (sector.catchAndRelease || sp.limit === 0 || releaseNow)
    out.push(untilNow ? t('fishing.rules.releaseUntil', { date: fmtD(sp.releaseUntil!) }) : releaseNow && sp.limit !== 0 && !sector.catchAndRelease ? t('fishing.rules.releaseSince', { date: fmtD(sp.releaseFrom!) }) : t('fishing.rules.release'));
  if (untilNow && sp.limit) out.push(t('fishing.rules.limitAfter', { n: sp.limit, date: fmtD(sp.releaseUntil!) }));
  else if (sp.limit) out.push(sp.groupLimit ? t('fishing.rules.limitGroup', { n: sp.limit }) : t('fishing.rules.limit', { n: sp.limit }));
  if (sp.releaseFrom && !releaseNow && sp.limit !== 0 && !sector.catchAndRelease) out.push(t('fishing.rules.releaseFrom', { date: fmtD(sp.releaseFrom) }));
  else if (sp.limit === null) out.push(t('fishing.rules.free'));
  if (sp.minSizeCm) out.push(t('fishing.rules.minSize', { cm: sp.minSizeCm }));
  if (sp.maxSizeCm) out.push(t('fishing.rules.maxSize', { cm: sp.maxSizeCm }));
  if (!until) for (const c of sp.closures ?? []) out.push(t('fishing.rules.closure', { from: fmtMD(c.from), to: fmtMD(c.to) }));
  if (sp.note) out.push(sp.note);
  if (sp.unconfirmed) out.push(t('fishing.rules.unconfirmed'));
  // Sin ninguna regla para la especie: rige la norma general (no es «libre»).
  if (!out.length) out.push(t('fishing.rules.general'));
  return out;
}

/** Grupos que nombra el reglamento sin detallar («salmónidos»): se aclara qué especies son. */
export function GroupHint({ text }: { text?: string }) {
  const { t } = useTranslation();
  if (!text || !/salm[oó]nid/i.test(text)) return null;
  return (
    <p className="fish-hint" data-testid="fish-group-hint">
      {t('fishing.salmonids')}
    </p>
  );
}

/** Aviso fijo: los datos son informativos y hay que consultar el reglamento vigente. */
/** Aviso de que es orientativo; con `sourceId`, enlaza la norma de ese tramo o región (cada provincia tiene la suya). */
export function RulesNotice({ data, pageRef, sourceId }: { data: FishData; pageRef?: string; sourceId?: string }) {
  const { t } = useTranslation();
  const src = sourceId ? data.sources.find((x) => x.id === sourceId) : undefined;
  return (
    <p className="fish-notice" data-testid="fish-notice">
      {t('fishing.notice', { season: data.seasonLabel ?? '', date: data.generatedAt.slice(0, 10) })}{' '}
      {pageRef && `${t('fishing.sourceOf', { ref: pageRef })}: `}
      {src && (
        <a href={src.url} target="_blank" rel="noreferrer">
          {src.name}
        </a>
      )}
    </p>
  );
}

/** Lo que se muestra mientras no hay datos (cargando, país sin datos, sin bajar). */
export function FishDataGate({ state, children }: { state: FishDataState; children: (data: FishData) => ReactNode }) {
  const { t } = useTranslation();
  if (state.status === 'loading') return <p className="muted">{t('fishing.loading')}</p>;
  if (state.status === 'none')
    return (
      <div className="card" data-testid="fish-none">
        <p>{t('fishing.noCountry')}</p>
      </div>
    );
  if (state.status === 'missing')
    return (
      <div className="card" data-testid="fish-missing">
        <p>{t('fishing.missing')}</p>
        <Link className="btn" to="/settings">
          {t('fishing.download')}
        </Link>
      </div>
    );
  return <>{children(state.data)}</>;
}

/** Permiso de pesca de una jurisdicción: que es obligatorio, cuánto sale y dónde se saca (enlace oficial). */
export function PermitCard({ region }: { region: FishRegion | undefined }) {
  const { t } = useTranslation();
  const p = region?.permit;
  if (!region) return null;
  return (
    <section className="card stack fish-permit" data-testid="fish-permit">
      <h2 className="section-title">{t('fishing.permit.title', { region: region.name })}</h2>
      <p>{t('fishing.permit.required')}</p>
      {p?.items.length ? (
        <ul className="fish-permit-list">
          {p.items.map((x) => (
            <li key={`${x.type}-${x.who ?? ''}`}>
              <strong className="fish-permit-type">{x.type}</strong>
              {x.who && (
                <>
                  <span className="fish-sep"> · </span>
                  <span className="fish-permit-who">{x.who}</span>
                </>
              )}
              {x.price && (
                <>
                  <span className="fish-sep"> · </span>
                  <span className="fish-permit-price">{x.price}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {p?.buyUrl && (
        <a className="btn btn-primary btn-block" href={p.buyUrl} target="_blank" rel="noreferrer" data-testid="fish-permit-buy">
          {t('fishing.permit.buy')}
        </a>
      )}
      {p?.infoUrl && (
        <a href={p.infoUrl} target="_blank" rel="noreferrer">
          {t('fishing.permit.info')}
        </a>
      )}
      {/* Aclaraciones: después de los precios y del botón, más chicas, para que lo importante se vea primero. */}
      <div className="fish-permit-notes">
        {p?.extra?.map((x) => (
          <p key={x} className="small">
            {x}
          </p>
        ))}
        {p?.requirements && <p className="small">{p.requirements}</p>}
        {p?.where && <p className="small muted">{p.where}</p>}
        {p?.date && <p className="small muted">{t('fishing.permit.asOf', { date: p.date })}</p>}
      </div>
    </section>
  );
}

/** Elegir la zona (cuenca): por defecto la de tu lugar; se puede cambiar a mano. */
export function ZonePicker({ data, zone, picked, auto, manual, setZone }: { data: FishData; zone: string | null; picked?: string | null; auto: string | null; manual: boolean; setZone: (z: string | null) => void }) {
  const { t, i18n } = useTranslation();
  const zones = data.zones ?? [];
  if (zones.length < 2) return null;
  return (
    <label className="fish-zone" data-testid="fish-zone">
      <span>{t('fishing.zone.label')}</span>
      <select className="input" value={picked ?? zone ?? ''} onChange={(e) => setZone(e.target.value === auto ? null : e.target.value)}>
        <option value="all">{t('fishing.zone.all')}</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {zoneName(z, i18n.language)}
            {z.id === auto ? ` (${t('fishing.zone.here')})` : ''}
          </option>
        ))}
      </select>
      {manual && auto && auto !== zone && (
        <button type="button" className="btn btn-small" onClick={() => setZone(null)}>
          {t('fishing.zone.useHere')}
        </button>
      )}
    </label>
  );
}

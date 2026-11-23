import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { seasonStatus, sectorSeason, type FishData, type FishRegion, type FishSector, type Season, type SectorSpecies } from './fishing';
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
  return <SeasonBadge season={sectorSeason(data, sector)} />;
}

/**
 * Qué se puede hacer con una especie en un tramo: «forbidden» (pesca prohibida en el tramo), «release» (captura y devolución), «keep» (se puede sacrificar hasta el cupo), «free»
 * (sin límite, p. ej. la carpa) o «unknown» (el texto no lo dice: rige el cupo general).
 */
export type KeepRule = 'forbidden' | 'release' | 'keep' | 'free' | 'unknown';
export function keepRule(sp: SectorSpecies | undefined, sector: FishSector): KeepRule {
  if (sector.closed) return 'forbidden';
  if (!sp) return 'unknown';
  if (sector.catchAndRelease || sp.limit === 0) return 'release';
  if (sp.limit === null) return 'free';
  if (sp.limit && sp.limit > 0) return 'keep';
  return 'unknown';
}

/** Cupo y talla de una especie en un tramo, en una línea. */
export function speciesRules(t: (k: string, o?: Record<string, unknown>) => string, sp: SectorSpecies, sector: FishSector): string[] {
  const out: string[] = [];
  if (sector.catchAndRelease || sp.limit === 0) out.push(t('fishing.rules.release'));
  else if (sp.limit) out.push(t('fishing.rules.limit', { n: sp.limit }));
  else if (sp.limit === null) out.push(t('fishing.rules.free'));
  else out.push(t('fishing.rules.general'));
  if (sp.minSizeCm) out.push(t('fishing.rules.minSize', { cm: sp.minSizeCm }));
  if (sp.maxSizeCm) out.push(t('fishing.rules.maxSize', { cm: sp.maxSizeCm }));
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
export function RulesNotice({ data, pageRef }: { data: FishData; pageRef?: string }) {
  const { t } = useTranslation();
  const src = data.sources[0];
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

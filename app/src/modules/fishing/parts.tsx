import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Fish, Loader2, Mail, Phone } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { formatBytes } from '@/modules/emergency/countryDownload';
import { useCountryPackStore } from '@/modules/emergency/useCountryPacks';
import { useTranslation } from 'react-i18next';
import { type HabitatFilter, releaseActive, rulesExpired, sectorClosure, seasonStatus, sectorSeason, speciesClosedUntil, zoneName, type FishData, type FishRegion, type FishSector, type Season, type SectorSpecies } from './fishing';
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
  if (rulesExpired(sector))
    return (
      <span className="fish-season" data-state="unknown">
        {t('fishing.season.expired')}
      </span>
    );
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
  if (rulesExpired(sector)) return 'unknown';
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
  if (rulesExpired(sector)) return [t('fishing.rules.expired', { date: sector.validUntil!.split('-').reverse().join('/') })];
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
    <p className="notice-unofficial" role="note" data-testid="fish-notice">
      <AlertTriangle size={18} aria-hidden className="notice-unofficial-icon" />
      <span>
      <strong>{t('fishing.noticeTitle')}</strong> {t('fishing.notice', { season: data.seasonLabel ?? '', date: data.generatedAt.slice(0, 10) })}{' '}
      {pageRef && `${t('fishing.sourceOf', { ref: pageRef })}: `}
      {src && (
        <a href={src.url} target="_blank" rel="noreferrer">
          {src.name}
        </a>
      )}
      </span>
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
  if (state.status === 'notDownloaded' || state.status === 'missing') return <FishPackOffer offline={state.status === 'missing'} />;
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
      {/* Que hace falta el permiso va resaltado: la autoridad de Buenos Aires pidió destacarlo (pescar sin licencia es infracción). */}
      <p className="fauna-warning" data-status="prohibida" data-testid="fish-permit-required">
        <strong>{t('fishing.permit.required')}</strong>
      </p>
      {p?.legal?.length ? (
        <ul className="fish-permit-legal" data-testid="fish-permit-legal">
          {p.legal.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
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
      {/* Teléfono y correo oficiales para sacarlo o consultar (aunque no haya precio ni trámite en línea). */}
      {(p?.phone?.length || p?.email?.length) && (
        <ul className="fish-permit-contact" data-testid="fish-permit-contact">
          {/* El botón lleva solo el número o el correo; lo que va entre paréntesis (a qué oficina corresponde) se lee abajo, en chico. */}
          {p?.phone?.map((n) => {
            const note = n.includes('(') ? n.slice(n.indexOf('(') + 1).replace(/\)\s*$/, '') : '';
            return (
              <li key={n}>
                <a className="btn btn-small" href={`tel:${n.split('(')[0]!.replace(/[^\d+]/g, '')}`}>
                  <Phone size={16} aria-hidden /> {n.split('(')[0]!.trim()}
                </a>
                {note && <span className="small muted">{note}</span>}
              </li>
            );
          })}
          {p?.email?.map((m) => {
            const addr = m.split(/\s/)[0]!;
            const note = m.slice(addr.length).trim().replace(/^\(|\)$/g, '');
            return (
              <li key={m}>
                <a className="btn btn-small" href={`mailto:${addr}`}>
                  <Mail size={16} aria-hidden /> {addr}
                </a>
                {note && <span className="small muted">{note}</span>}
              </li>
            );
          })}
        </ul>
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

/**
 * Ofrece bajar (o actualizar) el paquete de pesca del país, que es una descarga aparte de los datos generales. Se muestra en la sección
 * cuando falta, y como aviso chico en la portada cuando hay una versión nueva.
 */
export function FishPackOffer({ offline = false, compact = false }: { offline?: boolean; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const country = useSettings((s) => s.settings.country);
  const { fish, busyFish, downloadFish, check } = useCountryPackStore();
  useEffect(() => {
    void check();
  }, [check]);
  const f = fish[country];
  const name = t(`country.${country}`);
  const busy = busyFish === country;
  if (compact && f?.state !== 'outdated') return null;
  const size = f ? formatBytes(f.state === 'missing' ? f.total : f.bytes || f.total, i18n.language) : '';
  return (
    <div className={compact ? 'fish-pack-offer fish-pack-compact' : 'card stack fish-pack-offer'} data-testid={compact ? 'fish-pack-update' : 'fish-pack-offer'}>
      <p>{compact ? t('fishing.pack.outdated', { country: name }) : offline && !navigator.onLine ? t('fishing.missing') : t('fishing.pack.offer', { country: name })}</p>
      <div>
        <button className={compact ? 'btn btn-small' : 'btn btn-primary'} type="button" disabled={busy || !navigator.onLine} onClick={() => void downloadFish(country)} data-testid="fish-pack-get">
          {busy ? <Loader2 size={18} className="spin" aria-hidden /> : <Fish size={18} aria-hidden />}{' '}
          {busy ? t('fishing.pack.downloading') : f?.state === 'outdated' ? t('fishing.pack.update') : t('fishing.pack.get')}
          {size && !busy ? ` (${size})` : ''}
        </button>
      </div>
      {!compact && <p className="muted small">{t('fishing.pack.hint')}</p>}
    </div>
  );
}

const HABITAT_KEY = 'vikarg.fishing.habitat';
/** Filtro de ambiente (ríos, lagos y lagunas / mar / todos), recordado en el dispositivo. */
export function useHabitatFilter(): [HabitatFilter, (f: HabitatFilter) => void] {
  const [f, setF] = useState<HabitatFilter>(() => {
    try {
      const v = localStorage.getItem(HABITAT_KEY);
      return v === 'continental' || v === 'marine' ? v : 'all';
    } catch {
      return 'all';
    }
  });
  return [
    f,
    (v) => {
      setF(v);
      try {
        localStorage.setItem(HABITAT_KEY, v);
      } catch {
        /* sin almacenamiento: igual filtra */
      }
    },
  ];
}

/** Elegir el ambiente: no es agua dulce o salada (hay lagunas saladas continentales), sino ríos, lagos y lagunas o mar. */
export function HabitatPicker({ value, onChange }: { value: HabitatFilter; onChange: (f: HabitatFilter) => void }) {
  const { t } = useTranslation();
  return (
    <div className="fish-habitat" role="group" aria-label={t('fishing.habitat.label')} data-testid="fish-habitat">
      {(['all', 'continental', 'marine'] as const).map((k) => (
        <button key={k} type="button" className="chip" aria-pressed={value === k} onClick={() => onChange(k)} data-testid={`fish-habitat-${k}`}>
          {t(`fishing.habitat.${k}`)}
        </button>
      ))}
    </div>
  );
}

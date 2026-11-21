import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSettings } from '@/core/settings/settings';
import { usePlaceCountry } from '@/modules/emergency/usePlaceCountry';
import { ESTIMATED_ZONES, ZONES, type CropCalendar, type Zone } from './calendar';
import { cropName, type Crop, type Family } from './crops';
import type { GardenPlace } from './status';
import { Notice } from '@/ui/Notice';

/** Color por familia: sirve para ver la rotación en la grilla. */
export const FAMILY_COLOR: Record<Family, string> = {
  amaranth: '#b5475f',
  allium: '#a68fd1',
  mint: '#5fae7a',
  carrot: '#e08a3c',
  legume: '#7cb342',
  bindweed: '#c2775a',
  nightshade: '#e0533d',
  cabbage: '#4f9fb8',
  grass: '#d9b23c',
  daisy: '#8bc34a',
  rose: '#e8607a',
  gourd: '#e3a43a',
  asparagus: '#6e9e58',
  oxalis: '#b07cc6',
};

export const MONTHS_SHORT = (lang: string) =>
  Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 15))).replace('.', ''));

export function CropLink({ crop }: { crop: Crop }) {
  const { i18n } = useTranslation();
  return (
    <Link className="chip garden-chip" to={`/garden/crops/${crop.id}`}>
      {cropName(crop, i18n.language)}
    </Link>
  );
}

/** Elegir la zona: automática (según el lugar) o una a mano. */
export function ZonePicker({ place, zone, suggested, manual }: { place: GardenPlace | null; zone: Zone; suggested: Zone | null; manual: boolean }) {
  const { t } = useTranslation();
  const update = useSettings((s) => s.update);
  const country = usePlaceCountry(place);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field">
        <label htmlFor="garden-zone">{t('garden.zone')}</label>
        <select
          id="garden-zone"
          className="select"
          value={manual ? zone : 'auto'}
          onChange={(e) => void update({ gardenZone: e.target.value === 'auto' ? null : (e.target.value as Zone) })}
        >
          <option value="auto">{suggested ? t('garden.zoneAuto', { zone: t(`garden.zones.${suggested}`) }) : t('garden.zoneAutoNone')}</option>
          {ZONES.map((z) => (
            <option key={z} value={z}>
              {t(`garden.zones.${z}`)}
            </option>
          ))}
        </select>
      </div>
      {!manual && !place && <p className="hint" style={{ margin: 0 }}>{t('garden.zoneNoPlace')}</p>}
      {country !== 'AR' && <p className="hint" style={{ margin: 0 }}>{t(`garden.zoneCountry.${country}`, { zone: t(`garden.zones.${zone}`) })}</p>}
      {ESTIMATED_ZONES.has(zone) && (
        <Notice id={`garden.zoneEstimated.${zone}`} variant="warning" testId="zone-estimated">
          {t(zone === 'vallesBolivia' ? 'garden.zoneEstimatedValles' : zone === 'tropicoBolivia' ? 'garden.zoneEstimatedTropico' : zone === 'sierraPeru' ? 'garden.zoneEstimatedSierraPeru' : 'garden.zoneEstimated')}
        </Notice>
      )}
    </div>
  );
}

const KINDS = ['nursery', 'sow', 'transplant', 'harvest'] as const;

/** Franja de 12 meses de un cultivo: almácigo, siembra directa, trasplante y cosecha. */
export function MonthStrip({ cal, month, labels }: { cal: CropCalendar; month: number; labels?: boolean }) {
  const { t, i18n } = useTranslation();
  const names = MONTHS_SHORT(i18n.language);
  return (
    <div className="garden-strip" role="img" aria-label={stripLabel(cal, t, names)}>
      {names.map((name, i) => {
        const m = i + 1;
        return (
          <div key={m} className={`garden-month${m === month ? ' garden-month-now' : ''}`}>
            {labels && <span className="garden-month-name">{name}</span>}
            {KINDS.map((k) => (
              <span key={k} className={`garden-bar garden-bar-${k}${cal[k].has(m) ? ' on' : ''}`} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function stripLabel(cal: CropCalendar, t: (k: string) => string, names: string[]): string {
  return KINDS.filter((k) => cal[k].size)
    .map((k) => `${t(`garden.kinds.${k}`)}: ${[...cal[k]].sort((a, b) => a - b).map((m) => names[m - 1]).join(', ')}`)
    .join('. ');
}

export function StripLegend() {
  const { t } = useTranslation();
  return (
    <p className="garden-legend hint">
      {KINDS.map((k) => (
        <span key={k}>
          <span className={`garden-bar garden-bar-${k} on`} /> {t(`garden.kinds.${k}`)}
        </span>
      ))}
    </p>
  );
}

export function GardenSources() {
  const { t } = useTranslation();
  return (
    <details className="card">
      <summary>{t('garden.sourcesTitle')}</summary>
      <p className="hint">{t('garden.sources')}</p>
    </details>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { Segmented } from '@/ui/Segmented';
import { Collapsible } from '@/ui/Collapsible';
import {
  declinationInfo,
  degMin,
  magneticToTrue,
  mapDeclinationToday,
  metersOffPerKm,
  MODEL_VALID_UNTIL,
  trueToMagnetic,
} from './declination';

type Side = 'E' | 'W';
type Direction = 'm2t' | 't2m';

const num = (s: string) => {
  const n = Number(s.trim().replace(',', '.').replace('−', '-'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** Dibujo: norte geográfico arriba y la aguja (norte magnético) girada por la declinación. */
function DeclinationDial({ value }: { value: number }) {
  const { t } = useTranslation();
  const r = 80;
  const rad = (value * Math.PI) / 180;
  const x = 100 + r * Math.sin(rad);
  const y = 100 - r * Math.cos(rad);
  const arcR = 50;
  const ax = 100 + arcR * Math.sin(rad);
  const ay = 100 - arcR * Math.cos(rad);
  return (
    <svg viewBox="0 0 200 200" className="decl-dial" role="img" aria-label={t('declination.dialLabel')}>
      <circle cx="100" cy="100" r="92" className="decl-ring" />
      <line x1="100" y1="100" x2="100" y2="18" className="decl-true" />
      <text x="100" y="12" textAnchor="middle" className="decl-label">
        ★ {t('declination.trueShort')}
      </text>
      <path d={`M100 50 A${arcR} ${arcR} 0 0 ${value >= 0 ? 1 : 0} ${ax} ${ay}`} className="decl-arc" />
      <line x1="100" y1="100" x2={x} y2={y} className="decl-mag" />
      {/* Al costado de la aguja, a media altura: con pocos grados no se pisa con "NV". */}
      <text
        x={100 + 55 * Math.sin(rad) + (value >= 0 ? 8 : -8)}
        y={100 - 55 * Math.cos(rad)}
        textAnchor={value >= 0 ? 'start' : 'end'}
        className="decl-label decl-label-mag"
      >
        {t('declination.magShort')}
      </text>
      <circle cx="100" cy="100" r="4" className="decl-center" />
    </svg>
  );
}

/** Declinómetro: declinación del lugar, cambio anual, conversión de rumbos, mapa viejo y machete. */
export function DeclinationPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const nf = (digits: number) => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sideOf = (v: number): Side => (v < 0 ? 'W' : 'E');
  const sideName = (s: Side) => t(`declination.side.${s}`);
  /** En los botones, con el signo de la convención (Este +, Oeste −): hay mapas que solo traen el signo. */
  const sideButton = (s: Side) => `${sideName(s)} (${s === 'E' ? '+' : '−'})`;
  /** Si se escribe el número con signo, se elige el lado solo. */
  const signedInput = (value: string, setValue: (v: string) => void, setSide: (s: Side) => void) => {
    const v = value.trim();
    if (/^[-−]/.test(v)) setSide('W');
    else if (v.startsWith('+')) setSide('E');
    setValue(value);
  };
  /** "6,5° Oeste (6° 30′)". */
  const angle = (v: number) => {
    const [d, m] = degMin(v);
    return t('declination.angle', { value: nf(1).format(Math.abs(v)), side: sideName(sideOf(v)), dm: `${d}° ${m}′` });
  };

  const info = useMemo(() => (place ? declinationInfo(place.lat, place.lon, place.alt ?? 0) : null), [place?.lat, place?.lon, place?.alt]);

  // Conversión de rumbos.
  const [dir, setDir] = useState<Direction>('m2t');
  const [bearing, setBearing] = useState('');
  const b = num(bearing);
  const converted = info && b !== null ? (dir === 'm2t' ? magneticToTrue(b, info.value) : trueToMagnetic(b, info.value)) : null;

  // Mapa de papel viejo.
  const [mapYear, setMapYear] = useState('');
  const [mapDecl, setMapDecl] = useState('');
  const [mapSide, setMapSide] = useState<Side>('W');
  const [mapAnnual, setMapAnnual] = useState('');
  const [mapAnnualSide, setMapAnnualSide] = useState<Side>('W');
  const year = num(mapYear);
  const decl = num(mapDecl);
  const annual = num(mapAnnual);
  const mapToday =
    year !== null && decl !== null && year > 1800 && year <= new Date().getFullYear()
      ? mapDeclinationToday((mapSide === 'W' ? -1 : 1) * Math.abs(decl), year, (mapAnnualSide === 'W' ? -1 : 1) * Math.abs(annual ?? 0))
      : null;

  const example = info?.value ?? -8;

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.declination.title')}</h1>
      <p className="hint" style={{ margin: 0 }}>
        {t('declination.intro')}
      </p>
      {picker}

      <section className="card stack" aria-labelledby="decl-here">
        <h2 id="decl-here" className="section-title" style={{ margin: 0 }}>
          {t('declination.hereTitle')}
        </h2>
        {info && place ? (
          <>
            <p className="decl-value" data-testid="decl-value">
              {angle(info.value)}
            </p>
            <DeclinationDial value={info.value} />
            <p className="hint" style={{ margin: 0 }}>
              {t(info.value < 0 ? 'declination.meaningW' : 'declination.meaningE', { value: nf(1).format(Math.abs(info.value)) })}
            </p>
            <p className="hint" style={{ margin: 0 }} data-testid="decl-annual">
              {t('declination.annual', {
                minutes: nf(1).format(Math.abs(info.annual * 60)),
                side: sideName(sideOf(info.annual)),
              })}
            </p>
            <p className="hint" style={{ margin: 0 }}>
              {t('declination.error', { meters: Math.round(metersOffPerKm(info.value) / 5) * 5 })}
            </p>
            <p className="hint" style={{ margin: 0 }}>
              {info.valid ? t('declination.model', { until: MODEL_VALID_UNTIL }) : t('declination.modelExpired', { until: MODEL_VALID_UNTIL })}
            </p>
          </>
        ) : (
          <p className="empty">{t('declination.choosePlace')}</p>
        )}
      </section>

      <section className="card stack" aria-labelledby="decl-convert">
        <h2 id="decl-convert" className="section-title" style={{ margin: 0 }}>
          {t('declination.convertTitle')}
        </h2>
        <Segmented<Direction>
          label={t('declination.direction')}
          value={dir}
          options={[
            { value: 'm2t', label: t('declination.m2t') },
            { value: 't2m', label: t('declination.t2m') },
          ]}
          onChange={setDir}
        />
        <div className="field">
          <label htmlFor="decl-bearing">{t(dir === 'm2t' ? 'declination.bearingMag' : 'declination.bearingTrue')}</label>
          <input id="decl-bearing" className="input" inputMode="decimal" value={bearing} onChange={(e) => setBearing(e.target.value)} placeholder="0–360" />
        </div>
        {!info ? (
          <p className="hint" style={{ margin: 0 }}>
            {t('declination.choosePlace')}
          </p>
        ) : (
          converted !== null &&
          b !== null && (
            <p className="decl-result" data-testid="decl-converted">
              {t(dir === 'm2t' ? 'declination.resultM2t' : 'declination.resultT2m', {
                from: nf(0).format(b),
                op: (dir === 'm2t') === info.value >= 0 ? '+' : '−',
                decl: nf(1).format(Math.abs(info.value)),
                to: nf(1).format(converted),
              })}
            </p>
          )
        )}
      </section>

      <section className="card stack" aria-labelledby="decl-map">
        <h2 id="decl-map" className="section-title" style={{ margin: 0 }}>
          {t('declination.mapTitle')}
        </h2>
        <p className="hint" style={{ margin: 0 }}>
          {t('declination.mapIntro')}
        </p>
        <div className="field">
          <label htmlFor="decl-map-year">{t('declination.mapYear')}</label>
          <input id="decl-map-year" className="input" inputMode="numeric" value={mapYear} onChange={(e) => setMapYear(e.target.value)} placeholder="1995" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="decl-map-decl">{t('declination.mapDecl')}</label>
            <input id="decl-map-decl" className="input" inputMode="decimal" value={mapDecl} onChange={(e) => signedInput(e.target.value, setMapDecl, setMapSide)} placeholder="5,5" />
          </div>
          <Segmented<Side>
            label={t('declination.towards')}
            value={mapSide}
            options={[
              { value: 'W', label: sideButton('W') },
              { value: 'E', label: sideButton('E') },
            ]}
            onChange={setMapSide}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="decl-map-annual">{t('declination.mapAnnual')}</label>
            <input id="decl-map-annual" className="input" inputMode="decimal" value={mapAnnual} onChange={(e) => signedInput(e.target.value, setMapAnnual, setMapAnnualSide)} placeholder="8" />
          </div>
          <Segmented<Side>
            label={t('declination.towards')}
            value={mapAnnualSide}
            options={[
              { value: 'W', label: sideButton('W') },
              { value: 'E', label: sideButton('E') },
            ]}
            onChange={setMapAnnualSide}
          />
        </div>
        {mapToday !== null && (
          <p className="decl-result" data-testid="decl-map-today">
            {t('declination.mapToday', { value: angle(mapToday) })}
            {info && ` ${t('declination.mapCompare', { value: angle(info.value), place: place?.label ?? '' })}`}
          </p>
        )}
      </section>

      {/* Texto de referencia: plegado (el contenedor conserva la clase y el testid del machete). */}
      <Collapsible id="decl-cheat" title={t('declination.cheatTitle')} testId="decl-cheat">
        <dl className="decl-cheat">
          <dt>{t('declination.cheat.what.term')}</dt>
          <dd>{t('declination.cheat.what.text')}</dd>
          <dt>{t('declination.cheat.formula.term')}</dt>
          <dd>
            <strong>{t('declination.cheat.formula.m2t')}</strong>
            <br />
            <strong>{t('declination.cheat.formula.t2m')}</strong>
            <br />
            {t('declination.cheat.formula.sign')}
          </dd>
          <dt>{t('declination.cheat.rule.term')}</dt>
          <dd>
            {t('declination.cheat.rule.m2t')}
            <br />
            {t('declination.cheat.rule.t2m')}
          </dd>
          <dt>{t('declination.cheat.gmer.term')}</dt>
          <dd data-testid="decl-gmer">{t('declination.cheat.gmer.text')}</dd>
          <dt>{t('declination.cheat.example.term')}</dt>
          <dd>
            {t(example < 0 ? 'declination.cheat.example.textW' : 'declination.cheat.example.textE', {
              decl: nf(1).format(Math.abs(example)),
              mag: '120',
              true: nf(1).format(magneticToTrue(120, example)),
              true2: '45',
              mag2: nf(1).format(trueToMagnetic(45, example)),
              where: info ? t('declination.cheat.example.here') : t('declination.cheat.example.generic'),
            })}
          </dd>
          <dt>{t('declination.cheat.mapToCompass.term')}</dt>
          <dd>
            <ol>
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n}>{t(`declination.cheat.mapToCompass.s${n}`)}</li>
              ))}
            </ol>
          </dd>
          <dt>{t('declination.cheat.compassToMap.term')}</dt>
          <dd>
            <ol>
              {[1, 2, 3, 4].map((n) => (
                <li key={n}>{t(`declination.cheat.compassToMap.s${n}`)}</li>
              ))}
            </ol>
          </dd>
          <dt>{t('declination.cheat.adjust.term')}</dt>
          <dd>{t('declination.cheat.adjust.text')}</dd>
          <dt>{t('declination.cheat.grid.term')}</dt>
          <dd>{t('declination.cheat.grid.text')}</dd>
          <dt>{t('declination.cheat.region.term')}</dt>
          <dd>{t('declination.cheat.region.text')}</dd>
          <dt>{t('declination.cheat.app.term')}</dt>
          <dd>
            {t('declination.cheat.app.text')} <Link to="/orientation/compass">{t('modules.compass.title')}</Link>
          </dd>
        </dl>
      </Collapsible>
    </div>
  );
}

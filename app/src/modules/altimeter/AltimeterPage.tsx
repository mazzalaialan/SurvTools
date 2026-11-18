import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellOff, BellRing, RotateCcw } from 'lucide-react';
import { distanceMeters, type LatLon } from '@/core/geo/geo';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { useBarometer } from '@/core/sensors/useBarometer';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useSettings } from '@/core/settings/settings';
import { altitudeToMeters, altitudeUnit, formatAltitude } from '@/core/units/units';
import { elevationAt } from '@/modules/maps/measure';
import { GpsStatus } from '@/modules/waypoints/components';
import { Segmented } from '@/ui/Segmented';
import { alarmReached, MAX_VERTICAL_ACCURACY, mapOffset, reachAlarm, smoothAltitude, type AltitudeSource, type AltSample } from './altimeter';
import { pressureAltitude } from './barometer';
import { useAltimeter } from './store';
import { Notice } from '@/ui/Notice';
import { canShowLocal, notificationBackend } from '@/core/notifications/backend';

type AlarmKind = 'reach' | 'climb';

const num = (s: string) => {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/** Pitido corto (la alarma se escucha con el celular en el bolsillo si la pantalla sigue prendida). */
function beep() {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.25;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.4);
      o.stop(ctx.currentTime + i * 0.4 + 0.25);
    }
    setTimeout(() => void ctx.close(), 2_000);
  } catch {
    // Sin audio: queda la vibración y el aviso en pantalla.
  }
}

async function systemNotify(title: string, body: string) {
  if (!canShowLocal()) return;
  await notificationBackend().showLocal({ title, body, tag: 'altimeter', url: '#/orientation/altimeter' });
}

/** Altura en el tiempo de lo que va del recorrido. */
function AltitudeChart({ samples, fmt }: { samples: AltSample[]; fmt: (m: number) => string }) {
  const { t } = useTranslation();
  if (samples.length < 2) return <p className="hint" style={{ margin: 0 }}>{t('altimeter.chartEmpty')}</p>;
  const t0 = samples[0]!.t;
  const span = samples.at(-1)!.t - t0 || 1;
  const alts = samples.map((s) => s.alt);
  const min = Math.min(...alts);
  const max = Math.max(...alts);
  const range = Math.max(20, max - min);
  const pts = samples.map((s) => `${(((s.t - t0) / span) * 300).toFixed(1)},${(58 - ((s.alt - min) / range) * 52).toFixed(1)}`).join(' ');
  const minutes = Math.round(span / 60_000);
  return (
    <figure className="alt-chart" style={{ margin: 0 }}>
      <div className="alt-chart-axis">
        <span>{fmt(max)}</span>
        <span>{fmt(min)}</span>
      </div>
      <svg viewBox="0 0 300 60" className="measure-profile" role="img" aria-label={t('altimeter.chartLabel')} preserveAspectRatio="none">
        <polygon points={`0,60 ${pts} 300,60`} className="measure-profile-fill" />
        <polyline points={pts} className="measure-profile-line" />
      </svg>
      <figcaption className="hint">{t('altimeter.chartSpan', { count: minutes })}</figcaption>
    </figure>
  );
}

/** Altímetro por GPS: altura suavizada, calibración, desnivel, gráfico y alarma. */
export function AltimeterPage() {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const fmt = (m: number) => formatAltitude(m, units, i18n.language);
  const { fix, error } = useGeolocation();
  useWakeLock();
  const { samples, climb, calibration, alarm, ringing, add, calibrate, setAlarm, ring, reset } = useAltimeter();

  // Lecturas crudas del GPS (para suavizar) y pares GPS/mapa (para calibrar).
  const raw = useRef<number[]>([]);
  const pairs = useRef<{ gps: number; map: number; accuracy: number }[]>([]);
  const demAt = useRef<LatLon | null>(null);
  const [dem, setDem] = useState<number | null | undefined>(undefined);
  const [smoothed, setSmoothed] = useState<number | null>(null);
  // La altura sin calibrar de la fuente en uso (la del GPS suavizada o la del barómetro): con ella se calibra contra el mapa.
  const rawNow = useRef<number | null>(null);

  // Barómetro (solo la app nativa): si el dispositivo tiene, es la fuente por defecto; el GPS se puede elegir.
  const { available: baroAvailable, pressure } = useBarometer();
  const [chosen, setChosen] = useState<AltitudeSource | null>(null);
  const source: AltitudeSource = baroAvailable ? (chosen ?? 'baro') : 'gps';
  function chooseSource(next: AltitudeSource) {
    if (next === source) return;
    // Cambia la escala de las alturas: se empieza de nuevo (la calibración y el desnivel eran de la otra fuente).
    raw.current = [];
    pairs.current = [];
    rawNow.current = null;
    setSmoothed(null);
    setChosen(next);
    calibrate(null);
  }

  const usable = fix && fix.alt !== null && (fix.altAccuracy === null || fix.altAccuracy <= MAX_VERTICAL_ACCURACY);

  useEffect(() => {
    if (!fix) return;
    // Con el GPS la altura sale de la posición; con el barómetro sale de su presión (efecto de abajo) y la posición solo sirve para el mapa.
    const gps = source === 'gps' ? (usable ? fix.alt! : null) : rawNow.current;
    if (source === 'gps' && gps !== null) {
      raw.current = [...raw.current, gps].slice(-10);
      const s = smoothAltitude(raw.current)!;
      rawNow.current = s;
      setSmoothed(s);
      add({ t: fix.timestamp, alt: s + (calibration?.offset ?? 0), source: 'gps' });
    }
    // Altura del mapa: se vuelve a buscar al moverse más de 15 m (las teselas quedan en caché).
    const moved = !demAt.current || distanceMeters(demAt.current, fix) > 15;
    const map = moved
      ? elevationAt(fix).then((h) => {
          demAt.current = { lat: fix.lat, lon: fix.lon };
          setDem(h);
          return h;
        })
      : Promise.resolve(dem ?? null);
    void map.then((h) => {
      if (h != null && gps !== null) pairs.current = [...pairs.current, { gps, map: h, accuracy: fix.accuracy }].slice(-10);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix?.timestamp]);

  // Barómetro: cada lectura de presión es una altura (de presión), suavizada con la mediana de las últimas.
  useEffect(() => {
    if (source !== 'baro' || !pressure) return;
    raw.current = [...raw.current, pressureAltitude(pressure.hPa)].slice(-15);
    const s = smoothAltitude(raw.current, 9)!;
    rawNow.current = s;
    setSmoothed(s);
    add({ t: pressure.at, alt: s + (calibration?.offset ?? 0), source: 'baro' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressure?.at, source]);

  const altitude = smoothed === null ? null : smoothed + (calibration?.offset ?? 0);

  // Alarma.
  useEffect(() => {
    if (!alarm || altitude === null || !alarmReached(alarm, altitude, climb.ascent)) return;
    ring();
    navigator.vibrate?.([500, 200, 500, 200, 500]);
    beep();
    void systemNotify(t('altimeter.alarmTitle'), t('altimeter.alarmBody', { alt: fmt(altitude) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altitude, climb.ascent, alarm]);

  const [known, setKnown] = useState('');
  const knownM = num(known);
  const offsetFromMap = mapOffset(pairs.current);

  const [alarmKind, setAlarmKind] = useState<AlarmKind>('reach');
  const [alarmValue, setAlarmValue] = useState('');
  const alarmM = num(alarmValue);

  const unit = altitudeUnit(units);
  const calibrationLabel = !calibration
    ? t('altimeter.uncalibrated')
    : t(calibration.kind === 'map' ? 'altimeter.calibratedMap' : 'altimeter.calibratedManual', {
        offset: `${calibration.offset >= 0 ? '+' : '−'}${fmt(Math.abs(calibration.offset))}`,
      });

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.altimeter.title')}</h1>
      <Notice id="altimeter.disclaimer" variant="warning" testId="alt-disclaimer">
        {t('altimeter.disclaimer')}
      </Notice>
      <GpsStatus fix={fix} error={error} />

      {ringing && (
        <div className="warning-box alt-ringing" role="alert" data-testid="alt-ringing">
          <BellRing size={18} aria-hidden /> {t('altimeter.alarmBody', { alt: altitude === null ? '—' : fmt(altitude) })}{' '}
          <button className="btn" type="button" onClick={() => setAlarm(null)}>
            {t('altimeter.alarmDismiss')}
          </button>
        </div>
      )}

      <section className="card stack" aria-labelledby="alt-now">
        <h2 id="alt-now" className="section-title" style={{ margin: 0 }}>
          {t('altimeter.nowTitle')}
        </h2>
        {altitude !== null ? (
          <>
            <p className="alt-value" data-testid="alt-value">
              {fmt(altitude)}
            </p>
            <p className="hint" style={{ margin: 0, textAlign: 'center' }} data-testid="alt-calibration">
              {source === 'gps' && fix?.altAccuracy != null && `${t('altimeter.accuracy', { value: fmt(fix.altAccuracy) })} · `}
              {source === 'baro' && `${t('altimeter.baroAccuracy')} · `}
              {calibrationLabel}
            </p>
          </>
        ) : (
          <p className="empty" data-testid="alt-waiting">
            {fix && fix.alt === null ? t('altimeter.noAltitude') : fix ? t('altimeter.poorFix') : t('altimeter.waiting')}
          </p>
        )}
        <p className="hint" style={{ margin: 0 }} data-testid="alt-map">
          {dem === undefined ? t('altimeter.mapWaiting') : dem === null ? t('altimeter.mapNone') : t('altimeter.mapHere', { alt: fmt(dem) })}
        </p>
      </section>

      {baroAvailable && (
        <section className="card stack" aria-labelledby="alt-source">
          <h2 id="alt-source" className="section-title" style={{ margin: 0 }}>
            {t('altimeter.sourceTitle')}
          </h2>
          <div className="row" role="group" aria-label={t('altimeter.sourceTitle')} data-testid="alt-source">
            {(['baro', 'gps'] as const).map((s) => (
              <button key={s} className={`btn${source === s ? ' btn-primary' : ''}`} type="button" aria-pressed={source === s} onClick={() => chooseSource(s)} data-testid={`alt-source-${s}`}>
                {t(s === 'baro' ? 'altimeter.sourceBaro' : 'altimeter.sourceGps')}
              </button>
            ))}
          </div>
          {source === 'baro' && <p className="hint" style={{ margin: 0 }}>{t('altimeter.baroNote')}</p>}
        </section>
      )}

      <section className="card stack" aria-labelledby="alt-cal">
        <h2 id="alt-cal" className="section-title" style={{ margin: 0 }}>
          {t('altimeter.calTitle')}
        </h2>
        <p className="hint" style={{ margin: 0 }}>
          {t('altimeter.calIntro')}
        </p>
        <button
          className="btn"
          type="button"
          disabled={offsetFromMap === null || smoothed === null}
          onClick={() => offsetFromMap !== null && calibrate({ offset: offsetFromMap, kind: 'map', at: Date.now() })}
        >
          {t('altimeter.calMap')}
        </button>
        <div className="field">
          <label htmlFor="alt-known">{t('altimeter.calKnown', { unit })}</label>
          <input id="alt-known" className="input" inputMode="numeric" value={known} onChange={(e) => setKnown(e.target.value)} placeholder="1250" />
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={knownM === null || smoothed === null}
          onClick={() => {
            if (knownM === null || smoothed === null) return;
            calibrate({ offset: altitudeToMeters(knownM, units) - smoothed, kind: 'manual', at: Date.now() });
            setKnown('');
          }}
        >
          {t('altimeter.calApply')}
        </button>
        {calibration && (
          <button className="btn" type="button" onClick={() => calibrate(null)}>
            {t('altimeter.calRemove')}
          </button>
        )}
      </section>

      <section className="card stack" aria-labelledby="alt-trip">
        <h2 id="alt-trip" className="section-title" style={{ margin: 0 }}>
          {t('altimeter.tripTitle')}
        </h2>
        <div className="grid-2">
          <p style={{ margin: 0 }} data-testid="alt-ascent">
            {t('altimeter.ascent', { value: fmt(climb.ascent) })}
          </p>
          <p style={{ margin: 0 }} data-testid="alt-descent">
            {t('altimeter.descent', { value: fmt(climb.descent) })}
          </p>
        </div>
        <AltitudeChart samples={samples} fmt={fmt} />
        <p className="hint" style={{ margin: 0 }}>
          {t('altimeter.tripHint')}
        </p>
        <button className="btn" type="button" onClick={reset}>
          <RotateCcw size={18} aria-hidden /> {t('altimeter.tripReset')}
        </button>
      </section>

      <section className="card stack" aria-labelledby="alt-alarm">
        <h2 id="alt-alarm" className="section-title" style={{ margin: 0 }}>
          {t('altimeter.alarmSection')}
        </h2>
        {alarm ? (
          <>
            <p style={{ margin: 0 }} data-testid="alt-alarm-active">
              {alarm.kind === 'reach'
                ? t(alarm.direction === 'up' ? 'altimeter.alarmReachUp' : 'altimeter.alarmReachDown', { alt: fmt(alarm.target) })
                : t('altimeter.alarmClimbActive', {
                    meters: fmt(alarm.meters),
                    left: fmt(Math.max(0, alarm.meters - (climb.ascent - alarm.startAscent))),
                  })}
            </p>
            <button className="btn" type="button" onClick={() => setAlarm(null)}>
              <BellOff size={18} aria-hidden /> {t('altimeter.alarmCancel')}
            </button>
          </>
        ) : (
          <>
            <Segmented<AlarmKind>
              label={t('altimeter.alarmKind')}
              value={alarmKind}
              options={[
                { value: 'reach', label: t('altimeter.alarmReach') },
                { value: 'climb', label: t('altimeter.alarmClimb') },
              ]}
              onChange={setAlarmKind}
            />
            <div className="field">
              <label htmlFor="alt-alarm-value">{t(alarmKind === 'reach' ? 'altimeter.alarmReachInput' : 'altimeter.alarmClimbInput', { unit })}</label>
              <input id="alt-alarm-value" className="input" inputMode="numeric" value={alarmValue} onChange={(e) => setAlarmValue(e.target.value)} />
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={alarmM === null || alarmM <= 0 || altitude === null}
              onClick={() => {
                if (alarmM === null || altitude === null) return;
                const m = altitudeToMeters(alarmM, units);
                setAlarm(alarmKind === 'reach' ? reachAlarm(m, altitude) : { kind: 'climb', meters: m, startAscent: climb.ascent });
                setAlarmValue('');
              }}
            >
              <BellRing size={18} aria-hidden /> {t('altimeter.alarmSet')}
            </button>
          </>
        )}
        <p className="hint" style={{ margin: 0 }}>
          {t('altimeter.alarmHint')}
        </p>
      </section>

      <section className="card stack" aria-labelledby="alt-about">
        <h2 id="alt-about" className="section-title" style={{ margin: 0 }}>
          {t('altimeter.aboutTitle')}
        </h2>
        <ul className="alt-about">
          {['gps', 'android', 'map', 'tips', 'barometer'].map((k) => (
            <li key={k}>{t(`altimeter.about.${k}`)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

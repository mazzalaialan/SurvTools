import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Pause, Play, Square } from 'lucide-react';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useSettings } from '@/core/settings/settings';
import { currentSpeedMs } from '@/modules/training/live';
import { LiveShareCard } from '@/modules/training/LiveShareCard';
import { useTrainingFormat } from '@/modules/training/format';
import { analyzeRecording, formatClock } from '@/modules/training/stats';
import { bearingOfLast, cardinal, DRIVE_MAX_PLAUSIBLE_MS, FIX_STALE_S } from './drive';
import { FinishDialog, PocketButton } from './Recording';
import { elapsedS, useRecorder } from './recorder';

const KM_PER_MILE = 1.609344;

/**
 * Pantalla en vivo del modo «Conducir» (auto, moto, 4x4, camión…): la velocidad de ahora en grande y
 * lo útil al manejar. A propósito no muestra calorías, ritmo ni desnivel de esfuerzo: no es un
 * entrenamiento. Pensada para mirar de reojo, con el celular fijo en el vehículo.
 */
export function DrivePanel() {
  const { t, i18n } = useTranslation();
  const f = useTrainingFormat();
  const units = useSettings((s) => s.settings.units);
  const { status, track, elapsedMs, since, fix, pause, resume } = useRecorder();
  const [, tick] = useState(0);
  const [naming, setNaming] = useState(false);
  useWakeLock(status === 'recording');
  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const segments = track?.segments;
  // Las estadísticas se recalculan cuando llega un punto, no cada segundo.
  const stats = useMemo(() => (segments ? analyzeRecording(segments.map((s) => (s.length > 1 ? s : [])), DRIVE_MAX_PLAUSIBLE_MS) : null), [segments]);
  const elapsed = elapsedS({ elapsedMs, since });
  const fresh = fix !== null && Date.now() - fix.at <= FIX_STALE_S * 1000;
  // La velocidad del GPS es la de ahora; si el aparato no la da, se calcula con los últimos puntos.
  const nowMs = status !== 'recording' ? null : fresh ? (fix.speedMs ?? currentSpeedMs(segments ?? [])) : null;
  const nowKmh = nowMs === null ? null : nowMs * 3.6;
  // La máxima también cuenta lo que dio el GPS entre dos puntos guardados.
  const liveMax = useRef({ id: '', kmh: 0 });
  if (track && liveMax.current.id !== track.id) liveMax.current = { id: track.id, kmh: 0 };
  if (nowKmh !== null && nowKmh <= DRIVE_MAX_PLAUSIBLE_MS * 3.6) liveMax.current.kmh = Math.max(liveMax.current.kmh, nowKmh);

  if (!track || !stats || status === 'idle') return null;

  const moving = Math.min(stats.movingS, elapsed);
  const stopped = Math.max(0, elapsed - moving);
  const maxKmh = Math.max(stats.maxSpeedKmh, liveMax.current.kmh);
  const imperial = units === 'imperial';
  const nf0 = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 });
  const unit = imperial ? 'mph' : 'km/h';
  const speed = (kmh: number) => nf0.format(imperial ? kmh / KM_PER_MILE : kmh);
  const lastPoint = segments?.flat().at(-1);
  const altitude = fresh && fix.altitude !== null ? fix.altitude : (lastPoint?.[2] ?? null);
  // El rumbo del GPS solo vale en movimiento; parado se usa el del último tramo recorrido.
  const heading = fresh && fix.heading !== null && (nowMs ?? 0) > 1 ? fix.heading : bearingOfLast(segments ?? []);
  const avgMoving = stats.avgSpeedKmh;
  const avgTotal = elapsed > 0 ? stats.distanceM / 1000 / (elapsed / 3600) : 0;

  return (
    <div className="live stack" data-testid="drive">
      <p className="live-kind">
        {track.name} · {t(`drive.vehicle.${track.vehicle}`)} · {status === 'recording' ? t('tracks.rec.recording') : t('tracks.rec.paused')}
      </p>
      <div className="live-main">
        <span className="live-big" data-testid="drive-speed" aria-live="off">
          {nowKmh === null ? '—' : speed(nowKmh)}
        </span>
        <span className="live-unit">{unit}</span>
      </div>
      {status === 'recording' && nowKmh === null && (
        <p className="hint" style={{ margin: 0 }} data-testid="drive-nofix">
          {t('drive.noFix')}
        </p>
      )}
      <div className="live-actions">
        {status === 'recording' ? (
          <button className="live-btn" type="button" onClick={() => void pause()} data-testid="live-pause">
            <Pause size={28} /> {t('tracks.rec.pause')}
          </button>
        ) : (
          <button className="live-btn live-btn-go" type="button" onClick={resume} data-testid="live-resume">
            <Play size={28} /> {t('tracks.rec.resume')}
          </button>
        )}
        <button className="live-btn live-btn-stop" type="button" onClick={() => setNaming(true)} data-testid="live-finish">
          <Square size={24} fill="currentColor" /> {t('tracks.rec.finish')}
        </button>
      </div>
      <div className="live-grid">
        <div className="live-tile">
          <span className="live-label">{t('drive.max')}</span>
          <span className="live-value" data-testid="drive-max">{maxKmh > 0 ? `${speed(maxKmh)} ${unit}` : '—'}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('drive.avgMoving')}</span>
          <span className="live-value">{avgMoving > 0 ? `${speed(avgMoving)} ${unit}` : '—'}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('training.distance')}</span>
          <span className="live-value" data-testid="drive-distance">{f.distance(stats.distanceM)}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('drive.trip')}</span>
          <span className="live-value" data-testid="drive-clock">{formatClock(elapsed)}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('drive.moving')}</span>
          <span className="live-value">{formatClock(moving)}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('drive.stopped')}</span>
          <span className="live-value" data-testid="drive-stopped">{formatClock(stopped)}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('drive.avgTotal')}</span>
          <span className="live-value">{avgTotal > 0 ? `${speed(avgTotal)} ${unit}` : '—'}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('drive.heading')}</span>
          <span className="live-value" data-testid="drive-heading">{heading === null ? '—' : `${t(`drive.points.${cardinal(heading)}`)} ${Math.round(heading)}°`}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('drive.altitude')}</span>
          <span className="live-value">{altitude === null ? '—' : f.altitude(altitude)}</span>
        </div>
        <div className="live-tile">
          <span className="live-label">{t('drive.climb')}</span>
          <span className="live-value">{f.altitude(stats.ascentM)}</span>
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>{t('drive.safety')}</p>
      <LiveShareCard />
      <div className="row wrap">
        <PocketButton />
        <Link className="btn" to="/orientation/maps">
          {t('tracks.rec.map')}
        </Link>
      </div>
      {naming && <FinishDialog initialName={track.name} points={track.segments.flat().length} onClose={() => setNaming(false)} />}
    </div>
  );
}

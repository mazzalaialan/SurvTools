import { recordingLocation } from '@/core/geo/locationBackend';
import { gpsErrorText } from '@/core/geo/gpsText';
import { gpsSignal } from '@/core/geo/signal';
import type { GeoError } from '@/core/geo/useGeolocation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Circle, ClipboardList, Gauge, Map as MapIcon, Moon, Pause, Play, Square, TriangleAlert, Undo2 } from 'lucide-react';
import { usePocket } from '@/core/power/pocket';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useSettings } from '@/core/settings/settings';
import { formatDistance, type UnitSystem } from '@/core/units/units';
import type { WorkoutKind } from '@/core/model/types';
import { ACTIVITIES, ACTIVITY_KINDS } from '@/modules/training/activities';
import { useKmVoice } from '@/modules/training/kmVoice';
import { useBodyWeight, useTrainingFormat } from '@/modules/training/format';
import { Dialog } from '@/ui/Dialog';
import { RecordingEcoregion } from '@/modules/ecoregions/EcoregionViews';
import { RecordingGeology } from '@/modules/layers/GeologyViews';
import { MAX_ACCURACY_M } from './record';
import { elapsedS, useRecorder } from './recorder';
import { useStartDialog } from './StartRecording';

/** "0:42", "12:05" o "1:03:20". */
export function formatDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Abre «¿Qué vas a grabar?» (ver StartRecording.tsx): ahí se elige la actividad o el vehículo y recién entonces empieza. */
export function useStartRecording() {
  return () => {
    useStartDialog.getState().set(true);
    return Promise.resolve();
  };
}

/** Recorrido grabado como [lon, lat] para el mapa. */
export function useRecordedLines(): [number, number][][] | null {
  const segments = useRecorder((s) => s.track?.segments);
  return useMemo(() => (segments ? segments.map((s) => s.map(([lat, lon]) => [lon, lat] as [number, number])) : null), [segments]);
}

/** Grabar, pausar o seguir grabando, desde el mapa. */
export function RecordButton() {
  const { t } = useTranslation();
  const status = useRecorder((s) => s.status);
  const pause = useRecorder((s) => s.pause);
  const resume = useRecorder((s) => s.resume);
  const start = useStartRecording();
  const label = status === 'idle' ? t('tracks.rec.start') : status === 'recording' ? t('tracks.rec.pause') : t('tracks.rec.resume');
  return (
    <button
      className={`icon-btn maps-camera-btn rec-btn rec-${status}`}
      type="button"
      aria-pressed={status === 'recording'}
      onClick={() => void (status === 'idle' ? start() : status === 'recording' ? pause() : resume())}
      aria-label={label}
      title={label}
    >
      {status === 'recording' ? <Pause size={20} /> : <Circle size={20} fill="currentColor" />}
    </button>
  );
}

export function PocketButton({ labeled = false }: { labeled?: boolean }) {
  const { t } = useTranslation();
  const set = usePocket((s) => s.set);
  return (
    <button className={`icon-btn${labeled ? ' rec-act' : ''}`} type="button" onClick={() => set(true)} aria-label={t('pocket.on')} title={t('pocket.on')}>
      <Moon size={20} />
      {labeled && <span className="rec-lbl">{t('tracks.rec.pocketShort')}</span>}
    </button>
  );
}

/** La pantalla negra: lo grabado en letra tenue y dos toques para volver. */
export function PocketScreen() {
  const { t, i18n } = useTranslation();
  const { on, set } = usePocket();
  const units = useSettings((s) => s.settings.units);
  const { status, track, elapsedMs, since } = useRecorder();
  const lastTap = useRef(0);
  const exitRef = useRef<HTMLButtonElement>(null);
  const [, tick] = useState(0);
  useWakeLock(on);
  // Al abrirse, el foco va al botón de salir (con teclado o lector de pantalla se puede volver).
  // Al salir, el foco vuelve al botón que lo abrió (si no, se pierde al principio de la página).
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!on) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    exitRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    };
  }, [on]);
  useEffect(() => {
    if (!on) return;
    // Lo de abajo deja de dibujarse; el tiempo se actualiza cada medio minuto.
    document.documentElement.toggleAttribute('data-pocket', true);
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      clearInterval(id);
      document.documentElement.toggleAttribute('data-pocket', false);
    };
  }, [on]);
  // Al bloquear la app se sale: al volver se ve la pantalla donde estabas.
  useEffect(() => () => set(false), [set]);
  if (!on) return null;
  return (
    <div
      className="pocket"
      role="dialog"
      aria-modal="true"
      aria-label={t('pocket.title')}
      data-testid="pocket"
      onPointerDown={() => {
        const now = Date.now();
        if (now - lastTap.current < 450) set(false);
        lastTap.current = now;
      }}
      onKeyDown={(e) => e.key === 'Escape' && set(false)}
      tabIndex={-1}
    >
      {status !== 'idle' && track && (
        <p>
          {status === 'recording' ? t('tracks.rec.recording') : t('tracks.rec.paused')} · {formatDistance(track.distanceM, units, i18n.language)} ·{' '}
          {formatDuration(elapsedS({ elapsedMs, since }))}
        </p>
      )}
      {status === 'recording' && <p>{t('pocket.dontLock')}</p>}
      <p>{t('pocket.exit')}</p>
      <button ref={exitRef} className="pocket-exit" type="button" onClick={() => set(false)}>
        {t('pocket.exitButton')}
      </button>
    </div>
  );
}

/**
 * Barra de la grabación, arriba en toda la app mientras se graba o está en
 * pausa: lo recorrido, pausar o seguir, volver al origen y terminar.
 */
export function RecordingBar() {
  const { t, i18n } = useTranslation();
  const { pathname, search } = useLocation();
  const units = useSettings((s) => s.settings.units);
  const { status, track, error, elapsedMs, since, accuracy, lastFixAt, pause, resume } = useRecorder();
  const [, tick] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  /** Nombre que se está poniendo al terminar (null: sin el diálogo). */
  const [naming, setNaming] = useState<string | null>(null);
  useWakeLock(status === 'recording');
  // Voz al cerrar cada kilómetro, en cualquier pantalla (no solo en «en vivo»).
  useKmVoice();
  // El reloj avanza solo mientras graba.
  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 15_000);
    return () => clearTimeout(id);
  }, [notice]);

  if (status === 'idle' || !track) {
    return notice ? (
      <p className="rec-notice" role="status">
        {notice}
      </p>
    ) : null;
  }

  const points = track.segments.flat().length;
  const onLive = pathname === '/training/live';
  const summaryTo = `/orientation/tracks/${track.id}`;
  const onMap = pathname === '/orientation/maps';
  const onSummary = pathname === summaryTo;
  // Atajos al mapa con el recorrido en vivo y al resumen del recorrido (la ficha del track), desde cualquier pantalla.
  const shortcuts = (
    <>
      {!onMap && (
        <Link className="icon-btn rec-act" to="/orientation/maps" aria-label={t('tracks.rec.map')} title={t('tracks.rec.map')} data-testid="rec-map">
          <MapIcon size={20} />
          <span className="rec-lbl">{t('tracks.rec.mapShort')}</span>
        </Link>
      )}
      {!onSummary && (
        <Link className="icon-btn rec-act" to={summaryTo} aria-label={t('tracks.rec.summary')} title={t('tracks.rec.summary')} data-testid="rec-summary">
          <ClipboardList size={20} />
          <span className="rec-lbl">{t('tracks.rec.summaryShort')}</span>
        </Link>
      )}
    </>
  );
  const backTo = `/orientation/tracks/${track.id}/follow`;
  const goingBack = pathname === backTo && search.includes('back');
  return (
    <section className={`rec-bar rec-${status}`} aria-label={t('tracks.rec.bar')} data-testid="rec-bar">
      <span className="rec-dot" aria-hidden />
      <span className="rec-info">
        <strong>{status === 'recording' ? t('tracks.rec.recording') : t('tracks.rec.paused')}</strong>
        {/* El aviso del GPS va a la derecha de «Grabando», donde hay lugar; los datos pasan a la línea de abajo. */}
        {status === 'recording' && <GpsHint error={error} accuracy={accuracy} lastFixAt={lastFixAt} points={points} units={units} lang={i18n.language} />}
        <span className="rec-stats" data-testid="rec-stats">
          {formatDistance(track.distanceM, units, i18n.language)} · {formatDuration(elapsedS({ elapsedMs, since }))}
        </span>
        <RecordingEcoregion />
        <RecordingGeology />
      </span>
      <span className="rec-actions">
        {status === 'recording' ? (
          <button className="icon-btn rec-act" type="button" onClick={() => void pause()} aria-label={t('tracks.rec.pause')} title={t('tracks.rec.pause')}>
            <Pause size={20} />
            <span className="rec-lbl">{t('tracks.rec.pauseShort')}</span>
          </button>
        ) : (
          <button className="icon-btn rec-act" type="button" onClick={resume} aria-label={t('tracks.rec.resume')} title={t('tracks.rec.resume')}>
            <Play size={20} />
            <span className="rec-lbl">{t('tracks.rec.resumeShort')}</span>
          </button>
        )}
        {points > 1 && !goingBack && (
          <Link className="icon-btn rec-act" to={`${backTo}?back=${points}`} aria-label={t('tracks.rec.back')} title={t('tracks.rec.back')}>
            <Undo2 size={20} />
            <span className="rec-lbl">{t('tracks.rec.backShort')}</span>
          </Link>
        )}
        {shortcuts}
        {!onLive && (
          <Link className="icon-btn rec-act" to="/training/live" aria-label={t('training.live.open')} title={t('training.live.open')} data-testid="rec-live">
            <Gauge size={20} />
            <span className="rec-lbl">{t('tracks.rec.liveShort')}</span>
          </Link>
        )}
        <PocketButton labeled />
        <button className="icon-btn rec-act rec-finish" type="button" onClick={() => setNaming(track.name)} aria-label={t('tracks.rec.finish')} title={t('tracks.rec.finish')}>
          <Square size={18} fill="currentColor" />
          <span className="rec-lbl">{t('tracks.rec.finishShort')}</span>
        </button>
      </span>
      <RecWarning />
      {naming !== null && <FinishDialog initialName={naming} points={points} onClose={() => setNaming(null)} />}
    </section>
  );
}

/**
 * Estado del GPS en una frase corta y con qué hacer: buscando, regular, débil o sin señal (se nota por el silencio: el GPS que deja de dar posiciones
 * no avisa). Con buena señal no dice nada, salvo que todavía no se movió.
 */
function GpsHint({ error, accuracy, lastFixAt, points, units, lang }: { error: GeoError | null; accuracy: number | null; lastFixAt: number | null; points: number; units: UnitSystem; lang: string }) {
  const { t } = useTranslation();
  if (error) return <span className="rec-hint rec-error">{gpsErrorText(t, error)}</span>;
  const signal = gpsSignal({ accuracy, lastFixAt, now: Date.now() }, MAX_ACCURACY_M);
  const dist = (m: number) => formatDistance(m, units, lang);
  if (signal === 'searching') return <span className="rec-hint">{t('gps.searching')}</span>;
  if (signal === 'lost')
    return (
      <span className="rec-hint rec-error" data-testid="rec-gps">
        {t('tracks.rec.lostGps', { time: formatDuration(Math.round((Date.now() - (lastFixAt ?? Date.now())) / 1000)) })}
      </span>
    );
  if (signal === 'weak')
    // Con tanto error los puntos no se toman: que se vea por qué no avanza.
    return (
      <span className="rec-hint rec-error" data-testid="rec-gps">
        {t('tracks.rec.weakGps', { accuracy: dist(accuracy ?? 0), max: dist(MAX_ACCURACY_M) })}
      </span>
    );
  if (signal === 'fair') return <span className="rec-hint" data-testid="rec-gps-fair">{t('tracks.rec.fairGps', { accuracy: dist(accuracy ?? 0) })}</span>;
  return points < 2 ? <span className="rec-hint">{t('tracks.rec.waitingMove')}</span> : null;
}

/** Aviso de que con el celular bloqueado el navegador no da la posición; si hubo un corte, pregunta qué hacer con el tramo. */
export function RecWarning() {
  const { t, i18n } = useTranslation();
  const { status, warned, gapS, gapFrom, gapTo, gapJoined } = useRecorder();
  const hhmm = (ms: number | null) => (ms === null ? '' : new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms)));
  // Con la grabación en segundo plano de la app nativa el celular bloqueado no corta nada: el aviso solo corresponde en el navegador.
  if (status !== 'recording' || (gapS === null && (warned || recordingLocation().background))) return null;
  return (
    <p className="rec-warn" role="alert" data-testid="rec-warn">
      {/* El navegador no da la posición con el celular bloqueado: se avisa al empezar y, si pasó, al volver. */}
      <TriangleAlert size={16} aria-hidden className="rec-warn-icon" />
      {/* Un corte corto se unió solo con una recta; uno largo quedó como hueco: ya no se pregunta, se avisa qué se hizo. */}
      <span>
        {gapS !== null
          ? t(gapJoined ? 'tracks.rec.gapJoined' : 'tracks.rec.gapKept', { time: formatDuration(gapS), from: hhmm(gapFrom), to: hhmm(gapTo) })
          : t('tracks.rec.screenOff')}
      </span>
      <button
        className="btn rec-warn-ok"
        type="button"
        onClick={() => useRecorder.setState(gapS !== null ? { warned: true, gapS: null, gapFrom: null, gapTo: null, gapJoined: null } : { warned: true })}
      >
        {t('tracks.rec.understood')}
      </button>
    </p>
  );
}

/**
 * Al terminar, lo grabado vale a la vez como recorrido (Tracks) y como sesión de
 * Entrenamiento: se pide lo que falte para las dos cosas (nombre, actividad, mochila
 * y, si no hay ficha médica con peso, el peso para las calorías). Sin nada grabado se descarta.
 */
export function FinishDialog({ initialName, points, onClose }: { initialName: string; points: number; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useTrainingFormat();
  const navigate = useNavigate();
  const finish = useRecorder((s) => s.finish);
  const recorded = useRecorder((s) => s.track?.activity);
  const recordedPack = useRecorder((s) => s.track?.activityPackKg);
  // En modo «Conducir» solo se pide el nombre: no hay actividad, mochila ni peso (no es un entrenamiento).
  const driving = useRecorder((s) => !!s.track?.vehicle);
  const bodyKg = useBodyWeight();
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<WorkoutKind>(recorded ?? 'walk');
  const [pack, setPack] = useState(recordedPack ? String(recordedPack) : '');
  const [weight, setWeight] = useState('');
  const nothing = points < 2;
  const packKg = Number(pack.replace(',', '.'));
  const weightKg = Number(weight.replace(',', '.'));
  async function stop() {
    onClose();
    const id = await finish(name, nothing || driving ? undefined : { kind, packKg: kind === 'trek' && packKg > 0 ? packKg : null, weightKg: !bodyKg && weightKg >= 20 && weightKg <= 400 ? weightKg : null });
    const workoutId = useRecorder.getState().lastWorkoutId;
    if (workoutId) navigate(`/training/workouts/${workoutId}`);
    else if (id) navigate(`/orientation/tracks/${id}`);
  }
  return (
    <Dialog
      title={t(nothing ? 'tracks.rec.discardTitle' : 'tracks.rec.saveTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            {t('tracks.rec.keepRecording')}
          </button>
          {/* Sin nada que guardar, terminar es descartar: el botón lo dice. */}
          <button className={`btn ${nothing ? 'btn-danger-outline' : 'btn-primary'}`} type="submit" form="rec-save" data-testid={nothing ? 'rec-discard' : 'rec-save-btn'}>
            {t(nothing ? 'tracks.rec.discard' : 'common.save')}
          </button>
        </>
      }
    >
      <form
        id="rec-save"
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void stop();
        }}
      >
        {nothing ? (
          <p className="error" role="alert">
            {t('tracks.rec.nothingYet')}
          </p>
        ) : driving ? (
          <>
            <div className="field">
              <label htmlFor="rec-name">{t('tracks.name')}</label>
              <input id="rec-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
            </div>
            <p className="hint" style={{ margin: 0 }}>{t('drive.savesTrack')}</p>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="rec-name">{t('tracks.name')}</label>
              <input id="rec-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
            </div>
            <div className="field">
              <label htmlFor="rec-kind">{t('tracks.rec.activity')}</label>
              <select id="rec-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as WorkoutKind)}>
                {ACTIVITY_KINDS.filter((k) => ACTIVITIES[k].gps).map((k) => (
                  <option key={k} value={k}>
                    {f.kindName(k)}
                  </option>
                ))}
              </select>
            </div>
            {kind === 'trek' && (
              <div className="field">
                <label htmlFor="rec-pack">{t('tracks.rec.pack')}</label>
                <input id="rec-pack" className="input" inputMode="decimal" value={pack} onChange={(e) => setPack(e.target.value)} placeholder="0" />
              </div>
            )}
            {!bodyKg && (
              <div className="field">
                <label htmlFor="rec-weight">{t('tracks.rec.weight')}</label>
                <input id="rec-weight" className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
                <p className="hint">{t('tracks.rec.weightHint')}</p>
              </div>
            )}
            <p className="hint" style={{ margin: 0 }}>{t('tracks.rec.savesBoth')}</p>
          </>
        )}
      </form>
    </Dialog>
  );
}

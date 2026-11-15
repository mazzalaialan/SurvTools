import { create } from 'zustand';
import type { GeoError } from '@/core/geo/useGeolocation';
import { newEntity } from '@/core/model/entity';
import type { Id, Track, VehicleKind, WorkoutKind } from '@/core/model/types';
import { isUnlocked } from '@/core/security/session';
import { useMedical } from '@/modules/firstAid/medicalStore';
import { workoutFromRecording } from '@/modules/training/store';
import { useTraining } from '@/modules/training/store';
import type { IntervalPlan } from '@/modules/training/intervals';
import { analyzeRecording } from '@/modules/training/stats';
import { trackStats, type TrackPoint } from './gpx';
import { driveSummary } from './drive';
import { addLocked, clearLocked, newRecKey, prepareLocked, readLocked } from './lockedBuffer';
import { addPoint, closeGap, dropOpenGap, finishedTrack, MAX_ACCURACY_M, openGap, SAVER_STEP_M, shouldAdd } from './record';
import { useSettings } from '@/core/settings/settings';
import { useTracks } from './store';

/**
 * Grabación del recorrido propio. Sigue andando al cambiar de pantalla (mapa,
 * seguir un track, lo que sea) y se guarda cifrada a medida que avanza: si la
 * app se cierra o se bloquea, al volver la grabación aparece en pausa.
 */

export type RecStatus = 'idle' | 'recording' | 'paused';

/** Cada cuánto se guarda lo grabado (y siempre al pausar o ir a segundo plano). */
const SAVE_EVERY_MS = 20_000;

/** Lo que se pide al terminar para que lo grabado valga como recorrido y como sesión de Entrenamiento. */
export interface FinishOptions {
  kind?: WorkoutKind;
  packKg?: number | null;
  /** Peso de quien entrena, si no hay ficha médica con peso (solo para las calorías de esta sesión). */
  weightKg?: number | null;
}

interface RecorderState {
  status: RecStatus;
  /** El track que se está grabando (igual al guardado, con los puntos que llegaron después). */
  track: Track | null;
  /** Tiempo grabado antes del tramo actual. */
  elapsedMs: number;
  /** Cuándo arrancó el tramo actual (grabando). */
  since: number | null;
  error: GeoError | null;
  /** Ya leyó el aviso de que con el celular bloqueado no se graba. */
  warned: boolean;
  /** Segundos que estuvo con la pantalla apagada (sin grabar), para avisarlo al volver. */
  gapS: number | null;
  /** Desde y hasta cuándo (ms) fue ese corte. */
  gapFrom: number | null;
  gapTo: number | null;
  /** Qué se hizo con ese corte: siempre se une con una recta (que suma su distancia y se dibuja en otro color). Los tracks viejos pueden haber quedado con hueco. */
  gapJoined: boolean | null;
  /** Precisión de la última posición del GPS (para mostrar por qué todavía no graba). */
  accuracy: number | null;
  /** Última posición del GPS con su velocidad, rumbo y altura (solo en modo «Conducir»: el GPS da la velocidad de ahora mejor que los puntos guardados). */
  fix: { speedMs: number | null; heading: number | null; altitude: number | null; at: number } | null;
  /** Empieza a grabar; con `kind` es una sesión de Entrenamiento (al terminar crea la actividad). */
  start: (name: string, opts?: { kind?: WorkoutKind; packKg?: number | null; intervals?: IntervalPlan | null; vehicle?: VehicleKind }) => Promise<void>;
  /** La actividad que creó la última grabación terminada (para abrirla al terminar). */
  lastWorkoutId: Id | null;
  pause: () => Promise<void>;
  resume: () => void;
  /** Termina y guarda (con ese nombre, si se da); devuelve el track, o null si no llegó a grabar nada. Con `kind` queda también como sesión de Entrenamiento. */
  finish: (name?: string, opts?: FinishOptions) => Promise<Id | null>;
  /** Elige (o cambia) la actividad de lo que se está grabando: sigue siendo un recorrido, y además una sesión de Entrenamiento. */
  setActivity: (kind: WorkoutKind | null, packKg?: number | null) => void;
  /** Marca una vuelta (botón de la pantalla en vivo): guarda el tiempo y la distancia acumulados. */
  lap: () => void;
}

const IDLE = { status: 'idle', track: null, elapsedMs: 0, since: null, error: null, warned: false, gapS: null, gapFrom: null, gapTo: null, gapJoined: null, accuracy: null, fix: null, lastWorkoutId: null } as const;

/** Más que esto con la pantalla apagada, se avisa que no se grabó. */
const GAP_NOTICE_MS = 20_000;
let hiddenAt: number | null = null;

let watchId: number | null = null;

// Batería baja (20 % o menos y sin cargar): se toman menos puntos. Con el tema de ahorro, siempre.
let batteryLow = false;
let batteryWatched = false;
function watchBattery() {
  if (batteryWatched) return;
  batteryWatched = true;
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, f: () => void) => void }> };
  void nav.getBattery?.().then((b) => {
    const update = () => {
      batteryLow = !b.charging && b.level <= 0.2;
    };
    update();
    b.addEventListener('levelchange', update);
    b.addEventListener('chargingchange', update);
  }).catch(() => undefined);
}
function lowPower(): boolean {
  return batteryLow || useSettings.getState().settings.theme === 'saver';
}
let lastSaved = 0;

export function elapsedS(s: Pick<RecorderState, 'elapsedMs' | 'since'>, now = Date.now()): number {
  return Math.round((s.elapsedMs + (s.since !== null ? now - s.since : 0)) / 1000);
}

async function persist() {
  const s = useRecorder.getState();
  if (!s.track || !isUnlocked()) return;
  lastSaved = Date.now();
  await useTracks.getState().saveTrack({ ...s.track, durationS: elapsedS(s) });
}

function onPosition(p: GeolocationPosition) {
  const s = useRecorder.getState();
  if (s.status !== 'recording' || !s.track) return;
  const fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
  if (s.error || s.accuracy !== fix.accuracy) useRecorder.setState({ error: null, accuracy: fix.accuracy });
  // Conduciendo: la velocidad y el rumbo salen del GPS en cada posición (aunque no se guarde el punto), para mostrarlos de ahora.
  if (s.track.vehicle && fix.accuracy <= MAX_ACCURACY_M) {
    const speedMs = p.coords.speed !== null && Number.isFinite(p.coords.speed) ? Math.max(0, p.coords.speed) : null;
    const heading = p.coords.heading !== null && Number.isFinite(p.coords.heading) ? p.coords.heading : null;
    useRecorder.setState({ fix: { speedMs, heading, altitude: p.coords.altitude ?? null, at: p.timestamp } });
  }
  const segments = s.track.segments;
  if (!shouldAdd(segments[segments.length - 1]?.at(-1), fix, lowPower() ? SAVER_STEP_M : undefined)) return;
  // Con la hora (segundos): de ahí salen el tiempo en movimiento, el ritmo y los parciales del Entrenamiento.
  const point: TrackPoint = [fix.lat, fix.lon, p.coords.altitude ?? null, Math.round(p.timestamp / 1000)];
  const next = addPoint(segments, point);
  // Si venía un corte (pantalla apagada), este primer punto cierra su recta: queda en el mismo tramo y suma su distancia.
  const gaps = closeGap(s.track.gaps, point);
  useRecorder.setState({ track: { ...s.track, segments: next, ...trackStats(next), ...(gaps ? { gaps } : {}) } });
  // Bloqueada no se puede cifrar con la bóveda: va cifrado con la clave de la grabación.
  if (!isUnlocked()) {
    if (s.track.recKey) addLocked(s.track.id, s.track.recKey, point);
  } else if (Date.now() - lastSaved >= SAVE_EVERY_MS) void persist();
}

function startWatch() {
  stopWatch();
  watchBattery();
  if (!('geolocation' in navigator)) {
    useRecorder.setState({ error: 'unsupported' });
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    onPosition,
    (e) => useRecorder.setState({ error: e.code === e.PERMISSION_DENIED ? 'denied' : e.code === e.TIMEOUT ? 'timeout' : 'unavailable' }),
    // Sin posiciones guardadas: al seguir tras una pausa, la última sería la de donde se pausó.
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
}

function stopWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export const useRecorder = create<RecorderState>((set, get) => ({
  ...IDLE,

  async start(name, opts) {
    if (get().status !== 'idle') return;
    const track = newEntity<Track>({
      name,
      desc: '',
      source: '',
      link: null,
      segments: [[]],
      waypoints: [],
      distanceM: 0,
      ascentM: 0,
      descentM: 0,
      minEle: null,
      maxEle: null,
      notes: '',
      recorded: true,
      recording: true,
      durationS: 0,
      ...(opts?.kind ? { activity: opts.kind, activityPackKg: opts.packKg ?? null, intervals: opts.intervals ?? null } : {}),
      // Conducir y entrenar son excluyentes: un recorrido en vehículo nunca es una sesión de Entrenamiento.
      ...(!opts?.kind && opts?.vehicle ? { vehicle: opts.vehicle } : {}),
      recKey: await newRecKey(),
    });
    prepareLocked(track.recKey!);
    set({ status: 'recording', track, elapsedMs: 0, since: Date.now(), error: null, warned: false, gapS: null, accuracy: null, lastWorkoutId: null });
    await persist();
    startWatch();
  },

  async pause() {
    const s = get();
    if (s.status !== 'recording') return;
    stopWatch();
    // Un corte que todavía no tiene el punto de después no se une con lo que se camine en pausa.
    const gaps = s.track ? dropOpenGap(s.track.gaps) : undefined;
    set({ status: 'paused', elapsedMs: s.elapsedMs + (s.since !== null ? Date.now() - s.since : 0), since: null, error: null, ...(s.track && gaps ? { track: { ...s.track, gaps } } : {}) });
    await persist();
  },

  resume() {
    const s = get();
    if (s.status !== 'paused' || !s.track) return;
    // Lo que se camine en pausa no se une con una recta: arranca un tramo nuevo.
    const segments = s.track.segments.at(-1)?.length ? [...s.track.segments, []] : s.track.segments;
    set({ status: 'recording', track: { ...s.track, segments }, since: Date.now() });
    startWatch();
  },

  setActivity(kind, packKg) {
    const s = get();
    if (!s.track) return;
    const { activity: _a, activityPackKg: _p, ...rest } = s.track;
    set({ track: { ...rest, ...(kind ? { activity: kind, activityPackKg: packKg ?? s.track.activityPackKg ?? null } : {}) } });
    void persist();
  },

  lap() {
    const s = get();
    if (s.status !== 'recording' || !s.track) return;
    const mark = { elapsedS: elapsedS(s), distanceM: Math.round(s.track.distanceM) };
    set({ track: { ...s.track, laps: [...(s.track.laps ?? []), mark] } });
    void persist();
  },

  async finish(name, opts) {
    const s = get();
    if (!s.track) return null;
    stopWatch();
    const finalName = name?.trim() || s.track.name;
    // Las estadísticas de la actividad, con todos los puntos y sus horas (antes de simplificar el recorrido).
    const raw = s.track.segments.map((seg) => (seg.length > 1 ? seg : []));
    const activity = opts?.kind ?? s.track.activity;
    const stats = activity ? analyzeRecording(raw) : null;
    const drive = s.track.vehicle ? driveSummary(raw, elapsedS(s)) : undefined;
    const finished = finishedTrack({ ...s.track, name: finalName, ...(activity ? { activity, activityPackKg: opts?.packKg ?? s.track.activityPackKg ?? null } : {}), ...(drive ? { drive } : {}) }, elapsedS(s));
    // La clave de la grabación ya no hace falta.
    const done = finished && { ...finished, recKey: undefined };
    const kind = activity;
    const packKg = opts?.packKg ?? s.track.activityPackKg ?? null;
    set({ ...IDLE });
    void clearLocked();
    if (!done) {
      await useTracks.getState().deleteTrack(s.track.id);
      return null;
    }
    await useTracks.getState().saveTrack(done);
    if (kind && stats) {
      const me = [...useMedical.getState().profiles.values()].find((p) => p.isMe);
      const workout = { ...workoutFromRecording(kind, finalName, done, stats, Date.parse(s.track.createdAt), me?.weightKg ?? opts?.weightKg ?? null, packKg), intervals: s.track.intervals ?? null, laps: s.track.laps ?? [] };
      const saved = await useTraining.getState().saveWorkout(workout);
      set({ lastWorkoutId: workout.id });
      // El clima se agrega después, sin demorar: si hay internet, queda en la actividad.
      const start = done.segments.flat()[0];
      if (start) {
        void import('@/modules/training/weather').then(async ({ weatherAt }) => {
          const weather = await weatherAt(start[0], start[1]);
          const current = useTraining.getState().workouts.get(saved.id);
          if (weather && current) await useTraining.getState().saveWorkout({ ...current, weather });
        });
      }
    }
    return done.id;
  },
}));

// Al ir a segundo plano se guarda enseguida (el navegador puede cerrar la app sin avisar).
// Con la pantalla apagada el navegador no da posiciones: al volver se avisa cuánto no se grabó.
document.addEventListener('visibilitychange', () => {
  const recording = useRecorder.getState().status === 'recording';
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    if (recording) void persist();
    return;
  }
  if (recording && hiddenAt !== null && Date.now() - hiddenAt >= GAP_NOTICE_MS) {
    const s = useRecorder.getState();
    const gapS = Math.round((Date.now() - hiddenAt) / 1000);
    // Un corte siempre se une con una recta, en el mismo tramo: suma su distancia (menos de lo que se caminó, pero no se descarta) y se
    // dibuja en otro color. Se anota desde dónde sale; el punto de llegada lo cierra el primer fix que llegue (ver `onPosition`).
    const gap = { from: hiddenAt, to: Date.now() };
    const last = s.track?.segments.at(-1)?.at(-1);
    useRecorder.setState({
      gapS,
      gapFrom: gap.from,
      gapTo: gap.to,
      gapJoined: true,
      ...(s.track ? { track: { ...s.track, gaps: openGap(s.track.gaps, gap, last) } } : {}),
    });
  }
  hiddenAt = null;
});

// Con la app bloqueada se sigue grabando: los puntos van cifrados con la clave
// de la grabación (lockedBuffer) y, al desbloquear, pasan al track.
useTracks.subscribe((s, prev) => {
  if (!s.loaded || prev.loaded) return;
  if (useRecorder.getState().status !== 'idle') {
    // Siguió andando: los puntos ya están en memoria.
    void persist().then(clearLocked);
    return;
  }
  const open = [...s.tracks.values()].find((t) => t.recording);
  if (open) void restore(open);
});

/** La grabación que quedó abierta (la app se cerró) vuelve en pausa, con lo grabado mientras estaba bloqueada. */
async function restore(open: Track) {
  const locked = await readLocked(open.id, open.recKey);
  let segments = open.segments.length ? open.segments : [[]];
  for (const p of locked) segments = addPoint(segments, p);
  const recKey = open.recKey ?? (await newRecKey());
  prepareLocked(recKey);
  if (useRecorder.getState().status !== 'idle') return;
  useRecorder.setState({
    status: 'paused',
    track: { ...open, segments, ...trackStats(segments), recKey },
    elapsedMs: (open.durationS ?? 0) * 1000,
    since: null,
    error: null,
  });
  await persist();
  await clearLocked();
}

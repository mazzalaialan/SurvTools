import { create } from 'zustand';
import { recordingLocation, type Fix } from '@/core/geo/locationBackend';
import type { GeoError } from '@/core/geo/useGeolocation';
import { i18n } from '@/core/i18n/i18n';
import { newEntity } from '@/core/model/entity';
import type { Id, Track, VehicleKind, WorkoutKind } from '@/core/model/types';
import { isUnlocked } from '@/core/security/session';
import { useMedical } from '@/modules/firstAid/medicalStore';
import { workoutFromRecording } from '@/modules/training/store';
import { useTraining } from '@/modules/training/store';
import type { IntervalPlan } from '@/modules/training/intervals';
import { analyzeRecording } from '@/modules/training/stats';
import { trackStats, type TrackPoint } from './gpx';
import { bridgeAlongTracks, isSignalJump, withBridge, type CandidateLine } from './bridge';
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
  /** Cuándo (ms) llegó la última posición del GPS: sin posiciones nuevas por un rato, la señal se da por perdida. */
  lastFixAt: number | null;
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

const IDLE = { status: 'idle', track: null, elapsedMs: 0, since: null, error: null, warned: false, gapS: null, gapFrom: null, gapTo: null, gapJoined: null, accuracy: null, lastFixAt: null, fix: null, lastWorkoutId: null } as const;

/** Más que esto con la pantalla apagada, se avisa que no se grabó. */
const GAP_NOTICE_MS = 20_000;
let hiddenAt: number | null = null;

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

function onPosition(p: Fix) {
  const s = useRecorder.getState();
  if (s.status !== 'recording' || !s.track) return;
  const fix = { lat: p.lat, lon: p.lon, accuracy: p.accuracy };
  useRecorder.setState({ error: null, accuracy: fix.accuracy, lastFixAt: Date.now() });
  // Conduciendo: la velocidad y el rumbo salen del GPS en cada posición (aunque no se guarde el punto), para mostrarlos de ahora.
  if (s.track.vehicle && fix.accuracy <= MAX_ACCURACY_M) {
    const speedMs = p.speed !== null ? Math.max(0, p.speed) : null;
    useRecorder.setState({ fix: { speedMs, heading: p.heading, altitude: p.altitude, at: p.timestamp } });
  }
  const segments = s.track.segments;
  if (!shouldAdd(segments[segments.length - 1]?.at(-1), fix, lowPower() ? SAVER_STEP_M : undefined)) return;
  // Con la hora (segundos): de ahí salen el tiempo en movimiento, el ritmo y los parciales del Entrenamiento.
  const point: TrackPoint = [fix.lat, fix.lon, p.altitude, Math.round(p.timestamp / 1000)];
  // Si venía un corte (pantalla apagada), este primer punto cierra su recta: queda en el mismo tramo y suma su distancia.
  let gaps = closeGap(s.track.gaps, point);
  const last = segments[segments.length - 1]?.at(-1);
  const closing = gaps !== s.track.gaps;
  let next = segments;
  // Si el corte (pantalla apagada o GPS tapado) termina sobre un track cargado, se sigue ese track por el camino más corto en vez de la recta.
  const bridge = last && (closing || isSignalJump(last, point)) ? bridgeAlongTracks(loadedLines(), { lat: last[0], lon: last[1] }, fix) : null;
  if (bridge && last) {
    for (const mid of bridge.points) next = addPoint(next, mid);
    gaps = withBridge(gaps, closing, last, point, bridge);
  }
  next = addPoint(next, point);
  useRecorder.setState({ track: { ...s.track, segments: next, ...trackStats(next), ...(gaps ? { gaps } : {}) } });
  // Bloqueada no se puede cifrar con la bóveda: va cifrado con la clave de la grabación.
  if (!isUnlocked()) {
    if (s.track.recKey) addLocked(s.track.id, s.track.recKey, point);
  } else if (Date.now() - lastSaved >= SAVE_EVERY_MS) void persist();
}

/** Los tracks cargados (no grabados con la app) con sus tramos, para cerrar un corte siguiendo uno. */
function loadedLines(): CandidateLine[] {
  const out: CandidateLine[] = [];
  for (const t of useTracks.getState().tracks.values()) {
    if (t.recording || t.recorded || t.deletedAt) continue;
    for (const seg of t.segments) if (seg.length > 1) out.push({ id: t.id, name: t.name, line: seg });
  }
  return out;
}

function startWatch() {
  stopWatch();
  watchBattery();
  // La implementación es la del navegador (se corta con la pantalla apagada) o, en la app nativa, el servicio en primer plano.
  void recordingLocation().start(onPosition, (code) => useRecorder.setState({ error: code }), {
    title: i18n.t('recorder.bgTitle'),
    message: i18n.t('recorder.bgMessage'),
  });
}

/** Deja de grabar y espera a que lo último pendiente (el registro nativo) llegue a la grabación. */
function stopWatch(): Promise<void> {
  return recordingLocation().stop();
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
    set({ status: 'recording', track, elapsedMs: 0, since: Date.now(), error: null, warned: false, gapS: null, accuracy: null, lastFixAt: null, lastWorkoutId: null });
    await persist();
    startWatch();
  },

  async pause() {
    if (get().status !== 'recording') return;
    await stopWatch();
    const s = get();
    if (s.status !== 'recording') return;
    // Un corte que todavía no tiene el punto de después no se une con lo que se camine en pausa.
    const gaps = s.track ? dropOpenGap(s.track.gaps) : undefined;
    // Queda anotado que la pausa fue a propósito: al reabrir la app (nativa) no se reanuda sola.
    set({ status: 'paused', elapsedMs: s.elapsedMs + (s.since !== null ? Date.now() - s.since : 0), since: null, error: null, ...(s.track ? { track: { ...s.track, ...(gaps ? { gaps } : {}), recPaused: true } } : {}) });
    await persist();
  },

  resume() {
    const s = get();
    if (s.status !== 'paused' || !s.track) return;
    // Lo que se camine en pausa no se une con una recta: arranca un tramo nuevo.
    const segments = s.track.segments.at(-1)?.length ? [...s.track.segments, []] : s.track.segments;
    set({ status: 'recording', track: { ...s.track, segments, recPaused: false }, since: Date.now() });
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
    if (!get().track) return null;
    await stopWatch();
    const s = get();
    if (!s.track) return null;
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
    // La altura del terreno (mínima, máxima, desnivel y perfil) se lee del mapa después, sin demorar: si hay datos de elevación, queda en el recorrido.
    void import('./terrainElevation').then((m) => m.ensureTerrain(done.id)).catch(() => undefined);
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
  if (recording && !recordingLocation().background && hiddenAt !== null && Date.now() - hiddenAt >= GAP_NOTICE_MS) {
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

/**
 * La grabación que quedó abierta (la app se cerró) vuelve con lo grabado mientras estaba bloqueada o cerrada. En la app nativa, donde el servicio en
 * primer plano sigue grabando con la app cerrada, SE REANUDA SOLA (salvo que la persona la haya pausado a propósito: `recPaused`); en el navegador, que
 * no graba con la app cerrada, vuelve en pausa.
 */
async function restore(open: Track) {
  const locked = await readLocked(open.id, open.recKey);
  let segments = open.segments.length ? open.segments : [[]];
  for (const p of locked) segments = addPoint(segments, p);
  // App nativa: lo que se grabó con el servicio en primer plano y no llegó a la grabación (la app se cerró) queda en el registro nativo.
  const recovered: Fix[] = [];
  await recordingLocation().recover?.((f) => recovered.push(f));
  for (const f of recovered) {
    const point: TrackPoint = [f.lat, f.lon, f.altitude, Math.round(f.timestamp / 1000)];
    if (shouldAdd(segments.at(-1)?.at(-1), { lat: f.lat, lon: f.lon, accuracy: f.accuracy })) segments = addPoint(segments, point);
  }
  const recKey = open.recKey ?? (await newRecKey());
  prepareLocked(recKey);
  if (useRecorder.getState().status !== 'idle') return;
  if (recordingLocation().background && !open.recPaused) {
    // El servicio estuvo grabando todo el rato que la app estuvo cerrada: ese tiempo cuenta, y el recorrido sigue en el mismo tramo.
    const now = Date.now();
    const closedMs = recovered.length ? Math.max(0, now - Date.parse(open.updatedAt)) : 0;
    useRecorder.setState({
      status: 'recording',
      track: { ...open, segments, ...trackStats(segments), recKey, recPaused: false },
      elapsedMs: (open.durationS ?? 0) * 1000 + closedMs,
      since: now,
      error: null,
      accuracy: null,
      lastFixAt: null,
    });
    await persist();
    await clearLocked();
    startWatch();
    return;
  }
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

import { newEntity } from '@/core/model/entity';
import type { Track, Workout, WorkoutKind } from '@/core/model/types';
import { GpxError, parseGpx, simplify, type ParsedTrack, type TrackPoint } from '@/modules/tracks/gpx';
import { analyzeRecording } from './stats';
import { workoutFromRecording } from './store';

/**
 * Importar y exportar actividades en GPX y TCX, los formatos que entienden
 * Strava, Garmin, Wikiloc y casi cualquier app o reloj. Sin DOMParser (como
 * gpx.ts), para que ande igual en el navegador y en las pruebas.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const iso = (s: number) => new Date(s * 1000).toISOString();

export interface ExportActivity {
  name: string;
  kind: WorkoutKind | 'driving';
  /** Inicio (ISO), por si los puntos no traen hora. */
  startedAt: string;
  segments: TrackPoint[][];
}

/** GPX 1.1 con tracks, altura y hora de cada punto cuando la hay. */
export function toGpx(a: ExportActivity): string {
  const segs = a.segments
    .filter((s) => s.length > 0)
    .map((s) => {
      const pts = s
        .map((p) => `<trkpt lat="${p[0]}" lon="${p[1]}">${p[2] !== null ? `<ele>${Math.round(p[2] * 10) / 10}</ele>` : ''}${p[3] !== undefined ? `<time>${iso(p[3])}</time>` : ''}</trkpt>`)
        .join('\n      ');
      return `    <trkseg>\n      ${pts}\n    </trkseg>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="VikArg" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(a.name)}</name><time>${esc(a.startedAt)}</time></metadata>
  <trk>
    <name>${esc(a.name)}</name>
    <type>${a.kind}</type>
${segs}
  </trk>
</gpx>
`;
}

/** El deporte que entiende TCX (Garmin): Running, Biking u Other. */
function tcxSport(kind: string): 'Running' | 'Biking' | 'Other' {
  if (kind === 'run' || kind === 'treadmill') return 'Running';
  if (['roadBike', 'mtb', 'gravel', 'cityBike', 'ebike'].includes(kind)) return 'Biking';
  return 'Other';
}

/** TCX con un solo "lap" que contiene toda la actividad (un track por tramo). */
export function toTcx(a: ExportActivity, totals: { totalS: number; distanceM: number; calories: number }): string {
  const tracks = a.segments
    .filter((s) => s.length > 0)
    .map((s) => {
      const pts = s
        .map(
          (p, i) =>
            `<Trackpoint><Time>${iso(p[3] ?? Math.round(Date.parse(a.startedAt) / 1000) + i)}</Time><Position><LatitudeDegrees>${p[0]}</LatitudeDegrees><LongitudeDegrees>${p[1]}</LongitudeDegrees></Position>${p[2] !== null ? `<AltitudeMeters>${Math.round(p[2] * 10) / 10}</AltitudeMeters>` : ''}</Trackpoint>`,
        )
        .join('\n          ');
      return `        <Track>\n          ${pts}\n        </Track>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="${tcxSport(a.kind)}">
      <Id>${esc(a.startedAt)}</Id>
      <Lap StartTime="${esc(a.startedAt)}">
        <TotalTimeSeconds>${Math.round(totals.totalS)}</TotalTimeSeconds>
        <DistanceMeters>${Math.round(totals.distanceM)}</DistanceMeters>
        <Calories>${Math.round(totals.calories)}</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
${tracks}
      </Lap>
      <Notes>${esc(a.name)}</Notes>
    </Activity>
  </Activities>
</TrainingCenterDatabase>
`;
}

export interface ImportedActivity extends ParsedTrack {
  /** Lo que dice el archivo; null si no lo dice (el usuario elige). */
  kind: WorkoutKind | null;
  /** Inicio (ISO) del primer punto con hora, o null. */
  startedAt: string | null;
}

/** Deporte de TCX o tipo de GPX (Strava y otras lo ponen en <type>) a una actividad de VikArg. */
export function kindFromSport(s: string | null | undefined): WorkoutKind | null {
  const v = (s ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (!v) return null;
  if (v === 'running' || v === 'run' || v === 'trailrun' || v === 'virtualrun') return 'run';
  if (v === 'walking' || v === 'walk') return 'walk';
  if (v === 'hiking' || v === 'hike' || v === 'trekking') return 'trek';
  if (v === 'mountainbiking' || v === 'mountainbikeride' || v === 'mtb') return 'mtb';
  if (v === 'gravelride' || v === 'gravel') return 'gravel';
  if (v === 'ebikeride' || v === 'ebike') return 'ebike';
  if (v === 'biking' || v === 'cycling' || v === 'ride' || v === 'road' || v === 'roadbike') return 'roadBike';
  if (v === 'kayaking' || v === 'kayak') return 'kayak';
  if (v === 'canoeing' || v === 'canoe') return 'canoe';
  if (v === 'rowing' || v === 'row') return 'rowboat';
  if (v === 'standuppaddling' || v === 'sup') return 'sup';
  if (v === 'rafting') return 'rafting';
  if (v === 'elliptical') return 'elliptical';
  return null;
}

function tcxPoints(track: string): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const m of track.matchAll(/<Trackpoint\b[\s\S]*?<\/Trackpoint>/gi)) {
    const body = m[0];
    const lat = Number(body.match(/<LatitudeDegrees>\s*([-\d.eE+]+)\s*</i)?.[1]);
    const lon = Number(body.match(/<LongitudeDegrees>\s*([-\d.eE+]+)\s*</i)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue; // sin posición (cinta, reloj sin GPS): no es del recorrido
    const eleText = body.match(/<AltitudeMeters>\s*([-\d.eE+]+)\s*</i)?.[1];
    const ele = eleText !== undefined && Number.isFinite(Number(eleText)) ? Number(eleText) : null;
    const ms = Date.parse(body.match(/<Time>\s*([^<\s]+)\s*</i)?.[1] ?? '');
    out.push(Number.isFinite(ms) ? [lat, lon, ele, Math.round(ms / 1000)] : [lat, lon, ele]);
  }
  return out;
}

/** Lee un archivo GPX o TCX. Si no es ninguno de los dos o no tiene recorrido, tira GpxError. */
export function parseActivityFile(text: string, fileName = ''): ImportedActivity {
  let parsed: ParsedTrack;
  let kind: WorkoutKind | null;
  if (/<TrainingCenterDatabase\b/i.test(text)) {
    const segments = [...text.matchAll(/<Track\b[\s\S]*?<\/Track>/gi)].map((t) => tcxPoints(t[0])).filter((s) => s.length > 1);
    if (segments.length === 0) throw new GpxError('empty');
    const notes = text.match(/<Notes>([\s\S]*?)<\/Notes>/i)?.[1]?.trim();
    parsed = { name: notes || fileName.replace(/\.tcx$/i, '') || 'Actividad', desc: '', link: null, segments, waypoints: [] };
    kind = kindFromSport(text.match(/<Activity\b[^>]*\bSport=["']([^"']+)["']/i)?.[1]);
  } else {
    parsed = parseGpx(text, fileName.replace(/\.tcx$/i, ''));
    if (parsed.segments.length === 0) throw new GpxError('empty');
    kind = kindFromSport(text.match(/<trk\b[\s\S]*?<type>([^<]*)<\/type>/i)?.[1]);
  }
  const firstTime = parsed.segments.flat().find((p) => p[3] !== undefined)?.[3];
  return { ...parsed, kind, startedAt: firstTime !== undefined ? iso(firstTime) : null };
}

/**
 * Arma el recorrido y la actividad de un archivo importado: las estadísticas salen
 * de todos los puntos originales (con su hora, si la traen) y el recorrido se guarda simplificado.
 */
export function activityFromFile(file: ImportedActivity, kind: WorkoutKind, weightKg: number | null): { track: Track; workout: Workout } {
  const stats = analyzeRecording(file.segments);
  const track = newEntity<Track>({
    name: file.name,
    desc: file.desc,
    source: 'Importado',
    link: file.link,
    segments: file.segments.map((s) => simplify(s)),
    waypoints: file.waypoints,
    distanceM: stats.distanceM,
    ascentM: stats.ascentM,
    descentM: stats.descentM,
    minEle: stats.minEle,
    maxEle: stats.maxEle,
    notes: '',
    durationS: stats.totalS || undefined,
  } as Partial<Track> as Track);
  const startedAtMs = file.startedAt ? Date.parse(file.startedAt) : Date.now();
  const workout = workoutFromRecording(kind, file.name, track, stats, startedAtMs, weightKg, null);
  return { track, workout };
}

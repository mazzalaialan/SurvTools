import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Circle, Footprints, PencilLine, Plus, Upload } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { useRecorder } from '@/modules/tracks/recorder';
import { Segmented } from '@/ui/Segmented';
import { ACTIVITIES, GROUPS, kindsOf, type ActivityGroup, type ActivityKind } from './activities';
import { useTrainingFormat, useBodyWeight } from './format';
import { byWeek, goalProgress, recordsOf, totalsOf, weekStart } from './history';
import { GpxError } from '@/modules/tracks/gpx';
import { useTracks } from '@/modules/tracks/store';
import { trackFromRoute } from '@/modules/waypoints/plan';
import { useWaypoints } from '@/modules/waypoints/store';
import { gunzipSync } from 'fflate';
import type { Track, Workout } from '@/core/model/types';
import { FitError, isFit, parseFitActivity } from './fit';
import { activityFromFit } from './fitActivity';
import { activityFromFile, parseActivityFile } from './interchange';
import { Countdown } from './Countdown';
import { IntervalPicker } from './IntervalPicker';
import type { IntervalPlan } from './intervals';
import { useTraining } from './store';

/** Sesiones de entrenamiento: empezar una, ver la semana y el historial. */
export function TrainingPage() {
  const { t } = useTranslation();
  const f = useTrainingFormat();
  const workouts = useTraining((s) => s.workouts);
  const status = useRecorder((s) => s.status);
  const start = useRecorder((s) => s.start);
  const lastKind = useSettings((s) => s.settings.trainingKind);
  const update = useSettings((s) => s.update);
  const weight = useBodyWeight();
  const [group, setGroup] = useState<ActivityGroup>(ACTIVITIES[lastKind]?.group ?? 'foot');
  const [kind, setKind] = useState<ActivityKind>(lastKind);
  const [pack, setPack] = useState('');
  const [plan, setPlan] = useState<IntervalPlan | null>(null);
  // Seguir una ruta planificada o un track durante la sesión: "r:<id>" o "t:<id>".
  const [follow, setFollow] = useState('');
  const routes = useWaypoints((s) => s.routes);
  const allTracks = useTracks((s) => s.tracks);
  const list = [...workouts.values()];
  const weeks = byWeek(list);
  const records = recordsOf(list);
  const def = ACTIVITIES[kind];
  const currentWeek = weekStart(new Date());
  const thisWeek = weeks.find((w) => w.start === currentWeek);
  const week = thisWeek?.totals ?? totalsOf([]);

  const goals = useSettings((s) => s.settings.trainingGoals);
  const gearOn = useSettings((s) => s.settings.trainingGear);
  const progress = goalProgress(week, goals);
  const navigate = useNavigate();
  const saveTrack = useTracks((s) => s.saveTrack);
  const saveWorkout = useTraining((s) => s.saveWorkout);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  /** Importa una actividad de un GPX o TCX (Strava, Garmin, Wikiloc…): si el archivo dice el deporte se usa ese, si no, el elegido arriba. */
  async function importFile(f: File) {
    setImportError(null);
    try {
      let bytes: Uint8Array = new Uint8Array(await f.arrayBuffer());
      // Strava y Garmin Connect exportan comprimido (.gz): se descomprime primero.
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
      let created: { track: Track | null; workout: Workout };
      if (isFit(bytes)) {
        // Archivo de un reloj (FIT): trae pulso, vueltas y calorías además del recorrido.
        const fit = parseFitActivity(bytes);
        created = activityFromFit(fit, fit.kind ?? kind, f.name.replace(/\.fit(\.gz)?$/i, '') || t(`training.kind.${fit.kind ?? kind}`), weight);
      } else {
        const parsed = parseActivityFile(new TextDecoder().decode(bytes), f.name);
        created = activityFromFile(parsed, parsed.kind ?? kind, weight);
      }
      if (created.track) await saveTrack(created.track);
      await saveWorkout(created.workout);
      navigate(`/training/workouts/${created.workout.id}`);
    } catch (err) {
      if (err instanceof FitError) setImportError(t(`training.importError.fit-${err.code}`));
      else if (err instanceof GpxError) setImportError(t(`training.importError.${err.code}`));
      else throw err;
    }
  }

  const countdownS = useSettings((s) => s.settings.trainingCountdownS);
  const [counting, setCounting] = useState(false);
  const beginSession = () => void start(t(`training.kind.${kind}`), { kind, packKg: kind === 'trek' && Number(pack) > 0 ? Number(pack) : null, intervals: plan }).then(() => void goAfterStart());

  /** Después de empezar: a la pantalla en vivo, o al seguimiento de la ruta o el track elegido (con los datos de la sesión arriba). */
  async function goAfterStart() {
    if (follow.startsWith('r:')) {
      const route = routes.get(follow.slice(2));
      if (route) {
        const track = trackFromRoute(route, [...allTracks.values()].find((x) => x.routeId === route.id));
        await saveTrack(track);
        navigate(`/orientation/tracks/${track.id}/follow`);
        return;
      }
    }
    if (follow.startsWith('t:')) {
      navigate(`/orientation/tracks/${follow.slice(2)}/follow`);
      return;
    }
    navigate('/training/live');
  }

  const pickGroup = (g: ActivityGroup) => {
    setGroup(g);
    setKind(kindsOf(g)[0]!);
  };

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.workouts.title')}</h1>
      {counting && (
        <Countdown
          seconds={countdownS}
          onCancel={() => setCounting(false)}
          onDone={() => {
            setCounting(false);
            beginSession();
          }}
        />
      )}

      <section className="card stack" aria-labelledby="train-start">
        <h2 id="train-start" className="section-title" style={{ margin: 0 }}>
          {t('training.startTitle')}
        </h2>
        <Segmented<ActivityGroup>
          label={t('training.group.label')}
          value={group}
          options={GROUPS.map((g) => ({ value: g, label: t(`training.group.${g}`) }))}
          onChange={pickGroup}
        />
        <div className="field">
          <label htmlFor="train-kind">{t('training.activity')}</label>
          <select id="train-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
            {kindsOf(group).map((k) => (
              <option key={k} value={k}>
                {t(`training.kind.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <p className="hint" style={{ margin: 0 }}>{t(`training.kindHint.${kind}`)}</p>
        {def.gps && kind === 'trek' && (
          <div className="field">
            <label htmlFor="train-pack">{t('training.pack')}</label>
            <input id="train-pack" className="input" type="number" inputMode="decimal" min={0} max={80} step={0.5} value={pack} onChange={(e) => setPack(e.target.value)} placeholder="0" />
          </div>
        )}
        {def.gps && <IntervalPicker onChange={setPlan} />}
        {def.gps && (
          <div className="field">
            <label htmlFor="train-follow">{t('training.followLabel')}</label>
            <select id="train-follow" className="select" value={follow} onChange={(e) => setFollow(e.target.value)}>
              <option value="">{t('training.followNone')}</option>
              {[...routes.values()].filter((r) => r.line).sort((a, b) => a.name.localeCompare(b.name)).map((r) => (
                <option key={r.id} value={`r:${r.id}`}>
                  {t('training.followRoute', { name: r.name })}
                </option>
              ))}
              {[...allTracks.values()].filter((x) => !x.routeId && !x.recording).sort((a, b) => a.name.localeCompare(b.name)).map((x) => (
                <option key={x.id} value={`t:${x.id}`}>
                  {t('training.followTrack', { name: x.name })}
                </option>
              ))}
            </select>
          </div>
        )}
        {!weight && (
          <p className="hint" style={{ margin: 0 }} data-testid="train-no-weight">
            {t('training.noWeight')} <Link to="/first-aid/medical">{t('training.noWeightLink')}</Link>
          </p>
        )}
        <div className="row-end wrap row-fill row-fill-first">
          {def.gps ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled={status !== 'idle'}
              onClick={() => {
                void update({ trainingKind: kind });
                // Con cuenta regresiva elegida, primero cuenta y después empieza a grabar.
                if (countdownS > 0) setCounting(true);
                else beginSession();
              }}
            >
              <Circle size={18} fill="currentColor" /> {t('training.startRecording')}
            </button>
          ) : (
            <Link className="btn btn-primary" to={`/training/workouts/new?kind=${kind}`} onClick={() => void update({ trainingKind: kind })}>
              <PencilLine size={18} /> {t('training.loadSession')}
            </Link>
          )}
          {def.gps && (
            <Link className="btn" to={`/training/workouts/new?kind=${kind}`}>
              <Plus size={18} /> {t('training.loadManual')}
            </Link>
          )}
        </div>
        <div className="row wrap row-fill">
          <button className="btn" type="button" data-testid="import-activity" onClick={() => fileInput.current?.click()}>
            <Upload size={18} /> {t('training.importFile')}
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            data-testid="import-activity-file"
            accept=".gpx,.tcx,.fit,.gz,application/gpx+xml,application/xml,text/xml,application/octet-stream"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
        {importError && <p className="error" role="alert" style={{ margin: 0 }}>{importError}</p>}
        {status !== 'idle' && <p className="hint" style={{ margin: 0 }}>{t('training.alreadyRecording')}</p>}
        <p className="hint" style={{ margin: 0 }}>{t('training.estimate')}</p>
      </section>

      <section className="card stack" aria-labelledby="train-week" data-testid="train-week">
        <h2 id="train-week" className="section-title" style={{ margin: 0 }}>
          {t('training.thisWeek')}
        </h2>
        <dl className="track-stats">
          <div>
            <dt>{t('training.sessions')}</dt>
            <dd>{week.count}</dd>
          </div>
          <div>
            <dt>{t('training.distance')}</dt>
            <dd>{f.distance(week.distanceM)}</dd>
          </div>
          <div>
            <dt>{t('training.time')}</dt>
            <dd>{f.clock(week.totalS)}</dd>
          </div>
          <div>
            <dt>{t('training.ascent')}</dt>
            <dd>{f.altitude(week.ascentM)}</dd>
          </div>
          <div>
            <dt>{t('training.calories')}</dt>
            <dd>{f.kcal(week.calories)}</dd>
          </div>
        </dl>
        {progress.length > 0 && (
          <ul className="stack" style={{ margin: 0, padding: 0, listStyle: 'none' }} data-testid="train-goals">
            {progress.map((g) => (
              <li key={g.key}>
                <span className="hint">
                  {t(`training.goals.${g.key}`)}: {Math.round(g.done * (g.key === 'distanceKm' ? 10 : 1)) / (g.key === 'distanceKm' ? 10 : 1)} / {g.target}
                  {g.reached ? ` · ${t('training.goals.reached')}` : ''}
                </span>
                <span className="progress">
                  <span className="progress-bar" data-done={g.reached} style={{ width: `${Math.round(g.fraction * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary>{t('training.goals.title')}</summary>
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>{t('training.goals.hint')}</p>
            <div className="field">
              <label htmlFor="train-countdown">{t('countdown.setting')}</label>
              <select id="train-countdown" className="select" value={countdownS} onChange={(e) => void update({ trainingCountdownS: Number(e.target.value) })} data-testid="countdown-setting">
                {[0, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? t('countdown.none') : `${n} s`}
                  </option>
                ))}
              </select>
            </div>
            <label className="row">
              <input type="checkbox" checked={gearOn} onChange={(e) => void update({ trainingGear: e.target.checked })} data-testid="gear-toggle" /> {t('gear.toggle')}
            </label>
            {(['distanceKm', 'minutes', 'sessions'] as const).map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`goal-${k}`}>{t(`training.goals.${k}`)}</label>
                <input
                  id={`goal-${k}`}
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={goals[k] || ''}
                  onChange={(e) => void update({ trainingGoals: { ...goals, [k]: Math.max(0, Number(e.target.value) || 0) } })}
                />
              </div>
            ))}
          </div>
        </details>
        {(records.longestM || records.mostAscentM) && (
          <p className="hint" style={{ margin: 0 }} data-testid="train-records">
            {t('training.records')}: {records.longestM ? `${t('training.recordLongest')} ${f.distance(records.longestM)}` : ''}
            {records.longestM && records.mostAscentM ? ' · ' : ''}
            {records.mostAscentM ? `${t('training.recordAscent')} ${f.altitude(records.mostAscentM)}` : ''}
          </p>
        )}
        <div className="row-end wrap">
          <Link className="btn" to="/training/outings">
            <Footprints size={18} /> {t('modules.outings.title')}
          </Link>
        </div>
      </section>

      <section className="stack" aria-labelledby="train-history">
        <h2 id="train-history" className="section-title" style={{ margin: 0 }}>
          {t('training.history')}
        </h2>
        {weeks.length === 0 ? (
          <p className="empty">{t('training.empty')}</p>
        ) : (
          weeks.map((w) => (
            <div key={w.start} className="card stack" data-testid="train-week-block">
              <p className="hint" style={{ margin: 0 }}>
                {t('training.weekOf', { date: new Date(`${w.start}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) })} · {f.distance(w.totals.distanceM)} · {f.clock(w.totals.totalS)} · {f.kcal(w.totals.calories)}
              </p>
              <ul className="list list-flat">
                {w.workouts.map((x) => (
                  <li key={x.id}>
                    <Link className="list-row" to={`/training/workouts/${x.id}`} data-testid="train-row">
                      <span className="list-main">
                        <span className="list-title">{x.name}</span>
                        <span className="list-sub">
                          {f.kindName(x.kind)} · {f.date(x.startedAt)}
                        </span>
                        <span className="list-sub">
                          {f.distance(x.distanceM)} · {f.clock(x.totalS)} · {f.effort(x.kind, x)} · {f.kcal(x.calories)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

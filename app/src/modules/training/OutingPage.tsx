import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Map as MapIcon, Pencil, Trash2 } from 'lucide-react';
import { ElevationProfile } from '@/modules/tracks/ElevationProfile';
import { useTracks } from '@/modules/tracks/store';
import { useTrainingFormat } from './format';
import { inOuting, totalsOf } from './history';
import { outingTrack } from './outings';
import { OutingPlanSection } from './OutingPlanSection';
import { ShareSection } from './ShareSection';
import { useTraining } from './store';
import { confirmAction } from '@/ui/confirm';

/** Una salida: totales, mapa y perfil de altura de todas sus actividades. */
export function OutingPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const outing = useTraining((s) => (id ? s.outings.get(id) : undefined));
  const loaded = useTraining((s) => s.loaded);
  if (!outing) {
    return (
      <p className="empty">
        {loaded ? t('outings.notFound') : t('training.loading')} <Link to="/training/outings">{t('common.back')}</Link>
      </p>
    );
  }
  return <OutingDetail key={outing.id} id={outing.id} />;
}

function OutingDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const f = useTrainingFormat();
  const navigate = useNavigate();
  const outing = useTraining((s) => s.outings.get(id))!;
  const workouts = useTraining((s) => s.workouts);
  const saveOuting = useTraining((s) => s.saveOuting);
  const saveWorkout = useTraining((s) => s.saveWorkout);
  const removeOuting = useTraining((s) => s.deleteOuting);
  const tracks = useTracks((s) => s.tracks);
  const [name, setName] = useState<string | null>(null);
  const all = [...workouts.values()];
  const list = inOuting(all, id);
  const loose = all.filter((w) => !w.outingId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const totals = totalsOf(list);
  const track = useMemo(() => outingTrack(list, tracks), [list, tracks]);
  const trackIds = list.flatMap((w) => (w.trackId ? [w.trackId] : []));
  const commit = () => {
    if (name !== null && name.trim() && name.trim() !== outing.name) void saveOuting({ ...outing, name: name.trim() });
    setName(null);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>
          {name === null ? outing.name : <input className="input" aria-label={t('outings.nameLabel')} value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} autoFocus />}
        </h1>
        {name === null && (
          <button className="icon-btn" type="button" onClick={() => setName(outing.name)} aria-label={t('training.rename')} title={t('training.rename')}>
            <Pencil size={18} />
          </button>
        )}
      </div>

      <section className="card stack" aria-label={t('outings.totals')}>
        <dl className="track-stats" data-testid="outing-stats">
          <div>
            <dt>{t('outings.activitiesLabel')}</dt>
            <dd data-testid="o-count">{totals.count}</dd>
          </div>
          <div>
            <dt>{t('training.distance')}</dt>
            <dd data-testid="o-distance">{f.distance(totals.distanceM)}</dd>
          </div>
          <div>
            <dt>{t('training.time')}</dt>
            <dd>{f.clock(totals.totalS)}</dd>
          </div>
          <div>
            <dt>{t('training.ascent')}</dt>
            <dd data-testid="o-ascent">{f.altitude(totals.ascentM)}</dd>
          </div>
          <div>
            <dt>{t('training.descent')}</dt>
            <dd>{f.altitude(totals.descentM)}</dd>
          </div>
          <div>
            <dt>{t('training.calories')}</dt>
            <dd>{f.kcal(totals.calories)}</dd>
          </div>
          {totals.maxEle !== null && (
            <div>
              <dt>{t('training.maxEle')}</dt>
              <dd>{f.altitude(totals.maxEle)}</dd>
            </div>
          )}
        </dl>
        {track && <ElevationProfile track={track} />}
        {trackIds.length > 0 && (
          <div className="row-end wrap">
            <Link className="btn" to={`/orientation/maps?tracks=${trackIds.join(',')}`} data-testid="o-map">
              <MapIcon size={18} /> {t('training.onMap')}
            </Link>
          </div>
        )}
      </section>

      <section className="card stack" aria-labelledby="o-list">
        <h2 id="o-list" className="section-title" style={{ margin: 0 }}>
          {t('outings.activitiesTitle')}
        </h2>
        {list.length === 0 ? (
          <p className="empty">{t('outings.noActivities')}</p>
        ) : (
          <ul className="list list-flat" data-testid="o-activities">
            {list.map((w) => (
              <li key={w.id}>
                <Link className="list-row" to={`/training/workouts/${w.id}`}>
                  <span className="list-main">
                    <span className="list-title">{w.name}</span>
                    <span className="list-sub">
                      {f.kindName(w.kind)} · {f.dateTime(w.startedAt)} · {f.distance(w.distanceM)} · {f.clock(w.totalS)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {loose.length > 0 && (
          <div className="field">
            <label htmlFor="o-add">{t('outings.add')}</label>
            <select
              id="o-add"
              className="select"
              value=""
              onChange={(e) => {
                const w = workouts.get(e.target.value);
                if (w) void saveWorkout({ ...w, outingId: id });
              }}
            >
              <option value="">{t('outings.addChoose')}</option>
              {loose.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {f.date(w.startedAt)}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <OutingPlanSection outing={outing} />

      <ShareSection outing={outing} />

      <section className="card stack">
        <div className="field">
          <label htmlFor="o-notes">{t('training.notes')}</label>
          <textarea id="o-notes" className="input" rows={3} defaultValue={outing.notes} onBlur={(e) => e.target.value !== outing.notes && void saveOuting({ ...outing, notes: e.target.value })} placeholder={t('outings.notesHint')} />
        </div>
        <div className="row-end">
          <button
            className="btn btn-danger-outline"
            type="button"
            onClick={async () => {
              if (!(await confirmAction(t('outings.confirmDelete', { name: outing.name })))) return;
              await removeOuting(id);
              navigate('/training/outings', { replace: true });
            }}
          >
            <Trash2 size={18} /> {t('common.delete')}
          </button>
        </div>
      </section>
    </div>
  );
}

import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, Check, ExternalLink, Footprints, Map as MapIcon, MapPinPlus, Pencil, Printer, Route as RouteIcon, Trash2, X } from 'lucide-react';
import { distanceMeters } from '@/core/geo/geo';
import { newEntity } from '@/core/model/entity';
import type { Track, Waypoint } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude, formatDistance } from '@/core/units/units';
import { toGpx } from '@/modules/training/interchange';
import { toKml } from '@/modules/waypoints/kml';
import { ExportPathButton } from './ExportPathButton';
import { routeFromTrack } from '@/modules/waypoints/importRoute';
import { trackSheetInput } from '@/modules/maps/print/data';
import { PrintTopoDialog } from '@/modules/maps/print/PrintTopoDialog';
import { useWaypoints } from '@/modules/waypoints/store';
import { TrackEcoregions } from '@/modules/ecoregions/EcoregionViews';
import { TrackGeology } from '@/modules/layers/GeologyViews';
import { ElevationProfile } from './ElevationProfile';
import { HeightWarning } from './HeightWarning';
import { useRecorder } from './recorder';
import { formatDuration } from './Recording';
import { useTraining } from '@/modules/training/store';
import { DriveStats } from './DriveStats';
import { useTracks } from './store';
import { confirmAction } from '@/ui/confirm';

export function TrackPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const track = useTracks((s) => (id ? s.tracks.get(id) : undefined));
  const loaded = useTracks((s) => s.loaded);
  if (!loaded) return null;
  if (!track) {
    return (
      <p className="empty">
        {t('tracks.notFound')} <Link to="/orientation/tracks">{t('common.back')}</Link>
      </p>
    );
  }
  return <TrackDetail key={track.id} track={track} />;
}

function TrackDetail({ track }: { track: Track }) {
  const { t, i18n } = useTranslation();
  // Si este recorrido también es una sesión de Entrenamiento, se llega a ella desde acá.
  const workoutId = useTraining((s) => [...s.workouts.values()].find((w) => w.trackId === track.id && !w.deletedAt)?.id ?? null);
  const navigate = useNavigate();
  const units = useSettings((s) => s.settings.units);
  const { saveTrack, deleteTrack } = useTracks();
  const saveWaypoint = useWaypoints((s) => s.saveWaypoint);
  const saveRoute = useWaypoints((s) => s.saveRoute);
  const myWaypoints = useWaypoints((s) => s.waypoints);
  const routes = useWaypoints((s) => s.routes);
  const deleteWaypoint = useWaypoints((s) => s.deleteWaypoint);
  /** Lo que se está editando (nombre o notas) y su borrador; null si no se edita nada. */
  const [editing, setEditing] = useState<{ field: 'name' | 'notes'; value: string } | null>(null);
  const [printing, setPrinting] = useState(false);
  const dist = (m: number) => formatDistance(m, units, i18n.language);
  const alt = (m: number) => formatAltitude(m, units, i18n.language);

  /** Mis waypoints en el mismo lugar que un punto del track (a menos de 20 m). */
  const sameSpot = (w: { lat: number; lon: number }) => [...myWaypoints.values()].filter((m) => distanceMeters(m, w) < 20);
  /** La copia de este punto: mismo lugar y mismo nombre (o la nota de copiado), para no borrar un waypoint propio que esté ahí. */
  const copyOf = (w: Track['waypoints'][number]) =>
    sameSpot(w).find((m) => m.name.trim() === w.name.trim() || m.notes === t('tracks.copiedFrom', { name: track.name }));

  async function copyToMine(w: Track['waypoints'][number]) {
    await saveWaypoint(
      newEntity<Waypoint>({ name: w.name, lat: w.lat, lon: w.lon, alt: w.ele, icon: 'pin', notes: t('tracks.copiedFrom', { name: track.name }), rainAlerts: false }),
    );
  }

  async function removeCopy(copy: Waypoint) {
    // Si lo usa alguna ruta, se avisa antes: la ruta sigue sin ese punto.
    const inRoutes = [...routes.values()].filter((r) => r.waypointIds.includes(copy.id));
    if (inRoutes.length && !(await confirmAction(t('tracks.confirmUncopy', { name: copy.name, routes: inRoutes.map((r) => r.name).join(', ') })))) return;
    await deleteWaypoint(copy.id);
  }

  async function save() {
    if (!editing) return;
    const changes = editing.field === 'name' ? { name: editing.value.trim() || track.name } : { notes: editing.value.trim() };
    // Si se está grabando, el grabador guarda su copia: que lleve el nombre nuevo.
    if (track.recording) useRecorder.setState((s) => (s.track?.id === track.id ? { track: { ...s.track, ...changes } } : {}));
    await saveTrack({ ...track, ...changes });
    setEditing(null);
  }

  /** Enter guarda (en las notas, Ctrl+Enter, porque Enter es salto de línea) y Escape cancela. */
  function onEditKey(e: KeyboardEvent, multiline: boolean) {
    if (e.key === 'Escape') setEditing(null);
    else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  }

  async function remove() {
    if (!(await confirmAction(t('tracks.confirmDelete', { name: track.name })))) return;
    await deleteTrack(track.id);
    navigate('/orientation/tracks', { replace: true });
  }

  return (
    <div className="stack">
      <div className="page-head">
        {editing?.field === 'name' ? (
          <>
            <input
              className="input track-title-input"
              aria-label={t('tracks.name')}
              value={editing.value}
              autoFocus
              onChange={(e) => setEditing({ field: 'name', value: e.target.value })}
              onKeyDown={(e) => onEditKey(e, false)}
            />
            <button className="icon-btn" type="button" onClick={() => void save()} aria-label={t('common.save')} title={t('common.save')}>
              <Check size={20} />
            </button>
            <button className="icon-btn" type="button" onClick={() => setEditing(null)} aria-label={t('common.cancel')} title={t('common.cancel')}>
              <X size={20} />
            </button>
          </>
        ) : (
          <>
            <h1 className="page-title">{track.name}</h1>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setEditing({ field: 'name', value: track.name })}
              aria-label={t('tracks.editName')}
              title={t('tracks.editName')}
            >
              <Pencil size={18} />
            </button>
          </>
        )}
      </div>

      {editing?.field === 'notes' ? (
        <div className="stack track-notes">
          <textarea
            className="input textarea"
            aria-label={t('tracks.notes')}
            value={editing.value}
            autoFocus
            onChange={(e) => setEditing({ field: 'notes', value: e.target.value })}
            onKeyDown={(e) => onEditKey(e, true)}
          />
          <div className="row-end">
            <button className="btn" type="button" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" type="button" onClick={() => void save()}>
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <div className="track-notes track-notes-view" data-testid="track-notes">
          {track.notes ? <p className="track-notes-text">{track.notes}</p> : <p className="hint track-notes-text">{t('tracks.noNotes')}</p>}
          <button
            className="icon-btn"
            type="button"
            onClick={() => setEditing({ field: 'notes', value: track.notes })}
            aria-label={t(track.notes ? 'tracks.editNotes' : 'tracks.addNotes')}
            title={t(track.notes ? 'tracks.editNotes' : 'tracks.addNotes')}
          >
            <Pencil size={16} />
          </button>
        </div>
      )}

      <section className="card stack" aria-labelledby="track-stats">
        <h2 id="track-stats" className="sr-only">{t('tracks.stats')}</h2>
        <dl className="track-stats" data-testid="track-stats">
          <div>
            <dt>{t('tracks.distance')}</dt>
            <dd>{dist(track.distanceM)}</dd>
          </div>
          <div>
            <dt>{t('tracks.ascent')}</dt>
            <dd>{alt(track.ascentM)}</dd>
          </div>
          <div>
            <dt>{t('tracks.descent')}</dt>
            <dd>{alt(track.descentM)}</dd>
          </div>
          {track.maxEle !== null && (
            <div>
              <dt>{t('tracks.maxEle')}</dt>
              <dd>{alt(track.maxEle)}</dd>
            </div>
          )}
        </dl>
        {track.drive && <DriveStats track={track} />}
        <ElevationProfile track={track} />
        <HeightWarning track={track} />
        {track.gaps && track.gaps.length > 0 && (
          <div className="stack" style={{ gap: 4 }} data-testid="track-gaps">
            <strong>{t('tracks.gapsTitle')}</strong>
            <ul className="list">
              {track.gaps.map((g) => (
                <li key={g.from} className="hint">
                  {t(g.joined ? (g.via ? 'tracks.gapItemVia' : g.lengthM !== undefined ? 'tracks.gapItemJoinedLen' : 'tracks.gapItemJoined') : 'tracks.gapItemKept', { from: new Date(g.from).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }), to: new Date(g.to).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }), length: dist(g.lengthM ?? 0), via: g.via })}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="row-end wrap">
          <button className="btn" type="button" data-testid="track-to-route" onClick={async () => {
            const route = routeFromTrack(track);
            if (!route) return;
            await saveRoute(route);
            navigate(`/orientation/routes/${route.id}`);
          }}>
            <RouteIcon size={18} /> {t('tracks.toRoute')}
          </button>
          <Link className="btn" to={`/orientation/maps?track=${track.id}`}>
            <MapIcon size={18} /> {t('tracks.onMap')}
          </Link>
          {track.segments.some((seg) => seg.length > 1) && (
            <button className="btn" type="button" data-testid="track-print-map" onClick={() => setPrinting(true)}>
              <Printer size={18} /> {t('topoPrint.button')}
            </button>
          )}
          {workoutId && (
            <Link className="btn" to={`/training/workouts/${workoutId}`} data-testid="track-workout">
              <Activity size={18} /> {t('tracks.seeWorkout')}
            </Link>
          )}
          {track.segments.flat().length > 1 && (
            <ExportPathButton
              kind="track"
              testId="track-export"
              formats={{
                name: track.name,
                gpx: () => toGpx({ name: track.name, kind: track.activity ?? (track.vehicle ? 'driving' : 'walk'), startedAt: track.createdAt, segments: track.segments }),
                kml: () => toKml(track.name, track.segments.flat().map(([lat, lon, ele]) => ({ lat, lon, ele }))),
              }}
            />
          )}
          {track.segments.flat().length > 1 && (
            <Link className="btn btn-primary" to={`/orientation/tracks/${track.id}/follow`}>
              <Footprints size={18} /> {t('tracks.follow.start')}
            </Link>
          )}
        </div>
        {track.desc && <p className="hint track-desc">{track.desc}</p>}
        {track.recording && (
          <p className="hint" style={{ margin: 0 }} role="status">
            {t('tracks.rec.inProgressHint')}
          </p>
        )}
        <p className="hint" style={{ margin: 0 }}>
          {track.recorded
            ? t('tracks.rec.recordedOn', { date: new Date(track.createdAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }), time: formatDuration(track.durationS ?? 0) })
            : t('tracks.source', { source: track.source })}
          {track.link && (
            <>
              {' · '}
              <a href={track.link} target="_blank" rel="noreferrer">
                {t('tracks.original')} <ExternalLink size={12} aria-hidden />
              </a>
            </>
          )}
        </p>
      </section>

      <TrackEcoregions segments={track.segments} />
      <TrackGeology segments={track.segments} />

      <section className="card stack" aria-labelledby="track-points">
        <h2 id="track-points" className="section-title" style={{ margin: 0 }}>
          {t('tracks.points')}
        </h2>
        <p className="hint" style={{ margin: 0 }}>{t('tracks.pointsHint')}</p>
        {track.waypoints.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t('tracks.noPoints')}</p>
        ) : (
          <ul className="list" data-testid="track-points">
            {track.waypoints.map((w, i) => {
              const copy = copyOf(w);
              // Hay un waypoint propio ahí que no es esta copia: no se copia de nuevo ni se borra desde acá.
              const taken = !copy && sameSpot(w).length > 0;
              const label = copy ? t('tracks.uncopy', { name: w.name }) : taken ? t('tracks.copied', { name: w.name }) : t('tracks.copy', { name: w.name });
              return (
                <li key={i} className="contact-row">
                  <span className="list-main">
                    <span className="list-title">{w.name}</span>
                    {(w.ele !== null || w.desc) && <span className="list-sub">{[w.ele !== null ? alt(w.ele) : '', w.desc].filter(Boolean).join(' · ')}</span>}
                  </span>
                  <span className="contact-actions">
                    <button
                      className="icon-btn"
                      type="button"
                      disabled={taken}
                      aria-pressed={!!copy}
                      onClick={() => void (copy ? removeCopy(copy) : copyToMine(w))}
                      aria-label={label}
                      title={label}
                    >
                      {copy || taken ? <Check size={18} /> : <MapPinPlus size={18} />}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!track.recording && (
        <div className="row-end">
          <button className="btn btn-danger-outline" type="button" onClick={() => void remove()}>
            <Trash2 size={18} /> {t('common.delete')}
          </button>
        </div>
      )}
      {printing && <PrintTopoDialog input={trackSheetInput(track)} onClose={() => setPrinting(false)} />}
    </div>
  );
}

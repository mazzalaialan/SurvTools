import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Circle, Footprints, Route, Search, Trash2, Upload } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { formatAltitude, formatDistance } from '@/core/units/units';
import { GpxError } from './gpx';
import { useRecorder } from './recorder';
import { formatDuration, useStartRecording } from './Recording';
import { trackFromBytes } from './importTrack';
import { useTracks } from './store';
import { confirmAction } from '@/ui/confirm';

type Kind = 'imported' | 'mine';
/** La pestaña que se estaba viendo, para volver a ella al reabrir la pantalla. */
let lastKind: Kind | null = null;
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Tracks importados de un GPX (Wikiloc u otra app) y grabados con la app: aparte de los waypoints y rutas propios.
 * Los dos tipos van en pestañas separadas: con muchos recorridos propios, al buscar un track cargado no tienen que aparecer todos.
 */
export function TracksPage() {
  const { t, i18n } = useTranslation();
  const recStatus = useRecorder((s) => s.status);
  const startRecording = useStartRecording();
  const navigate = useNavigate();
  const units = useSettings((s) => s.settings.units);
  const tracks = useTracks((s) => s.tracks);
  const saveTrack = useTracks((s) => s.saveTrack);
  const deleteTrack = useTracks((s) => s.deleteTrack);
  async function remove(id: string, name: string) {
    if ((await confirmAction(t('tracks.confirmDelete', { name })))) await deleteTrack(id);
  }
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const all = useMemo(() => [...tracks.values()].filter((x) => !x.routeId), [tracks]);
  // Cargados: por nombre. Míos (grabados): del más nuevo al más viejo.
  const groups = useMemo(
    () => ({
      imported: all.filter((x) => !x.recorded).sort((a, b) => a.name.localeCompare(b.name, i18n.language)),
      mine: all.filter((x) => x.recorded).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }),
    [all, i18n.language],
  );
  // Al abrir: la pestaña de antes; si se está grabando, la de los míos; y si solo hay de un tipo, esa.
  const [pickedKind, setKind] = useState<Kind | null>(() => (recStatus !== 'idle' ? 'mine' : lastKind));
  const both = groups.imported.length > 0 && groups.mine.length > 0;
  const kind: Kind = both ? (pickedKind ?? 'imported') : groups.mine.length > 0 ? 'mine' : 'imported';
  const [query, setQuery] = useState('');
  const inGroup = groups[kind];
  const q = plain(query.trim());
  const list = useMemo(() => (q ? inGroup.filter((x) => plain(x.name).includes(q)) : inGroup), [inGroup, q]);

  async function handleFile(f: File) {
    setError(null);
    try {
      const track = trackFromBytes(new Uint8Array(await f.arrayBuffer()), f.name);
      await saveTrack(track);
      navigate(`/orientation/tracks/${track.id}`);
    } catch (err) {
      if (!(err instanceof GpxError)) throw err;
      setError(t(`tracks.error.${err.code}`));
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.tracks.title')}</h1>
        <button className="btn btn-primary" type="button" onClick={() => file.current?.click()}>
          <Upload size={18} /> {t('tracks.import')}
        </button>
      </div>
      <p className="hint" style={{ margin: 0 }}>{t('tracks.importFormats')}</p>
      <input
        ref={file}
        type="file"
        accept=".gpx,.kml,.kmz,.tcx,.gz,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/xml,text/xml"
        hidden
        data-testid="tracks-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {recStatus === 'idle' && (
        <button className="btn" type="button" onClick={() => void startRecording()}>
          <Circle size={16} fill="currentColor" className="rec-icon" /> {t('tracks.rec.start')}
        </button>
      )}

      {both && (
        <div className="segmented" role="group" aria-label={t('tracks.tabsLabel')} data-testid="tracks-tabs">
          {(['imported', 'mine'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                lastKind = k;
                setKind(k);
                setQuery('');
              }}
              data-testid={`tracks-tab-${k}`}
            >
              {t(`tracks.tabs.${k}`, { count: groups[k].length })}
            </button>
          ))}
        </div>
      )}
      {inGroup.length > 5 && (
        <div className="input-group">
          <Search size={18} aria-hidden style={{ alignSelf: 'center' }} />
          <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('tracks.search')} aria-label={t('tracks.search')} data-testid="tracks-search" />
        </div>
      )}
      {all.length === 0 ? (
        <p className="empty">{t('tracks.empty')}</p>
      ) : list.length === 0 ? (
        <p className="empty" data-testid="tracks-nomatch">{q ? t('tracks.noMatch', { q: query.trim() }) : t('tracks.empty')}</p>
      ) : (
        <ul className="list" data-testid="tracks-list">
          {list.map((tr) => (
            <li key={tr.id} className="track-row">
              <Link className="list-row" to={`/orientation/tracks/${tr.id}`}>
                {tr.recorded ? <Route size={22} aria-hidden className="contact-icon rec-track-icon" /> : <Footprints size={22} aria-hidden className="contact-icon" />}
                <span className="list-main">
                  <span className="list-title">{tr.name}</span>
                  <span className="list-sub">
                    {[
                      tr.recording ? t('tracks.rec.inProgress') : '',
                      formatDistance(tr.distanceM, units, i18n.language),
                      tr.ascentM ? `↑ ${formatAltitude(tr.ascentM, units, i18n.language)} ↓ ${formatAltitude(tr.descentM, units, i18n.language)}` : '',
                      tr.recorded && tr.durationS ? formatDuration(tr.durationS) : '',
                      tr.waypoints.length ? t('tracks.pointCount', { count: tr.waypoints.length }) : '',
                      tr.recorded ? t('tracks.rec.mine') : tr.source,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden />
              </Link>
              {/* La que se está grabando se termina desde la barra de grabación. */}
              {!tr.recording && (
                <button className="icon-btn" type="button" onClick={() => void remove(tr.id, tr.name)} aria-label={t('tracks.delete', { name: tr.name })} title={t('tracks.delete', { name: tr.name })}>
                  <Trash2 size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{t('tracks.howTo')}</p>
    </div>
  );
}

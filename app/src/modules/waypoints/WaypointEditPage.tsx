import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Copy, Crosshair, Navigation, Trash2 } from 'lucide-react';
import { useCapability } from '@/core/capabilities/capabilities';
import { bearingDeg, distanceMeters, formatDecimal, formatDms, parseCoordinates } from '@/core/geo/geo';
import { MapPickButton } from '@/modules/maps/MapPickButton';
import { currentPosition, GeoPositionError, useGeolocation } from '@/core/geo/useGeolocation';
import { newEntity } from '@/core/model/entity';
import type { Waypoint, WaypointRole } from '@/core/model/types';
import { WAYPOINT_ROLES } from './roles';
import { useSettings } from '@/core/settings/settings';
import { altitudeForInput, altitudeToMeters, altitudeUnit, formatDistance } from '@/core/units/units';
import { parseNum } from '@/ui/numbers';
import { GpsStatus, useFormatBearing } from './components';
import { useWaypoints } from './store';
import { confirmAction } from '@/ui/confirm';
import { NearestRiver } from '@/modules/navigation/NearestRiver';

/** Datos para arrancar un waypoint nuevo desde otra pantalla (p. ej. Mi ubicación), en el estado de la navegación. */
export interface NewWaypointDraft {
  lat: number;
  lon: number;
  alt: number | null;
  notes?: string;
}

export function WaypointEditPage() {
  const { id } = useParams();
  const stored = useWaypoints((s) => (id ? s.waypoints.get(id) : undefined));
  const loaded = useWaypoints((s) => s.loaded);
  const { t } = useTranslation();

  if (!loaded) return null;
  if (id !== 'new' && !stored) {
    return (
      <p className="empty">
        {t('waypoints.notFound')} <Link to="/orientation/waypoints">{t('common.back')}</Link>
      </p>
    );
  }
  return <WaypointForm key={stored?.id ?? 'new'} stored={stored} />;
}

function WaypointForm({ stored }: { stored: Waypoint | undefined }) {
  const draft = useLocation().state as NewWaypointDraft | null;
  const [initial] = useState(
    () =>
      stored ??
      newEntity<Waypoint>({ name: '', lat: draft?.lat ?? 0, lon: draft?.lon ?? 0, alt: draft?.alt ?? null, icon: 'pin', notes: draft?.notes ?? '', rainAlerts: false }),
  );
  const isNew = !stored;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const units = useSettings((s) => s.settings.units);
  const { saveWaypoint, deleteWaypoint } = useWaypoints();
  const hasGps = useCapability('geolocation');

  const [name, setName] = useState(initial.name);
  const [coords, setCoords] = useState(stored || draft ? formatDecimal(initial) : '');
  const [alt, setAlt] = useState(altitudeForInput(initial.alt, units));
  const [notes, setNotes] = useState(initial.notes);
  const [rainAlerts, setRainAlerts] = useState(initial.rainAlerts);
  const [role, setRole] = useState<WaypointRole | ''>(initial.role ?? '');
  const [privateOn, setPrivateOn] = useState((initial.privateRadiusM ?? 0) > 0);
  const [privateRadius, setPrivateRadius] = useState(String(initial.privateRadiusM || 500));
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const parsed = parseCoordinates(coords);
  const west = t('geo.westLetter');
  const dirty = () => setSaved(false);

  async function useMyPosition() {
    setLocating(true);
    setGpsError(null);
    try {
      const here = await currentPosition();
      setCoords(formatDecimal(here));
      if (here.alt !== null) setAlt(altitudeForInput(here.alt, units));
      dirty();
    } catch (e) {
      setGpsError(t(`gps.error.${e instanceof GeoPositionError ? e.code : 'unavailable'}`));
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!parsed) return;
    const altValue = parseNum(alt);
    await saveWaypoint({
      ...initial,
      name: name.trim(),
      lat: parsed.lat,
      lon: parsed.lon,
      alt: altValue === null ? null : altitudeToMeters(altValue, units),
      notes,
      rainAlerts,
      privateRadiusM: privateOn ? Number(privateRadius) : null,
      role: role || null,
    });
    if (isNew) navigate(`/orientation/waypoints/${initial.id}`, { replace: true });
    else setSaved(true);
  }

  async function handleDelete() {
    if (!stored || !(await confirmAction(t('waypoints.confirmDelete', { name: stored.name })))) return;
    await deleteWaypoint(stored.id);
    navigate('/orientation/waypoints', { replace: true });
  }

  async function copyCoords() {
    if (!stored) return;
    await navigator.clipboard.writeText(formatDecimal(stored));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{stored ? stored.name : t('waypoints.new')}</h1>
      </div>

      {stored && hasGps && (
        <>
          <Link className="btn btn-primary btn-block" to={`/orientation/waypoints/${stored.id}/go`}>
            <Navigation size={20} /> {t('goto.button')}
          </Link>
          <NavigationCard target={stored} />
        </>
      )}

      {stored && <NearestRiver lat={stored.lat} lon={stored.lon} />}

      <form className="card stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">{t('waypoints.name')}</label>
          <input id="name" className="input" required value={name} onChange={(e) => { setName(e.target.value); dirty(); }} autoFocus={isNew} placeholder={t('waypoints.namePlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="coords">{t('waypoints.coordinates')}</label>
          <div className="input-group">
            <input
              id="coords"
              className="input"
              required
              value={coords}
              onChange={(e) => { setCoords(e.target.value); dirty(); }}
              placeholder="-34.603722, -58.381592"
              aria-invalid={coords.trim() !== '' && !parsed}
              autoComplete="off"
            />
            {hasGps && (
              <button className="btn" type="button" onClick={() => void useMyPosition()} disabled={locating} aria-label={t('waypoints.useMyPosition')} title={t('waypoints.useMyPosition')}>
                <Crosshair size={20} />
              </button>
            )}
            <MapPickButton
              initial={parsed}
              onPick={(p) => {
                setCoords(formatDecimal(p));
                dirty();
              }}
            />
          </div>
          {coords.trim() === '' ? (
            <p className="hint">{t('waypoints.coordinatesHint')}</p>
          ) : parsed ? (
            <p className="hint" data-testid="coords-preview">{formatDms(parsed, west)}</p>
          ) : (
            <p className="error">{t('waypoints.coordinatesInvalid')}</p>
          )}
          {locating && <p className="hint">{t('gps.searching')}</p>}
          {gpsError && <p className="error" role="alert">{gpsError}</p>}
        </div>
        <div className="field">
          <label htmlFor="notes">{t('waypoints.notes')}</label>
          <textarea id="notes" className="input textarea" value={notes} onChange={(e) => { setNotes(e.target.value); dirty(); }} />
        </div>
        <div className="field">
          <label htmlFor="wp-role">{t('waypoints.role.label')}</label>
          <select id="wp-role" className="select" value={role} onChange={(e) => { setRole(e.target.value as WaypointRole | ''); dirty(); }} data-testid="wp-role">
            <option value="">{t('waypoints.role.none')}</option>
            {WAYPOINT_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`waypoints.role.${r}`)}
              </option>
            ))}
          </select>
          <p className="hint">{t('waypoints.role.hint')}</p>
        </div>
        {/* Lo que casi nadie toca va plegado; se abre solo si este lugar ya tiene algo cargado ahí. */}
        <details className="more-options" open={alt.trim() !== '' || rainAlerts || privateOn} data-testid="wp-more">
          <summary>{t('waypoints.moreOptions')}</summary>
          <div className="stack" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="alt">{t('waypoints.altitude', { unit: altitudeUnit(units) })}</label>
          <input id="alt" className="input" inputMode="decimal" value={alt} onChange={(e) => { setAlt(e.target.value); dirty(); }} />
        </div>
        <fieldset className="fieldset stack">
          <legend>{t('waypoints.alerts')}</legend>
          <label className="check">
            <input type="checkbox" checked={rainAlerts} onChange={(e) => { setRainAlerts(e.target.checked); dirty(); }} />
            {t('waypoints.rainAlerts')}
          </label>
          <p className="hint" style={{ margin: 0 }}>{t('waypoints.lightningSoon')}</p>
        </fieldset>
        <fieldset className="fieldset stack">
          <legend>{t('waypoints.privacy')}</legend>
          <label className="check">
            <input type="checkbox" checked={privateOn} onChange={(e) => { setPrivateOn(e.target.checked); dirty(); }} data-testid="wp-private" />
            {t('waypoints.privateZone')}
          </label>
          {privateOn && (
            <div className="field">
              <label htmlFor="wp-private-radius">{t('waypoints.privateRadius')}</label>
              <select id="wp-private-radius" className="select" value={privateRadius} onChange={(e) => { setPrivateRadius(e.target.value); dirty(); }}>
                {[200, 500, 1000].map((m) => (
                  <option key={m} value={m}>
                    {m} m
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="hint" style={{ margin: 0 }}>{t('waypoints.privateHint')}</p>
        </fieldset>
          </div>
        </details>
        {saved &&<p className="success" role="status">{t('common.saved')}</p>}
        <div className="row-end">
          {stored && (
            <>
              <button className="btn btn-danger-outline" type="button" onClick={handleDelete}>
                <Trash2 size={18} /> {t('common.delete')}
              </button>
              <button className="btn" type="button" onClick={() => void copyCoords()}>
                <Copy size={18} /> {copied ? t('common.copied') : t('waypoints.copy')}
              </button>
            </>
          )}
          <button className="btn btn-primary" type="submit" disabled={!parsed}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Distancia y rumbo desde la posición actual hasta el punto. */
function NavigationCard({ target }: { target: Waypoint }) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.settings.units);
  const { fix, error } = useGeolocation();
  const formatBearing = useFormatBearing();

  return (
    <section className="card stack" aria-label={t('waypoints.navigation')}>
      {fix ? (
        <div className="nav-readout">
          <div>
            <span className="nav-label">{t('waypoints.distance')}</span>
            <span className="nav-value" data-testid="wp-distance">{formatDistance(distanceMeters(fix, target), units, i18n.language)}</span>
          </div>
          <div>
            <span className="nav-label">{t('waypoints.bearing')}</span>
            <span className="nav-value" data-testid="wp-bearing">{formatBearing(bearingDeg(fix, target))}</span>
          </div>
        </div>
      ) : null}
      <GpsStatus fix={fix} error={error} />
    </section>
  );
}

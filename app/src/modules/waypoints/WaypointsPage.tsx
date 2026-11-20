import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, MapPinPlus, Navigation, Plus } from 'lucide-react';
import { useCapability } from '@/core/capabilities/capabilities';
import { distanceMeters } from '@/core/geo/geo';
import { currentPosition, GeoPositionError, useGeolocation } from '@/core/geo/useGeolocation';
import { newEntity } from '@/core/model/entity';
import type { Waypoint, WaypointRole } from '@/core/model/types';
import { GpsStatus, useDistanceLabel } from './components';
import { RoutesSection } from './RoutesPage';
import { WAYPOINT_ROLES } from './roles';
import { useWaypoints } from './store';

const FRESH_FIX_MS = 10_000;

export function WaypointsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const waypoints = useWaypoints((s) => s.waypoints);
  const saveWaypoint = useWaypoints((s) => s.saveWaypoint);
  const hasGps = useCapability('geolocation');
  const { fix, error } = useGeolocation(hasGps);
  const distanceLabel = useDistanceLabel();
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<WaypointRole | null>(null);

  const rows = useMemo(() => {
    const list = [...waypoints.values()].filter((w) => !roleFilter || w.role === roleFilter);
    // Con posición, los más cercanos primero; sin posición, por nombre.
    return fix
      ? list.sort((a, b) => distanceMeters(fix, a) - distanceMeters(fix, b))
      : list.sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  }, [waypoints, fix, i18n.language, roleFilter]);
  const usedRoles = WAYPOINT_ROLES.filter((r) => [...waypoints.values()].some((w) => w.role === r));

  async function markHere() {
    setMarking(true);
    setMarkError(null);
    try {
      // Si el seguimiento ya tiene una lectura reciente se usa esa: es instantáneo y igual de preciso.
      const here = fix && Date.now() - fix.timestamp < FRESH_FIX_MS ? fix : await currentPosition();
      const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
      const wp = newEntity<Waypoint>({
        name: t('waypoints.defaultName', { when }),
        lat: here.lat,
        lon: here.lon,
        alt: here.alt,
        icon: 'pin',
        notes: '',
        rainAlerts: false,
      });
      await saveWaypoint(wp);
      navigate(`/orientation/waypoints/${wp.id}`);
    } catch (e) {
      setMarkError(t(`gps.error.${e instanceof GeoPositionError ? e.code : 'unavailable'}`));
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.waypoints.title')}</h1>
        <Link className="btn" to="/orientation/waypoints/new">
          <Plus size={20} /> {t('waypoints.new')}
        </Link>
      </div>

      {hasGps ? (
        <section className="card stack">
          <GpsStatus fix={fix} error={error} />
          <button className="btn btn-primary" type="button" onClick={() => void markHere()} disabled={marking}>
            <MapPinPlus size={20} /> {marking ? t('gps.searching') : t('waypoints.markHere')}
          </button>
          {markError && <p className="error" role="alert">{markError}</p>}
        </section>
      ) : (
        <p className="hint">{t('waypoints.noGps')}</p>
      )}

      {usedRoles.length > 0 && (
        <div className="chips" role="group" aria-label={t('waypoints.role.filter')}>
          <button type="button" className="chip" aria-pressed={roleFilter === null} onClick={() => setRoleFilter(null)}>
            {t('waypoints.role.all')}
          </button>
          {usedRoles.map((r) => (
            <button key={r} type="button" className="chip" aria-pressed={roleFilter === r} onClick={() => setRoleFilter(r)} data-testid={`role-filter-${r}`}>
              {t(`waypoints.role.${r}`)}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="empty">{t('waypoints.empty')}</p>
      ) : (
        <ul className="list" style={{ marginTop: 16 }}>
          {rows.map((wp) => (
            <li key={wp.id} className="list-item-actions">
              <Link className="list-row" to={`/orientation/waypoints/${wp.id}`}>
                <MapPin size={22} aria-hidden style={{ color: 'var(--text-muted)', flex: 'none' }} />
                <span className="list-main">
                  <span className="list-title">{wp.name}</span>
                  {wp.role && <span className="list-sub" data-testid="wp-role-badge">{t(`waypoints.role.${wp.role}`)}</span>}
                  {fix && <span className="list-sub">{distanceLabel(fix, wp)}</span>}
                  {(wp.privateRadiusM ?? 0) > 0 && <span className="list-sub">{t('waypoints.privateBadge', { m: wp.privateRadiusM })}</span>}
                </span>
              </Link>
              {hasGps && (
                <Link className="btn go-btn" to={`/orientation/waypoints/${wp.id}/go`} aria-label={t('goto.title', { name: wp.name })}>
                  <Navigation size={20} /> {t('goto.short')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <RoutesSection />
    </>
  );
}

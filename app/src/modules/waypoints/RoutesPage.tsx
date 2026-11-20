import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Route as RouteIcon } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { formatDistance } from '@/core/units/units';
import { lineLength } from './plan';
import { routeLength, routePoints, useWaypoints } from './store';

/** Rutas armadas uniendo waypoints: van abajo de los waypoints, en la misma pantalla. */
export function RoutesSection() {
  const { t, i18n } = useTranslation();
  const routes = useWaypoints((s) => s.routes);
  const waypoints = useWaypoints((s) => s.waypoints);
  const units = useSettings((s) => s.settings.units);
  const rows = useMemo(
    () =>
      [...routes.values()]
        .sort((a, b) => a.name.localeCompare(b.name, i18n.language))
        .map((route) => ({ route, points: routePoints(route, waypoints) })),
    [routes, waypoints, i18n.language],
  );

  return (
    <section className="stack routes-section" aria-labelledby="routes-title">
      <div className="page-head">
        <h2 id="routes-title" className="section-title" style={{ flex: 1, margin: 0 }}>
          {t('modules.routes.title')}
        </h2>
        <Link className="btn" to="/orientation/routes/new">
          <Plus size={20} /> {t('routes.new')}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="empty">{waypoints.size < 2 ? t('routes.needPoints') : t('routes.empty')}</p>
      ) : (
        <ul className="list" data-testid="routes-list">
          {rows.map(({ route, points }) => (
            <li key={route.id}>
              <Link className="list-row" to={`/orientation/routes/${route.id}`}>
                <RouteIcon size={22} aria-hidden style={{ color: 'var(--text-muted)', flex: 'none' }} />
                <span className="list-main">
                  <span className="list-title">{route.name}</span>
                  <span className="list-sub">
                    {t('routes.pointCount', { count: route.line ? route.line.length : points.length })}
                    {route.line
                      ? ` · ${formatDistance(lineLength(route.line), units, i18n.language)} · ${t('routes.planned')}`
                      : points.length > 1 && ` · ${formatDistance(routeLength(points), units, i18n.language)}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

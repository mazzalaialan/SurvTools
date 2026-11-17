import { useTranslation } from 'react-i18next';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Rutas de la app (las mismas de app/App.tsx; una prueba controla que
 * coincidan). Sirven para saber cuál es la pantalla "de arriba".
 */
export const ROUTE_PATHS = [
  '/', '/inventory', '/inventory/items', '/inventory/items/:id', '/inventory/locations', '/inventory/categories', '/inventory/alerts',
  '/settings/backup', '/settings/share', '/inventory/backup', '/inventory/recommendations', '/first-aid', '/first-aid/kits', '/first-aid/kits/build',
  '/first-aid/kits/:id', '/first-aid/medical', '/first-aid/medical/:id', '/first-aid/contacts', '/first-aid/contacts/nearby',
  '/first-aid/contacts/:id', '/first-aid/location', '/first-aid/guides', '/first-aid/guides/:topicId', '/first-aid/radio',
  '/first-aid/radio/:id', '/documents', '/documents/:id', '/transfer', '/orientation', '/orientation/waypoints',
  '/orientation/waypoints/:id', '/orientation/waypoints/:id/go', '/orientation/go', '/orientation/compass', '/orientation/declination', '/orientation/inclinometer', '/orientation/altimeter', '/training', '/training/workouts', '/training/live', '/training/weight', '/training/stopwatch', '/training/tools', '/training/metronome', '/training/gear', '/training/workouts/new', '/training/workouts/:id', '/training/outings', '/training/outings/:id',
  '/orientation/starmap', '/orientation/maps', '/orientation/routes', '/orientation/tracks', '/orientation/tracks/:id',
  '/orientation/tracks/:id/follow', '/orientation/routes/:id', '/orientation/routes/:id/go/:step', '/weather', '/weather/sky',
  '/weather/forecast', '/weather/history', '/weather/compare', '/weather/map', '/weather/navigation', '/knots', '/knots/guide', '/knots/guide/:id', '/knots/anchors', '/knots/anchors/:id', '/knots/ropes', '/knots/glossary',
  '/garden', '/garden/calendar', '/garden/crops/:id', '/garden/beds', '/garden/beds/:id', '/field', '/library', '/library/books', '/library/search', '/library/read/:id', '/settings', '/about', '/about/licenses',
];

/** Donde no alcanza con sacar el último tramo de la ruta. */
const PARENTS: Record<string, string> = {
  '/library/read/:id': '/library/books',
  '/garden/crops/:id': '/garden/calendar',
  '/orientation/routes/:id': '/orientation/waypoints',
  '/orientation/routes/:id/go/:step': '/orientation/routes/:id',
  '/settings/backup': '/settings',
  '/settings/share': '/settings',
  '/about': '/',
  '/about/licenses': '/about',
};

const routeOf = (path: string) => ROUTE_PATHS.find((p) => matchPath({ path: p, end: true }, path));

/** La pantalla de arriba de una ruta (ej.: /garden/beds/123 → /garden/beds). */
export function parentOf(pathname: string): string {
  const route = routeOf(pathname);
  if (route && PARENTS[route]) {
    const params = matchPath({ path: route, end: true }, pathname)?.params ?? {};
    return PARENTS[route].replace(/:(\w+)/g, (_, k: string) => params[k] ?? '');
  }
  let path = pathname.replace(/\/+$/, '');
  while (path.includes('/')) {
    path = path.slice(0, path.lastIndexOf('/')) || '/';
    if (path === '/' || routeOf(path)) return path;
  }
  return '/';
}

/**
 * Volver: a la pantalla anterior si se llegó navegando dentro de la app; si
 * se abrió directo (notificación, enlace, recarga), a la de arriba.
 */
export function BackButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (pathname === '/') return null;
  const inAppHistory = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  return (
    <button
      className="icon-btn"
      type="button"
      onClick={() => (inAppHistory ? navigate(-1) : navigate(parentOf(pathname), { replace: true }))}
      aria-label={t('common.back')}
      title={t('common.back')}
      data-testid="back"
    >
      <ArrowLeft size={22} />
    </button>
  );
}

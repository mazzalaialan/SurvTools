import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, CircleCheck, Circle, Hospital, Navigation, Siren } from 'lucide-react';
import { AlertList, ShortageList } from '@/modules/inventory/components/AlertList';
import { DocumentExpiryList, useExpiringDocuments } from '@/modules/documents/DocumentExpiryList';
import { groupShortages } from '@/modules/inventory/domain/stock';
import { useAlerts, useShortages } from '@/modules/inventory/selectors';
import { useInventory } from '@/modules/inventory/store';
import { RecommendationShortageList, useRecommendationShortages } from '@/modules/recommendations/RecommendationShortageList';
import { SECTIONS } from '@/modules/registry';
import { GardenTaskList, GardenWeatherNotices } from '@/modules/garden/GardenPage';
import { gardenAlertCount, useGardenStatus } from '@/modules/garden/status';
import { useSettings } from '@/core/settings/settings';
import { useTracks } from '@/modules/tracks/store';
import { useWaypoints } from '@/modules/waypoints/store';
import { ModuleGrid } from '@/ui/ModuleGrid';

const HOME_ALERT_LIMIT = 5;

function AlertSummary() {
  const { t } = useTranslation();
  const hasItems = useInventory((s) => s.items.size > 0);
  const alerts = useAlerts();
  const shortages = useShortages();
  const locations = useInventory((s) => s.locations);
  // Los faltantes de un botiquín cuentan como una sola alerta (ver ShortageList).
  const shortageRows = useMemo(() => groupShortages(shortages, [...locations.values()]).length, [shortages, locations]);
  const recShortages = useRecommendationShortages();
  const docs = useExpiringDocuments();
  const garden = useGardenStatus();
  const navigate = useNavigate();
  const gardenCount = gardenAlertCount(garden);
  const total = alerts.length + shortageRows + recShortages.length + docs.length + gardenCount;
  // Los documentos van primero: renovarlos lleva turnos y semanas de trámite.
  const left = HOME_ALERT_LIMIT - docs.length;

  if (total === 0) {
    return (
      <section className="card summary">
        <CircleCheck size={24} style={{ color: 'var(--ok)' }} aria-hidden />
        <div>
          <h2>{t('home.alertsTitle')}</h2>
          <p className="hint">{hasItems ? t('alerts.allGood') : t('home.alertsEmpty')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack">
      <div className="summary">
        <BellRing size={24} style={{ color: 'var(--warn)' }} aria-hidden />
        <h2 style={{ flex: 1 }}>{t('home.alertsCount', { count: total })}</h2>
        <Link to="/inventory/alerts">{t('home.seeAll')}</Link>
      </div>
      {/* Helada y riego primero: son para hoy. */}
      {gardenCount > 0 && <GardenWeatherNotices status={garden} compact />}
      {garden.tasks.length > 0 && <GardenTaskList tasks={garden.tasks.slice(0, 3)} onOpen={() => navigate('/garden/beds')} />}
      {docs.length > 0 && <DocumentExpiryList rows={docs} limit={HOME_ALERT_LIMIT} />}
      {left > 0 && alerts.length > 0 && <AlertList alerts={alerts} limit={left} />}
      {alerts.length < left && shortageRows > 0 && <ShortageList shortages={shortages} limit={left - alerts.length} />}
      {alerts.length + shortageRows < left && recShortages.length > 0 && (
        <RecommendationShortageList shortages={recShortages} limit={left - alerts.length - shortageRows} />
      )}
    </section>
  );
}

/** Lo que más se usa en el campo, a un toque desde el inicio. */
function QuickActions() {
  const { t } = useTranslation();
  const items = [
    { to: '/first-aid/location', icon: Siren, label: t('home.quick.emergency'), danger: true },
    { to: '/first-aid/contacts/nearby', icon: Hospital, label: t('home.quick.nearby') },
    { to: '/orientation/tracks', icon: Circle, label: t('home.quick.record') },
    { to: '/orientation/waypoints', icon: Navigation, label: t('home.quick.goTo') },
  ];
  return (
    <nav className="quick-actions" aria-label={t('home.quick.title')} data-testid="quick-actions">
      {items.map(({ to, icon: Icon, label, danger }) => (
        <Link key={to} to={to} className={`btn quick-action${danger ? ' quick-danger' : ''}`}>
          <Icon size={22} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Primeros pasos: para quien recién empieza (sin lugares ni recorridos guardados); se puede descartar. */
function FirstSteps() {
  const { t } = useTranslation();
  const dismissed = useSettings((s) => s.settings.firstStepsDone);
  const update = useSettings((s) => s.update);
  const waypoints = useWaypoints((s) => s.waypoints.size);
  const tracks = useTracks((s) => s.tracks.size);
  if (dismissed || waypoints > 0 || tracks > 0) return null;
  const steps = [
    { to: '/orientation/compass', label: t('home.first.compass') },
    { to: '/orientation/waypoints/new', label: t('home.first.waypoint') },
    { to: '/orientation/tracks', label: t('home.first.record') },
    { to: '/first-aid/medical', label: t('home.first.medical') },
  ];
  return (
    <section className="card stack" aria-labelledby="first-steps" data-testid="first-steps">
      <h2 id="first-steps" className="section-title" style={{ margin: 0 }}>{t('home.first.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('home.first.hint')}</p>
      <ol className="first-steps-list">
        {steps.map((st) => (
          <li key={st.to}>
            <Link to={st.to}>{st.label}</Link>
          </li>
        ))}
      </ol>
      <div className="row-end">
        <button className="btn" type="button" onClick={() => void update({ firstStepsDone: true })} data-testid="first-steps-dismiss">
          {t('home.first.dismiss')}
        </button>
      </div>
    </section>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  return (
    <>
      <QuickActions />
      <FirstSteps />
      <AlertSummary />
      {SECTIONS.map((section) => (
        <Fragment key={section}>
          <h2 className="section-title">{t(`sections.${section}`)}</h2>
          <ModuleGrid section={section} />
        </Fragment>
      ))}
      <footer className="home-footer">
        <Link to="/about">{t('about.footer', { version: __APP_VERSION__ })}</Link>
      </footer>
    </>
  );
}

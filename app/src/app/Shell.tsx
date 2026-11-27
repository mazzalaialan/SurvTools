import { IncomingFileHandler } from './IncomingFileHandler';
import { Suspense } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Egg, BookOpen, CloudSun, Compass, Ellipsis, FileText, Fish, House, Lasso, Lock, Package, PawPrint, Settings, Siren, Sprout, Activity } from 'lucide-react';
import { useVault } from '@/core/security/useVault';
import { useEmergencyCardSync } from '@/modules/firstAid/emergencyCard';
import { YOUTUBE_URL } from '@/core/about';
import { YoutubeIcon } from '@/ui/YoutubeIcon';
import { useCountryPrefetch } from '@/modules/emergency/country';
import { CountryNotices } from '@/modules/emergency/CountryNotices';
import { useCountryAutomation } from '@/modules/emergency/countryAutomation';
import { BrandMark } from '@/ui/Brand';
import { BackButton } from '@/ui/BackButton';
import { ConfirmHost } from '@/ui/confirm';
import { Dialog } from '@/ui/Dialog';
import { PocketScreen, RecordingBar } from '@/modules/tracks/Recording';
import { StartRecordingDialog } from '@/modules/tracks/StartRecording';
import { OutingPlanBar } from '@/modules/training/OutingPlanBar';
import { useOutingDeadlineSync } from '@/modules/training/outingDeadlineSync';
import { useLiveSender } from '@/modules/training/liveShare';
import { RainNotices } from '@/modules/weather/RainNotices';
import { useZoneForecastRefresh } from '@/modules/maps/zoneForecast';
import { useRainServerSync } from '@/modules/weather/rainServer';
import { useGardenServerSync } from '@/modules/garden/serverSync';
import { useStockServerSync } from '@/modules/inventory/stockServer';
import { useRainWatcher } from '@/modules/weather/rainWatch';
import { usePressureWatcher } from '@/modules/weather/pressureWatch';
import { PortableUpdateNotice } from './PortableUpdateNotice';

// En el celular entran seis botones: cinco secciones y "Más" con el resto.
// En pantallas anchas el riel lateral muestra todas. Ajustes va en la barra superior.
const NAV = [
  { to: '/', key: 'home', icon: House },
  { to: '/first-aid', key: 'firstAid', icon: Siren },
  { to: '/orientation', key: 'orientation', icon: Compass },
  { to: '/weather', key: 'weather', icon: CloudSun },
  { to: '/training', key: 'training', icon: Activity },
] as const;

const MORE = [
  { to: '/documents', key: 'documents', icon: FileText },
  { to: '/inventory', key: 'inventory', icon: Package },
  { to: '/knots', key: 'knots', icon: Lasso },
  { to: '/garden', key: 'garden', icon: Sprout },
  { to: '/farm', key: 'farm', icon: Egg },
  { to: '/fishing', key: 'fishing', icon: Fish },
  { to: '/fauna', key: 'fauna', icon: PawPrint },
  { to: '/library', key: 'library', icon: BookOpen },
] as const;

export function Shell() {
  const { t } = useTranslation();
  const lock = useVault((s) => s.lock);
  // Sin contraseña no hay bloqueo: el botón no se muestra.
  const openVault = useVault((s) => s.open);
  useCountryPrefetch();
  // Detecta en qué país estás cuando llega una ubicación (sin pedir el GPS) y ofrece cambiar el país o bajar sus datos.
  useCountryAutomation();
  // Datos de emergencia para la pantalla de bloqueo (si se activaron): se mantienen al día con las fichas.
  useEmergencyCardSync();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.some((m) => pathname.startsWith(m.to));
  useRainWatcher();
  usePressureWatcher();
  useRainServerSync();
  useGardenServerSync();
  useStockServerSync();
  useZoneForecastRefresh();
  useLiveSender();
  useOutingDeadlineSync();

  return (
    <div className="shell">
      {/* data-area='emergency': solo cambia el tono de la solapa activa (rojo = Emergencias; ver docs/DISENO.md). */}
      <nav className="bottomnav" aria-label={t('nav.main')} data-area={pathname.startsWith('/first-aid') ? 'emergency' : undefined}>
        {NAV.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={24} aria-hidden />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
        {MORE.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className="nav-wide">
            <Icon size={24} aria-hidden />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
        <button
          type="button"
          className={`nav-more${inMore ? ' active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
        >
          <Ellipsis size={24} aria-hidden />
          {t('nav.more')}
        </button>
      </nav>
      {moreOpen && (
        <Dialog title={t('nav.more')} onClose={() => setMoreOpen(false)}>
          <ul className="list">
            {MORE.map(({ to, key, icon: Icon }) => (
              <li key={to}>
                <Link className="list-row" to={to} onClick={() => setMoreOpen(false)}>
                  <Icon size={22} aria-hidden style={{ color: 'var(--text-muted)' }} />
                  <span className="list-main">
                    <span className="list-title">{t(`sections.${key}`)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      <div className="shell-main">
        <header className="topbar">
          <BackButton />
          <Link className="topbar-home" to="/" data-testid="topbar-home">
            <BrandMark />
            <p className="topbar-title">{t('app.name')}</p>
          </Link>
          {/* Canal de YouTube: solo con lugar (web y tablet); en el celular está en Acerca de. */}
          <a className="icon-btn topbar-youtube" href={YOUTUBE_URL} target="_blank" rel="noreferrer" aria-label={t('about.youtube')} title={t('about.youtube')} data-testid="topbar-youtube">
            <YoutubeIcon size={26} />
          </a>
          <Link className="icon-btn" to="/settings" aria-label={t('nav.settings')} title={t('nav.settings')}>
            <Settings size={22} />
          </Link>
          {!openVault && (
            <button className="icon-btn topbar-lock" type="button" onClick={lock} aria-label={t('settings.lockNow')} title={t('settings.lockNow')}>
              <Lock size={22} />
            </button>
          )}
        </header>
        <PortableUpdateNotice />
        <CountryNotices />
        <RainNotices />
        <RecordingBar />
        <StartRecordingDialog />
        <OutingPlanBar />
        <PocketScreen />
        <ConfirmHost />
        <IncomingFileHandler />
        <main className="content">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

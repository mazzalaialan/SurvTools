import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { useAutoLock } from '@/core/security/useAutoLock';
import { useVault } from '@/core/security/useVault';
import { useSettings, type Theme } from '@/core/settings/settings';
import { useEffectiveTheme } from '@/core/settings/theme';
import { useBatterySaver } from '@/core/power/saver';
import { HomePage } from './pages/HomePage';
import { SectionPage } from './pages/SectionPage';
import { NewPasswordScreen } from './screens/NewPasswordScreen';
import { RecoveryKeyScreen } from './screens/RecoveryKeyScreen';
import { SetupScreen } from './screens/SetupScreen';
import { UnlockScreen } from './screens/UnlockScreen';
import { UpdatePrompt } from './UpdatePrompt';
import './stores';
import { Shell } from './Shell';

// Cada pantalla se carga recién al abrirla (el Shell la envuelve en Suspense): la app arranca
// más rápido en celulares lentos. Apenas la app queda libre se bajan las demás en segundo
// plano (preloadPages), para que estén aunque se corte la conexión antes de que el service
// worker termine de guardar todo.
const loaders: (() => Promise<unknown>)[] = [];
function page<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  loaders.push(load);
  return lazy(load);
}
let preloaded = false;
function preloadPages() {
  if (preloaded) return;
  preloaded = true;
  const run = () => loaders.forEach((load) => void load().catch(() => undefined));
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
// Los contornos de países y provincias (livianos) se cargan siempre apenas la app queda libre, no al abrir cada mapa.
loaders.push(() => import('@/modules/weathermap/geo').then((m) => m.loadGeoData()));
const AstronomyPage = page(() => import('@/modules/astronomy/AstronomyPage').then((m) => ({ default: m.AstronomyPage })));
const BackupPage = page(() => import('@/modules/backup/BackupPage').then((m) => ({ default: m.BackupPage })));
const SharePage = page(() => import('@/modules/share/SharePage').then((m) => ({ default: m.SharePage })));
const DocumentEditPage = page(() => import('@/modules/documents/DocumentEditPage').then((m) => ({ default: m.DocumentEditPage })));
const DocumentsPage = page(() => import('@/modules/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const KitPage = page(() => import('@/modules/firstAid/KitPage').then((m) => ({ default: m.KitPage })));
const KitsPage = page(() => import('@/modules/firstAid/KitsPage').then((m) => ({ default: m.KitsPage })));
const KitBuilderPage = page(() => import('@/modules/firstAid/KitBuilderPage').then((m) => ({ default: m.KitBuilderPage })));
const MedicalEditPage = page(() => import('@/modules/firstAid/MedicalEditPage').then((m) => ({ default: m.MedicalEditPage })));
const MedicalPage = page(() => import('@/modules/firstAid/MedicalPage').then((m) => ({ default: m.MedicalPage })));
const ContactEditPage = page(() => import('@/modules/emergency/ContactEditPage').then((m) => ({ default: m.ContactEditPage })));
const ContactsPage = page(() => import('@/modules/emergency/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const FrequencyEditPage = page(() => import('@/modules/emergency/FrequencyEditPage').then((m) => ({ default: m.FrequencyEditPage })));
const MyLocationPage = page(() => import('@/modules/emergency/MyLocationPage').then((m) => ({ default: m.MyLocationPage })));
const NearbyPage = page(() => import('@/modules/emergency/NearbyPage').then((m) => ({ default: m.NearbyPage })));
const RadioPage = page(() => import('@/modules/emergency/RadioPage').then((m) => ({ default: m.RadioPage })));
const GuidesPage = page(() => import('@/modules/firstAid/guides/GuidesPage').then((m) => ({ default: m.GuidesPage })));
const GuideTopicPage = page(() => import('@/modules/firstAid/guides/GuideTopicPage').then((m) => ({ default: m.GuideTopicPage })));
const AlertsPage = page(() => import('@/modules/inventory/pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const CategoriesPage = page(() => import('@/modules/inventory/pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const ItemEditPage = page(() => import('@/modules/inventory/pages/ItemEditPage').then((m) => ({ default: m.ItemEditPage })));
const ItemsPage = page(() => import('@/modules/inventory/pages/ItemsPage').then((m) => ({ default: m.ItemsPage })));
const LocationsPage = page(() => import('@/modules/inventory/pages/LocationsPage').then((m) => ({ default: m.LocationsPage })));
const CompassPage = page(() => import('@/modules/compass/CompassPage').then((m) => ({ default: m.CompassPage })));
const AltimeterPage = page(() => import('@/modules/altimeter/AltimeterPage').then((m) => ({ default: m.AltimeterPage })));
const DeclinationPage = page(() => import('@/modules/declination/DeclinationPage').then((m) => ({ default: m.DeclinationPage })));
const RecommendationsPage = page(() => import('@/modules/recommendations/RecommendationsPage').then((m) => ({ default: m.RecommendationsPage })));
const NavigationPage = page(() => import('@/modules/navigation/NavigationPage').then((m) => ({ default: m.NavigationPage })));
const StarMapPage = page(() => import('@/modules/starmap/StarMapPage').then((m) => ({ default: m.StarMapPage })));
const InclinometerPage = page(() => import('@/modules/inclinometer/InclinometerPage').then((m) => ({ default: m.InclinometerPage })));
const GoToPage = page(() => import('@/modules/waypoints/GoToPage').then((m) => ({ default: m.GoToPage })));
const RouteEditPage = page(() => import('@/modules/waypoints/RouteEditPage').then((m) => ({ default: m.RouteEditPage })));
const GoToPointPage = page(() => import('@/modules/waypoints/GoToPointPage').then((m) => ({ default: m.GoToPointPage })));
const RouteGoPage = page(() => import('@/modules/waypoints/RouteGoPage').then((m) => ({ default: m.RouteGoPage })));
const TrackFollowPage = page(() => import('@/modules/tracks/TrackFollowPage').then((m) => ({ default: m.TrackFollowPage })));
const TrackPage = page(() => import('@/modules/tracks/TrackPage').then((m) => ({ default: m.TrackPage })));
const TracksPage = page(() => import('@/modules/tracks/TracksPage').then((m) => ({ default: m.TracksPage })));
const WeatherPage = page(() => import('@/modules/weather/WeatherPage').then((m) => ({ default: m.WeatherPage })));
const HistoryPage = page(() => import('@/modules/weather/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const ComparePage = page(() => import('@/modules/weather/ComparePage').then((m) => ({ default: m.ComparePage })));
const WeatherMapPage = page(() => import('@/modules/weathermap/WeatherMapPage').then((m) => ({ default: m.WeatherMapPage })));
const WaypointEditPage = page(() => import('@/modules/waypoints/WaypointEditPage').then((m) => ({ default: m.WaypointEditPage })));
const WaypointsPage = page(() => import('@/modules/waypoints/WaypointsPage').then((m) => ({ default: m.WaypointsPage })));
const BedPage = page(() => import('@/modules/garden/BedPage').then((m) => ({ default: m.BedPage })));
const LibraryPage = page(() => import('@/modules/library/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const LibrarySearchPage = page(() => import('@/modules/library/LibrarySearchPage').then((m) => ({ default: m.LibrarySearchPage })));
const ReaderPage = page(() => import('@/modules/library/ReaderPage').then((m) => ({ default: m.ReaderPage })));
const AnchorPage = page(() => import('@/modules/knots/AnchorPages').then((m) => ({ default: m.AnchorPage })));
const AnchorsPage = page(() => import('@/modules/knots/AnchorPages').then((m) => ({ default: m.AnchorsPage })));
const GlossaryPage = page(() => import('@/modules/knots/InfoPages').then((m) => ({ default: m.GlossaryPage })));
const CarabinersPage = page(() => import('@/modules/knots/CarabinerPages').then((m) => ({ default: m.CarabinersPage })));
const RopesPage = page(() => import('@/modules/knots/InfoPages').then((m) => ({ default: m.RopesPage })));
const KnotGuidePage = page(() => import('@/modules/knots/KnotGuidePage').then((m) => ({ default: m.KnotGuidePage })));
const KnotPage = page(() => import('@/modules/knots/KnotPage').then((m) => ({ default: m.KnotPage })));
const CropPage = page(() => import('@/modules/garden/CropPage').then((m) => ({ default: m.CropPage })));
const GardenCalendarPage = page(() => import('@/modules/garden/GardenCalendarPage').then((m) => ({ default: m.GardenCalendarPage })));
const TrainingPage = page(() => import('@/modules/training/TrainingPage').then((m) => ({ default: m.TrainingPage })));
const StopwatchPage = page(() => import('@/modules/training/StopwatchPage').then((m) => ({ default: m.StopwatchPage })));
const MetronomePage = page(() => import('@/modules/training/MetronomePage').then((m) => ({ default: m.MetronomePage })));
const ToolsPage = page(() => import('@/modules/training/ToolsPage').then((m) => ({ default: m.ToolsPage })));
const WeightPage = page(() => import('@/modules/training/WeightPage').then((m) => ({ default: m.WeightPage })));
const GearPage = page(() => import('@/modules/training/GearPage').then((m) => ({ default: m.GearPage })));
const LivePage = page(() => import('@/modules/training/LivePage').then((m) => ({ default: m.LivePage })));
const WorkoutPage = page(() => import('@/modules/training/WorkoutPage').then((m) => ({ default: m.WorkoutPage })));
const WorkoutEditPage = page(() => import('@/modules/training/WorkoutEditPage').then((m) => ({ default: m.WorkoutEditPage })));
const OutingsPage = page(() => import('@/modules/training/OutingsPage').then((m) => ({ default: m.OutingsPage })));
const OutingPage = page(() => import('@/modules/training/OutingPage').then((m) => ({ default: m.OutingPage })));
const FishingHomePage = page(() => import('@/modules/fishing/FishingPages').then((m) => ({ default: m.FishingHomePage })));
const FishSpeciesPage = page(() => import('@/modules/fishing/FishingPages').then((m) => ({ default: m.FishSpeciesPage })));
const FishPage = page(() => import('@/modules/fishing/FishingPages').then((m) => ({ default: m.FishPage })));
const FishWatersPage = page(() => import('@/modules/fishing/FishingPages').then((m) => ({ default: m.FishWatersPage })));
const FishSectorPage = page(() => import('@/modules/fishing/FishingPages').then((m) => ({ default: m.FishSectorPage })));
const FishRulesPage = page(() => import('@/modules/fishing/FishingPages').then((m) => ({ default: m.FishRulesPage })));
const ShellfishPage = page(() => import('@/modules/fishing/ShellfishPages').then((m) => ({ default: m.ShellfishPage })));
const ShellfishDetailPage = page(() => import('@/modules/fishing/ShellfishPages').then((m) => ({ default: m.ShellfishDetailPage })));
const FishSurvivalPage = page(() => import('@/modules/fishing/FishSurvivalPage').then((m) => ({ default: m.FishSurvivalPage })));
const FarmHomePage = page(() => import('@/modules/farm/FarmPages').then((m) => ({ default: m.FarmHomePage })));
const FarmSpeciesPage = page(() => import('@/modules/farm/FarmPages').then((m) => ({ default: m.FarmSpeciesPage })));
const FarmSpeciesDetailPage = page(() => import('@/modules/farm/FarmPages').then((m) => ({ default: m.FarmSpeciesDetailPage })));
const FarmRulesPage = page(() => import('@/modules/farm/FarmPages').then((m) => ({ default: m.FarmRulesPage })));
const FarmPlanPage = page(() => import('@/modules/farm/FarmToolsPages').then((m) => ({ default: m.FarmPlanPage })));
const FarmCalendarPage = page(() => import('@/modules/farm/FarmToolsPages').then((m) => ({ default: m.FarmCalendarPage })));
const FarmHerdsPage = page(() => import('@/modules/farm/FarmToolsPages').then((m) => ({ default: m.FarmHerdsPage })));
const FarmVetPage = page(() => import('@/modules/farm/FarmToolsPages').then((m) => ({ default: m.FarmVetPage })));
const FarmPenPage = page(() => import('@/modules/farm/FarmToolsPages').then((m) => ({ default: m.FarmPenPage })));
const FarmHerdPage = page(() => import('@/modules/farm/FarmToolsPages').then((m) => ({ default: m.FarmHerdPage })));
const FaunaHomePage = page(() => import('@/modules/fauna/FaunaPages').then((m) => ({ default: m.FaunaHomePage })));
const FaunaZonePage = page(() => import('@/modules/fauna/FaunaPages').then((m) => ({ default: m.FaunaZonePage })));
const FaunaProvincesPage = page(() => import('@/modules/fauna/FaunaPages').then((m) => ({ default: m.FaunaProvincesPage })));
const FaunaProvincePage = page(() => import('@/modules/fauna/FaunaPages').then((m) => ({ default: m.FaunaProvincePage })));
const FaunaSpeciesPage = page(() => import('@/modules/fauna/FaunaPages').then((m) => ({ default: m.FaunaSpeciesPage })));
const FaunaSpeciesDetailPage = page(() => import('@/modules/fauna/FaunaPages').then((m) => ({ default: m.FaunaSpeciesDetailPage })));
const FishingMapPage = page(() => import('@/modules/fishing/FishingMapPage').then((m) => ({ default: m.FishingMapPage })));
const GardenPage = page(() => import('@/modules/garden/GardenPage').then((m) => ({ default: m.GardenPage })));
const SettingsPage = page(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AboutPage = page(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const LicensesPage = page(() => import('./pages/LicensesPage').then((m) => ({ default: m.LicensesPage })));

// MapLibre pesa ~1 MB: se carga recién al abrir los mapas (igual queda guardado para usarlo sin conexión).
const MapsPage = page(() => import('@/modules/maps/MapsPage').then((m) => ({ default: m.MapsPage })));

// Hash router: funciona en GitHub Pages y offline sin configurar el servidor.
const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/inventory', element: <SectionPage section="inventory" /> },
      { path: '/inventory/items', element: <ItemsPage /> },
      { path: '/inventory/items/:id', element: <ItemEditPage /> },
      { path: '/inventory/locations', element: <LocationsPage /> },
      { path: '/inventory/categories', element: <CategoriesPage /> },
      { path: '/inventory/alerts', element: <AlertsPage /> },
      { path: '/settings/backup', element: <BackupPage /> },
      { path: '/settings/share', element: <SharePage /> },
      // Ruta anterior a v0.7.4 (el backup estaba en Inventario).
      { path: '/inventory/backup', element: <Navigate to="/settings/backup" replace /> },
      { path: '/inventory/recommendations', element: <RecommendationsPage /> },
      { path: '/first-aid', element: <SectionPage section="firstAid" /> },
      { path: '/first-aid/kits', element: <KitsPage /> },
      { path: '/first-aid/kits/build', element: <KitBuilderPage /> },
      { path: '/first-aid/kits/:id', element: <KitPage /> },
      { path: '/first-aid/medical', element: <MedicalPage /> },
      { path: '/first-aid/medical/:id', element: <MedicalEditPage /> },
      { path: '/first-aid/contacts', element: <ContactsPage /> },
      { path: '/first-aid/contacts/nearby', element: <NearbyPage /> },
      { path: '/first-aid/contacts/:id', element: <ContactEditPage /> },
      { path: '/first-aid/location', element: <MyLocationPage /> },
      { path: '/first-aid/guides', element: <GuidesPage /> },
      { path: '/first-aid/guides/:topicId', element: <GuideTopicPage /> },
      { path: '/first-aid/radio', element: <RadioPage /> },
      { path: '/first-aid/radio/:id', element: <FrequencyEditPage /> },
      { path: '/documents', element: <DocumentsPage /> },
      { path: '/documents/:id', element: <DocumentEditPage /> },
      { path: '/transfer', element: <BackupPage /> },
      { path: '/orientation', element: <SectionPage section="orientation" /> },
      { path: '/orientation/waypoints', element: <WaypointsPage /> },
      { path: '/orientation/waypoints/:id', element: <WaypointEditPage /> },
      { path: '/orientation/waypoints/:id/go', element: <GoToPage /> },
      { path: '/orientation/go', element: <GoToPointPage /> },
      { path: '/orientation/compass', element: <CompassPage /> },
      { path: '/orientation/declination', element: <DeclinationPage /> },
      { path: '/orientation/inclinometer', element: <InclinometerPage /> },
      { path: '/orientation/altimeter', element: <AltimeterPage /> },
      { path: '/orientation/starmap', element: <StarMapPage /> },
      { path: '/weather/navigation', element: <NavigationPage /> },
      {
        path: '/orientation/maps',
        element: (
          <Suspense fallback={null}>
            <MapsPage />
          </Suspense>
        ),
      },
      // Las rutas se listan abajo de los waypoints (antes tenían pantalla propia).
      { path: '/orientation/routes', element: <Navigate to="/orientation/waypoints" replace /> },
      { path: '/orientation/tracks', element: <TracksPage /> },
      { path: '/orientation/tracks/:id', element: <TrackPage /> },
      { path: '/orientation/tracks/:id/follow', element: <TrackFollowPage /> },
      { path: '/orientation/routes/:id', element: <RouteEditPage /> },
      { path: '/orientation/routes/:id/go/:step', element: <RouteGoPage /> },
      { path: '/weather', element: <SectionPage section="weather" /> },
      { path: '/weather/sky', element: <AstronomyPage /> },
      { path: '/weather/forecast', element: <WeatherPage /> },
      { path: '/weather/history', element: <HistoryPage /> },
      { path: '/weather/compare', element: <ComparePage /> },
      { path: '/weather/map', element: <WeatherMapPage /> },
      { path: '/knots', element: <SectionPage section="knots" /> },
      { path: '/knots/guide', element: <KnotGuidePage /> },
      { path: '/knots/guide/:id', element: <KnotPage /> },
      { path: '/knots/anchors', element: <AnchorsPage /> },
      { path: '/knots/anchors/:id', element: <AnchorPage /> },
      { path: '/knots/ropes', element: <RopesPage /> },
      { path: '/knots/carabiners', element: <CarabinersPage /> },
      { path: '/knots/glossary', element: <GlossaryPage /> },
      { path: '/training', element: <SectionPage section="training" /> },
      { path: '/training/workouts', element: <TrainingPage /> },
      { path: '/training/live', element: <LivePage /> },
      { path: '/training/weight', element: <WeightPage /> },
      { path: '/training/stopwatch', element: <StopwatchPage /> },
      { path: '/training/tools', element: <ToolsPage /> },
      { path: '/training/metronome', element: <MetronomePage /> },
      { path: '/training/gear', element: <GearPage /> },
      { path: '/training/workouts/new', element: <WorkoutEditPage /> },
      { path: '/training/workouts/:id', element: <WorkoutPage /> },
      { path: '/training/outings', element: <OutingsPage /> },
      { path: '/training/outings/:id', element: <OutingPage /> },
      { path: '/garden', element: <SectionPage section="garden" /> },
      { path: '/garden/calendar', element: <GardenCalendarPage /> },
      { path: '/garden/crops/:id', element: <CropPage /> },
      { path: '/garden/beds', element: <GardenPage /> },
      { path: '/garden/beds/:id', element: <BedPage /> },
      // Ruta de la sección "Campo" (v0.3), dividida en Orientación y Meteorología.
      { path: '/field', element: <Navigate to="/orientation" replace /> },
      { path: '/fishing', element: <FishingHomePage /> },
      { path: '/fishing/map', element: <FishingMapPage /> },
      { path: '/fishing/species', element: <FishSpeciesPage /> },
      { path: '/fishing/fish/:id', element: <FishPage /> },
      { path: '/fishing/waters', element: <FishWatersPage /> },
      { path: '/fishing/sector/:id', element: <FishSectorPage /> },
      { path: '/fishing/rules', element: <FishRulesPage /> },
      { path: '/fishing/survival', element: <FishSurvivalPage /> },
      { path: '/fishing/shellfish', element: <ShellfishPage /> },
      { path: '/fishing/shellfish/:id', element: <ShellfishDetailPage /> },
      { path: '/farm', element: <FarmHomePage /> },
      { path: '/farm/species', element: <FarmSpeciesPage /> },
      { path: '/farm/species/:id', element: <FarmSpeciesDetailPage /> },
      { path: '/farm/rules', element: <FarmRulesPage /> },
      { path: '/farm/plan', element: <FarmPlanPage /> },
      { path: '/farm/calendar', element: <FarmCalendarPage /> },
      { path: '/farm/herd', element: <FarmHerdsPage /> },
      { path: '/farm/herd/:id', element: <FarmHerdPage /> },
      { path: '/farm/pen/:id', element: <FarmPenPage /> },
      { path: '/farm/vet', element: <FarmVetPage /> },
      { path: '/fauna', element: <FaunaHomePage /> },
      { path: '/fauna/zone', element: <FaunaZonePage /> },
      { path: '/fauna/provinces', element: <FaunaProvincesPage /> },
      { path: '/fauna/p/:slug', element: <FaunaProvincePage /> },
      { path: '/fauna/species', element: <FaunaSpeciesPage /> },
      { path: '/fauna/species/:id', element: <FaunaSpeciesDetailPage /> },
      { path: '/library', element: <SectionPage section="library" /> },
      { path: '/library/books', element: <LibraryPage /> },
      { path: '/library/search', element: <LibrarySearchPage /> },
      { path: '/library/read/:id', element: <ReaderPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '/about/licenses', element: <LicensesPage /> },
      // Una dirección que no existe (un enlace viejo o mal escrito) vuelve al Inicio: sin esto aparece la pantalla de error por defecto del router, en inglés.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const THEME_COLOR: Record<Theme, string> = { dark: '#121a24', light: '#f3efe7', red: '#000000', saver: '#000000' };

function useApplyTheme(theme: Theme, saver: boolean) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
  // Aparte del tema: con el rojo nocturno encima, el ahorro (sin animaciones) sigue.
  useEffect(() => {
    document.documentElement.toggleAttribute('data-saver', saver);
  }, [saver]);
}

export function App() {
  const status = useVault((s) => s.status);
  const autoLockMinutes = useSettings((s) => s.settings.autoLockMinutes);
  const theme = useEffectiveTheme();

  useApplyTheme(theme, useBatterySaver());
  useAutoLock(autoLockMinutes);
  useEffect(preloadPages, []);

  return (
    <>
      <Screen />
      <UpdatePrompt visible={status !== 'loading'} />
    </>
  );
}

function Screen() {
  const { status, setupInProgress, pendingRecoveryKey, mustChangePassword } = useVault();

  if (pendingRecoveryKey) return <RecoveryKeyScreen recoveryKey={pendingRecoveryKey} />;
  if (setupInProgress) return <SetupScreen />;

  switch (status) {
    case 'loading':
      return null;
    case 'uninitialized':
      return <SetupScreen />;
    case 'locked':
      return <UnlockScreen />;
    case 'unlocked':
      return mustChangePassword ? <NewPasswordScreen /> : <RouterProvider router={router} />;
  }
}

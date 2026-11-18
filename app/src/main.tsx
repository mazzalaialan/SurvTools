import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { useCapabilities } from './core/capabilities/capabilities';
import { initI18n } from './core/i18n/i18n';
import { scheduleAlertSync } from './core/notifications/notifications';
import { isNativePlatform } from './core/platform';
import { usePortableUpdate } from './core/portable/update';
import { onAlertIndexChange } from './modules/inventory/store';
import { useVault } from './core/security/useVault';
import { useSettings } from './core/settings/settings';
import './styles/app.css';

async function bootstrap() {
  await useSettings.getState().load();
  const { language } = useSettings.getState().settings;
  await initI18n(language);
  document.documentElement.lang = language;
  // La detección de sensores tarda ~1,5 s: no bloquea el arranque.
  void useCapabilities.getState().detect();
  // Solo el paquete portable busca versiones nuevas (la versión de internet se actualiza sola).
  void usePortableUpdate.getState().init();
  // App nativa (Capacitor): las notificaciones van por Firebase y los avisos locales del sistema, no por el service worker. Se carga solo ahí:
  // en la web no entran los plugins nativos.
  if (isNativePlatform()) void import('./core/notifications/nativeBackend').then((m) => m.startNativeNotifications());
  // App nativa: la grabación de recorridos usa un servicio en primer plano que sigue con la pantalla apagada. Se instala antes de que cargue la
  // bóveda: al reabrir, una grabación que se cortó recupera del registro nativo lo que quedó pendiente.
  if (isNativePlatform()) {
    (await import('./core/geo/nativeLocation')).startNativeLocation();
    // El altímetro puede usar el barómetro del teléfono (los navegadores no lo exponen).
    (await import('./core/sensors/nativeBarometer')).startNativeBarometer();
    // El botón «atrás» de Android: cierra diálogos, vuelve atrás y, en la primera pantalla, minimiza en vez de cerrar.
    (await import('./core/backButton')).startBackButton();
    // El fondo y los íconos de las barras del sistema siguen el tema de la app (si no, quedan de un gris que no combina).
    (await import('./core/systemBars')).startSystemBars();
  }
  // Con servidor configurado, cada cambio de alertas se le envía (agrupado).
  onAlertIndexChange(scheduleAlertSync);
  await useVault.getState().refresh();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();

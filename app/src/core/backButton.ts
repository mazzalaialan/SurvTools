import { App } from '@capacitor/app';
import { handleBack } from '@/ui/backStack';

/**
 * Botón «atrás» de Android (app nativa). En orden: (1) cierra lo de arriba (un diálogo, la pantalla completa); (2) si no hay nada, vuelve a la
 * pantalla anterior; (3) si ya está en la primera, MINIMIZA la app en lugar de cerrarla: cerrarla cortaría una grabación en curso (el servicio
 * de ubicación necesita la app viva) y obligaría a volver a desbloquear la bóveda.
 */
let started = false;

export function startBackButton(): void {
  if (started) return;
  started = true;
  void App.addListener('backButton', ({ canGoBack }) => {
    if (handleBack()) return;
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}

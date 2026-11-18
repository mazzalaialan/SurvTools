import { App } from '@capacitor/app';
import { parseTransferLink, PUBLIC_APP_URL } from '@/core/backup/transfer';

/**
 * Enlaces de transferencia que abren la app nativa (Android App Links: `https://mazzalaialan.github.io/SurvTools/#/transfer?server=…&code=…`,
 * verificados con `/.well-known/assetlinks.json`; ver docs/PENDIENTES.md). Se lleva al mismo lugar al que va el enlace en el navegador: la ruta
 * `#/transfer?…`, que la pantalla de bienvenida (sin bóveda) y «Copia de seguridad» ya saben atender.
 */
export const isAppLink = (url: string): boolean => url.startsWith(PUBLIC_APP_URL.replace(/\/$/, '')) && parseTransferLink(url) !== null;

function go(url: string | undefined | null): boolean {
  if (!url || !isAppLink(url)) return false;
  window.location.hash = `#/transfer?${url.split('#/transfer?')[1]}`;
  return true;
}

/** Al arrancar (antes de dibujar la app, para que la pantalla de bienvenida ya vea el enlace) y cuando llega uno con la app abierta. */
export async function startIncomingLinks(): Promise<void> {
  void App.addListener('appUrlOpen', (e) => void go(e.url));
  go((await App.getLaunchUrl().catch(() => null))?.url);
}

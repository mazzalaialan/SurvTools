import type { Page } from '@playwright/test';

/**
 * Espera a que el service worker de la página esté listo. Las notificaciones (activar, desactivar, borrar la cuenta del servidor) pasan por
 * él, y en una corrida completa, con muchas pruebas en paralelo, puede tardar más que los 5 segundos que espera una verificación común: eso
 * hacía fallar a veces `account.spec.ts` y `transfer.spec.ts` aunque la app estuviera bien.
 */
export async function waitForServiceWorker(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.evaluate(
    (ms) =>
      Promise.race([
        navigator.serviceWorker.ready.then(() => undefined),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('el service worker no quedó listo')), ms)),
      ]),
    timeoutMs,
  );
}

/** Plazo para lo que depende del service worker o del servidor de prueba, más holgado que el común. */
export const SLOW = { timeout: 20_000 } as const;

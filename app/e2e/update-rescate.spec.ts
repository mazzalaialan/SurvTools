import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

async function start(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

test('si «Descargar ahora» no recibe ningún avance en unos segundos, el aviso ofrece reintentar', async ({ page }) => {
  await start(page);
  // Se simula el aviso del service worker (hay algo para bajar) por el canal interno: ningún worker lo atiende, como cuando el pedido se pierde.
  await page.evaluate(() => new BroadcastChannel('vikarg-update').postMessage({ type: 'UPDATE_PENDING', bytes: 5_500_000, files: 12 }));
  await expect(page.getByTestId('update-pending')).toContainText('hasta', { timeout: 10_000 });
  await page.getByTestId('update-download').click();
  await expect(page.getByTestId('update-prompt')).toContainText('Bajando la versión nueva');
  await expect(page.getByTestId('update-stalled')).toHaveText('La descarga no arrancó. Probá de nuevo.', { timeout: 20_000 });
  // Reintentar vuelve a pedir la descarga y a esperar el avance.
  await page.getByTestId('update-retry').click();
  await expect(page.getByTestId('update-stalled')).toHaveCount(0);
  await expect(page.getByTestId('update-prompt')).toContainText('Bajando la versión nueva');
});

test('si llega un avance, no se ofrece reintentar', async ({ page }) => {
  await start(page);
  await page.evaluate(() => new BroadcastChannel('vikarg-update').postMessage({ type: 'UPDATE_PENDING', bytes: 5_500_000, files: 12 }));
  await page.getByTestId('update-download').click();
  await page.evaluate(() => new BroadcastChannel('vikarg-update').postMessage({ type: 'UPDATE_PROGRESS', bytes: 5_500_000, done: 1_000_000, files: 12, filesDone: 2 }));
  await expect(page.getByTestId('update-progress')).toBeVisible();
  await page.waitForTimeout(11_500);
  await expect(page.getByTestId('update-stalled')).toHaveCount(0);
  await expect(page.getByTestId('update-retry')).toHaveCount(0);
});

test('Ajustes: «Forzar actualización de la app» borra solo la copia de la app y recarga; los datos quedan', async ({ page }) => {
  await start(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  // Un dato de país guardado: tiene que sobrevivir.
  await page.evaluate(async () => {
    const c = await caches.open('vikarg-country');
    await c.put('/data/prueba-rescate.json', new Response('{"generatedAt":"2026-11-19"}'));
  });
  const before = await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith('workbox-precache')));
  expect(before.length).toBeGreaterThan(0);
  await page.goto('/#/settings');
  await page.getByTestId('force-update-btn').click();
  await expect(page.getByTestId('confirm-message')).toContainText('Tus datos no se tocan');
  // Cancelar no hace nada.
  await page.getByTestId('confirm-cancel').click();
  expect(await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith('workbox-precache')).length)).toBeGreaterThan(0);
  // Confirmar: recarga la página.
  await page.getByTestId('force-update-btn').click();
  await Promise.all([page.waitForEvent('load'), page.getByTestId('confirm-ok').click()]);
  // Los datos de países siguen, y la app vuelve a instalar su copia.
  expect(await page.evaluate(async () => (await (await caches.open('vikarg-country')).keys()).some((r) => r.url.endsWith('prueba-rescate.json')))).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith('workbox-precache')).length), { timeout: 60_000 }).toBeGreaterThan(0);
});

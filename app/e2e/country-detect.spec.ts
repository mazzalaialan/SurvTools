import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
// Laguna Llanganuco, dentro del Parque Nacional Huascarán (Perú). Los Ajustes arrancan con Argentina.
const HUASCARAN = { latitude: -9.03, longitude: -77.65 };
test.use({ geolocation: HUASCARAN, permissions: ['geolocation'] });

async function start(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

/** Qué archivos de datos están guardados en el dispositivo. */
const stored = (page: Page) =>
  page.evaluate(async () => (await (await caches.open('vikarg-country')).keys()).map((r) => new URL(r.url).pathname.split('/').pop()!));

const setConnection = (page: Page, type: string | null) =>
  page.addInitScript((t) => {
    Object.defineProperty(navigator, 'connection', { value: t === null ? undefined : { type: t, saveData: false }, configurable: true });
  }, type);

test('estás en otro país: se ofrece cambiar, se pregunta antes de bajar los datos (conexión desconocida) y los números son los del lugar', async ({ page }, testInfo) => {
  await setConnection(page, null);
  await start(page);
  // Cualquier pantalla con ubicación sirve: acá, Radio (el lugar sale del GPS).
  await page.goto('/#/first-aid/radio');
  const offer = page.getByTestId('country-offer');
  await expect(offer).toContainText('Estás en Perú: ¿usar Perú en la app?', { timeout: 15_000 });
  await expect(offer).toContainText('ahora es Argentina');
  // Sin Wi-Fi seguro: pregunta, con el peso, y todavía no bajó nada de Perú.
  const ask = page.getByTestId('country-download-ask');
  await expect(ask).toContainText('Para usar la app sin conexión en Perú hay que bajar');
  // Lo que falta (la pantalla de Radio ya bajó el paquete que necesitaba para funcionar): servicios y parques.
  await expect(ask).toContainText(/\d+(,\d)? (MB|KB)/);
  await expect(ask).toContainText('Los mapas sin conexión de otros países se bajan aparte');
  expect(await stored(page)).not.toContain('fuel-PE.json');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-95-country-offer.png` });

  // Bajar ahora: queda guardado el paquete de Perú y se cierra la pregunta.
  await page.getByTestId('country-download-yes').click();
  await expect(ask).toHaveCount(0, { timeout: 30_000 });
  expect(await stored(page)).toEqual(expect.arrayContaining(['PE.json', 'parks-PE.json', 'fuel-PE.json']));

  // Los números de emergencia: primero los del lugar (Perú) y, debajo y aparte, los de Ajustes (Argentina).
  await page.goto('/#/first-aid/contacts');
  await expect(page.getByTestId('national-here')).toContainText('Estás en Perú');
  await expect(page.getByTestId('national-numbers')).toContainText('Policía Nacional');
  await expect(page.getByTestId('national-home')).toContainText('País actual en Ajustes: Argentina');
  await expect(page.getByTestId('national-numbers-home')).toBeVisible();
  // El aviso de «usar Perú» sigue ahí (no se contestó); «No, gracias» lo saca y no vuelve a preguntar por Perú.
  await page.getByTestId('country-offer-no').click();
  await expect(page.getByTestId('country-offer')).toHaveCount(0);
  await page.reload();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByTestId('national-here')).toContainText('Estás en Perú');
  await expect(page.getByTestId('country-offer')).toHaveCount(0);
  // Los números del lugar siguen aunque no se haya cambiado el país de la app.
  await expect(page.getByTestId('national-numbers')).toContainText('Policía Nacional');
});

test('«Cambiar» pasa a Perú como país de la app: ya no se separan los números', async ({ page }) => {
  await setConnection(page, null);
  await start(page);
  await page.goto('/#/first-aid/radio');
  await expect(page.getByTestId('country-offer')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('country-download-no').click();
  await page.getByTestId('country-offer-change').click();
  await expect(page.getByTestId('country-offer')).toHaveCount(0);
  await page.goto('/#/first-aid/contacts');
  await expect(page.getByTestId('national-numbers')).toContainText('Policía Nacional');
  await expect(page.getByTestId('national-home')).toHaveCount(0);
  await expect(page.getByTestId('national-here')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'País' }).getByRole('button', { name: 'Perú', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('con Wi-Fi baja los datos del país solo, sin preguntar', async ({ page }) => {
  await setConnection(page, 'wifi');
  await start(page);
  await page.goto('/#/first-aid/radio');
  await expect(page.getByTestId('country-offer')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await stored(page)).includes('PE.json'), { timeout: 30_000 }).toBe(true);
  await expect(page.getByTestId('country-download-ask')).toHaveCount(0);
});

test('Buscar cercanos usa el país del lugar elegido: en un lugar de Perú, los servicios son los de Perú', async ({ page }) => {
  await setConnection(page, 'wifi');
  await start(page);
  await page.goto('/#/first-aid/contacts/nearby');
  // Con los Ajustes en Argentina y el lugar en Perú, se carga el paquete de Perú (se guarda en el dispositivo).
  await expect.poll(async () => (await stored(page)).includes('PE.json'), { timeout: 30_000 }).toBe(true);
  await expect(page.getByTestId('nearby-status')).toBeVisible();
});

test('al llegar a otro país se ofrece bajar el mapa del lugar: «Ver mapas» abre el panel de zona ahí', async ({ page }) => {
  await setConnection(page, null);
  await start(page);
  await page.goto('/#/first-aid/radio');
  await expect(page.getByTestId('map-offer')).toContainText('Llegaste a Perú', { timeout: 15_000 });
  await page.getByTestId('map-offer-yes').click();
  await expect(page).toHaveURL(/orientation\/maps\?bajar=-9\.03/);
  // El panel de descarga de zona queda abierto, sin bajar nada todavía.
  await expect(page.getByTestId('zone-panel')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('map-offer')).toHaveCount(0);
});

test('«No, gracias» a la oferta de mapas se recuerda y no vuelve a aparecer', async ({ page }) => {
  await setConnection(page, null);
  await start(page);
  await page.goto('/#/first-aid/radio');
  await expect(page.getByTestId('map-offer')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('map-offer-no').click();
  await expect(page.getByTestId('map-offer')).toHaveCount(0);
  const dismissed = await page.evaluate(() => document.querySelector('[data-testid="map-offer"]'));
  expect(dismissed).toBeNull();
});

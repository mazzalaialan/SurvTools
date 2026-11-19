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

test('estás en otro país: se pregunta si querés cambiarlo, sin bajar nada de ese país y con los números del país elegido', async ({ page }, testInfo) => {
  await setConnection(page, null);
  await start(page);
  // Una pantalla que lee el GPS pero no carga datos de ningún país por lugar: Mi ubicación (la de Radio, Cercanos, Clima y Navegación sí usan el país del lugar).
  await page.goto('/#/first-aid/location');
  const offer = page.getByTestId('country-offer');
  await expect(offer).toContainText('Estás en Perú: ¿usar Perú en la app?', { timeout: 15_000 });
  await expect(offer).toContainText('país actual (ahora es Argentina)');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-95-country-offer.png` });
  // Solo se pregunta: no se baja nada de Perú ni se pide confirmar ninguna descarga.
  await expect(page.getByTestId('country-download-ask')).toHaveCount(0);
  await page.waitForTimeout(1_500);
  expect(await stored(page)).not.toContain('PE.json');
  expect(await stored(page)).not.toContain('fuel-PE.json');

  // Los números de emergencia son los del país elegido (Argentina), aunque el GPS diga Perú.
  await page.goto('/#/first-aid/contacts');
  await expect(page.getByTestId('national-numbers')).not.toContainText('Policía Nacional');
  await expect(page.getByTestId('national-numbers')).toBeVisible();
  // El título dice a qué país corresponden los números.
  await expect(page.locator('#national-title')).toHaveText('Números nacionales de Argentina');
  await expect(page.getByTestId('national-here')).toHaveCount(0);
  await expect(page.getByTestId('national-home')).toHaveCount(0);
  // «No, gracias» saca la pregunta y no vuelve a preguntar por Perú (tampoco al reabrir la app).
  await page.getByTestId('country-offer-no').click();
  await expect(page.getByTestId('country-offer')).toHaveCount(0);
  await page.reload();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByTestId('national-numbers')).toBeVisible();
  await expect(page.getByTestId('country-offer')).toHaveCount(0);
  await expect(page.getByTestId('national-numbers')).not.toContainText('Policía Nacional');
  expect(await stored(page)).not.toContain('PE.json');
});

test('aceptar el cambio pasa a Perú como país elegido y baja su paquete; los números pasan a ser los de Perú', async ({ page }) => {
  await setConnection(page, null);
  await start(page);
  await page.goto('/#/first-aid/location');
  await expect(page.getByTestId('country-offer')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('country-offer-change').click();
  await expect(page.getByTestId('country-offer')).toHaveCount(0);
  // El país elegido cambió y se baja su paquete.
  await expect.poll(async () => (await stored(page)).includes('PE.json'), { timeout: 60_000 }).toBe(true);
  expect(await stored(page)).toEqual(expect.arrayContaining(['PE.json', 'parks-PE.json', 'fuel-PE.json']));
  await page.goto('/#/first-aid/contacts');
  await expect(page.locator('#national-title')).toHaveText('Números nacionales de Perú');
  await expect(page.getByTestId('national-numbers')).toContainText('Policía Nacional');
  await expect(page.getByRole('group', { name: 'País' }).getByRole('button', { name: 'Perú', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('con Wi-Fi tampoco se baja nada de un país que no elegiste', async ({ page }) => {
  await setConnection(page, 'wifi');
  await start(page);
  await page.goto('/#/first-aid/location');
  await expect(page.getByTestId('country-offer')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2_000);
  expect(await stored(page)).not.toContain('PE.json');
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

import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
// Centro de Curitiba (Paraná): sector Sul de Brasil. Los Ajustes arrancan con Argentina.
const CURITIBA = { latitude: -25.4284, longitude: -49.2733 };
test.use({ geolocation: CURITIBA, permissions: ['geolocation'] });

async function start(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}


/** Elige Brasil como país actual desde Ajustes (se despliegan los sectores al tocar Brasil y hay un botón aparte para usarlo). */
async function chooseBrazil(page: Page) {
  await page.goto('/#/settings');
  await page.getByTestId('country-pack-BR').getByRole('button', { name: 'Brasil' }).click();
  await page.getByTestId('country-sector-use-BR').click();
  await expect(page.getByTestId('country-pack-BR').getByRole('button', { name: 'Brasil' })).toHaveAttribute('aria-pressed', 'true');
}

const stored = (page: Page) =>
  page.evaluate(async () => (await (await caches.open('vikarg-country')).keys()).map((r) => new URL(r.url).pathname.split('/').pop()!));

const setConnection = (page: Page, type: string | null) =>
  page.addInitScript((t) => {
    Object.defineProperty(navigator, 'connection', { value: t === null ? undefined : { type: t, saveData: false }, configurable: true });
  }, type);

test('estás en Brasil sin Wi-Fi seguro: pregunta por el sector donde estás (Sul), lo baja y no baja los otros', async ({ page }, testInfo) => {
  await setConnection(page, null);
  await start(page);
  // Con Brasil elegido como país actual, estar en Brasil baja el sector donde estás parado (Mi ubicación lee el GPS).
  await chooseBrazil(page);
  await page.goto('/#/first-aid/location');
  const ask = page.getByTestId('country-download-ask');
  await expect(ask).toContainText('Brasil · Sul (PR, SC, RS)', { timeout: 20_000 });
  await expect(ask).toContainText(/\d+(,\d)? (MB|KB)/);
  expect(await stored(page)).not.toContain('BR-sul.json');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-101-sector-ask.png` });

  await page.getByTestId('country-download-yes').click();
  await expect(ask).toHaveCount(0, { timeout: 60_000 });
  const files = await stored(page);
  expect(files).toEqual(expect.arrayContaining(['BR-sul.json', 'fuel-BR-sul.json', 'parks-BR-sul.json']));
  expect(files).not.toContain('BR-sudeste.json');
  expect(files).not.toContain('fuel-BR-norte.json');

  // En Ajustes: solo el sector Sul figura bajado y se puede borrar; el borrado no se vuelve a bajar solo al volver a mirar el lugar.
  await page.goto('/#/settings');
  // Los sectores se ven al tocar Brasil (si están desplegados, no hace falta tocarlo).
  if (!(await page.getByTestId('country-sectors-BR').isVisible())) await page.getByTestId('country-pack-BR').getByRole('button', { name: 'Brasil' }).click();
  await expect(page.getByTestId('country-sector-sul')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  await expect(page.getByTestId('country-sector-sudeste')).toHaveAttribute('data-state', 'missing');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-102-sector-ready.png` });
  await page.getByTestId('country-sector-del-sul').click();
  await expect(page.getByTestId('confirm-message')).toContainText('Sul');
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('country-sector-sul')).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  expect(await stored(page)).not.toContain('BR-sul.json');
  await page.goto('/#/first-aid/location');
  await page.waitForTimeout(2_500);
  await expect(page.getByTestId('country-download-ask')).toHaveCount(0);
  expect(await stored(page)).not.toContain('BR-sul.json');
});

test('estás en Brasil con Wi-Fi: baja el sector donde estás sin preguntar', async ({ page }) => {
  await setConnection(page, 'wifi');
  await start(page);
  await chooseBrazil(page);
  await page.goto('/#/first-aid/location');
  await expect.poll(async () => (await stored(page)).includes('BR-sul.json'), { timeout: 60_000 }).toBe(true);
  await expect(page.getByTestId('country-download-ask')).toHaveCount(0);
  expect(await stored(page)).toEqual(expect.arrayContaining(['fuel-BR-sul.json', 'parks-BR-sul.json']));
});

test('estás en Brasil con otro país elegido: se pregunta si querés cambiarlo y, al aceptar, baja el sector donde estás', async ({ page }) => {
  await setConnection(page, 'wifi');
  await start(page);
  await page.goto('/#/first-aid/location');
  const offer = page.getByTestId('country-offer');
  await expect(offer).toContainText('Estás en Brasil: ¿usar Brasil en la app?', { timeout: 20_000 });
  // Mientras no aceptes no se baja nada de Brasil (ni siquiera con Wi-Fi).
  await page.waitForTimeout(2_000);
  expect(await stored(page)).not.toContain('BR-sul.json');
  await page.getByTestId('country-offer-change').click();
  await expect.poll(async () => (await stored(page)).includes('BR-sul.json'), { timeout: 60_000 }).toBe(true);
  expect(await stored(page)).not.toContain('BR-sudeste.json');
  await page.goto('/#/settings');
  await expect(page.getByTestId('country-pack-BR').getByRole('button', { name: 'Brasil' })).toHaveAttribute('aria-pressed', 'true');
});

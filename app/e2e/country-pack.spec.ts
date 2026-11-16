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

const stored = (page: Page) =>
  page.evaluate(async () => (await (await caches.open('vikarg-country')).keys()).map((r) => new URL(r.url).pathname.split('/').pop()!));

test('Ajustes: cada país dice si su paquete está sin bajar, se baja con el ícono sin elegir el país y queda con el tilde verde', async ({ page }, testInfo) => {
  await start(page);
  await page.goto('/#/settings');
  const py = page.getByTestId('country-pack-PY');
  // Paraguay no está bajado: ícono de descarga, con el peso en la ayuda.
  await expect(py).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  const get = page.getByTestId('country-pack-get-PY');
  await expect(get).toHaveAttribute('aria-label', /Bajar los datos sin conexión de Paraguay \(\d+(,\d)? (MB|KB)\)/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-96-country-pack-missing.png` });

  // El ícono baja el paquete sin cambiar el país de la app (sigue en Argentina).
  await get.click();
  await expect(py).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  expect(await stored(page)).toEqual(expect.arrayContaining(['PY.json', 'parks-PY.json', 'fuel-PY.json']));
  await expect(page.getByTestId('country-pack-AR').getByRole('button', { name: 'Argentina', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(py.getByRole('img', { name: /Paraguay: datos sin conexión bajados y al día/ })).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-97-country-pack-ready.png` });

  // Elegir un país sin bajar también lo baja.
  const bo = page.getByTestId('country-pack-BO');
  await expect(bo).toHaveAttribute('data-state', 'missing');
  await bo.getByRole('button', { name: 'Bolivia', exact: true }).click();
  await expect(bo).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  expect(await stored(page)).toEqual(expect.arrayContaining(['BO.json', 'parks-BO.json']));
});

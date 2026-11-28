import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
test.use({ geolocation: { latitude: -34.92, longitude: -57.95 }, permissions: ['geolocation'] });
test.beforeEach(async ({ context }) => {
  await context.route(/\/api\/om\//, (route) => route.fulfill({ status: 404, json: { error: 'sin copia propia' } }));
  // Pronóstico del corral: mañana 38 °C (pasa el límite de la gallina, 36 °C).
  await context.route('https://api.open-meteo.com/v1/forecast**', (route) => {
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    return route.fulfill({ json: { daily: { time: [0, 1, 2, 3].map(day), temperature_2m_max: [30, 38, 31, 29], temperature_2m_min: [18, 22, 17, 15] } } });
  });
});

test('granja: calculadora, calendario y mis animales (producción al inventario y eventos que suman o restan)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' }).first()).toBeVisible();

  // Calculadora: 4 personas al 50 % → 4 gallinas (364 × 4 × 0,5 / 220).
  await page.goto('/#/farm/plan');
  await page.getByTestId('farm-people').fill('4');
  await expect(page.getByTestId('farm-plan-gallina')).toContainText('4 reproductoras');
  await expect(page.getByTestId('farm-plan-meat')).toBeVisible();

  // Calendario: abril en la región pampeana tiene la vacunación obligatoria de aftosa.
  await page.goto('/#/farm/calendar');
  await page.getByTestId('farm-region').selectOption('pampeana');
  while (!/abril/i.test((await page.getByTestId('farm-month').textContent()) ?? '')) await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(page.getByTestId('farm-tasks').locator('[data-kind="obligatorio"]').first()).toContainText(/aftosa/i);

  // Corrales (como los canteros): uno con nombre; el lote se crea adentro.
  await page.goto('/#/farm/herd');
  await page.getByTestId('farm-add-pen').click();
  await page.getByTestId('pen-name').fill('Gallinero');
  await page.getByRole('button', { name: /marcarlo con el GPS/ }).click();
  await expect(page.getByLabel('Lugar')).toHaveValue(/.+/);
  await page.goto('/#/farm/herd');
  await expect(page.getByTestId('farm-pen-card')).toContainText('Gallinero');
  await page.getByTestId('farm-new-pen').selectOption({ label: 'Gallinero' });

  // Mis animales: un lote de gallinas, 6 huevos al inventario y una compra de 3 que suma.
  await page.getByTestId('farm-new-species').selectOption('gallina');
  await page.getByTestId('farm-add-herd').click();
  await expect(page.getByTestId('farm-herd')).toBeVisible();
  await expect(page.getByTestId('herd-pen').locator('option:checked')).toHaveText('Gallinero');
  await page.getByTestId('herd-eggs-6').click();
  await expect(page.getByTestId('herd-production')).toContainText('6 u');
  await page.getByTestId('herd-event-kind').selectOption('bought');
  await page.getByTestId('herd-event-count').fill('3');
  await page.getByTestId('herd-add-event').click();
  await expect(page.getByTestId('herd-count')).toHaveValue('4');
  // Aviso de calor del corral (pronóstico del lugar contra el límite de la especie).
  await page.goto('/#/farm/herd');
  await expect(page.getByTestId('farm-alerts').locator('[data-kind="heat"]')).toContainText('Gallinero');
  await page.goto('/#/farm/vet');
  await expect(page.getByTestId('farm-senasa')).toBeVisible();
  await page.goBack();
  await page.goBack();
  await page.screenshot({ path: 'test-results/farm-herd.png', fullPage: true });

  const herdUrl = page.url();

  // Los huevos quedaron en el inventario (Alimento).
  await page.goto('/#/inventory/items');
  await expect(page.locator('main')).toContainText('Huevos (Gallina');

  // Sincronizados: borrar la producción en Granja borra el lote del inventario…
  await page.goto(herdUrl);
  await page.getByTestId('herd-production').getByRole('button', { name: 'Borrar' }).click();
  await expect(page.getByTestId('herd-production')).not.toContainText('6 u');
  await page.getByTestId('herd-eggs-12').click();
  await expect(page.getByTestId('herd-production')).toContainText('12 u');
  await page.goto('/#/inventory/items');
  await page.locator('main').getByRole('link', { name: /Huevos \(Gallina/ }).click();
  await expect(page.locator('main')).toContainText('12');
  await expect(page.locator('main')).not.toContainText(/\b6 u\b/);
  // …y borrar el artículo del inventario borra la producción anotada en Granja.
  await page.locator('main').getByRole('button', { name: 'Eliminar', exact: true }).last().click();
  await page.getByTestId('confirm-ok').click();
  await expect(page).toHaveURL(/#\/inventory\/items$/);
  await page.goto(herdUrl);
  await expect(page.getByTestId('herd-production')).not.toContainText('12 u');
});

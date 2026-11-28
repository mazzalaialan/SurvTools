import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

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

  // Mis animales: un lote de gallinas, 6 huevos al inventario y una compra de 3 que suma.
  await page.goto('/#/farm/herd');
  await page.getByTestId('farm-new-species').selectOption('gallina');
  await page.getByTestId('farm-add-herd').click();
  await expect(page.getByTestId('farm-herd')).toBeVisible();
  await page.getByTestId('herd-eggs-6').click();
  await expect(page.getByTestId('herd-production')).toContainText('6 u');
  await page.getByTestId('herd-event-kind').selectOption('bought');
  await page.getByTestId('herd-event-count').fill('3');
  await page.getByTestId('herd-add-event').click();
  await expect(page.getByTestId('herd-count')).toHaveValue('4');
  await page.screenshot({ path: 'test-results/farm-herd.png', fullPage: true });

  // Los huevos quedaron en el inventario (Alimento).
  await page.goto('/#/inventory/items');
  await expect(page.locator('main')).toContainText('Huevos (Gallina');
});

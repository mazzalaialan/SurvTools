import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('granja: sección aparte con fichas (sin descargar nada), aviso fijo, sanidad abierta y normas', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' }).first()).toBeVisible();

  await page.goto('/#/farm');
  await page.locator('main').getByRole('link', { name: /Especies/ }).click();
  await expect(page.getByTestId('farm-notice')).toBeVisible();
  await expect(page.getByTestId('farm-aves').getByRole('link')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/farm-list.png', fullPage: true });
  await page.getByTestId('farm-conejos').getByRole('link').first().click();
  await expect(page.getByTestId('farm-species')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Conejo');
  // Sanidad empieza abierta, con el aviso de veterinario; el resto, cerrado.
  await expect(page.getByTestId('farm-health-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('farm-space-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: 'test-results/farm-species.png', fullPage: true });
  await page.getByRole('link', { name: 'Normas y registro' }).click();
  await expect(page.getByTestId('farm-rules')).toContainText('RENSPA');
  // Ñandú: fauna silvestre, aviso legal fijo arriba de la ficha.
  await page.goto('/#/farm/species/nandu');
  await expect(page.getByTestId('farm-warning')).toBeVisible();
  await page.screenshot({ path: 'test-results/farm-rules.png' });
});

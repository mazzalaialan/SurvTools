import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PASSWORD = 'prueba-segura-123';
const FISH = readFileSync(new URL('./fixtures/fish-AR.json', import.meta.url), 'utf8');

test('pesca: portada, mapa con un pez elegido, ficha del pez con carnadas y ficha del tramo', async ({ page, context }) => {
  // Datos de prueba en lugar del paquete real (dos tramos, dos peces).
  await context.route(/\/data\/fish-AR\.json/, (route) => route.fulfill({ contentType: 'application/json', body: FISH }));

  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' }).first()).toBeVisible();

  // La sección está en Inicio.
  await expect(page.locator('main').getByRole('link', { name: /Mapa de pesca/ })).toBeVisible();

  await page.goto('/#/fishing');
  await expect(page.getByTestId('fish-status')).toContainText('2 peces');
  await expect(page.getByTestId('fish-notice')).toContainText('No es oficial');

  // Mapa: todos los tramos; con la perca, uno solo.
  await page.getByTestId('fish-open-map').click();
  await expect(page.getByTestId('fish-count')).toHaveText('3 tramos');
  await expect(page.getByTestId('fish-map').locator('[data-fishing]')).toHaveAttribute('data-fishing', '3');
  await page.getByTestId('fish-chip-perca').click();
  await expect(page.getByTestId('fish-count')).toHaveText('1 tramo con Perca criolla');
  await page.getByRole('button', { name: 'Ver lista' }).click();
  await page.getByTestId('fish-sheet').getByRole('link', { name: /Río Aluminé/ }).click();

  // Ficha del tramo: peces con sus reglas.
  await expect(page.getByTestId('fish-sector-page')).toBeVisible();
  await expect(page.getByTestId('fish-sector-species')).toContainText('Cupo: 2 por día · Talla mínima: 30 cm');
  // Colores: verde la perca (cupo), y el texto que nombra a los salmónidos los aclara.
  await expect(page.getByTestId('fish-sector-species').getByRole('link', { name: /Perca criolla/ })).toHaveAttribute('data-rule', 'keep');
  await expect(page.getByTestId('fish-group-hint')).toContainText('truchas (arcoíris, marrón');
  // El permiso: qué hace falta y el enlace oficial para sacarlo.
  await expect(page.getByTestId('fish-permit')).toContainText('Residente: diario · $12.500');
  await expect(page.getByTestId('fish-permit-buy')).toHaveAttribute('href', 'https://example.org/permisos/');
  await page.getByTestId('fish-sector-species').getByRole('link', { name: /Trucha arcoíris/ }).click();

  // Ficha del pez: carnadas y tramos.
  await expect(page.getByTestId('fish-baits')).toContainText('Woolly Bugger');
  // Para una emergencia: lo que come, aparte y con la aclaración del reglamento.
  await expect(page.getByTestId('fish-survival')).toContainText('Lombriz de tierra');
  await expect(page.getByTestId('fish-survival')).toContainText('prohibida');
  await expect(page.getByTestId('fish-page')).toContainText('2 tramos donde se pesca');
  await expect(page.getByTestId('fish-sector-list')).toContainText('Captura y devolución');
  // Amarillo donde es con devolución.
  await expect(page.getByTestId('fish-sector-list').getByRole('link', { name: /Río Chimehuín/ })).toHaveAttribute('data-rule', 'release');

  // Rojo donde la pesca está prohibida.
  await page.goto('/#/fishing/sector/neuquen-pocahullo');
  await expect(page.getByTestId('fish-forbidden')).toHaveText('Pesca no autorizada');
});

import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('fauna: se baja aparte, mapa por provincia con Entre Ríos judicializada y especies amenazadas en rojo', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' }).first()).toBeVisible();

  // Portada: solo las fichas de la sección.
  await page.goto('/#/fauna');
  await expect(page.locator('main').getByRole('link', { name: /Caza por provincia/ })).toBeVisible();

  // Fauna es una descarga aparte: la ficha ofrece bajarla.
  await page.locator('main').getByRole('link', { name: /Caza por provincia/ }).click();
  await expect(page.getByTestId('fauna-pack-offer')).toBeVisible();
  await page.getByTestId('fauna-pack-get').click();
  await expect(page.getByTestId('fauna-provinces')).toBeVisible();
  await expect(page.locator('path[data-province="Entre Ríos"]')).toBeVisible();
  // Zoom: el botón + acerca el mapa (cambia el encuadre) y CABA se puede tocar.
  const svg = page.getByTestId('fauna-country-map').locator('svg[role="img"]');
  const before = await svg.getAttribute('viewBox');
  await page.getByTestId('fauna-country-map').getByTestId('zoom-in').click();
  await expect(svg).not.toHaveAttribute('viewBox', before!);

  // Entre Ríos: aviso de judicializada.
  await page.getByTestId('fauna-provinces').getByRole('link', { name: /Entre Ríos/ }).click();
  await expect(page.getByTestId('fauna-warning')).toContainText('judicializada');
  // Mapa por departamentos: tocar uno rayado muestra qué dice la norma.
  await page.getByTestId('fauna-dept-map').locator('path[data-dept="Diamante"]').click();
  await expect(page.getByTestId('fauna-dept-picked')).toContainText('Se caza solo en una parte');

  // Catamarca: el loro barranquero va como protegido.
  await page.goto('/#/fauna/p/catamarca');
  await expect(page.getByTestId('fauna-protected-species').first()).toContainText('no se caza');

  // Especies: el pecarí (amenazado) en rojo, con «caza no permitida».
  await page.goto('/#/fauna/species');
  const pecari = page.locator('.fish-card[data-threatened]', { hasText: 'Pecarí de collar' });
  await expect(pecari).toContainText('caza no permitida');
  await pecari.click();
  await expect(page.getByTestId('fauna-threatened')).toBeVisible();

  // Protegidas: el yaguareté (no se caza en ningún lado) aparece en rojo con el filtro.
  await page.goto('/#/fauna/species');
  await page.getByTestId('fauna-kind-banned').click();
  await expect(page.locator('.fish-card[data-threatened]', { hasText: 'Yaguareté' })).toBeVisible();
  await expect(page.locator('.fish-card', { hasText: 'Jabalí' })).toHaveCount(0);

  // Venenosas: la yarará grande, con su marca y qué hacer ante una mordedura.
  await page.getByTestId('fauna-kind-venomous').click();
  await page.locator('.fish-card', { hasText: 'Yarará grande' }).click();
  await expect(page.getByTestId('fauna-bite')).toContainText('Si te muerde');
});

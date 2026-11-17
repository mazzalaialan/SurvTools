import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

async function createVault(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

test('exportar en un dispositivo y restaurar en otro, con todo lo cargado', async ({ page, browser }, testInfo) => {
  await createVault(page);
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Mochila');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await page.goto('/#/inventory/items/new');
  await page.getByLabel('Nombre').fill('Linterna frontal');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/items\/[0-9a-f-]{36}$/);

  // Ficha de una mascota con sus vacunas, y de una persona con foto.
  await page.goto('/#/first-aid/medical/new');
  await page.getByRole('button', { name: 'Mascota' }).click();
  await page.getByLabel('Nombre').fill('Toby');
  await page.getByLabel('Especie').selectOption({ label: 'Perro' });
  await page.getByLabel('Última vacuna antirrábica').fill('2026-03-10');
  await page.getByLabel('Última vacuna séxtuple / polivalente').fill('2026-04-02');
  await page.getByLabel('Última desparasitación').fill('2026-08-20');
  await page.getByLabel('Última pipeta antipulgas').fill('2026-10-01');
  await page.getByLabel('¿Está castrado/a?').selectOption({ label: 'Sí' });
  await expect(page.getByText('Médico / obra social')).toHaveCount(0);
  await expect(page.getByLabel('Veterinario')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);

  const photo = testInfo.outputPath('ana.png');
  await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 150, b: 120 } } }).png().toFile(photo);
  await page.goto('/#/first-aid/medical/new');
  await page.getByLabel('Nombre').fill('Ana');
  await page.getByRole('button', { name: 'Guardar' }).click();
  // Esperar a que termine de guardar antes de seguir (si no, la navegación de abajo puede cortarlo y el resumen cuenta una ficha menos).
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  await page.getByTestId('person-photo-file').setInputFiles(photo);
  await expect(page.getByRole('img', { name: 'Ana' })).toBeVisible();

  // Un documento, un waypoint y una ruta.
  await page.goto('/#/documents/new');
  await page.getByLabel('Título').fill('DNI de Ana');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/documents\/[0-9a-f-]{36}$/);
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio');
  await page.getByLabel('Coordenadas').fill('-41.13, -71.31');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/waypoints\/[0-9a-f-]{36}$/);
  await page.goto('/#/orientation/routes/new');
  await page.getByLabel('Nombre de la ruta').fill('Evacuación');
  await page.getByLabel('Elegí un punto guardado').selectOption({ label: 'Refugio' });
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/routes\/[0-9a-f-]{36}$/);

  await page.goto('/#/settings/backup');
  await expect(page.getByText('Todavía no hiciste ningún backup.')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^vikarg-backup-\d{4}-\d{2}-\d{2}\.vikarg$/);
  const file = testInfo.outputPath('backup.vikarg');
  await download.saveAs(file);
  await expect(page.getByText('Último backup: hoy.')).toBeVisible();

  // El backup vive en Ajustes: la sección muestra el último y la dirección vieja redirige.
  await page.getByTestId('back').click();
  await expect(page.getByTestId('settings-last-backup')).toHaveText('Último backup: hoy.');
  await page.goto('/#/inventory/backup');
  await expect(page).toHaveURL(/#\/settings\/backup$/);
  await page.goto('/#/inventory');
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Backup/ })).toHaveCount(0);

  // Otro dispositivo: contexto nuevo, almacenamiento vacío.
  const other = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
  const page2 = await other.newPage();
  await page2.goto('/');
  await page2.getByRole('button', { name: '¿Ya tenés un backup? Restaurarlo' }).click();
  await page2.getByLabel('Archivo de backup').setInputFiles(file);
  // El resumen nombra todo lo que trae.
  const summary = page2.getByTestId('backup-summary');
  for (const part of ['Ubicaciones: 1', 'Artículos: 1', 'Fichas médicas: 2', 'Fotos: 1', 'Documentos: 1', 'Waypoints: 1', 'Rutas: 1']) {
    await expect(summary).toContainText(part);
  }

  await page2.getByLabel('Contraseña que tenías al exportarlo').fill('equivocada-1');
  await page2.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page2.getByText('La contraseña no corresponde a este backup.')).toBeVisible();

  await page2.getByLabel('Contraseña que tenías al exportarlo').fill(PASSWORD);
  await page2.getByRole('button', { name: 'Restaurar' }).click();
  // Al terminar, la app vuelve sola a Inicio: esperar antes de navegar.
  await expect(page2).toHaveURL(/#\/$/);
  await expect(page2.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page2.goto('/#/inventory/items');
  await expect(page2.getByText('Linterna frontal')).toBeVisible();

  // La mascota llega con todos sus datos, y la persona con su foto.
  await page2.goto('/#/first-aid/medical');
  await expect(page2.getByText(/^Perro · antirrábica hace \d+ meses$/)).toBeVisible();
  await expect(page2.locator('img.avatar')).toHaveCount(1);
  await page2.getByRole('link', { name: /Toby/ }).click();
  await expect(page2.getByLabel('Última vacuna antirrábica')).toHaveValue('2026-03-10');
  await expect(page2.getByLabel('Última vacuna séxtuple / polivalente')).toHaveValue('2026-04-02');
  await expect(page2.getByLabel('Última desparasitación')).toHaveValue('2026-08-20');
  await expect(page2.getByLabel('Última pipeta antipulgas')).toHaveValue('2026-10-01');
  await expect(page2.getByLabel('¿Está castrado/a?')).toHaveValue('yes');
  await page2.goto('/#/orientation/routes');
  await expect(page2.getByText('Evacuación')).toBeVisible();
  await page2.goto('/#/documents');
  await expect(page2.getByText('DNI de Ana')).toBeVisible();
  await other.close();
});

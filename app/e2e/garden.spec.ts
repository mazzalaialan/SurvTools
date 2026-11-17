import { expect, test, type Page } from '@playwright/test';

// La copia propia de Open-Meteo del servidor no entra en las pruebas: 404 = «no está ahí», y la app pasa al servicio simulado de abajo.
test.beforeEach(async ({ context }) => {
  await context.route(/\/api\/om\//, (route) => route.fulfill({ status: 404, json: { error: 'sin copia propia' } }));
});

const PASSWORD = 'prueba-segura-123';
// Una casa en La Plata (zona Pampeana).
const HOME = { latitude: -34.92, longitude: -57.95 };
test.use({ geolocation: HOME, permissions: ['geolocation'] });

// Fecha local, como la usa la app (en UTC, de 21 a 24 h en Argentina ya es el día siguiente).
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const day = (offset: number) => iso(new Date(Date.now() + offset * 86_400_000));

/** Clima de la huerta: 10 días sin lluvia y helada fuerte mañana. */
function gardenWeather() {
  const days = Array.from({ length: 13 }, (_, i) => day(i - 10));
  return {
    latitude: HOME.latitude,
    longitude: HOME.longitude,
    timezone: 'America/Argentina/Buenos_Aires',
    daily: {
      time: days,
      et0_fao_evapotranspiration: days.map(() => 5),
      precipitation_sum: days.map(() => 0),
      temperature_2m_min: days.map((d) => (d === day(1) ? -1 : 8)),
    },
  };
}

async function shot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `e2e-results/screens/${project}-${name}.png`, fullPage: true });
}

test('huerta: calendario por zona, canteros con waypoint, grilla, avisos por lugar, cosecha al inventario y almácigo', async ({ page, context }, testInfo) => {
  const p = testInfo.project.name;
  await context.route('https://api.open-meteo.com/v1/forecast**', (route) => {
    const url = route.request().url();
    if (url.includes('et0_fao_evapotranspiration')) return route.fulfill({ json: gardenWeather() });
    return route.fulfill({ status: 503 });
  });

  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Calendario: sin lugar, Pampeana; la NEA avisa que es estimada.
  await page.goto('/#/garden/calendar');
  await expect(page.getByLabel('Zona')).toBeVisible();
  await expect(page.getByTestId('plan-sow')).toBeVisible();
  await page.getByLabel('Zona').selectOption('nea');
  await expect(page.getByTestId('zone-estimated')).toBeVisible();
  await page.getByLabel('Zona').selectOption('auto');
  await shot(page, '39-garden-calendar', p);
  await page.getByRole('link', { name: /^Tomate/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Tomate' })).toBeVisible();
  await expect(page.getByText('Se lleva bien con')).toBeVisible();
  await shot(page, '40-garden-crop', p);

  // Cantero 1, marcado con el GPS: queda como waypoint.
  await page.goto('/#/garden/beds');
  await page.getByRole('button', { name: 'Cantero', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ancho (cm)').fill('120');
  await dialog.getByLabel('Largo (cm)').fill('240');
  await expect(dialog.getByText('Grilla de 4 × 8 cuadros de 30 cm.')).toBeVisible();
  await dialog.getByRole('button', { name: /marcarlo con el GPS/ }).click();
  await expect(dialog.getByLabel('Dónde está (waypoint)')).toHaveValue(/.+/);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Cantero 1' })).toBeVisible();
  await expect(page.getByTestId('bed-place')).toContainText('Cantero 1');

  // Lechuga en dos cuadros, tomate en otro.
  async function plant(cells: number[], crop: string) {
    for (const c of cells) await page.getByTestId(`cell-${c}`).click();
    await page.getByTestId('plant-here').click();
    await page.getByRole('dialog').getByLabel('Cultivo').selectOption({ label: crop });
    await page.getByTestId('save-planting').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await plant([0, 1], 'Lechuga');
  await plant([2], 'Tomate');
  await expect(page.getByTestId('cell-0')).toHaveText('Le');
  await expect(page.getByTestId('cell-2')).toHaveText('To');
  await expect(page.getByTestId('bed-recs-list')).toBeVisible();
  await shot(page, '41-garden-bed', p);

  // Cantero 2 en el mismo lugar (otro waypoint a metros) y un invernadero sin ubicación.
  await page.goto('/#/garden/beds');
  await page.getByRole('button', { name: 'Cantero', exact: true }).click();
  await dialog.getByRole('button', { name: /marcarlo con el GPS/ }).click();
  await expect(dialog.getByLabel('Dónde está (waypoint)')).toHaveValue(/.+/);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Cantero 2' })).toBeVisible();
  await plant([0], 'Pimiento (morrón)');
  await page.goto('/#/garden/beds');
  await page.getByRole('button', { name: 'Cantero', exact: true }).click();
  await dialog.getByLabel('Nombre').fill('Invernadero');
  await dialog.getByTestId('bed-greenhouse').check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Invernadero' })).toBeVisible();
  await plant([0], 'Berenjena');

  // Un solo aviso de helada y uno de riego para todo lo de casa; la berenjena del invernadero no cuenta.
  await page.goto('/#/garden/beds');
  await expect(page.getByTestId('garden-frost')).toHaveCount(1);
  await expect(page.getByTestId('garden-frost')).toContainText('Tomate');
  await expect(page.getByTestId('garden-frost')).toContainText('Pimiento');
  await expect(page.getByTestId('garden-frost')).not.toContainText('Berenjena');
  await expect(page.getByTestId('garden-water')).toHaveCount(1);
  await expect(page.getByTestId('garden-unplaced')).toHaveCount(0);
  await shot(page, '42-garden', p);
  await page.getByTestId('garden-water').getByRole('button', { name: 'Regué' }).click();
  await expect(page.getByTestId('garden-water')).toHaveCount(0);
  await expect(page.getByTestId('garden-water-ok')).toBeVisible();

  // En Inicio, el mismo aviso de helada.
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByTestId('garden-frost')).toHaveCount(1);

  // Cosecha de lechuga al inventario (sin ubicaciones: crea "Despensa").
  await page.goto('/#/garden/beds');
  await page.getByRole('link', { name: /^Cantero 1/ }).click();
  await page.getByTestId('cell-0').click();
  await dialog.getByRole('button', { name: 'Empecé a cosechar' }).click();
  await dialog.getByLabel('Cantidad').fill('3');
  await dialog.getByLabel('Unidad').selectOption('u');
  await expect(dialog.getByTestId('harvest-to-inventory')).toBeChecked();
  await dialog.getByRole('button', { name: 'Anotar cosecha' }).click();
  await expect(dialog.getByTestId('harvest-list')).toContainText('3 unidades');
  await expect(dialog.getByTestId('harvest-list')).toContainText('en el inventario');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await page.goto('/#/inventory/items');
  await expect(page.getByText('Lechuga (de la huerta)')).toBeVisible();

  // Almácigo de hace 2 meses: tarea de trasplantar, y se ubica en un cantero.
  await page.goto('/#/garden/beds');
  await page.getByRole('button', { name: 'Almácigo', exact: true }).click();
  await dialog.getByLabel('Cultivo').selectOption({ label: 'Tomate' });
  await dialog.getByLabel('Almácigo hecho el').fill(day(-60));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('garden-tasks')).toContainText('Trasplantar Tomate');
  await page.getByTestId('garden-tasks').getByRole('button', { name: /Trasplantar Tomate/ }).click();
  await page.getByTestId('transplant').click();
  await expect(page.getByTestId('transplant-choose-bed')).toBeVisible();
  await page.getByRole('link', { name: /^Cantero 2/ }).click();
  await expect(page.getByTestId('transplant-banner')).toBeVisible();
  await page.getByTestId('cell-3').click();
  await page.getByTestId('place-transplant').click();
  await expect(page.getByTestId('cell-3')).toHaveText('To');
  await expect(page.getByTestId('transplant-banner')).toHaveCount(0);
  await page.goto('/#/garden/beds');
  await expect(page.getByTestId('garden-tasks')).toHaveCount(0);
  await expect(page.getByTestId('nursery-list')).toHaveCount(0);

  // Inventario: la "Despensa" que creó la cosecha se ubica con el GPS (para los avisos de peligros cerca de la reserva).
  await page.goto('/#/inventory/locations');
  await expect(page.getByText('Despensa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  const locDialog = page.getByRole('dialog');
  await expect(locDialog.getByLabel('Dónde está (waypoint)')).toHaveValue('');
  await locDialog.getByRole('button', { name: /marcarlo con el GPS/ }).click();
  await expect(locDialog.getByLabel('Dónde está (waypoint)')).toHaveValue(/.+/);
  await locDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(locDialog).toHaveCount(0);
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Despensa', { exact: true })).toBeVisible();
});

test('huerta: sol del cantero según su entorno y distribución de varias plantas sin que una tape a otra', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/garden/beds');
  await page.getByRole('button', { name: 'Cantero', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ancho (cm)').fill('120');
  await dialog.getByLabel('Largo (cm)').fill('240');
  await dialog.getByRole('button', { name: /marcarlo con el GPS/ }).click();
  await expect(dialog.getByLabel('Dónde está (waypoint)')).toHaveValue(/.+/);

  // Sol calculado: el frente mira al norte; sin nada que tape da el día largo.
  await dialog.getByRole('button', { name: 'Calcular según el entorno' }).click();
  // El dial: tocar a la derecha (este) da un rumbo cerca de 90°.
  const dial = dialog.getByTestId('bearing-dial');
  await dial.scrollIntoViewIfNeeded();
  const dbox = (await dial.boundingBox())!;
  await page.mouse.click(dbox.x + dbox.width * 0.95, dbox.y + dbox.height / 2);
  const bearingInput = dialog.getByLabel(/Hacia dónde mira el frente/);
  await expect.poll(async () => Number(await bearingInput.inputValue())).toBeGreaterThan(80);
  await expect.poll(async () => Number(await bearingInput.inputValue())).toBeLessThan(100);
  await bearingInput.fill('0');
  const result = dialog.getByTestId('bed-sun-result');
  await expect(result).toContainText('Sol directo');
  const open = Number((await result.locator('strong').innerText()).match(/unas ([\d.,]+) h/)![1]!.replace(',', '.'));
  expect(open).toBeGreaterThan(9);

  // Una pared de 3 m pegada al lado norte le saca horas; una malla del 50 % las reduce más.
  await dialog.getByTestId('wall-front').check();
  await dialog.getByLabel('Altura de la pared en cm').fill('300');
  await expect(result).not.toContainText(`unas ${String(open).replace('.', ',')} h`);
  await dialog.getByRole('button', { name: 'Media 50%' }).click();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Cantero 1' })).toBeVisible();

  // Distribuir tomate y zanahoria: el tomate (alto) va al sur (abajo) y la zanahoria al norte.
  const layout = page.getByTestId('bed-layout');
  await expect(layout).toContainText('El sol viene sobre todo del');
  await layout.getByLabel('Agregar un cultivo').selectOption({ label: 'Tomate' });
  await layout.getByLabel('Agregar un cultivo').selectOption({ label: 'Zanahoria' });
  await expect(page.getByTestId('layout-chosen')).toContainText('Tomate');
  await layout.getByTestId('layout-run').click();
  await expect(page.getByTestId('layout-result')).toContainText('su sombra llega');
  await layout.getByTestId('layout-plant-tomate').click();
  await expect(page.getByRole('dialog').getByLabel('Cultivo')).toHaveValue('tomate');
});

test('huerta: ficha del cultivo con «guardar semilla propia» (dificultad, aislamiento, cuánto dura y fuentes), en español e inglés', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Zanahoria: bienal, difícil, aislamiento grande.
  await page.goto('/#/garden/crops/zanahoria');
  const seeds = page.getByTestId('seed-section');
  await expect(seeds).toBeVisible();
  await expect(seeds.getByRole('heading', { name: 'Guardar semilla propia' })).toBeVisible();
  await expect(page.getByTestId('seed-level')).toHaveText('Difícil');
  await expect(page.getByTestId('seed-isolation')).toContainText('1000 m');
  await expect(seeds).toContainText('Bienal');
  await expect(page.getByTestId('seed-caveat')).toBeVisible();
  await seeds.getByText('Cómo cosechar, secar y guardar').click();
  await expect(seeds.getByText('Cuándo cosechar')).toBeVisible();
  await seeds.getByText('Fuentes', { exact: true }).click();
  await expect(seeds.getByRole('link').first()).toHaveAttribute('href', /^https?:\/\//);
  await expect(seeds).toContainText('solo se tomaron datos');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-60-seeds.png`, fullPage: true });

  // Papa: no se multiplica por semilla, no lleva aislamiento.
  await page.goto('/#/garden/crops/papa');
  await expect(page.getByTestId('seed-section')).toContainText('Se multiplica por partes');
  await expect(page.getByTestId('seed-isolation')).toContainText('No aplica');

  // Tomate: fácil, años típicos.
  await page.goto('/#/garden/crops/tomate');
  await expect(page.getByTestId('seed-level')).toHaveText('Fácil');
  await expect(page.getByTestId('seed-section')).toContainText('4 a 6 años');

  // Guardar las semillas en el inventario: el vencimiento sale solo (4 años) y se puede cambiar.
  await page.getByTestId('seed-to-inventory').click();
  await expect(page.getByTestId('seed-stock-form')).toBeVisible();
  await page.getByLabel('Variedad (opcional)').fill('Platense');
  await page.getByTestId('seed-qty').fill('3');
  const inFourYears = new Date();
  inFourYears.setFullYear(inFourYears.getFullYear() + 4);
  await expect(page.getByTestId('seed-expiry')).toHaveValue(new RegExp(`^${inFourYears.getFullYear()}-`));
  await page.getByTestId('seed-stock-save').click();
  await expect(page.getByTestId('seed-stock-done')).toContainText('categoría Semillas');
  await page.goto('/#/inventory/items');
  await expect(page.getByText('Semillas de Tomate Platense')).toBeVisible();
  // La categoría nueva está en el filtro y el artículo cae en ella.
  await page.getByRole('combobox').first().selectOption({ label: 'Semillas' });
  await expect(page.getByText('Semillas de Tomate Platense')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-61-seeds-inventory.png`, fullPage: true });
});

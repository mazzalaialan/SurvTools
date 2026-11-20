import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `e2e-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
}

test('configuración inicial, ubicaciones, artículo con lote y alerta', async ({ page }) => {
  await page.goto('/');

  // Bóveda
  await expect(page.getByRole('heading', { name: 'Te damos la bienvenida' })).toBeVisible();
  await shot(page, '01-setup');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();

  await expect(page.getByRole('heading', { name: 'Clave de recuperación' })).toBeVisible();
  await expect(page.locator('.recovery-key')).toHaveText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
  await shot(page, '02-recovery');
  const continueBtn = page.getByRole('button', { name: 'Continuar' });
  await expect(continueBtn).toBeDisabled();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await continueBtn.click();

  await expect(page.getByText('Las alertas de vencimiento aparecerán acá')).toBeVisible();
  await shot(page, '03-home-empty');

  // Secciones
  await page.getByRole('link', { name: 'Orientación', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Orientación' })).toBeVisible();
  await expect(page.getByText('Brújula', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Emergencia', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Emergencias' })).toBeVisible();
  await expect(page.getByText('Ficha médica')).toBeVisible();
  await page.getByRole('link', { name: 'Meteo' }).click();
  await expect(page.getByRole('heading', { name: 'Meteorología' })).toBeVisible();
  await expect(page.getByText('Sol y luna')).toBeVisible();
  // En el celular, Inventario, Huerta y Biblioteca están en "Más"; en pantallas anchas, en el riel.
  const more = page.getByRole('button', { name: 'Más' });
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole('dialog').getByRole('link', { name: 'Inventario' }).click();
    await expect(more).toHaveClass(/active/);
  } else {
    await page.getByRole('link', { name: 'Inventario', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole('dialog').getByRole('link', { name: 'Huerta y cultivo' }).click();
  } else {
    await page.getByRole('link', { name: 'Huerta' }).click();
  }
  await expect(page.getByRole('link', { name: /Calendario de siembra/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mis canteros/ })).toBeVisible();
  await shot(page, '03b-garden');

  // Ubicaciones
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Casa');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Agregar sububicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Sótano');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Sótano', { exact: true })).toBeVisible();
  await shot(page, '04-locations');

  // Artículo
  await page.goto('/#/inventory/items');
  await page.getByRole('link', { name: 'Nuevo artículo' }).click();
  await page.getByLabel('Nombre').fill('Atún');
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimento' });
  await page.getByLabel('Unidad', { exact: true }).fill('latas');
  await page.getByLabel('Peso por latas').fill('170');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/#\/inventory\/items\/[0-9a-f-]{36}$/);

  // Lote que vence en 10 días
  await page.getByRole('button', { name: 'Agregar lote' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ubicación').selectOption({ label: 'Casa › Sótano' });
  await dialog.getByLabel('Cantidad').fill('6');
  await dialog.getByLabel('Fecha de vencimiento').fill(isoInDays(10));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Vence en 10 días')).toBeVisible();
  await shot(page, '05-item');

  // Agua por envases: el peso es por litro y el envase vacío solo suma si se carga.
  await page.goto('/#/inventory/items/new');
  await page.getByLabel('Nombre').fill('Agua');
  await page.getByLabel('Unidad', { exact: true }).fill('L');
  await expect(page.getByText('Peso por L')).toBeVisible();
  await page.getByLabel('Peso por L').fill('1');
  await page.getByLabel('Unidad de peso').selectOption('kg');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/items\/[0-9a-f-]{36}$/);

  await page.getByRole('button', { name: 'Agregar lote' }).click();
  const water = page.getByRole('dialog');
  await water.getByLabel('Cargar por envases').check();
  await water.getByLabel('Cantidad de envases').fill('4');
  await water.getByLabel('Contenido de cada uno (L)').fill('6');
  await water.getByLabel('Envase (opcional)').fill('botella');
  await water.getByLabel('Peso del envase vacío (opcional)').fill('300');
  await expect(water.getByText('Total: 24 L')).toBeVisible();
  await water.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('4 × botella de 6 L = 24 L')).toBeVisible();

  // El lote nuevo copia el envase anterior; se cambia a un bidón sin tara.
  await page.getByRole('button', { name: 'Agregar lote' }).click();
  await expect(water.getByLabel('Cargar por envases')).toBeChecked();
  await expect(water.getByLabel('Envase (opcional)')).toHaveValue('botella');
  await water.getByLabel('Cantidad de envases').fill('1');
  await water.getByLabel('Contenido de cada uno (L)').fill('20');
  await water.getByLabel('Envase (opcional)').fill('bidón');
  await water.getByLabel('Peso del envase vacío (opcional)').fill('');
  await water.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Total: 44 L · 45,2 kg')).toBeVisible();
  await shot(page, '05b-water');

  // Regresión: crear "Agua" desde la ficha de otro artículo no debe pisar al "Atún".
  await page.goto('/#/inventory/items');
  await expect(page.getByText('Atún')).toBeVisible();
  // Cada fila dice qué es el número: «Stock: 6 latas · 1 lote · Sótano».
  await expect(page.getByText(/Stock: 6 latas · 1 lote/)).toBeVisible();
  await expect(page.getByText(/Stock: 44 L · /)).toBeVisible();

  // Una unidad escrita como número («1») no se muestra como «1 1»: se avisa al escribirla y se guarda como «unidades».
  await page.goto('/#/inventory/items/new');
  await page.getByLabel('Nombre').fill('Gasa hemostática');
  await page.getByLabel('Unidad', { exact: true }).fill('1');
  await expect(page.getByTestId('unit-hint')).toContainText('parece una cantidad, no una unidad');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/items\/[0-9a-f-]{36}$/);
  await page.goto('/#/inventory/items');
  await expect(page.getByText('Sin stock cargado')).toBeVisible();

  // Inicio muestra la alerta
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { name: '1 alerta' })).toBeVisible();
  await shot(page, '06-home-alert');

  // Bloquear y desbloquear: los datos siguen ahí
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await expect(page.getByRole('heading', { name: 'Desbloquear' })).toBeVisible();
  await page.getByLabel('Contraseña').fill('incorrecta-123');
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByText('Contraseña incorrecta.')).toBeVisible();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('heading', { name: '1 alerta' })).toBeVisible();

  // Tema rojo nocturno
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Rojo nocturno', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
  await page.goto('/#/inventory/items');
  await shot(page, '07-items-red');
});

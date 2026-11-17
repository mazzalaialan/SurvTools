import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

test('botiquín de trauma: contenido, vencimientos y faltantes', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Un lugar común donde va a estar el botiquín.
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Auto');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Emergencia', exact: true }).click();
  await page.getByRole('link', { name: /Botiquines/ }).click();
  await expect(page.getByText('Todavía no armaste botiquines')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo botiquín' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Nuevo botiquín' })).toBeVisible();
  await dialog.getByLabel('Nombre').fill('Trauma del auto');
  await dialog.getByLabel('¿Es un botiquín?').selectOption({ label: 'Trauma' });
  await dialog.getByLabel('Dentro de').selectOption({ label: 'Auto' });
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Trauma · Auto')).toBeVisible();

  // Contenido: un torniquete nuevo que vence pronto.
  await page.getByRole('link', { name: /Trauma del auto/ }).click();
  await expect(page.getByText('El botiquín está vacío.')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar' }).click();
  await dialog.getByLabel('Nombre').fill('Torniquete CAT');
  await dialog.getByLabel('Unidad').fill('unidades');
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByLabel('Ubicación')).toHaveValue(/.+/);
  await expect(dialog.getByLabel('Ubicación').locator('option:checked')).toHaveText('Auto › Trauma del auto');
  await dialog.getByLabel('Cantidad').fill('1');
  await dialog.getByLabel('Fecha de vencimiento').fill(isoInDays(5));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Vence en 5 días')).toBeVisible();

  // Mínimo de 2 torniquetes en ese botiquín → falta 1.
  await page.goto('/#/inventory/items');
  await page.getByRole('link', { name: /Torniquete CAT/ }).click();
  await expect(page.getByLabel('Categoría', { exact: true }).locator('option:checked')).toHaveText('Botiquín');
  await page.getByLabel('Ubicación').selectOption({ label: 'Auto › Trauma del auto' });
  await page.getByLabel('Mínimo', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Agregar mínimo' }).click();

  // El faltante de mínimo queda en el índice de notificaciones (solo con el nombre, sin la ubicación).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<{ lotId: string; itemName: string; kind: string }[]>((resolve) => {
            const req = indexedDB.open('vikarg-user');
            req.onsuccess = () => {
              const get = req.result.transaction('alertIndex').objectStore('alertIndex').getAll();
              get.onsuccess = () => resolve(get.result);
            };
          }),
      ),
    )
    .toContainEqual(expect.objectContaining({ itemName: 'Torniquete CAT', kind: 'minStock', lotId: expect.stringMatching(/^min:/) }));

  await page.goto('/#/first-aid/kits');
  await expect(page.getByText('2 a revisar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Para revisar' })).toBeVisible();
  await page.locator('a[href^="#/first-aid/kits/"]:not([href$="/build"])').click();
  await expect(page.getByRole('heading', { name: 'Falta', exact: true })).toBeVisible();
  await expect(page.getByText('1 de 2 unidades')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-11-kit.png`, fullPage: true });

  // El botiquín también se ve como ubicación del inventario.
  await page.goto('/#/inventory/locations');
  await expect(page.getByText('Trauma del auto')).toBeVisible();
});

test('asistente «Armar botiquín»: crea el botiquín con los mínimos y después dice qué falta', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Se llega desde Botiquines (y también hay una tarjeta en Primeros auxilios).
  await page.goto('/#/first-aid');
  await expect(page.getByRole('link', { name: /Armar botiquín/ })).toBeVisible();
  await page.getByRole('link', { name: /Botiquines/ }).click();
  await page.getByTestId('kits-build').click();
  await expect(page.getByRole('heading', { name: 'Armar un botiquín' })).toBeVisible();

  // Escenario «Hemorragia grave», nivel individual: el torniquete, la gasa hemostática y el vendaje de presión.
  await page.getByTestId('kb-scenario-bleeding').click();
  await expect(page.getByTestId('kb-desc')).toContainText('IFAK/JFAK');
  await expect(page.getByTestId('kb-row-tourniquet')).toBeVisible();
  await expect(page.getByTestId('kb-row-hemostatic')).toBeVisible();
  // Lo que requiere entrenamiento no aparece en el nivel individual y sí en el avanzado, marcado.
  await expect(page.getByTestId('kb-row-needle')).toHaveCount(0);
  await page.getByTestId('kb-level-advanced').click();
  await expect(page.getByTestId('kb-row-needle')).toContainText('solo personal entrenado');
  await page.getByTestId('kb-level-individual').click();
  // El torniquete explica para qué sirve y muestra las dos posturas de las fuentes.
  await page.getByTestId('kb-row-tourniquet').getByRole('button', { name: /Torniquete/ }).click();
  await expect(page.getByTestId('kb-row-tourniquet')).toContainText('Las fuentes difieren');
  // Se destilda uno y en otro se dice cuántos hay: con 1 de 2 guantes, queda 1 como faltante.
  await page.getByTestId('kb-row-shears').getByRole('checkbox', { name: /Incluir/ }).uncheck();
  await page.getByTestId('kb-have-gloves').fill('1');
  await expect(page.getByTestId('kb-gap-gloves')).toContainText('falta 1');
  await expect(page.getByTestId('kb-gap-tourniquet')).toContainText('falta 1');
  await page.getByTestId('kb-name').fill('IFAK de la mochila');
  await page.getByTestId('kb-create').click();

  // El botiquín nuevo: lo que se dijo que había está cargado y lo que no llega a la cantidad figura como faltante.
  await expect(page.getByRole('heading', { name: 'IFAK de la mochila' })).toBeVisible();
  await expect(page.getByText('Guantes de nitrilo').first()).toBeVisible();
  await expect(page.getByText('1 de 2 pares')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Falta', exact: true })).toBeVisible();
  await expect(page.getByText('Torniquete de molinete')).toBeVisible();
  await expect(page.getByText('Tijera de trauma')).toHaveCount(0);

  // La lista de faltantes del botiquín se puede imprimir en PDF (A4) y compartir.
  const missingBox = page.getByTestId('kit-missing');
  await expect(missingBox).toContainText('Guantes de nitrilo');
  await expect(missingBox.getByTestId('km-share')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), missingBox.getByTestId('km-pdf').click()]);
  expect(download.suggestedFilename()).toMatch(/^Lista-de-compras-IFAK-de-la-mochila.*\.pdf$/);
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  // Una hoja A4 (595 × 842 pt) con una imagen que la cubre.
  expect(bytes.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  await expect(page.getByTestId('km-message')).toContainText('PDF listo');

  // «Compré»: lo que faltaba (1 par de guantes) pasa al contenido y deja de figurar como faltante.
  await missingBox.locator('li', { hasText: 'Guantes de nitrilo' }).getByRole('button', { name: 'Compré' }).click();
  await expect(page.getByTestId('km-qty')).toHaveValue('1');
  await page.getByTestId('km-confirm').click();
  await expect(missingBox).not.toContainText('Guantes de nitrilo');
  await expect(page.getByRole('heading', { name: 'Contenido' })).toBeVisible();
  await expect(page.getByText('Guantes de nitrilo').first()).toBeVisible();

  // «¿Qué le falta?»: se compara con la plantilla y se puede dejar como mínimo.
  await page.getByTestId('kc-toggle').click();
  await expect(page.getByTestId('kc-scenario')).toHaveValue('bleeding');
  await expect(page.getByTestId('kc-summary')).toContainText('Faltan');
  await expect(page.getByTestId('kc-missing')).toContainText('Gasa hemostática');
  await expect(page.getByTestId('kc-missing')).toContainText('Tijera de trauma');
  await page.getByTestId('kc-mins').click();
  await expect(page.getByTestId('kc-message')).toContainText('stock mínimo');
});

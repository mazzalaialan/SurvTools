import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Simula una versión nueva publicada: se cambia el sw.js del build que sirve el servidor de pruebas
 * (Playwright no intercepta el pedido del service worker que hace el navegador al buscar
 * actualizaciones) y al final se deja como estaba. Las pruebas corren de a una.
 */
const SW = new URL('../dist/sw.js', import.meta.url);

test('actualización: avisa enseguida al abrir, se puede dejar para más tarde y vuelve a preguntar al reabrir', async ({ page }) => {
  // Cambiar el sw.js afectaría a otras pruebas que corran a la vez: solo con un proceso.
  test.skip(test.info().config.workers > 1, 'cambia el sw.js servido: solo corre con workers = 1');
  const original = readFileSync(SW, 'utf8');
  try {
    await page.goto('/');
    // Primera visita: la app queda instalada y el service worker la controla (eso no se avisa).
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
    await expect(page.getByTestId('update-prompt')).toHaveCount(0);

    writeFileSync(SW, `${original}\n// versión de prueba\n`);
    await page.reload();
    const prompt = page.getByTestId('update-prompt');
    // Aparece en la pantalla de entrada, antes de loguearse.
    await expect(prompt).toBeVisible({ timeout: 30_000 });
    await expect(prompt).toContainText(/Bajando la versión nueva|Hay una versión nueva/);
    await expect(prompt.getByRole('button', { name: 'Actualizar' })).toBeVisible({ timeout: 60_000 });

    // Más tarde: no molesta más en esta sesión.
    await page.getByTestId('update-later').click();
    await expect(prompt).toHaveCount(0);

    // Al volver a abrir la app, pregunta otra vez.
    await page.reload();
    await expect(page.getByTestId('update-prompt').getByRole('button', { name: 'Actualizar' })).toBeVisible({ timeout: 30_000 });
  } finally {
    writeFileSync(SW, original);
  }
});

test('actualización con algo para bajar: no baja sola, dice cuánto pesa, se puede dejar para más tarde y al confirmar muestra el avance y ofrece actualizar', async ({ page, context }) => {
  test.skip(test.info().config.workers > 1, 'cambia el sw.js servido: solo corre con workers = 1');
  const original = readFileSync(SW, 'utf8');
  try {
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);

    // Versión nueva con un archivo distinto (la revisión de index.html cambia): hay algo para bajar.
    const changed = original.replace(/("revision":")([^"]*)("\s*,\s*"url":"index\.html")/, '$1prueba-$2$3');
    expect(changed).not.toBe(original);
    writeFileSync(SW, `${changed}\n// versión de prueba con archivo nuevo\n`);
    await page.reload();
    const prompt = page.getByTestId('update-prompt');
    // No baja sola: pregunta, con el peso, y la versión nueva todavía no está lista (no hay «Actualizar»).
    await expect(page.getByTestId('update-pending')).toContainText('Para actualizar hay que bajar hasta', { timeout: 30_000 });
    await expect(page.getByTestId('update-pending')).toContainText(/\d/);
    await expect(prompt.getByRole('button', { name: 'Actualizar' })).toHaveCount(0);
    expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(false);

    // Más tarde: se oculta; al reabrir, pregunta de nuevo.
    await page.getByTestId('update-later').click();
    await expect(prompt).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('update-pending')).toBeVisible({ timeout: 30_000 });

    // Descargar ahora: termina y aparece «Actualizar» (el avance se ve mientras baja, si dura).
    await page.getByTestId('update-download').click();
    await expect(prompt.getByRole('button', { name: 'Actualizar' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('update-pending')).toHaveCount(0);

    // Actualizar: la versión nueva queda activa con todo guardado: la app abre sin conexión.
    await prompt.getByRole('button', { name: 'Actualizar' }).click();
    // La página se recarga sola al activar: se espera a que ya no haya versión esperando y el nuevo worker controle.
    await expect
      .poll(
        async () => {
          try {
            return await page.evaluate(async () => ((await navigator.serviceWorker.getRegistration())?.waiting ? 'esperando' : navigator.serviceWorker.controller ? 'listo' : 'sin control'));
          } catch {
            return 'navegando';
          }
        },
        { timeout: 30_000 },
      )
      .toBe('listo');
    await page.waitForLoadState('load');
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Te damos la bienvenida')).toBeVisible({ timeout: 30_000 });
    await context.setOffline(false);
  } finally {
    writeFileSync(SW, original);
  }
});

import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SW = new URL('../dist/sw.js', import.meta.url);
test.use({ viewport: { width: 393, height: 851 }, hasTouch: true });

test('actualización con la app ya abierta (celular): tocar «Actualizar» activa la versión nueva y recarga la página, sin quedarse el aviso', async ({ page }) => {
  test.skip(test.info().config.workers > 1, 'cambia el sw.js: workers = 1');
  const original = readFileSync(SW, 'utf8');
  try {
    await page.goto('/');
    await page.getByLabel('Contraseña', { exact: true }).fill('prueba-segura-123');
    await page.getByLabel('Repetir contraseña').fill('prueba-segura-123');
    await page.getByRole('button', { name: 'Crear bóveda' }).click();
    await page.getByLabel('Ya la anoté en un lugar seguro').check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
    writeFileSync(SW, `${original}\n// versión de prueba móvil\n`);
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    const btn = page.getByTestId('update-prompt').getByRole('button', { name: 'Actualizar' });
    await expect(btn).toBeVisible({ timeout: 60_000 });
    // Nada tapa el botón: el toque llega a él (visto en un celular: parecía que no se podía tocar).
    const libre = await btn.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === b || b.contains(top);
    });
    expect(libre).toBe(true);
    let loads = 0;
    page.on('load', () => loads++);
    await btn.tap();
    // La página se recarga sola y el aviso desaparece (antes la versión se activaba pero la pantalla quedaba igual).
    await expect.poll(() => loads, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('update-prompt')).toHaveCount(0, { timeout: 15_000 });
  } finally {
    writeFileSync(SW, original);
  }
});

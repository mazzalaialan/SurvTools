import { expect, test, type Page } from '@playwright/test';
import { openSection } from './settingsSections';

const PASSWORD = 'prueba-segura-123';

test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'] });

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

/** Cuántos píxeles "encendidos" (estrellas, líneas) tiene el canvas: si está vacío, algo falló. */
const litPixels = (page: Page) =>
  page.getByTestId('sky-canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! + d[i + 1]! + d[i + 2]! > 200) n++;
    return n;
  });

test('mapa estelar: cielo completo, guía al Sur, búsqueda, hora y rojo nocturno', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('link', { name: 'Orientación', exact: true }).click();
  await page.getByRole('link', { name: /Mapa estelar/ }).click();
  await expect(page.getByTestId('sky-canvas')).toBeVisible();

  // Al entrar se prende el rojo nocturno; se puede apagar.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
  await page.getByLabel('Rojo nocturno (no encandila)').uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Una noche de otoño en Buenos Aires: la Cruz del Sur alta en el cielo.
  await page.getByLabel('Fecha y hora').fill('2026-05-15T22:00');
  await expect(page.getByRole('button', { name: 'Guía al Sur' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Prolongá el eje largo de la Cruz del Sur/)).toBeVisible();
  const full = await litPixels(page);
  expect(full).toBeGreaterThan(500);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-19-starmap-dome.png`, fullPage: true });

  // Buscar un astro.
  await page.getByLabel('Buscar un astro').fill('Cruz del Sur');
  await expect(page.getByTestId('sky-target')).toHaveText(/^Cruz del Sur: acimut \d+° \((S|SE|SO)\), altura \d+°$/);
  await page.getByLabel('Buscar un astro').fill('Sol');
  await expect(page.getByTestId('sky-target')).toHaveText('Sol está debajo del horizonte en este momento.');

  // Cambiar la hora: "Ahora" vuelve al cielo actual.
  await page.getByRole('button', { name: '+1 h' }).click();
  await expect(page.getByLabel('Fecha y hora')).toHaveValue('2026-05-15T23:00');
  await page.getByRole('button', { name: 'Ahora', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ahora', exact: true })).toBeDisabled();

  // Capas: apagar constelaciones y la guía despeja la pantalla, y se recuerda.
  await page.getByLabel('Fecha y hora').fill('2026-05-15T22:00');
  await page.getByRole('button', { name: 'Constelaciones', exact: true }).click();
  await page.getByRole('button', { name: 'Guía al Sur' }).click();
  await expect(page.getByText(/Prolongá el eje largo/)).toHaveCount(0);
  await expect.poll(() => litPixels(page)).toBeLessThan(full);

  // Rojo prendido a mano y, al salir del mapa, vuelve el tema de siempre.
  await page.getByLabel('Rojo nocturno (no encandila)').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Sin el rojo automático al abrir, entra con el tema normal; las capas quedaron como se dejaron.
  await page.goto('/#/orientation/starmap');
  await page.getByLabel('Prender el rojo nocturno al abrir el mapa estelar').uncheck();
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'Orientación', exact: true }).click();
  await page.getByRole('link', { name: /Mapa estelar/ }).click();
  await expect(page.getByTestId('sky-canvas')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Constelaciones', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('rojo nocturno automático: horario fijo y al anochecer', async ({ page }) => {
  // 30/10/2026 20:30 en Buenos Aires: ya terminó el crepúsculo civil (~19:47).
  await page.clock.setFixedTime(new Date('2026-10-30T23:30:00Z'));
  await setup(page);
  await page.goto('/#/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openSection(page, 'redschedule');

  await page.getByRole('button', { name: 'Horario' }).click();
  await page.getByLabel('Desde').fill('20:00');
  await page.getByLabel('Hasta').fill('06:00');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
  await page.getByLabel('Desde').fill('21:00');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Al anochecer' }).click();
  await expect(page.getByTestId('dusk-place')).toHaveText('Se calcula el anochecer para tu zona (aprox. -34,5, -58,5).');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');

  // Se mantiene con la app bloqueada (el tema no depende de los datos cifrados).
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await expect(page.getByRole('button', { name: 'Desbloquear', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
});

test('mapa estelar: apuntar al cielo con la brújula del celular', async ({ page }, testInfo) => {
  // Sensor simulado: celular parado mirando hacia el sur (con la declinación de Buenos Aires, ~10° O).
  await page.addInitScript(() => {
    setInterval(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 170, beta: 110, gamma: 0, absolute: true }));
    }, 30);
  });
  await setup(page);
  await page.goto('/#/orientation/starmap');
  await page.getByLabel('Fecha y hora').fill('2026-05-15T22:00');
  await page.getByRole('button', { name: 'Apuntar al cielo' }).click();
  await expect(page.getByTestId('sky-hint')).toHaveText(/Levantá el celular hacia el cielo/);
  // Mirando al sur geográfico (~180°), 20° por encima del horizonte.
  await expect(page.getByTestId('sky-pointing')).toHaveText(/^Mirando a 1(79|80|81)° \(S\), 20° sobre el horizonte$/);
  await page.waitForTimeout(500);
  expect(await litPixels(page)).toBeGreaterThan(200);
  await page.getByLabel('Buscar un astro').fill('Acrux');
  await expect(page.getByTestId('sky-target')).toHaveText(/^Acrux: acimut/);

  // Pantalla completa con hacia dónde se mira y el astro buscado encima.
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(page.locator('.fs-overlay')).toContainText(/Mirando a 1(79|80|81)° \(S\)/);
  await expect(page.locator('.fs-overlay')).toContainText(/Acrux: acimut/);
  const viewport = page.viewportSize()!;
  await expect.poll(async () => (await page.locator('.sky-stage').boundingBox())!.height).toBeGreaterThanOrEqual(viewport.height - 2);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-20b-starmap-fullscreen.png` });
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await expect(page.locator('.fs-overlay')).toHaveCount(0);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-20-starmap-camera.png`, fullPage: true });
});

import { magvar } from 'magvar';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const HERE = { latitude: -34.603722, longitude: -58.381592 };
const TARGET = { lat: -34.595, lon: -58.372 }; // ~1,3 km al NE

test.use({
  geolocation: HERE,
  permissions: ['geolocation', 'camera'],
  // Cámara falsa de Chromium (patrón de prueba) sin diálogo de permiso.
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

/** Simula el sensor: emite `deviceorientationabsolute` continuamente con los ángulos que se fijen. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __orientation: { alpha: number; beta: number; gamma: number } };
    w.__orientation = { alpha: 0, beta: 0, gamma: 0 };
    setInterval(() => {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { ...w.__orientation, absolute: true }));
    }, 30);
  });
});

const setOrientation = (page: Page, alpha: number, beta: number, gamma = 0) =>
  page.evaluate((o) => ((window as unknown as { __orientation: object }).__orientation = o), { alpha, beta, gamma });

function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(r(b.lon - a.lon)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

test('brújula: norte geográfico con declinación y magnético', async ({ page }) => {
  await setup(page);
  await page.getByRole('link', { name: 'Orientación', exact: true }).click();
  await page.getByRole('link', { name: /Brújula/ }).click();

  // Celular acostado apuntando al norte magnético: el norte geográfico está ~9,5° al este.
  // Lo avanzado está plegado: se abre para ver y cambiar la referencia del norte.
  await page.getByTestId('compass-advanced').getByText('Norte verdadero o magnético').click();
  await expect(page.getByRole('button', { name: 'Geográfico' })).toBeVisible();
  await setOrientation(page, 0, 0);
  await expect(page.getByTestId('declination')).toHaveText(/Declinación en tu ubicación: \d+,\d° O/);
  await expect(page.getByTestId('compass-heading')).toHaveText(/^35\d° N$/);
  await page.getByRole('button', { name: 'Magnético', exact: true }).click();
  await expect(page.getByTestId('compass-heading')).toHaveText('0° N');
  await setOrientation(page, 90, 0); // girado 90° a la izquierda → oeste
  await expect(page.getByTestId('compass-heading')).toHaveText('270° O');
});

test('ir al punto: dos opciones (mapa o vista 3D sin cámara), flecha acostado y horizonte parado', async ({ page }, testInfo) => {
  await setup(page);
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio');
  await page.getByLabel('Coordenadas').fill(`${TARGET.lat}, ${TARGET.lon}`);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('link', { name: 'Ir a este punto' }).click();
  await expect(page.getByRole('heading', { name: 'Ir a Refugio' })).toBeVisible();
  await expect(page.getByTestId('goto-distance')).toHaveText(/^1,\d+ km$/);

  const trueBearing = bearing({ lat: HERE.latitude, lon: HERE.longitude }, TARGET);
  const declination = magvar(HERE.latitude, HERE.longitude, 0, new Date());
  const magneticToTarget = trueBearing - declination;

  // Primero se elige cómo guiarse: no se prende la cámara.
  await expect(page.getByTestId('goto-choose')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await page.getByTestId('goto-choose-3d').click();

  // Acostado, mirando al norte magnético: hay que girar a la derecha.
  await setOrientation(page, 0, 0);
  await expect(page.getByTestId('goto-turn')).toHaveText(/Girá \d+° a la derecha/);
  await expect(page.getByTestId('rose-target')).toBeVisible();
  // Apuntando al punto: seguí derecho.
  await setOrientation(page, (360 - magneticToTarget) % 360, 0);
  await expect(page.getByTestId('goto-turn')).toHaveText('Seguí derecho');

  // Parado frente al punto: vista 3D negra con el faro en el centro.
  await setOrientation(page, (360 - magneticToTarget) % 360, 90);
  const guide = page.getByTestId('horizon-guide');
  await expect(guide).toBeVisible();
  const beacon = page.getByTestId('hg-beacon');
  await expect(beacon).toBeVisible();
  const view = await guide.boundingBox();
  const box = await beacon.boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - (view!.x + view!.width / 2))).toBeLessThan(view!.width * 0.08);
  await expect(page.locator('video')).toHaveCount(0);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-13-3d.png` });

  // De espaldas al punto: flecha en el borde para girar.
  await setOrientation(page, (360 - magneticToTarget + 180) % 360, 90);
  await expect(page.getByTestId('hg-edge')).toBeVisible();
  await expect(beacon).toHaveCount(0);

  // El selector Mapa | Brújula 3D cambia de vista sin volver a preguntar; el mapa abre sin cámara.
  await page.getByTestId('goto-view-map').click();
  await expect(page.getByTestId('guide-map')).toBeVisible();
});

test('ahorro de batería: negro puro, sin animaciones y ir al punto no prende la cámara', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Ahorro de batería' }).click();
  await expect(page.getByTestId('saver-hint')).toContainText('OLED');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'saver');
  await expect(html).toHaveAttribute('data-saver', '');
  // Fondo y tarjetas en negro puro.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');
  expect(await page.locator('.card').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
  expect(await page.locator('.btn').first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-15-saver.png`, fullPage: true });

  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio');
  await page.getByLabel('Coordenadas').fill(`${TARGET.lat}, ${TARGET.lon}`);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('link', { name: 'Ir a este punto' }).click();
  await expect(page.getByTestId('goto-distance')).toHaveText(/^1,\d+ km$/);
  // Ofrece mapa o vista 3D y no prende la cámara.
  await expect(page.getByTestId('goto-choose')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);

  // Al volver a otro tema, se apaga.
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Oscuro' }).click();
  await expect(html).not.toHaveAttribute('data-saver');
});

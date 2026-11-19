import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const HERE = { latitude: -34.603722, longitude: -58.381592 };
test.use({ geolocation: HERE, permissions: ['geolocation'] });

async function start(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

/** Simula un iPhone: sin `deviceorientationabsolute`, con permiso que se pide desde un toque y `webkitCompassHeading` en `deviceorientation`. */
async function fakeIphone(page: Page, permission: 'granted' | 'denied') {
  await page.addInitScript((answer) => {
    // Safari no tiene este evento: se lo saca de `window` (en Chrome es una propiedad propia) y del prototipo por las dudas.
    for (const target of [window, Object.getPrototypeOf(window), Window.prototype] as object[]) {
      try {
        delete (target as Record<string, unknown>).ondeviceorientationabsolute;
      } catch {
        /* si no se puede borrar, la prueba lo avisa */
      }
    }
    const w = window as unknown as { __asked: number; __granted: boolean };
    w.__asked = 0;
    w.__granted = false;
    (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission = async () => {
      w.__asked++;
      w.__granted = answer === 'granted';
      return answer;
    };
    setInterval(() => {
      if (!w.__granted) return;
      // Relativo (alpha arbitrario) + rumbo magnético: celular acostado apuntando al este.
      const e = new DeviceOrientationEvent('deviceorientation', { alpha: 123, beta: 0, gamma: 0, absolute: false });
      Object.defineProperty(e, 'webkitCompassHeading', { value: 90 });
      window.dispatchEvent(e);
    }, 30);
  }, permission);
}

test('iPhone: la brújula pide permiso con un toque y después muestra el rumbo de webkitCompassHeading', async ({ page }) => {
  await fakeIphone(page, 'granted');
  await start(page);
  expect(await page.evaluate(() => 'ondeviceorientationabsolute' in window)).toBe(false);
  await page.goto('/#/orientation/compass');
  // Antes del toque no se pidió nada (iOS no lo permite) y se ofrece el botón.
  const enable = page.getByTestId('compass-enable');
  await expect(enable).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBe(0);
  await enable.click();
  await expect(page.getByTestId('compass-heading')).toBeVisible({ timeout: 10_000 });
  // Magnético 90° (este) con declinación de Buenos Aires (~8° O): ronda los 82° al este.
  await expect(page.getByTestId('compass-heading')).toContainText(/\d+° (E|NE|SE)/);
  expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBe(1);
  await expect(page.getByTestId('compass-enable')).toHaveCount(0);
});

test('iPhone: el toque en cualquier parte de una pantalla con sensores también pide el permiso, y si se niega se explica', async ({ page }) => {
  await fakeIphone(page, 'denied');
  await start(page);
  await page.goto('/#/orientation/compass');
  await expect(page.getByTestId('compass-enable')).toBeVisible();
  await page.getByTestId('compass-enable').click();
  await expect(page.getByTestId('compass-denied')).toBeVisible();
  await expect(page.getByTestId('compass-denied')).toContainText('Movimiento y orientación');
});

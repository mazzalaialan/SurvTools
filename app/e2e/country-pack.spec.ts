import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

async function start(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

const stored = (page: Page) =>
  page.evaluate(async () => (await (await caches.open('vikarg-country')).keys()).map((r) => new URL(r.url).pathname.split('/').pop()!));

test('Ajustes: cada país dice si su paquete está sin bajar, se baja con el ícono sin elegir el país y queda con el tilde verde', async ({ page }, testInfo) => {
  await start(page);
  await page.goto('/#/settings');
  const py = page.getByTestId('country-pack-PY');
  // Paraguay no está bajado: ícono de descarga, con el peso en la ayuda.
  await expect(py).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  const get = page.getByTestId('country-pack-get-PY');
  await expect(get).toHaveAttribute('aria-label', /Bajar los datos sin conexión de Paraguay \(\d+(,\d)? (MB|KB)\)/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-96-country-pack-missing.png` });

  // El ícono baja el paquete sin cambiar el país de la app (sigue en Argentina).
  await get.click();
  await expect(py).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  expect(await stored(page)).toEqual(expect.arrayContaining(['PY.json', 'parks-PY.json', 'fuel-PY.json']));
  await expect(page.getByTestId('country-pack-AR').getByRole('button', { name: 'Argentina', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(py.getByRole('img', { name: /Paraguay: datos sin conexión bajados y al día/ })).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-97-country-pack-ready.png` });

  // Elegir un país sin bajar también lo baja.
  const bo = page.getByTestId('country-pack-BO');
  await expect(bo).toHaveAttribute('data-state', 'missing');
  await bo.getByRole('button', { name: 'Bolivia', exact: true }).click();
  await expect(bo).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  expect(await stored(page)).toEqual(expect.arrayContaining(['BO.json', 'parks-BO.json']));
});

test('Ajustes: el mapa de países muestra el estado de cada uno y baja el que se toca', async ({ page }, testInfo) => {
  await start(page);
  await page.goto('/#/settings');
  await expect(page.getByTestId('country-pack-PY')).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  await page.getByTestId('country-pack-map-open').click();
  const map = page.getByTestId('country-map');
  await expect(map).toBeVisible();
  // Mismo estado que el selector: Paraguay sin bajar, y el país elegido (Argentina) con el panel abierto.
  const py = page.getByTestId('country-map-PY');
  await expect(py).toHaveAttribute('data-state', 'missing');
  await expect(page.getByTestId('country-map-panel')).toContainText('Argentina');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-98-country-map-missing.png` });

  // Tocar Paraguay: el panel dice que falta y ofrece bajarlo.
  await py.click();
  await expect(page.getByTestId('country-map-state')).toContainText('Sin bajar');
  await page.getByTestId('country-map-get').click();
  await expect(py).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('country-map-state')).toContainText('Bajado y al día');
  await expect(page.getByTestId('country-map-get')).toHaveCount(0);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-99-country-map-ready.png` });

  // Bajarlo no cambió el país de la app; «Usar como mi país» sí.
  await expect(page.getByTestId('country-map-use')).toBeVisible();
  await page.getByTestId('country-map-use').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('country-pack-PY').getByRole('button', { name: 'Paraguay', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Ajustes: un país con datos viejos se ve en ámbar con «Actualizar» y vuelve al verde al actualizarlo', async ({ page }, testInfo) => {
  await start(page);
  await page.goto('/#/settings');
  const py = page.getByTestId('country-pack-PY');
  await expect(py).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  await page.getByTestId('country-pack-get-PY').click();
  await expect(py).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });

  // Se le pone a un archivo guardado una fecha vieja: el índice de la app tiene una más nueva, así que hay una versión nueva para bajar.
  await page.evaluate(async () => {
    const cache = await caches.open('vikarg-country');
    const req = (await cache.keys()).find((r) => new URL(r.url).pathname.endsWith('/PY.json'));
    if (!req) throw new Error('no está PY.json');
    const data = await (await cache.match(req))!.json();
    await cache.put(req, new Response(JSON.stringify({ ...data, generatedAt: '2020-01-01' }), { headers: { 'content-type': 'application/json' } }));
    window.dispatchEvent(new Event('online'));
  });
  await expect(py).toHaveAttribute('data-state', 'outdated', { timeout: 15_000 });
  await expect(page.getByTestId('country-pack-get-PY')).toHaveAttribute('aria-label', /Actualizar los datos sin conexión de Paraguay/);

  // En el mapa: ámbar con ↻ y el botón «Actualizar».
  await page.getByTestId('country-pack-map-open').click();
  const map = page.getByTestId('country-map-PY');
  await expect(map).toHaveAttribute('data-state', 'outdated');
  await expect(map).toContainText('↻');
  await map.click();
  await expect(page.getByTestId('country-map-state')).toContainText('Hay una versión nueva');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-100-country-map-outdated.png` });
  await page.getByTestId('country-map-get').click();
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
});

test('Mapa de países: el primer toque marca, el segundo baja y el tercero lo pone como país activo', async ({ page }, testInfo) => {
  await start(page);
  await page.goto('/#/settings');
  const py = page.getByTestId('country-pack-PY');
  await expect(py).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  await page.getByTestId('country-pack-map-open').click();
  const map = page.getByTestId('country-map-PY');
  await expect(map).toHaveAttribute('data-state', 'missing');

  // 1.er toque: lo marca, no baja nada.
  await map.click();
  await expect(page.getByTestId('country-map-panel')).toContainText('Paraguay');
  await expect(page.getByTestId('country-map-state')).toContainText('Sin bajar');
  await expect(page.getByTestId('country-map-next')).toContainText('Tocá de nuevo el país en el mapa para bajar');
  await expect(map).toHaveAttribute('data-state', 'missing');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-101-country-map-marked.png` });

  // 2.º toque: lo baja.
  await map.click();
  await expect(map).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('country-map-next')).toContainText('usarlo como tu país');
  // El país activo sigue siendo Argentina.
  await expect(page.getByTestId('country-pack-AR').getByRole('button', { name: 'Argentina', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // 3.er toque: lo pone como país activo.
  await map.click();
  await expect(page.getByTestId('country-pack-PY').getByRole('button', { name: 'Paraguay', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('country-map-next')).toContainText('Es tu país');
});

test('Mapa de países: se puede acercar, alejar y arrastrar sin marcar nada por error', async ({ page }) => {
  await start(page);
  await page.goto('/#/settings');
  await expect(page.getByTestId('country-pack-PY')).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  await page.getByTestId('country-pack-map-open').click();
  const svg = page.getByTestId('country-map');
  const zoom = async () => Number(await svg.getAttribute('data-zoom'));
  const viewBox = () => svg.getAttribute('viewBox');

  // Entero: no se puede alejar más ni «ver todo».
  expect(await zoom()).toBe(1);
  await expect(page.getByTestId('country-map-zoom-out')).toBeDisabled();
  await expect(page.getByTestId('country-map-zoom-all')).toBeDisabled();

  // Botones + y −.
  await page.getByTestId('country-map-zoom-in').click();
  expect(await zoom()).toBeGreaterThan(1.5);
  await page.getByTestId('country-map-zoom-in').click();
  const near = await zoom();
  expect(near).toBeGreaterThan(2.4);
  await page.getByTestId('country-map-zoom-out').click();
  expect(await zoom()).toBeLessThan(near);

  // La rueda acerca alrededor del cursor.
  const box = (await svg.boundingBox())!;
  const before = await zoom();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(zoom).toBeGreaterThan(before);

  // Arrastrar mueve el mapa y NO marca el país que había debajo.
  const vb0 = await viewBox();
  const marcadoAntes = await page.getByTestId('country-map-panel').innerText();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 60, box.y + box.height * 0.5 + 40, { steps: 6 });
  await page.mouse.up();
  expect(await viewBox()).not.toBe(vb0);
  expect(await page.getByTestId('country-map-panel').innerText()).toBe(marcadoAntes);

  // «Ver todo» vuelve al mapa entero.
  await page.getByTestId('country-map-zoom-all').click();
  expect(await zoom()).toBe(1);
});

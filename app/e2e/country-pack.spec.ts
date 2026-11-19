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

  // Bajarlo no cambió el país de la app; «Usar como país actual» sí.
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
  // Los íconos de estado y los nombres van en una capa de etiquetas por encima de las zonas.
  await expect(page.getByTestId('country-map-label-PY')).toContainText('↻');
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

  // Antes de tocar nada, el panel explica cómo se usa.
  await expect(page.getByTestId('country-map-next')).toContainText('Tocá un país del mapa para marcarlo');

  // El país principal (Argentina) se distingue en el mapa con un halo y una ★.
  await expect(page.getByTestId('country-map-AR')).toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId('country-map-halo')).toHaveAttribute('data-country', 'AR');
  await expect(page.getByTestId('country-map-label-AR')).toContainText('★');
  await expect(page.getByTestId('country-map-PY')).toHaveAttribute('data-current', 'false');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-102-country-map-main.png` });

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
  await expect(page.getByTestId('country-map-next')).toContainText('usarlo como país actual');
  // El país activo sigue siendo Argentina.
  await expect(page.getByTestId('country-pack-AR').getByRole('button', { name: 'Argentina', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // 3.er toque: lo pone como país activo.
  await map.click();
  await expect(page.getByTestId('country-pack-PY').getByRole('button', { name: 'Paraguay', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('country-map-next')).toContainText('Es el país actual');
  // El halo y la ★ pasaron a Paraguay.
  await expect(page.getByTestId('country-map-PY')).toHaveAttribute('data-current', 'true');
  await expect(page.getByTestId('country-map-AR')).toHaveAttribute('data-current', 'false');
  await expect(page.getByTestId('country-map-label-AR')).not.toContainText('★');
  await expect(page.getByTestId('country-map-halo')).toHaveAttribute('data-country', 'PY');
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

test.describe('Mapa de países: pellizco con dos dedos', () => {
  test.use({ viewport: { width: 393, height: 851 }, hasTouch: true });

  test('acerca y aleja alrededor de los dedos sin correrse', async ({ page }) => {
    await start(page);
    await page.goto('/#/settings');
    await expect(page.getByTestId('country-pack-PY')).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
    await page.getByTestId('country-pack-map-open').click();
    const svg = page.getByTestId('country-map');
    await svg.scrollIntoViewIfNeeded();
    const box = (await svg.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
    const zoom = async () => Number(await svg.getAttribute('data-zoom'));
    /** El país que hay bajo ese punto de la pantalla. */
    const under = (x: number, y: number) =>
      page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest('[data-testid^=country-map-]')?.getAttribute('data-testid') ?? null, [x, y]);

    // Dedos sobre Argentina (el centro de su caja: el mapa cubre toda América del Sur, así que su lugar en la pantalla depende del encuadre).
    const ar = (await page.getByTestId('country-map-AR').boundingBox())!;
    const cx = ar.x + ar.width * 0.5;
    const cy = ar.y + ar.height * 0.5;
    const antes = await under(cx, cy);
    expect(antes).toBe('country-map-AR');

    // Pellizco hacia afuera: de 40 px entre dedos a 160 px, en 8 pasos.
    const spread = (d: number) => [{ x: cx - d / 2, y: cy }, { x: cx + d / 2, y: cy }];
    await touch('touchStart', spread(40));
    for (let i = 1; i <= 8; i++) await touch('touchMove', spread(40 + (120 * i) / 8));
    await touch('touchEnd', []);
    const acercado = await zoom();
    expect(acercado).toBeGreaterThan(2.5);
    expect(acercado).toBeLessThan(5.5); // ≈ 4×: 160 / 40
    // Lo que estaba bajo el medio de los dedos sigue ahí.
    expect(await under(cx, cy)).toBe(antes);
    // Y no marcó ningún país por el pellizco.
    await expect(page.getByTestId('country-map-next')).toContainText('Tocá un país del mapa para marcarlo');

    // Pellizco hacia adentro: vuelve a alejarse.
    const spread2 = (d: number) => [{ x: cx - d / 2, y: cy }, { x: cx + d / 2, y: cy }];
    await touch('touchStart', spread2(160));
    for (let i = 1; i <= 8; i++) await touch('touchMove', spread2(160 - (120 * i) / 8));
    await touch('touchEnd', []);
    expect(await zoom()).toBeLessThan(acercado / 2);
  });
});

test('Ajustes: los países van en un marco por continente (América del Sur) y en orden alfabético', async ({ page }, testInfo) => {
  await start(page);
  await page.goto('/#/settings');
  const frame = page.getByTestId('country-continent-southAmerica');
  await expect(frame).toBeVisible({ timeout: 15_000 });
  await expect(frame.getByText('América del Sur', { exact: true })).toBeVisible();
  // Solo los países (la lista de sectores de Brasil va debajo, en otro grupo).
  const names = await frame.locator('.country-pack').first().locator('.country-pack-select').allTextContents();
  expect(names).toEqual(['Argentina', 'Bolivia', 'Brasil', 'Chile', 'Paraguay', 'Perú', 'Uruguay']);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-99-country-continent.png` });
});

test('Ajustes: se puede borrar el paquete de un país bajado, pero no el del país activo', async ({ page }, testInfo) => {
  await start(page);
  await page.goto('/#/settings');
  const py = page.getByTestId('country-pack-PY');
  await expect(py).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  // Sin bajar no hay nada que borrar, y el país activo (Argentina) no ofrece borrarse.
  await expect(page.getByTestId('country-pack-del-PY')).toHaveCount(0);
  await expect(page.getByTestId('country-pack-del-AR')).toHaveCount(0);

  await page.getByTestId('country-pack-get-PY').click();
  await expect(py).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  expect(await stored(page)).toEqual(expect.arrayContaining(['PY.json']));
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-100-country-delete.png` });

  // Borrar pide confirmación; al cancelar queda todo como estaba.
  await page.getByTestId('country-pack-del-PY').click();
  await expect(page.getByTestId('confirm-message')).toContainText('Paraguay');
  await page.getByTestId('confirm-cancel').click();
  await expect(py).toHaveAttribute('data-state', 'ready');

  await page.getByTestId('country-pack-del-PY').click();
  await page.getByTestId('confirm-ok').click();
  await expect(py).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  const left = await stored(page);
  expect(left).not.toContain('PY.json');
  expect(left).not.toContain('parks-PY.json');
  // Lo que usan los demás países no se borra (las ecorregiones son de todos).
  expect(left).toContain('ecoregions.json');
});

test('Ajustes: Brasil se baja por sectores (cinco macrorregiones), cada uno con su estado', async ({ page }) => {
  await start(page);
  await page.goto('/#/settings');
  // Los sectores aparecen al tocar Brasil (y se esconden al volver a tocarlo, siendo ya el país elegido).
  await expect(page.getByTestId('country-pack-PY')).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  await expect(page.getByTestId('country-sectors-BR')).toHaveCount(0);
  await page.getByTestId('country-pack-BR').getByRole('button', { name: 'Brasil' }).click();
  const frame = page.getByTestId('country-sectors-BR');
  await expect(frame).toBeVisible({ timeout: 15_000 });
  // Verlos no cambia el país actual (Argentina sigue siendo el principal): para eso hay un botón aparte.
  await expect(page.getByTestId('country-pack-AR').getByRole('button', { name: 'Argentina', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('country-pack-BR').getByRole('button', { name: 'Brasil' })).toHaveAttribute('aria-pressed', 'false');
  for (const id of ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte']) {
    await expect(page.getByTestId(`country-sector-${id}`)).toHaveAttribute('data-state', 'missing');
  }
  await expect(frame).toContainText('Sul (PR, SC, RS)');
  // Brasil no tiene un ícono de descarga propio: se baja sector por sector.
  await expect(page.getByTestId('country-pack-get-BR')).toHaveCount(0);
  // Usar Brasil como país desde la lista; tocar Brasil de nuevo esconde los sectores.
  await page.getByTestId('country-sector-use-BR').click();
  await expect(page.getByTestId('country-pack-BR').getByRole('button', { name: 'Brasil' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('country-sector-use-BR')).toHaveCount(0);
  await page.getByTestId('country-pack-BR').getByRole('button', { name: 'Brasil' }).click();
  await expect(frame).toHaveCount(0);
});

test('Mapa de países: Brasil se divide en sus cinco sectores y se baja (o se borra) el que se toca', async ({ page }, testInfo) => {
  await start(page);
  await page.goto('/#/settings');
  await expect(page.getByTestId('country-pack-PY')).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  await page.getByTestId('country-pack-map-open').click();
  await expect(page.getByTestId('country-map')).toBeVisible();
  // Brasil ya no es una sola zona: son sus cinco sectores, cada uno con su estado.
  await expect(page.getByTestId('country-map-BR')).toHaveCount(0);
  for (const id of ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte']) {
    await expect(page.getByTestId(`country-map-BR-${id}`)).toHaveAttribute('data-state', 'missing');
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-103-country-map-brazil.png` });

  // Tocar el Sul: lo marca y el panel dice cuál es, qué estados incluye y cuánto pesa.
  await page.getByTestId('country-map-BR-sul').click();
  await expect(page.getByTestId('country-map-panel')).toContainText('Brasil · Sul (PR, SC, RS)');
  await expect(page.getByTestId('country-map-state')).toContainText('Sin bajar');
  await expect(page.getByTestId('country-map-state')).toContainText(/\d+(,\d)? (MB|KB)/);
  await expect(page.getByTestId('country-map-next')).toContainText('bajar');

  // Bajarlo desde el panel: queda verde, guardado, y los demás sectores siguen sin bajar.
  await page.getByTestId('country-map-get').click();
  await expect(page.getByTestId('country-map-BR-sul')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  const files = await stored(page);
  expect(files).toEqual(expect.arrayContaining(['BR-sul.json', 'fuel-BR-sul.json', 'parks-BR-sul.json']));
  expect(files).not.toContain('BR-sudeste.json');
  await expect(page.getByTestId('country-map-BR-sudeste')).toHaveAttribute('data-state', 'missing');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-104-country-map-brazil-sul.png` });

  // Usar Brasil como país actual desde un sector: todo Brasil queda como país principal (los cinco sectores y el halo alrededor del país entero).
  await page.getByTestId('country-map-use').click();
  for (const id of ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte']) {
    await expect(page.getByTestId(`country-map-BR-${id}`)).toHaveAttribute('data-current', 'true');
  }
  await expect(page.getByTestId('country-map-label-BR-norte')).toContainText('★ Brasil Norte');
  await expect(page.getByTestId('country-map-halo')).toHaveAttribute('data-country', 'BR');
  await expect(page.getByTestId('country-map-use')).toHaveCount(0);
  await expect(page.getByTestId('country-map-AR')).toHaveAttribute('data-current', 'false');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-105-country-map-brazil-main.png` });

  // Se puede borrar desde el mismo panel (con confirmación).
  await page.getByTestId('country-map-del').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('country-map-BR-sul')).toHaveAttribute('data-state', 'missing', { timeout: 15_000 });
  expect(await stored(page)).not.toContain('BR-sul.json');
});

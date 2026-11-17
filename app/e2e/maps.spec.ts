import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const SERVER = 'https://valhallarust2.ddns.net';

// Ventana más chica: el mapa se dibuja sin placa de video y menos píxeles es bastante más rápido.
test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'], viewport: { width: 960, height: 640 } });

async function mockMaps(page: Page) {
  // Elevación plana (Terrarium: 0 m = R128 G0 B0).
  const dem = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 128, g: 0, b: 0 } } }).png().toBuffer();
  const ctx = page.context();
  await ctx.route('https://tiles.openfreemap.org/planet', (route) => route.fulfill({ json: { tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'] } }));
  // Teselas vacías (válidas para MapLibre) y letras vacías: lo que se prueba es la descarga y el uso sin conexión.
  await ctx.route('https://tiles.openfreemap.org/planet/test/**', (route) => route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  await ctx.route('https://tiles.openfreemap.org/fonts/**', (route) => route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }));
  await ctx.route('https://s3.amazonaws.com/elevation-tiles-prod/**', (route) => route.fulfill({ body: dem, contentType: 'image/png' }));
  // El servidor propio que viene cargado, sin mapas (cada prueba lo cambia si hace falta).
  await ctx.route(`${SERVER}/api/maps**`, (route) => route.fulfill({ status: 404, json: { error: 'not_found' } }));
  // Isoterma de 0 °C (para la línea de nieve de la capa de avalanchas) y viento del oeste con nieve, por hora.
  await ctx.route('https://api.open-meteo.com/v1/forecast**', (route) => {
    const H = 3_600_000;
    // La del lugar: de 7 días atrás a 2 adelante. La de la zona (14 días): una vieja, ya vencida, para probar sin isoterma.
    const live = !route.request().url().includes('forecast_days=14');
    const first = live ? Math.floor(Date.now() / H) * H - 7 * 24 * H : Date.UTC(2026, 0, 1);
    const n = live ? 9 * 24 : 4;
    const time = Array.from({ length: n }, (_, i) => new Date(first + i * H).toISOString().slice(0, 16));
    // Lo más bajo de los últimos 3 días: 1380 m (hace un día); hace 5 días, 900 m (no entra en la línea de nieve).
    const freezing = time.map((_, i) => (live && i === 6 * 24 ? 1380 : live && i === 2 * 24 ? 900 : i % 7 === 3 ? null : 2250));
    route.fulfill({
      json: {
        hourly: {
          time,
          freezing_level_height: freezing,
          wind_direction_700hPa: time.map((_, i) => 265 + (i % 3) * 5),
          wind_speed_700hPa: time.map(() => 15),
          snowfall: time.map((_, i) => (i < 6 ? 1 : 0)),
        },
      },
    });
  });
  // Histórico: con nieve, el viento suele venir del sudoeste.
  await ctx.route('https://archive-api.open-meteo.com/v1/archive**', (route) => {
    const days = 20;
    route.fulfill({
      json: {
        daily: {
          time: Array.from({ length: days }, (_, i) => `2025-07-${String(i + 1).padStart(2, '0')}`),
          wind_direction_10m_dominant: Array.from({ length: days }, () => 225),
          wind_speed_10m_max: Array.from({ length: days }, () => 9),
          snowfall_sum: Array.from({ length: days }, () => 2),
        },
      },
    });
  });
}

const cacheKeys = (page: Page) =>
  page.evaluate(async () => {
    const cache = await caches.open('vikarg-maps');
    return (await cache.keys()).map((r) => r.url);
  });

test('mapas offline: descargar una zona, verla sin conexión y borrarla', async ({ page, context }, testInfo) => {
  // Descarga, capas y uso sin conexión: en esta máquina (sin GPU) puede pasar del minuto.
  test.setTimeout(120_000);
  await mockMaps(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation');
  await page.getByRole('link', { name: /Mapas offline/ }).click();
  await expect(page.getByTestId('offline-map').locator('canvas')).toBeVisible();
  // El mapa ocupa su lugar (MapLibre cambia el posicionamiento del contenedor) y tiene los controles.
  expect((await page.getByTestId('offline-map').locator('canvas').boundingBox())!.height).toBeGreaterThan(250);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  // Va solo a la ubicación del GPS.
  await expect(page.getByTestId('map-center')).toHaveText(/^Centro: 34°36′\d+(\.\d+)?″ S 58°22′\d+(\.\d+)?″ O · zoom 12$/, { timeout: 15_000 });
  await expect(page.getByText('Todavía no descargaste ninguna zona.')).toBeVisible();

  // Descargar 2 km a la redonda, con todo el detalle.
  await page.getByRole('button', { name: 'Descargar una zona' }).click();
  await page.getByLabel('Nombre').fill('Casa');
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await expect(page.getByTestId('zone-estimate')).toHaveText(/^Unas \d+ teselas, ~[\d,]+ MB/);
  // 50 km con todo el detalle supera lo que permite el servicio.
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '50 km' });
  await expect(page.getByTestId('zone-estimate')).toContainText('Es demasiado para bajar de los servidores públicos');
  await expect(page.getByRole('button', { name: 'Descargar', exact: true })).toBeDisabled();
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByTestId('zone-message')).toHaveText(/^Listo: "Casa" quedó disponible sin conexión/, { timeout: 30_000 });
  await expect(page.getByTestId('zone-list')).toContainText('Casa');
  await expect(page.getByTestId('zone-list')).toContainText('2 km de radio');

  // Armar otra zona encima de la ya bajada: avisa que eso ya lo tiene.
  await page.getByRole('button', { name: 'Descargar una zona' }).click();
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await expect(page.getByTestId('zone-overlap')).toContainText('ya está descargada casi entera');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  // Agrandar la zona ya bajada (solo baja lo que falta) y volver a achicarla (borra lo que queda afuera).
  const before = (await cacheKeys(page)).length;
  await page.getByRole('button', { name: 'Editar Casa' }).click();
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '5 km' });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByTestId('zone-message')).toContainText('«Casa» actualizada', { timeout: 30_000 });
  await expect(page.getByTestId('zone-list')).toContainText('5 km de radio');
  expect((await cacheKeys(page)).length).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Editar Casa' }).click();
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByTestId('zone-list')).toContainText('2 km de radio', { timeout: 30_000 });
  expect((await cacheKeys(page)).length).toBe(before);

  const keys = await cacheKeys(page);
  expect(keys.some((k) => k.startsWith('https://vikarg.local/tiles/14/'))).toBe(true);
  expect(keys.some((k) => k.includes('/elevation-tiles-prod/terrarium/12/'))).toBe(true);
  expect(keys.some((k) => k.includes('/fonts/Noto%20Sans%20Regular/0-255.pbf'))).toBe(true);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-18-maps.png`, fullPage: true });

  // Capas: quedan guardadas.
  await page.getByRole('button', { name: 'Curvas de nivel' }).click();
  await expect(page.getByRole('button', { name: 'Curvas de nivel' })).toHaveAttribute('aria-pressed', 'false');

  // Riesgo de avalancha: con los colores del inclinómetro, solo por encima de la línea de nieve.
  const avalanche = page.getByRole('button', { name: 'Riesgo de avalancha' });
  await expect(avalanche).toHaveAttribute('aria-pressed', 'false');
  // Sin datos de isoterma (la consulta falla): se usa la altura que elija el usuario.
  const failing = (route: import('@playwright/test').Route) => route.fulfill({ status: 503, body: '' });
  await page.route('https://api.open-meteo.com/v1/forecast**', failing);
  await avalanche.click();
  await expect(page.getByTestId('snowline-status')).toHaveText(/^Sin datos de isoterma para esta zona.*se pinta desde los 1500 m que elegiste/);
  // Sin datos de viento (la zona tiene el habitual: del sudoeste, sotavento al noreste).
  await expect(page.getByTestId('wind-recent')).toHaveText('Últimos 7 días: sin datos de viento.');
  await expect(page.getByTestId('wind-usual')).toHaveText(/^Habitual: cuando nieva en “Casa”, el viento suele venir del SO .*las laderas que miran al NE/);
  await page.getByLabel('Sin datos de isoterma, hay nieve desde (m)').fill('1800');
  await expect(page.getByTestId('snowline-status')).toContainText('se pinta desde los 1800 m que elegiste');
  // Con datos otra vez, manda la isoterma.
  await page.unroute('https://api.open-meteo.com/v1/forecast**', failing);
  await avalanche.click();
  await avalanche.click();
  const legend = page.getByTestId('slope-legend');
  await expect(legend).toContainText('menos de 25°');
  await expect(legend).toContainText('30° a 45°');
  await expect(legend).toContainText('45° a 55°');
  await expect(legend).toContainText('más de 55°');
  await expect(legend).toContainText('Cargada por viento en los últimos 7 días');
  await expect(legend).toContainText('Sotavento habitual');
  // Viento del oeste con nieve en los últimos días (laderas al este) y, aparte, el habitual de la zona (al noreste).
  await expect(page.getByTestId('wind-recent')).toHaveText(/^Últimos 7 días: el viento del O cargó nieve en las laderas que miran al E/);
  await expect(page.getByTestId('wind-usual')).toContainText('las laderas que miran al NE');
  // Es una subopción: se apaga sin apagar el riesgo de avalancha.
  await page.getByLabel('Marcar las laderas cargadas por viento').uncheck();
  await expect(page.getByTestId('wind-recent')).toHaveCount(0);
  await expect(legend).not.toContainText('Sotavento habitual');
  await expect(legend).toContainText('30° a 45°');
  await page.getByLabel('Marcar las laderas cargadas por viento').check();
  await expect(page.getByTestId('wind-recent')).toBeVisible();
  // Posibles cornisas en violeta: prendidas de entrada, se apagan aparte.
  await expect(page.getByTestId('cornice-legend')).toContainText('Posibles cornisas');
  await page.getByTestId('cornice-toggle').uncheck();
  await expect(page.getByTestId('cornice-legend')).toHaveCount(0);
  await expect(legend).toContainText('30° a 45°');
  await page.getByTestId('cornice-toggle').check();
  await expect(page.getByTestId('cornice-legend')).toBeVisible();
  await expect(page.getByTestId('snowline-status')).toHaveText(/^Se pinta desde los 1100 m: la isoterma de 0 °C más baja de los últimos días en esta zona \(1380 m, Open-Meteo/);
  await page.getByLabel('Poner la línea de nieve a mano').check();
  await page.getByLabel('Hay nieve desde (m)').fill('2500');
  await expect(page.getByTestId('snowline-status')).toHaveText('Se pinta desde los 2500 m (línea de nieve puesta a mano).');
  await page.getByLabel('Poner la línea de nieve a mano').uncheck();
  await expect(page.getByTestId('snowline-status')).toContainText("1100 m");

  // Sin conexión: la zona sigue en el dispositivo y el mapa se dibuja.
  await context.setOffline(true);
  await page.goto('/#/orientation');
  await page.goto('/#/orientation/maps');
  await expect(page.getByText('Sin conexión: se ven las zonas descargadas')).toBeVisible();
  await expect(page.getByTestId('offline-map').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('zone-list')).toContainText('2 km de radio');
  await expect(page.getByRole('button', { name: 'Descargar una zona' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Curvas de nivel' })).toHaveAttribute('aria-pressed', 'false');
  // La línea de nieve guardada sirve sin conexión.
  await expect(page.getByTestId('snowline-status')).toContainText("1100 m");
  await context.setOffline(false);

  // Borrar: se libera el espacio.
  await page.getByRole('button', { name: 'Borrar Casa' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByText('Todavía no descargaste ninguna zona.')).toBeVisible();
  expect((await cacheKeys(page)).filter((k) => k.startsWith('https://vikarg.local/tiles/'))).toHaveLength(0);
});

test('mapa en 3D o plano, y la vista siguiéndome o libre', async ({ page, context }) => {
  // Sin GPU (como en el servidor de pruebas), el 3D se dibuja por software: pasa del minuto.
  test.setTimeout(180_000);
  await mockMaps(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/maps');
  const map = page.getByTestId('offline-map');
  await expect(page.getByTestId('map-center')).toContainText('zoom 12', { timeout: 15_000 });

  // Arranca plano; en 3D se inclina con relieve, y queda guardado.
  const threeD = page.getByRole('button', { name: 'Mapa en 3D' });
  await expect(threeD).toHaveAttribute('aria-pressed', 'false');
  await expect(threeD).toHaveText('2D');
  await threeD.click();
  await expect(threeD).toHaveText('3D');
  await expect(map).toHaveAttribute('data-pitch', '60');
  await expect(map).toHaveAttribute('data-terrain', 'on');
  await page.goto('/#/orientation');
  await page.goto('/#/orientation/maps');
  await expect(page.getByRole('button', { name: 'Mapa en 3D' })).toHaveAttribute('aria-pressed', 'true');

  // De vuelta a plano. (Lo que sigue, en 2D: sin GPU, el relieve en 3D se dibuja por software y traba la página.)
  await page.getByRole('button', { name: 'Mapa en 3D' }).click();
  await expect(map).toHaveAttribute('data-pitch', '0');
  await expect(map).toHaveAttribute('data-terrain', 'off');

  // Siguiéndome: el mapa va adonde voy.
  const follow = page.getByRole('button', { name: 'Seguir mi posición' });
  await follow.click();
  await expect(follow).toHaveAttribute('aria-pressed', 'true');
  await context.setGeolocation({ latitude: -34.62, longitude: -58.4 });
  await expect(page.getByTestId('map-center')).toHaveText(/^Centro: 34°37′1\d(\.\d+)?″ S 58°24′\d+(\.\d+)?″ O/, { timeout: 10_000 });

  // Arrastrar el mapa pasa a vista libre.
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await expect(follow).toHaveAttribute('aria-pressed', 'false');
});

test('mapas offline desde el servidor propio, con las fuentes públicas de respaldo', async ({ page }) => {
  test.setTimeout(120_000);
  await mockMaps(page);
  const dem = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 128, g: 0, b: 0 } } }).png().toBuffer();
  const info = {
    vector: { minZoom: 0, maxZoom: 14, bounds: [-76, -56, -53, -17.4], updatedAt: '2026-11-01T00:00:00Z' },
    elevation: { minZoom: 0, maxZoom: 12, bounds: [-76, -56, -53, -17.4], updatedAt: '2026-11-01T00:00:00Z' },
    maxZoneTiles: 60000,
    maxZoneMb: 1500,
  };
  let busy = false;
  let fromServer = 0;
  await page.context().route(`${SERVER}/api/maps**`, (route) => {
    const url = route.request().url();
    if (url.endsWith('/api/maps')) return route.fulfill({ json: info });
    if (busy) return route.fulfill({ status: 503, headers: { 'retry-after': '60' }, body: '' });
    fromServer++;
    return url.includes('/elevation/') ? route.fulfill({ body: dem, contentType: 'image/png' }) : route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' });
  });
  const fromPublic = { n: 0 };
  page.on('request', (r) => {
    if (r.url().includes('openfreemap.org/planet/test/')) fromPublic.n++;
  });

  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  // El origen se elige en Ajustes → Conexiones; por defecto, automático.
  await page.goto('/#/settings');
  await expect(page.getByLabel('Bajar los mapas de')).toHaveValue('auto');
  await expect(page.getByTestId('map-source-status')).toContainText('Tu servidor tiene mapas');
  await page.goto('/#/orientation/maps');
  await expect(page.getByTestId('map-source-hint')).toContainText('Origen de los mapas: Automático');

  // Con el servidor, 50 km con todo el detalle sí se puede.
  await page.getByRole('button', { name: 'Descargar una zona' }).click();
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '50 km' });
  await expect(page.getByTestId('zone-estimate')).toContainText('Se baja de tu servidor.');
  await expect(page.getByRole('button', { name: 'Descargar', exact: true })).toBeEnabled();

  // Una zona chica: sale del servidor.
  await page.getByLabel('Nombre').fill('Del servidor');
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByTestId('zone-message')).toHaveText(/^Listo: "Del servidor"/, { timeout: 30_000 });
  expect(fromServer).toBeGreaterThan(50);
  const publicBefore = fromPublic.n;

  // Servidor sobrecargado: la zona igual se baja, de las fuentes públicas.
  busy = true;
  await page.getByRole('button', { name: 'Descargar una zona' }).click();
  await page.getByLabel('Nombre').fill('De respaldo');
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '5 km' });
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByTestId('zone-message')).toHaveText(/^Listo: "De respaldo"/, { timeout: 60_000 });
  expect(fromPublic.n).toBeGreaterThan(publicBefore);

  // Solo servidores públicos: vuelve el límite de siempre.
  await page.goto('/#/settings');
  await page.getByLabel('Bajar los mapas de').selectOption({ label: 'Solo servidores públicos' });
  await expect(page.getByTestId('map-source-status')).toContainText('Se usan OpenFreeMap');
  await page.goto('/#/orientation/maps');
  await page.getByRole('button', { name: 'Descargar una zona' }).click();
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '50 km' });
  await expect(page.getByTestId('zone-estimate')).toContainText('Es demasiado para bajar de los servidores públicos');
});

test('mapas importados a mano: un .pmtiles se copia al dispositivo y se usa sin bajar zonas', async ({ page }) => {
  test.setTimeout(90_000);
  await mockMaps(page);
  const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/orientation/maps');
  await expect(page.getByRole('heading', { name: 'Mapas importados' })).toBeVisible();

  // Un mapa con otro esquema (Protomaps): no se importa.
  await page.getByTestId('import-input').setInputFiles(fixture('protomaps.pmtiles'));
  await expect(page.getByTestId('import-message')).toHaveText(/no tiene el esquema OpenMapTiles/);
  await expect(page.getByTestId('imported-list')).toHaveCount(0);

  // Uno de OpenMapTiles alrededor de Buenos Aires: queda en la lista.
  await page.getByTestId('import-input').setInputFiles(fixture('buenos-aires.pmtiles'));
  await expect(page.getByTestId('import-message')).toHaveText('Listo: “buenos-aires.pmtiles” (Mapa) quedó disponible sin conexión.');
  await expect(page.getByTestId('imported-list')).toContainText('Mapa · zoom 0 a 14');
  const stored = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('maps-imported');
    return (await (await dir.getFileHandle('buenos-aires.pmtiles')).getFile()).size;
  });
  expect(stored).toBe(284);

  // Una zona dentro del mapa importado: avisa que no hace falta bajarla.
  await page.getByRole('button', { name: 'Descargar una zona' }).click();
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await expect(page.getByTestId('zone-covered')).toContainText('ya está en el mapa importado “buenos-aires.pmtiles”');
  await page.getByRole('button', { name: 'Cancelar' }).click();

  // Sigue después de recargar, y se borra.
  await page.reload();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/orientation/maps');
  await expect(page.getByTestId('imported-list')).toContainText('buenos-aires.pmtiles');
  await page.getByRole('button', { name: 'Borrar buenos-aires.pmtiles' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('imported-list')).toHaveCount(0);
});

test('herramientas del mapa: medir distancia y recorrido, y dirección a un punto', async ({ page }) => {
  await mockMaps(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/orientation/maps');
  const canvas = page.getByTestId('offline-map').locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('map-center')).toHaveText(/zoom 12$/, { timeout: 15_000 });
  const box = (await canvas.boundingBox())!;
  const cx = box.width / 2;
  const cy = box.height / 2;

  // Medir: dos puntos = línea recta; tres = recorrido; deshacer vuelve a dos.
  await page.getByRole('button', { name: 'Medir' }).click();
  await expect(page.getByTestId('measure-panel')).toContainText('Tocá el mapa para marcar el primer punto.');
  await canvas.click({ position: { x: cx, y: cy } });
  await canvas.click({ position: { x: cx + 200, y: cy } });
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-measure', '2');
  await expect(page.getByTestId('measure-distance')).toHaveText(/^\d+,\d+ km · en línea recta$/);
  // Terreno de prueba plano a 0 m.
  await expect(page.getByTestId('measure-climb')).toHaveText('Desnivel: +0 m subiendo, −0 m bajando');
  await canvas.click({ position: { x: cx + 200, y: cy + 150 } });
  await expect(page.getByTestId('measure-distance')).toContainText('2 tramos');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('measure-distance')).toContainText('en línea recta');

  // Dirección a un punto: desde el GPS hacia el este.
  await page.getByRole('button', { name: 'Dirección a un punto' }).click();
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-measure', '0');
  await canvas.click({ position: { x: cx + 200, y: cy } });
  await expect(page.getByTestId('target-bearing')).toHaveText(/^(89|90|91)° E · \d+,\d+ km$/);
  await expect(page.getByTestId('target-magnetic')).toHaveText(/^En la brújula \(magnético\): (99|100|101)° E$/);
  await expect(page.getByTestId('target-alt')).toContainText('Altura del punto ≈ 0 m');
  const fromGps = await page.getByTestId('target-bearing').textContent();

  // Desde otro punto del mapa aunque haya ubicación: primero el origen, después el punto.
  await page.getByRole('button', { name: 'Un punto del mapa' }).click();
  await expect(page.getByTestId('target-hint')).toContainText('Tocá primero desde dónde querés medir');
  await canvas.click({ position: { x: cx - 200, y: cy } });
  await expect(page.getByTestId('target-hint')).toContainText('Ahora tocá el punto');
  await canvas.click({ position: { x: cx + 200, y: cy } });
  await expect(page.getByTestId('target-bearing')).toHaveText(/^(89|90|91)° E · \d+,\d+ km$/);
  await expect(page.getByTestId('target-panel')).toContainText('Desde el primer punto que tocaste');
  // El doble de lejos que desde el GPS (en el centro).
  const km = (txt: string | null) => Number(txt!.split('·')[1]!.replace(' km', '').replace(',', '.'));
  expect(km(await page.getByTestId('target-bearing').textContent())).toBeCloseTo(2 * km(fromGps), 0);
  await page.getByRole('button', { name: 'Mi ubicación', exact: true }).click();
  await canvas.click({ position: { x: cx + 200, y: cy } });
  await expect(page.getByTestId('target-panel')).toContainText('Desde tu ubicación (GPS)');
  await page.getByRole('link', { name: 'Guardar como waypoint' }).click();
  await expect(page.getByLabel('Coordenadas', { exact: true })).toHaveValue(/^-34\.\d+, -58\.\d+$/);
});

test('herramientas del mapa con clic derecho y en pantalla completa', async ({ page }, testInfo) => {
  await mockMaps(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/orientation/maps');
  const canvas = page.getByTestId('offline-map').locator('canvas');
  await expect(page.getByTestId('map-center')).toHaveText(/zoom 12$/, { timeout: 15_000 });
  const box = (await canvas.boundingBox())!;
  const cx = box.width / 2;
  const cy = box.height / 2;
  const menu = page.getByTestId('map-menu');

  // Clic derecho: medir desde aquí y agregar un punto.
  await canvas.click({ button: 'right', position: { x: cx - 150, y: cy } });
  await expect(menu).toContainText(/^-34\.\d+, -58\.\d+/);
  await menu.getByRole('menuitem', { name: 'Medir o planificar desde aquí' }).click();
  await expect(menu).toHaveCount(0);
  await canvas.click({ button: 'right', position: { x: cx + 150, y: cy } });
  await menu.getByRole('menuitem', { name: 'Agregar punto' }).click();
  await expect(page.getByTestId('measure-distance')).toContainText('en línea recta');

  // Dirección desde un punto marcado con clic derecho hasta otro.
  await canvas.click({ button: 'right', position: { x: cx - 150, y: cy } });
  await menu.getByRole('menuitem', { name: 'Dirección desde aquí' }).click();
  await canvas.click({ button: 'right', position: { x: cx - 150, y: cy - 150 } });
  await menu.getByRole('menuitem', { name: 'Dirección hasta aquí (desde el origen marcado)' }).click();
  await expect(page.getByTestId('target-bearing')).toHaveText(/^(359|0|1)° N · \d+,\d+ km$/);
  // Escape cierra el menú.
  await canvas.click({ button: 'right', position: { x: cx, y: cy } });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // Pantalla completa: botones sobre el mapa y el resultado arriba.
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  const overlay = page.getByTestId('tools-overlay');
  await expect(overlay).toContainText(/^(359|0|1)° N · \d+,\d+ km/);
  await expect(overlay).toContainText('Brújula:');
  await page.locator('.maps-tools-float').getByRole('button', { name: 'Medir' }).click();
  await expect(overlay).toContainText('Tocá el mapa para marcar el primer punto.');
  await canvas.click({ position: { x: cx - 100, y: cy + 50 } });
  await canvas.click({ position: { x: cx + 100, y: cy + 50 } });
  await expect(overlay).toContainText(/\d+,\d+ km/);
  await expect(overlay).toContainText('+0 m / −0 m');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-75-map-tools-fullscreen.png` });
  await overlay.getByRole('button', { name: 'Borrar' }).click();
  await expect(overlay).toContainText('Tocá el mapa para marcar el primer punto.');
});

test('planificar una ruta en el mapa: piernas con rumbo magnético, sin crear lugares, exportar y seguir', async ({ page }) => {
  await mockMaps(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/orientation/maps');
  const canvas = page.getByTestId('offline-map').locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('map-center')).toHaveText(/zoom 12$/, { timeout: 15_000 });
  const box = (await canvas.boundingBox())!;
  const cx = box.width / 2;
  const cy = box.height / 2;

  await page.getByRole('button', { name: 'Medir' }).click();
  await canvas.click({ position: { x: cx, y: cy } });
  await canvas.click({ position: { x: cx + 200, y: cy } });
  await canvas.click({ position: { x: cx + 200, y: cy + 150 } });
  // Cada pierna con su distancia y su rumbo magnético.
  await expect(page.getByTestId('measure-legs').getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('measure-legs')).toContainText('magnético');
  await page.getByTestId('plan-name').fill('Ruta al Platita');
  await page.getByTestId('plan-save').click();

  // La ruta guardada: piernas, GPX y seguirla. Sus puntos no son lugares.
  await expect(page).toHaveURL(/#\/orientation\/routes\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('planned-route')).toBeVisible();
  await expect(page.getByTestId('planned-legs').getByRole('listitem')).toHaveCount(3);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('planned-export').click().then(() => page.getByTestId('export-gpx').click())]);
  expect(download.suggestedFilename()).toBe('Ruta-al-Platita.gpx');
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Ruta al Platita')).toBeVisible(); // la ruta sí está en la lista de rutas
  await expect(page.getByText('Todavía no guardaste puntos.')).toBeVisible(); // y sus puntos no son lugares
  await page.getByText('Ruta al Platita').click();
  await page.getByTestId('planned-follow').click();
  await expect(page).toHaveURL(/#\/orientation\/tracks\/[0-9a-f-]{36}\/follow$/);
  // La ruta no ensucia la lista de Tracks.
  await page.goto('/#/orientation/tracks');
  await expect(page.getByText('Ruta al Platita')).toHaveCount(0);
});

test('importar un KML en Tracks y convertirlo en ruta planificada: sin crear lugares, con piernas y exportar a KML', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Cerro Platita</name>
    <Placemark><name>Refugio</name><Point><coordinates>-69.1,-32.9,2100</coordinates></Point></Placemark>
    <Placemark><name>Subida</name><LineString><coordinates>-69.10,-32.90,2000 -69.11,-32.92,2100 -69.13,-32.92,2200</coordinates></LineString></Placemark></Document></kml>`;
  // Un solo lugar para importar: Tracks (GPX, KML, KMZ o TCX).
  await page.goto('/#/orientation/tracks');
  await page.getByTestId('tracks-file').setInputFiles({ name: 'platita.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: Buffer.from(kml) });
  await expect(page).toHaveURL(/#\/orientation\/tracks\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Cerro Platita' })).toBeVisible();
  // El track se exporta desde un solo botón que deja elegir GPX o KML.
  await page.getByTestId('track-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  const [trackKml] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-kml').click()]);
  expect(trackKml.suggestedFilename()).toBe('Cerro-Platita.kml');
  // Para tener las piernas con rumbo magnético, se crea la ruta planificada desde el track.
  await page.getByTestId('track-to-route').click();
  await expect(page).toHaveURL(/#\/orientation\/routes\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('planned-route')).toBeVisible();
  await expect(page.getByTestId('planned-legs').getByRole('listitem')).toHaveCount(3);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('planned-export').click().then(() => page.getByTestId('export-kml').click())]);
  expect(download.suggestedFilename()).toBe('Cerro-Platita.kml');
  // El punto del KML quedó en el track; no en la lista de lugares.
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Todavía no guardaste puntos.')).toBeVisible();
  // Un archivo que no sirve da un mensaje claro.
  await page.goto('/#/orientation/tracks');
  await page.getByTestId('tracks-file').setInputFiles({ name: 'nada.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
  await expect(page.getByRole('alert')).toContainText('no es un GPX');
});

test('mapas offline: la capa de ecorregiones dice en cuál está el centro del mapa, también sin conexión', async ({ page, context }) => {
  test.setTimeout(120_000);
  await mockMaps(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/orientation/maps');
  await expect(page.getByTestId('map-center')).toHaveText(/zoom 12$/, { timeout: 15_000 });
  // Apagada por defecto: sin línea de ecorregión.
  await expect(page.getByTestId('map-ecoregion')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ecorregiones', exact: true }).click();
  // Buenos Aires (el GPS de la prueba): la Pampa húmeda.
  await expect(page.getByTestId('map-ecoregion')).toContainText('Pampa húmeda', { timeout: 15_000 });
  await expect(page.getByText('RESOLVE Ecoregions 2017')).toBeVisible();
  // Tocar el mapa: la ficha pasa a ser la del punto tocado (con «Descartar»).
  await page.getByTestId('offline-map').locator('canvas').click({ position: { x: 480, y: 300 } });
  await expect(page.getByTestId('map-ecoregion')).toContainText('punto tocado', { timeout: 10_000 });
  await page.getByTestId('eco-pick-clear').click();
  await expect(page.getByTestId('map-ecoregion')).toContainText('centro del mapa');
  // Pantalla completa: el botón de capas elige una a la vez y los datos de la ecorregión se ven sobre el mapa.
  await expect(page.getByTestId('fs-layers-btn')).toBeHidden();
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  // En pantalla completa no hay nada hasta tocar el mapa; «Descartar» lo saca y otro toque lo vuelve a mostrar.
  await expect(page.getByTestId('fs-area-info')).toHaveCount(0);
  await page.getByTestId('offline-map').locator('canvas').click({ position: { x: 480, y: 300 } });
  await expect(page.getByTestId('fs-area-info')).toContainText('Pampa húmeda');
  await page.getByTestId('fs-eco-pick-clear').click();
  await expect(page.getByTestId('fs-area-info')).toHaveCount(0);
  await page.getByTestId('offline-map').locator('canvas').click({ position: { x: 400, y: 260 } });
  await expect(page.getByTestId('fs-area-info')).toContainText('Pampa húmeda');
  await page.getByTestId('fs-layers-btn').click();
  await page.getByTestId('fs-layer-slope').click();
  await expect(page.getByTestId('fs-layer-slope')).toHaveAttribute('aria-pressed', 'true');
  // El cartel de avalancha se cierra con su cruz.
  await expect(page.getByTestId('fs-slope-legend')).toBeVisible();
  await page.getByTestId('fs-slope-close').click();
  await expect(page.getByTestId('fs-slope-legend')).toHaveCount(0);
  await expect(page.getByTestId('fs-layer-ecoregions')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('fs-layer-ecoregions').click();
  await page.getByTestId('offline-map').locator('canvas').click({ position: { x: 480, y: 300 } });
  await expect(page.getByTestId('fs-area-info')).toContainText('Pampa húmeda');
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  // El archivo quedó guardado en el dispositivo (con los datos del país): se usa sin conexión.
  const stored = await page.evaluate(async () => !!(await (await caches.open('vikarg-country')).match(new URL('data/ecoregions.json', location.href).href)));
  expect(stored).toBe(true);
});

test('mapas offline: geología (excluyente con ecorregiones) y zona descargada con el detalle del servidor', async ({ page }) => {
  test.setTimeout(120_000);
  await mockMaps(page);
  // Teselas de geología del servidor propio (una unidad que cubre la zona).
  let tileCalls = 0;
  await page.context().route(`${SERVER}/api/layers/**`, (route) => {
    tileCalls++;
    route.fulfill({
      json: { x: 0, y: 0, units: [{ name: 'Formación Prueba', litho: 'Limos y arcillas', from: 'Pleistoceno', to: 'Holoceno' }], polys: [{ u: 0, p: [[-60, -36, -57, -36, -57, -33, -60, -33, -60, -36]] }], stale: false },
    });
  });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/orientation/maps');
  await expect(page.getByTestId('map-center')).toHaveText(/zoom 12$/, { timeout: 15_000 });

  // Ecorregiones, riesgo de avalancha y geología no se prenden a la vez: la última que se prende apaga las otras.
  const chip = (name: string) => page.getByRole('button', { name, exact: true });
  await chip('Ecorregiones').click();
  await expect(chip('Ecorregiones')).toHaveAttribute('aria-pressed', 'true');
  await chip('Geología').click();
  await expect(chip('Geología')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip('Ecorregiones')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('map-ecoregion')).toHaveCount(0);
  await expect(page.getByTestId('map-geology')).toContainText('Geología en el centro del mapa', { timeout: 15_000 });
  await chip('Riesgo de avalancha').click();
  await expect(chip('Geología')).toHaveAttribute('aria-pressed', 'false');
  await chip('Geología').click();
  await expect(chip('Riesgo de avalancha')).toHaveAttribute('aria-pressed', 'false');

  // Una zona de 2 km: baja también el detalle de geología del servidor propio y lo guarda con la zona.
  await page.getByRole('button', { name: 'Descargar una zona' }).click();
  await page.getByLabel('Nombre').fill('Casa');
  await page.getByLabel('Radio alrededor del centro del mapa').selectOption({ label: '2 km' });
  await page.getByRole('button', { name: 'Descargar', exact: true }).click();
  await expect(page.getByTestId('zone-message')).toContainText(/detalle de geología y vegetación/i, { timeout: 60_000 });
  await expect(page.getByTestId('zone-list')).toContainText('con detalle de geología y vegetación');
  expect(tileCalls).toBeGreaterThan(0);
  const stored = (await cacheKeys(page)).filter((k) => k.startsWith('https://vikarg.local/layers/geology/'));
  expect(stored.length).toBeGreaterThan(0);
  // Con el detalle guardado, la ficha usa la unidad de la zona.
  await expect(page.getByTestId('map-geology')).toContainText('Formación Prueba', { timeout: 15_000 });

  // Borrar la zona limpia también sus teselas de geología.
  await page.getByRole('button', { name: 'Borrar Casa' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect.poll(async () => (await cacheKeys(page)).filter((k) => k.startsWith('https://vikarg.local/layers/')).length, { timeout: 15_000 }).toBe(0);
});

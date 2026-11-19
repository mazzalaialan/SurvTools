import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { inaRunRoute } from './fixtures/inaForecast';
import { expect, test, type Page } from '@playwright/test';

// La copia propia de Open-Meteo del servidor no entra en las pruebas: 404 = «no está ahí», y la app pasa al servicio simulado de abajo.
test.beforeEach(async ({ context }) => {
  await context.route(/\/api\/om\//, (route) => route.fulfill({ status: 404, json: { error: 'sin copia propia' } }));
});

const PASSWORD = 'prueba-segura-123';
const QUAKE = { lon: -61, lat: -38 };
const FIRE = { lon: -60.5, lat: -26.5 };
const ROSARIO = { lon: -60.65, lat: -32.95 };
/** Lo que devuelve el servidor simulado en /api/lightning: [lat, lon, segundos]. */
let lightningBatch: number[][] = [];

// Ventana más chica: el mapa se dibuja sin placa de video y menos píxeles es bastante más rápido.
test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'], viewport: { width: 960, height: 640 } });

/** Mismo encuadre que la app (projection.ts): los tres países con 8 px de margen. */
function screenPoint(lon: number, lat: number, width: number, height: number) {
  const R = 6_378_137;
  const merc = (lo: number, la: number) => ({ x: (R * lo * Math.PI) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) });
  const sw = merc(-76, -58);
  const ne = merc(-52, -21);
  const scale = Math.min((width - 16) / (ne.x - sw.x), (height - 16) / (ne.y - sw.y));
  const c = { x: (sw.x + ne.x) / 2, y: (sw.y + ne.y) / 2 };
  const m = merc(lon, lat);
  return { x: width / 2 + (m.x - c.x) * scale, y: height / 2 - (m.y - c.y) * scale };
}

async function mockSources(page: Page) {
  // Imagen de relleno con ruido: más de 200 bytes, así cuenta como imagen publicada.
  const noise = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 97) % 251));
  const png = await sharp(noise, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
  const ctx = page.context();
  await ctx.route('https://gibs.earthdata.nasa.gov/**', (route) => route.fulfill({ body: png, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await ctx.route('https://tilecache.rainviewer.com/**', (route) => route.fulfill({ body: png, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await ctx.route('https://api.rainviewer.com/**', (route) => {
    const now = Math.floor(Date.now() / 600_000) * 600;
    route.fulfill({ json: { host: 'https://tilecache.rainviewer.com', radar: { past: Array.from({ length: 13 }, (_, i) => ({ time: now - (12 - i) * 600, path: `/v2/radar/f${i}` })) } } });
  });
  await ctx.route('https://earthquake.usgs.gov/**', (route) =>
    route.fulfill({
      json: {
        features: [
          { id: 'q1', properties: { mag: 5.2, place: '100 km S de Bahía Blanca', time: Date.now() - 3_600_000, url: 'https://earthquake.usgs.gov/q1' }, geometry: { coordinates: [QUAKE.lon, QUAKE.lat, 10] } },
          { id: 'lejos', properties: { mag: 6, place: 'Japón', time: Date.now(), url: 'https://x' }, geometry: { coordinates: [140, 35, 10] } },
        ],
      },
    }),
  );
  await ctx.route('https://www.gdacs.org/**', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { type: 'Point', coordinates: [FIRE.lon, FIRE.lat] },
            properties: {
              eventtype: 'WF', eventid: 7, episodeid: 1, name: 'Incendio en Chaco', alertlevel: 'Orange',
              fromdate: '2026-10-29T00:00:00', todate: '2026-10-31T00:00:00', severitydata: { severitytext: '12000 ha' }, url: { report: 'https://www.gdacs.org/r7' },
            },
          },
        ],
      },
    }),
  );
  // Lluvia estimada (servidor propio): imagen transparente con un cuadrado azul.
  const rainPng = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 8, height: 8, channels: 4, background: { r: 40, g: 140, b: 240, alpha: 1 } } }, left: 50, top: 10 }])
    .png()
    .toBuffer();
  const rainAt = new Date(Math.floor(Date.now() / 600_000) * 600_000).toISOString();
  await ctx.route('**/api/rain/map', (route) =>
    route.fulfill({ json: { at: rainAt, bounds: { west: -76, east: -52, south: -58, north: -21 }, image: '/api/rain/map.png?t=1' }, headers: { 'Access-Control-Allow-Origin': '*' } }),
  );
  // Radares argentinos (servidor propio): por defecto sin radares, para no tocar lo que miden las demás pruebas.
  await ctx.route('**/api/radar**', (route) =>
    route.fulfill({ json: { enabled: true, attribution: 'SINARAME y SMN (CC BY 4.0)', rangeKm: 240, radars: [] }, headers: { 'Access-Control-Allow-Origin': '*' } }),
  );
  await ctx.route('**/api/rain/map.png**', (route) => route.fulfill({ body: rainPng, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
  // El servidor propio (el que viene cargado): rayos de la última pasada.
  lightningBatch = [
    [ROSARIO.lat, ROSARIO.lon, 30],
    [ROSARIO.lat + 0.02, ROSARIO.lon + 0.02, 50],
  ];
  // Alertas oficiales (servidor propio): tormentas del SMN sobre Buenos Aires y un aviso de Chile en la Araucanía.
  const square = (lat: number, lon: number, d: number) => [[lat - d, lon - d], [lat - d, lon + d], [lat + d, lon + d], [lat + d, lon - d], [lat - d, lon - d]];
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  await ctx.route('**/api/alerts', (route) =>
    route.fulfill({
      json: {
        updatedAt: new Date().toISOString(),
        failed: [],
        alerts: [
          { key: 'SMN:1:0', source: 'SMN', senderName: 'Servicio Meteorologico Nacional', event: 'Tormentas', headline: 'Tormentas', description: 'El área será afectada por tormentas de variada intensidad.', instruction: '1- Evitá salir.', severity: 'Moderate', onset: hours(-1), expires: hours(6), web: 'https://www.smn.gob.ar/alertas', areas: [{ desc: 'Ciudad de Buenos Aires', polygons: [square(-34.6, -58.4, 0.5)] }] },
          { key: 'DMC:1:0', source: 'DMC', senderName: 'Dirección Meteorológica de Chile', event: 'Viento', headline: 'Viento fuerte en la Araucanía', description: 'Rachas de 70 km/h.', instruction: '', severity: 'Minor', onset: hours(-2), expires: hours(10), web: 'https://www.meteochile.gob.cl', areas: [{ desc: 'Araucanía: Cordillera', polygons: [square(-39.5, -71.6, 0.6)] }] },
          { key: 'SMN:viejo:0', source: 'SMN', senderName: 'Servicio Meteorologico Nacional', event: 'Viento', headline: 'Vencida', description: '', instruction: '', severity: 'Severe', onset: hours(-30), expires: hours(-2), web: '', areas: [{ desc: '', polygons: [square(-34.6, -58.4, 0.5)] }] },
        ],
        volcanoes: [{ name: 'VOLCÁN VILLARRICA', country: 'Chile', level: 'orange', lat: -39.42, lon: -71.93, report: 'https://oavv.segemar.gob.ar/scripts/show_reporte.php?id_volcan=11', source: 'OAVV' }],
      },
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  await ctx.route('**/api/lightning', (route) => route.fulfill({ json: { updatedAt: new Date().toISOString(), flashes: lightningBatch }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await ctx.route('https://api.open-meteo.com/v1/forecast**', (route) => {
    const n = new URL(route.request().url()).searchParams.get('latitude')!.split(',').length;
    route.fulfill({
      json: Array.from({ length: n }, (_, i) => ({
        current: { temperature_2m: i === 0 ? 36 : 18, precipitation: i % 3 === 0 ? 2.5 : 0, weather_code: 3, wind_speed_10m: 15, wind_direction_10m: 200, wind_gusts_10m: 30 },
      })),
    });
  });
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

async function tap(page: Page, lon: number, lat: number) {
  const map = page.getByTestId('weather-map');
  await map.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await map.boundingBox())!;
  const p = screenPoint(lon, lat, box.width, box.height);
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

test('mapa de tiempo: capas, animación, tocar un sismo o una alerta, y sin conexión', async ({ page, context }, testInfo) => {
  await mockSources(page);
  await setup(page);
  await page.goto('/#/weather');
  await page.getByRole('link', { name: /Mapa de alertas y clima/ }).click();
  await expect(page.getByRole('heading', { name: 'Mapa de alertas y clima' })).toBeVisible();
  await expect(page.getByTestId('weather-map')).toBeVisible();

  // Satélite y lluvia estimada prendidos por defecto: 2 horas de imágenes para animar.
  await expect(page.getByTestId('map-times').first()).toHaveText(/^Satélite \d\d:\d\d · Lluvia estimada \d\d:\d\d$/);
  await expect(page.getByRole('button', { name: 'Lluvia estimada (satélite)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Lluvia estimada con el infrarrojo del GOES-19/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reproducir las últimas 2 horas' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Momento' })).toHaveValue('12');
  await page.getByRole('button', { name: 'Reproducir las últimas 2 horas' }).click();
  await expect(page.getByRole('slider', { name: 'Momento' })).not.toHaveValue('12');
  await page.getByRole('button', { name: 'Pausar' }).click();

  // Radar: se suma su hora y se bajan los 13 cuadros (2 horas), con pocas teselas cada uno.
  const radarTiles = new Map<string, Set<string>>();
  page.on('request', (r) => {
    const m = r.url().match(/tilecache\.rainviewer\.com\/v2\/radar\/(f\d+)\/(.+)$/);
    if (m) radarTiles.set(m[1]!, (radarTiles.get(m[1]!) ?? new Set()).add(m[2]!));
  });
  await page.getByRole('button', { name: 'Radar de lluvia' }).click();
  await expect(page.getByTestId('map-times').first()).toHaveText(/^Satélite \d\d:\d\d · Lluvia estimada \d\d:\d\d · Radar \d\d:\d\d$/);
  await expect.poll(() => radarTiles.size, { timeout: 15_000 }).toBe(13);
  await expect(page.getByTestId('frames-progress')).toHaveCount(0, { timeout: 15_000 });
  for (const tiles of radarTiles.values()) expect(tiles.size).toBeLessThanOrEqual(16);
  await expect(page.getByText('En Argentina solo cubre el noreste')).toBeVisible();

  // Tocar un sismo muestra sus datos.
  await page.waitForTimeout(700); // que la vista quede quieta
  await tap(page, QUAKE.lon, QUAKE.lat);
  const card = page.getByTestId('map-feature');
  await expect(card).toContainText('Sismo M 5,2');
  await expect(card).toContainText('100 km S de Bahía Blanca');
  await expect(card).toContainText('Profundidad 10 km');
  await expect(card.getByRole('link', { name: 'Más información' })).toHaveAttribute('href', 'https://earthquake.usgs.gov/q1');

  // Y una alerta de GDACS (incendio forestal).
  await tap(page, FIRE.lon, FIRE.lat);
  await expect(card).toContainText('Incendio en Chaco');
  await expect(card).toContainText('Incendio forestal · alerta naranja');
  await expect(card).toContainText('12000 ha');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17-weather-map.png`, fullPage: true });

  // Las capas quedan guardadas.
  await page.getByRole('button', { name: 'Sismos' }).click();
  await expect(page.getByRole('button', { name: 'Sismos' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Viento' }).click();
  await expect(page.getByText(/Viento por zona en km\/h/)).toBeVisible();
  await page.goto('/#/weather');
  await page.goto('/#/weather/map');
  await expect(page.getByRole('button', { name: 'Sismos' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Viento' })).toHaveAttribute('aria-pressed', 'true');
  // Rayos: del servidor propio, círculos amarillos; cada tanda reemplaza a la anterior.
  await expect(page.getByRole('button', { name: 'Rayos' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lightning-status')).toHaveText(/^2 rayos en la región · actualizado \d\d:\d\d$/);
  await expect(page.getByText(/Anillos de 10, 20 y 30 km alrededor tuyo/)).toBeVisible();
  // Sin imágenes de fondo, para leer el color.
  await page.getByRole('button', { name: 'Satélite (nubes)' }).click();
  await page.getByRole('button', { name: 'Radar de lluvia' }).click();
  const map = page.getByTestId('weather-map');
  await map.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const yellowAt = async (lon: number, lat: number) => {
    const box = (await map.boundingBox())!;
    const pt = screenPoint(lon, lat, box.width, box.height);
    return map.evaluate((el, { x, y }) => {
      const c = el as HTMLCanvasElement;
      const dpr = c.width / c.getBoundingClientRect().width;
      const [r, g, b] = c.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return r! > 200 && g! > 180 && b! < 90;
    }, pt);
  };
  await expect.poll(() => yellowAt(ROSARIO.lon, ROSARIO.lat)).toBe(true);
  // Cerca de mi ubicación: anillos de 10, 20 y 30 km.
  lightningBatch = [...lightningBatch, [-34.45, -58.2, 10], [-34.47, -58.22, 40], [-34.75, -58.62, 15]];
  await page.goto('/#/weather');
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('lightning-status')).toHaveText(/^5 rayos/);
  await page.getByRole('button', { name: 'Ir a mi ubicación' }).click();
  await page.getByRole('button', { name: 'Acercar' }).click();
  await page.getByRole('button', { name: 'Acercar' }).click();
  await page.waitForTimeout(600);
  await page.getByTestId('weather-map').screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17b-lightning.png` });
  await page.getByRole('button', { name: 'Ver todo' }).click();
  lightningBatch = [[-31.4, -64.18, 20]]; // la tanda siguiente: solo Córdoba
  await page.goto('/#/weather');
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('lightning-status')).toHaveText(/^1 rayos en la región/);
  await map.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect.poll(() => yellowAt(-64.18, -31.4)).toBe(true);
  expect(await yellowAt(ROSARIO.lon, ROSARIO.lat)).toBe(false);
  await page.getByRole('button', { name: 'Satélite (nubes)' }).click();
  await page.getByRole('button', { name: 'Radar de lluvia' }).click();
  // La página no se ensancha en el celular.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Sin conexión: el mapa sigue, con lo último guardado.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/map');
  await expect(page.getByText('Sin conexión: se ven el mapa')).toBeVisible();
  await expect(page.getByTestId('weather-map')).toBeVisible();
  await context.setOffline(false);
});

test('alertas oficiales: zonas en el mapa, las de donde estoy y el texto del organismo, también sin conexión', async ({ page, context }) => {
  await mockSources(page);
  await setup(page);
  await page.goto('/#/weather/map');
  await expect(page.getByRole('button', { name: 'Alertas oficiales' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Alertas oficiales vigentes del SMN/)).toBeVisible();
  // Donde estoy (Buenos Aires): la del SMN; la vencida no aparece.
  const here = page.getByTestId('alerts-here');
  await expect(here).toContainText('Tormentas');
  await expect(here).toContainText('Servicio Meteorologico Nacional · moderada');
  await expect(here).toContainText('Tu ubicación');
  await expect(here).not.toContainText('Vencida');
  await here.getByRole('button', { name: /Tormentas/ }).click();
  const card = page.getByTestId('map-feature');
  await expect(card).toContainText('Rige desde');
  await expect(card).toContainText('1- Evitá salir.');
  await expect(card).toContainText('Texto oficial de Servicio Meteorologico Nacional, sin cambios');
  await expect(card.getByRole('link', { name: 'Más información' })).toHaveAttribute('href', 'https://www.smn.gob.ar/alertas');
  // Un volcán con alerta técnica del OAVV: el nivel y el enlace al reporte.
  await page.getByRole('button', { name: 'Satélite (nubes)' }).click();
  await page.getByRole('button', { name: 'Clima por zona' }).click();
  await page.waitForTimeout(700);
  await tap(page, -71.93, -39.42);
  await expect(card).toContainText('Villarrica');
  await expect(card).toContainText('Alerta técnica naranja (OAVV, SEGEMAR)');
  await expect(card.getByRole('link', { name: 'Más información' })).toHaveAttribute('href', /show_reporte\.php\?id_volcan=11/);
  // Tocar la zona de Chile en el mapa (sin volcanes: lo puntual tiene prioridad sobre las zonas).
  await page.getByRole('button', { name: 'Volcanes' }).click();
  await page.waitForTimeout(700);
  await tap(page, -71.6, -39.5);
  await expect(card).toContainText('Viento fuerte en la Araucanía');
  await expect(card).toContainText('Dirección Meteorológica de Chile · leve');
  // Sin conexión: quedan las guardadas.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('alerts-here')).toContainText('Tormentas');
  await context.setOffline(false);
});

test('mapa de tiempo: capas de Navegación (ríos con sus niveles, y mareas) con su ficha al tocar', async ({ page, context }, testInfo) => {
  await mockSources(page);
  // INA simulado: el Río de la Plata en Buenos Aires por encima del nivel de alerta (3,3 m).
  await context.route('https://alerta.ina.gob.ar/**', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: [{ series_id: 85, timestart: new Date(Date.now() - 3_600_000).toISOString(), valor: 3.5 }] }),
  );
  // Pronóstico del INA de Rosario (alerta en 5,00 m): sube hasta 5,2 m al cuarto día.
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/289/**', inaRunRoute(34, [4.4, 4.6, 4.9, 5.2, 5.1, 4.8]));
  // Uruguay (CARU y DINAGUA) lo lee el servidor propio: una estación del Río Negro, lejos de las del INA.
  await context.route('https://valhallarust2.ddns.net/api/rivers/uy', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        fetchedAt: Date.now(),
        sources: { caru: true, dinagua: true },
        stations: [{ id: 'dinagua-pt', name: 'Paso de los Toros', source: 'DINAGUA', provider: 'UTE', lat: -32.8, lon: -56.5, level: 3.1, at: new Date(Date.now() - 3_600_000).toISOString(), change: -0.12, trend: 'falling' }],
      },
    }),
  );
  // Bolivia (SENAMHI): el reporte diario y la planilla del pronóstico, que lee el servidor propio. Villamontes (sur de Bolivia, dentro de la vista) sale en la planilla con amenaza naranja.
  await context.route('https://valhallarust2.ddns.net/api/rivers/bo', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { reportDate: '2026-11-12', fetchedAt: Date.now(), url: 'https://senamhi.gob.bo/x.pdf', stale: false, readings: [{ station: 'VILLAMONTES', river: 'PILCOMAYO', prevDate: '2026-11-11', prevCm: 300, lastDate: '2026-11-12', lastCm: 310, zeroCm: null, trend: 'rising' }] },
    }),
  );
  await context.route('https://valhallarust2.ddns.net/api/rivers/bo/extra', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        fetchedAt: Date.now(),
        stale: false,
        forecast: null,
        lake: null,
        planilla: { issuedOn: '2026-11-13', url: 'https://senamhi.gob.bo/x/planilla.pdf', rows: [{ station: 'Villa montes', river: 'Pilcomayo', threat: 'orange', trend: 'rises', untilOverflow: 6.54, unit: 'm', period: '14 al 16, 17 al 19 noviembre' }] },
      },
    }),
  );
  await setup(page);
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('weather-map')).toBeVisible();
  // Apagadas por defecto: nada de Navegación hasta que se prenden.
  for (const name of ['Ríos', 'Mareas']) await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Clima por zona' }).click();
  await page.getByRole('button', { name: 'Alertas oficiales' }).click();
  await page.getByRole('button', { name: 'Ríos', exact: true }).click();
  await page.getByRole('button', { name: 'Mareas', exact: true }).click();
  await expect(page.getByText(/Ríos de América del Sur: líneas azules.*estaciones de nivel del INA \(Argentina\), del SENAMHI \(Bolivia\) y de CARU y DINAGUA/)).toBeVisible();
  await page.waitForTimeout(1200);

  // Una estación de mareas: la marea de ahora y las próximas.
  await tap(page, -65.04, -42.77);
  const card = page.getByTestId('map-feature');
  await expect(card).toContainText('Marea: Puerto Madryn');
  await expect(card).toContainText(/Ahora [+−-]\d,\d\d m \((subiendo|bajando)\)/);
  await expect(card).toContainText(/Próxima (pleamar|bajamar):/);
  await expect(card.getByTestId('feature-nav-link')).toHaveAttribute('href', /weather\/navigation/);

  // Una estación del INA con el nivel medido y el estado frente a sus umbrales.
  await tap(page, -58.3993, -34.5611);
  await expect(card).toContainText('Buenos Aires · Río de la Plata');
  await expect(card).toContainText('Nivel 3,50 m · Alerta');
  await expect(card).toContainText('Alerta 3,30 m · Evacuación 3,90 m · Aguas bajas 0,21 m');
  // Una estación con pronóstico: al tocarla se pide su modelo y la ficha dice el máximo y cuándo llega a la alerta.
  await tap(page, -60.6308, -32.9433);
  await expect(card).toContainText('Rosario · Paraná inferior');
  await expect(page.getByTestId('map-river-forecast')).toContainText('Pronóstico del INA: máximo 5,20 m', { timeout: 15_000 });
  await expect(page.getByTestId('map-river-forecast')).toContainText(/Llegaría a nivel de alerta \(5,00 m\)/);
  // Una sin pronóstico (Buenos Aires) no muestra esa línea.
  await tap(page, -58.3993, -34.5611);
  await expect(card).toContainText('Buenos Aires · Río de la Plata');
  await expect(page.getByTestId('map-river-forecast')).toHaveCount(0);
  // Una estación de Uruguay (DINAGUA): nivel sobre el cero de la estación, tendencia, cambio y fuente; sin umbrales.
  await tap(page, -56.5, -32.8);
  await expect(card).toContainText('Paso de los Toros');
  await expect(card).toContainText('Nivel 3,10 m');
  await expect(card).toContainText(/[-−]0,12 m desde la lectura anterior/);
  await expect(card).toContainText('Fuente: DINAGUA (UTE)');
  await expect(card).not.toContainText('Alerta');
  // Una estación de Bolivia que sale en la planilla del pronóstico: su amenaza, la tendencia, cuánto falta para el desborde y el período.
  await tap(page, -63.5033, -21.2611);
  await expect(card).toContainText('VILLAMONTES · PILCOMAYO');
  await expect(card).toContainText('310 cm sobre la escala');
  await expect(card).toContainText('Pronóstico del SENAMHI: amenaza naranja · ascensos · faltan 6,54 m para el desborde');
  await expect(card).toContainText('14 al 16, 17 al 19 noviembre');
  await page.getByRole('button', { name: 'Satélite (nubes)' }).click();
  await page.getByRole('button', { name: 'Lluvia estimada (satélite)' }).click();
  await page.waitForTimeout(700);
  await page.getByTestId('weather-map').screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17c-navigation-layers.png` });

  // El enlace lleva a Navegación con el lugar tocado (Rosario, a ~280 km de mi GPS en Buenos Aires), no con mi ubicación.
  await tap(page, -60.6308, -32.9433);
  await expect(card).toContainText('Rosario · Paraná inferior');
  await expect(card.getByTestId('feature-nav-link')).toHaveAttribute('href', /weather\/navigation\?lat=-32\.94330&lon=-60\.63080/);
  await card.getByTestId('feature-nav-link').click();
  await expect(page.getByRole('heading', { name: 'Navegación' })).toBeVisible();
  await expect(page.locator('#place-coords')).toHaveValue('-32.94330, -60.63080');
  await expect(page.getByTestId('rivers-card')).toContainText('Rosario', { timeout: 15_000 });
  await expect(page.getByTestId('tide-station')).toBeVisible({ timeout: 15_000 });
});

test('mapa de tiempo: capa de oleaje (franja pegada a la costa, ficha con el período y la dirección) y mareógrafo del IOC en la ficha de mareas', async ({ page, context }, testInfo) => {
  await mockSources(page);
  // Open-Meteo Marine simulado: una celda por coordenada pedida; el punto frente a Península Valdés con 2,3 m, uno del Pacífico sin dato (sobre tierra) y el resto con 1 m.
  let marineUrl = '';
  await context.route('https://marine-api.open-meteo.com/**', (route) => {
    marineUrl = route.request().url();
    const q = new URL(marineUrl).searchParams;
    const lats = q.get('latitude')!.split(',').map(Number);
    const lons = q.get('longitude')!.split(',').map(Number);
    const cells = lats.map((latitude, i) => {
      const longitude = lons[i]!;
      const h = Math.abs(latitude + 42.5) < 0.05 && Math.abs(longitude + 62) < 0.05 ? 2.3 : Math.abs(latitude + 34.5) < 0.05 ? null : 1.0;
      return { latitude, longitude, current: { time: Math.floor(Date.now() / 1000), wave_height: h, wave_period: 9, wave_direction: 200, swell_wave_height: 1.4, swell_wave_period: 12 } };
    });
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: cells });
  });
  // Mareógrafo de Antofagasta (servidor propio, simulado): una marea de 12,4 h.
  await context.route('https://valhallarust2.ddns.net/api/ioc/*', (route) => {
    const now = Date.now();
    const points = Array.from({ length: 180 }, (_, i) => {
      const ms = now - (179 - i) * 600_000;
      return [ms, 5.4 + 0.8 * Math.sin((2 * Math.PI * ms) / (12.42 * 3_600_000))];
    });
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { code: 'anto2', sensor: 'rad', fetchedAt: now, stale: false, points } });
  });
  await setup(page);
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('weather-map')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Oleaje', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Clima por zona' }).click();
  await page.getByRole('button', { name: 'Alertas oficiales' }).click();
  await page.getByRole('button', { name: 'Oleaje', exact: true }).click();
  await page.getByRole('button', { name: 'Mareas', exact: true }).click();
  await expect(page.getByText(/Oleaje frente a las costas \(Open-Meteo Marine, modelo\)/)).toBeVisible();
  await page.waitForTimeout(1200);
  // Una sola consulta con toda la grilla.
  expect(marineUrl).toContain('/v1/marine?latitude=');
  expect(new URL(marineUrl).searchParams.get('latitude')!.split(',').length).toBeGreaterThanOrEqual(40);

  // Tocar la franja: la altura, el estado del mar, el período, la dirección y el oleaje de fondo; es modelo, no medición.
  await tap(page, -62.0, -42.5);
  const card = page.getByTestId('map-feature');
  await expect(card).toContainText('Olas de 2,3 m');
  await expect(card).toContainText('Marejada · período 9 s · del sur');
  await expect(card).toContainText('Oleaje de fondo: 1,4 m, período 12 s');
  await expect(card).toContainText('pronóstico y no medición');
  await page.getByRole('button', { name: 'Satélite (nubes)' }).click();
  await page.getByRole('button', { name: 'Lluvia estimada (satélite)' }).click();
  await page.waitForTimeout(700);
  await page.getByTestId('weather-map').screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17d-waves-layer.png` });

  // La estación de mareas de Antofagasta suma lo que mide el mareógrafo.
  await tap(page, -70.4, -23.65);
  await expect(card).toContainText('Marea: Antofagasta');
  await expect(page.getByTestId('map-tide-gauge')).toContainText('Mareógrafo de Antofagasta:', { timeout: 15_000 });
  await expect(page.getByTestId('map-tide-gauge')).toContainText(/(sigue lo calculado|m por (encima|debajo) de lo calculado)/);
});

test('mapa de tiempo: focos de calor (respaldo: imagen de la NASA) tocables, con la cantidad de detecciones y la aclaración de que no todo es incendio', async ({ page, context }) => {
  await mockSources(page);
  // Capa de focos de la NASA (VIIRS) simulada: transparente con un grupo de píxeles rojos (unas 13 detecciones por pasada).
  const firePng = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 12, height: 12, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }, left: 140, top: 140 }])
    .png()
    .toBuffer();
  await context.route(/gibs\.earthdata\.nasa\.gov.*VIIRS_NOAA20_Thermal_Anomalies/, (route) => route.fulfill({ body: firePng, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
  // Sin respuesta del servidor (FIRMS no disponible): la capa vuelve a la imagen de la NASA, sin confianza.
  await context.route('**/api/fires', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await setup(page);
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('weather-map')).toBeVisible();
  await page.getByRole('button', { name: 'Clima por zona' }).click();
  await page.getByRole('button', { name: 'Alertas oficiales' }).click();
  await page.getByRole('button', { name: 'Satélite (nubes)' }).click();
  await page.getByRole('button', { name: 'Focos de calor' }).click();
  await expect(page.getByText(/Anomalías térmicas detectadas por satélite \(VIIRS, NASA\).*No son todas incendios/)).toBeVisible();
  await page.waitForTimeout(1200);
  // El grupo está en (146, 146) de una imagen de 400×300 que cubre todo el lienzo.
  const map = page.getByTestId('weather-map');
  await map.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await map.boundingBox())!;
  const card = page.getByTestId('map-feature');
  // Primero se pide FIRMS (503) y recién después se baja la imagen de la NASA: se toca hasta que el grupo responda.
  await expect(async () => {
    await page.mouse.click(box.x + box.width * (146.5 / 400), box.y + box.height * (146.5 / 300));
    await expect(card).toContainText('Focos de calor', { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(card).toContainText(/Unas \d+ detecciones del satélite en esta zona/);
  await expect(card).toContainText('No confirman un incendio forestal');
  await expect(card).toContainText('baja confianza');
});

test('mapa de tiempo: focos de calor de FIRMS, llama solo para alta confianza, naranja para nominal, con la ficha de cada grupo', async ({ page, context }, testInfo) => {
  await mockSources(page);
  const fetchedAt = Date.now();
  // FIRMS (servidor propio, simulado): una celda con alta confianza (2 detecciones, una alta), una nominal (4) y una de baja confianza (1).
  await context.route('**/api/fires', (route) =>
    route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: {
        fetchedAt,
        newestAt: fetchedAt - 90 * 60_000,
        total: 7,
        hidden: 120,
        sources: ['NOAA-20', 'NOAA-21'],
        stale: false,
        cells: [
          [-24.05, -66.05, 2, 1, 1, 14, 90],
          [-31.45, -64.15, 4, 0, 4, 9, 300],
          [-35.05, -68.05, 1, 0, 0, 1, 600],
        ],
      },
    }),
  );
  await setup(page);
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('weather-map')).toBeVisible();
  await page.getByRole('button', { name: 'Clima por zona' }).click();
  await page.getByRole('button', { name: 'Alertas oficiales' }).click();
  await page.getByRole('button', { name: 'Satélite (nubes)' }).click();
  await page.getByRole('button', { name: 'Lluvia estimada (satélite)' }).click();
  await page.getByRole('button', { name: 'Focos de calor' }).click();
  await expect(page.getByText(/Anomalías térmicas de las últimas 24 h \(NASA FIRMS.*la llama roja marca las de alta confianza/)).toBeVisible();
  await page.waitForTimeout(1500);
  // Aviso de lo que se ocultó (fuentes fijas) y hora de la última pasada de los satélites.
  await expect(page.getByText(/Se ocultan las detecciones de baja y media confianza que se repiten en el mismo lugar.*hoy 120/)).toBeVisible();
  await expect(page.getByTestId('map-times').first()).toHaveText(/Focos: última pasada \d\d:\d\d/);
  const card = page.getByTestId('map-feature');
  // Alta confianza: la llama; la ficha cuenta por confianza, dice hace cuánto fue la última y que no confirma un incendio.
  await tap(page, -66.05, -24.05);
  await expect(card).toContainText('Focos de calor');
  await expect(card).toContainText('2 detecciones en esta zona: 1 de alta confianza, 1 nominal');
  await expect(card).toContainText(/La más reciente: \S+ \d+, \d\d:\d\d \(hace [12] horas?\)\./);
  await expect(card).toContainText('Potencia radiativa total: 14 MW');
  await expect(card).toContainText('Solo las de alta confianza llevan llama');
  // Nominal: punto naranja.
  await tap(page, -64.15, -31.45);
  await expect(card).toContainText('4 detecciones en esta zona: 4 nominales');
  await expect(card).not.toContainText(/\d+ de alta confianza/);
  // Baja confianza.
  await tap(page, -68.05, -35.05);
  await expect(card).toContainText('Una detección en esta zona: 1 de baja confianza');
  await page.getByTestId('weather-map').screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17e-fires-firms.png` });
  // «Solo alta confianza»: desaparecen los nominales y los de baja; la de alta queda solo con sus detecciones altas.
  await page.getByTestId('fire-high-only').click();
  await expect(page.getByTestId('fire-high-only')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  await tap(page, -64.15, -31.45);
  await expect(card).toHaveCount(0);
  await tap(page, -66.05, -24.05);
  await expect(card).toContainText('Una detección en esta zona: 1 de alta confianza');
  await expect(card).not.toContainText('nominal');
  // Se vuelve a apagar y los nominales regresan.
  await page.getByTestId('fire-high-only').click();
  await page.waitForTimeout(500);
  await tap(page, -64.15, -31.45);
  await expect(card).toContainText('4 detecciones en esta zona: 4 nominales');
});

test('mapa de tiempo: con NASA atrasada usa el mosaico de NOAA de respaldo, y si ninguna fuente tiene algo de las últimas 2 horas no muestra imagen vieja', async ({ page, context }) => {
  await mockSources(page);
  const png = await sharp(Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 97) % 251)), { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
  // NASA responde, pero con imágenes vacías (75 bytes, como cuando está atrasada).
  await context.route('https://gibs.earthdata.nasa.gov/**', (route) => route.fulfill({ body: Buffer.alloc(75), contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } }));
  // NOAA: una imagen por hora; la última de hace 1 h 30.
  // NOAA: una imagen por hora; la última de hace entre 45 y 105 minutos (siempre dentro de las 2 horas, sea cual sea el minuto del reloj).
  let noaaLatest = Math.floor((Date.now() - 45 * 60_000) / 3_600_000) * 3_600_000;
  await context.route('https://nowcoast.noaa.gov/**', (route) => {
    if (route.request().url().includes('GetCapabilities')) {
      const times = Array.from({ length: 6 }, (_, i) => new Date(noaaLatest - (5 - i) * 3_600_000).toISOString()).join(',');
      return route.fulfill({ contentType: 'text/xml', headers: { 'Access-Control-Allow-Origin': '*' }, body: `<Layer><Name>global_longwave_imagery_mosaic</Name><Dimension name="time" default="${new Date(noaaLatest).toISOString()}" units="ISO8601">${times}</Dimension></Layer>` });
    }
    return route.fulfill({ body: png, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await setup(page);
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('map-times').first()).toContainText('Satélite (NOAA, respaldo)', { timeout: 20_000 });
  await expect(page.getByTestId('satellite-stale')).toHaveCount(0);

  // Todo atrasado (NOAA con 3 horas): no se muestra ninguna imagen y se explica por qué.
  noaaLatest = Math.floor((Date.now() - 3 * 3_600_000) / 3_600_000) * 3_600_000;
  await page.goto('/#/weather');
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('satellite-stale')).toContainText('más de 2 horas', { timeout: 20_000 });
  await expect(page.getByTestId('map-times').first()).not.toContainText('Satélite (NOAA');
});

test('clima histórico: elegir una fecha trae el día del historial, con sus horas, y queda guardado para verlo sin conexión', async ({ page, context }) => {
  const day = (i: number) => `2026-06-${String(12 + i).padStart(2, '0')}`;
  const body = {
    latitude: -34.6, longitude: -58.38, timezone: 'America/Argentina/Buenos_Aires', elevation: 25,
    hourly: {
      time: Array.from({ length: 7 * 24 }, (_, i) => `${day(Math.floor(i / 24))}T${String(i % 24).padStart(2, '0')}:00`),
      temperature_2m: Array(7 * 24).fill(9), precipitation: Array(7 * 24).fill(0), wind_speed_10m: Array(7 * 24).fill(12), wind_direction_10m: Array(7 * 24).fill(180), wind_gusts_10m: Array(7 * 24).fill(20),
    },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => day(i)), weather_code: Array(7).fill(3), temperature_2m_max: Array(7).fill(14), temperature_2m_min: Array(7).fill(4),
      precipitation_sum: [0, 0, 6.5, 0, 0, 0, 0], snowfall_sum: Array(7).fill(0), wind_speed_10m_max: Array(7).fill(25), wind_gusts_10m_max: Array(7).fill(40), wind_direction_10m_dominant: Array(7).fill(180),
    },
  };
  let archiveCalls = 0;
  await context.route('https://archive-api.open-meteo.com/**', (route) => (archiveCalls++, route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } })));
  await setup(page);
  await page.goto('/#/weather');
  await page.getByRole('link', { name: /Clima histórico/ }).click();
  await page.getByTestId('history-date').fill('2026-06-15');
  await expect(page.getByTestId('history-temps')).toContainText('Mínima 4° · máxima 14°');
  await expect(page.getByTestId('history-hour')).toHaveCount(24);
  await expect(page.getByRole('heading', { name: /Hora por hora · .*15 de junio/ })).toBeVisible();
  // Los días cercanos van uno al lado del otro y arriba de la tabla de horas; el elegido está marcado.
  const strip = (await page.getByTestId('history-days').boundingBox())!;
  const hours = (await page.getByTestId('history-hours').boundingBox())!;
  expect(strip.y + strip.height).toBeLessThanOrEqual(hours.y);
  const first = (await page.getByTestId('history-day-2026-06-12').boundingBox())!;
  const second = (await page.getByTestId('history-day-2026-06-13').boundingBox())!;
  expect(second.x).toBeGreaterThan(first.x);
  expect(Math.abs(second.y - first.y)).toBeLessThan(2);
  await expect(page.getByTestId('history-day-2026-06-15')).toHaveAttribute('aria-pressed', 'true');
  // Sin tocar nada no se vuelve a pedir (antes se actualizaba solo cada segundo).
  const callsAfterLoad = archiveCalls;
  await page.waitForTimeout(3500);
  expect(archiveCalls).toBe(callsAfterLoad);
  await page.getByTestId('history-day-2026-06-14').click();
  await expect(page.getByTestId('history-facts')).toContainText('6,5 mm');
  await context.setOffline(true);
  await page.getByRole('link', { name: 'Meteo' }).first().click();
  await page.getByRole('link', { name: /Clima histórico/ }).click();
  await page.getByTestId('history-date').fill('2026-06-15');
  await expect(page.getByTestId('history-temps')).toContainText('Mínima 4°');
});

test('comparación de pronósticos: resumen con grilla por modelo y, en otra solapa, el detalle técnico', async ({ page, context }) => {
  // Respuesta real de Open-Meteo con varios modelos (lat -34.6, lon -58.64), guardada en el repo.
  const body = JSON.parse(readFileSync('src/modules/weather/fixtures/compare.sample.json', 'utf8')) as unknown;
  const urls: string[] = [];
  await context.route('https://api.open-meteo.com/v1/forecast**', (route) => (urls.push(route.request().url()), route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } })));
  await setup(page);
  await page.goto('/#/weather');
  await page.getByRole('link', { name: /Comparación de pronósticos/ }).click();
  // Resumen: lectura día por día y una grilla por variable (consenso + un renglón por modelo).
  await expect(page.getByTestId('compare-read')).toBeVisible({ timeout: 20_000 });
  expect(urls[0]).toContain('models=ecmwf_ifs025');
  // Cada día en su tarjeta, con el ícono del tiempo y un ícono por dato; de entrada 7 días y el resto con «Ver los 16 días».
  await expect(page.getByTestId('compare-read').locator('li')).toHaveCount(7);
  await expect(page.getByTestId('compare-sky-2026-11-17')).toHaveAttribute('aria-label', 'Lluvia');
  await expect(page.getByTestId('compare-read-2026-11-17').locator('svg')).not.toHaveCount(0);
  await page.getByTestId('compare-show-all').click();
  await expect(page.getByTestId('compare-read').locator('li')).toHaveCount(16);
  // Los días lejanos los traen pocos modelos: se dice cuántos.
  await expect(page.getByTestId('compare-read').locator('li').last()).toContainText('modelos (los demás no llegan a ese día)');
  await expect(page.getByTestId('compare-read-2026-11-17')).toContainText('modelos');
  for (const v of ['temperature_2m', 'precipitation', 'wind_speed_10m', 'cloud_cover']) {
    await expect(page.getByTestId(`compare-grid-${v}`).locator('tbody tr')).toHaveCount(7);
  }
  await expect(page.getByTestId('compare-grid-temperature_2m').locator('tbody tr').first()).toContainText('Consenso');
  await expect(page.getByTestId('compare-grid-temperature_2m').locator('tbody tr').nth(1)).toContainText('ECMWF');
  // Detalle técnico: un gráfico con una línea por modelo, que se pueden apagar.
  await page.getByTestId('compare-tab-detail').click();
  await expect(page.getByTestId('compare-chart')).toBeVisible();
  for (const id of ['ecmwf_ifs025', 'gfs_global', 'icon_global', 'meteofrance_arpege_world', 'ukmo_global_deterministic_10km', 'jma_gsm']) {
    await expect(page.getByTestId(`compare-line-${id}`)).toHaveCount(1);
  }
  await expect(page.getByTestId('compare-table').locator('tbody tr')).toHaveCount(16);
  // ARPEGE solo llega a 4 días: los días siguientes quedan con guion.
  await expect(page.getByTestId('compare-table').locator('tbody tr').last()).toContainText('–');
  await page.getByTestId('compare-model-gfs_global').click();
  await expect(page.getByTestId('compare-line-gfs_global')).toHaveCount(0);
  // Temperatura: una sola solapa que compara máximas y mínimas a la vez (mínima / máxima por modelo y una frase para cada una).
  await expect(page.getByTestId('compare-var-temperature_2m')).toContainText('Temperatura');
  await expect(page.getByTestId('compare-var-temperature_min')).toHaveCount(0);
  await expect(page.getByTestId('compare-summary-temperature_2m')).toContainText('Máximas');
  await expect(page.getByTestId('compare-summary-temperature_min')).toContainText('Mínimas');
  await expect(page.getByTestId('compare-table').locator('tbody tr').first().locator('td').first()).toContainText('/');
  await expect(page.getByTestId('compare-table').locator('tbody tr').first()).toContainText('Máx:');
  await expect(page.getByTestId('compare-table').locator('tbody tr').first()).toContainText('Mín:');
  await page.getByTestId('compare-var-precipitation').click();
  await expect(page.getByText(/Lluvia acumulada desde ahora/)).toBeVisible();
});


test('mapa de tiempo: el radar argentino (SINARAME) pide solo los radares que se ven, anima las imágenes y muestra la atribución', async ({ page, context }) => {
  await mockSources(page);
  await setup(page);
  // Un radar de Bahía Blanca con tres imágenes (la más vieja a la más nueva) y otro en Salta.
  const bounds = (lat: number, lon: number) => ({ south: lat - 2.17, north: lat + 2.17, west: lon - 2.8, east: lon + 2.8 });
  const sites = [
    { id: 'RMA10', name: 'Bahía Blanca', bounds: bounds(-38.7, -62.2) },
    { id: 'RMA20', name: 'Las Lajitas', bounds: bounds(-24.7, -64.2) },
  ];
  const stamps = ['20260101090000', '20260101091000', '20260101092000'];
  const asked: string[] = [];
  const imagePng = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 30, g: 160, b: 60, alpha: 0.6 } } }).png().toBuffer();
  const imageRequests: string[] = [];
  await context.route('**/api/radar**', (route) => {
    const url = new URL(route.request().url());
    if (/\.png$/.test(url.pathname)) {
      imageRequests.push(url.pathname);
      return route.fulfill({ body: imagePng, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
    asked.push(ids.join(','));
    const at = (i: number) => new Date(Date.now() - (2 - i) * 600_000).toISOString();
    return route.fulfill({
      json: {
        enabled: true,
        attribution: 'Sistema Nacional de Radares Meteorológicos (SINARAME), Subsecretaría de Recursos Hídricos, y Servicio Meteorológico Nacional (CC BY 4.0)',
        rangeKm: 240,
        radars: sites.map((r) => ({
          ...r,
          lat: 0,
          lon: 0,
          frames: ids.includes(r.id) ? stamps.map((st, i) => ({ at: at(i), url: `/api/radar/${r.id}/${st}.png` })) : [],
        })),
      },
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  await page.goto('/#/weather');
  await page.getByRole('link', { name: /Mapa de alertas y clima/ }).click();
  await expect(page.getByTestId('weather-map')).toBeVisible();

  // La capa está prendida por defecto, la hora aparece y se muestra la atribución.
  await expect(page.getByRole('button', { name: 'Radar argentino' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('map-times').first()).toContainText(/Radar argentino \d\d:\d\d/, { timeout: 20_000 });
  await expect(page.getByTestId('sinarame-attribution')).toContainText('SINARAME');
  await expect(page.getByTestId('sinarame-attribution')).toContainText('orientativos');
  await expect(page.getByText(/Radares meteorológicos argentinos \(SINARAME y SMN\)/)).toBeVisible();
  // Se pidió primero la lista (sin radares elegidos) y después las imágenes de los que se ven en el país entero (los dos).
  expect(asked[0]).toBe('');
  await expect.poll(() => asked.some((a) => a.includes('RMA10'))).toBe(true);
  // Se bajaron las imágenes del radar.
  await expect.poll(() => imageRequests.some((u) => u.includes('/RMA10/'))).toBe(true);

  // Apagarla saca la hora y la atribución.
  await page.getByRole('button', { name: 'Radar argentino' }).click();
  await expect(page.getByTestId('sinarame-attribution')).toHaveCount(0);
  await expect(page.getByTestId('map-times').first()).not.toContainText('Radar argentino');
});

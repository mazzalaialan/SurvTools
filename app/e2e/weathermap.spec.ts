import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

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
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/289/**', (route) => {
    const day = 86_400_000;
    const t0 = Math.floor(Date.now() / day) * day;
    const values = [4.4, 4.6, 4.9, 5.2, 5.1, 4.8];
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: [{ id: 1, forecast_date: new Date(t0).toISOString(), series: [{ estacion_id: 34, pronosticos: values.flatMap((v, i) => ['medio', 'inferior', 'superior'].map((q) => ({ timestart: new Date(t0 + i * day).toISOString(), valor: q === 'medio' ? v : q === 'inferior' ? v - 0.3 : v + 0.4, qualifier: q }))) }] }],
    });
  });
  await setup(page);
  await page.goto('/#/weather/map');
  await expect(page.getByTestId('weather-map')).toBeVisible();
  // Apagadas por defecto: nada de Navegación hasta que se prenden.
  for (const name of ['Ríos', 'Mareas']) await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Clima por zona' }).click();
  await page.getByRole('button', { name: 'Alertas oficiales' }).click();
  await page.getByRole('button', { name: 'Ríos', exact: true }).click();
  await page.getByRole('button', { name: 'Mareas', exact: true }).click();
  await expect(page.getByText(/Ríos de América del Sur: líneas azules.*estaciones de nivel del INA \(Argentina\) y del SENAMHI/)).toBeVisible();
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
  await page.getByRole('button', { name: 'Satélite (nubes)' }).click();
  await page.getByRole('button', { name: 'Lluvia estimada (satélite)' }).click();
  await page.waitForTimeout(700);
  await page.getByTestId('weather-map').screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17c-navigation-layers.png` });

  // El enlace lleva a la pantalla de Navegación.
  await card.getByTestId('feature-nav-link').click();
  await expect(page.getByRole('heading', { name: 'Navegación' })).toBeVisible();
});

test('mapa de tiempo: capa de oleaje (grilla de puntos de mar, ficha con el período y la dirección) y mareógrafo del IOC en la ficha de mareas', async ({ page, context }, testInfo) => {
  await mockSources(page);
  // Open-Meteo Marine simulado: tres puntos de la grilla; uno de ellos sobre tierra (sin dato).
  let marineUrl = '';
  await context.route('https://marine-api.open-meteo.com/**', (route) => {
    marineUrl = route.request().url();
    const cell = (latitude: number, longitude: number, h: number | null) => ({ latitude, longitude, current: { time: Math.floor(Date.now() / 1000), wave_height: h, wave_period: 9, wave_direction: 200, swell_wave_height: 1.4, swell_wave_period: 12 } });
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: [cell(-38.8, -57.0, 2.3), cell(-23.7, -71.0, 0.8), cell(-34.5, -72.4, null)] });
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

  // Tocar un punto de mar: la altura, el estado del mar, el período, la dirección y el oleaje de fondo; es modelo, no medición.
  await tap(page, -57.0, -38.8);
  const card = page.getByTestId('map-feature');
  await expect(card).toContainText('Olas de 2,3 m');
  await expect(card).toContainText('Marejada · período 9 s · del sur');
  await expect(card).toContainText('Oleaje de fondo: 1,4 m, período 12 s');
  await expect(card).toContainText('pronóstico y no medición');
  await page.getByTestId('weather-map').screenshot({ path: `e2e-results/screens/${testInfo.project.name}-17d-waves-layer.png` });

  // La estación de mareas de Antofagasta suma lo que mide el mareógrafo.
  await tap(page, -70.4, -23.65);
  await expect(card).toContainText('Marea: Antofagasta');
  await expect(page.getByTestId('map-tide-gauge')).toContainText('Mareógrafo de Antofagasta:', { timeout: 15_000 });
  await expect(page.getByTestId('map-tide-gauge')).toContainText(/(sigue lo calculado|m por (encima|debajo) de lo calculado)/);
});

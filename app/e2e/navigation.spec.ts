import { readFileSync } from 'node:fs';
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

test('Navegación: mareas sin conexión de la estación más cercana, con el aviso fijo y la fuente', async ({ page, context }, testInfo) => {
  // Puerto Madryn.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -42.77, longitude: -65.04, accuracy: 20 });
  await start(page);
  // Aparece en Meteorología.
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Meteo', exact: true }).first().click();
  await page.getByRole('link', { name: /Navegación/ }).click();
  await expect(page.getByRole('heading', { name: 'Navegación' })).toBeVisible();
  await expect(page.getByTestId('navigation-notice')).toContainText('No reemplaza las cartas náuticas');
  await expect(page.getByTestId('tide-station')).toContainText('Puerto Madryn', { timeout: 15_000 });
  await expect(page.getByTestId('tide-far')).toHaveCount(0);
  await expect(page.getByTestId('tide-estuary')).toHaveCount(0);
  await expect(page.getByTestId('tide-now')).toContainText(/Ahora [+−-]\d,\d\d m \((subiendo|bajando)\)/);
  await expect(page.getByTestId('tide-chart')).toBeVisible();
  expect(await page.getByTestId('tide-extremes').locator('li').count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId('tide-extremes')).toContainText('Pleamar');
  await expect(page.getByTestId('tide-extremes')).toContainText('Bajamar');
  await expect(page.getByTestId('tide-source')).toContainText('CC BY 4.0');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-96-navigation-tides.png`, fullPage: true });

  // Sin conexión funciona igual (se calcula en el teléfono con los datos ya guardados): se sale y se vuelve a entrar.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toContainText('Puerto Madryn', { timeout: 15_000 });
  await expect(page.getByTestId('tide-chart')).toBeVisible();
});

test('Navegación: sin estación cerca (Montevideo) se avisa que la marea puede ser muy distinta', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.9, longitude: -56.2, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toContainText('Buenos Aires', { timeout: 15_000 });
  await expect(page.getByTestId('tide-far')).toContainText('puede ser muy distinta');
  await expect(page.getByTestId('tide-estuary')).toContainText('el viento y el caudal');
  // Se puede elegir otra de las estaciones cercanas.
  const chips = page.getByTestId('tide-stations').getByRole('button');
  await expect(chips).toHaveCount(3);
  await chips.nth(1).click();
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('Navegación: niveles de los ríos del INA con su estado, y sin conexión los últimos guardados', async ({ page, context }, testInfo) => {
  // Buenos Aires: el INA responde (simulado) con el río sobre el nivel de alerta (3,30 m) y 0,5 m más que ayer.
  await context.route('https://alerta.ina.gob.ar/**', async (route) => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    await route.fulfill({
      json: [
        { series_id: 85, timestart: iso(now - 26 * 3_600_000), valor: 3.0 },
        { series_id: 85, timestart: iso(now - 2 * 3_600_000), valor: 3.5 },
      ],
    });
  });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.56, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const row = page.getByTestId('river-85');
  await expect(row).toContainText('Buenos Aires', { timeout: 15_000 });
  await expect(row).toContainText('Río de la Plata');
  await expect(row).toContainText('Alerta 3,30 m');
  await expect(row).toContainText('Evacuación 3,90 m');
  await expect(page.getByTestId('river-state-85')).toHaveText('Alerta');
  await expect(row).toContainText('3,50 m');
  await expect(row).toContainText('+0,50 m en 24 h');
  await expect(row).toContainText('medido hace 2 h');
  await expect(page.getByTestId('rivers-source')).toContainText('INA');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-97-navigation-rivers.png`, fullPage: true });

  // Sin conexión: se ve el último nivel guardado y el aviso.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('rivers-offline')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('river-85')).toContainText('3,50 m');
  await expect(page.getByTestId('river-state-85')).toHaveText('Alerta');
});

/** Respuestas simuladas de Open-Meteo: olas de 1,9 m con viento; sin olas (todo null) si `land`. */
async function mockOpenMeteo(page: Page, land = false) {
  const hour = 3600;
  const start = Math.floor(Date.now() / 1000 / hour) * hour - 6 * hour;
  const time = Array.from({ length: 72 }, (_, i) => start + i * hour);
  await page.context().route('https://marine-api.open-meteo.com/**', (route) =>
    route.fulfill({
      json: {
        latitude: -38.125,
        longitude: -57.458,
        hourly: {
          time,
          wave_height: time.map((_, i) => (land ? null : 1.9 + Math.sin(i / 6) * 0.4)),
          wave_period: time.map(() => (land ? null : 7)),
          wave_direction: time.map(() => (land ? null : 200)),
          swell_wave_height: time.map(() => (land ? null : 1.2)),
          swell_wave_period: time.map(() => (land ? null : 9)),
        },
      },
    }),
  );
  await page.context().route('https://api.open-meteo.com/v1/forecast**', (route) =>
    route.fulfill({
      json: { hourly: { time, wind_speed_10m: time.map(() => 20), wind_gusts_10m: time.map(() => 35), wind_direction_10m: time.map(() => 180) } },
    }),
  );
}

test('Navegación: oleaje y viento con el estado del mar, el punto del modelo y la fuente', async ({ page, context }, testInfo) => {
  await mockOpenMeteo(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -38.1, longitude: -57.45, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('wave-now')).toContainText(/\d,\d m/, { timeout: 15_000 });
  await expect(page.getByTestId('wave-now')).toContainText(/Marejada|Marejadilla/);
  await expect(page.getByTestId('wave-now')).toContainText('período 7 s');
  await expect(page.getByTestId('wave-now')).toContainText('del sur');
  await expect(page.getByTestId('wave-swell')).toContainText('Oleaje de fondo: 1,2 m, período 9 s');
  await expect(page.getByTestId('wave-wind')).toContainText('20 km/h (11 nudos), ráfagas 35 · del sur');
  await expect(page.getByTestId('wave-chart')).toBeVisible();
  expect(await page.getByTestId('wave-rows').locator('li').count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId('waves-source')).toContainText('Open-Meteo Marine');
  await expect(page.getByTestId('waves-card')).toContainText('No sirve para navegar cerca de la costa');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-98-navigation-waves.png`, fullPage: true });

  // Sin conexión: queda el último pronóstico guardado de este lugar.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('waves-offline')).toContainText('último pronóstico guardado', { timeout: 15_000 });
  await expect(page.getByTestId('wave-now')).toContainText(/\d,\d m/);
});

test('Navegación: en un río o tierra adentro el modelo marino no cubre el punto y lo dice', async ({ page, context }) => {
  await mockOpenMeteo(page, true);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -32.95, longitude: -60.64, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('waves-none')).toContainText('no cubre este punto', { timeout: 15_000 });
  await expect(page.getByTestId('wave-now')).toHaveCount(0);
});

test('Navegación: pronóstico marítimo de la Armada de Chile para tu zona y lista de fuentes con licencia', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.route('https://meteoarmada.directemar.cl/**', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        titulo: 'x',
        pronostico: {
          periodo_validez: { inicio: '141200 UTC', fin: '151200 UTC' },
          pronostico_detallado: [
            { 'id-zona': 3, zona: 'Zona Tres (Valparaíso a Constitución)', viento: 'N/NW 15/25 KT OCASIONAL 30 KT', mar_oceanico: 'MAREJADILLA A MAREJADA (1.0/2.5 M)', mar_bahia: 'RIZADA EN BAHIAS.', visibilidad: 'BUENA (10 KM)', nubosidad: 'NUBLADO', situacion_sinoptica: 'CIRCULACION CICLONICA.' },
            { 'id-zona': 4, zona: 'Zona Cuatro (Constitución a I.Mocha)', viento: 'S/SE 10/20 KT', mar_oceanico: 'MAREJADA (1.5/2.5 M)' },
          ],
        },
      },
    }),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -33.6, longitude: -71.62, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const mine = page.getByTestId('chile-mine');
  await expect(mine).toContainText('Zona Tres (Valparaíso a Constitución)', { timeout: 20_000 });
  await expect(mine).toContainText('N/NW 15/25 kt ocasional 30 kt');
  await expect(mine).toContainText('Marejadilla a marejada (1.0/2.5 m)');
  await expect(page.getByTestId('chile-validity')).toContainText('14 12:00 UTC');
  await expect(page.getByTestId('chile-zone-4')).toBeVisible();
  await expect(page.getByTestId('chile-source')).toContainText('Armada de Chile');
  // Lista de fuentes con licencia.
  const sources = page.getByTestId('sources-card');
  await expect(sources).toContainText('CC BY 4.0');
  await expect(page.getByTestId('source-open-meteo')).toContainText('solo para uso no comercial');
  await expect(page.getByTestId('source-ina')).toContainText('Sin licencia declarada');
});

test('Navegación: la tarjeta de Chile no aparece fuera de Chile', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.56, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chile-card')).toHaveCount(0);
});

test('Navegación: aviso marino de INUMET en el Río de la Plata (también del lado argentino) con la situación sinóptica', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.route('https://www.inumet.gub.uy/**', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        activo: 1,
        fechaInicioValidez: '2026-11-14',
        horaInicioValidez: '00:00',
        fechaEmision: '2026-11-13 23:34:17',
        situacionSinoptica: 'Borde occidental de sistema de alta presión que continúa desplazándose al ENE.',
        zonasDescripcion: [{ zonaId: 'RDP', tipo: 'visibilidad', zonaNombre: 'Río de la Plata', descripcion: 'Se formula por neblinas y bancos de nieblas. Validez: desde las 0800 UTC.' }],
      },
    }),
  );
  await context.grantPermissions(['geolocation']);
  // Buenos Aires, orilla argentina del estuario.
  await context.setGeolocation({ latitude: -34.56, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const warnings = page.getByTestId('uy-warnings');
  await expect(warnings).toContainText('Río de la Plata · visibilidad', { timeout: 20_000 });
  await expect(warnings).toContainText('neblinas y bancos de nieblas');
  await expect(page.getByTestId('uy-synoptic')).toContainText('sistema de alta presión');
  await expect(page.getByTestId('uy-issued')).toContainText('2026-11-13 23:34:17');
  await expect(page.getByTestId('uy-source')).toContainText('INUMET');
});

test('Navegación: el aviso de INUMET no aparece lejos del Río de la Plata (Puerto Madryn)', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -42.77, longitude: -65.04, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('uy-card')).toHaveCount(0);
});

test('Navegación: ríos y lago Titicaca de Bolivia (SENAMHI) con la fecha de cada lectura y el aviso de lectura vieja', async ({ page, context }, testInfo) => {
  await mockOpenMeteo(page);
  // El servidor propio responde (simulado) con el reporte leído del PDF del SENAMHI.
  await context.route('https://valhallarust2.ddns.net/api/rivers/bo', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        reportDate: '2026-11-12',
        fetchedAt: Date.now(),
        url: 'https://senamhi.gob.bo/x.pdf',
        stale: false,
        readings: [
          { station: 'HUATAJATA', river: 'TITICACA', prevDate: '2026-11-11', prevCm: 321, lastDate: '2026-11-12', lastCm: 320, zeroCm: null, trend: 'falling' },
          { station: 'AGUALLAMAYA', river: 'DESAGUADERO', prevDate: '2026-11-10', prevCm: 84, lastDate: '2026-11-11', lastCm: 85, zeroCm: null, trend: 'rising' },
          { station: 'GUANAY', river: 'MAPIRI', prevDate: '2026-05-31', prevCm: 100, lastDate: '2026-06-01', lastCm: 100, zeroCm: 500, trend: 'steady' },
        ],
      },
    }),
  );
  await context.grantPermissions(['geolocation']);
  // Orilla boliviana del lago Titicaca.
  await context.setGeolocation({ latitude: -16.21, longitude: -68.71, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const row = page.getByTestId('bo-HUATAJATA-TITICACA');
  await expect(row).toContainText('Huatajata'.toUpperCase(), { timeout: 20_000 });
  await expect(row).toContainText('320 cm');
  await expect(row).toContainText('Descenso');
  await expect(row).toContainText('−1 cm desde la lectura anterior'.replace('−', '-'));
  await expect(row).toContainText('ubicación aproximada');
  await expect(page.getByTestId('bo-report')).toContainText('Reporte del');
  // La lectura de junio se marca como vieja.
  await expect(page.getByTestId('bo-GUANAY-MAPIRI')).toContainText('lectura vieja');
  await expect(page.getByTestId('bo-GUANAY-MAPIRI')).toContainText('Nivel cero de barranco: 500 cm');
  await expect(page.getByTestId('bo-HUATAJATA-TITICACA').getByTestId('bo-old')).toHaveCount(0);
  await expect(page.getByTestId('bo-source')).toContainText('SENAMHI Bolivia');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-99-navigation-bolivia.png`, fullPage: true });

  // Sin conexión: el último reporte guardado.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('bo-offline')).toContainText('último reporte guardado', { timeout: 15_000 });
  await expect(page.getByTestId('bo-HUATAJATA-TITICACA')).toContainText('320 cm');
});

test('Navegación: la tarjeta de Bolivia no aparece fuera de Bolivia', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.56, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('bo-card')).toHaveCount(0);
});

test('Navegación: mareógrafo medido del IOC sobre la marea calculada (Antofagasta), y sin conexión queda la última lectura', async ({ page, context }, testInfo) => {
  await mockOpenMeteo(page);
  // El servidor propio responde (simulado) con 30 horas de lecturas cada 10 minutos: una marea de 12,4 h y 0,8 m de amplitud.
  let asked = '';
  await context.route('https://valhallarust2.ddns.net/api/ioc/*', (route) => {
    asked = route.request().url();
    const now = Date.now();
    const points = Array.from({ length: 180 }, (_, i) => {
      const ms = now - (179 - i) * 600_000;
      return [ms, 5.4 + 0.8 * Math.sin((2 * Math.PI * ms) / (12.42 * 3_600_000))];
    });
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { code: 'anto2', sensor: 'rad', fetchedAt: now, stale: false, points } });
  });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -23.65, longitude: -70.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toContainText('Antofagasta', { timeout: 15_000 });
  const gauge = page.getByTestId('tide-gauge-dev');
  await expect(gauge).toContainText('Mareógrafo de Antofagasta:', { timeout: 15_000 });
  await expect(gauge).toContainText(/(sigue lo calculado|m por (encima|debajo) de lo calculado) \(medido a las \d\d:\d\d\)/);
  expect(asked).toMatch(/\/api\/ioc\/anto2$/);
  await expect(page.getByTestId('tide-measured-line')).toHaveCount(1);
  await expect(page.getByTestId('tide-gauge')).toContainText('IOC');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-97-navigation-gauge.png`, fullPage: true });

  // Sin conexión queda la última lectura guardada.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-gauge-dev')).toContainText('Mareógrafo de Antofagasta:', { timeout: 15_000 });
});

test('Navegación: sin mareógrafo medido cerca (Puerto Madryn sí, Buenos Aires no) no aparece la línea medida', async ({ page, context }) => {
  await context.route('https://valhallarust2.ddns.net/api/ioc/*', (route) => route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, json: { error: 'disabled' } }));
  await context.grantPermissions(['geolocation']);
  // Buenos Aires: sin mareógrafo en el catálogo; Madryn: lo hay pero el servidor lo tiene apagado (sin clave).
  await context.setGeolocation({ latitude: -34.6, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toContainText('Buenos Aires', { timeout: 15_000 });
  await expect(page.getByTestId('tide-gauge')).toHaveCount(0);
  await expect(page.getByTestId('tide-measured-line')).toHaveCount(0);
});

/** Una corrida del INA como la de las tablas de pronóstico: una estación, diaria, con banda inferior y superior. */
function inaRun(estacion: number, values: number[], names = { main: 'medio', lo: 'inferior', hi: 'superior' }, stepMs = 86_400_000) {
  const t0 = Math.floor(Date.now() / stepMs) * stepMs;
  return [
    {
      id: 1,
      forecast_date: new Date(t0).toISOString(),
      series: [
        {
          estacion_id: estacion,
          pronosticos: values.flatMap((v, i) => [
            { timestart: new Date(t0 + i * stepMs).toISOString(), valor: v, qualifier: names.main },
            { timestart: new Date(t0 + i * stepMs).toISOString(), valor: v - 0.3, qualifier: names.lo },
            { timestart: new Date(t0 + i * stepMs).toISOString(), valor: v + 0.4, qualifier: names.hi },
          ]),
        },
      ],
    },
  ];
}

test('Navegación: pronóstico del INA en el río (Rosario) con el máximo, cuándo llega a un nivel y el gráfico con su banda, también sin conexión', async ({ page, context }, testInfo) => {
  await mockOpenMeteo(page);
  await context.route('https://alerta.ina.gob.ar/a5/obs/**', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: [
        { series_id: 34, timestart: new Date(Date.now() - 3_600_000).toISOString(), valor: 4.4 },
        // Caudal medio diario de Rosario (serie 26631): ayer y anteayer.
        { series_id: 26631, timestart: new Date(Date.now() - 2 * 86_400_000).toISOString(), valor: 8540 },
        { series_id: 26631, timestart: new Date(Date.now() - 86_400_000).toISOString(), valor: 8420 },
      ],
    }),
  );
  // Rosario: alerta en 5,00 m. El pronóstico sube hasta 5,2 m en el cuarto día.
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/289/**', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: inaRun(34, [4.4, 4.6, 4.9, 5.2, 5.1, 4.8, 4.6, 4.5, 4.4]) }),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -32.95, longitude: -60.65, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const row = page.getByTestId('river-forecast-34');
  await expect(row).toContainText('Pronóstico del INA: máximo 5,20 m', { timeout: 20_000 });
  await expect(row).toContainText(/Llegaría a nivel de alerta \(5,00 m\)/);
  await expect(page.getByTestId('rivers-card')).toContainText('Pronóstico del INA, informativo: no es una alerta oficial');
  await expect(page.getByTestId('river-flow-34')).toContainText(/Caudal medio del \d+ \w+\.?: 8420 m³\/s · -120 m³\/s respecto del día anterior/);
  await row.getByRole('button', { name: 'Ver pronóstico' }).click();
  await expect(page.getByTestId('forecast-chart-34')).toBeVisible();
  await expect(page.getByTestId('forecast-chart-34-band')).toHaveCount(1);
  await expect(page.getByTestId('forecast-chart-34-fc-alert')).toHaveCount(1);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-98-river-forecast.png`, fullPage: true });
  // Sin conexión queda el último pronóstico guardado.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('river-forecast-34')).toContainText('Pronóstico del INA: máximo 5,20 m', { timeout: 20_000 });
});

test('Navegación: en el Río de la Plata el pronóstico del INA para San Fernando (viento y caudales) con su banda', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.route('https://alerta.ina.gob.ar/a5/obs/**', (route) => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: [] }));
  // Modelo horario de San Fernando (aparece desde ahora): sube hasta 2,6 m en dos días.
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/432/**', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: inaRun(52, [1.2, 1.6, 2.0, 2.4, 2.6, 2.3, 1.9, 1.5], { main: 'main', lo: 'p05', hi: 'p95' }, 3_600_000 * 6) }),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.6, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-estuary')).toBeVisible({ timeout: 15_000 });
  const box = page.getByTestId('estuary-forecast');
  await expect(box).toContainText('Pronóstico del INA para el estuario', { timeout: 20_000 });
  await expect(page.getByTestId('estuary-chart')).toBeVisible();
  await expect(page.getByTestId('estuary-chart-band')).toHaveCount(1);
  await expect(page.getByTestId('estuary-peak')).toContainText('Máximo previsto 2,60 m');
  await expect(page.getByTestId('estuary-peak')).toContainText('entre 2,30 y 3,00 m');
});

test('Navegación: sin pronóstico del INA (Ushuaia, lejos de los ríos con modelo) no aparece el pronóstico de estuario', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -54.8, longitude: -68.3, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('estuary-forecast')).toHaveCount(0);
});

test('Waypoint: en su detalle se ve el río más cercano con su nivel, estado y pronóstico, y el enlace abre Navegación en ese lugar', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.route('https://alerta.ina.gob.ar/a5/obs/**', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: [{ series_id: 34, timestart: new Date(Date.now() - 3_600_000).toISOString(), valor: 5.1 }, { series_id: 26631, timestart: new Date(Date.now() - 86_400_000).toISOString(), valor: 8420 }] }),
  );
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/289/**', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: inaRun(34, [5.1, 5.15, 5.2, 5.1, 4.9, 4.7]) }),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.6, longitude: -58.4, accuracy: 20 });
  await start(page);
  // Un waypoint en Rosario (a ~1 km de la estación) y otro en Córdoba (lejos de cualquier estación).
  const urls: Record<string, string> = {};
  for (const [name, coords] of [['Muelle Rosario', '-32.9500, -60.6400'], ['Casa Córdoba', '-31.4200, -64.1900']] as const) {
    await page.goto('/#/orientation/waypoints/new');
    await page.getByLabel('Nombre').fill(name);
    await page.getByLabel('Coordenadas').fill(coords);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.waitForTimeout(400);
    urls[name] = page.url();
  }
  await page.goto(urls['Casa Córdoba']!);
  await expect(page.getByRole('heading', { name: 'Casa Córdoba' })).toBeVisible();
  await expect(page.getByTestId('nearest-river')).toHaveCount(0);

  await page.goto(urls['Muelle Rosario']!);
  const card = page.getByTestId('nearest-river');
  await expect(card).toContainText('Río más cercano', { timeout: 15_000 });
  await expect(page.getByTestId('nearest-river-name')).toContainText('Rosario · Paraná inferior');
  await expect(page.getByTestId('nearest-river-name')).toContainText(/a \d(,\d)? km al /);
  await expect(page.getByTestId('nearest-river-level')).toContainText('5,10 m');
  await expect(page.getByTestId('nearest-river-level')).toContainText('Alerta');
  await expect(page.getByTestId('nearest-river-flow')).toContainText(/Caudal medio del .*: 8420 m³\/s/);
  await expect(card.getByTestId('map-river-forecast')).toContainText('Pronóstico del INA: máximo 5,20 m', { timeout: 15_000 });
  // El enlace abre Navegación en el lugar del waypoint, no en mi ubicación (Buenos Aires).
  await card.getByRole('link', { name: 'Ver todo en Navegación' }).click();
  await expect(page.locator('#place-coords')).toHaveValue('-32.95000, -60.64000');
  await expect(page.getByTestId('rivers-card')).toContainText('Rosario', { timeout: 15_000 });
});

test('Navegación: bahías cercanas de la Armada de Chile (Valparaíso) con el pronóstico de día y de noche', async ({ page, context }) => {
  await mockOpenMeteo(page);
  const bays = JSON.parse(readFileSync(new URL('../src/modules/navigation/fixtures/bahias_met.sample.json', import.meta.url), 'utf8'));
  await context.route('https://meteoarmada.directemar.cl/meteo/stat/download/regionalMaritimo.json', (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { pronostico: { periodo_validez: { inicio: '141200 UTC', fin: '151200 UTC' }, pronostico_detallado: [{ 'id-zona': 2, zona: 'Zona Dos (Coquimbo a Valparaíso)', viento: 'S 10/15 KT' }] } } }),
  );
  await context.route('https://meteoarmada.directemar.cl/meteo/stat/download/bahias_met.json', (route) => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: bays }));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -33.04, longitude: -71.62, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const box = page.getByTestId('chile-bays');
  await expect(box).toContainText('Bahías cercanas', { timeout: 20_000 });
  const valpo = page.getByTestId('chile-bay-14');
  await expect(valpo).toContainText('Bahía Valparaíso');
  await expect(valpo).toContainText(/a \d+ km/);
  await expect(valpo).toContainText('Mar en la bahía');
  await expect(valpo).toContainText('Olas');
  await expect(valpo).toContainText(/\d{2}:\d{2}/);
  // Arica queda lejos (más de 150 km): no aparece entre las cercanas.
  await expect(box).not.toContainText('Bahía Arica');
});

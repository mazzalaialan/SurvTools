import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { inaRunRoute, inaSurgeRoute } from './fixtures/inaForecast';

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
  // Tabla oficial del SHN del puerto más cercano (guardada en el teléfono): con la fuente y la aclaración del cero.
  const official = page.getByTestId('official-table');
  await expect(official).toContainText('Tabla oficial del SHN', { timeout: 15_000 });
  await expect(official).toContainText('PUERTO MADRYN');
  await expect(official).toContainText('Servicio de Hidrografía Naval');
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
  // Resumen del pronóstico hidrológico y boletín del lago (servidor propio, simulado con el texto real del SENAMHI del 13 y del 6 de noviembre).
  await context.route('https://valhallarust2.ddns.net/api/rivers/bo/extra', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        fetchedAt: Date.now(),
        stale: false,
        forecast: {
          issuedOn: '2026-11-13',
          period: 'Del 13 al 27 noviembre de 2026',
          note: 'Amenaza: aportes y ascensos de niveles del 07 AL 09, 14 al 16 noviembre sobre las cuencas de Tarija , Chuquisaca, Santa Cruz, Cbba, Beni, La Paz, Pando. Se sugiere tomar precauciones en zonas ribereñas.',
          trend: 'rises',
          spans: 'Del 13 al 16, 17 al 19, 21 al 23, 23 al 25, 25 al 27/11/2026',
          url: 'https://senamhi.gob.bo/x/resumen.pdf',
        },
        lake: { date: '2026-11-06', levelM: 3.23, absoluteM: 3807.637, weekCm: -2, vsAverageM: -0.87, url: 'https://senamhi.gob.bo/x/lago.pdf' },
        // La planilla por estación (forma real, leída por posición): Guanay sale dos veces, en la cuenca del Tipuani (naranja) y en la del Mapiri (amarilla).
        planilla: {
          issuedOn: '2026-11-13',
          url: 'https://senamhi.gob.bo/x/planilla.pdf',
          rows: [
            { station: 'Guanay Mapiri', river: 'Mapiri', threat: 'yellow', trend: 'rises', untilOverflow: null, unit: null, period: '13 al 16, 21 al 23 noviembre' },
            { station: 'Guanay Tipuani', river: 'Tipuani', threat: 'orange', trend: 'rises', untilOverflow: 2.5, unit: 'm', period: '13 al 16, 21 al 23 noviembre' },
          ],
        },
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
  const fc = page.getByTestId('bo-forecast');
  await expect(fc).toContainText('Pronóstico hidrológico del SENAMHI');
  await expect(fc).toContainText('Del 13 al 27 noviembre de 2026');
  await expect(page.getByTestId('bo-forecast-note')).toContainText('cuencas de Tarija , Chuquisaca, Santa Cruz, Cbba, Beni, La Paz, Pando');
  await expect(page.getByTestId('bo-forecast-spans')).toContainText('Probables ascensos: Del 13 al 16, 17 al 19');
  await expect(fc).toContainText('informativo, no es una alerta oficial');
  await expect(fc.getByRole('link', { name: 'Ver el resumen del SENAMHI' })).toHaveAttribute('href', 'https://senamhi.gob.bo/x/resumen.pdf');
  // Lo que pronostica el SENAMHI para la estación (planilla): la peor amenaza, la tendencia, cuánto falta para el desborde y el período.
  const threat = page.getByTestId('bo-GUANAY-MAPIRI').getByTestId('bo-threat-orange');
  await expect(threat).toContainText('Pronóstico del SENAMHI: amenaza naranja · ascensos · faltan 2,5 m para el desborde');
  await expect(threat).toContainText('13 al 16, 21 al 23 noviembre');
  await expect(page.getByTestId('bo-HUATAJATA-TITICACA').getByTestId('bo-threat-orange')).toHaveCount(0);
  const lake = page.getByTestId('bo-lake');
  await expect(lake).toContainText('Huatajata: 3,23 m (3807,637 m s. n. m.)');
  await expect(lake).toContainText('bajó 2 cm en la semana');
  await expect(lake).toContainText('0,87 m por debajo del promedio histórico');
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
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/289/**', inaRunRoute(34, [4.4, 4.6, 4.9, 5.2, 5.1, 4.8, 4.6, 4.5, 4.4]));
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/434/**', inaRunRoute(34, [4.6, 4.8, 5.0, 5.1, 4.9, 4.7, 4.5], { main: 'main', lo: 'min', hi: 'max' }, 7 * 86_400_000));
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/499/**', inaRunRoute(34, [4.5, 4.7, 4.9, 5.0, 4.8, 4.6], { main: 'main', lo: 'p10', hi: 'p90' }, 14 * 86_400_000));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -32.95, longitude: -60.65, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const row = page.getByTestId('river-forecast-34');
  await expect(row).toContainText('Pronóstico del INA: máximo 5,20 m', { timeout: 20_000 });
  await expect(row).toContainText(/Llegaría a nivel de alerta \(5,00 m\)/);
  await expect(page.getByTestId('rivers-card')).toContainText('Pronóstico del INA, informativo: no es una alerta oficial');
  // Perspectivas de plazo largo: media semanal y estacional, cada una con su gráfico, y la aclaración de que no son un pronóstico de crecida.
  const outlook = page.getByTestId('river-outlook-34');
  await outlook.getByRole('button', { name: 'Ver perspectiva de semanas y meses' }).click();
  await expect(page.getByTestId('river-outlook-34-weekly')).toContainText('Altura media semanal (próximas semanas)');
  await expect(page.getByTestId('river-outlook-34-weekly')).toContainText(/Promedio semanal previsto: máximo 5,10 m/);
  await expect(page.getByTestId('river-outlook-34-seasonal')).toContainText('Perspectiva estacional (SISSA)');
  await expect(page.getByTestId('river-outlook-34-seasonal')).toContainText(/percentiles 10 a 90/);
  await expect(page.getByTestId('outlook-chart-34-weekly-band')).toHaveCount(1);
  await expect(page.getByTestId('outlook-chart-34-seasonal-band')).toHaveCount(1);
  await expect(outlook).toContainText('No son un pronóstico de crecida ni una alerta');
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
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/432/**', inaRunRoute(52, [1.2, 1.6, 2.0, 2.4, 2.6, 2.3, 1.9, 1.5], { main: 'main', lo: 'p05', hi: 'p95' }, 3_600_000 * 6));
  // Sobreelevación meteorológica (calibrado 308): sube hasta +0,40 m y baja a −0,25 m en los próximos días.
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/308/**', inaSurgeRoute([-0.25, -0.1, 0.1, 0.3, 0.4, 0.3, 0.1, -0.1, -0.2, 0, 0.2, 0.1]));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.6, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-estuary')).toBeVisible({ timeout: 15_000 });
  // La sobreelevación del INA: texto con la máxima y la mínima, y la marea calculada corregida con ella en el gráfico.
  const surge = page.getByTestId('estuary-surge');
  await expect(surge).toContainText('Sobreelevación por el viento y la presión (INA):', { timeout: 20_000 });
  await expect(surge).toContainText('máxima +0,40 m');
  await expect(surge).toContainText(/mínima [-−]0,20 m/); // la de hace una hora (−0,25) ya pasó
  await expect(page.getByTestId('tide-surge-line')).toBeVisible();
  const box = page.getByTestId('estuary-forecast');
  await expect(box).toContainText('Pronóstico del INA para el estuario', { timeout: 20_000 });
  await expect(page.getByTestId('estuary-chart')).toBeVisible();
  await expect(page.getByTestId('estuary-chart-band')).toHaveCount(1);
  await expect(page.getByTestId('estuary-peak')).toContainText('Máximo previsto 2,60 m');
  await expect(page.getByTestId('estuary-peak')).toContainText('entre 2,30 y 3,00 m');
});

test('Navegación: en el Río de la Plata aparece el pronóstico oficial del SHN con viento, con la hora comparada con la calculada, y vencido avisa', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.route('https://alerta.ina.gob.ar/a5/**', (route) => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: [] }));
  // Emisión del SHN vigente por 8 horas, con tres extremos en Buenos Aires.
  const H = 3_600_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const now = Date.now();
  const forecast = (validTo: number) => ({
    fetchedAt: now,
    issuedOn: '2026-11-16',
    validFrom: iso(now - 5 * H),
    validTo: iso(validTo),
    notes: ['VEINTE CENTIMETROS POR DEBAJO DE LOS VALORES INDICADOS EN LAS TABLAS DE MAREA', 'VEINTE CENTIMETROS POR DEBAJO DE LOS VALORES INDICADOS EN LAS TABLAS DE MAREA'],
    stale: false,
    stations: [
      {
        id: 'buenos-aires',
        name: 'PUERTO DE BUENOS AIRES (Muelle de Pescadores)',
        section: 'interior',
        lat: -34.567,
        lon: -58.4,
        events: [
          { type: 'low', at: iso(now + 1 * H), height: 0.35 },
          { type: 'high', at: iso(now + 4 * H), height: 1.1 },
          { type: 'low', at: iso(now + 9 * H), height: 0.5 },
        ],
      },
    ],
  });
  let valid = true;
  await context.route('**/api/tides/shn', (route) => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: forecast(valid ? now + 8 * H : now - 1 * H) }));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.6, longitude: -58.4, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const box = page.getByTestId('shn-forecast');
  await expect(box).toContainText('Pronóstico oficial del SHN (con viento)', { timeout: 20_000 });
  await expect(box).toContainText('PUERTO DE BUENOS AIRES');
  await expect(page.getByTestId('shn-events').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('shn-events')).toContainText('Bajamar');
  await expect(page.getByTestId('shn-events')).toContainText('Pleamar');
  await expect(box).toContainText('Servicio de Hidrografía Naval');
  await expect(page.getByTestId('shn-expired')).toHaveCount(0);
  // Una emisión vencida avisa que hay que actualizarla.
  valid = false;
  await page.goto('/#/weather');
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('shn-expired')).toBeVisible({ timeout: 20_000 });
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
  await context.route('https://alerta.ina.gob.ar/a5/sim/calibrados/289/**', inaRunRoute(34, [5.1, 5.15, 5.2, 5.1, 4.9, 4.7]));
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

test('Navegación: ríos de Uruguay (CARU y DINAGUA) cerca de Paysandú, con la hora de cada lectura, y sin conexión los últimos guardados', async ({ page, context }) => {
  await mockOpenMeteo(page);
  const now = Date.now();
  // Servidor propio simulado: CARU (Paysandú, puerto y automática) y DINAGUA (Paso de los Toros, a ~110 km de Paysandú).
  await context.route('https://valhallarust2.ddns.net/api/rivers/uy', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        fetchedAt: now,
        stale: false,
        sources: { caru: true, dinagua: true },
        stations: [
          { id: 'caru-altura-24', name: 'Paysandú', source: 'CARU', provider: 'Prefectura', lat: -32.32, lon: -58.08, level: 4.08, at: new Date(now - 5 * 3_600_000).toISOString(), change: 0.1, trend: 'rising' },
          { id: 'caru-estacion-19', name: 'Paysandú (automática)', source: 'CARU', provider: 'CARU y CTM', lat: -32.32, lon: -58.08, level: 4.11, at: new Date(now - 1 * 3_600_000).toISOString(), change: 0, trend: 'steady' },
          { id: 'dinagua-UTE-1915', name: 'Paso de los Toros', source: 'DINAGUA', provider: 'UTE', lat: -32.0, lon: -57.0, level: 7.39, at: new Date(now - 8 * 3_600_000).toISOString(), change: -0.13, trend: 'falling' },
          { id: 'dinagua-DINAGUA-1', name: 'Estación lejana', source: 'DINAGUA', provider: 'DINAGUA', lat: -30.4, lon: -55.4, level: 1, at: new Date(now).toISOString(), change: null, trend: null },
        ],
      },
    }),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -32.32, longitude: -58.08, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  const card = page.getByTestId('uy-rivers-card');
  await expect(card).toContainText('Ríos de Uruguay', { timeout: 20_000 });
  const port = page.getByTestId('uyr-caru-altura-24');
  await expect(port).toContainText('Paysandú');
  await expect(port).toContainText('CARU');
  await expect(port).toContainText('4,08 m');
  await expect(port).toContainText('Prefectura');
  await expect(port).toContainText(/medido hace 5 h/);
  await expect(port).toContainText('+0,10 m desde la lectura anterior');
  await expect(page.getByTestId('uyr-caru-estacion-19')).toContainText('4,11 m');
  await expect(page.getByTestId('uyr-dinagua-UTE-1915')).toContainText('Paso de los Toros');
  await expect(page.getByTestId('uyr-dinagua-UTE-1915')).toContainText('-0,13 m');
  // Fuera de los 120 km no se muestra.
  await expect(page.getByTestId('uyr-dinagua-DINAGUA-1')).toHaveCount(0);
  await expect(page.getByTestId('uyr-source')).toContainText('sin licencia declarada');
  // Sin conexión: los últimos guardados.
  await context.setOffline(true);
  await page.goto('/#/weather');
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('uyr-caru-altura-24')).toContainText('4,08 m', { timeout: 20_000 });
  await expect(page.getByTestId('uyr-offline')).toContainText('últimos niveles guardados');
});

test('Navegación: la tarjeta de ríos de Uruguay no aparece lejos de Uruguay (Puerto Madryn)', async ({ page, context }) => {
  await mockOpenMeteo(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -42.77, longitude: -65.04, accuracy: 20 });
  await start(page);
  await page.goto('/#/weather/navigation');
  await expect(page.getByTestId('tide-station')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('uy-rivers-card')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

// La copia propia de Open-Meteo del servidor no entra en las pruebas: 404 = «no está ahí», y la app pasa al servicio simulado de abajo.
test.beforeEach(async ({ context }) => {
  await context.route(/\/api\/om\//, (route) => route.fulfill({ status: 404, json: { error: 'sin copia propia' } }));
});

const PASSWORD = 'prueba-segura-123';

test.use({ geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'] });

/** Respuesta de Open-Meteo armada a partir de la hora actual (como hace el servicio real). */
function fakeForecast(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
  // 8 días por hora, desde la medianoche de hoy (como el servicio real).
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const hours = Array.from({ length: 24 * 8 }, (_, i) => new Date(midnight.getTime() + i * 3_600_000));
  const days = Array.from({ length: 16 }, (_, i) => local(new Date(now.getTime() + i * 86_400_000)).slice(0, 10));
  const rep = <T,>(first: T[], rest: T) => [...first, ...Array.from({ length: 16 - first.length }, () => rest)];
  // Intervalos de 15 min desde el actual: la lluvia arranca en el cuarto (dentro de 45 min).
  const slot0 = new Date(now);
  slot0.setMinutes(Math.floor(now.getMinutes() / 15) * 15, 0, 0);
  const quarter = (d: Date) => `${local(d).slice(0, 11)}${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const slots = Array.from({ length: 8 }, (_, i) => new Date(slot0.getTime() + i * 15 * 60_000));
  return {
    latitude: -34.6,
    longitude: -58.38,
    timezone: 'America/Argentina/Buenos_Aires',
    minutely_15: { time: slots.map(quarter), precipitation: [0, 0, 0, 1.2, 2, 0.5, 0, 0] },
    current: {
      time: quarter(slot0), temperature_2m: 21.4, relative_humidity_2m: 64, apparent_temperature: 20.1, precipitation: 0,
      weather_code: 2, wind_speed_10m: 18, wind_direction_10m: 135, wind_gusts_10m: 35, pressure_msl: 1013.2,
    },
    hourly: {
      time: hours.map(local),
      temperature_2m: hours.map((_, i) => 18 + (i % 10)),
      precipitation_probability: hours.map((_, i) => (i % 6) * 10),
      weather_code: hours.map((_, i) => (i % 12 === 0 ? 61 : 1)),
      wind_speed_10m: hours.map(() => 15),
      wind_direction_10m: hours.map(() => 180), // del sur: la flecha apunta al norte
      wind_gusts_10m: hours.map(() => 32),
      apparent_temperature: hours.map((_, i) => 16 + (i % 10)),
      relative_humidity_2m: hours.map(() => 64),
      precipitation: hours.map((_, i) => (i % 12 === 0 ? 1.2 : 0)),
      snowfall: hours.map((_, i) => (i === 3 ? 0.8 : 0)),
      cloud_cover: hours.map(() => 75),
      visibility: hours.map((_, i) => (i === 3 ? 600 : 24_000)),
      cape: hours.map((_, i) => (i === 3 ? 1500 : 50)),
      freezing_level_height: hours.map(() => 2100),
    },
    daily: {
      time: days,
      weather_code: rep([2, 95, 3, 61, 0, 1, 2], 1),
      temperature_2m_max: rep([24, 27, 22, 19, 25, 26, 28], 24),
      temperature_2m_min: rep([14, 17, 13, 11, 12, 13, 15], 13),
      precipitation_sum: rep([0, 42, 0, 6, 0, 0, 0], 0),
      // Días lejanos con valores extremos: no deben generar avisos (es solo tendencia).
      precipitation_probability_max: rep([5, 90, 20, 70, 0, 0, 10], 0),
      wind_speed_10m_max: rep([20, 40, 18, 25, 12, 15, 22], 60),
      wind_gusts_10m_max: rep([35, 88, 30, 45, 25, 30, 40], 120),
      wind_direction_10m_dominant: rep([90, 200, 270, 180, 0, 45, 135], 220),
      uv_index_max: rep([7, 4, 6, 3, 9, 8, 7], 5),
    },
  };
}

test('clima: descarga, avisos, y sin conexión muestra lo guardado', async ({ page, context }, testInfo) => {
  let requests = 0;
  await context.route('https://api.open-meteo.com/v1/forecast**', async (route) => {
    requests++;
    await route.fulfill({ json: fakeForecast() });
  });

  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/weather');
  await page.getByRole('link', { name: /^Clima Pronóstico/ }).click();
  await expect(page.getByTestId('weather-temp')).toHaveText('21°');
  await expect(page.getByText('Parcialmente nublado · sensación 20°')).toBeVisible();
  // Ahora: solo se colorea lo que merece atención; lo normal queda con el color común.
  await expect(page.getByTestId('now-temp')).toHaveAttribute('title', 'Agradable');
  await expect(page.getByTestId('now-temp')).not.toHaveAttribute('data-scale');
  // Flecha, velocidad y dirección completa del viento van juntas, del mismo color.
  const windSpeed = page.getByTestId('now-wind-speed');
  await expect(windSpeed).toHaveText(/18 km\/h SE \(Sudeste\)/);
  await expect(windSpeed).toHaveAttribute('title', 'Viento leve');
  await expect(windSpeed).not.toHaveAttribute('data-scale');
  const arrow = windSpeed.getByRole('img', { name: 'Viento del SE' });
  expect(await arrow.evaluate((el) => getComputedStyle(el).color)).toBe(await windSpeed.evaluate((el) => getComputedStyle(el).color));
  await expect(page.getByTestId('now-gusts')).toHaveAttribute('title', 'Viento moderado');
  await expect(page.getByTestId('now-gusts')).toHaveAttribute('data-scale', '4');
  await expect(page.getByTestId('now-humidity')).toHaveAttribute('title', 'Aire húmedo');
  await expect(page.getByTestId('now-humidity')).toHaveAttribute('data-scale', '1');
  await expect(page.getByTestId('now-pressure')).toHaveText('1013 hPa · normal');
  await expect(page.getByTestId('now-pressure')).not.toHaveAttribute('data-scale');
  await expect(page.getByText('Tormenta eléctrica')).toBeVisible();
  await expect(page.getByText('Ráfagas fuertes de hasta 88 km/h')).toBeVisible();
  await expect(page.getByText('Lluvia intensa: 42 mm')).toBeVisible();
  await expect(page.getByText('Radiación UV muy alta (índice 9)')).toBeVisible();
  await expect(page.getByTestId('weather-updated')).toHaveText(/Actualizado (ahora|hace \d+ minutos?|este minuto)/);
  // Se cuenta desde la hora real (no la de descarga): entre 30 y 45 minutos según cuándo corra la prueba.
  await expect(page.getByTestId('next-rain')).toHaveText(/^Empieza a llover en unos (30|35|40|45) min \(3,7 mm\)$/);
  // Cada hora: gotita con la probabilidad y viento con dirección, velocidad y ráfagas.
  const hour = page.getByTestId('hour').nth(1);
  await expect(hour.getByLabel(/^Probabilidad de lluvia \d+ %$/)).toBeVisible();
  await expect(hour.getByLabel('Viento 15 km/h, ráfagas 32 km/h')).toBeVisible();
  await expect(hour.getByRole('img', { name: 'Viento del S' })).toBeVisible();
  await expect(hour.getByText('r. 32')).toBeVisible();
  // 16 días: 7 confiables y 9 como tendencia, sin avisos por los días lejanos.
  await expect(page.getByTestId('day')).toHaveCount(7);
  await expect(page.getByTestId('trend-day')).toHaveCount(9);
  // Los días de tendencia no tienen detalle (no se pueden tocar).
  await expect(page.getByRole('button').filter({ has: page.getByTestId('trend-day') })).toHaveCount(0);
  await expect(page.locator('button[data-testid="trend-day"]')).toHaveCount(0);

  // Día 5: resumen por madrugada, mañana, tarde y noche.
  // La página no se ensancha (en el celular, el texto oculto de los valores coloreados no se escapa de la tira por hora).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId('day').nth(4).click();
  const periods = page.getByRole('dialog');
  await expect(periods.getByText('A esta distancia el pronóstico por hora no es confiable')).toBeVisible();
  await expect(periods.getByTestId('period')).toHaveCount(4);
  await expect(periods.getByTestId('period').nth(0)).toContainText('Madrugada');
  await expect(periods.getByTestId('period').nth(3)).toContainText('Noche');
  await expect(periods.getByTestId('hour-detail')).toHaveCount(0);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-16c-weather-periods.png` });
  await periods.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByText(/Tendencia: días 8 a 16/)).toBeVisible();
  await expect(page.getByText(/Ráfagas fuertes de hasta 120/)).toHaveCount(0);
  await expect(hour.getByText(/^\d+° ST( \(.+\))?$/)).toBeVisible();
  // Filas alineadas: el viento queda a la misma altura en una hora con lluvia y en otra sin.
  const windTops = await page.getByTestId('hour').evaluateAll((items) =>
    items.slice(0, 12).map((li) => Math.round(li.querySelector('.hour-wind')!.getBoundingClientRect().top)),
  );
  expect(new Set(windTops).size).toBe(1);

  // Detalle de un día, hora por hora, con cada dato identificado.
  await page.getByTestId('day').first().click();
  const detail = page.getByRole('dialog');
  await expect(detail.getByTestId('hour-detail').first()).toBeVisible();
  await expect(detail.getByText('64% HR').first()).toBeVisible();
  await expect(detail.getByLabel('Nubosidad 75 %').first()).toBeVisible();
  await expect(detail.getByLabel('Isoterma de 0° a 2100 m').first()).toBeVisible();
  // La hora con niebla, nieve y riesgo de tormenta (la 4.ª del pronóstico, si cae hoy).
  const special = detail.getByTestId('hour-detail').filter({ hasText: 'niebla' });
  if ((await special.count()) > 0) {
    await expect(special.getByLabel('Visibilidad 600 m')).toBeVisible();
    await expect(special.getByLabel('Riesgo de tormenta Alto')).toBeVisible();
    await expect(special.getByLabel('Nieve 0,8 cm')).toBeVisible();
  }
  await detail.getByText('Qué significa cada dato').click();
  await expect(detail.getByText(/ST = sensación térmica/)).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-16b-weather-day.png` });
  await detail.getByRole('button', { name: 'Cerrar' }).click();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-16-weather.png`, fullPage: true });
  expect(requests).toBe(1);

  // Al volver con un pronóstico reciente no se descarga de nuevo.
  await page.goto('/#/weather');
  await page.getByRole('link', { name: /^Clima Pronóstico/ }).click();
  await expect(page.getByTestId('weather-temp')).toHaveText('21°');
  expect(requests).toBe(1);

  // Sin conexión: queda lo guardado y avisa al intentar actualizar.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByText('Sin conexión: el pronóstico se descarga cuando haya internet. Se muestra el último pronóstico guardado.')).toBeVisible();
  await expect(page.getByTestId('weather-temp')).toHaveText('21°');
  await context.setOffline(false);
});

test('las horas siguen al reloj aunque el pronóstico guardado sea de antes', async ({ page, context }) => {
  // Se descarga a la 01:10; después se pierde la conexión y el reloj sigue hasta las 02:25.
  const downloadedAt = new Date('2026-10-31T04:10:00Z'); // 01:10 en Buenos Aires
  await page.clock.install({ time: downloadedAt });
  // El pronóstico se arma a la hora del reloj de la prueba, no a la real (si caen el mismo día, se mezclan).
  await context.route('https://api.open-meteo.com/v1/forecast**', (route) => route.fulfill({ json: fakeForecast(downloadedAt) }));
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/weather/forecast');
  await expect(page.getByTestId('hour').first()).toContainText('01:00');

  await context.setOffline(true);
  await page.clock.runFor('01:15:00');
  // En ese tiempo la app se bloquea sola por inactividad: se desbloquea y se vuelve al clima.
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/weather/forecast');
  await expect(page.getByTestId('hour').first()).toContainText('02:00');
  // Las barras de lluvia arrancan en el cuarto de hora actual (02:15), no a la hora de descarga.
  // (El minuto exacto depende de cuánto tarde la prueba: lo que importa es que no quede en la 1.)
  await expect(page.locator('.rain-bars li').first()).toContainText(/0[23]:\d\d/);
  await context.setOffline(false);
});

test('aviso de lluvia por waypoint, activado desde su ficha', async ({ page, context }) => {
  await context.route('https://api.open-meteo.com/v1/forecast**', (route) => route.fulfill({ json: fakeForecast() }));
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio');
  await page.getByLabel('Coordenadas').fill('-41.13, -71.31');
  await page.getByTestId('wp-more').getByText('Más opciones').click();
  await page.getByLabel('Avisarme de lluvia, rayos y peligros naturales en este punto').check();
  await page.getByRole('button', { name: 'Guardar' }).click();

  // El vigilante revisa enseguida y muestra el aviso arriba, en cualquier pantalla.
  const notice = page.locator('.rain-notice');
  await expect(notice).toHaveText(/Lluvia en unos 45 min · Refugio/);
  await notice.getByRole('link').click();
  await page.getByTestId('weather-alerts').getByText('Configurar avisos').click();
  await expect(page.getByRole('heading', { name: 'Avisos de lluvia' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Refugio.*Lluvia en unos 45 min/ })).toBeVisible();
  await notice.getByRole('button', { name: 'Cerrar' }).click();
  await expect(notice).toHaveCount(0);

  // Desactivado en la ficha, deja de figurar.
  await page.goto('/#/orientation/waypoints');
  await page.getByRole('link', { name: /^Refugio/ }).first().click();
  await page.getByLabel('Avisarme de lluvia, rayos y peligros naturales en este punto').uncheck();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.goto('/#/weather/forecast');
  await page.getByTestId('weather-alerts').getByText('Configurar avisos').click();
  await expect(page.getByText('Para recibir avisos de un lugar guardado')).toBeVisible();

  // Con la app cerrada avisa el servidor: sin notificaciones registradas, se indica cómo activarlo.
  await expect(page.getByTestId('rain-background-hint')).toHaveText(/configurá el servidor y activá las notificaciones/);
});

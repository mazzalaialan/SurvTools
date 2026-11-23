import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('entrenamiento: cronómetro, temporizador, herramientas y cuenta regresiva', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Cronómetro con vueltas.
  await page.goto('/#/training');
  await page.getByRole('link', { name: /Cronómetro/ }).click();
  await expect(page.getByTestId('sw-time')).toHaveText('0:00.00');
  await page.getByTestId('sw-start').click();
  await page.waitForTimeout(700);
  await page.getByTestId('sw-lap').click();
  await page.waitForTimeout(400);
  await page.getByTestId('sw-lap').click();
  await expect(page.getByTestId('sw-laps').getByRole('row')).toHaveCount(3); // encabezado + 2 vueltas
  await page.getByTestId('sw-pause').click();
  await expect(page.getByTestId('sw-time')).not.toHaveText('0:00.00');
  await page.getByTestId('sw-reset').click();
  await expect(page.getByTestId('sw-time')).toHaveText('0:00.00');

  // Temporizador: con las flechas se ajustan minutos y segundos (sin quedarse con los armados) y corre.
  await page.getByRole('button', { name: 'Temporizador' }).click();
  await expect(page.getByTestId('timer-min')).toHaveText('05');
  await page.getByTestId('timer-min-up').click();
  await page.getByTestId('timer-sec-up').click();
  await page.getByTestId('timer-sec-up').click();
  await expect(page.getByTestId('timer-min')).toHaveText('06');
  await expect(page.getByTestId('timer-sec')).toHaveText('02');
  await page.getByTestId('timer-sec-down').click();
  await page.getByTestId('timer-min-down').click();
  await expect(page.getByTestId('timer-min')).toHaveText('05');
  await expect(page.getByTestId('timer-sec')).toHaveText('01');
  await page.getByTestId('timer-preset-60').click();
  await expect(page.getByTestId('timer-time')).toHaveText('1:00');
  await page.getByTestId('timer-start').click();
  await expect(page.getByTestId('timer-time')).toHaveText(/^0:5\d$/);
  await page.getByTestId('timer-pause').click();

  // Herramientas: ritmo (10 km en 55:00 = 5:30 /km), zonas de pulso y metrónomo.
  await page.goto('/#/training');
  await page.locator('main').getByRole('link', { name: /Herramientas/ }).click();
  await expect(page.getByTestId('pace-result')).toContainText('5:30 /km');
  await expect(page.getByTestId('pace-predict')).toContainText('21,1 km');
  await page.getByLabel('Edad').fill('40');
  await expect(page.getByTestId('hr-zones').getByRole('row')).toHaveCount(6); // encabezado + 5 zonas
  await expect(page.getByTestId('hr-zones')).toContainText('90–108');
  await page.getByLabel('O, si querés cumplir un ritmo (min/km)').fill('6:00');
  await expect(page.getByTestId('pace-target-result')).toContainText('1:00:00');

  // Metrónomo y respiración: con 170 pasos por minuto y 3:2 son 34 respiraciones por minuto.
  await page.goto('/#/training');
  await page.getByRole('link', { name: /Metrónomo/ }).click();
  // Por defecto camina (110 pasos por minuto, 3:3); al elegir Correr arranca en 170.
  await expect(page.getByTestId('metronome-bpm')).toHaveText('110');
  await expect(page.getByTestId('cadence-range')).toContainText('de 90 a 130');
  await page.getByRole('button', { name: 'Correr' }).click();
  await expect(page.getByTestId('metronome-bpm')).toHaveText('170');
  await expect(page.getByTestId('breath-result')).toContainText('34 respiraciones por minuto');
  await page.getByRole('button', { name: 'Fuerte' }).click();
  await expect(page.getByTestId('breath-result')).toContainText('56,7 respiraciones por minuto');
  await page.getByTestId('metronome-toggle').click();
  await expect(page.getByTestId('breath-phase')).toHaveText(/Inhalá|Exhalá/);
  await page.getByTestId('metronome-toggle').click();

  // Cuenta regresiva antes de empezar una sesión con GPS.
  await page.goto('/#/training/workouts');
  await page.getByText('Objetivos de la semana').click();
  await page.getByTestId('countdown-setting').selectOption('3');
  await page.getByRole('button', { name: 'A pie' }).click();
  await page.getByRole('button', { name: 'Empezar a grabar' }).click();
  await expect(page.getByTestId('countdown')).toBeVisible();
  await expect(page.getByTestId('countdown-number')).toHaveText(/^[0-3]$/);
  await page.getByTestId('countdown-cancel').click();
  await expect(page.getByTestId('countdown')).toHaveCount(0);
  await page.getByRole('button', { name: 'Empezar a grabar' }).click();
  await expect(page).toHaveURL(/#\/training\/live$/, { timeout: 10_000 });
});

// Un FIT mínimo (la estructura que escribe un reloj): 5 registros con posición y pulso, una vuelta y el resumen de la sesión.
function tinyFit(): Buffer {
  const le = (n: number, size: number) => Array.from({ length: size }, (_, i) => Math.floor((n < 0 ? n + 2 ** (8 * size) : n) / 2 ** (8 * i)) & 0xff);
  const FIT_EPOCH = 631_065_600;
  const t0 = 1_800_000_000 - FIT_EPOCH;
  const semi = (deg: number) => Math.round(deg / (180 / 2 ** 31));
  const def = (local: number, num: number, fields: [number, number, number][]) => [0x40 | local, 0, 0, ...le(num, 2), fields.length, ...fields.flatMap(([id, size, type]) => [id, size, type])];
  const REC: [number, number, number][] = [[253, 4, 0x86], [0, 4, 0x85], [1, 4, 0x85], [2, 2, 0x84], [3, 1, 0x02]];
  const SES: [number, number, number][] = [[253, 4, 0x86], [2, 4, 0x86], [5, 1, 0x00], [6, 1, 0x00], [7, 4, 0x86], [8, 4, 0x86], [9, 4, 0x86], [11, 2, 0x84], [16, 1, 0x02], [17, 1, 0x02]];
  const data = [
    ...def(0, 20, REC),
    ...[0, 1, 2, 3, 4].flatMap((i) => [0, ...le(t0 + i * 10, 4), ...le(semi(-41 + i * 0.0005), 4), ...le(semi(-71), 4), ...le((800 + 500) * 5, 2), 140 + i * 5]),
    ...def(1, 18, SES),
    1, ...le(t0 + 40, 4), ...le(t0, 4), 1, 0, ...le(40_000, 4), ...le(38_000, 4), ...le(22_100, 4), ...le(310, 2), 150, 160,
  ];
  return Buffer.from([14, 0x20, 0x64, 0x08, ...le(data.length, 4), 0x2e, 0x46, 0x49, 0x54, 0, 0, ...data, 0, 0]);
}

test('entrenamiento: importar un archivo FIT de un reloj', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/training/workouts');
  await page.getByTestId('import-activity-file').setInputFiles({ name: 'salida-reloj.fit', mimeType: 'application/octet-stream', buffer: tinyFit() });
  await expect(page).toHaveURL(/#\/training\/workouts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'salida-reloj' })).toBeVisible();
  // Del reloj: pulso medio y máximo, y las calorías que él calculó.
  await expect(page.getByText('150 lpm')).toBeVisible();
  await expect(page.getByText('160 lpm')).toBeVisible();
  await expect(page.getByTestId('w-kcal')).toHaveText('310 kcal');
  // Un archivo que no es FIT ni GPX da un mensaje claro.
  await page.goto('/#/training/workouts');
  await page.getByTestId('import-activity-file').setInputFiles({ name: 'malo.fit', mimeType: 'application/octet-stream', buffer: Buffer.from(new Uint8Array(64)) });
  await expect(page.getByRole('alert')).toContainText('no es');
});

import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const DAY = 86_400_000;

/** Pasa por Ajustes (espera a que dibuje) y vuelve al Inicio: así el reloj simulado ya está aplicado cuando el Inicio calcula el aviso. */
async function backHome(page: import('@playwright/test').Page) {
  await page.goto('/#/settings');
  await expect(page.getByTestId('settings-last-backup')).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

test('recordatorio de backup: aparece a los 3 días de uso sin backup, se pospone una semana y vuelve', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // El primer día no molesta.
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

  // A los 4 días de uso sin ningún backup: aparece en el Inicio y Ajustes lo marca como vencido.
  const start = Date.now();
  await page.clock.setFixedTime(start + 4 * DAY);
  await page.goto('/#/settings');
  await expect(page.getByTestId('settings-last-backup')).toHaveClass(/warning-box/);
  await page.goto('/#/');
  const card = page.getByTestId('backup-reminder');
  await expect(card).toContainText('Todavía no hiciste ningún backup');
  await expect(card.getByTestId('backup-reminder-do')).toHaveAttribute('href', /settings\/backup/);

  // «Recordármelo en una semana» lo oculta.
  await card.getByTestId('backup-reminder-later').click();
  await expect(card).toHaveCount(0);
  await backHome(page);
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);

  // Pasada la semana vuelve.
  await page.clock.setFixedTime(start + 12 * DAY);
  await backHome(page);
  await expect(page.getByTestId('backup-reminder')).toBeVisible();
});

test('recordatorio de backup: el botón lleva a Backup, y con un backup hecho no aparece hasta pasados 14 días', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  const start = Date.now();
  await page.clock.setFixedTime(start + 5 * DAY);
  await backHome(page);
  await page.getByTestId('backup-reminder-do').click();
  await expect(page).toHaveURL(/settings\/backup/);

  // Hace un backup (con contraseña la bóveda, el backup se cifra con la misma).
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup' }).click();
  await download;

  // Con el backup hecho hoy, el aviso desaparece, y vuelve recién a los 14 días.
  await page.goto('/#/');
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  await page.clock.setFixedTime(start + 5 * DAY + 13 * DAY);
  await backHome(page);
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  await page.clock.setFixedTime(start + 5 * DAY + 15 * DAY);
  await backHome(page);
  await expect(page.getByTestId('backup-reminder')).toContainText('Hace 15 días');
});

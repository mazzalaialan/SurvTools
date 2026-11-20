import { expect, test } from '@playwright/test';
import { openSection } from './settingsSections';

const PASSWORD = 'prueba-segura-123';

test('sin contraseña: entra sola, no se bloquea, el backup pide su contraseña y después se puede poner una', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar sin contraseña' }).click();
  await expect(page.getByTestId('setup-no-password')).toContainText('cualquiera que tenga este dispositivo desbloqueado');
  await page.getByRole('button', { name: 'Entendido, usar sin contraseña' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  // Sin botón de bloqueo.
  await expect(page.locator('.topbar-lock')).toHaveCount(0);

  // Al volver a abrir la app, entra sola.
  await page.reload();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Backup: hay que elegir una contraseña para el archivo.
  await page.goto('/#/settings/backup');
  await expect(page.getByTestId('backup-password')).toBeVisible();
  const exportBtn = page.getByRole('button', { name: 'Exportar backup' });
  await expect(exportBtn).toBeDisabled();
  await page.getByTestId('backup-password').getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByTestId('backup-password').getByLabel('Repetir contraseña').fill(PASSWORD);
  await expect(exportBtn).toBeEnabled();

  // Ajustes: avisa que no hay contraseña y permite poner una (con clave de recuperación nueva).
  await page.goto('/#/settings');
  await openSection(page, 'security');
  const security = page.getByTestId('security');
  await expect(security.getByTestId('no-password-status')).toBeVisible();
  // Al entrar a Ajustes el cursor NO salta al campo de la contraseña (abriría el teclado en el celular).
  await expect(page.locator('#new-password')).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
  await security.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await security.getByLabel('Repetir contraseña').fill(PASSWORD);
  await security.getByRole('button', { name: 'Poner contraseña' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  // Ahora sí se bloquea y pide la contraseña.
  await page.locator('.topbar-lock').click();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Y se puede volver a quitar (con la contraseña actual).
  await page.goto('/#/settings');
  await openSection(page, 'security');
  const remove = page.getByTestId('remove-password');
  await remove.getByLabel('Contraseña actual').fill('mal-mal-mal');
  await remove.getByRole('button', { name: 'Quitar la contraseña' }).click();
  await page.getByRole('button', { name: 'Sí, continuar' }).click();
  await expect(remove.getByRole('alert')).toBeVisible();
  await remove.getByLabel('Contraseña actual').fill(PASSWORD);
  await remove.getByRole('button', { name: 'Quitar la contraseña' }).click();
  await page.getByRole('button', { name: 'Sí, continuar' }).click();
  await expect(page.getByTestId('no-password-status')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
});

test('datos de emergencia en la pantalla de bloqueo: solo si se activan, y al día con la ficha', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/first-aid/medical');
  await page.getByRole('link', { name: 'Nueva ficha' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Grupo sanguíneo').selectOption('0-');
  await page.getByLabel('Alergias').fill('Penicilina');
  await page.getByLabel('Parentesco').fill('Yo');
  await page.getByRole('button', { name: 'Agregar contacto' }).click();
  await page.getByLabel('Nombre y teléfono del contacto 1').fill('Juan (hermano) 11 5555-1234');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);

  // Sin activar: la pantalla de bloqueo no muestra nada.
  await page.locator('.topbar-lock').click();
  await expect(page.getByRole('button', { name: 'Desbloquear' })).toBeVisible();
  await expect(page.getByTestId('lock-emergency-show')).toHaveCount(0);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();

  await page.goto('/#/settings');
  await openSection(page, 'security');
  await page.getByTestId('emergency-on-lock').check();
  // Se guarda la copia (con un pequeño retraso) y se bloquea.
  await page.waitForTimeout(1200);
  await page.locator('.topbar-lock').click();
  await page.getByTestId('lock-emergency-show').click();
  const card = page.getByTestId('emergency-card');
  await expect(card.getByRole('link', { name: '911' })).toHaveAttribute('href', 'tel:911');
  await expect(card).toContainText('Ana');
  await expect(card).toContainText('0-');
  await expect(card).toContainText('Penicilina');
  await expect(card.getByRole('link', { name: '11 5555-1234' })).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${test.info().project.name}-lock-emergency.png`, fullPage: true });

  // Al desactivarla, se borra.
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/settings');
  await openSection(page, 'security');
  await page.getByTestId('emergency-on-lock').uncheck();
  await page.waitForTimeout(300);
  await page.locator('.topbar-lock').click();
  await expect(page.getByTestId('lock-emergency-show')).toHaveCount(0);
});

test('olvidé la contraseña y la clave: guardo la bóveda aparte, empiezo de cero y la recupero con su contraseña', async ({ page }) => {
  const OLD = 'prueba-segura-123';
  const NEW = 'segunda-clave-789';
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(OLD);
  await page.getByLabel('Repetir contraseña').fill(OLD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  // Un dato propio en la bóveda vieja.
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio Viejo');
  await page.getByLabel('Coordenadas').fill('-41.1, -71.3');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Viejo')).toBeVisible();

  // Se bloquea y no hay contraseña ni clave: la salida está en la pantalla de bloqueo.
  await page.locator('.topbar-lock').click();
  await page.getByTestId('forgot-link').click();
  await expect(page.getByTestId('forgot-secret')).toBeVisible();
  // Borrar pide escribir la palabra; guardar aparte no.
  await expect(page.getByTestId('forgot-erase')).toBeDisabled();
  await page.getByTestId('forgot-archive').click();
  // La app empieza de cero y ofrece la bóveda guardada.
  await expect(page.getByTestId('archived-vaults')).toContainText('Bóvedas anteriores guardadas', { timeout: 15_000 });
  await page.getByLabel('Contraseña', { exact: true }).fill(NEW);
  await page.getByLabel('Repetir contraseña').fill(NEW);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  // La bóveda nueva no ve nada de la vieja.
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Todavía no guardaste puntos')).toBeVisible();

  // Desde Ajustes se recupera la vieja: con una contraseña incorrecta no pasa nada; con la correcta vuelve su dato.
  await page.goto('/#/settings');
  await openSection(page, 'security');
  const archived = page.getByTestId('archived-vaults');
  await expect(archived).toBeVisible();
  await archived.getByRole('button', { name: 'Recuperar', exact: true }).click();
  await archived.getByLabel('Contraseña de esa bóveda').fill('contraseña-equivocada');
  await page.getByTestId('archived-submit').click();
  await expect(page.getByTestId('archived-error')).toContainText('Contraseña incorrecta');
  await archived.getByLabel('Contraseña de esa bóveda').fill(OLD);
  await page.getByTestId('archived-submit').click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible({ timeout: 15_000 });
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Viejo')).toBeVisible();
  // La bóveda que estaba activa quedó guardada aparte (se pidió guardarla): ahora es la que figura en la lista.
  await page.goto('/#/settings');
  await openSection(page, 'security');
  await expect(page.getByTestId('archived-vaults')).toContainText('Bóveda guardada el');

  // Y borrar todo también es una salida, con la palabra de confirmación.
  await page.locator('.topbar-lock').click();
  await page.getByTestId('forgot-link').click();
  await page.getByTestId('forgot-word').fill('borrar');
  await page.getByTestId('forgot-erase').click();
  await expect(page.getByRole('button', { name: 'Crear bóveda' })).toBeVisible({ timeout: 15_000 });
});

test('probar biometría: con un autenticador virtual con PRF el dispositivo sirve, y sin PRF no', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'desktop', 'el autenticador virtual solo existe en Chromium de escritorio');
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar sin contraseña' }).click();
  await page.getByRole('button', { name: 'Entendido, usar sin contraseña' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/settings');
  await openSection(page, 'security');
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  // Con PRF: pasa todos los pasos.
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  await page.getByTestId('biometric-run').click();
  await expect(page.getByTestId('biometric-verdict')).toHaveAttribute('data-usable', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('biometric-step-wrap')).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId('biometric-step-prfEnabled')).toHaveAttribute('data-status', 'ok');
  // Sin PRF: se detiene en ese paso y dice que no sirve.
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: false },
  });
  await page.getByTestId('biometric-run').click();
  await expect(page.getByTestId('biometric-verdict')).toHaveAttribute('data-usable', 'false', { timeout: 30_000 });
  await expect(page.getByTestId('biometric-step-prfEnabled')).toHaveAttribute('data-status', 'fail');
  await expect(page.getByTestId('biometric-step-auth')).toHaveAttribute('data-status', 'skip');
});

test('desbloquear con biometría: se activa en Ajustes, desbloquea sin escribir la contraseña, y desactivar vuelve a la contraseña', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'desktop', 'el autenticador virtual solo existe en Chromium de escritorio');
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  // Un dato propio: tiene que seguir ahí después de desbloquear con la biometría.
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Refugio Huella');
  await page.getByLabel('Coordenadas').fill('-41.1, -71.3');
  await page.getByRole('button', { name: 'Guardar' }).click();
  // Esperar a que termine de guardar: si no, la navegación a la ficha pisa el paso a Ajustes.
  await expect(page.getByRole('heading', { name: 'Refugio Huella' })).toBeVisible();

  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true },
  });
  // Activar.
  await page.goto('/#/settings');
  await openSection(page, 'security');
  const box = page.getByTestId('biometric-unlock');
  await box.getByTestId('biometric-unlock-on-button').click();
  await expect(box.getByTestId('biometric-unlock-message')).toContainText('Listo', { timeout: 20_000 });
  await expect(box.getByTestId('biometric-unlock-on')).toBeVisible();

  // Bloquear: aparece el botón de la biometría y desbloquea sin escribir nada.
  await page.locator('.topbar-lock').click();
  await expect(page.getByTestId('unlock-biometric')).toBeVisible();
  await page.getByTestId('unlock-biometric').click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Huella')).toBeVisible();

  // Cambiar la contraseña confirmando con la huella, sin escribir la actual (por si se olvidó).
  await page.goto('/#/settings');
  await openSection(page, 'security');
  await page.getByTestId('change-password-bio').click();
  await expect(page.getByTestId('change-password-bio-ok')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Contraseña nueva').fill('contraseña-nueva-456');
  await page.getByRole('button', { name: 'Guardar', exact: true }).first().click();
  await expect(page.getByText('Contraseña actualizada.')).toBeVisible();

  // Código de recuperación nuevo, confirmando con la huella: se muestra una vez y hay que anotarlo.
  await page.goto('/#/settings');
  await openSection(page, 'security');
  await page.getByTestId('new-recovery-bio').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.locator('.recovery-key')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // La contraseña nueva vale (y la vieja ya no).
  await page.locator('.topbar-lock').click();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(page.getByText('Contraseña incorrecta', { exact: false })).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill('contraseña-nueva-456');
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Desactivar: el botón de la biometría desaparece del bloqueo.
  await page.goto('/#/settings');
  await openSection(page, 'security');
  await page.getByTestId('biometric-unlock-off').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('biometric-unlock-on-button')).toBeVisible();
  await page.locator('.topbar-lock').click();
  await expect(page.getByTestId('unlock-biometric')).toHaveCount(0);
});

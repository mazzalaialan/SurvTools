import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const SERVER = 'http://127.0.0.1:8099';

test('eliminar mi cuenta: pide la contraseña y borra el dispositivo del servidor', async ({ page, request }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Sin cuenta todavía: no hay nada para borrar.
  await page.goto('/#/settings?conexiones=1');
  await expect(page.getByTestId('account-none')).toBeVisible();

  // El push real no anda en el navegador de pruebas: se registra el dispositivo en el
  // servidor de prueba y se le da a la app esa cuenta, como si hubiera activado las notificaciones.
  const res = await request.post(`${SERVER}/api/devices`, {
    data: {
      subscription: { endpoint: 'https://push.example.com/e2e', keys: { p256dh: 'p', auth: 'a' } },
      timezone: 'America/Argentina/Buenos_Aires',
      notifyHour: 9,
      language: 'es',
    },
  });
  expect(res.status()).toBe(201);
  const { deviceId, token } = (await res.json()) as { deviceId: string; token: string };
  const auth = { authorization: `Bearer ${token}` };
  expect((await request.put(`${SERVER}/api/devices/${deviceId}/stock`, { headers: auth, data: { places: [{ id: 'p1', label: 'Casa', lat: -34.6, lon: -58.4 }] } })).status()).toBe(204);
  await page.evaluate(
    ({ server, deviceId, token }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('vikarg-user');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ key: 'notifications', value: { lastLocalNotifiedDay: null, push: { serverUrl: server, deviceId, token } } });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    { server: SERVER, deviceId, token },
  );
  await page.reload();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/settings?conexiones=1');

  const account = page.getByTestId('account');
  await expect(page.getByTestId('account-device')).toContainText(deviceId);
  await account.getByRole('button', { name: 'Eliminar mi cuenta y mis datos del servidor' }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar mi cuenta' });
  await expect(dialog).toBeVisible();

  // Con una contraseña equivocada no se borra nada.
  await dialog.getByLabel('Contraseña de la app').fill('otra-contraseña');
  await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('La contraseña no es correcta. No se borró nada.');
  expect((await request.put(`${SERVER}/api/devices/${deviceId}/stock`, { headers: auth, data: { places: [] } })).status()).toBe(204);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-80-account-delete.png`, fullPage: true });

  // Con la correcta: el servidor ya no conoce el dispositivo.
  await dialog.getByLabel('Contraseña de la app').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(page.getByTestId('account-done')).toContainText('el servidor borró tu cuenta');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('account-device')).toHaveCount(0);
  expect((await request.put(`${SERVER}/api/devices/${deviceId}/stock`, { headers: auth, data: { places: [] } })).status()).toBe(401);
});

test('desactivar las notificaciones sin conexión deja el borrado de la cuenta pendiente y se completa al reintentar', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  const res = await request.post(`${SERVER}/api/devices`, {
    data: { subscription: { endpoint: 'https://push.example.com/e2e2', keys: { p256dh: 'p', auth: 'a' } }, timezone: 'America/Argentina/Buenos_Aires', notifyHour: 9, language: 'es' },
  });
  const { deviceId, token } = (await res.json()) as { deviceId: string; token: string };
  const auth = { authorization: `Bearer ${token}` };
  // Cuenta activa y notificaciones prendidas, como si las hubiera activado.
  await page.evaluate(
    ({ server, deviceId, token }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('vikarg-user');
        open.onsuccess = () => {
          const tx = open.result.transaction(['meta', 'settings'], 'readwrite');
          tx.objectStore('meta').put({ key: 'notifications', value: { lastLocalNotifiedDay: null, push: { serverUrl: server, deviceId, token }, pendingDeletes: [] } });
          const settings = tx.objectStore('settings');
          const get = settings.get('app');
          get.onsuccess = () => settings.put({ key: 'app', value: { ...(get.result?.value ?? {}), notificationsEnabled: true } });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    { server: SERVER, deviceId, token },
  );
  await page.reload();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto('/#/settings?conexiones=1');
  await expect(page.getByTestId('disable-deletes')).toContainText('se elimina tu cuenta del servidor');

  // Servidor inalcanzable: se apagan igual, pero el borrado queda pendiente (no se olvida la cuenta).
  await page.route(`${SERVER}/api/devices/**`, (route) => (route.request().method() === 'DELETE' ? route.abort() : route.continue()));
  await page.getByRole('button', { name: 'Desactivar' }).click();
  await expect(page.getByTestId('delete-pending')).toContainText('se borra sola cuando vuelva la conexión');
  await expect(page.getByTestId('account-pending')).toBeVisible();
  expect((await request.put(`${SERVER}/api/devices/${deviceId}/stock`, { headers: auth, data: { places: [] } })).status()).toBe(204);

  // Vuelve el servidor: reintentar completa el borrado.
  await page.unroute(`${SERVER}/api/devices/**`);
  await page.getByRole('button', { name: 'Reintentar el borrado ahora' }).click();
  await expect(page.getByTestId('account-done')).toBeVisible();
  await expect(page.getByTestId('account-pending')).toHaveCount(0);
  expect((await request.put(`${SERVER}/api/devices/${deviceId}/stock`, { headers: auth, data: { places: [] } })).status()).toBe(401);
});

test('Ajustes: «Conexiones» no se muestra; se abre con 7 toques en la versión o con el enlace interno', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/settings');
  await expect(page.getByTestId('app-version')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conexiones' })).toHaveCount(0);
  const version = page.getByTestId('app-version');
  for (let i = 0; i < 6; i++) await version.click();
  await expect(page.getByRole('heading', { name: 'Conexiones' })).toHaveCount(0);
  await version.click();
  await expect(page.getByRole('heading', { name: 'Conexiones' })).toBeVisible();
  await expect(page.getByLabel('Servidor VikArg')).toBeVisible();

  // El enlace interno también la abre (y los valores por defecto siguen funcionando sin abrirla).
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/#/settings?conexiones=1');
  await expect(page.getByRole('heading', { name: 'Conexiones' })).toBeVisible();
});

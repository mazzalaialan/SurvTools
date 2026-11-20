import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test.use({ geolocation: { latitude: -41.16, longitude: -71.42 }, permissions: ['geolocation'] });

test('entrenamiento: sesión bajo techo, grabar con GPS y armar una salida', async ({ page, context, request }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // La sección está en la navegación.
  await page.goto('/#/training');
  await expect(page.getByRole('heading', { name: 'Entrenamiento' })).toBeVisible();
  await page.getByRole('link', { name: /Sesiones/ }).click();
  await expect(page.getByRole('heading', { name: 'Sesiones' })).toBeVisible();
  await expect(page.getByTestId('train-no-weight')).toContainText('Sin tu peso no se calculan las calorías.');

  // Bajo techo: cinta, con el tiempo, la distancia y el peso a mano.
  await page.getByRole('button', { name: 'Bajo techo' }).click();
  await page.getByLabel('Actividad', { exact: true }).selectOption({ label: 'Cinta' });
  await page.getByRole('link', { name: 'Cargar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Cargar una sesión' })).toBeVisible();
  await page.getByLabel('Duración').fill('30:00');
  await page.getByLabel('Distancia (km)').fill('4');
  await page.getByLabel('Peso (kg)').fill('70');
  await expect(page.getByTestId('m-preview')).toContainText('7:30 /km');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Cinta' })).toBeVisible();
  await expect(page.getByTestId('w-time')).toHaveText('30:00');
  await expect(page.getByTestId('w-distance')).toHaveText('4 km');
  await expect(page.getByTestId('w-effort')).toHaveText('7:30 /km');
  await expect(page.getByTestId('w-kcal')).toHaveText(/^3\d\d kcal$/);
  await expect(page.getByTestId('w-map')).toHaveCount(0);

  // Con GPS: trekking con mochila; termina con nombre y abre la sesión.
  await page.goto('/#/training/workouts');
  await page.getByRole('button', { name: 'A pie' }).click();
  await page.getByLabel('Actividad', { exact: true }).selectOption({ label: 'Trekking' });
  await page.getByLabel('Mochila o carga (kg, opcional)').fill('10');
  await page.getByRole('button', { name: 'Empezar a grabar' }).click();
  const bar = page.getByTestId('rec-bar');
  // Al empezar abre la pantalla en vivo, con el tiempo y los datos en grande.
  await expect(page).toHaveURL(/#\/training\/live$/);
  await expect(page.getByTestId('live')).toContainText('Grabando');
  await page.getByTestId('rec-warn').getByRole('button', { name: 'Entendido' }).click();
  await page.waitForTimeout(500);
  const walk = async (lat: number) => {
    await context.setGeolocation({ latitude: lat, longitude: -71.42, accuracy: 5 });
    await page.waitForTimeout(300);
  };
  await walk(-41.161);
  await walk(-41.162);
  await walk(-41.163);
  await expect(page.getByTestId('live-distance')).toHaveText(/^33\d$/);
  await expect(page.getByTestId('live-clock')).toHaveText(/^\d+:\d\d$/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-40-live.png`, fullPage: true });
  // En la pantalla en vivo la barra de grabación está siempre completa (sin menú plegado): atajos y controles, menos «en vivo», que ya es esta pantalla.
  const recBar = page.getByTestId('rec-bar');
  await expect(recBar).toBeVisible();
  await expect(recBar.getByTestId('rec-map')).toBeVisible();
  await expect(recBar.getByTestId('rec-summary')).toBeVisible();
  await expect(page.getByTestId('rec-bar-live')).toHaveCount(0);
  await expect(page.getByTestId('rec-menu-open')).toHaveCount(0);
  await expect(page.getByTestId('rec-live')).toHaveCount(0); // ya está en «en vivo»
  // Del atajo al mapa y de vuelta.
  await page.getByTestId('rec-bar').getByTestId('rec-map').click();
  await expect(page).toHaveURL(/#\/orientation\/maps$/);
  await page.getByTestId('rec-bar').getByTestId('rec-live').click();
  await expect(page).toHaveURL(/#\/training\/live$/);
  // Pausar y seguir desde los botones grandes.
  await page.getByTestId('live-pause').click();
  await expect(page.getByTestId('live')).toContainText('Grabación en pausa');
  await page.getByTestId('live-resume').click();
  await page.getByTestId('live-finish').click();
  const dialog = page.getByRole('dialog', { name: 'Guardar la grabación' });
  await expect(dialog.getByLabel('Nombre')).toHaveValue('Trekking');
  await dialog.getByLabel('Nombre').fill('Trekking al cerro');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Trekking al cerro' })).toBeVisible();
  await expect(page).toHaveURL(/#\/training\/workouts\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('w-distance')).toHaveText(/^33\d m$/);
  await expect(page.getByTestId('w-map')).toHaveAttribute('href', /\/orientation\/maps\?track=/);
  // Sin el peso cargado, las calorías no se inventan; con el peso a mano se calculan.
  await expect(page.getByTestId('w-kcal')).toHaveText('—');
  await page.getByLabel('Peso (kg)').fill('75');
  await page.getByRole('button', { name: 'Recalcular las calorías' }).click();
  await expect(page.getByTestId('w-kcal')).toHaveText(/ kcal$/);
  await expect(bar).toHaveCount(0);

  // Salida: se crea desde la sesión, se renombra y se le suma la otra.
  await page.locator('#w-outing-sel').selectOption({ label: 'Nueva salida…' });
  await expect(page.getByRole('heading', { name: 'Nueva salida' })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar el nombre' }).click();
  await page.getByLabel('Nombre de la salida').fill('Salida al Platita');
  await page.getByLabel('Nombre de la salida').press('Enter');
  await expect(page.getByRole('heading', { name: 'Salida al Platita' })).toBeVisible();
  await expect(page.getByTestId('o-count')).toHaveText('1');
  await page.getByLabel('Sumar una actividad suelta').selectOption({ index: 1 });
  await expect(page.getByTestId('o-count')).toHaveText('2');
  await expect(page.getByTestId('o-distance')).toHaveText(/^4,3\d km$/);
  await expect(page.getByTestId('o-map')).toHaveAttribute('href', /\/orientation\/maps\?tracks=[0-9a-f-]{36}$/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-86-outing.png`, fullPage: true });

  // Compartir con un enlace público: contra el servidor de prueba, sin recorte (el recorrido es de 334 m).
  const outingUrl = page.url();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('vikarg-user');
        open.onsuccess = () => {
          const tx = open.result.transaction('settings', 'readwrite');
          const store = tx.objectStore('settings');
          const get = store.get('app');
          get.onsuccess = () => store.put({ key: 'app', value: { ...(get.result?.value ?? {}), serverUrl: 'http://127.0.0.1:8099' } });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await page.goto(outingUrl);
  const share = page.getByTestId('o-share');
  await expect(share).toContainText('No se sube ninguna foto, nota, ficha médica ni contacto');
  await share.getByLabel(/Ocultar los primeros y los últimos 300 m/).uncheck();
  await share.getByRole('button', { name: 'Crear el enlace público' }).click();
  const link = page.getByTestId('o-share-url');
  await expect(link).toHaveValue(/^http:\/\/127\.0\.0\.1:8099\/o\/[A-Za-z0-9_-]{10,}$/);
  const publicUrl = await link.inputValue();
  const html = await (await request.get(publicUrl)).text();
  expect(html).toContain('Salida al Platita');
  expect(html).toContain('<polyline');
  expect(html).not.toMatch(/<script/i);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-87-outing-share.png`, fullPage: true });
  // Dejar de compartir: el enlace deja de andar.
  await share.getByTestId('o-unshare').click();
  await expect(share.getByRole('button', { name: 'Crear el enlace público' })).toBeVisible();
  expect((await request.get(publicUrl)).status()).toBe(404);

  // En la lista de salidas.
  await page.goto('/#/training/outings');
  await expect(page.getByTestId('outing-list')).toContainText('Salida al Platita');
  await expect(page.getByTestId('outing-list')).toContainText('2 actividades');

  // Borrar la salida deja las actividades sueltas.
  await page.getByRole('link', { name: /Salida al Platita/ }).click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page).toHaveURL(/#\/training\/outings$/);
  await page.goto('/#/training/workouts');
  await expect(page.getByTestId('train-row')).toHaveCount(2);
  await expect(page.getByTestId('train-week')).toContainText('2');

  // Exportar la actividad con GPS a GPX y TCX, y volver a importar el GPX como actividad nueva.
  await page.getByTestId('train-row').filter({ hasText: 'Trekking al cerro' }).click();
  const [gpxDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('w-export-gpx').click()]);
  expect(gpxDownload.suggestedFilename()).toBe('Trekking-al-cerro.gpx');
  const gpxPath = testInfo.outputPath('trekking.gpx');
  await gpxDownload.saveAs(gpxPath);
  const [tcxDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('w-export-tcx').click()]);
  expect(tcxDownload.suggestedFilename()).toBe('Trekking-al-cerro.tcx');
  await page.goto('/#/training/workouts');
  await page.getByTestId('import-activity-file').setInputFiles(gpxPath);
  await expect(page).toHaveURL(/#\/training\/workouts\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('w-distance')).toHaveText(/^3\d\d m$/);
  await page.goto('/#/training/workouts');
  await expect(page.getByTestId('train-row')).toHaveCount(3);

  // Intervalos: se elige un plan antes de grabar, la pantalla en vivo muestra la etapa y la sesión guarda el plan.
  await page.goto('/#/training/workouts');
  await page.getByRole('button', { name: 'A pie' }).click();
  await page.getByLabel('Actividad', { exact: true }).selectOption({ label: 'Correr' });
  await page.getByLabel('Intervalos').selectOption('tabata');
  await page.getByRole('button', { name: 'Empezar a grabar' }).click();
  await expect(page.getByTestId('live-phase')).toContainText('Entrada en calor');
  await expect(page.getByTestId('live-phase-time')).toHaveText('2:00');
  await page.getByTestId('rec-warn').getByRole('button', { name: 'Entendido' }).click();
  await page.waitForTimeout(500);
  for (const lat of [-41.17, -41.171, -41.172]) {
    await context.setGeolocation({ latitude: lat, longitude: -71.42, accuracy: 5 });
    await page.waitForTimeout(300);
  }
  await expect(page.getByTestId('live-distance')).toHaveText(/^\d+$/);
  // Botón de vuelta: marca la vuelta y aparece en la tabla.
  await page.getByTestId('live-lap').click();
  await expect(page.getByTestId('lap-table')).toBeVisible();
  // Seguimiento en vivo para la familia: se crea un enlace, la página pública muestra la sesión y se corta al terminar.
  await page.getByLabel('Cuánto dura').selectOption({ label: '15 min' });
  await page.getByTestId('live-share-start').click();
  const liveUrl = await page.getByTestId('live-share-url').inputValue();
  expect(liveUrl).toMatch(/\/l\/[\w-]+$/);
  await expect(page.getByTestId('live-share-status')).toContainText('último envío', { timeout: 15_000 });
  const livePage = await request.get(liveUrl);
  expect(livePage.status()).toBe(200);
  expect(await livePage.text()).toContain('Correr');
  await page.getByTestId('live-pause').click();
  await page.getByTestId('live-finish').click();
  await page.getByRole('dialog', { name: 'Guardar la grabación' }).getByRole('button', { name: 'Guardar' }).click();
  // Al terminar la sesión el seguimiento se corta y el servidor lo borra.
  await expect.poll(async () => (await request.get(liveUrl)).status(), { timeout: 15_000 }).toBe(404);
  await expect(page.getByTestId('w-intervals')).toContainText('8 × 0:20 / 0:10');

  // Zona privada: un waypoint marcado como tal se ve en la lista y se ofrece al compartir una salida.
  await page.goto('/#/orientation/waypoints/new');
  await page.getByLabel('Nombre').fill('Mi casa');
  await page.getByLabel('Coordenadas').fill('-41.1612, -71.4201');
  await page.getByTestId('wp-more').getByText('Más opciones').click();
  await page.getByTestId('wp-private').check();
  await page.getByLabel('Radio').selectOption('500');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/#\/orientation\/waypoints\/[0-9a-f-]{36}$/);
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Zona privada · 500 m')).toBeVisible();

  // Notas de la sesión y equipo: cómo me sentí, terreno y zapatillas; el equipo se oculta con el interruptor.
  await page.goto('/#/training');
  await page.getByRole('link', { name: /Equipo/ }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Zapatillas de trail');
  await page.getByLabel('Vida útil (km)').fill('600');
  await page.getByTestId('gear-save').click();
  await expect(page.getByTestId('gear-row')).toContainText('0 km / 600 km');
  // El equipo también queda en el Inventario, en la categoría Entrenamiento.
  await expect(page.getByTestId('gear-row')).toContainText('Inventario: Zapatillas de trail');
  await page.goto('/#/inventory/items');
  await expect(page.getByRole('link', { name: /Zapatillas de trail/ })).toBeVisible();
  await page.goto('/#/training/gear');
  await page.goto('/#/training/workouts');
  await page.getByTestId('train-row').first().click();
  await page.getByTestId('w-feeling-4').click();
  await expect(page.getByTestId('w-feeling-4')).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Terreno o lugar').selectOption({ label: 'Sendero' });
  await page.getByLabel('Equipo usado').selectOption({ label: 'Zapatillas de trail' });
  await page.goto('/#/training/gear');
  await expect(page.getByTestId('gear-row')).toContainText(/[1-9][\d,]* km|0,\d km/);
  await page.goto('/#/training/workouts');
  await page.getByText('Objetivos de la semana').click();
  await page.getByTestId('gear-toggle').uncheck();
  await page.goto('/#/training');
  await expect(page.getByRole('link', { name: /Equipo/ })).toHaveCount(0);
});

test('salida planificada: hora límite vencida avisa arriba, "estoy bien" y volver apagan el aviso', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/training/outings');
  await page.getByLabel('Nombre de la salida').fill('Cerro Catedral');
  await page.getByRole('button', { name: 'Crear salida' }).click();
  await expect(page.getByTestId('outing-plan')).toBeVisible();

  // Hora límite hace una hora: ya está vencida.
  const p = (n: number) => String(n).padStart(2, '0');
  const d = new Date(Date.now() - 3_600_000);
  const local = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  await page.getByLabel('Hora límite de regreso').fill(local);
  await page.getByLabel('Responsable').fill('Ana');
  await page.getByLabel('A quién avisar').fill('Mamá 11 5555-1234');
  await page.getByLabel('Si no vuelvo o me demoro').fill('Bajar por el mismo camino');
  await page.getByTestId('plan-save').click();
  await expect(page.getByTestId('plan-status')).toHaveAttribute('data-state', 'overdue');

  // La barra de arriba se ve en toda la app, como alerta.
  await page.goto('/#/');
  const bar = page.getByTestId('plan-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Pasó la hora límite');
  await expect(bar).toHaveAttribute('role', 'alert');

  // "Estoy bien" queda anotado y se ve el último contacto.
  await page.getByTestId('plan-bar-checkin').click();
  await page.getByRole('link', { name: 'Ver plan' }).click();
  await expect(page.getByTestId('plan-status')).toContainText('último «estoy bien»');

  // El mensaje para la familia lleva lo acordado.
  const sms = await page.getByRole('link', { name: 'SMS' }).getAttribute('href');
  const body = decodeURIComponent(sms!.split('body=')[1]!);
  expect(body).toContain('Cerro Catedral');
  expect(body).toContain('Bajar por el mismo camino');

  // Volver apaga el aviso.
  await page.getByTestId('plan-close').click();
  await expect(page.getByTestId('plan-status')).toHaveAttribute('data-state', 'closed');
  await page.goto('/#/');
  await expect(page.getByTestId('plan-bar')).toHaveCount(0);
});

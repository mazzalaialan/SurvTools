import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

/** Como lo exporta Wikiloc: metadata con link, un track y puntos con nombre. */
const WIKILOC = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Wikiloc - https://www.wikiloc.com" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Wikiloc - Refugio Frey desde Villa Catedral</name>
    <link href="https://es.wikiloc.com/rutas-senderismo/refugio-frey-123456"><text>Refugio Frey en Wikiloc</text></link>
  </metadata>
  <wpt lat="-41.1700" lon="-71.4400"><ele>1700</ele><name>Refugio Frey</name><desc>Agua y camping</desc></wpt>
  <wpt lat="-41.1650" lon="-71.4300"><ele>1300</ele><name>Arroyo</name></wpt>
  <trk>
    <name>Refugio Frey desde Villa Catedral</name>
    <desc>Subida por el sendero del Cerro Catedral.</desc>
    <trkseg>
      <trkpt lat="-41.1600" lon="-71.4200"><ele>1000</ele></trkpt>
      <trkpt lat="-41.1640" lon="-71.4280"><ele>1150</ele></trkpt>
      <trkpt lat="-41.1660" lon="-71.4320"><ele>1300</ele></trkpt>
      <trkpt lat="-41.1680" lon="-71.4360"><ele>1290</ele></trkpt>
      <trkpt lat="-41.1700" lon="-71.4400"><ele>1700</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

test('tracks de Wikiloc: importar, ver datos y perfil, ir a un punto y copiarlo o sacarlo de mis waypoints', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Está en Orientación.
  await page.goto('/#/orientation');
  await page.getByRole('link', { name: /^Tracks/ }).click();
  await expect(page.getByText('Todavía no tenés tracks')).toBeVisible();

  // Un archivo que no es GPX avisa.
  await page.getByTestId('tracks-file').setInputFiles({ name: 'mal.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('<html></html>') });
  await expect(page.getByRole('alert')).toHaveText('El archivo no es un GPX, KML, KMZ ni TCX.');

  // Importar el GPX de Wikiloc abre el track.
  await page.getByTestId('tracks-file').setInputFiles({ name: 'frey.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(WIKILOC) });
  await expect(page.getByRole('heading', { name: 'Refugio Frey desde Villa Catedral' })).toBeVisible();
  const stats = page.getByTestId('track-stats');
  await expect(stats).toContainText('Distancia');
  await expect(stats).toContainText('710 m');
  await expect(page.getByTestId('track-profile')).toBeVisible();
  await expect(page.getByText('Fuente: Wikiloc')).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver la ruta original/ })).toHaveAttribute('href', 'https://es.wikiloc.com/rutas-senderismo/refugio-frey-123456');

  // Sus puntos no están en mis waypoints hasta que los copio.
  const points = page.getByTestId('track-points').locator('li');
  await expect(points).toHaveCount(2);
  await expect(points.nth(0)).toContainText('Refugio Frey');
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toHaveCount(0);
  await page.goBack();
  await page.getByRole('button', { name: 'Copiar Refugio Frey a mis waypoints' }).click();
  await expect(page.getByRole('button', { name: 'Sacar Refugio Frey de mis waypoints' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toBeVisible();

  // Desde el mismo botón se saca, y se puede volver a copiar.
  await page.goBack();
  await page.getByRole('button', { name: 'Sacar Refugio Frey de mis waypoints' }).click();
  await expect(page.getByRole('button', { name: 'Copiar Refugio Frey a mis waypoints' })).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toHaveCount(0);
  await page.goBack();
  await page.getByRole('button', { name: 'Copiar Refugio Frey a mis waypoints' }).click();
  await expect(page.getByRole('button', { name: 'Sacar Refugio Frey de mis waypoints' })).toBeVisible();

  // En la lista, con distancia y desnivel.
  await page.goto('/#/orientation/tracks');
  await expect(page.getByTestId('tracks-list')).toContainText('Refugio Frey desde Villa Catedral');
  await expect(page.getByTestId('tracks-list')).toContainText('2 puntos · Wikiloc');

  // Sus puntos no tienen "ir hasta": para ir con la brújula se copian a mis waypoints.
  await page.getByRole('link', { name: /Refugio Frey desde Villa Catedral/ }).click();
  await expect(page.getByTestId('track-points')).toContainText('Arroyo');
  await expect(page.getByRole('link', { name: /^Ir hasta/ })).toHaveCount(0);

  // En el mapa, como capa propia.
  await page.goto('/#/orientation/maps');
  await expect(page.getByRole('button', { name: 'Tracks', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Se elimina desde la lista (con confirmación); el punto copiado queda en mis waypoints.
  await page.goto('/#/orientation/tracks');
  await page.getByRole('button', { name: 'Eliminar Refugio Frey desde Villa Catedral' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('tracks-list')).toHaveCount(0);
  await expect(page.getByText('Todavía no tenés tracks')).toBeVisible();
  await page.goto('/#/orientation/waypoints');
  await expect(page.getByText('Refugio Frey')).toBeVisible();

  // Y también desde el detalle del track.
  await page.goto('/#/orientation/tracks');
  await page.getByTestId('tracks-file').setInputFiles({ name: 'frey.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(WIKILOC) });
  await expect(page.getByRole('heading', { name: 'Refugio Frey desde Villa Catedral' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page).toHaveURL(/#\/orientation\/tracks$/);
  await expect(page.getByText('Todavía no tenés tracks')).toBeVisible();
});

test('grabar mi recorrido: sigue con la app bloqueada, pausa, mapa, volver al origen, pantalla negra y guardado', async ({ page, context }, testInfo) => {
  test.setTimeout(150_000);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42, accuracy: 5 });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/tracks');
  await page.getByRole('button', { name: 'Grabar mi recorrido' }).click();
  const bar = page.getByTestId('rec-bar');
  await expect(bar).toContainText('Grabando');
  // Avisa que con el celular bloqueado no se graba, hasta que se lee.
  const warn = page.getByTestId('rec-warn');
  await expect(warn).toContainText('Si bloqueás el celular o se apaga la pantalla, se deja de grabar.');
  await warn.getByRole('button', { name: 'Entendido' }).click();
  await expect(warn).toHaveCount(0);
  // Con mala señal no graba, y lo dice.
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42, accuracy: 80 });
  await expect(page.getByTestId('rec-gps')).toContainText('Señal de GPS débil (±80 m)');
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42, accuracy: 5 });
  await expect(page.getByTestId('rec-gps')).toHaveCount(0);
  // Que llegue la primera posición antes de moverse.
  await page.waitForTimeout(500);
  // Cada paso, unos 111 m al sur.
  const walk = async (lat: number) => {
    await context.setGeolocation({ latitude: lat, longitude: -71.42, accuracy: 5 });
    await page.waitForTimeout(300);
  };
  await walk(-41.161);
  await walk(-41.162);
  await expect(page.getByTestId('rec-stats')).toContainText('222 m');
  // Aparece en la lista mientras se graba, sin poder borrarse.
  await expect(page.getByTestId('tracks-list')).toContainText('Grabando');

  // Con la app bloqueada se sigue grabando; al desbloquear vuelve a la misma pantalla con todo.
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await expect(page.getByTestId('rec-locked')).toHaveText('Se sigue grabando tu recorrido.');
  await walk(-41.163);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page).toHaveURL(/#\/orientation\/tracks$/);
  await expect(page.getByTestId('rec-stats')).toContainText(/33\d m/);

  // Si el sistema cierra la app estando bloqueada, lo grabado mientras tanto (cifrado aparte) no se pierde:
  // al volver a entrar se suma y la grabación queda en pausa.
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await walk(-41.164);
  await page.reload();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(bar).toContainText('Grabación en pausa');
  await expect(page.getByTestId('rec-stats')).toContainText(/44\d m/);

  // En pausa no suma; al seguir arranca otro tramo.
  await walk(-41.17);
  await expect(page.getByTestId('rec-stats')).toContainText(/44\d m/);
  // El tramo nuevo arranca donde estás al seguir (no donde pausaste).
  await bar.getByRole('button', { name: 'Seguir grabando' }).click();
  await page.waitForTimeout(500);
  await walk(-41.171);
  await walk(-41.172);
  await expect(page.getByTestId('rec-stats')).toContainText(/66\d m/);
  await bar.getByRole('button', { name: 'Pausar la grabación' }).click();
  await expect(bar).toContainText('Grabación en pausa');
  await bar.getByRole('button', { name: 'Seguir grabando' }).click();

  // Atajos de la barra de grabación: el resumen del recorrido (la ficha del track) y el mapa con el recorrido en vivo.
  await bar.getByTestId('rec-summary').click();
  await expect(page).toHaveURL(/#\/orientation\/tracks\/[^/]+$/);
  await expect(bar.getByTestId('rec-summary')).toHaveCount(0);
  await expect(bar.getByTestId('rec-map')).toBeVisible();
  // En el mapa offline, con su botón y lo grabado dibujado.
  await context.route(/tiles\.openfreemap\.org|elevation-tiles-prod/, (route) => route.abort());
  await bar.getByTestId('rec-map').click();
  await expect(page).toHaveURL(/#\/orientation\/maps$/);
  await expect(bar.getByTestId('rec-map')).toHaveCount(0);
  await expect(bar.getByTestId('rec-summary')).toBeVisible();
  await expect(page.locator('.maps-camera').getByRole('button', { name: 'Pausar la grabación' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-recorded', '9');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-31-track-recording.png` });

  // Volver al origen por el mismo camino.
  await bar.getByRole('link', { name: 'Volver al origen' }).click();
  await expect(page.getByRole('heading', { name: 'Volviendo al origen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recorrer en sentido inverso' })).toHaveAttribute('aria-pressed', 'true');
  // Lo grabado (los dos tramos) va dibujado encima.
  await expect(page.getByTestId('follow-rec')).toHaveCount(2);
  await walk(-41.16);
  await expect(page.getByTestId('follow-status')).toHaveText('Llegaste al origen');

  // Pantalla negra: dos toques para volver.
  await bar.getByRole('button', { name: 'Pantalla negra (ahorra batería)' }).click();
  const pocket = page.getByTestId('pocket');
  await expect(pocket).toContainText('Grabando');
  await expect(pocket).toContainText('No bloquees el celular');
  await pocket.dblclick();
  await expect(pocket).toHaveCount(0);

  // Terminar: se le pone nombre (o se sigue grabando) y aparece en los tracks.
  await bar.getByRole('button', { name: 'Terminar y guardar la grabación' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar la grabación' });
  await expect(dialog.getByLabel('Nombre')).toHaveValue(/^Recorrido del/);
  await dialog.getByRole('button', { name: 'Seguir grabando' }).click();
  await expect(bar).toContainText('Grabando');
  await bar.getByRole('button', { name: 'Terminar y guardar la grabación' }).click();
  await dialog.getByLabel('Nombre').fill('Ida y vuelta');
  // El cuadro también pide la actividad: lo grabado es a la vez un recorrido y una sesión de Entrenamiento.
  await expect(dialog.getByLabel('Actividad')).toHaveValue('walk');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/#\/training\/workouts\/[0-9a-f-]{36}$/);
  await expect(bar).toHaveCount(0);
  // El recorrido está en Tracks, con un enlace a su sesión.
  await page.goto('/#/orientation/tracks');
  await page.getByRole('link', { name: /Ida y vuelta/ }).click();
  await expect(page.getByRole('heading', { name: 'Ida y vuelta' })).toBeVisible();
  await expect(page.getByText(/^Grabado el/)).toBeVisible();
  await expect(page.getByTestId('track-workout')).toBeVisible();
  // Y el nombre y las notas se cambian después, en el track, con el lápiz.
  await page.getByRole('button', { name: 'Editar el nombre' }).click();
  await page.getByLabel('Nombre').fill('Nombre descartado');
  await page.getByLabel('Nombre').press('Escape');
  await expect(page.getByRole('heading', { name: 'Ida y vuelta' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar el nombre' }).click();
  await page.getByLabel('Nombre').fill('Ida y vuelta al arroyo');
  await page.getByLabel('Nombre').press('Enter');
  await expect(page.getByRole('heading', { name: 'Ida y vuelta al arroyo' })).toBeVisible();
  await expect(page.getByTestId('track-notes')).toContainText('Sin notas');
  await page.getByRole('button', { name: 'Agregar notas' }).click();
  await page.getByLabel('Notas').fill('Hay agua en el arroyo');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByTestId('track-notes')).toContainText('Hay agua en el arroyo');
  await expect(page.getByRole('button', { name: 'Editar las notas' })).toBeVisible();
  await page.goto('/#/orientation/tracks');
  await expect(page.getByTestId('tracks-list')).toContainText('Ida y vuelta al arroyo');
  await expect(page.getByTestId('tracks-list')).toContainText('Grabado por mí');
  await expect(page.getByRole('button', { name: 'Grabar mi recorrido' })).toBeVisible();
});

test('seguir un track en vivo: en el track, desviado, sentido inverso y llegada', async ({ page, context }, testInfo) => {
  // Brújula simulada desde el arranque (la app la detecta al abrir): mirando al este.
  await page.addInitScript(() => {
    const id = setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 270, beta: 0, gamma: 0, absolute: true })), 30);
    (window as unknown as { stopCompass: () => void }).stopCompass = () => clearInterval(id);
  });
  // Sin GPU (como en el servidor de pruebas), el mapa y el 3D se dibujan por software: pasa del minuto.
  test.setTimeout(180_000);
  await context.grantPermissions(['geolocation']);
  // En el segundo punto del track.
  await context.setGeolocation({ latitude: -41.164, longitude: -71.428 });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/orientation/tracks');
  await page.getByTestId('tracks-file').setInputFiles({ name: 'frey.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(WIKILOC) });
  await page.getByRole('link', { name: 'Seguir el track' }).click();
  await expect(page.getByRole('heading', { name: 'Siguiendo Refugio Frey desde Villa Catedral' })).toBeVisible();

  const status = page.getByTestId('follow-status');
  await expect(status).toHaveText('Vas por el track');
  const stats = page.getByTestId('follow-stats');
  await expect(stats).toContainText('Recorrido');
  await expect(stats).toContainText('Falta');
  // Quedan la subida al refugio y el repecho del medio.
  await expect(stats).toContainText('+560 m / −10 m');
  await expect(page.getByTestId('follow-next')).toContainText('Próximo punto: Arroyo');
  await expect(page.getByTestId('follow-map')).toBeVisible();

  // A un kilómetro al norte: fuera del track, con el rumbo para volver.
  await context.setGeolocation({ latitude: -41.155, longitude: -71.428 });
  await expect(status).toContainText('Te saliste del track');
  await expect(status).toContainText('S');

  // En sentido inverso, desde el refugio: falta todo y se baja.
  await context.setGeolocation({ latitude: -41.17, longitude: -71.44 });
  await page.getByRole('button', { name: 'Recorrer en sentido inverso' }).click();
  await expect(page.getByText('En sentido inverso: del final al inicio.')).toBeVisible();
  await expect(status).toHaveText('Vas por el track');
  await expect(stats).toContainText('+10 m / −710 m');

  // Llegada al inicio (que en inverso es el final).
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42 });
  await expect(status).toHaveText('Llegaste al final del track');

  // El dibujo gira con la brújula: mirando al este (rumbo 90°), lo de adelante queda arriba y la N, a la izquierda.
  await expect(page.getByTestId('drawing-rotate')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('follow-north')).toHaveCount(0);
  await page.getByTestId('drawing-rotate').click();
  await expect(page.getByTestId('drawing-rotate')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('follow-north')).toBeVisible();
  // Rumbo geográfico: 90° más la declinación magnética de Bariloche.
  await expect
    .poll(async () => {
      const m = /rotate\((-?[\d.]+) 150 150\)/.exec((await page.getByTestId('follow-drawing').getAttribute('transform')) ?? '');
      return m ? Math.abs(Number(m[1]) + 90) : null;
    })
    .toBeLessThan(12);

  // Sin GPU, el mapa por software no da abasto con la brújula a 30 eventos por segundo: se apaga.
  await page.evaluate(() => (window as unknown as { stopCompass: () => void }).stopCompass());
  // En el mapa (sin teselas: alcanza con que se dibuje y tenga los botones), siguiéndome de entrada.
  await context.route(/tiles\.openfreemap\.org|elevation-tiles-prod/, (route) => route.abort());
  await expect(page.getByTestId('follow-map')).toBeVisible();
  await page.getByRole('button', { name: 'Mapa 2D / 3D' }).click();
  await expect(page.getByTestId('offline-map').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('follow-map')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Seguir mi posición' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Mapa en 3D' }).click();
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-terrain', 'on');
  // La elección queda guardada.
  await page.getByRole('link', { name: 'Volver' }).click();
  await page.getByRole('link', { name: 'Seguir el track' }).click();
  await expect(page.getByTestId('offline-map').locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mapa en 3D' })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as unknown as { stopCompass?: () => void }).stopCompass?.());
  // Lo que sigue, en 2D: sin GPU, el relieve en 3D se dibuja por software y traba la página.
  await page.getByRole('button', { name: 'Mapa en 3D' }).click();
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-terrain', 'off');

  // En pantalla completa, el estado y los datos van sobre el mapa.
  await expect(page.getByTestId('follow-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  const overlay = page.getByTestId('follow-overlay');
  await expect(overlay).toContainText('Vas por el track');
  await expect(overlay).toContainText('Faltan');
  await expect(overlay).toContainText('+710 m / −10 m');
  await expect(overlay).toContainText('Próximo punto: Arroyo');
  await context.setGeolocation({ latitude: -41.155, longitude: -71.428 });
  await expect(overlay).toContainText('Te saliste del track');
  // Que termine el movimiento del mapa hacia la nueva posición antes de la captura.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-30-track-follow-full.png` });
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await expect(overlay).toHaveCount(0);
});

test('un corte de la grabación (pantalla apagada) se une con una recta que suma su distancia y se dibuja en otro color', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42, accuracy: 5 });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/orientation/tracks');
  await page.getByRole('button', { name: 'Grabar mi recorrido' }).click();
  await page.getByTestId('rec-warn').getByRole('button', { name: 'Entendido' }).click();
  await page.waitForTimeout(500);
  const walk = async (lat: number) => {
    await context.setGeolocation({ latitude: lat, longitude: -71.42, accuracy: 5 });
    await page.waitForTimeout(300);
  };
  await walk(-41.161);
  await walk(-41.162);
  await expect(page.getByTestId('rec-stats')).toContainText('222 m');

  // La pantalla se apaga 2 minutos (se adelanta el reloj de la página) y se vuelve.
  await page.evaluate(() => {
    const real = Date.now.bind(Date);
    let offset = 0;
    Date.now = () => real() + offset;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    offset = 120_000;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const warn = page.getByTestId('rec-warn');
  await expect(warn).toContainText('Se unió con una línea recta, marcada en otro color');
  await expect(warn).not.toContainText('Quedó un hueco');

  // Al volver llega la posición, unos 610 m más adelante (en línea recta): la recta suma esa distancia.
  await walk(-41.1675);
  await expect(page.getByTestId('rec-stats')).toContainText(/8[0-9]\d m/);

  // En el mapa se dibuja la recta del corte (una), aparte de lo medido.
  await context.route(/tiles\.openfreemap\.org|elevation-tiles-prod/, (route) => route.abort());
  await page.getByTestId('rec-map').click();
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-gap-lines', '1');
});

test('mapa: por defecto se ve el recorrido que se graba o el último; se puede elegir cuáles, ver todos o ninguno', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  // Tres recorridos importados (cada uno en su archivo).
  const gpx = (name: string, lat: number) =>
    `<?xml version="1.0"?><gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><trkseg>` +
    [0, 1, 2].map((i) => `<trkpt lat="${lat + i * 0.001}" lon="-71.42"><ele>800</ele></trkpt>`).join('') +
    `</trkseg></trk></gpx>`;
  await page.goto('/#/orientation/tracks');
  for (const [name, lat] of [['Lunes', -41.1], ['Miércoles', -41.2], ['Viernes', -41.3]] as const) {
    await page.getByTestId('tracks-file').setInputFiles({ name: `${name}.gpx`, mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx(name, lat)) });
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.goto('/#/orientation/tracks');
    await page.waitForTimeout(1100); // fechas distintas (el orden sale de cuándo se guardó)
  }
  await page.goto('/#/orientation/maps');
  const map = page.getByTestId('offline-map');
  const picker = page.getByTestId('track-picker');
  // Los tres son cargados desde archivo: por defecto se ven todos (interruptor «Cargados») y las opciones de «Mis recorridos» no aparecen
  // porque no hay ninguno grabado (esas reglas se prueban en trackSelect.test.ts).
  await expect(picker).toBeVisible();
  const toggle = page.getByTestId('track-imported-toggle').getByRole('checkbox');
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId('track-imported-toggle')).toContainText('Cargados (3)');
  await expect(map).toHaveAttribute('data-tracks-shown', '3');
  await expect(page.getByTestId('track-mode-auto')).toHaveCount(0);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-32-track-picker.png`, fullPage: true });
  // Apagar «Cargados»: no se ve ninguno, y queda guardado al volver a abrir el mapa.
  await toggle.uncheck();
  await expect(map).toHaveAttribute('data-tracks-shown', '0');
  await page.goto('/#/orientation/tracks');
  await page.goto('/#/orientation/maps');
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-tracks-shown', '0');
  // Desde la ficha de un recorrido («Ver en el mapa») ese recorrido se ve siempre, con los cargados apagados.
  await page.goto('/#/orientation/tracks');
  await page.getByRole('link', { name: /Lunes/ }).first().click();
  await page.getByRole('link', { name: /Ver en el mapa/ }).click();
  await expect(page.getByTestId('offline-map')).toHaveAttribute('data-tracks-shown', '1');
});

test('Tracks: los cargados y mis recorridos van en pestañas separadas, con buscador, para que al buscar uno cargado no salgan todos los míos', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -41.16, longitude: -71.42, accuracy: 5 });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  const gpx = (name: string) =>
    `<?xml version="1.0"?><gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><trkseg><trkpt lat="-41.1" lon="-71.4"><ele>800</ele></trkpt><trkpt lat="-41.101" lon="-71.4"><ele>810</ele></trkpt></trkseg></trk></gpx>`;
  await page.goto('/#/orientation/tracks');
  // Solo cargados: lista sola, sin pestañas.
  for (const name of ['Cerro Platita', 'Refugio Frey']) {
    await page.getByTestId('tracks-file').setInputFiles({ name: `${name}.gpx`, mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx(name)) });
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.goto('/#/orientation/tracks');
  }
  await expect(page.getByTestId('tracks-tabs')).toHaveCount(0);
  await expect(page.getByTestId('tracks-list')).toContainText('Cerro Platita');
  // Se graba un recorrido propio: aparecen las pestañas y se abre la de los míos (se está grabando).
  await page.getByRole('button', { name: 'Grabar mi recorrido' }).click();
  await page.getByTestId('rec-warn').getByRole('button', { name: 'Entendido' }).click();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('tracks-tabs')).toBeVisible();
  await page.reload();
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByTestId('tracks-tab-imported')).toHaveText('Cargados (2)');
  await expect(page.getByTestId('tracks-tab-mine')).toHaveText('Mis recorridos (1)');
  await page.getByTestId('tracks-tab-imported').click();
  // Los cargados no mezclan los míos.
  await expect(page.getByTestId('tracks-list')).toContainText('Cerro Platita');
  await expect(page.getByTestId('tracks-list')).not.toContainText('Grabando');
  await expect(page.getByTestId('tracks-list').getByRole('listitem')).toHaveCount(2);
  await page.getByTestId('tracks-tab-mine').click();
  await expect(page.getByTestId('tracks-list').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('tracks-list')).not.toContainText('Cerro Platita');
});

test('modo Conducir: se graba en vehículo con la velocidad en vivo, sin calorías ni ritmo, y se guarda solo como recorrido con su resumen', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -34.6, longitude: -58.4, accuracy: 5 });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Desde Tracks se elige el vehículo y se empieza; abre la pantalla en vivo de conducción.
  await page.goto('/#/orientation/tracks');
  await page.getByTestId('drive-start').click();
  await page.getByLabel('Vehículo').selectOption({ label: 'Moto' });
  await page.getByTestId('drive-begin').click();
  await expect(page).toHaveURL(/#\/training\/live$/);
  const drive = page.getByTestId('drive');
  await expect(drive).toContainText('Moto');
  await expect(drive).toContainText('Grabando');
  // Nada de entrenamiento: ni calorías, ni ritmo, ni vueltas, ni elegir actividad.
  await expect(drive).not.toContainText('kcal');
  await expect(drive).not.toContainText('Calorías');
  await expect(drive).not.toContainText('Ritmo');
  await expect(page.getByTestId('live-kind')).toHaveCount(0);
  await expect(page.getByTestId('live-lap')).toHaveCount(0);
  for (const label of ['Velocidad máxima', 'Media en movimiento', 'Parado', 'Rumbo', 'Altura']) await expect(drive).toContainText(label);
  await page.getByTestId('rec-warn').getByRole('button', { name: 'Entendido' }).click();

  // Se maneja un poco al norte (unos 33 m por paso).
  for (const lat of [-34.5997, -34.5994, -34.5991]) {
    await context.setGeolocation({ latitude: lat, longitude: -58.4, accuracy: 5 });
    await page.waitForTimeout(400);
  }
  await expect(page.getByTestId('drive-distance')).toHaveText(/^\d+ m$/);
  await expect(page.getByTestId('drive-heading')).toContainText(/^N/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-41-drive.png`, fullPage: true });

  // Al terminar solo pide el nombre (sin actividad, mochila ni peso) y deja un recorrido con su resumen.
  await page.getByTestId('live-finish').click();
  await expect(page.getByLabel('Actividad', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Peso (kg)')).toHaveCount(0);
  await expect(page.getByText('no como entrenamiento')).toBeVisible();
  await page.getByLabel('Nombre').fill('Viaje a la costa');
  await page.getByTestId('rec-save-btn').click();
  await expect(page).toHaveURL(/#\/orientation\/tracks\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Viaje a la costa' })).toBeVisible();
  const stats = page.getByTestId('drive-stats');
  await expect(stats).toContainText('Moto');
  await expect(stats).toContainText('Velocidad máxima');
  await expect(stats).toContainText('Media con paradas');
  await expect(page.getByTestId('track-workout')).toHaveCount(0);

  // Y no es una sesión de Entrenamiento: el historial sigue vacío.
  await page.goto('/#/training/workouts');
  await expect(page.getByTestId('train-row')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { waitForServiceWorker } from './serviceWorker';

const PASSWORD = 'prueba-segura-123';
const SERVER = 'http://127.0.0.1:8099';

test('biblioteca: libres (verde) y con derechos (clave VikArg), bajar por categoría, leer y buscar sin conexión', async ({ page, context }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Servidor de pruebas (con biblioteca y clave).
  await page.goto('/#/settings?conexiones=1');
  await page.getByRole('button', { name: 'Desbloquear para modificar' }).first().click();
  await page.getByLabel('Servidor VikArg').fill(SERVER);
  await page.getByRole('button', { name: 'Guardar' }).last().click();

  await page.goto('/#/library/books');
  const cat = page.getByTestId('library-cat-cabuyeria');
  await expect(cat).toContainText('Cabuyería');
  await expect(page.getByTestId('book-montanismo').getByRole('button', { name: 'Libre' })).toBeVisible();
  await expect(page.getByTestId('book-enciclopedia').getByRole('button', { name: 'Con derechos' })).toBeVisible();
  // El candado es solo un ícono: al tocarlo explica qué significa.
  await page.getByTestId('book-enciclopedia').getByRole('button', { name: 'Con derechos' }).click();
  await expect(page.getByRole('dialog')).toContainText('Uso personal');
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-60-library.png`, fullPage: true });

  // En bloque: con el filtro "Libres", "elegir los que se ven" toma solo el libre; después, toda la categoría.
  await page.getByRole('button', { name: 'Libres', exact: true }).click();
  await page.getByTestId('library-select-visible').click();
  await expect(page.getByTestId('library-bar')).toContainText('1 libro elegido');
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.getByLabel('Elegir todos los libros de Cabuyería').check();
  await expect(page.getByTestId('library-bar')).toContainText('2 libros elegidos');
  await page.getByTestId('library-download').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('uso personal');
  await dialog.getByLabel('Clave VikArg', { exact: true }).fill('otra');
  await page.getByTestId('library-key-ok').click();
  await expect(dialog.getByText('La clave no es correcta.')).toBeVisible();
  await dialog.getByLabel('Clave VikArg', { exact: true }).fill('VikArg-prueba');
  await page.getByTestId('library-key-ok').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('book-montanismo').getByLabel('En el dispositivo')).toBeVisible();
  await expect(page.getByTestId('book-enciclopedia').getByLabel('En el dispositivo')).toBeVisible();
  await expect(page.getByText('Libros con derechos desbloqueados.')).toBeVisible();

  // En un celular, con los botones de un libro bajado, el título no se aprieta (antes quedaba de 1 o 2 letras por línea).
  await page.setViewportSize({ width: 412, height: 900 });
  await expect.poll(async () => (await page.getByTestId('book-montanismo').locator('.list-title').boundingBox())?.width ?? 0).toBeGreaterThan(150);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-60b-library-phone.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  // Leer: capítulos y siguiente.
  await page.getByRole('link', { name: 'Leer «Manual de montañismo del Ejército»' }).click();
  const frame = page.frameLocator('[data-testid="reader-frame"]');
  await expect(frame.locator('h1')).toHaveText('Nudos');
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await expect(frame.locator('h1')).toHaveText('Anclajes');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-61-reader.png` });

  // Sin conexión: el libro con derechos se lee igual (está descifrado en el dispositivo), también tras recargar.
  // La app sin conexión depende del service worker (precache): se espera a que esté listo antes de cortar la red.
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.goto('/#/library/read/enciclopedia');
  await page.reload();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(frame.locator('h1')).toHaveText('Introducción');
  await expect(frame.locator('p')).toContainText('as de guía');

  // Buscar en los libros bajados.
  await page.goto('/#/library/search');
  await page.getByLabel('Palabra o frase (al menos 3 letras)').fill('prusik');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByTestId('library-hits')).toContainText('Manual de montañismo del Ejército');
  await page.getByTestId('library-hits').getByRole('link').first().click();
  await expect(frame.locator('h1')).toHaveText('Nudos');

  // La ficha del nudo muestra dónde aparece en los libros bajados, con la figura de la copia del usuario.
  await page.goto('/#/knots/guide/prusik');
  const refs = page.getByTestId('knot-library');
  await expect(refs).toContainText('Manual de montañismo del Ejército');
  await expect(refs).toContainText('El nudo Prusik sirve para subir por una cuerda');
  // La figura sale de lo guardado en el dispositivo (dirección blob:, sin service worker).
  await expect(refs.locator('img')).toHaveAttribute('src', /^blob:/);
  // La imagen carga en diferido: la sección queda abajo de los pasos.
  await refs.locator('img').scrollIntoViewIfNeeded();
  await expect.poll(() => refs.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await refs.getByRole('link').first().click();
  await expect(frame.locator('.reader-hit')).toContainText('Prusik');
  // Las imágenes del capítulo también salen del dispositivo y cargan (rutas relativas del libro reescritas).
  await expect(frame.locator('img').first()).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => frame.locator('img').first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  // Un nudo que no está en esos libros.
  await page.goto('/#/knots/guide/cornamusa');
  await expect(page.getByTestId('knot-library')).toContainText('No aparece en los 2 libros de nudos');
  await context.setOffline(false);

  // Espacio: Ajustes muestra cuánto ocupan los libros bajados.
  await page.goto('/#/settings?conexiones=1');
  await expect(page.getByTestId('storage-books')).toContainText('2 libros de la biblioteca');

  // Borrar varios libros a la vez: modo "Elegir para borrar", elegir los dos y borrarlos.
  await page.goto('/#/library/books');
  await page.getByTestId('library-delete-mode').click();
  await page.getByTestId('book-montanismo').getByRole('checkbox').check();
  await page.getByTestId('book-enciclopedia').getByRole('checkbox').check();
  await expect(page.getByTestId('library-delete-bar')).toContainText('2 libros para borrar');
  await page.getByTestId('library-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('book-montanismo').getByLabel('En el dispositivo')).toHaveCount(0);
  await expect(page.getByTestId('book-enciclopedia').getByLabel('En el dispositivo')).toHaveCount(0);
  await expect(page.getByTestId('library-delete-mode')).toHaveCount(0);
  await page.goto('/#/settings?conexiones=1');
  await expect(page.getByTestId('storage-books')).toContainText('0 libros de la biblioteca');
});

test('biblioteca: cancelar una descarga en curso no gasta más datos y deja lo que falta elegido', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await page.goto('/#/settings?conexiones=1');
  await page.getByRole('button', { name: 'Desbloquear para modificar' }).first().click();
  await page.getByLabel('Servidor VikArg').fill(SERVER);
  await page.getByRole('button', { name: 'Guardar' }).last().click();

  // El libro tarda en llegar (como con mala señal): la descarga queda en curso.
  let requested = 0;
  await page.route(`${SERVER}/api/library/books/**`, async () => {
    requested++;
    await new Promise(() => {});
  });
  await page.goto('/#/library/books');
  await page.getByRole('button', { name: 'Libres', exact: true }).click();
  await page.getByTestId('library-select-visible').click();
  await page.getByTestId('library-download').click();
  await expect(page.getByTestId('library-bar')).toContainText('Bajando 1 de 1');
  await expect.poll(() => requested).toBe(1);

  await page.getByTestId('library-cancel').click();
  await expect(page.getByTestId('library-stopped')).toContainText('Descarga cancelada');
  await expect(page.getByTestId('library-bar')).toContainText('1 libro elegido');
  await expect(page.getByTestId('book-montanismo').getByLabel('En el dispositivo')).toHaveCount(0);
  expect(requested).toBe(1);
});

test('verificar descargas: con el libro en el dispositivo está todo en orden; si desaparece de la caché lo marca y se puede quitar', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Sin nada bajado, no hay qué revisar.
  await page.goto('/#/settings');
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-none')).toBeVisible();

  // Se baja el libro libre.
  await page.goto('/#/settings?conexiones=1');
  await page.getByRole('button', { name: 'Desbloquear para modificar' }).first().click();
  await page.getByLabel('Servidor VikArg').fill(SERVER);
  await page.getByRole('button', { name: 'Guardar' }).last().click();
  await page.goto('/#/library/books');
  await page.getByRole('button', { name: 'Libres', exact: true }).click();
  await page.getByTestId('library-select-visible').click();
  await page.getByTestId('library-download').click();
  await expect(page.getByTestId('book-montanismo').getByLabel('En el dispositivo')).toBeVisible();

  // Todo en orden.
  await page.goto('/#/settings');
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-ok')).toContainText('1 libros');

  // El sistema borra los archivos del libro: la app lo detecta y deja quitarlo de la lista.
  await page.evaluate(async () => {
    const cache = await caches.open('vikarg-library-books');
    for (const req of await cache.keys()) if (req.url.includes('/montanismo/')) await cache.delete(req);
  });
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-problems')).toBeVisible();
  const row = page.getByTestId('verify-book-montanismo');
  await expect(row).toContainText('No está en este teléfono');
  await expect(row.getByRole('link', { name: 'Volver a bajar' })).toHaveAttribute('href', /library\/books/);
  await row.getByRole('button', { name: 'Quitar de la lista' }).click();
  await expect(row).toHaveCount(0);
  await page.getByTestId('verify-run').click();
  await expect(page.getByTestId('verify-none')).toBeVisible();
});


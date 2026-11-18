import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

test('botiquín de trauma: contenido, vencimientos y faltantes', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Un lugar común donde va a estar el botiquín.
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Auto');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Emergencia', exact: true }).click();
  await page.getByRole('link', { name: /Botiquines/ }).click();
  await expect(page.getByText('Todavía no armaste botiquines')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo botiquín' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Nuevo botiquín' })).toBeVisible();
  await dialog.getByLabel('Nombre').fill('Trauma del auto');
  await dialog.getByLabel('¿Es un botiquín?').selectOption({ label: 'Trauma' });
  await dialog.getByLabel('Dentro de').selectOption({ label: 'Auto' });
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Trauma · Auto')).toBeVisible();

  // Contenido: un torniquete nuevo que vence pronto.
  await page.getByRole('link', { name: /Trauma del auto/ }).click();
  await expect(page.getByText('El botiquín está vacío.')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar' }).click();
  await dialog.getByLabel('Nombre').fill('Torniquete CAT');
  await dialog.getByLabel('Unidad').fill('unidades');
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByLabel('Ubicación')).toHaveValue(/.+/);
  await expect(dialog.getByLabel('Ubicación').locator('option:checked')).toHaveText('Auto › Trauma del auto');
  await dialog.getByLabel('Cantidad').fill('1');
  await dialog.getByLabel('Fecha de vencimiento').fill(isoInDays(5));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Vence en 5 días')).toBeVisible();

  // Mínimo de 2 torniquetes en ese botiquín → falta 1.
  await page.goto('/#/inventory/items');
  await page.getByRole('link', { name: /Torniquete CAT/ }).click();
  await expect(page.getByLabel('Categoría', { exact: true }).locator('option:checked')).toHaveText('Botiquín');
  await page.getByLabel('Ubicación').selectOption({ label: 'Auto › Trauma del auto' });
  await page.getByLabel('Mínimo', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Agregar mínimo' }).click();

  // El faltante de mínimo queda en el índice de notificaciones (solo con el nombre, sin la ubicación).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<{ lotId: string; itemName: string; kind: string }[]>((resolve) => {
            const req = indexedDB.open('vikarg-user');
            req.onsuccess = () => {
              const get = req.result.transaction('alertIndex').objectStore('alertIndex').getAll();
              get.onsuccess = () => resolve(get.result);
            };
          }),
      ),
    )
    .toContainEqual(expect.objectContaining({ itemName: 'Torniquete CAT\u001fTrauma del auto', kind: 'minStock', lotId: expect.stringMatching(/^min:/) }));

  await page.goto('/#/first-aid/kits');
  await expect(page.getByText('2 a revisar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Para revisar' })).toBeVisible();
  await page.locator('a[href^="#/first-aid/kits/"]:not([href$="/build"])').first().click();
  await expect(page.getByRole('heading', { name: 'Falta', exact: true })).toBeVisible();
  await expect(page.getByText('1 de 2 unidades')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-11-kit.png`, fullPage: true });

  // El botiquín también se ve como ubicación del inventario.
  await page.goto('/#/inventory/locations');
  await expect(page.getByText('Trauma del auto')).toBeVisible();
});

test('asistente «Armar botiquín»: crea el botiquín con los mínimos y después dice qué falta', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Se llega desde Botiquines (no hay una tarjeta aparte en Primeros auxilios).
  await page.goto('/#/first-aid');
  await expect(page.getByRole('link', { name: /Armar botiquín/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Botiquines/ }).click();
  await page.getByTestId('kits-build').click();
  await expect(page.getByRole('heading', { name: 'Armar un botiquín' })).toBeVisible();

  // Escenario «Hemorragia grave», nivel individual: el torniquete, la gasa hemostática y el vendaje de presión.
  await page.getByTestId('kb-scenario-bleeding').click();
  await expect(page.getByTestId('kb-desc')).toContainText('IFAK/JFAK');
  await expect(page.getByTestId('kb-row-tourniquet')).toBeVisible();
  await expect(page.getByTestId('kb-row-hemostatic')).toBeVisible();
  // Lo que requiere entrenamiento no aparece en el nivel individual y sí en el avanzado, marcado.
  await expect(page.getByTestId('kb-row-needle')).toHaveCount(0);
  // El campo de personas se puede borrar y tipear de nuevo sin que se pegue el «1» anterior.
  await page.getByTestId('kb-people').fill('');
  await page.getByTestId('kb-people').pressSequentially('7');
  await expect(page.getByTestId('kb-people')).toHaveValue('7');
  // Al cambiar las personas se recalcula lo necesario y lo que falta, pero el equipo de trauma no es un torniquete por persona: con más de
  // una persona alcanzan dos juegos (es improbable que haya más de dos heridos graves a la vez). Lo de uso personal crece con un tope.
  await expect(page.getByTestId('kb-qty-tourniquet')).toHaveValue('2');
  await expect(page.getByTestId('kb-gap-tourniquet')).toContainText('faltan 2');
  await expect(page.getByTestId('kb-qty-gloves')).toHaveValue('4');
  await expect(page.getByTestId('kb-people-hint')).toContainText('no crece con cada persona');
  await page.getByTestId('kb-people').fill('30');
  await expect(page.getByTestId('kb-qty-tourniquet')).toHaveValue('2');
  await expect(page.getByTestId('kb-qty-gloves')).toHaveValue('4');
  await page.getByTestId('kb-people').fill('7');
  await page.getByTestId('kb-people').fill('1');
  await expect(page.getByTestId('kb-people')).toHaveValue('1');
  await page.getByTestId('kb-level-advanced').click();
  await expect(page.getByTestId('kb-row-needle')).toContainText('solo personal entrenado');
  await page.getByTestId('kb-level-individual').click();
  // El torniquete explica para qué sirve y muestra las dos posturas de las fuentes.
  await page.getByTestId('kb-row-tourniquet').getByRole('button', { name: /Torniquete/ }).click();
  await expect(page.getByTestId('kb-row-tourniquet')).toContainText('Las fuentes difieren');
  // Se destilda uno y en otro se dice cuántos hay: con 1 de 2 guantes, queda 1 como faltante.
  await page.getByTestId('kb-row-shears').getByRole('checkbox', { name: /Incluir/ }).uncheck();
  await page.getByTestId('kb-have-gloves').fill('1');
  await expect(page.getByTestId('kb-gap-gloves')).toContainText('falta 1');
  await expect(page.getByTestId('kb-gap-tourniquet')).toContainText('falta 1');
  await page.getByTestId('kb-name').fill('IFAK de la mochila');
  await page.getByTestId('kb-create').click();

  // El botiquín nuevo: lo que se dijo que había está cargado y lo que no llega a la cantidad figura como faltante.
  await expect(page.getByRole('heading', { name: 'IFAK de la mochila' })).toBeVisible();
  await expect(page.getByText('Guantes de nitrilo').first()).toBeVisible();
  await expect(page.getByText('1 de 2 pares')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Falta', exact: true })).toBeVisible();
  await expect(page.getByText('Torniquete de molinete')).toBeVisible();
  await expect(page.getByText('Tijera de trauma')).toHaveCount(0);

  // La lista de faltantes del botiquín se puede imprimir en PDF (A4) y compartir.
  const missingBox = page.getByTestId('kit-missing');
  await expect(missingBox).toContainText('Guantes de nitrilo');
  await expect(missingBox.getByTestId('km-share')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), missingBox.getByTestId('km-pdf').click()]);
  expect(download.suggestedFilename()).toMatch(/^Lista-de-compras-IFAK-de-la-mochila.*\.pdf$/);
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  // Una hoja A4 (595 × 842 pt) con una imagen que la cubre.
  expect(bytes.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  await expect(page.getByTestId('km-message')).toContainText('PDF listo');

  // «Compré»: lo que faltaba (1 par de guantes) pasa al contenido y deja de figurar como faltante.
  await missingBox.locator('li', { hasText: 'Guantes de nitrilo' }).getByRole('button', { name: 'Compré' }).click();
  await expect(page.getByTestId('km-qty')).toHaveValue('1');
  await page.getByTestId('km-confirm').click();
  await expect(missingBox.locator('li', { hasText: 'Guantes de nitrilo' })).toHaveCount(0);
  await expect(page.getByTestId('km-message')).toContainText('pasó al contenido');
  await expect(page.getByRole('heading', { name: 'Contenido' })).toBeVisible();
  await expect(page.getByText('Guantes de nitrilo').first()).toBeVisible();

  // «No lo necesito»: se saca de los faltantes (con confirmación) sin tocar el artículo.
  const marker = missingBox.locator('li', { hasText: 'Marcador indeleble' });
  await expect(marker).toBeVisible();
  // La cruz de cada fila saca el artículo de los faltantes; pide confirmación para no tocarla por error.
  await marker.getByRole('button', { name: /No lo necesito/ }).click();
  await expect(page.getByTestId('confirm-message')).toContainText('Marcador indeleble');
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('km-message')).toContainText('ya no figura como faltante');
  await expect(missingBox.locator('li', { hasText: 'Marcador indeleble' })).toHaveCount(0);
  // Se puede deshacer desde el aviso, que aparece arriba de la lista.
  await page.getByTestId('km-undo').click();
  await expect(missingBox.locator('li', { hasText: 'Marcador indeleble' })).toBeVisible();

  // Lo que se dijo «no lo necesito» tampoco lo pide «¿Qué le falta?» (hasta volver a incluirlo).
  const note = missingBox.locator('li', { hasText: 'Libreta o tarjeta' });
  await note.getByRole('button', { name: /No lo necesito/ }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(note).toHaveCount(0);
  // «¿Qué le falta?»: se compara con la plantilla y se puede dejar como mínimo.
  await page.getByTestId('kc-toggle').click();
  await expect(page.getByTestId('kc-scenario')).toHaveValue('bleeding');
  await expect(page.getByTestId('kc-summary')).toContainText('Faltan');
  await expect(page.getByTestId('kc-missing')).toContainText('Gasa hemostática');
  await expect(page.getByTestId('kc-missing')).toContainText('Tijera de trauma');
  await expect(page.getByTestId('kc-missing')).not.toContainText('Libreta o tarjeta');
  await expect(page.getByTestId('kc-dismissed')).toContainText('Dejaste afuera 1 artículo');
  await page.getByTestId('kc-include-again').click();
  await expect(page.getByTestId('kc-missing')).toContainText('Libreta o tarjeta');
  await page.getByTestId('kc-mins').click();
  await expect(page.getByTestId('kc-message')).toContainText('stock mínimo');

  // «Para revisar» (en Botiquines) y la pantalla de inicio juntan todos los faltantes de un botiquín en una sola fila.
  await page.goto('/#/first-aid/kits');
  const group = page.locator('[data-testid^="shortage-kit-"]');
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('IFAK de la mochila');
  await expect(group).toContainText(/Faltan \d+ artículos/);
  await page.goto('/#/');
  await expect(page.locator('[data-testid^="shortage-kit-"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /1 alerta/ })).toBeVisible();
});

test('el asistente pasa al botiquín nuevo lo que ya tenés fuera de los botiquines, sin tocar los otros botiquines', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Un lugar común (el placard) y dos torniquetes guardados ahí, con vencimiento.
  await page.goto('/#/inventory/locations');
  await page.getByRole('button', { name: 'Nueva ubicación' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Placard');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#/inventory/items/new');
  await page.getByLabel('Nombre').fill('Torniquete CAT');
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Botiquín' });
  await page.getByLabel('Unidad', { exact: true }).fill('unidades');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/#\/inventory\/items\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Agregar lote' }).click();
  const lot = page.getByRole('dialog');
  await lot.getByLabel('Ubicación').selectOption({ label: 'Placard' });
  await lot.getByLabel('Cantidad').fill('2');
  await lot.getByLabel('Fecha de vencimiento').fill(isoInDays(400));
  await lot.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Placard').first()).toBeVisible();

  // Primer botiquín (hemorragia, nivel Avanzado: pide 2 torniquetes): se llevan los dos del placard.
  await page.goto('/#/first-aid/kits/build');
  await page.getByTestId('kb-scenario-bleeding').click();
  await page.getByTestId('kb-level-advanced').click();
  await expect(page.getByTestId('kb-outside-tourniquet')).toContainText('2 en Placard');
  await expect(page.getByTestId('kb-have-tourniquet')).toHaveValue('2');
  await expect(page.getByTestId('kb-gap-tourniquet')).toContainText('completo');
  await page.getByTestId('kb-name').fill('Primer botiquín');
  await page.getByTestId('kb-create').click();
  await expect(page.getByRole('heading', { name: 'Primer botiquín' })).toBeVisible();
  await expect(page.getByText('Torniquete CAT').first()).toBeVisible();

  // Segundo botiquín: lo que está en el primer botiquín no se cuenta ni se mueve; el placard ya quedó sin torniquetes.
  await page.goto('/#/first-aid/kits/build');
  await page.getByTestId('kb-scenario-bleeding').click();
  await expect(page.getByTestId('kb-outside-tourniquet')).toHaveCount(0);
  await expect(page.getByTestId('kb-row-tourniquet')).toContainText('En otros botiquines hay 2');
  await expect(page.getByTestId('kb-have-tourniquet')).toHaveValue('0');
  await page.getByTestId('kb-name').fill('Segundo botiquín');
  await page.getByTestId('kb-create').click();
  await expect(page.getByRole('heading', { name: 'Segundo botiquín' })).toBeVisible();
  // El segundo botiquín no recibió nada del primero: el torniquete figura como faltante.
  await expect(page.getByTestId('kit-missing')).toContainText('Torniquete CAT');
  await page.goto('/#/inventory/items');
  await expect(page.getByText(/Stock: 2 unidades · 1 lote · Primer botiquín/)).toBeVisible();

  // Se compra otro y se guarda en el placard: en «Falta» del segundo botiquín aparece para pasarlo, y al pasarlo deja de faltar.
  await page.getByRole('link', { name: /Torniquete CAT/ }).click();
  await page.getByRole('button', { name: 'Agregar lote' }).click();
  const more = page.getByRole('dialog');
  await more.getByLabel('Ubicación').selectOption({ label: 'Placard' });
  await more.getByLabel('Cantidad').fill('1');
  await more.getByLabel('Fecha de vencimiento').fill(isoInDays(500));
  await more.getByRole('button', { name: 'Guardar' }).click();
  await page.goto('/#/first-aid/kits');
  await page.locator('a[href^="#/first-aid/kits/"]:not([href$="/build"])', { hasText: 'Segundo botiquín' }).first().click();
  await expect(page.getByTestId('kit-missing')).toContainText('Tenés 1 guardado en Placard');
  await page.getByTestId('kit-missing').getByRole('button', { name: /Pasar 1 de Torniquete CAT/ }).click();
  await expect(page.getByTestId('kit-missing').locator('li', { hasText: 'Torniquete CAT' })).toHaveCount(0);
});

test('el asistente se personaliza con las fichas médicas elegidas y los invitados, sin guardar datos médicos en el botiquín', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Sin fichas: se explica y se puede indicar cuántas personas son.
  await page.goto('/#/first-aid/kits/build');
  await expect(page.getByText('Todavía no cargaste fichas médicas')).toBeVisible();
  await expect(page.getByTestId('kb-total')).toContainText('Sin elegir a nadie');

  // Dos fichas: Ana (alergia grave y diabetes) y Sofi (una nena).
  const crear = async (nombre: string, nacimiento: string, alergias: string, condiciones: string) => {
    await page.goto('/#/first-aid/medical');
    await page.getByRole('link', { name: 'Nueva ficha' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill(nombre);
    await page.getByLabel('Fecha de nacimiento').fill(nacimiento);
    if (alergias) await page.getByLabel('Alergias').fill(alergias);
    if (condiciones) await page.getByLabel('Enfermedades y condiciones').fill(condiciones);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  };
  await crear('Ana', '1990-05-20', 'Maní (anafilaxia)', 'Diabetes tipo 2');
  await crear('Sofi', '2022-03-10', '', '');

  await page.goto('/#/first-aid/kits/build');
  await expect(page.getByTestId('kb-profiles')).toContainText('Ana');
  await expect(page.getByTestId('kb-profiles')).toContainText('Sofi');
  // Cada vez se elige de nuevo: arranca sin nadie elegido y sin nada personalizado.
  await expect(page.getByTestId('kb-total')).toContainText('Sin elegir a nadie');
  await expect(page.getByTestId('kb-row-epinephrine')).toHaveCount(0);

  // Se eligen las dos y se suma un invitado sin ficha: son 3 personas.
  await page.getByTestId('kb-scenario-home').click();
  await page.getByTestId('kb-profiles').getByRole('checkbox').first().check();
  await page.getByTestId('kb-profiles').getByRole('checkbox').nth(1).check();
  await page.getByTestId('kb-people').fill('1');
  await expect(page.getByTestId('kb-total')).toHaveText('Para 3 personas.');
  await expect(page.getByTestId('kb-row-epinephrine')).toBeVisible();
  await expect(page.getByTestId('kb-why-epinephrine-severeAllergy')).toContainText('Ana');
  await expect(page.getByTestId('kb-why-glucometer-diabetes')).toContainText('Ana');
  await expect(page.getByTestId('kb-why-oral_syringe-child')).toContainText('Sofi');
  await expect(page.getByText('Las fichas se leen solo en tu dispositivo')).toBeVisible();
  // Una invitada sola, sin ficha, no suma nada personal.
  await page.getByTestId('kb-profiles').getByRole('checkbox').first().uncheck();
  await page.getByTestId('kb-profiles').getByRole('checkbox').nth(1).uncheck();
  await expect(page.getByTestId('kb-row-epinephrine')).toHaveCount(0);
  await expect(page.getByTestId('kb-total')).toHaveText('Para 1 persona.');
  await page.getByTestId('kb-profiles').getByRole('checkbox').first().check();

  await page.getByTestId('kb-name').fill('Botiquín de casa');
  await page.getByTestId('kb-create').click();
  await expect(page.getByRole('heading', { name: 'Botiquín de casa' })).toBeVisible();
  // El botiquín lleva el autoinyector (con la aclaración del médico) pero no dice de quién ni por qué.
  await expect(page.getByText('Autoinyector de adrenalina').first()).toBeVisible();
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/\bAna\b/);
  expect(body).not.toMatch(/\bSofi\b/);
  expect(body).not.toContain('Diabetes tipo 2');
  expect(body).not.toContain('Maní');
  expect(body).not.toContain('anafilaxia');
});

test('embarazo: se carga en la ficha, personaliza el botiquín con avisos y no queda guardado en el botiquín', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // La ficha tiene el campo «Está embarazada» con la fecha probable de parto (opcional); en mascotas no está.
  await page.goto('/#/first-aid/medical');
  await page.getByRole('link', { name: 'Nueva ficha' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Marta');
  await page.getByLabel('Fecha de nacimiento').fill('1992-03-04');
  await expect(page.getByLabel('Fecha probable de parto')).toHaveCount(0);
  await page.getByTestId('pregnancy-toggle').check();
  await page.getByLabel('Fecha probable de parto').fill(isoInDays(30));
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page).toHaveURL(/medical\/[0-9a-f-]{36}$/);
  await page.goto('/#/first-aid/medical');
  await expect(page.getByText('Embarazo').first()).toBeVisible();
  // Al volver a abrir la ficha, el dato sigue.
  await page.getByRole('link', { name: /Marta/ }).click();
  await expect(page.getByTestId('pregnancy-toggle')).toBeChecked();
  await expect(page.getByLabel('Fecha probable de parto')).toHaveValue(isoInDays(30));

  // Con «Mostrar datos de emergencia sin desbloquear» activado, la pantalla de bloqueo muestra también el embarazo (y la fecha de parto);
  // con la opción apagada, no hay tarjeta.
  await page.goto('/#/settings');
  await page.getByTestId('emergency-on-lock').check();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Bloquear ahora' }).first().click();
  await page.getByRole('button', { name: 'Ver datos de emergencia' }).click();
  await expect(page.getByTestId('lock-card-pregnancy')).toContainText('Embarazo · fecha probable de parto');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // En el asistente, elegida Marta: artículos con el motivo y el aviso fijo; con el parto cerca y un escenario de montaña, el segundo aviso.
  await page.goto('/#/first-aid/kits/build');
  await page.getByTestId('kb-scenario-home').click();
  await expect(page.getByTestId('kb-note-pregnancy')).toHaveCount(0);
  await page.getByTestId('kb-profiles').getByLabel('Marta').check();
  await expect(page.getByTestId('kb-note-pregnancy')).toContainText('consultá a tu médico antes de usar cualquier medicamento');
  await expect(page.getByTestId('kb-note-pregnancyNear')).toHaveCount(0);
  await expect(page.getByTestId('kb-why-bp_monitor-pregnancy')).toContainText('Marta');
  await expect(page.getByTestId('kb-why-thermometer-pregnancy')).toBeVisible();
  await page.getByTestId('kb-scenario-trek').click();
  await expect(page.getByTestId('kb-note-pregnancyNear')).toContainText('Marta');
  await page.getByTestId('kb-name').fill('Botiquín de la salida');
  await page.getByTestId('kb-create').click();
  await expect(page.getByRole('heading', { name: 'Botiquín de la salida' })).toBeVisible();
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/\\bMarta\\b/);
  expect(body.toLowerCase()).not.toContain('embaraz');
});

import { expect, test } from '@playwright/test';
import { cancelCount, fakeSpeech, spokenLines } from './fakeSpeech';
import { openContinent } from './countryPicker';

const PASSWORD = 'prueba-segura-123';

test('guía de primeros auxilios: lo primero, evaluación paso a paso y entorno', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // En Emergencias, la guía va antes de los botiquines.
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Emergencia', exact: true }).click();
  const links = await page.locator('main a').allTextContents();
  const guide = links.findIndex((x) => x.includes('Guías de primeros auxilios'));
  const kits = links.findIndex((x) => x.includes('Botiquines'));
  expect(guide).toBeGreaterThanOrEqual(0);
  expect(guide).toBeLessThan(kits);
  await page.getByRole('link', { name: /Guías de primeros auxilios/ }).click();

  // Primero, el resumen de lo importante.
  await expect(page.getByTestId('guide-first')).toContainText('Protegete');
  await expect(page.getByTestId('guide-first')).toContainText('RCP ya');

  // Evaluación: seguro → responde → sangra mucho → pierna → no para → torniquete.
  await page.getByRole('link', { name: 'Empezar evaluación' }).click();
  const node = page.getByTestId('guide-node');
  await expect(node).toContainText('¿El lugar es seguro?');
  // En el primer paso no hay a dónde volver.
  await expect(page.getByTestId('guide-back')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sí, es seguro' }).click();
  await page.getByRole('button', { name: 'Sí', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, sangra mucho' }).click();
  await expect(page.getByRole('heading', { level: 1 }).last()).toHaveText('Sangrado abundante');
  await expect(node).toContainText('Apretá directo sobre la herida');
  await expect(page.getByTestId('guide-calls').getByRole('link', { name: '107' })).toHaveAttribute('href', 'tel:107');
  await page.getByRole('button', { name: 'Brazo o pierna' }).click();
  await page.getByRole('button', { name: 'No, sigue saliendo en chorro o empapando' }).click();
  await expect(node).toContainText('Torniquete');
  await expect(node).toContainText('No lo aflojes ni lo saques');

  // «Volver al paso anterior» deshace la última respuesta (por si se eligió mal) y se puede volver a elegir.
  await page.getByTestId('guide-back').click();
  await expect(node).not.toContainText('No lo aflojes ni lo saques');
  await expect(page.getByRole('button', { name: 'No, sigue saliendo en chorro o empapando' })).toBeVisible();
  await page.getByTestId('guide-back').click();
  await expect(page.getByRole('button', { name: 'Brazo o pierna' })).toBeVisible();
  await page.getByRole('button', { name: 'Brazo o pierna' }).click();
  await page.getByRole('button', { name: 'No, sigue saliendo en chorro o empapando' }).click();
  await expect(node).toContainText('No lo aflojes ni lo saques');

  // Zona agreste: aparecen los pasos de evacuación y el acceso a Mi ubicación.
  await expect(node).not.toContainText('evacuación urgente');
  await page.getByRole('button', { name: 'Zona agreste' }).click();
  await expect(node).toContainText('Es una evacuación urgente');
  await expect(page.getByRole('link', { name: 'Mi ubicación (para el rescate)' })).toBeVisible();

  // Volver deshace el último paso.
  await page.getByRole('button', { name: 'Volver' }).first().click();
  await expect(page.getByRole('button', { name: 'Brazo o pierna' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sí, paró' })).toBeVisible();

  // Buscar una situación: mordedura de serpiente, con el Centro de Intoxicaciones.
  await page.goto('/#/first-aid/guides');
  await expect(page.getByRole('button', { name: 'Zona agreste' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByPlaceholder('Buscar: serpiente, quemadura, infarto…').fill('yarará');
  await expect(page.getByTestId('guide-topics').locator('li')).toHaveCount(1);
  await page.getByRole('link', { name: 'Mordedura de serpiente' }).click();
  await expect(node).toContainText('No hagas torniquete');
  await expect(page.getByTestId('guide-calls').getByRole('link', { name: '0800-333-0160' })).toBeVisible();
  await expect(node).toContainText('camilla');
});

test('guía de primeros auxilios: detectar ciudad o zona agreste con la ubicación, sin conexión', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // En la ciudad: la ayuda está a minutos.
  await context.setGeolocation({ latitude: -34.6037, longitude: -58.3816 });
  await page.goto('/#/first-aid/guides');
  await page.getByRole('button', { name: 'Zona agreste' }).click();
  await page.getByRole('button', { name: 'Detectar con mi ubicación' }).click();
  await expect(page.getByTestId('guide-detect')).toContainText('elegí Ciudad');
  await expect(page.getByRole('button', { name: 'Ciudad' })).toHaveAttribute('aria-pressed', 'true');

  // Sin conexión, en la Puna, lejos de todo: zona agreste (los datos vienen incluidos en la app).
  await context.setOffline(true);
  await context.setGeolocation({ latitude: -25.0, longitude: -67.6 });
  await page.getByRole('button', { name: 'Detectar con mi ubicación' }).click();
  await expect(page.getByTestId('guide-detect')).toContainText('elegí Zona agreste');
  await expect(page.getByRole('button', { name: 'Zona agreste' })).toHaveAttribute('aria-pressed', 'true');

  // Igual se puede cambiar a mano.
  await page.getByRole('button', { name: 'Ciudad' }).click();
  await expect(page.getByRole('button', { name: 'Ciudad' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('guide-detect')).toHaveCount(0);
  await context.setOffline(false);
});

test('números de emergencia y guía según el país: Chile y Uruguay', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // El país se elige en Ajustes (y también en Contactos y en la guía).
  await page.goto('/#/settings');
  await openContinent(page);
  await page.getByRole('group', { name: 'País' }).getByRole('button', { name: 'Chile', exact: true }).click();

  // Chile: números propios en Contactos.
  await page.goto('/#/first-aid/contacts');
  await openContinent(page);
  await expect(page.getByRole('group', { name: 'País' }).getByRole('button', { name: 'Chile', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const national = page.getByTestId('national-numbers');
  await expect(national).toContainText('Ambulancia (SAMU)');
  await expect(national.getByRole('link', { name: '131' })).toHaveAttribute('href', 'tel:131');
  await expect(national.getByRole('link', { name: '*4141' })).toHaveAttribute('href', 'tel:*4141');
  await expect(national).not.toContainText('Centro Nacional de Intoxicaciones');

  // La guía usa los números de Chile.
  await page.goto('/#/first-aid/guides/bleeding');
  await expect(page.getByTestId('guide-node')).toContainText('Llamá al 131 o al 133');
  await expect(page.getByTestId('guide-calls').getByRole('link', { name: '131' })).toBeVisible();

  // Uruguay: todo por el 911, sin repetir botones; el CIAT para intoxicaciones.
  await page.goto('/#/first-aid/guides');
  await openContinent(page);
  await page.getByRole('group', { name: 'País' }).getByRole('button', { name: 'Uruguay', exact: true }).click();
  await page.goto('/#/first-aid/guides/bleeding');
  await expect(page.getByTestId('guide-calls').getByRole('link', { name: '911' })).toHaveCount(1);
  await page.goto('/#/first-aid/guides/snakebite');
  await expect(page.getByTestId('guide-node')).toContainText('Llamá al CIAT (centro toxicológico)');
  await expect(page.getByTestId('guide-calls').getByRole('link', { name: '1722' })).toBeVisible();
});

test('paquete de Chile: se baja al elegir el país, queda guardado y da radio, cercanos y zona sin conexión', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -33.45, longitude: -70.66 });
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Al elegir Chile se baja el paquete en segundo plano y queda guardado en el dispositivo.
  await page.goto('/#/settings');
  await openContinent(page);
  await page.getByRole('group', { name: 'País' }).getByRole('button', { name: 'Chile', exact: true }).click();
  await expect
    .poll(() => page.evaluate(async () => !!(await (await caches.open('vikarg-country')).match(new URL('data/CL.json', location.href).href))), { timeout: 15_000 })
    .toBe(true);

  // Radio: la red de Bío-Bío, la emisora de Santiago.
  await page.goto('/#/first-aid/radio');
  await expect(page.getByRole('heading', { name: 'Radio con cobertura nacional más cercana' })).toBeVisible();
  await expect(page.getByTestId('radio-stations').locator('li').first()).toContainText('Radio Bío-Bío · Santiago');
  await expect(page.getByTestId('radio-stations').locator('li').first()).toContainText('FM 99,7');

  // Mi ubicación: el número de emergencias de Chile.
  await page.goto('/#/first-aid/location');
  await expect(page.getByRole('link', { name: 'Llamar al 133' })).toHaveAttribute('href', 'tel:133');
  // Abajo, salud y bomberos de Chile.
  await expect(page.getByRole('link', { name: 'Salud (ambulancia): 131' })).toHaveAttribute('href', 'tel:131');
  await expect(page.getByRole('link', { name: 'Bomberos: 132' })).toHaveAttribute('href', 'tel:132');

  // Sin conexión: cercanos con los datos guardados de Chile y detección de zona.
  await context.setOffline(true);
  await page.goto('/#/first-aid/contacts/nearby');
  await expect(page.getByTestId('nearby-status')).toContainText('datos de Chile guardados en el dispositivo');
  await page.goto('/#/first-aid/guides');
  await page.getByRole('button', { name: 'Detectar con mi ubicación' }).click();
  await expect(page.getByTestId('guide-detect')).toContainText('elegí Ciudad');
  await context.setOffline(false);
});

test('guía en voz alta: lee cada paso, se corta al llamar y se repite', async ({ page }) => {
  await fakeSpeech(page);
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  const spoken = () => spokenLines(page);
  const cancels = () => cancelCount(page);

  await page.goto('/#/first-aid/guides/assess');
  const toggle = page.getByRole('button', { name: 'Leer los pasos en voz alta' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await spoken()).toEqual([]);

  // Al activarlo lee el paso: título, instrucciones, pregunta y opciones.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(spoken).toContain('¿El lugar es seguro?');
  const first = await spoken();
  expect(first).toContain('¿Podés acercarte sin ponerte en peligro?');
  expect(first).toContain('Opciones, Sí, es seguro, No.');

  // Al elegir una respuesta, lee el paso siguiente.
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect.poll(spoken).toContain('No es seguro');

  // Tocar "llamar" corta la lectura enseguida, y no vuelve a leer sola.
  const before = await cancels();
  const read = (await spoken()).length;
  await page.getByTestId('guide-calls').getByRole('link', { name: '911' }).click();
  expect(await cancels()).toBeGreaterThan(before);
  await page.waitForTimeout(300);
  expect((await spoken()).length).toBe(read);

  // "Repetir" vuelve a leer el paso.
  await page.getByRole('button', { name: 'Repetir en voz alta' }).click();
  await expect.poll(async () => (await spoken()).length).toBeGreaterThan(read);

  // Queda guardado: al apagarlo se calla y no lee más.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const total = (await spoken()).length;
  await page.getByRole('button', { name: 'Ya es seguro' }).click();
  await page.waitForTimeout(300);
  expect((await spoken()).length).toBe(total);
});

test('guías MARCH (trauma grave) y mal de altura: se recorren paso a paso y llevan a las otras guías', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  const node = page.getByTestId('guide-node');
  await page.goto('/#/first-aid/guides/march');
  await expect(node).toContainText('MARCH es un orden para atender');
  await expect(node).toContainText('TCCC 2026');
  await page.getByRole('button', { name: /Empezar por M/ }).click();
  await expect(node).toContainText('Hemorragia masiva');
  await expect(node).toContainText('5 a 7 cm');
  await expect(node).toContainText('al menos 3 minutos');
  // Las dos posturas sobre el torniquete, con sus fuentes y fechas.
  await expect(node).toContainText('Manual del Ministerio de Salud 2016');
  await page.getByRole('button', { name: /Seguir con A/ }).click();
  await expect(node).toContainText('posición de recuperación');
  await expect(node).toContainText('solo para personal entrenado');
  await page.getByRole('button', { name: /Seguir con R/ }).click();
  await expect(node).toContainText('sello torácico ventilado');
  await page.getByRole('button', { name: /Seguir con C/ }).click();
  await page.getByRole('button', { name: /Seguir con H/ }).click();
  await page.getByRole('button', { name: 'Después de MARCH' }).click();
  await expect(node).toContainText('Repetí MARCH');

  // Mal de altura: lo leve se queda; con señales graves, bajar ya.
  await page.goto('/#/first-aid/guides/altitude');
  await expect(node).toContainText('No sigas subiendo con síntomas');
  await page.getByRole('button', { name: /Sí: confusión/ }).click();
  await expect(node).toContainText('Bajar de inmediato');
});

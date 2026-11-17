import { expect, test, type Page } from '@playwright/test';
import { cancelCount, fakeSpeech, spokenLines } from './fakeSpeech';

const PASSWORD = 'prueba-segura-123';
// Bariloche: hay cuartel en los datos oficiales y Radio Nacional (LRA 30).
const HERE = { latitude: -41.1335, longitude: -71.3103 };

test.use({ geolocation: HERE, permissions: ['geolocation'] });

async function setup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
}

async function mockOsm(page: Page) {
  const ctx = page.context();
  await ctx.route('https://overpass-api.de/**', async (route) => {
    const query = new URLSearchParams(route.request().postData() ?? '').get('data') ?? '';
    if (query.includes('amenity')) {
      // Búsqueda de cercanos: una comisaría con teléfono.
      await route.fulfill({
        json: { elements: [{ type: 'node', id: 1, lat: -41.135, lon: -71.305, tags: { amenity: 'police', name: 'Comisaría 28', phone: '+54 294 442 2030', 'addr:street': 'Mitre', 'addr:housenumber': '100' } }] },
      });
    } else {
      // Alrededores: calles, ruta y mojón.
      await route.fulfill({
        json: {
          elements: [
            { type: 'way', id: 2, center: { lat: -41.1336, lon: -71.3104 }, tags: { highway: 'residential', name: 'Moreno' } },
            { type: 'way', id: 3, center: { lat: -41.1337, lon: -71.31 }, tags: { highway: 'residential', name: 'Rolando' } },
            { type: 'way', id: 4, center: { lat: -41.134, lon: -71.311 }, tags: { highway: 'trunk', ref: 'RN 40' } },
            { type: 'node', id: 5, lat: -41.14, lon: -71.31, tags: { highway: 'milestone', distance: '1990' } },
          ],
        },
      });
    }
  });
  // El segundo servidor de Overpass se consulta a la vez: sin red en la prueba, falla y gana el primero.
  await ctx.route('https://maps.mail.ru/**', (route) => route.abort());
  await ctx.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ json: { address: { road: 'Mitre', house_number: '250', city: 'San Carlos de Bariloche', state: 'Río Negro' } } }),
  );
}

test('contactos: números nacionales, buscar cercanos (oficial + OpenStreetMap), guardar, editar y borrar', async ({ page, context }) => {
  await mockOsm(page);
  await setup(page);
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Emergencia', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Emergencias' })).toBeVisible();
  await page.getByRole('link', { name: /Contactos de emergencia/ }).click();

  // Números nacionales: tocar llama y se puede copiar.
  await expect(page.getByTestId('national-emergencies').getByRole('link', { name: '911' })).toHaveAttribute('href', 'tel:911');
  await expect(page.getByTestId('national-poison').getByRole('link', { name: '0800-333-0160' })).toHaveAttribute('href', 'tel:08003330160');
  await expect(page.getByTestId('national-same').getByRole('button', { name: 'Copiar 107' })).toBeVisible();

  // Cercanos: el cuartel oficial y la comisaría de OpenStreetMap.
  await page.getByRole('link', { name: 'Buscar cercanos' }).click();
  const list = page.getByTestId('nearby-list');
  await expect(list.getByText('Comisaría 28')).toBeVisible();
  await expect(list.getByText('Oficial').first()).toBeVisible();
  await page.getByRole('button', { name: 'Bomberos', exact: true }).click();
  await expect(list.getByText('Comisaría 28')).toHaveCount(0);
  await expect(list.locator('li').first()).toContainText('Bomberos');
  await page.getByRole('button', { name: 'Policía', exact: true }).click();
  const police = list.locator('li').filter({ hasText: 'Comisaría 28' });
  await expect(police.getByRole('link', { name: '+54 294 442 2030' })).toHaveAttribute('href', 'tel:+542944422030');
  // Tocar la dirección abre un cuadro con las opciones: ver acá (mapa o brújula), Google Maps u otra app.
  await police.getByTestId('place-options').click();
  const options = page.getByTestId('place-options-list');
  await expect(options.getByTestId('open-google-maps')).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=Mitre%20100/);
  await expect(options.getByTestId('open-other-app')).toHaveAttribute('href', /^geo:/);
  await expect(options.getByTestId('open-in-app-map')).toBeVisible();
  await options.getByTestId('open-in-app-map').click();
  await expect(page.getByTestId('guide-map')).toBeVisible();
  await page.goBack();
  await police.getByRole('button', { name: 'Guardar Comisaría 28 en mis contactos' }).click();
  await expect(police.getByLabel('Guardado en mis contactos')).toBeVisible();
  // La intendencia del Nahuel Huapi, con su teléfono, el 105 y las frecuencias que publica el parque.
  const office = list.locator('li').filter({ hasText: 'Intendencia · Parque Nacional Nahuel Huapi' });
  await expect(office.getByRole('link', { name: '0294 442-3111' })).toHaveAttribute('href', 'tel:02944423111');
  await expect(office.getByRole('link', { name: '105' })).toHaveAttribute('href', 'tel:105');
  await expect(office.getByTestId('park-radio')).toContainText('VHF 155,675 MHz');

  // Sin conexión: igual aparecen los datos oficiales.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await page.getByLabel('Hasta').selectOption({ label: '30 km' });
  await expect(page.getByTestId('nearby-status')).toContainText('Sin conexión: se muestran los datos oficiales');
  await expect(list.locator('li').first()).toBeVisible();
  // Zonas agrestes: rangos más grandes y "lo más cercano", esté a la distancia que esté (3 de cada tipo).
  await expect(page.getByLabel('Hasta').locator('option')).toHaveText(['5 km', '15 km', '30 km', '50 km', '100 km', '200 km', 'Lo más cercano (sin límite)']);
  await page.getByLabel('Hasta').selectOption({ label: 'Lo más cercano (sin límite)' });
  await page.getByRole('button', { name: 'Bomberos', exact: true }).click();
  await expect(list.locator('li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await context.setOffline(false);

  // La comisaría guardada va en "Servicios de emergencia cercanos", antes de Mis contactos; uno cargado a mano, en Mis contactos.
  await page.getByTestId('back').click();
  const services = page.getByTestId('my-services');
  await expect(services).toContainText('Comisaría 28');
  const order = await page.locator('h2').allTextContents();
  expect(order.indexOf('Servicios de emergencia cercanos')).toBeLessThan(order.indexOf('Mis contactos'));
  expect(order.indexOf('Servicios de emergencia cercanos')).toBeGreaterThan(-1);
  await expect(page.getByTestId('my-contacts')).toHaveCount(0);
  await page.getByRole('link', { name: 'Nuevo contacto' }).click();
  await page.getByLabel('Tipo').selectOption({ label: 'Otro' });
  await page.getByLabel('Nombre').fill('Dr. Pérez');
  await page.getByLabel('Teléfono', { exact: true }).fill('294 155 123456');
  await page.getByLabel('Dirección').fill('Moreno 50, Bariloche');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const mine = page.getByTestId('my-contacts');
  await expect(mine).toContainText('Dr. Pérez');
  await expect(mine.getByRole('link', { name: '294 155 123456' })).toHaveAttribute('href', 'tel:294155123456');

  // Editar y borrar.
  await page.getByRole('link', { name: 'Editar Dr. Pérez' }).click();
  await page.getByLabel('Notas').fill('Clínico de la familia');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(mine).toContainText('Clínico de la familia');
  await expect(mine).not.toContainText('Comisaría 28');
  await page.getByRole('link', { name: 'Editar Comisaría 28' }).click();
  await expect(page.getByText('Fuente: OpenStreetMap')).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(services).toHaveCount(0);
  await expect(page.getByText('Buscá los bomberos, comisarías, hospitales y ambulancias más cercanos')).toBeVisible();
});

test('mi ubicación para socorristas y radio', async ({ page }, testInfo) => {
  await fakeSpeech(page);
  await mockOsm(page);
  await setup(page);
  await page.goto('/#/first-aid/location');
  await expect(page.getByTestId('location-decimal')).toHaveText('-41.13350, -71.31030');
  // Abajo de todo, además del 911: salud (107) y bomberos (100) de Argentina.
  await expect(page.getByRole('link', { name: 'Salud (ambulancia): 107' })).toHaveAttribute('href', 'tel:107');
  await expect(page.getByRole('link', { name: 'Bomberos: 100' })).toHaveAttribute('href', 'tel:100');
  await expect(page.getByTestId('calls-country')).toHaveText('Números de Argentina, según tu ubicación.');
  await expect(page.getByTestId('location-dms')).toHaveText(/41°08′00(\.\d)?″ S 71°18′37(\.\d)?″ O/);
  const refs = page.getByTestId('location-refs');
  await expect(refs).toContainText('Mitre 250, San Carlos de Bariloche, Río Negro');
  await expect(refs).toContainText('Moreno y Rolando');
  await expect(refs).toContainText('RN 40 · cerca del km 1990');
  const msg = page.getByTestId('location-message');
  await expect(msg).toContainText('Necesito ayuda. Mi ubicación:');
  await expect(msg).toContainText('Coordenadas: -41.13350, -71.31030');
  // La dirección va antes que las coordenadas: es lo que más le sirve al socorrista.
  const text = (await msg.textContent()) ?? '';
  expect(text.indexOf('Mitre 250')).toBeGreaterThan(-1);
  expect(text.indexOf('Mitre 250')).toBeLessThan(text.indexOf('Coordenadas:'));
  await expect(msg).toContainText('Ruta RN 40 cerca del km 1990');
  await expect(msg).toContainText('https://www.google.com/maps/search/?api=1&query=-41.133500,-71.310300');
  await expect(page.getByRole('link', { name: 'Llamar al 911' })).toHaveAttribute('href', 'tel:911');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-19-location.png`, fullPage: true });

  // Leer el mensaje en voz alta: las coordenadas cifra por cifra, sin el link; "Llamar" lo corta.
  await page.getByRole('button', { name: 'Leer en voz alta' }).click();
  await expect.poll(() => spokenLines(page)).toContain('Coordenadas, 41 coma 1 3 3 5 0 grados sur, 71 coma 3 1 0 3 0 grados oeste. Precisión, 0 metros.');
  const read = await spokenLines(page);
  // Ninguna voz dice «dos puntos»: todo texto hablado llega sin «:».
  expect(read.some((l) => l.includes(':'))).toBe(false);
  expect(read[0]).toBe('Necesito ayuda. Mi ubicación.');
  expect(read.join(' ')).not.toContain('google.com');
  await expect(page.getByRole('button', { name: 'Dejar de leer' })).toBeVisible();
  const before = await cancelCount(page);
  await page.getByRole('link', { name: 'Llamar al 911' }).click();
  expect(await cancelCount(page)).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Leer en voz alta' })).toBeVisible();

  // Guardar este lugar como waypoint: llega el formulario con las coordenadas y la dirección.
  await page.getByRole('link', { name: 'Guardar como waypoint' }).click();
  await expect(page.getByRole('textbox', { name: 'Coordenadas' })).toHaveValue(/^-41\.13350*, -71\.31030*$/);
  await expect(page.getByLabel('Notas')).toHaveValue('Mitre 250, San Carlos de Bariloche, Río Negro');
  await page.getByLabel('Nombre').fill('Casa');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Casa' })).toBeVisible();
  await page.goto('/#/first-aid/location');
  await expect(page.getByTestId('location-waypoint')).toContainText('Casa');

  // Los números son los del país donde uno está, no los del país elegido: en Santiago, los de Chile.
  await page.context().setGeolocation({ latitude: -33.45, longitude: -70.66 });
  await page.goto('/#/');
  await page.goto('/#/first-aid/location');
  await expect(page.getByTestId('calls-country')).toHaveText('Números de Chile, según tu ubicación.');
  await expect(page.getByRole('link', { name: 'Llamar al 133' })).toHaveAttribute('href', 'tel:133');
  await expect(page.getByRole('link', { name: 'Salud (ambulancia): 131' })).toHaveAttribute('href', 'tel:131');
  await page.context().setGeolocation({ latitude: -41.1335, longitude: -71.3103 });

  await page.goto('/#/first-aid/radio');
  const stations = page.getByTestId('radio-stations');
  await expect(stations.locator('li').first()).toContainText('LRA 30 · San Carlos de Bariloche');
  await expect(stations.locator('li').first()).toContainText('AM 590');
  await expect(stations.locator('li').first()).toContainText('FM 95,5');
  await expect(page.getByText('156,800 MHz')).toBeVisible();
  // Montaña: las de Argentina y Chile juntas (en la cordillera se está a pocos km del otro país).
  const mountain = page.getByTestId('mountain-frequencies');
  await expect(mountain).toContainText('Argentina · FEM · emergencias en montaña');
  await expect(mountain).toContainText('140,970 MHz');
  await expect(mountain).toContainText('139,970 MHz');
  await expect(mountain).toContainText('Chile · Cuerpo de Socorro Andino');
  // Guardaparques, CONAF y Radio Club de Carabineros: solo con la vida en peligro.
  await expect(mountain).toContainText('Argentina · Guardaparques');
  await expect(mountain).toContainText('142,800 MHz');
  await expect(mountain).toContainText('Chile · CONAF (guardaparques de Chile)');
  await expect(mountain).toContainText('146,910 MHz');
  await expect(mountain.getByTestId('emergency-only')).toHaveCount(3);
  await expect(mountain.getByTestId('emergency-only').first()).toContainText('Solo si tu vida depende de eso');
  await expect(page.getByText(/No se incluyen las de Gendarmería ni policía/)).toBeVisible();
  // Bariloche está a 1,5 km del Parque Nacional Nahuel Huapi: sus frecuencias y teléfonos de emergencia.
  const park = page.getByTestId('park-section');
  await expect(park).toContainText('Parque Nacional Nahuel Huapi');
  await expect(park).toContainText('del límite');
  const here = park.getByTestId('park-here');
  await expect(here.getByTestId('park-radio')).toContainText('VHF 155,675 MHz');
  await expect(here.getByTestId('park-radio')).toContainText('Club Andino Bariloche');
  await expect(here.getByRole('link', { name: '105' })).toHaveAttribute('href', 'tel:105');
  // Los otros parques que publican frecuencia, de los dos países (Chile: Torres del Paine, CONAF 143,800).
  // Los otros parques con frecuencia, solo a menos de 50 km del límite: Los Arrayanes (39 km) sí; Lanín (54 km) y Torres del Paine, no.
  const others = park.getByTestId('park-others');
  await expect(others).toContainText('Parque Nacional Los Arrayanes');
  await expect(others).not.toContainText('Parque Nacional Lanín');
  await expect(others).not.toContainText('Torres del Paine');
  await expect(mountain).toContainText('CONAF publica la 143,800 MHz');

  // Con el lugar cambiado a mano, se recalcula con esa coordenada.
  // Mendoza capital: a 101 km de Chile, solo las argentinas; ningún parque con frecuencia cerca.
  await page.getByLabel('Lugar', { exact: true }).selectOption({ label: 'Escribir coordenadas…' });
  await page.getByLabel('Coordenadas', { exact: true }).fill('-32.89, -68.84');
  await expect(mountain).toContainText('Argentina · FEM · emergencias en montaña');
  await expect(mountain).not.toContainText('Chile ·');
  await expect(page.getByRole('heading', { name: 'Frecuencias de montaña', exact: true })).toBeVisible();
  await expect(page.getByTestId('park-section')).toHaveCount(0);
  // Puerto Natales (Chile, a 17 km de Argentina): las de los dos países; Torres del Paine (62 km) no, Kawésqar (28 km) sí.
  await page.getByLabel('Coordenadas', { exact: true }).fill('-51.73, -72.51');
  await expect(mountain).toContainText('Chile · CONAF (guardaparques de Chile)');
  await expect(mountain).toContainText('Argentina · FEM');
  await expect(page.getByTestId('park-others')).toContainText('Parque Nacional Kawésqar');
  await expect(page.getByTestId('park-section')).not.toContainText('Torres del Paine');
  // Lago Pehoé, adentro de Torres del Paine: el parque con la 143,800 de CONAF.
  await page.getByLabel('Coordenadas', { exact: true }).fill('-50.94, -72.97');
  await expect(page.getByTestId('park-here')).toContainText('Parque Nacional Torres del Paine · estás adentro');
  await expect(page.getByTestId('park-here')).toContainText('VHF 143,800 MHz');
  // Santiago: a 60 km de Argentina, solo las chilenas.
  await page.getByLabel('Coordenadas', { exact: true }).fill('-33.45, -70.66');
  await expect(mountain).toContainText('Chile · Cuerpo de Socorro Andino');
  await expect(mountain).not.toContainText('Argentina ·');
  await page.getByLabel('Lugar', { exact: true }).selectOption({ label: 'Mi ubicación (GPS)' });
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-20-radio-park.png`, fullPage: true });

  // Una frecuencia que me dieron en el refugio, con el lugar donde estoy.
  await page.getByRole('link', { name: 'Agregar frecuencia' }).click();
  await page.getByLabel('Nombre').fill('Refugio Frey');
  await page.getByLabel('Frecuencia', { exact: true }).fill('147,450 MHz');
  await page.getByLabel('Tono, canal u otro dato (opcional)').fill('tono 88,5 Hz');
  await page.getByLabel('Notas').fill('Escuchan de 8 a 20 h');
  await page.getByRole('button', { name: 'Usar mi ubicación actual' }).click();
  await expect(page.getByTestId('freq-place')).toContainText('41°08′');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const mine = page.getByTestId('my-frequencies');
  await expect(mine).toContainText('Refugio Frey');
  await expect(mine).toContainText('147,450 MHz');
  await expect(mine).toContainText('tono 88,5 Hz · a 0 m');
  await expect(mine).toContainText('Escuchan de 8 a 20 h');
  // No se mezcla con los contactos.
  await page.goto('/#/first-aid/contacts');
  await expect(page.getByText(/^Todavía no guardaste contactos/)).toBeVisible();
  // Editar.
  await page.goto('/#/first-aid/radio');
  await page.getByRole('link', { name: 'Editar Refugio Frey' }).click();
  await page.getByLabel('Frecuencia', { exact: true }).fill('147,460 MHz');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('my-frequencies')).toContainText('147,460 MHz');

  // Repetidoras: un CSV con ubicación (estilo RepeaterBook) se ordena por cercanía.
  const csv = [
    'Output Freq,Input Freq,Offset,Uplink Tone,Call,Location,Lat,Long,Op Status,Mode',
    '146.970,146.370,-0.600,100.0,LU2FCF,Rosario,-32.9468,-60.6393,On-Air,FM',
    '147.120,147.720,+0.600,123.0,LU8VCB,Bariloche,-41.14,-71.30,On-Air,FM',
    '438.500,433.500,-5.000,,LU5VAS,Esquel,-42.91,-71.32,Off-Air,DMR',
  ].join('\n');
  await page.getByTestId('repeaters-file').setInputFiles({ name: 'repeaterbook.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByTestId('repeaters-message')).toHaveText('Se importaron 3 repetidoras.');
  const rpt = page.getByTestId('repeaters').locator('li');
  await expect(rpt.nth(0)).toContainText('LU8VCB · Bariloche');
  const details = rpt.nth(0).getByTestId('rpt-details');
  await expect(details).toContainText('Escuchás en 147,120 MHz');
  await expect(details).toContainText('Transmitís en 147,720 MHz (+0,6 MHz)');
  await expect(details).toContainText('Subtono para abrirla: 123,0 Hz (CTCSS)');
  // Chile: el listado oficial de SUBTEL; desde Bariloche entran las del otro lado de la cordillera (menos de 150 km).
  await expect(page.getByTestId('repeaters-official')).toContainText('Incluye 7 del listado oficial de repetidoras de SUBTEL (Chile)');
  await expect(rpt.nth(1)).toContainText('CE7RCM RPT-B · Volcan Osorno, Puerto Varas');
  await expect(rpt.nth(1).getByTestId('rpt-official')).toContainText(/Radio Club Melipulli · licencia hasta el/);
  await expect(rpt.nth(1).getByTestId('rpt-distance')).toHaveText(/^10\d km$/);
  const esquel = rpt.filter({ hasText: 'LU5VAS' });
  const rosario = rpt.filter({ hasText: 'LU2FCF' });
  await expect(esquel.getByTestId('rpt-details')).toContainText('Modo digital');
  await page.getByText('¿Qué significa cada dato?').click();
  await expect(page.getByText(/Un tono grave que tu equipo manda/)).toBeVisible();
  // La distancia, siempre en km.
  await expect(rpt.nth(0).getByTestId('rpt-distance')).toHaveText(/^\d,\d km$/);
  await expect(rosario.getByTestId('rpt-distance')).toHaveText(/^\d{4} km$/);
  await expect(esquel).toContainText('LU5VAS · Esquel');
  await expect(esquel).toContainText('fuera de servicio');
  await expect(rpt.nth(9)).toContainText('LU2FCF · Rosario');

  // La exportación CSV de RepeaterBook no trae coordenadas: se ubica por la localidad (aproximada);
  // la que no se encuentra va al final, sin distancia.
  const noCoords = [
    'Output Freq,Input Freq,Offset,Uplink Tone,Downlink Tone,Call,"Location",County,State,Modes,Digital Access',
    '145.21000,144.610000,,88.5,,LU7DOT,"Mar del Plata - Faro",,Argentina,FM ,',
    '145.39000,144.790000,,,,LU9XYZ,"Paraje Inexistente",,Argentina,FM ,',
  ].join('\n');
  await page.getByTestId('repeaters-file').setInputFiles({ name: 'RB_2610311757.csv.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from(noCoords) });
  await expect(page.getByTestId('repeaters-message')).toContainText('de 1 no se encontró la localidad');
  await expect(page.getByTestId('repeaters-message')).toContainText('1 venía sin coordenadas');
  await expect(rpt).toHaveCount(12);
  const mdp = rpt.filter({ hasText: 'LU7DOT' });
  await expect(mdp.getByTestId('rpt-distance')).toHaveText(/^≈ 1\.?\d{3} km$/);
  await expect(mdp).toContainText('Ubicación aproximada: centro de Mar del Plata, Buenos Aires');
  await expect(rpt.last()).toContainText('LU9XYZ');
  await expect(rpt.last().getByTestId('rpt-distance')).toHaveText('sin ubicación');

  // Siguen ahí al volver (guardadas en el dispositivo) y se pueden borrar.
  await page.goto('/#/first-aid');
  await page.goto('/#/first-aid/radio');
  await expect(rpt).toHaveCount(12);
  await page.getByRole('button', { name: 'Borrar las importadas' }).click();
  await page.getByTestId('confirm-ok').click();
  // Se borran las importadas; las del listado oficial siguen.
  await expect(rpt).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Borrar las importadas' })).toHaveCount(0);

  // Leyenda de radioaficionados según el país (Argentina: ENACOM).
  await expect(page.getByTestId('ham-license')).toContainText('En Argentina la licencia la da ENACOM');
  // Avisar que una repetidora no funciona: abre el formulario con los datos ya escritos.
  await rpt.nth(0).getByRole('link', { name: 'Avisar que no funciona o tiene datos mal' }).click();
  const box = page.getByLabel('Mensaje', { exact: true });
  await expect(box).toHaveValue(/Repetidora en desuso o con datos mal:\nCE7RCM RPT-B · 146,820 MHz/);
  await expect(box).toHaveValue(/Fuente: listado oficial de SUBTEL \(Chile\) al 26\/10\/2026/);
});

test('un aviso se da por leído con «Entendido», no vuelve y Ajustes lo trae de nuevo', async ({ page }) => {
  await setup(page);
  await page.goto('/#/first-aid/radio');
  await expect(page.getByTestId('ham-license')).toBeVisible();
  await page.locator('section', { has: page.getByTestId('ham-license') }).getByTestId('notice-dismiss').click();
  await expect(page.getByTestId('ham-license')).toHaveCount(0);

  // Otro aviso de la misma pantalla (el de seguridad) sigue ahí: cada uno se oculta por separado.
  await expect(page.locator('[data-notice="radio.security"]')).toBeVisible();

  // Sigue oculto al volver a entrar a la pantalla.
  await page.goto('/#/first-aid');
  await page.goto('/#/first-aid/radio');
  await expect(page.getByRole('heading', { name: 'Radioaficionados', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('ham-license')).toHaveCount(0);

  // Ajustes cuenta los ocultos y los trae de nuevo.
  await page.goto('/#/settings');
  await expect(page.getByTestId('notices-section')).toContainText('Avisos ocultos: 1');
  await page.getByTestId('notices-restore').click();
  await expect(page.getByTestId('notices-section')).toHaveCount(0);
  await page.goto('/#/first-aid/radio');
  await expect(page.getByTestId('ham-license')).toBeVisible();
});

test('buscar cercanos: Salud y Vehículos con sus opciones, estaciones de servicio con bandera y combustibles', async ({ page }) => {
  await mockOsm(page);
  await setup(page);
  await page.goto('/#/first-aid/contacts/nearby');
  const list = page.getByTestId('nearby-list');
  const subfilters = page.getByTestId('nearby-subfilters');
  await expect(list.getByText('Comisaría 28')).toBeVisible();
  // "Todo" son los servicios de emergencia: las estaciones no aparecen, y no hay opciones.
  await expect(list.getByText('Nafta')).toHaveCount(0);
  await expect(subfilters).toHaveCount(0);
  // Salud: arranca en hospitales y centros de atención; tiene farmacias, DEA y veterinarias.
  await page.getByRole('button', { name: 'Salud', exact: true }).click();
  await expect(subfilters.getByRole('button')).toHaveText(['Hospitales y centros de atención', 'Farmacias', 'Desfibriladores (DEA)', 'Veterinarias']);
  await expect(subfilters.getByRole('button', { name: 'Hospitales y centros de atención' })).toHaveAttribute('aria-pressed', 'true');
  // Vehículos: arranca en estaciones de servicio; tiene gomerías y talleres.
  await page.getByRole('button', { name: 'Vehículos', exact: true }).click();
  await expect(subfilters.getByRole('button')).toHaveText(['Estaciones de servicio', 'Gomerías', 'Talleres mecánicos']);
  await expect(subfilters.getByRole('button', { name: 'Estaciones de servicio' })).toHaveAttribute('aria-pressed', 'true');
  await expect(list.getByText('Comisaría 28')).toHaveCount(0);
  // En Bariloche hay estaciones del listado oficial de la Secretaría de Energía.
  const first = list.locator('li').first();
  await expect(first).toContainText('Oficial');
  await expect(first).toContainText('Nafta');
  await first.getByRole('button', { name: /^Guardar .* en mis contactos$/ }).click();
  await expect(first.getByLabel('Guardado en mis contactos')).toBeVisible();
  // Refugios: en Bariloche hay de montaña (OpenStreetMap, guardado para usar sin conexión).
  await page.getByRole('button', { name: 'Refugios', exact: true }).click();
  await expect(subfilters).toHaveCount(0);
  await page.getByLabel('Hasta').selectOption({ label: '30 km' });
  await expect(list.locator('li').first()).toContainText(/Refugio|Vivac/);
  await page.getByRole('button', { name: 'Vehículos', exact: true }).click();
  await page.getByLabel('Hasta').selectOption({ label: '15 km' });

  // Los resultados en el mapa (en lugar de la lista) y de vuelta a la lista.
  await page.getByTestId('nearby-map-toggle').click();
  await expect(page.getByTestId('nearby-map')).toBeVisible();
  await expect(list).toHaveCount(0);
  await expect(page.getByTestId('nearby-map-toggle')).toHaveText('Ver como lista');
  await page.getByTestId('nearby-map-toggle').click();
  await expect(list.locator('li').first()).toBeVisible();
});

test('buscar cercanos: Náutica con sus tipos, que se pueden sacar y poner para ver solo lo que sirve', async ({ page }) => {
  await mockOsm(page);
  // Lo náutico que devuelve OpenStreetMap cerca de Bariloche (la consulta de Náutica pide `leisure=marina`).
  await page.context().route('https://overpass-api.de/**', async (route) => {
    const query = new URLSearchParams(route.request().postData() ?? '').get('data') ?? '';
    if (!query.includes('"leisure"="marina"')) return route.fallback();
    await route.fulfill({
      json: {
        elements: [
          { type: 'node', id: 11, lat: -41.136, lon: -71.306, tags: { leisure: 'marina', name: 'Club Náutico Nahuel' } },
          { type: 'node', id: 12, lat: -41.15, lon: -71.32, tags: { leisure: 'slipway' } },
          { type: 'node', id: 13, lat: -41.16, lon: -71.33, tags: { mooring: 'buoy', name: 'Boya del Moreno' } },
          { type: 'node', id: 14, lat: -41.17, lon: -71.34, tags: { man_made: 'pier', name: 'Muelle Viejo' } },
          { type: 'node', id: 15, lat: -41.18, lon: -71.35, tags: { waterway: 'fuel', name: 'Surtidor del Lago' } },
        ],
      },
    });
  });
  await setup(page);
  await page.goto('/#/first-aid/contacts/nearby');
  const list = page.getByTestId('nearby-list');
  await page.getByRole('button', { name: 'Náutica', exact: true }).click();
  const types = page.getByTestId('nautical-types');
  await expect(types.getByRole('button')).toHaveCount(8);
  // Al empezar están todos puestos.
  for (const id of ['fuel', 'marina', 'slipway', 'storage', 'rental', 'shop', 'mooring', 'pier']) {
    await expect(page.getByTestId(`nautical-type-${id}`)).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(list.getByText('Club Náutico Nahuel')).toBeVisible();
  await expect(list.getByText('Boya del Moreno')).toBeVisible();
  await expect(list.getByText('Muelle Viejo')).toBeVisible();
  await expect(list.getByText('Surtidor del Lago')).toBeVisible();
  await expect(page.getByTestId('nautical-type-marina')).toContainText(/Marinas \([1-9]\d*\)/);
  await expect(list.getByText('Confirmá que sea de uso público').first()).toBeVisible();
  // Sacar un tipo lo saca de la lista; los demás siguen.
  await page.getByTestId('nautical-type-marina').click();
  await expect(page.getByTestId('nautical-type-marina')).toHaveAttribute('aria-pressed', 'false');
  await expect(list.getByText('Club Náutico Nahuel')).toHaveCount(0);
  await expect(list.getByText('Boya del Moreno')).toBeVisible();
  // Solo amarras: se sacan los demás.
  for (const id of ['fuel', 'slipway', 'storage', 'rental', 'shop', 'pier']) await page.getByTestId(`nautical-type-${id}`).click();
  await expect(list.getByText('Boya del Moreno')).toBeVisible();
  await expect(list.getByText('Muelle Viejo')).toHaveCount(0);
  await expect(list.getByText('Surtidor del Lago')).toHaveCount(0);
  // Sin ningún tipo: aviso y lista vacía.
  await page.getByTestId('nautical-type-mooring').click();
  await expect(page.getByTestId('nautical-none')).toBeVisible();
  await expect(list.getByText('Boya del Moreno')).toHaveCount(0);
  // Volver a poner uno lo trae de nuevo.
  await page.getByTestId('nautical-type-pier').click();
  await expect(list.getByText('Muelle Viejo')).toBeVisible();
  await expect(page.getByTestId('nautical-none')).toHaveCount(0);
});

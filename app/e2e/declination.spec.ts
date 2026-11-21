import { magvar } from 'magvar';
import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';
const HERE = { latitude: -34.603722, longitude: -58.381592 };

test.use({ geolocation: HERE, permissions: ['geolocation'] });

test('declinómetro: lugar, cambio anual, convertir rumbos, mapa viejo y machete', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // En Orientación, después de la brújula.
  await page.getByRole('link', { name: 'Orientación', exact: true }).click();
  await page.getByRole('link', { name: /Declinómetro/ }).click();
  await expect(page.getByRole('heading', { name: 'Declinómetro' })).toBeVisible();

  // Con el GPS (Buenos Aires): Oeste, con grados y minutos, y el cambio anual hacia el Oeste.
  const expected = magvar(HERE.latitude, HERE.longitude, 0, new Date());
  const value = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(expected));
  await expect(page.getByTestId('decl-value')).toContainText(`${value}° Oeste`);
  await expect(page.getByTestId('decl-annual')).toHaveText(/Cambia unos \d+,\d′ por año hacia el Oeste/);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-70-declination.png`, fullPage: true });

  // Convertir: de la brújula al mapa (Oeste se resta) y del mapa a la brújula (Oeste se suma).
  await page.getByLabel('Rumbo magnético (el que marca la brújula), en grados').fill('120');
  const toTrue = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(120 + expected);
  await expect(page.getByTestId('decl-converted')).toHaveText(`120° magnético − ${value}° = ${toTrue}° geográfico`);
  await page.getByRole('button', { name: 'Mapa → brújula' }).click();
  await page.getByLabel('Rumbo geográfico (medido en el mapa), en grados').fill('45');
  await expect(page.getByTestId('decl-converted')).toContainText(`45° geográfico + ${value}° =`);

  // Mapa viejo: 1990, 5° Oeste, 8′ por año al Oeste → unos 9,8° Oeste hoy, y lo compara con el modelo.
  await page.getByLabel('Año de la declinación del mapa').fill('1990');
  // Con signo: "+3" elige Este y "−5" Oeste, solos (Este +, Oeste −).
  await page.getByLabel('Declinación del mapa (grados)').fill('+3');
  await expect(page.getByRole('button', { name: 'Este (+)' }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Declinación del mapa (grados)').fill('−5');
  await expect(page.getByRole('button', { name: 'Oeste (−)' }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Variación anual (minutos ′)').fill('8');
  await expect(page.getByTestId('decl-map-today')).toContainText(/Hoy sería unos \d+,\d° Oeste/);
  await expect(page.getByTestId('decl-map-today')).toContainText('El modelo da');

  // Otro lugar: coordenadas a mano en Bariloche (Este).
  await page.getByLabel('Lugar', { exact: true }).selectOption({ label: 'Escribir coordenadas…' });
  await page.getByLabel('Coordenadas', { exact: true }).fill('-41.1335, -71.3103');
  await expect(page.getByTestId('decl-value')).toContainText('° Este');

  // Machete.
  await page.getByTestId('decl-cheat-toggle').click();
  const cheat = page.getByTestId('decl-cheat');
  await expect(cheat).toContainText('Geográfico = Magnético + Declinación');
  await expect(cheat).toContainText('De la brújula al mapa (magnético → geográfico): Este se suma, Oeste se resta.');
  await expect(page.getByTestId('decl-gmer')).toContainText('De Geográfico a Magnético, el Este Resta');

  // Desde la brújula se llega al declinómetro.
  await page.goto('/#/orientation/compass');
  await page.getByTestId('compass-advanced').getByText('Norte verdadero o magnético').click();
  await page.getByRole('link', { name: /Más en el Declinómetro/ }).click();
  await expect(page.getByRole('heading', { name: 'Declinómetro' })).toBeVisible();
});

import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('acerca de: versión, reportar un problema o sugerencia y cafecito', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // Al final del Inicio, y también desde Ajustes.
  await page.getByRole('link', { name: /Acerca de, reportar un problema y contacto/ }).click();
  await expect(page.getByRole('heading', { name: 'Acerca de' })).toBeVisible();
  await expect(page.getByTestId('about-version')).toHaveText(/^Versión \d+\.\d+\.\d+/);
  // Privacidad: dice qué guarda el servidor y cómo borrarlo.
  const privacy = page.getByTestId('about-privacy');
  await expect(privacy).toContainText('quedan cifrados en tu dispositivo');
  await expect(privacy).toContainText('redondeados a 1 km');
  await expect(privacy.getByRole('link', { name: 'Para borrar todo lo que el servidor tiene de vos: Ajustes → Eliminar mi cuenta.' })).toHaveAttribute('href', '#/settings');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-81-about-privacy.png`, fullPage: true });

  // Reportar: sin mensaje no se puede enviar; con mensaje arma el issue con la versión.
  const github = page.getByTestId('about-github');
  await expect(github).toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel('Mensaje', { exact: true }).fill('El mapa no carga sin conexión');
  await expect(github).toHaveAttribute('aria-disabled', 'false');
  const href = (await github.getAttribute('href'))!;
  const url = new URL(href);
  expect(url.origin + url.pathname).toBe('https://github.com/mazzalaialan/SurvTools/issues/new');
  expect(url.searchParams.get('title')).toBe('Problema: El mapa no carga sin conexión');
  expect(url.searchParams.get('labels')).toBe('bug');
  expect(url.searchParams.get('body')).toContain('VikArg ');

  // Sugerencia, sin datos del dispositivo.
  await page.getByRole('button', { name: 'Sugerencia' }).click();
  await page.getByLabel('Incluir la versión y datos técnicos del dispositivo (nada personal)').uncheck();
  await expect(page.getByTestId('about-info')).toHaveCount(0);
  const idea = new URL((await github.getAttribute('href'))!);
  expect(idea.searchParams.get('labels')).toBe('enhancement');
  expect(idea.searchParams.get('body')).not.toContain('VikArg ');

  // Cafecito.
  await expect(page.getByTestId('about-cafecito')).toHaveAttribute('href', 'https://cafecito.app/vikarg');
  // Mercado Pago.
  await expect(page.getByTestId('about-mercadopago')).toHaveAttribute('href', 'https://link.mercadopago.com.ar/vikarg');

  await page.goto('/#/settings');
  await expect(page.getByRole('link', { name: 'Acerca de, reportar un problema y contacto' })).toBeVisible();
});

test('licencias y créditos: licencia de la app, fuentes de datos y componentes de terceros con su texto', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  await page.goto('/#/about');
  await page.getByTestId('about-licenses').click();
  await expect(page.getByRole('heading', { name: 'Licencias y créditos' })).toBeVisible();
  // Licencia de la app con el enlace al código.
  await expect(page.getByTestId('lic-app-license')).toContainText('GPL-3.0-or-later');
  await expect(page.getByTestId('lic-source')).toHaveAttribute('href', /github\.com/);
  // Fuentes de datos con su licencia.
  await expect(page.getByTestId('credit-map')).toContainText('ODbL');
  await expect(page.getByTestId('credit-weather')).toContainText('Open-Meteo');
  // Aviso legal del SMN (obligatorio donde se muestran datos del SMN).
  await expect(page.getByTestId('licenses')).toContainText('Servicio Meteorológico Nacional (SMN)');
  // Aviso de la MPL-2.0 de los plugins de la app nativa: dónde está su código fuente.
  const mpl = page.getByTestId('lic-mpl');
  await expect(mpl).toContainText('Mozilla Public License 2.0');
  await expect(mpl).toContainText('@capgo/background-geolocation');
  await expect(mpl).toContainText('@capgo/capacitor-barometer');
  await expect(mpl.getByRole('link', { name: 'Código fuente' }).first()).toHaveAttribute('href', /github\.com\/Cap-go\//);
  // Una dirección que no existe vuelve al Inicio (no la pantalla de error por defecto del router).
  await page.goto('/#/esta-ruta-no-existe');
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();
  await expect(page.getByText('Hey developer')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/$/);
  await page.goBack();
  // Componentes de terceros, cargados aparte, con el texto de cada licencia.
  const deps = page.getByTestId('lic-deps');
  await expect(deps.locator('li').first()).toBeVisible();
  await expect(deps).toContainText('react');
  await expect(deps).toContainText('maplibre-gl');
  const row = deps.locator('li', { hasText: 'zustand' }).first();
  await row.getByRole('button', { name: 'Ver licencia' }).click();
  await expect(row.locator('pre')).toContainText(/Permission is hereby granted|MIT/);
  await row.getByRole('button', { name: 'Ocultar' }).click();
  await expect(row.locator('pre')).toHaveCount(0);
});

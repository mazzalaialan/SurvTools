import { expect, test } from '@playwright/test';

const PASSWORD = 'prueba-segura-123';

test('cabuyería: buscar por uso (rappel → Machard), ficha, práctica, aprendido, asistente y glosario; volver atrás', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repetir contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear bóveda' }).click();
  await page.getByLabel('Ya la anoté en un lugar seguro').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('link', { name: 'Inicio' })).toBeVisible();

  // En Inicio, Cabuyería va antes de Huerta.
  const titles = await page.locator('h2.section-title').allTextContents();
  expect(titles.indexOf('Cabuyería y anclajes')).toBeGreaterThan(-1);
  expect(titles.indexOf('Cabuyería y anclajes')).toBeLessThan(titles.indexOf('Huerta y cultivo'));

  await page.getByRole('link', { name: /Guía de nudos/ }).click();
  await expect(page.getByTestId('knots-progress')).toHaveText('Aprendiste 0 de 50 nudos.');
  // Apenas se entra a la Guía, justo debajo del título: aviso de beta bien visible y sin botón para ocultarlo.
  const guideBeta = page.getByTestId('guide-beta');
  await expect(guideBeta).toBeVisible();
  await expect(guideBeta).toContainText('BETA');
  await expect(guideBeta).toContainText('Opción beta, en desarrollo');
  await expect(guideBeta).toContainText('Todavía no los revisó una persona');
  await expect(guideBeta.getByRole('button')).toHaveCount(0);
  const titleBox = await page.getByRole('heading', { level: 1 }).first().boundingBox();
  const betaBox = await guideBeta.boundingBox();
  expect(betaBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height - 1);
  expect(betaBox!.y - (titleBox!.y + titleBox!.height)).toBeLessThan(80);
  await page.getByRole('button', { name: 'Rappel y escalada' }).click();
  await expect(page.getByText(/practicá primero con un instructor/)).toBeVisible();
  const list = page.getByTestId('knot-list');
  await expect(list).toContainText('Machard');
  await expect(list).not.toContainText('Atadura cuadrada');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-50-knots.png`, fullPage: true });

  // Búsqueda por otro nombre.
  await page.getByLabel('Buscar un nudo').fill('marchand');
  await expect(list.getByRole('link')).toHaveCount(1);
  await list.getByRole('link', { name: /Machard/ }).click();
  await expect(page.getByRole('heading', { name: /Machard/ })).toBeVisible();
  await expect(page.getByTestId('knot-safety')).toBeVisible();
  await expect(page.getByTestId('knot-credits')).toContainText('CC BY-SA');
  await expect(page.getByTestId('knot-credits')).toContainText('Diagramas propios de VikArg');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-51-knot.png`, fullPage: true });

  // El paso a paso de la ficha también avisa que es una opción beta con posibles errores.
  await expect(page.getByTestId('steps-beta')).toContainText('Opción beta, en desarrollo');

  // Práctica paso a paso.
  await page.getByTestId('knot-practice-start').click();
  const practice = page.getByTestId('knot-practice');
  await expect(practice).toContainText('Paso 1 de 4');
  await expect(practice.getByTestId('practice-beta')).toContainText('Opción beta, en desarrollo');
  await page.getByTestId('practice-next').click();
  await expect(practice).toContainText('Paso 2 de 4');
  // Cada paso con su diagrama propio, que carga sin conexión desde el paquete de la app.
  const fig = practice.getByTestId('practice-figure');
  await expect(fig).toHaveAttribute('data-src', 'pasos/machard-2.svg');
  // El SVG va dentro de la página, con el fondo del tema (oscuro por defecto).
  await expect(fig.locator('svg')).toBeVisible();
  await expect.poll(() => fig.evaluate((el) => getComputedStyle(el).getPropertyValue('--kd-bg').trim())).toBe('#243243');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-52-knot-practice.png` });
  await practice.getByRole('button', { name: 'Cerrar' }).click();
  await expect(practice).toHaveCount(0);

  // Aprendido, y vuelve a la lista filtrada.
  await page.getByTestId('knot-learned').click();
  await expect(page.getByTestId('knot-learned')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('knots-progress')).toHaveText('Aprendiste 1 de 50 nudos.');

  // Asistente: unir dos cuerdas de distinto grosor → vuelta de escota.
  await page.getByText('¿Qué necesito hacer?').click();
  await page.getByRole('button', { name: 'Unir dos cuerdas o cintas' }).click();
  await expect(page.getByTestId('wizard-options')).toContainText('De distinto grosor');
  await page.getByTestId('wizard-options').getByRole('link', { name: 'Vuelta de escota (doble)' }).click();
  await expect(page.getByRole('heading', { name: 'Vuelta de escota (doble)' })).toBeVisible();

  // Corredizos: buscar "corredizo" trae los tres; el lazo advierte que nunca alrededor de una persona.
  await page.goto('/#/knots/guide');
  await page.getByLabel('Buscar un nudo').fill('corredizo');
  const list2 = page.getByTestId('knot-list');
  await expect(list2.getByRole('link')).toHaveCount(3);
  await expect(list2).toContainText('Nudo corredizo (lazo)');
  await expect(list2).toContainText('As de guía corredizo');
  await expect(list2).toContainText('Nudo de escape (simple corredizo)');
  await list2.getByRole('link', { name: /Nudo corredizo \(lazo\)/ }).click();
  await expect(page.getByRole('heading', { name: 'Nudo corredizo (lazo)' })).toBeVisible();
  await expect(page.getByText(/Nunca alrededor del cuello ni del cuerpo de una persona/)).toBeVisible();
  await expect(page.getByTestId('knot-credits')).toContainText('USCG');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-53-noose.png`, fullPage: true });

  // Anclajes: el árbol con el diámetro explícito, y desde la ficha del nudo a sus anclajes.
  await page.goto('/#/knots/anchors');
  await expect(page.getByTestId('anchors-natural')).toContainText('Árbol');
  await page.getByRole('link', { name: /^Árbol/ }).click();
  await expect(page.getByTestId('anchor-steps')).toContainText('20 cm de diámetro');
  await expect(page.getByTestId('anchor-safety')).toBeVisible();
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-52-anchor.png`, fullPage: true });
  await page.getByRole('link', { name: 'Ocho doble (para encordarse)' }).click();
  await expect(page.getByTestId('knot-anchors')).toContainText('Árbol');
  await page.goto('/#/knots/anchors/angulos');
  await expect(page.getByRole('cell', { name: '574 %' })).toBeVisible();

  // Anclajes nuevos: polipasto (figura del manual) y línea de techo (dibujo propio), con sus imágenes.
  await page.goto('/#/knots/anchors/polipasto');
  await expect(page.getByRole('heading', { name: 'Polipasto 3:1 ("Z")' })).toBeVisible();
  await expect(page.locator('img[src$="polipasto.webp"]')).toBeVisible();
  await page.goto('/#/knots/anchors/techo-lona');
  await expect(page.locator('img[src$="techo-lona.webp"]')).toBeVisible();
  await expect(page.evaluate(() => (document.querySelector('img[src$="techo-lona.webp"]') as HTMLImageElement).naturalWidth)).resolves.toBeGreaterThan(0);
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-54-ridgeline.png`, fullPage: true });
  // Nudos nuevos en la búsqueda.
  await page.goto('/#/knots/guide');
  await page.getByLabel('Buscar un nudo').fill('carpa');
  await expect(page.getByTestId('knot-list')).toContainText('Tensor ajustable');

  // Mosquetones: tarjeta propia en Cabuyería, antes del glosario, con la regla del metal, formas, trabas y descarte.
  await page.goto('/#/knots');
  const cards = await page.locator('a[href$="/knots/carabiners"], a[href$="/knots/glossary"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(cards.findIndex((h) => h?.endsWith('/knots/carabiners'))).toBeLessThan(cards.findIndex((h) => h?.endsWith('/knots/glossary')));
  await page.getByRole('link', { name: /Mosquetones/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mosquetones' })).toBeVisible();
  await expect(page.getByTestId('carabiner-metal')).toContainText('aluminio, tiene que correr sobre aluminio, no sobre acero');
  await expect(page.getByTestId('carabiner-types').locator('svg.carabiner-fig')).toHaveCount(7);
  await expect(page.getByTestId('carabiner-d')).toContainText('Ventajas');
  await expect(page.getByTestId('carabiner-d')).toContainText('Desventajas');
  await expect(page.getByTestId('carabiner-locks').locator('article')).toHaveCount(4);
  await expect(page.getByTestId('carabiner-lock-twist')).toContainText('Automático de doble acción');
  await expect(page.getByTestId('carabiner-care-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: `e2e-results/screens/${testInfo.project.name}-56-carabiners.png`, fullPage: true });

  await page.goto('/#/knots/glossary');
  await expect(page.getByTestId('knot-glossary')).toContainText('Chicote');

  // Volver: del calendario a una planta y de vuelta al calendario.
  await page.goto('/#/garden/calendar');
  await page.getByRole('link', { name: /^Tomate/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Tomate' })).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page).toHaveURL(/#\/garden\/calendar$/);
  // Abierta directo (sin historial en la app): va a la pantalla de arriba.
  await page.goto('/#/garden/crops/lechuga');
  await page.reload();
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('heading', { name: 'Lechuga' })).toBeVisible();
  await page.getByTestId('back').click();
  await expect(page).toHaveURL(/#\/garden\/calendar$/);
});

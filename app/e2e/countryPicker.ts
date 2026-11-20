import { expect, type Page } from '@playwright/test';

/**
 * El selector de país (Ajustes y modo «elegir» de Contactos/guías) arranca con los continentes CERRADOS.
 * Abre el continente (por defecto América del Sur) solo si está cerrado, y deja a la vista la lista de países.
 */
export async function openContinent(page: Page, continent = 'southAmerica') {
  const toggle = page.getByTestId(`country-continent-toggle-${continent}`);
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

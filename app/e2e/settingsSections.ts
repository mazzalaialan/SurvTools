import { expect, type Page } from '@playwright/test';

/** Abre un desplegable de Ajustes (seguridad, device, storage) solo si está cerrado. */
export async function openSection(page: Page, id: 'security' | 'device' | 'storage') {
  const toggle = page.getByTestId(`${id}-toggle`);
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

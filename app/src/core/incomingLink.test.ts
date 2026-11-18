import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), getLaunchUrl: vi.fn() } }));
const { isAppLink } = await import('./incomingLink');

describe('isAppLink', () => {
  it('acepta el enlace de transferencia de la web pública', () => {
    expect(isAppLink('https://mazzalaialan.github.io/SurvTools/#/transfer?server=https%3A%2F%2Fx.com&code=ABCD2345')).toBe(true);
  });
  it('ignora otros enlaces', () => {
    expect(isAppLink('https://mazzalaialan.github.io/SurvTools/')).toBe(false);
    expect(isAppLink('https://otro.com/SurvTools/#/transfer?server=a&code=b')).toBe(false);
  });
});

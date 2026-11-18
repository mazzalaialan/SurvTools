import { describe, expect, it, vi } from 'vitest';
import { formatTransferCode, parseTransferLink, transferLink } from './transfer';

describe('transferencia', () => {
  it('arma y lee el link del QR', () => {
    const link = transferLink('https://vikarg.example.com/', 'ABCD2345', 'https://app.example.com/SurvTools/');
    expect(link).toBe('https://app.example.com/SurvTools/#/transfer?server=https%3A%2F%2Fvikarg.example.com&code=ABCD2345');
    expect(parseTransferLink(link)).toEqual({ server: 'https://vikarg.example.com', code: 'ABCD2345' });
  });

  it('ignora textos que no son links de transferencia', () => {
    expect(parseTransferLink('https://example.com')).toBeNull();
    expect(parseTransferLink('https://x/#/transfer?server=a')).toBeNull();
  });

  it('formatea el código en dos grupos', () => {
    expect(formatTransferCode('ABCD2345')).toBe('ABCD-2345');
  });
});

describe('enlace desde la app nativa', () => {
  it('usa la web pública y no el origen del WebView', async () => {
    vi.resetModules();
    vi.doMock('@/core/platform', () => ({ isNativePlatform: () => true }));
    const m = await import('./transfer');
    expect(m.transferLink('https://vikarg.example.com', 'ABCD2345')).toBe(
      'https://mazzalaialan.github.io/SurvTools/#/transfer?server=https%3A%2F%2Fvikarg.example.com&code=ABCD2345',
    );
    vi.doUnmock('@/core/platform');
  });
});

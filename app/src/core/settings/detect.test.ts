import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCountry, languageFrom } from './settings';

function withZone(zone: string): Country {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => ({ resolvedOptions: () => ({ timeZone: zone }) })) as unknown as typeof Intl.DateTimeFormat);
  return detectCountry();
}
type Country = ReturnType<typeof detectCountry>;

afterEach(() => vi.restoreAllMocks());

describe('detección del país por la zona horaria', () => {
  it('Brasil se detecta por el nombre de la zona, no por el desfase (Sao_Paulo coincide con Argentina; Rio_Branco con Perú)', () => {
    for (const zone of ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Rio_Branco', 'America/Noronha', 'America/Bahia', 'America/Fortaleza', 'America/Belem', 'America/Porto_Velho']) {
      expect(withZone(zone), zone).toBe('BR');
    }
  });

  it('los demás países siguen igual', () => {
    expect(withZone('America/Argentina/Buenos_Aires')).toBe('AR');
    expect(withZone('America/Lima')).toBe('PE');
    expect(withZone('America/Asuncion')).toBe('PY');
    expect(withZone('America/Montevideo')).toBe('UY');
    expect(withZone('America/La_Paz')).toBe('BO');
    expect(withZone('America/Santiago')).toBe('CL');
    // Una zona de Perú o Ecuador con el mismo desfase que Rio_Branco no es Brasil.
    expect(withZone('America/Guayaquil')).toBe('AR');
  });
});

describe('detección del idioma por el navegador', () => {
  it('español, portugués (pt-BR y pt-PT) o inglés para cualquier otro', () => {
    expect(languageFrom('es-AR')).toBe('es');
    expect(languageFrom('pt-BR')).toBe('pt');
    expect(languageFrom('pt')).toBe('pt');
    expect(languageFrom('PT-pt')).toBe('pt');
    expect(languageFrom('en-US')).toBe('en');
    expect(languageFrom('fr-FR')).toBe('en');
    expect(languageFrom(undefined)).toBe('es');
  });
});

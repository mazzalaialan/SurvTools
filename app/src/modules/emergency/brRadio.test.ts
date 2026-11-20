import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import pt from '@/locales/pt.json';

const SECTORS = ['sul', 'sudeste', 'centro-oeste', 'nordeste', 'norte'];
const IDS = ['labre', 'dmr', 'hf', 'vhf', 'px9', 'px11', 'px19'];

describe('radio de Brasil', () => {
  const radios = SECTORS.flatMap((s) => {
    const d = JSON.parse(readFileSync(new URL(`../../../public/data/BR-${s}.json`, import.meta.url), 'utf8')) as { sources: { radio: string }; radio: { call: string; am: number | null; fm: number | null; lat: number; lon: number }[] };
    expect(d.sources.radio).toMatch(/EBC.*2026-11-20/);
    return d.radio;
  });

  it('solo las emisoras de la EBC con frecuencia en su sitio oficial, cada una con ubicación y una frecuencia', () => {
    expect(radios.map((r) => r.call).sort()).toEqual(['Rádio Nacional de Brasília', 'Rádio Nacional de São Luís', 'Rádio Nacional de São Paulo', 'Rádio Nacional do Alto Solimões', 'Rádio Nacional do Rio de Janeiro']);
    for (const r of radios) {
      expect(r.am !== null || r.fm !== null).toBe(true);
      if (r.fm !== null) expect(r.fm).toBeGreaterThanOrEqual(87.5 - 0.5); // 87,1 es la banda FM extendida de Brasil
      if (r.am !== null) expect(r.am).toBeGreaterThan(500);
      expect(r.lat).toBeLessThan(0);
      expect(r.lon).toBeLessThan(-40);
    }
  });

  it('textos de la sección de radioaficionados y banda ciudadana en los tres idiomas', () => {
    for (const lang of [es, en, pt] as const) {
      const r = (lang as unknown as { radio: Record<string, any> }).radio;
      for (const k of ['title', 'intro', 'note', 'sources']) expect(typeof r.br[k]).toBe('string');
      for (const id of IDS) {
        expect(r.br[id].name).toBeTruthy();
        expect(r.br[id].desc).toBeTruthy();
      }
      expect(r.nacionalTitleBR).toBeTruthy();
      expect(r.nacionalNoteBR).toMatch(/EBC/);
    }
  });
});

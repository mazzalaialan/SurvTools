import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countryFiles, downloadsSilently, fileBytes, formatBytes, networkInfo } from './countryDownload';
import { SERVICE_CATEGORIES } from './services';

describe('descarga de los datos de un país', () => {
  it('los archivos de cada país: paquete, servicios, parques y repetidoras que corresponden', () => {
    const pe = countryFiles('PE');
    expect(pe).toContain('PE.json');
    expect(pe).toContain('parks-PE.json');
    expect(pe).toContain('fuel-PE.json');
    expect(pe).not.toContain('repeaters-CL.json');
    expect(pe.length).toBe(1 + SERVICE_CATEGORIES.length + 1);
    // Argentina: sin paquete (viene con la app), pero con los servicios y, por la cordillera, los parques y repetidoras de Chile.
    const ar = countryFiles('AR');
    expect(ar).not.toContain('AR.json');
    expect(ar).toEqual(expect.arrayContaining(['fuel-AR.json', 'parks-CL.json', 'repeaters-CL.json']));
    expect(countryFiles('UY')).not.toContain('parks-UY.json');
  });

  it('los pesos coinciden con los archivos de public/data (si esta prueba falla: `npm run data-sizes`)', () => {
    const dir = new URL('../../../public/data/', import.meta.url);
    const real = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const country of ['AR', 'CL', 'UY', 'BO', 'PE'] as const) {
      for (const f of countryFiles(country)) {
        expect(existsSync(new URL(f, dir)), `${f} no existe`).toBe(true);
        const actual = statSync(new URL(f, dir)).size;
        expect(Math.abs(fileBytes(f) - actual) / actual, `${f}: el peso guardado no coincide`).toBeLessThan(0.1);
      }
    }
    expect(real.length).toBeGreaterThan(40);
  });

  it('el índice de la app (public/data/index.json) coincide con los archivos (si falla: `npm run data-sizes`)', () => {
    const dir = new URL('../../../public/data/', import.meta.url);
    const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')) as { files: Record<string, { date: string; bytes: number }> };
    const real = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
    expect(Object.keys(index.files).sort()).toEqual(real.sort());
    for (const f of real) {
      const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as { generatedAt?: unknown };
      expect(index.files[f]!.date, `${f}: la fecha del índice no coincide`).toBe(typeof d?.generatedAt === 'string' ? d.generatedAt : '');
      expect(index.files[f]!.bytes, `${f}: el peso del índice no coincide`).toBe(statSync(new URL(f, dir)).size);
    }
  });

  it('sin Wi-Fi seguro se pregunta: solo Wi-Fi o cable sin ahorro de datos baja solo', () => {
    expect(networkInfo({ connection: { type: 'wifi' } })).toEqual({ kind: 'wifi', saveData: false });
    expect(networkInfo({ connection: { type: 'ethernet' } }).kind).toBe('wifi');
    expect(networkInfo({ connection: { type: 'cellular' } }).kind).toBe('cellular');
    // iPhone y la mayoría de los navegadores: no dicen el tipo → desconocida.
    expect(networkInfo({}).kind).toBe('unknown');
    expect(networkInfo({ connection: { type: undefined } }).kind).toBe('unknown');
    expect(downloadsSilently({ kind: 'wifi', saveData: false })).toBe(true);
    expect(downloadsSilently({ kind: 'wifi', saveData: true })).toBe(false);
    expect(downloadsSilently({ kind: 'cellular', saveData: false })).toBe(false);
    expect(downloadsSilently({ kind: 'unknown', saveData: false })).toBe(false);
  });

  it('el peso se muestra en MB o KB', () => {
    expect(formatBytes(4_400_000, 'es')).toBe('4,2 MB');
    expect(formatBytes(300_000, 'es')).toBe('293 KB');
    expect(formatBytes(10, 'en')).toBe('1 KB');
  });
});

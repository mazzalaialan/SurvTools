import { describe, expect, it } from 'vitest';
import { NATIONAL_NUMBERS } from '@/modules/emergency/national';
import { CONTACT_KINDS } from '@/modules/emergency/parts';
import en from './en.json';
import es from './es.json';
import pt from './pt.json';

/** Código de la app, para buscar las claves de texto que usa. */
const SOURCES = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('traducciones', () => {
  it('español, inglés y portugués tienen las mismas claves', () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
    expect(keys(pt).sort()).toEqual(keys(es).sort());
  });

  it('el portugués conserva los marcadores {{x}} de cada texto', () => {
    const flat = (o: object, prefix = ''): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v as object, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)] as [string, string]]));
    const marks = (s: string) => (s.match(/\{\{[^}]+\}\}/g) ?? []).sort().join('|');
    const ptMap = new Map(flat(pt));
    const bad = flat(es).filter(([k, v]) => marks(v) !== marks(ptMap.get(k) ?? '')).map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('todo texto que usa la app con una clave fija existe en los dos idiomas', () => {
    const all = new Set(keys(es));
    const has = (key: string) => all.has(key) || all.has(`${key}_one`) || [...all].some((k) => k.startsWith(`${key}.`));
    const missing: string[] = [];
    let checked = 0;
    for (const [file, source] of Object.entries(SOURCES)) {
      // t('clave'), t("clave") o t(`clave`); las armadas con `${…}` se revisan en otras pruebas.
      for (const m of source.matchAll(/\bt\(\s*['"`]([a-zA-Z][\w.]*)['"`]/g)) {
        checked++;
        if (!has(m[1]!)) missing.push(`${file.replace(/^.*\/src\//, '')}: ${m[1]}`);
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(missing).toEqual([]);
  });

  it('cada número de emergencia de cada país tiene nombre y descripción', () => {
    for (const list of Object.values(NATIONAL_NUMBERS)) {
      for (const n of list) {
        for (const lang of [es, en, pt]) {
          const entry = (lang.emergency.national as Record<string, { name?: string; desc?: string }>)[n.id];
          expect(entry?.name, n.id).toBeTruthy();
          expect(entry?.desc, n.id).toBeTruthy();
        }
      }
    }
  });

  it('cada tipo de contacto tiene su nombre', () => {
    for (const kind of CONTACT_KINDS) {
      expect(es.emergency.kind, kind).toHaveProperty(kind);
      expect(en.emergency.kind, kind).toHaveProperty(kind);
      expect(pt.emergency.kind, kind).toHaveProperty(kind);
    }
  });
});

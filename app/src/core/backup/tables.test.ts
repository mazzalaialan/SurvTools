import { describe, expect, it } from 'vitest';
import { ENTITY_TABLES } from '@/core/db/db';
import en from '@/locales/en.json';
import es from '@/locales/es.json';

describe('resumen del backup', () => {
  it.each([
    ['es', es],
    ['en', en],
  ])('cada tabla de datos tiene su nombre traducido (%s)', (_lang, locale) => {
    const names = (locale as { backup: { tables: Record<string, string> } }).backup.tables;
    expect(ENTITY_TABLES.filter((t) => !names[t])).toEqual([]);
  });
});

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NEEDS } from './content';
import { creditFor, KNOT_BY_ID, KNOTS, knotImages } from './knots';
import { searchKnots } from './search';
import DIAGRAMS from './diagrams.json';
import { PENDING_STEPS } from './pendingSteps';

const all = { query: '', use: null, type: null, props: [] };

describe('guía de nudos: datos', () => {
  it('cada nudo relacionado, del asistente y cada imagen existe, y cada imagen tiene su crédito', () => {
    for (const k of KNOTS) {
      for (const r of k.related) expect(KNOT_BY_ID.has(r), `${k.id} → ${r}`).toBe(true);
      expect(k.steps.length, k.id).toBeGreaterThanOrEqual(2);
      const imgs = knotImages(k);
      expect(imgs.length, `${k.id} sin imágenes`).toBeGreaterThan(0);
      for (const f of imgs) {
        expect(existsSync(new URL(`../../../public/knots/${f}`, import.meta.url)), f).toBe(true);
        expect(creditFor(f), `sin crédito: ${f}`).toBeDefined();
      }
    }
    for (const n of NEEDS) for (const o of n.options) for (const id of o.knots) expect(KNOT_BY_ID.has(id), `${n.id} → ${id}`).toBe(true);
    expect(new Set(KNOTS.map((k) => k.id)).size).toBe(KNOTS.length);
  });

  /** Nudos sin diagrama paso a paso porque todavía no hay uno verificado contra una referencia real: la ficha muestra la foto del manual y el texto. */
  const SIN_DIAGRAMA = ['ocho-dos-gazas'];

  it('cada paso de cada nudo tiene su diagrama propio, con el mismo estilo (salvo los que esperan uno verificado)', () => {
    for (const k of KNOTS) {
      if (SIN_DIAGRAMA.includes(k.id)) {
        expect((DIAGRAMS as Record<string, number[]>)[k.id]?.length ?? 0, `${k.id}: no debe tener diagramas propios`).toBe(0);
        expect(k.images.length, `${k.id}: necesita su foto`).toBeGreaterThan(0);
        for (const s of k.steps) expect(s.img, k.id).toBeUndefined();
        continue;
      }
      expect((DIAGRAMS as Record<string, number[]>)[k.id]?.length, `${k.id}: figuras ≠ pasos`).toBe(k.steps.length);
      for (const s of k.steps) {
        expect(s.img, k.id).toMatch(/^pasos\/.+\.svg$/);
        expect(creditFor(s.img!)?.source).toBe('Diagramas propios de VikArg');
      }
    }
  });

  it('crédito correcto: el más específico gana', () => {
    expect(creditFor('as-de-guia-doble-1.webp')?.source).toContain('FM 3-97.61');
    expect(creditFor('as-de-guia-1.webp')?.source).toContain('FM 3-05.70');
    expect(creditFor('machard-1.webp')?.license).toBe('CC BY-SA 3.0');
  });
});

describe('guía de nudos: búsqueda', () => {
  it('por nombre sin acentos y por alias', () => {
    expect(searchKnots({ ...all, query: 'as de guia' }, 'es')[0]!.id).toBe('as-de-guia');
    expect(searchKnots({ ...all, query: 'Marchand' }, 'es').map((k) => k.id)).toContain('machard');
    // Corredizos: los tres aparecen buscando "corredizo" (también en inglés).
    expect(searchKnots({ ...all, query: 'corredizo' }, 'es').map((k) => k.id)).toEqual(expect.arrayContaining(['corredizo', 'escape', 'as-de-guia-corredizo']));
    expect(searchKnots({ ...all, query: 'noose' }, 'en')[0]!.id).toBe('corredizo');
    expect(searchKnots({ ...all, query: 'slip knot' }, 'en')[0]!.id).toBe('escape');
    expect(searchKnots({ ...all, query: 'bowline' }, 'es')[0]!.id).toBe('as-de-guia');
  });

  it('por uso: en Rappel están el Machard y el dinámico; no la atadura cuadrada', () => {
    const ids = searchKnots({ ...all, use: 'rappel' }, 'es').map((k) => k.id);
    expect(ids).toContain('machard');
    expect(ids).toContain('dinamico');
    expect(ids).not.toContain('atadura-cuadrada');
  });

  it('por tipo y propiedades', () => {
    const friction = searchKnots({ ...all, type: 'friction' }, 'es').map((k) => k.id);
    expect(friction.sort()).toEqual(['bachmann', 'klemheist', 'machard', 'prusik']);
    const oneHand = searchKnots({ ...all, props: ['oneHand'] }, 'es').map((k) => k.id);
    expect(oneHand).toContain('as-de-guia');
    expect(oneHand).not.toContain('ocho-doble');
  });

  it('por lo que hace (texto de para qué sirve)', () => {
    expect(searchKnots({ ...all, query: 'tronco' }, 'es').map((k) => k.id)).toContain('lenador');
  });
});

describe('anclajes', () => {
  it('cada imagen y cada nudo referido existen; el asistente apunta a anclajes que existen', async () => {
    const { ANCHORS, ANCHOR_BY_ID } = await import('./anchors');
    for (const a of ANCHORS) {
      for (const k of a.knots) expect(KNOT_BY_ID.has(k), `${a.id} → ${k}`).toBe(true);
      for (const f of a.images) expect(existsSync(new URL(`../../../public/anchors/${f}`, import.meta.url)), f).toBe(true);
      expect(a.steps.length, a.id).toBeGreaterThanOrEqual(2);
    }
    for (const n of NEEDS) for (const o of n.options) for (const id of o.anchors ?? []) expect(ANCHOR_BY_ID.has(id), id).toBe(true);
  });

  it('la tabla de ángulos coincide con la cuenta: carga ÷ (2 × cos(ángulo / 2))', async () => {
    const { ANCHOR_BY_ID } = await import('./anchors');
    for (const [angle, pct] of ANCHOR_BY_ID.get('angulos')!.table!.rows) {
      const a = parseFloat(angle);
      expect(parseFloat(pct)).toBeCloseTo(100 / (2 * Math.cos((a / 2) * (Math.PI / 180))), -0.5);
    }
  });

  it('el árbol dice diámetro y su equivalente alrededor del tronco', async () => {
    const { ANCHOR_BY_ID } = await import('./anchors');
    const size = ANCHOR_BY_ID.get('arbol')!.steps[0]!.es;
    expect(size).toContain('20 cm de diámetro');
    expect(size).toContain('63 cm alrededor');
    expect(size).toContain('30 cm de diámetro');
    expect(Math.round(Math.PI * 20)).toBe(63);
    expect(Math.round(Math.PI * 30)).toBe(94);
  });
});

describe('pasos pendientes de verificar', () => {
  it('cada nudo y cada número de paso listados existen', () => {
    for (const [id, p] of Object.entries(PENDING_STEPS)) {
      const k = KNOT_BY_ID.get(id);
      expect(k, id).toBeDefined();
      if (Array.isArray(p)) for (const n of p) expect(n >= 1 && n <= k!.steps.length, `${id} paso ${n}`).toBe(true);
    }
  });
});


import { describe, expect, it } from 'vitest';
import { animalsFor, farmPlan, tasksFor, yearlyNeed, yields } from './plan';

describe('calculadora de granja', () => {
  const ys = yields();
  const hen = ys.find((y) => y.species === 'gallina')!;

  it('huevos: 4 personas, la mitad de lo que recomienda la guía (7 por semana) con gallinas de 220 huevos al año', () => {
    expect(yearlyNeed('eggs')!.value).toBe(7 * 52);
    // 364 × 4 × 0,5 / 220 = 3,3 → 4 gallinas.
    expect(animalsFor(hen, 4, 0.5)).toBe(4);
  });

  it('sin personas o sin porcentaje no hace falta ningún animal; con poco, al menos uno', () => {
    expect(animalsFor(hen, 0, 1)).toBe(0);
    expect(animalsFor(hen, 1, 0)).toBe(0);
    expect(animalsFor(hen, 1, 0.01)).toBe(1);
  });

  it('carne: solo especies con kg de carne con fuente (el pato, sin rendimiento, queda afuera; el pavo usa su rendimiento)', () => {
    expect(ys.some((y) => y.species === 'pato')).toBe(false);
    const turkey = ys.find((y) => y.species === 'pavo')!;
    expect(turkey.perUnit).toBeCloseTo(6 * 0.6);
    expect(turkey.unit).toBe('raise');
    expect(ys.find((y) => y.species === 'conejo')!.unit).toBe('keep');
  });

  it('calendario: las obligatorias primero y filtra por especie y región', () => {
    const april = tasksFor(4, ['vaca'], 'pampeana');
    expect(april.length).toBeGreaterThan(0);
    expect(april[0]!.kind).toBe('obligatorio');
    expect(tasksFor(4, ['vaca'], 'pampeana').every((t) => t.species.includes('vaca'))).toBe(true);
    expect(farmPlan.tasks.length).toBeGreaterThan(50);
  });
});

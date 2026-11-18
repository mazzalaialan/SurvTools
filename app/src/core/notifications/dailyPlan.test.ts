import { describe, expect, it } from 'vitest';
import { lastFired, planDailyNotices, PLAN_DAYS } from './dailyPlan';

const alert = (over: Partial<{ itemName: string; dueDate: string | null; notifyFrom: string }>) => ({
  itemName: 'Arroz',
  kind: 'expiry' as const,
  dueDate: '2026-12-10',
  notifyFrom: '2026-12-03',
  ...over,
});
const at = (day: string, h = 9) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();

describe('planDailyNotices', () => {
  it('avisa una sola vez cuando empieza el aviso y otra el día que vence', () => {
    const plan = planDailyNotices([alert({})], '2026-12-01', at('2026-12-01', 8), 9, null, 'es');
    expect(plan.map((p) => p.day)).toEqual(['2026-12-03', '2026-12-10']);
    expect(plan[0]!.at).toBe(at('2026-12-03'));
  });
  it('no programa hoy si la hora ya pasó: sale mañana', () => {
    const plan = planDailyNotices([alert({ notifyFrom: '2026-12-01', dueDate: null })], '2026-12-01', at('2026-12-01', 10), 9, null, 'es');
    expect(plan.map((p) => p.day)).toEqual(['2026-12-02']);
  });
  it('no repite lo ya avisado', () => {
    const plan = planDailyNotices([alert({ dueDate: null })], '2026-12-05', at('2026-12-05', 8), 9, '2026-12-04', 'es');
    expect(plan).toEqual([]);
  });
  it('mira solo los días del plan', () => {
    const plan = planDailyNotices([alert({ notifyFrom: '2027-03-01' })], '2026-12-01', 0, 9, null, 'en');
    expect(plan).toEqual([]);
    expect(PLAN_DAYS).toBe(14);
  });
});

describe('lastFired', () => {
  it('toma el último aviso del plan anterior que ya sonó', () => {
    const plan = [{ day: '2026-12-03', at: 100 }, { day: '2026-12-10', at: 500 }];
    expect(lastFired(plan, 200, null)).toBe('2026-12-03');
    expect(lastFired(plan, 900, '2026-12-05')).toBe('2026-12-10');
    expect(lastFired(plan, 50, '2026-12-01')).toBe('2026-12-01');
  });
});

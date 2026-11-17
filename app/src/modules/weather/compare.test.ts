import { describe, expect, it } from 'vitest';
import sample from './fixtures/compare.sample.json';
import { agreementOf, cellColor, compareDays, compareKey, compareUrl, consensus, dayValue, daySummaries, gridSteps, gridValue, median, MODELS, parseCompare, widestDay } from './compare';

describe('comparación de pronósticos', () => {
  it('pide todos los modelos en una sola consulta, con los 7 días y la altura real', () => {
    const url = new URL(compareUrl('https://api.open-meteo.com/', -34.6, -58.64, 25));
    expect(url.pathname).toBe('/v1/forecast');
    expect(url.searchParams.get('models')).toBe(MODELS.map((m) => m.id).join(','));
    expect(url.searchParams.get('forecast_days')).toBe('16');
    expect(url.searchParams.get('elevation')).toBe('25');
    expect(url.searchParams.get('hourly')).toContain('temperature_2m');
  });

  it('lee la respuesta real: una serie por modelo y variable; omite las que vinieron vacías', () => {
    const c = parseCompare(sample as never, new Date('2026-11-17T12:00:00Z'));
    expect(c.timezone).toBe('America/Argentina/Buenos_Aires');
    expect(c.time).toHaveLength(384);
    expect(Object.keys(c.series)).toEqual(MODELS.map((m) => m.id));
    expect(c.series.ukmo_global_deterministic_10km?.wind_speed_10m).toHaveLength(384);
    expect(c.series.ecmwf_ifs025?.wind_direction_10m).toHaveLength(384);
  });

  it('una respuesta sin horas o sin ningún modelo es inválida', () => {
    expect(() => parseCompare({ hourly: { time: [] } })).toThrow();
    expect(() => parseCompare({ hourly: { time: ['2026-11-17T00:00'], temperature_2m: [10] } })).toThrow();
  });

  it('resume cada día: máxima de temperatura, lluvia total, viento máximo y nubosidad media', () => {
    expect(dayValue('temperature_2m', [10, 22, null, 18])).toBe(22);
    expect(dayValue('precipitation', [1, 0.5, null])).toBe(1.5);
    expect(dayValue('wind_speed_10m', [5, 30])).toBe(30);
    expect(dayValue('cloud_cover', [0, 100])).toBe(50);
    expect(dayValue('cloud_cover', [null, null])).toBeNull();
  });

  it('un modelo que trae el día incompleto no entra en la comparación de ese día', () => {
    const c = parseCompare(sample as never);
    const days = compareDays(c, 'temperature_2m');
    expect(days).toHaveLength(16);
    // ARPEGE llega a ~4 días: el último día no tiene valor y no cuenta en la diferencia.
    expect(days.at(-1)!.byModel.gfs_global).not.toBeNull();
    expect(days.at(-1)!.byModel.meteofrance_arpege_world).toBeNull();
    expect(days[0]!.byModel.ecmwf_ifs025).not.toBeNull();
    expect(days[0]!.spread).toBeGreaterThanOrEqual(0);
  });

  it('apagar modelos cambia la diferencia entre los que quedan', () => {
    const c = parseCompare(sample as never);
    const all = compareDays(c, 'temperature_2m')[0]!;
    const two = compareDays(c, 'temperature_2m', ['ecmwf_ifs025', 'gfs_global'])[0]!;
    const e = all.byModel.ecmwf_ifs025!;
    const g = all.byModel.gfs_global!;
    expect(two.spread).toBeCloseTo(Math.abs(e - g), 6);
    expect(compareDays(c, 'temperature_2m', ['ecmwf_ifs025'])[0]!.spread).toBeNull();
  });

  it('califica la coincidencia con umbrales por variable', () => {
    expect(agreementOf('temperature_2m', 1)).toBe('high');
    expect(agreementOf('temperature_2m', 3)).toBe('medium');
    expect(agreementOf('temperature_2m', 6)).toBe('low');
    expect(agreementOf('precipitation', 10)).toBe('low');
    expect(agreementOf('wind_speed_10m', 5)).toBe('high');
    expect(agreementOf('cloud_cover', 20)).toBe('medium');
    expect(agreementOf('temperature_2m', null)).toBeNull();
  });

  it('un modelo extremo no dispara la alarma: con 5 o más, la diferencia se mide sin los dos extremos', () => {
    // El caso real del 17 de noviembre: JMA 40,6 mm, el resto entre 3,5 y 17,8.
    const c = parseCompare(sample as never);
    const rain = compareDays(c, 'precipitation')[0]!;
    expect(rain.full![1]).toBeGreaterThan(40);
    expect(rain.core![1]).toBeLessThan(18);
    expect(rain.spread).toBeLessThan(15);
    expect(rain.outliers).toEqual(['jma_gsm']);
    // Con menos de 5 modelos no se descarta ninguno.
    const four = compareDays(c, 'precipitation', ['ecmwf_ifs025', 'gfs_global', 'icon_global', 'jma_gsm'])[0]!;
    expect(four.core).toEqual(four.full);
    expect(four.outliers).toEqual([]);
  });

  it('califica la coincidencia con umbrales por variable', () => {
    expect(agreementOf('temperature_2m', 1)).toBe('high');
    expect(agreementOf('temperature_2m', 3)).toBe('medium');
    expect(agreementOf('temperature_2m', 6)).toBe('low');
    expect(agreementOf('precipitation', 10)).toBe('low');
    expect(agreementOf('wind_speed_10m', 5)).toBe('high');
    expect(agreementOf('cloud_cover', 20)).toBe('medium');
    expect(agreementOf('temperature_2m', null)).toBeNull();
  });

  it('encuentra el día con más discrepancia', () => {
    const base = { byModel: {}, core: null, full: null, outliers: [] };
    const w = widestDay([
      { ...base, date: 'a', spread: 1 },
      { ...base, date: 'b', spread: 5 },
      { ...base, date: 'c', spread: null },
    ]);
    expect(w?.date).toBe('b');
    expect(widestDay([])).toBeNull();
  });

  it('máxima contra máxima y mínima contra mínima: cada una sale de la misma serie por hora', () => {
    const c = parseCompare(sample as never);
    const max = compareDays(c, 'temperature_2m');
    const min = compareDays(c, 'temperature_min');
    for (const m of MODELS) {
      const a = max[0]!.byModel[m.id];
      const b = min[0]!.byModel[m.id];
      if (a !== null && b !== null) expect(b!).toBeLessThan(a!);
    }
    expect(dayValue('temperature_min', [10, 22, null, 18])).toBe(10);
    expect(min[0]!.spread).not.toBeNull();
  });

  it('la grilla: un paso cada 3 horas; la lluvia suma las 3 horas y lo demás es el valor a esa hora', () => {
    const c = parseCompare(sample as never);
    const steps = gridSteps(c);
    expect(steps).toHaveLength(128);
    expect(c.time[steps[0]!]!.endsWith('T00:00')).toBe(true);
    const s = c.series.ecmwf_ifs025!;
    expect(gridValue(c, 'ecmwf_ifs025', 'temperature_2m', 3)).toBe(s.temperature_2m![3]);
    const r = s.precipitation!;
    expect(gridValue(c, 'ecmwf_ifs025', 'precipitation', 3)).toBeCloseTo(r[3]! + r[4]! + r[5]!, 6);
    // ARPEGE no llega a los últimos días.
    expect(gridValue(c, 'meteofrance_arpege_world', 'temperature_2m', steps.at(-1)!)).toBeNull();
    expect(consensus(c, 'temperature_2m', 3)).not.toBeNull();
  });

  it('la mediana ignora un valor extremo', () => {
    expect(median([1, 2, 100])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('colores: más caliente, más rojo; sin lluvia, casi blanco; fuera de rango se queda en el extremo', () => {
    expect(cellColor('temperature_2m', -30)).toEqual(cellColor('temperature_2m', -10));
    expect(cellColor('temperature_2m', 20).bg).not.toBe(cellColor('temperature_2m', 35).bg);
    expect(cellColor('precipitation', 0).bg).toMatch(/97%\)$/);
    expect(cellColor('wind_speed_10m', 100)).toEqual(cellColor('wind_speed_10m', 80));
    // Texto legible: claro sobre fondo oscuro, oscuro sobre fondo claro.
    expect(cellColor('precipitation', 0).fg).toBe('#111111');
    expect(cellColor('precipitation', 30).fg).toBe('#ffffff');
  });

  it('lectura por día: mediana de temperatura y cuántos modelos esperan lluvia', () => {
    const c = parseCompare(sample as never);
    const days = daySummaries(c);
    expect(days).toHaveLength(16);
    const today = days[0]!;
    expect(today.models).toBeGreaterThanOrEqual(5);
    expect(today.rainModels).toBeGreaterThan(0);
    expect(today.tempMax!).toBeGreaterThan(today.tempMin!);
    expect(today.rain!).toBeGreaterThan(5);
    // Un día seco para todos.
    expect(days[2]!.rainModels).toBe(0);
    // Los días lejanos solo los traen los modelos largos: los otros no cuentan.
    const last = days.at(-1)!;
    expect(last.models).toBeLessThan(last.total);
    expect(last.models).toBeGreaterThanOrEqual(1);
    expect(today.total).toBe(6);
  });
});

describe('clave de lo guardado', () => {
  it('cambia con la cantidad de días, así una comparación vieja de 7 días no se muestra como si fuera la de 16', () => {
    expect(compareKey('-34.60,-58.64')).toBe('-34.60,-58.64|16d');
  });
});

import { useSettings } from '@/core/settings/settings';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, ARCHIVE_DELAY_DAYS, fetchHistory, FIRST_DAY, historyUrl, historyWindow, localToday, mergeDays, parseSegment, planHistory } from './history';

// Respuestas reales de Open-Meteo (16-nov-2026, cerca de San Carlos de Bariloche): el historial del 4 al 10 y el pronóstico del 12 al 16.
const archive = JSON.parse(readFileSync(new URL('./fixtures/history-archive.sample.json', import.meta.url), 'utf8'));
const forecast = JSON.parse(readFileSync(new URL('./fixtures/history-forecast.sample.json', import.meta.url), 'utf8'));

describe('clima histórico: qué rango pedir y a quién', () => {
  const today = '2026-11-16';
  it('trae 7 días alrededor de la fecha, sin pasar de hoy ni de la primera fecha del historial', () => {
    expect(historyWindow('2026-06-15', today)).toEqual({ start: '2026-06-12', end: '2026-06-18' });
    // Cerca de hoy: el rango termina hoy y se corre hacia atrás para mantener los 7 días.
    expect(historyWindow('2026-11-15', today)).toEqual({ start: '2026-11-10', end: '2026-11-16' });
    expect(historyWindow('2026-11-16', today)).toEqual({ start: '2026-11-10', end: '2026-11-16' });
    // Una fecha futura se trata como hoy; una anterior a 1940 como el primer día.
    expect(historyWindow('2027-01-01', today).end).toBe(today);
    expect(historyWindow('1900-01-01', today).start).toBe(FIRST_DAY);
  });
  it('lo viejo va al historial, lo reciente al pronóstico y lo que toca los dos, a los dos', () => {
    const lastArchive = addDays(today, -ARCHIVE_DELAY_DAYS); // 2026-11-11
    expect(planHistory({ start: '2026-06-12', end: '2026-06-18' }, today)).toEqual([{ kind: 'archive', start: '2026-06-12', end: '2026-06-18' }]);
    expect(planHistory({ start: '2026-11-10', end: '2026-11-16' }, today)).toEqual([
      { kind: 'archive', start: '2026-11-10', end: lastArchive },
      { kind: 'forecast', start: '2026-11-12', end: '2026-11-16' },
    ]);
    expect(planHistory({ start: '2026-11-13', end: '2026-11-16' }, today)).toEqual([{ kind: 'forecast', start: '2026-11-13', end: '2026-11-16' }]);
  });
  it('las direcciones: el historial va al servidor de archivo y el pronóstico al de siempre, con la altura del lugar', () => {
    const a = historyUrl({ kind: 'archive', start: '2026-11-04', end: '2026-11-10' }, 'https://api.open-meteo.com', -41.1503, -71.3, 880);
    expect(a.startsWith('https://archive-api.open-meteo.com/v1/archive?')).toBe(true);
    expect(a).toContain('start_date=2026-11-04');
    expect(a).toContain('elevation=880');
    expect(historyUrl({ kind: 'forecast', start: '2026-11-12', end: '2026-11-16' }, 'https://api.open-meteo.com/', -41.15, -71.3).startsWith('https://api.open-meteo.com/v1/forecast?')).toBe(true);
    // Un Open-Meteo propio sirve las dos en el mismo lugar.
    expect(historyUrl({ kind: 'archive', start: '2026-11-04', end: '2026-11-10' }, 'https://tiempo.casa', 0, 0)).toContain('https://tiempo.casa/v1/archive?');
  });
});

describe('clima histórico: lectura de las respuestas reales', () => {
  it('el historial da un día por fecha con sus 24 horas', () => {
    const days = parseSegment(archive, 'archive');
    expect(days.map((d) => d.date)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
    const d5 = days[1]!;
    expect(d5.source).toBe('archive');
    expect(d5.max).toBe(10.7);
    expect(d5.precipitation).toBe(9.4);
    expect(d5.hours).toHaveLength(24);
    expect(d5.hours[0]!.time).toBe('2026-11-05T00:00');
    expect(d5.hours.every((h) => h.temperature !== null && h.windSpeed !== null)).toBe(true);
    // La lluvia de las horas suma lo del día (con el redondeo de la fuente).
    const sum = d5.hours.reduce((n, h) => n + (h.precipitation ?? 0), 0);
    expect(Math.abs(sum - 9.4)).toBeLessThan(0.5);
  });
  it('el pronóstico de días pasados trae lo mismo, marcado como pronóstico', () => {
    const days = parseSegment(forecast, 'forecast');
    expect(days.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']);
    expect(days[3]!.source).toBe('forecast');
    expect(days[3]!.precipitation).toBe(4.5);
    expect(days[3]!.hours).toHaveLength(24);
  });
  it('junta las dos fuentes en orden y sin repetir; un día cerrado del historial gana', () => {
    const a = parseSegment(archive, 'archive');
    const f = parseSegment(forecast, 'forecast');
    const merged = mergeDays(f, a);
    expect(merged.map((d) => d.date)).toEqual([...a, ...f].map((d) => d.date));
    const dup = { ...f[0]!, date: a[0]!.date, max: 99 };
    expect(mergeDays([dup], [a[0]!])[0]!.source).toBe('archive');
  });
  it('un día sin ningún dato (el historial todavía no lo cerró) no se incluye', () => {
    const empty = {
      ...forecast,
      daily: { ...forecast.daily, time: [...forecast.daily.time, '2026-11-17'], temperature_2m_max: [...forecast.daily.temperature_2m_max, null], temperature_2m_min: [...forecast.daily.temperature_2m_min, null] },
    };
    expect(parseSegment(empty, 'forecast').map((d) => d.date)).not.toContain('2026-11-17');
  });
});

describe('clima histórico: pedido completo', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('para una fecha reciente pide al historial y al pronóstico y entrega los días juntos', async () => {
    // Sin servidor propio: solo importa lo que se pide al servicio público (el camino por el propio está en omFetch.test.ts).
    useSettings.setState({ settings: { ...useSettings.getState().settings, serverUrl: '' } });
    const urls: string[] = [];
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify(String(url).includes('archive-api') ? archive : forecast), { status: 200 });
    }));
    const h = await fetchHistory('https://api.open-meteo.com', -41.15, -71.3, '2026-11-14', '2026-11-16');
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes('archive-api.open-meteo.com/v1/archive'))).toBe(true);
    expect(urls.some((u) => u.includes('/v1/forecast'))).toBe(true);
    expect(h.start).toBe('2026-11-10');
    expect(h.end).toBe('2026-11-16');
    expect(h.date).toBe('2026-11-14');
    expect(h.days.some((d) => d.source === 'archive')).toBe(true);
    expect(h.days.some((d) => d.source === 'forecast')).toBe(true);
    expect(h.timezone).toBe('America/Argentina/Salta');
  });
  it('sin conexión o con la fuente caída da un error claro', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(fetchHistory('https://api.open-meteo.com', 0, 0, '2026-01-01', '2026-11-16')).rejects.toMatchObject({ code: 'offline' });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('sin red'); }));
    await expect(fetchHistory('https://api.open-meteo.com', 0, 0, '2026-01-01', '2026-11-16')).rejects.toMatchObject({ code: 'unreachable' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    await expect(fetchHistory('https://api.open-meteo.com', 0, 0, '2026-01-01', '2026-11-16')).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it('localToday da la fecha del teléfono', () => {
    expect(localToday(new Date(2026, 10, 16, 23, 30))).toBe('2026-11-16');
  });
});

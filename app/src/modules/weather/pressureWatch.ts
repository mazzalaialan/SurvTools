import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { currentPosition } from '@/core/geo/useGeolocation';
import { canShowLocal, notificationBackend } from '@/core/notifications/backend';
import { useBatterySaver } from '@/core/power/saver';
import { barometer } from '@/core/sensors/barometer';
import { useSettings } from '@/core/settings/settings';
import { MAX_VERTICAL_ACCURACY, median } from '@/modules/altimeter/altimeter';
import { addSample, pressureTrend, shouldNotify, type PressureSample, type PressureState, type PressureTrend } from './pressureTrend';

/**
 * Avisos por la presión del barómetro (solo teléfonos que lo tienen y solo si el usuario los activa). Mientras la app está abierta (o grabando un
 * recorrido, que la mantiene viva) toma cada 5 minutos (15 con ahorro de batería) una lectura de presión y la altura del GPS, las guarda 12 horas en
 * este dispositivo y calcula la tendencia sin el efecto de subir o bajar (ver `pressureTrend.ts`). Con la app cerrada no lee nada: el sensor y el GPS
 * no corren; al volver, la tendencia espera a juntar de nuevo 2 horas seguidas de lecturas. Es un aviso informativo, no un pronóstico.
 */

const LOG_KEY = 'vikarg.pressureLog';
const NOTIFIED_KEY = 'vikarg.pressureNotified';
export const SAMPLE_MS = { normal: 5 * 60_000, saver: 15 * 60_000 } as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: la tendencia vale mientras la app siga abierta.
  }
}

interface PressureWatchState {
  samples: PressureSample[];
  trend: PressureTrend;
  /** Última lectura de presión (hPa). */
  lastHPa: number | null;
}

const initial = read<PressureSample[]>(LOG_KEY, []);
export const usePressureWatch = create<PressureWatchState>(() => ({ samples: initial, trend: pressureTrend(initial), lastHPa: initial.at(-1)?.hPa ?? null }));

/** Mediana de unas lecturas seguidas del barómetro (cada una tiene ruido de ±0,1 hPa), o `null` si no entregó ninguna a tiempo. */
export async function readPressure(timeoutMs = 6000): Promise<number | null> {
  const values: number[] = [];
  let stop: (() => void) | null = null;
  let finished = false;
  await new Promise<void>((resolve) => {
    const done = () => {
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    barometer()
      .watch((hPa) => {
        values.push(hPa);
        if (values.length >= 5) done();
      })
      .then((s) => {
        stop = s;
        if (finished) s();
      })
      .catch(done);
  });
  (stop as (() => void) | null)?.();
  return median(values);
}

/** Toma una lectura (presión + altura del GPS), la guarda y devuelve la tendencia. */
export async function takeSample(now = Date.now()): Promise<PressureTrend | null> {
  const hPa = await readPressure();
  if (hPa === null) return null;
  let altM: number | null = null;
  try {
    const fix = await currentPosition();
    if (fix.alt !== null && (fix.altAccuracy === null || fix.altAccuracy <= MAX_VERTICAL_ACCURACY)) altM = fix.alt;
  } catch {
    // Sin GPS esta lectura no se puede separar del desnivel: se guarda sin altura y no cuenta para la tendencia.
  }
  const samples = addSample(usePressureWatch.getState().samples, { t: now, hPa, altM });
  write(LOG_KEY, samples);
  const trend = pressureTrend(samples);
  usePressureWatch.setState({ samples, trend, lastHPa: hPa });
  return trend;
}

/** Se monta una vez en la app desbloqueada. */
export function usePressureWatcher() {
  const { t } = useTranslation();
  const enabled = useSettings((s) => s.settings.pressureAlerts);
  const saver = useBatterySaver();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;

    async function cycle() {
      if (running || cancelled || document.visibilityState !== 'visible') return;
      running = true;
      try {
        if (!(await barometer().available())) return;
        const trend = await takeSample();
        if (!trend || cancelled) return;
        const last = read<{ state: PressureState; at: number } | null>(NOTIFIED_KEY, null);
        if (!shouldNotify(last, trend.state, Date.now()) || !canShowLocal()) return;
        write(NOTIFIED_KEY, { state: trend.state, at: Date.now() });
        const change = Math.abs(trend.changeHpa ?? 0).toFixed(1);
        await notificationBackend().showLocal({
          title: t(`pressureAlerts.notify.${trend.state}.title`),
          body: t(`pressureAlerts.notify.${trend.state}.body`, { change }),
          tag: 'pressure-trend',
          silent: false,
          url: '#/weather/forecast',
        });
      } finally {
        running = false;
      }
    }

    void cycle();
    const timer = setInterval(() => void cycle(), saver ? SAMPLE_MS.saver : SAMPLE_MS.normal);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, saver, t]);
}

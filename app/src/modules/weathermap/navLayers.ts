import { useEffect, useMemo, useState } from 'react';
import { fetchPyLevels, loadSavedPy, savePy, type PyLevels } from '@/modules/navigation/paraguayRivers';
import { fetchUyLevels, loadSavedUy, saveUy, type UyLevels } from '@/modules/navigation/uruguayRivers';
import { loadBoCatalog, fetchBoExtras, fetchBoLevels, loadSavedBo, loadSavedBoExtras, planillaFor, saveBo, saveBoExtras, type BoCatalog, type BoExtras, type BoLevels, type BoPlanillaRow } from '@/modules/navigation/bolivia';
import { fetchReadings, loadRivers, loadSavedReadings, riverState, saveReadings, type RiverReading, type RiversData, type RiverState, type RiverStation } from '@/modules/navigation/rivers';
import { loadTides, type TideStation, type TidesData } from '@/modules/navigation/tides';
import { fetchWaveGrid, loadSavedGrid, saveGrid, type WaveGrid } from './waveGrid';

/**
 * Capas de Navegación del mapa de alertas y clima: niveles de ríos (INA de Argentina y SENAMHI de Bolivia) y estaciones de mareas.
 * Los datos son los mismos de la pantalla Navegación; acá solo se arman como puntos para dibujar y tocar.
 */
export type NavState = RiverState | 'unknown';

export interface RiverPoint {
  id: string;
  source: 'ina' | 'bo' | 'uy' | 'py';
  name: string;
  river: string;
  lon: number;
  lat: number;
  /** Estado frente a los umbrales (INA); en Bolivia no hay umbrales, queda `unknown`. */
  state: NavState;
  /** INA: metros; Bolivia: centímetros sobre la escala. */
  level: number | null;
  /** Cuándo se midió: ISO (INA) o fecha AAAA-MM-DD (Bolivia). */
  at: string | null;
  alert: number | null;
  evac: number | null;
  low: number | null;
  /** Bolivia: ascenso, descenso o se mantiene. */
  trend?: 'rising' | 'falling' | 'steady';
  /** INA: la estación del catálogo (para pedir su pronóstico al tocarla). */
  station?: RiverStation;
  /** Bolivia: la amenaza que pronostica el SENAMHI para esta estación (planilla del pronóstico hidrológico), si sale en ella. */
  threat?: 'yellow' | 'orange' | 'red';
  forecast?: BoPlanillaRow;
  /** Uruguay: quién lo publica (CARU o DINAGUA), quién mide (UTE, OSE…) y cuánto cambió el nivel (m) respecto de la lectura anterior. */
  uySource?: 'CARU' | 'DINAGUA';
  provider?: string;
  change?: number | null;
  /** Paraguay: la ubicación es aproximada, y el máximo y mínimo históricos (m). */
  approx?: boolean;
  histMax?: { level: number; date: string } | null;
  histMin?: { level: number; date: string } | null;
}

export interface TidePoint {
  id: string;
  lon: number;
  lat: number;
  station: TideStation;
}

export function inaPoints(stations: RiverStation[], readings: Map<number, RiverReading>): RiverPoint[] {
  return stations.map((s) => {
    const r = readings.get(s.series);
    return { id: `ina-${s.id}`, source: 'ina', name: s.name, river: s.river, lon: s.lon, lat: s.lat, state: r ? riverState(r.level, s) : 'unknown', level: r?.level ?? null, at: r?.at ?? null, alert: s.alert, evac: s.evac, low: s.low, station: s };
  });
}

export function boPoints(catalog: BoCatalog, levels: BoLevels | null, planilla?: BoPlanillaRow[] | null): RiverPoint[] {
  const byName = new Map((levels?.readings ?? []).map((r) => [r.station, r]));
  return catalog.stations.flatMap((s) => {
    const r = byName.get(s.name);
    // Sin lectura no se dibuja: en Bolivia el catálogo trae todas las estaciones posibles y la mayoría no está en el reporte del día.
    if (!r) return [];
    const fc = planillaFor(planilla, s.name);
    return [{ id: `bo-${s.name}`, source: 'bo' as const, name: s.name, river: r.river, lon: s.lon, lat: s.lat, state: 'unknown' as const, level: r.lastCm, at: r.lastDate, alert: null, evac: null, low: null, trend: r.trend, ...(fc ? { threat: fc.threat, forecast: fc } : {}) }];
  });
}

/** Uruguay (CARU y DINAGUA, vía el servidor): todas las estaciones que llegan, en metros sobre el cero de cada una y sin umbrales (estado `unknown`). */
export function uyPoints(levels: UyLevels | null): RiverPoint[] {
  return (levels?.stations ?? []).map((s) => ({
    id: `uy-${s.id}`,
    source: 'uy' as const,
    name: s.name,
    river: '',
    lon: s.lon,
    lat: s.lat,
    state: 'unknown' as const,
    level: s.level,
    at: s.at,
    alert: null,
    evac: null,
    low: null,
    ...(s.trend ? { trend: s.trend } : {}),
    uySource: s.source,
    provider: s.provider,
    change: s.change,
  }));
}

/** Paraguay (DMH, vía el servidor): una lectura por día en metros sobre el cero de la escala y sin umbrales (estado `unknown`). */
export function pyPoints(levels: PyLevels | null): RiverPoint[] {
  return (levels?.stations ?? []).map((s) => ({
    id: `py-${s.code}`,
    source: 'py' as const,
    name: s.name,
    river: s.river,
    lon: s.lon,
    lat: s.lat,
    state: 'unknown' as const,
    level: s.level,
    at: s.date,
    alert: null,
    evac: null,
    low: null,
    ...(s.trend ? { trend: s.trend } : {}),
    change: s.changeCm === null ? null : s.changeCm / 100,
    approx: s.approx,
    histMax: s.max,
    histMin: s.min,
  }));
}

export function tidePoints(data: TidesData): TidePoint[] {
  return data.stations.map((station) => ({ id: station.id, lon: station.lon, lat: station.lat, station }));
}

const REFRESH_MS = 10 * 60_000;

/** Carga lo que piden las capas encendidas (los niveles se refrescan cada 10 minutos; sin conexión quedan los últimos guardados). */
export function useNavLayers(on: { rivers: boolean; tides: boolean; waves: boolean }, serverUrl: string | null | undefined, online: boolean, weatherUrl: string) {
  const [ina, setIna] = useState<RiversData | null>(null);
  const [readings, setReadings] = useState<Map<number, RiverReading>>(() => loadSavedReadings());
  const [boCatalog, setBoCatalog] = useState<BoCatalog | null>(null);
  const [boLevels, setBoLevels] = useState<BoLevels | null>(() => loadSavedBo());
  const [uyLevels, setUyLevels] = useState<UyLevels | null>(() => loadSavedUy());
  const [pyLevels, setPyLevels] = useState<PyLevels | null>(() => loadSavedPy());
  const [boExtras, setBoExtras] = useState<BoExtras | null>(() => loadSavedBoExtras());
  const [tides, setTides] = useState<TidesData | null>(null);
  const [waves, setWaves] = useState<WaveGrid | null>(() => loadSavedGrid());
  const server = serverUrl?.trim() || null;

  useEffect(() => {
    if (!on.rivers) return;
    void loadRivers().then(setIna, () => undefined);
    void loadBoCatalog().then(setBoCatalog, () => undefined);
  }, [on.rivers]);
  useEffect(() => {
    if (on.tides) void loadTides().then(setTides, () => undefined);
  }, [on.tides]);

  useEffect(() => {
    if (!on.rivers || !ina || !online) return;
    let cancelled = false;
    const load = () => {
      fetchReadings(ina.stations.map((s) => s.series)).then(
        (r) => {
          if (cancelled) return;
          saveReadings(r);
          setReadings(loadSavedReadings());
        },
        () => undefined,
      );
      if (server) {
        fetchBoLevels(server).then(
          (l) => {
            if (cancelled) return;
            saveBo(l);
            setBoLevels(l);
          },
          () => undefined,
        );
        fetchBoExtras(server).then(
          (e) => {
            if (cancelled) return;
            saveBoExtras(e);
            setBoExtras(e);
          },
          () => undefined,
        );
        fetchUyLevels(server).then(
          (l) => {
            if (cancelled) return;
            saveUy(l);
            setUyLevels(l);
          },
          () => undefined,
        );
        fetchPyLevels(server).then(
          (l) => {
            if (cancelled) return;
            savePy(l);
            setPyLevels(l);
          },
          () => undefined,
        );
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [on.rivers, ina, online, server]);

  // Oleaje: una consulta con toda la grilla, cada 30 minutos; sin conexión queda la última guardada.
  useEffect(() => {
    if (!on.waves || !online) return;
    let cancelled = false;
    const load = () =>
      void fetchWaveGrid(weatherUrl).then(
        (g) => {
          if (cancelled || !g) return;
          saveGrid(g);
          setWaves(g);
        },
        () => undefined,
      );
    load();
    const id = setInterval(load, 3 * REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [on.waves, online, weatherUrl]);

  const riverPoints = useMemo<RiverPoint[] | null>(() => {
    if (!on.rivers || !ina) return null;
    return [...inaPoints(ina.stations, readings), ...(boCatalog ? boPoints(boCatalog, boLevels, boExtras?.planilla?.rows) : []), ...uyPoints(uyLevels), ...pyPoints(pyLevels)];
  }, [on.rivers, ina, readings, boCatalog, boLevels, boExtras, uyLevels, pyLevels]);
  const tideList = useMemo(() => (on.tides && tides ? tidePoints(tides) : null), [on.tides, tides]);
  return { riverPoints, tidePoints: tideList, waves: on.waves ? waves : null };
}

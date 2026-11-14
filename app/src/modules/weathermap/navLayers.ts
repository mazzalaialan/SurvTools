import { useEffect, useMemo, useState } from 'react';
import { loadBoCatalog, fetchBoLevels, loadSavedBo, saveBo, type BoCatalog, type BoLevels } from '@/modules/navigation/bolivia';
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
  source: 'ina' | 'bo';
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

export function boPoints(catalog: BoCatalog, levels: BoLevels | null): RiverPoint[] {
  const byName = new Map((levels?.readings ?? []).map((r) => [r.station, r]));
  return catalog.stations.flatMap((s) => {
    const r = byName.get(s.name);
    // Sin lectura no se dibuja: en Bolivia el catálogo trae todas las estaciones posibles y la mayoría no está en el reporte del día.
    if (!r) return [];
    return [{ id: `bo-${s.name}`, source: 'bo' as const, name: s.name, river: r.river, lon: s.lon, lat: s.lat, state: 'unknown' as const, level: r.lastCm, at: r.lastDate, alert: null, evac: null, low: null, trend: r.trend }];
  });
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
      if (server)
        fetchBoLevels(server).then(
          (l) => {
            if (cancelled) return;
            saveBo(l);
            setBoLevels(l);
          },
          () => undefined,
        );
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
    return [...inaPoints(ina.stations, readings), ...(boCatalog ? boPoints(boCatalog, boLevels) : [])];
  }, [on.rivers, ina, readings, boCatalog, boLevels]);
  const tideList = useMemo(() => (on.tides && tides ? tidePoints(tides) : null), [on.tides, tides]);
  return { riverPoints, tidePoints: tideList, waves: on.waves ? waves : null };
}

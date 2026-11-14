import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfficialWeatherNotice } from '@/ui/OfficialWeatherNotice';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Locate, Minus, Pause, Play, Plus, RefreshCw, Scan } from 'lucide-react';
import { currentPosition } from '@/core/geo/useGeolocation';
import { useBatterySaver } from '@/core/power/saver';
import { useSettings, type WeatherMapLayers, type WeatherMapValue } from '@/core/settings/settings';
import { useCurrentCountry } from '@/modules/emergency/currentCountry';
import { useUnits } from '@/modules/weather/parts';
import { useWaypoints } from '@/modules/waypoints/store';
import { FullscreenStage } from '@/ui/FullscreenStage';
import { loadGeoData, type GeoData } from './geo';
import { imageSettled, preload } from './images';
import { MapCanvas, type MapFeature, type Overlay } from './MapCanvas';
import { useNavLayers } from './navLayers';
import { sourceEnabled } from '@/modules/navigation/sources';
import { compass8, seaState } from '@/modules/navigation/waves';
import { RiverForecastLine } from './RiverForecastLine';
import { TideGaugeLine } from './TideGaugeLine';
import { tideExtremes, tideLevelAt } from '@/modules/navigation/tides';
import { fitBounds, homeBounds, tileBBox, tilesFor, tileZoom, toMercator, viewBBox, zoomAt, type Size, type View } from './projection';
import { Notice } from '@/ui/Notice';
import {
  alertCovers,
  fetchHazards,
  fetchOfficialAlerts,
  liveAlerts,
  volcanoAlertAt,
  fetchLightning,
  fetchRainMap,
  fetchQuakes,
  fetchRadarFrames,
  fetchZoneWeather,
  FIRE_LAYER,
  fireDays,
  FRAME_COUNT,
  frameTimes,
  gibsUrl,
  isoMinute,
  latestGibsTime,
  RADAR_MAX_ZOOM,
  radarTileUrl,
  readMapCache,
  SATELLITE_LAYER,
  writeMapCache,
  type Hazard,
  type LightningBatch,
  type OfficialAlert,
  type VolcanoAlert,
  type RainMap,
  type Quake,
  type RadarFrames,
  type ZoneWeather,
} from './sources';

/** Las capas con datos de internet se renuevan si tienen más de esto. */
const STALE_MS = 10 * 60_000;
const FRAME_MS = 700;
/** Se piden las imágenes de satélite cuando la vista deja de moverse. */
const SETTLE_MS = 500;
/** Teselas de radar por cuadro (si hacen falta más, se usa un zoom menor). */
const RADAR_TILES_MAX = 16;
const PRELOAD_PARALLEL = 4;
const LAYER_KEYS: (keyof WeatherMapLayers)[] = ['official', 'satellite', 'satRain', 'radar', 'regionWeather', 'earthquakes', 'hazards', 'fires', 'volcanoes', 'lightning', 'rivers', 'tides', 'waves', 'waypoints'];
/** Cada cuánto se piden los rayos (el satélite saca un archivo cada 20 s). */
const LIGHTNING_MS = 20_000;
/** La lluvia estimada sale cada 10 minutos. */
const RAIN_MAP_MS = 5 * 60_000;
const VALUES: WeatherMapValue[] = ['temp', 'rain', 'wind'];
type SourceKey = 'satellite' | 'radar' | 'zoneWeather' | 'earthquakes' | 'hazards' | 'lightning' | 'satRain' | 'official';

export function WeatherMapPage() {
  const { t, i18n } = useTranslation();
  const layers = useSettings((s) => s.settings.weatherMapLayers);
  const zoneValue = useSettings((s) => s.settings.weatherMapValue);
  const base = useSettings((s) => s.settings.weatherUrl);
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const system = useSettings((s) => s.settings.units);
  const update = useSettings((s) => s.update);
  const { here: country } = useCurrentCountry();
  const saver = useBatterySaver();
  const u = useUnits(system, i18n.language);
  const waypointMap = useWaypoints((s) => s.waypoints);

  const [geo, setGeo] = useState<GeoData | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  /** Vista con la que se piden las imágenes (la última quieta). */
  const [request, setRequest] = useState<{ view: View; size: Size } | null>(null);
  const [selected, setSelected] = useState<MapFeature | null>(null);
  const [version, setVersion] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(() => Date.now());
  const nav = useNavLayers({ rivers: layers.rivers, tides: layers.tides, waves: layers.waves && sourceEnabled('open-meteo') }, serverUrl, online, base);

  const [quakes, setQuakes] = useState<{ fetchedAt: string; items: Quake[] } | null>(null);
  const [hazards, setHazards] = useState<{ fetchedAt: string; items: Hazard[] } | null>(null);
  const [official, setOfficial] = useState<{ fetchedAt: string; items: OfficialAlert[]; volcanoes?: VolcanoAlert[] } | null>(null);
  const showOfficial = layers.official && !!serverUrl;
  const [zones, setZones] = useState<{ fetchedAt: string; items: ZoneWeather[] } | null>(null);
  const [satTimes, setSatTimes] = useState<Date[] | null>(null);
  const [radar, setRadar] = useState<RadarFrames | null>(null);
  const [errors, setErrors] = useState<Set<SourceKey>>(new Set());
  const [loading, setLoading] = useState(false);
  const [frame, setFrame] = useState(FRAME_COUNT - 1);
  const [playing, setPlaying] = useState(false);
  const [here, setHere] = useState<{ lon: number; lat: number } | null>(null);
  const [lightning, setLightning] = useState<LightningBatch | null>(null);
  const showLightning = layers.lightning && !!serverUrl;
  const [rainMap, setRainMap] = useState<RainMap | null>(null);
  const showSatRain = layers.satRain && !!serverUrl;

  useEffect(() => {
    void loadGeoData().then(setGeo);
    void readMapCache().then((cache) => {
      if (cache.quakes) setQuakes(cache.quakes);
      if (cache.hazards) setHazards(cache.hazards);
      if (cache.official) setOfficial(cache.official);
      if (cache.zones) setZones(cache.zones);
    });
    const onLine = () => setOnline(navigator.onLine);
    window.addEventListener('online', onLine);
    window.addEventListener('offline', onLine);
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.removeEventListener('online', onLine);
      window.removeEventListener('offline', onLine);
      clearInterval(timer);
    };
  }, []);

  const handleView = useCallback((v: View, s: Size) => {
    setView(v);
    setSize(s);
  }, []);

  useEffect(() => {
    if (!view || !size) return;
    const timer = setTimeout(() => setRequest({ view, size }), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [view, size]);

  const fail = (key: SourceKey, failed: boolean) =>
    setErrors((prev) => {
      const next = new Set(prev);
      if (failed) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Descarga lo que está prendido; con `force`, aunque lo guardado sea reciente. */
  const refresh = useCallback(
    async (force: boolean) => {
      if (!navigator.onLine || !geo) return;
      const stale = (at: string | undefined) => force || !at || Date.now() - Date.parse(at) > STALE_MS;
      setLoading(true);
      const jobs: Promise<unknown>[] = [];
      if (layers.earthquakes && stale(quakes?.fetchedAt)) {
        jobs.push(
          fetchQuakes().then(
            async (items) => {
              const entry = { fetchedAt: new Date().toISOString(), items };
              setQuakes(entry);
              fail('earthquakes', false);
              await writeMapCache({ quakes: entry });
            },
            () => fail('earthquakes', true),
          ),
        );
      }
      if (layers.regionWeather && stale(zones?.fetchedAt)) {
        jobs.push(
          fetchZoneWeather(base, geo.capitals).then(
            async (items) => {
              const entry = { fetchedAt: new Date().toISOString(), items };
              setZones(entry);
              fail('zoneWeather', false);
              await writeMapCache({ zones: entry });
            },
            () => fail('zoneWeather', true),
          ),
        );
      }
      if (layers.satellite) {
        jobs.push(
          latestGibsTime(SATELLITE_LAYER).then(
            (latest) => {
              setSatTimes(frameTimes(latest, saver ? 1 : FRAME_COUNT));
              fail('satellite', false);
            },
            () => fail('satellite', true),
          ),
        );
      }
      if (layers.hazards && stale(hazards?.fetchedAt)) {
        jobs.push(
          fetchHazards().then(
            async (items) => {
              const entry = { fetchedAt: new Date().toISOString(), items };
              setHazards(entry);
              fail('hazards', false);
              await writeMapCache({ hazards: entry });
            },
            () => fail('hazards', true),
          ),
        );
      }
      // Alertas oficiales (SMN, DMC, INUMET): las junta el servidor propio; quedan guardadas para verlas sin conexión.
      if (showOfficial && stale(official?.fetchedAt)) {
        jobs.push(
          fetchOfficialAlerts(serverUrl).then(
            async ({ items, volcanoes }) => {
              const entry = { fetchedAt: new Date().toISOString(), items, volcanoes };
              setOfficial(entry);
              fail('official', false);
              await writeMapCache({ official: entry });
            },
            () => fail('official', true),
          ),
        );
      }
      if (layers.radar) {
        jobs.push(
          fetchRadarFrames().then(
            (frames) => {
              setRadar(saver ? { ...frames, frames: frames.frames.slice(-1) } : frames);
              fail('radar', false);
            },
            () => fail('radar', true),
          ),
        );
      }
      await Promise.all(jobs);
      setLoading(false);
      setFrame(FRAME_COUNT - 1);
    },
    // Las marcas de tiempo se leen en el momento; no deben reiniciar la descarga.
    [geo, layers, base, saver, showOfficial, serverUrl, official?.fetchedAt],
  );

  // Al abrir, al prender una capa y cada 10 minutos.
  useEffect(() => {
    void refresh(false);
    const timer = setInterval(() => void refresh(false), STALE_MS);
    return () => clearInterval(timer);
  }, [refresh, online]);

  // Rayos: cada minuto la tanda nueva reemplaza a la anterior (los viejos se borran).
  useEffect(() => {
    if (!showLightning || !online) return;
    let cancelled = false;
    const load = () =>
      // Solo con el mapa a la vista: en segundo plano no se pide nada.
      document.visibilityState === 'visible' &&
      fetchLightning(serverUrl).then(
        (batch) => {
          if (cancelled) return;
          setLightning(batch);
          fail('lightning', false);
        },
        () => !cancelled && fail('lightning', true),
      );
    void load();
    const timer = setInterval(() => void load(), LIGHTNING_MS);
    // Al volver a la app, se piden enseguida.
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [showLightning, online, serverUrl]);

  // Lluvia estimada: la imagen de la región la arma el servidor cada 10 minutos (solo mientras alguien la mira).
  useEffect(() => {
    if (!showSatRain || !online) return;
    let cancelled = false;
    const load = () =>
      document.visibilityState === 'visible' &&
      fetchRainMap(serverUrl).then(
        async (map) => {
          if (cancelled) return;
          if (map.image) await preload(map.image);
          if (cancelled) return;
          setRainMap(map);
          setVersion((v) => v + 1);
          fail('satRain', false);
        },
        () => !cancelled && fail('satRain', true),
      );
    void load();
    // Recién despertado, el servidor tarda un poco en tener la primera imagen.
    const first = setTimeout(() => void load(), 45_000);
    const timer = setInterval(() => void load(), RAIN_MAP_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [showSatRain, online, serverUrl]);

  // Mi ubicación, una sola lectura (el GPS gasta batería): para mis puntos y para los anillos de los rayos.
  // Mi ubicación, siempre que el permiso ya esté dado; con waypoints o rayos (los pidió el usuario), se pide si hace falta.
  const askHere = layers.waypoints || showLightning;
  useEffect(() => {
    let cancelled = false;
    const locate = () =>
      currentPosition().then(
        (fix) => !cancelled && setHere({ lon: fix.lon, lat: fix.lat }),
        () => undefined,
      );
    if (askHere) void locate();
    else
      void navigator.permissions
        ?.query({ name: 'geolocation' })
        .then((p) => p.state === 'granted' && locate())
        .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [askHere]);

  // El radar es de baja resolución: con pocas teselas por cuadro entra la animación entera en memoria.
  const radarTiles = useMemo(() => {
    if (!request) return [];
    for (let z = tileZoom(request.view, RADAR_MAX_ZOOM); ; z--) {
      const tiles = tilesFor(request.view, request.size, z);
      if (z === 0 || tiles.length <= RADAR_TILES_MAX) return tiles;
    }
  }, [request]);
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  const frameCount = Math.max(satTimes?.length ?? 1, radar?.frames.length ?? 1);
  const idxAt = (i: number, len: number) => Math.round((Math.min(i, frameCount - 1) * (len - 1)) / Math.max(1, frameCount - 1));
  const idx = (len: number) => idxAt(frame, len);

  /** Satélite y radar de un cuadro de la animación. */
  const frameOverlays = (i: number): Overlay[] => {
    if (!request) return [];
    const out: Overlay[] = [];
    if (layers.satellite && satTimes?.length) {
      const time = isoMinute(satTimes[idxAt(i, satTimes.length)]!);
      out.push({ url: gibsUrl(SATELLITE_LAYER, time, request.view, request.size, ratio), bbox: viewBBox(request.view, request.size), opacity: 0.75 });
    }
    if (layers.radar && radar?.frames.length) {
      const f = radar.frames[idxAt(i, radar.frames.length)]!;
      for (const tile of radarTiles) out.push({ url: radarTileUrl(radar.host, f.path, tile.z, tile.x, tile.y), bbox: tileBBox(tile.x, tile.y, tile.z), opacity: 0.85 });
    }
    return out;
  };
  const frameSettled = (i: number) => frameOverlays(i).every((o) => imageSettled(o.url));
  // `version` cambia con cada imagen que llega: se recalcula cuántos cuadros están listos.
  const settledFrames = Array.from({ length: frameCount }, (_, i) => frameSettled(i));
  const settledCount = settledFrames.filter(Boolean).length;
  const settledRef = useRef(settledFrames);
  settledRef.current = settledFrames;

  // Imágenes de toda la animación para la vista quieta, de a varias, del cuadro más nuevo al más viejo.
  useEffect(() => {
    if (!request || !online) return;
    let cancelled = false;
    const urls: string[] = [];
    for (let i = frameCount - 1; i >= 0; i--) for (const o of frameOverlays(i)) if (!urls.includes(o.url)) urls.push(o.url);
    if (layers.fires) for (const day of fireDays()) urls.push(gibsUrl(FIRE_LAYER, day, request.view, request.size, ratio));
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < urls.length) {
        const url = urls[next++]!;
        await preload(url);
        if (!cancelled) setVersion((v) => v + 1);
      }
    };
    for (let k = 0; k < PRELOAD_PARALLEL; k++) void worker();
    return () => {
      cancelled = true;
    };
    // frameOverlays depende de estos mismos datos.
  }, [request, satTimes, radar, radarTiles, layers.satellite, layers.fires, layers.radar, online, ratio, frameCount]);

  // Se saltean los cuadros que todavía no bajaron (si no, el radar aparece vacío en esa parte).
  useEffect(() => {
    if (!playing || frameCount < 2) return;
    const timer = setInterval(
      () =>
        setFrame((f) => {
          for (let k = 1; k <= frameCount; k++) {
            const n = (f + k) % frameCount;
            if (settledRef.current[n]) return n;
          }
          return f;
        }),
      FRAME_MS,
    );
    return () => clearInterval(timer);
  }, [playing, frameCount]);

  const overlays: Overlay[] = frameOverlays(frame);
  if (showSatRain && rainMap?.image) {
    // Debajo del radar (que donde hay es más preciso) y encima del satélite.
    const sw = toMercator(rainMap.bounds.west, rainMap.bounds.south);
    const ne = toMercator(rainMap.bounds.east, rainMap.bounds.north);
    const at = layers.satellite && satTimes?.length ? 1 : 0;
    overlays.splice(at, 0, { url: rainMap.image, bbox: { minX: sw.x, minY: sw.y, maxX: ne.x, maxY: ne.y }, opacity: 0.85 });
  }
  if (request && layers.fires) {
    const bbox = viewBBox(request.view, request.size);
    for (const day of fireDays()) overlays.push({ url: gibsUrl(FIRE_LAYER, day, request.view, request.size, ratio), bbox, opacity: 1, fire: true });
  }

  const activeAlerts = useMemo(() => liveAlerts(official?.items ?? [], now), [official, now]);
  const waypoints = useMemo(
    () => (layers.waypoints ? [...waypointMap.values()].map((w) => ({ id: w.id, name: w.name, lon: w.lon, lat: w.lat })) : null),
    [layers.waypoints, waypointMap],
  );

  const timeFmt = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const setLayer = (key: keyof WeatherMapLayers, on: boolean) => void update({ weatherMapLayers: { ...layers, [key]: on } });
  const zoom = (factor: number) => view && size && setView(zoomAt(view, size, factor));
  const animated = !saver && frameCount > 1 && (layers.satellite || layers.radar);
  const satTime = satTimes?.[idx(satTimes.length)];
  const radarTime = radar?.frames[idx(radar.frames.length)]?.time;
  const satRainTime = showSatRain && rainMap?.at ? new Date(rainMap.at) : undefined;

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/weather" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('weatherMap.title')}</h1>
        <button className="btn" type="button" onClick={() => void refresh(true)} disabled={!online || loading} aria-label={t('weather.refresh')}>
          <RefreshCw size={18} />
        </button>
      </div>

      {!online && <p className="hint" role="status">{t('weatherMap.offline')}</p>}
      {errors.size > 0 && (
        <p className="hint" role="status" data-testid="map-errors">
          {t('weatherMap.failed', { sources: [...errors].map((k) => t(`weatherMap.source.${k}`)).join(', ') })}
        </p>
      )}

      <FullscreenStage
        className="wmap"
        overlay={<MapTimes sat={layers.satellite ? satTime : undefined} rain={satRainTime} radar={layers.radar ? radarTime : undefined} fmt={timeFmt} />}
      >
        {geo ? (
          <MapCanvas
            geo={geo}
            view={view}
            onView={handleView}
            overlays={overlays}
            zones={layers.regionWeather ? (zones?.items ?? null) : null}
            zoneValue={zoneValue}
            quakes={layers.earthquakes ? (quakes?.items ?? null) : null}
            hazards={layers.hazards ? (hazards?.items ?? null) : null}
            official={showOfficial ? activeAlerts : null}
            volcanoes={layers.volcanoes ? geo.volcanoes : null}
            showRivers={layers.rivers}
            riverPoints={nav.riverPoints}
            tidePoints={nav.tidePoints}
            waves={nav.waves?.spots ?? null}
            volcanoAlerts={showOfficial ? (official?.volcanoes ?? null) : null}
            waypoints={waypoints}
            here={here}
            lightning={showLightning ? (lightning?.flashes ?? null) : null}
            rings={showLightning}
            animate={!saver}
            selected={selected}
            onSelect={setSelected}
            version={version}
            format={{ temp: u.temp, wind: u.windValue, rain: u.rain }}
            now={now}
          />
        ) : (
          <p className="hint">{t('weatherMap.loading')}</p>
        )}
        <div className="wmap-zoom">
          <button className="icon-btn" type="button" onClick={() => zoom(1.5)} aria-label={t('weatherMap.zoomIn')}>
            <Plus size={20} />
          </button>
          <button className="icon-btn" type="button" onClick={() => zoom(1 / 1.5)} aria-label={t('weatherMap.zoomOut')}>
            <Minus size={20} />
          </button>
          <button className="icon-btn" type="button" onClick={() => size && setView(fitBounds(homeBounds(country), size))} aria-label={t('weatherMap.reset')}>
            <Scan size={20} />
          </button>
          {here && (
            <button
              className="icon-btn"
              type="button"
              onClick={() => size && setView(fitBounds({ west: here.lon - 2, east: here.lon + 2, south: here.lat - 1.6, north: here.lat + 1.6 }, size))}
              aria-label={t('weatherMap.goHere')}
            >
              <Locate size={20} />
            </button>
          )}
        </div>
        {/* Dentro del mapa: también se usa en pantalla completa. */}
        {animated && (
          <div className="wmap-timeline">
            <button className="icon-btn" type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('weatherMap.pause') : t('weatherMap.play')}>
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <input
              type="range"
              min={0}
              max={frameCount - 1}
              value={Math.min(frame, frameCount - 1)}
              onChange={(e) => {
                setPlaying(false);
                setFrame(Number(e.target.value));
              }}
              aria-label={t('weatherMap.timeline')}
            />
            {online && settledCount < frameCount && (
              <span className="wmap-progress" role="status" data-testid="frames-progress">
                {t('weatherMap.loadingFrames', { done: settledCount, total: frameCount })}
              </span>
            )}
          </div>
        )}
      </FullscreenStage>

      <MapTimes sat={layers.satellite ? satTime : undefined} rain={satRainTime} radar={layers.radar ? radarTime : undefined} fmt={timeFmt} />

      {selected && <FeatureCard feature={selected} u={u} now={now} volcanoAlerts={showOfficial ? official?.volcanoes : undefined} onClose={() => setSelected(null)} />}
      {showOfficial && official && <AlertsHere alerts={activeAlerts} here={here} waypoints={waypointMap} onSelect={(a) => setSelected({ kind: 'official', item: a })} />}

      <section className="card stack" aria-labelledby="wmap-layers">
        <h2 id="wmap-layers" className="section-title" style={{ margin: 0 }}>{t('weatherMap.layers')}</h2>
        <div className="chips" role="group" aria-label={t('weatherMap.layers')}>
          {LAYER_KEYS.filter((k) => k !== 'waves' || sourceEnabled('open-meteo')).map((key) => {
            // Los rayos los junta el servidor propio: sin servidor, no hay.
            const noServer = (key === 'lightning' || key === 'satRain' || key === 'official') && !serverUrl;
            return (
              <button
                key={key}
                type="button"
                className="chip"
                aria-pressed={layers[key] && !noServer}
                disabled={noServer}
                title={noServer ? t('weatherMap.needsServer') : undefined}
                onClick={() => setLayer(key, !layers[key])}
              >
                {t(`weatherMap.layer.${key}`)}
              </button>
            );
          })}
        </div>
        {layers.regionWeather && (
          <div className="chips" role="group" aria-label={t('weatherMap.zoneValue')}>
            {VALUES.map((v) => (
              <button key={v} type="button" className="chip" aria-pressed={zoneValue === v} onClick={() => void update({ weatherMapValue: v })}>
                {t(`weatherMap.value.${v}`)}
              </button>
            ))}
          </div>
        )}
        <Legend layers={{ ...layers, lightning: showLightning, satRain: showSatRain, official: showOfficial }} zoneValue={zoneValue} windUnit={u.windUnit} />
        {showLightning && (
          <p className="hint" style={{ margin: 0 }} data-testid="lightning-status">
            {lightning?.updatedAt
              ? t('weatherMap.lightningStatus', { count: lightning.flashes.length, time: timeFmt.format(new Date(lightning.updatedAt)) })
              : t('weatherMap.lightningWaiting')}
          </p>
        )}
      </section>

      <Notice id="weatherMap.disclaimer">{t('weatherMap.disclaimer')}</Notice>
      <OfficialWeatherNotice />
    </div>
  );
}

function MapTimes({ sat, rain, radar, fmt }: { sat: Date | undefined; rain?: Date; radar: Date | undefined; fmt: Intl.DateTimeFormat }) {
  const { t } = useTranslation();
  if (!sat && !radar && !rain) return null;
  return (
    <p className="hint wmap-times" data-testid="map-times">
      {[
        sat && t('weatherMap.satelliteAt', { time: fmt.format(sat) }),
        rain && t('weatherMap.satRainAt', { time: fmt.format(rain) }),
        radar && t('weatherMap.radarAt', { time: fmt.format(radar) }),
      ]
        .filter(Boolean)
        .join(' · ')}
    </p>
  );
}

function Legend({ layers, zoneValue, windUnit }: { layers: WeatherMapLayers; zoneValue: WeatherMapValue; windUnit: string }) {
  const { t } = useTranslation();
  const items: [boolean, string, string][] = [
    [layers.official, 'official', t('weatherMap.legend.official')],
    [layers.regionWeather && zoneValue === 'wind', 'wind', t('weatherMap.legend.wind', { unit: windUnit })],
    [layers.satellite, 'satellite', t('weatherMap.legend.satellite')],
    [layers.satRain, 'satRain', t('weatherMap.legend.satRain')],
    [layers.radar, 'radar', t('weatherMap.legend.radar')],
    [layers.earthquakes, 'quake', t('weatherMap.legend.earthquakes')],
    [layers.hazards, 'hazard', t('weatherMap.legend.hazards')],
    [layers.volcanoes, 'volcano', t('weatherMap.legend.volcanoes')],
    [layers.fires, 'fire', t('weatherMap.legend.fires')],
    [layers.lightning, 'lightning', t('weatherMap.legend.lightning')],
    [layers.rivers, 'rivers', t('weatherMap.legend.rivers')],
    [layers.tides, 'tides', t('weatherMap.legend.tides')],
    [layers.waves && sourceEnabled('open-meteo'), 'waves', t('weatherMap.legend.waves')],
  ];
  const shown = items.filter(([on]) => on);
  if (shown.length === 0) return null;
  return (
    <ul className="wmap-legend">
      {shown.map(([, key, text]) => (
        <li key={key}>
          <span className={`wmap-swatch wmap-swatch-${key}`} aria-hidden /> {text}
        </li>
      ))}
    </ul>
  );
}

function FeatureCard({
  feature,
  u,
  now,
  volcanoAlerts,
  onClose,
}: {
  feature: MapFeature;
  u: ReturnType<typeof useUnits>;
  now: number;
  volcanoAlerts?: VolcanoAlert[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const n1 = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const n2 = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  let title = '';
  let lines: string[] = [];
  let link: string | null = null;
  let to: string | null = null;
  switch (feature.kind) {
    case 'quake': {
      const q = feature.item;
      title = t('weatherMap.quakeTitle', { mag: n1.format(q.mag) });
      const hours = Math.round((now - q.time) / 3_600_000);
      lines = [q.place, `${when.format(new Date(q.time))} · ${t('weatherMap.hoursAgo', { count: hours })}`, t('weatherMap.depth', { km: Math.round(q.depthKm) })];
      link = q.url;
      break;
    }
    case 'hazard': {
      const h = feature.item;
      const day = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
      title = h.name;
      lines = [
        `${t(`weatherMap.hazardType.${h.type}`)} · ${t(`weatherMap.hazardLevel.${h.level}`)}`,
        t('weatherMap.hazardDates', { from: day.format(new Date(h.from)), to: day.format(new Date(h.to)) }),
        h.severity,
      ].filter(Boolean);
      link = h.url;
      break;
    }
    case 'official': {
      const a = feature.item;
      title = a.headline;
      lines = [
        `${a.senderName || a.source} · ${t(`weatherMap.severity.${a.severity}`)}`,
        t('weatherMap.alertValid', { from: when.format(new Date(a.onset)), to: when.format(new Date(a.expires)) }),
        a.areas.map((x) => x.desc).filter(Boolean).slice(0, 4).join(' · '),
        a.description,
        a.instruction,
        t('weatherMap.alertVerbatim', { sender: a.senderName || a.source }),
      ].filter(Boolean);
      link = a.web;
      break;
    }
    case 'volcano': {
      const v = feature.item;
      const alert = volcanoAlertAt(volcanoAlerts, v.lat, v.lon);
      title = v.name;
      lines = [
        alert ? t('weatherMap.volcanoAlert', { level: t(`weatherMap.volcanoLevel.${alert.level}`), agency: alert.source === 'CENVUL' ? 'CENVUL, IGP' : 'OAVV, SEGEMAR' }) : '',
        [v.type, v.country].filter(Boolean).join(' · '),
        v.elevation !== null ? t('weatherMap.elevation', { value: u.altitude(v.elevation) }) : '',
        v.lastEruption === null
          ? t('weatherMap.eruptionUnknown')
          : t('weatherMap.lastEruption', { year: v.lastEruption < 0 ? t('weatherMap.bce', { year: -v.lastEruption }) : v.lastEruption }),
      ].filter(Boolean);
      link = alert?.report ?? `https://volcano.si.edu/volcano.cfm?vn=${v.id}`;
      break;
    }
    case 'zone': {
      const z = feature.item;
      title = z.name;
      lines = [
        `${u.temp(z.temp)} · ${z.precip > 0 ? u.rain(z.precip) : t('weather.noRain')}`,
        `${t('weatherMap.windLine', { speed: u.wind(z.windSpeed), gusts: u.wind(z.gusts) })}`,
      ];
      break;
    }
    case 'river': {
      const r = feature.item;
      const day = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
      const m = (v: number | null) => (v === null ? '—' : `${n2.format(v)} m`);
      title = r.river ? `${r.name} · ${r.river}` : r.name;
      if (r.source === 'bo') {
        lines = [
          t('weatherMap.riverBoLevel', { cm: r.level ?? '—', date: r.at ? day.format(new Date(r.at)) : '—' }),
          r.trend ? t(`navigation.bolivia.trend.${r.trend}`) : '',
        ].filter(Boolean);
      } else {
        lines = [
          r.level !== null && r.at
            ? `${t('weatherMap.riverLevel', { value: m(r.level) })} · ${t(`navigation.rivers.state.${r.state === 'unknown' ? 'normal' : r.state}`)} · ${t('weatherMap.riverMeasured', { ago: when.format(new Date(r.at)) })}`
            : t('weatherMap.riverNoReading'),
          r.alert !== null || r.evac !== null || r.low !== null ? t('weatherMap.riverThresholds', { alert: m(r.alert), evac: m(r.evac), low: m(r.low) }) : '',
        ].filter(Boolean);
      }
      to = '/weather/navigation';
      break;
    }
    case 'tide': {
      const st = feature.item.station;
      const at = new Date(now);
      const lvl = tideLevelAt(st, at);
      const soon = tideLevelAt(st, new Date(now + 10 * 60_000));
      const sgn = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
      title = t('weatherMap.tideNearTitle', { name: st.name });
      const next = tideExtremes(st, at, new Date(now + 14 * 3_600_000))
        .filter((e) => e.time.getTime() >= now)
        .slice(0, 2)
        .map((e) => t('weatherMap.tideNext', { what: t(e.high ? 'navigation.tides.high' : 'navigation.tides.low').toLowerCase(), time: when.format(e.time), level: sgn.format(e.level) }));
      lines = [t('navigation.tides.now', { level: sgn.format(lvl), trend: t(soon >= lvl ? 'navigation.tides.rising' : 'navigation.tides.falling') }), ...next];
      to = '/weather/navigation';
      break;
    }
    case 'wave': {
      const w = feature.item;
      title = t('weatherMap.waveTitle', { h: n1.format(w.height) });
      lines = [
        [
          t(`navigation.waves.state.${seaState(w.height)}`),
          w.period !== null ? t('navigation.waves.period', { s: Math.round(w.period) }) : '',
          w.direction !== null ? t('navigation.waves.from', { dir: t(`navigation.waves.compass.${compass8(w.direction)}`) }) : '',
        ]
          .filter(Boolean)
          .join(' · '),
        w.swellHeight !== null ? t('navigation.waves.swell', { h: n1.format(w.swellHeight), s: Math.round(w.swellPeriod ?? 0) }) : '',
        t('weatherMap.waveModel'),
      ].filter(Boolean);
      to = '/weather/navigation';
      break;
    }
    case 'waypoint':
      title = feature.item.name;
      lines = [t('weatherMap.myWaypoint')];
      break;
  }
  return (
    <section className="card stack" data-testid="map-feature" aria-live="polite">
      <div className="row-between">
        <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>
        <button className="btn" type="button" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      {lines.map((l) => (
        <p key={l} className="hint" style={{ margin: 0 }}>
          {l}
        </p>
      ))}
      {feature.kind === 'tide' && sourceEnabled('ioc') ? <TideGaugeLine station={feature.item.station} /> : null}
      {feature.kind === 'river' && feature.item.station?.forecast?.length ? <RiverForecastLine station={feature.item.station} now={now} /> : null}
      {to && (
        <Link to={to} data-testid="feature-nav-link">
          {t('weatherMap.navMore')}
        </Link>
      )}
      {link && (
        <a href={link} target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden /> {t('weatherMap.moreInfo')}
        </a>
      )}
    </section>
  );
}

/**
 * Alertas oficiales vigentes donde estoy y en mis waypoints: la lista, para
 * no tener que buscarlas en el mapa. Tocar una la muestra arriba.
 */
function AlertsHere({
  alerts,
  here,
  waypoints,
  onSelect,
}: {
  alerts: OfficialAlert[];
  here: { lat: number; lon: number } | null;
  waypoints: Map<string, { name: string; lat: number; lon: number }>;
  onSelect: (a: OfficialAlert) => void;
}) {
  const { t, i18n } = useTranslation();
  const when = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const places = [...(here ? [{ name: t('weatherMap.alertHere'), lat: here.lat, lon: here.lon }] : []), ...waypoints.values()];
  const hits = alerts
    .map((a) => ({ a, at: places.filter((p) => alertCovers(a, p.lat, p.lon)).map((p) => p.name) }))
    .filter((x) => x.at.length);
  return (
    <section className="card stack" aria-labelledby="alerts-here-title" data-testid="alerts-here">
      <h2 id="alerts-here-title" className="section-title" style={{ margin: 0 }}>{t('weatherMap.alertsHereTitle')}</h2>
      {hits.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>{t(places.length ? 'weatherMap.alertsHereNone' : 'weatherMap.alertsHereNoPlaces', { count: alerts.length })}</p>
      ) : (
        <ul className="list">
          {hits.map(({ a, at }) => (
            <li key={a.key} className="contact-row">
              <button type="button" className="list-main alert-row" onClick={() => onSelect(a)}>
                <span className="list-title">
                  <span className={`alert-dot alert-${a.severity}`} aria-hidden /> {a.headline}
                </span>
                <span className="list-sub">
                  {a.senderName || a.source} · {t(`weatherMap.severity.${a.severity}`)} · {t('weatherMap.alertUntil', { time: when.format(new Date(a.expires)) })}
                </span>
                <span className="list-sub">{at.join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

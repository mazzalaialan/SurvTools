import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Locate, MapPin, Pencil, Trash2, X } from 'lucide-react';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { formatDms } from '@/core/geo/geo';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { useHeading } from '@/core/sensors/useHeading';
import { useSettings, type MapLayers } from '@/core/settings/settings';
import { RecordButton, useRecordedLines } from '@/modules/tracks/Recording';
import { gapLines } from '@/modules/tracks/record';
import { useRecorder } from '@/modules/tracks/recorder';
import { useTracks } from '@/modules/tracks/store';
import { routePoints, useWaypoints } from '@/modules/waypoints/store';
import { loadGeoData } from '@/modules/weathermap/geo';
import { outlineFeatures } from './outline';
import { withLayer } from './layerExclusion';
import { biomeName, ecoregionName, ecoregionsGeoJSON, ECOREGIONS_CREDIT, finerLookup, loadEcoregions, type EcoregionData } from '@/modules/ecoregions/ecoregions';
import { fineCredit, useFineEcoregions } from '@/modules/ecoregions/EcoregionViews';
import { geologyAt, geologyGeoJSON, inGeologyCoverage, unitAge, type GeologyUnit } from '@/modules/layers/geology';
import { useGeologyIndex } from '@/modules/layers/GeologyViews';
import { FullscreenStage } from '@/ui/FullscreenStage';
import './appSources';
import { CameraButtons } from './CameraButtons';
import { ImportedMaps } from './ImportedMaps';
import type { ImportedMap } from './imported';
import { MapView, type MapTrack, type ViewState } from './MapView';
import { useMapTools } from './MapTools';
import { invalidateLayers } from '@/modules/layers/zoneLayers';
import { useMapZones, zoneKeys, type MapZone } from './store';
import { TrackPicker } from './TrackPicker';
import { tracksToShow } from './trackSelect';
import { carryPrevailing, chooseSnowline, chooseWind, fetchFreezingSeries, fetchSnowline, needsLivePrevailing, needsRefresh, readSnowline, saveSnowline, type Snowline } from './snowline';
import { compassList, fetchPrevailing, leeAspects } from './wind';
import { archiveContains, serverMaps, type ServerMaps } from './sources';
import { downloadLayerTiles, zoneLayerTiles } from '@/modules/layers/zoneLayers';
import { circleBounds, DETAILS, downloadZone, planZone, removeZoneTiles, zoneSource, type DetailId, type DownloadProgress } from './tiles';
import { confirmAction } from '@/ui/confirm';

// 100 y 200 km solo entran en el límite del servidor propio.
const RADII = [2, 5, 10, 20, 50, 100, 200];
const LAYER_KEYS: (keyof MapLayers)[] = ['hillshade', 'contours', 'slope', 'ecoregions', 'geology', 'mine', 'tracks'];
const SLOPE_ZONES = ['low', 'caution', 'avalanche', 'steep', 'extreme'] as const;
/** Vista que muestra un track entero (centro y zoom según lo que ocupa). */
function trackView(tr: { segments: [number, number, number | null, number?][][] }): ViewState | null {
  const pts = tr.segments.flat();
  if (pts.length === 0) return null;
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const span = Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lons) - Math.min(...lons)) * Math.cos((lats[0]! * Math.PI) / 180), 0.002);
  const zoom = Math.min(16, Math.max(7, Math.log2(360 / span) - 1.2));
  return { lat: (Math.max(...lats) + Math.min(...lats)) / 2, lon: (Math.max(...lons) + Math.min(...lons)) / 2, zoom };
}

/** Centro de la Argentina, mientras no haya GPS ni zonas. */
const DEFAULT_VIEW: ViewState = { lat: -38.4, lon: -63.6, zoom: 3.6 };
/** Última vista, para volver al mismo lugar al reabrir la pantalla. */
let lastView: ViewState | null = null;

export function MapsPage() {
  const { t, i18n } = useTranslation();
  const layers = useSettings((s) => s.settings.mapLayers);
  const update = useSettings((s) => s.update);
  const waypointMap = useWaypoints((s) => s.waypoints);
  const routeMap = useWaypoints((s) => s.routes);
  const trackMap = useTracks((s) => s.tracks);
  // Desde un track ("Ver en el mapa"): el mapa arranca mostrándolo entero.
  const [params] = useSearchParams();
  // ?track=<id> enmarca un track; ?tracks=<id>,<id>… varios juntos (una salida de Entrenamiento).
  const focusTrack = params.get('track')
    ? trackMap.get(params.get('track')!)
    : params.get('tracks')
      ? { segments: params.get('tracks')!.split(',').flatMap((id) => trackMap.get(id)?.segments ?? []) }
      : undefined;
  const { zones, missing, add, remove, loaded, load } = useMapZones();
  // El módulo se carga recién al abrir la pantalla (después de desbloquear): las zonas se leen acá.
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const { fix } = useGeolocation();
  // Vista que te sigue (y gira con la brújula) o libre; la brújula solo se escucha al seguirte.
  const [follow, setFollow] = useState(false);
  const caps = useCapabilities((s) => s.caps);
  const heading = useHeading(fix, follow && (caps?.orientation ?? false));
  const [online, setOnline] = useState(navigator.onLine);
  // ?bajar=lat,lon (oferta al llegar a otro país): el mapa abre en ese lugar y el panel de descarga de zona.
  const [bajar] = useState(() => {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(params.get('bajar') ?? '');
    return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  });
  const [initial] = useState<ViewState>(() => (focusTrack ? trackView(focusTrack) : null) ?? (bajar ? { ...bajar, zoom: 10 } : null) ?? lastView ?? (zones[0] ? { lat: zones[0].lat, lon: zones[0].lon, zoom: 11 } : DEFAULT_VIEW));
  const [view, setView] = useState<ViewState>(initial);
  const [flyTo, setFlyTo] = useState<(ViewState & { key: number }) | null>(null);
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  // Ecorregiones: el archivo se carga la primera vez que se prende la capa (y queda guardado para usarlo sin conexión).
  const [eco, setEco] = useState<EcoregionData | null>(null);
  const [ecoFailed, setEcoFailed] = useState(false);
  /** Punto tocado en el mapa (con la capa prendida): la ficha de ecorregión es de ese punto y no del centro. */
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ name: string; radiusKm: number; detail: DetailId; editId?: string } | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [abort, setAbort] = useState<AbortController | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  const [imported, setImported] = useState<ImportedMap[]>([]);
  const [tilesVersion, setTilesVersion] = useState(0);
  const snowlineManual = useSettings((s) => s.settings.snowlineManual);
  const snowlineFallback = useSettings((s) => s.settings.snowlineFallback);
  const weatherUrl = useSettings((s) => s.settings.weatherUrl);
  const serverUrl = useSettings((s) => s.settings.serverUrl);
  const sourceMode = useSettings((s) => s.settings.mapSource);
  // Qué mapas tiene el servidor propio (undefined: todavía no se sabe).
  const [serverInfo, setServerInfo] = useState<ServerMaps | null | undefined>(undefined);
  useEffect(() => {
    if (!online || sourceMode === 'public' || !serverUrl.trim()) {
      setServerInfo(null);
      return;
    }
    let cancelled = false;
    void serverMaps(serverUrl).then((v) => !cancelled && setServerInfo(v));
    return () => {
      cancelled = true;
    };
  }, [online, sourceMode, serverUrl]);
  const [snowline, setSnowline] = useState<Snowline | null>(null);
  const [snowlineError, setSnowlineError] = useState(false);

  // Línea de nieve (capa de avalanchas): la última guardada y, con conexión, la del lugar que se mira.
  useEffect(() => {
    void readSnowline().then(setSnowline);
  }, []);
  const snowKey = `${view.lat.toFixed(1)},${view.lon.toFixed(1)}`;
  useEffect(() => {
    // Aunque la línea de nieve esté a mano: la misma consulta trae el viento.
    if (!layers.slope || !online) return;
    const at = { lat: view.lat, lon: view.lon };
    // Se espera a que el mapa quede quieto.
    const timer = setTimeout(() => {
      void readSnowline().then((saved) => {
        if (!needsRefresh(saved, at)) return;
        fetchSnowline(weatherUrl, at.lat, at.lon).then(
          async (fresh) => {
            const s = carryPrevailing(saved, fresh);
            await saveSnowline(s);
            setSnowline(s);
            setSnowlineError(false);
          },
          () => setSnowlineError(true),
        );
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [layers.slope, online, snowKey, weatherUrl]);
  // Con conexión, la del lugar; sin conexión, la del pronóstico guardado con la zona más cercana; nunca una de otro lugar.
  const choice = chooseSnowline({ lat: view.lat, lon: view.lon }, snowline, zones);
  // Sin isoterma para esta zona: la altura que eligió el usuario para ese caso.
  const slopeMin = snowlineManual ?? (choice.source === 'none' ? snowlineFallback : choice.meters);
  // Carga por viento (subopción del riesgo de avalancha): la de los últimos 7 días y el sotavento habitual, rayados juntos.
  const windOn = layers.slope && layers.windLoad;
  // Posibles cornisas (también subopción): usan el mismo viento, aunque el rayado esté apagado.
  const corniceOn = layers.slope && layers.cornices;
  // Sin zona descargada cerca con el suyo: el viento habitual del lugar, una vez por lugar (~50 KB).
  const [prevailingFailed, setPrevailingFailed] = useState(false);
  const wantPrevailing = (windOn || corniceOn) && online && !!snowline && needsLivePrevailing({ lat: view.lat, lon: view.lon }, snowline, zones);
  useEffect(() => {
    if (!wantPrevailing || !snowline) return;
    let cancelled = false;
    fetchPrevailing(weatherUrl, snowline.lat, snowline.lon).then(
      async (p) => {
        const current = await readSnowline();
        if (cancelled || !current || current.at !== snowline.at) return;
        const s = { ...current, prevailing: p.from };
        await saveSnowline(s);
        setSnowline(s);
      },
      () => !cancelled && setPrevailingFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [wantPrevailing, snowline?.at, weatherUrl]);
  const wind = chooseWind({ lat: view.lat, lon: view.lon }, snowline, zones);
  // Con conexión, mientras llega el dato del lugar no se raya: lo supuesto (del oeste) solo sin conexión o si la consulta falla.
  const livePending = online && !snowlineError && needsRefresh(snowline, { lat: view.lat, lon: view.lon });
  const recentPending = livePending && !wind.recent?.zone;
  const usualPending = online && wind.usual.source === 'default' && (livePending || (wantPrevailing && !prevailingFailed));
  const slopeLee = windOn && !recentPending && wind.recent ? leeAspects(wind.recent.from) : [];
  const slopeLeeUsual = windOn && !usualPending ? leeAspects(wind.usual.from) : [];
  const slopeCornice = corniceOn
    ? [...new Set([...(!recentPending && wind.recent ? leeAspects(wind.recent.from) : []), ...(!usualPending ? leeAspects(wind.usual.from) : [])])]
    : [];
  const recentText = () => {
    const r = wind.recent;
    if (recentPending) return t('maps.windLoading');
    if (!r) return t('maps.windNoData');
    const lee = compassList(leeAspects(r.from), i18n.language);
    const from = compassList(r.from, i18n.language);
    if (r.from.length === 0) return r.zone ? t('maps.windQuietZone', { zone: r.zone, ago: ago(r.at) }) : t('maps.windQuietLive', { ago: ago(r.at) });
    return r.zone ? t('maps.windZone', { lee, from, zone: r.zone, ago: ago(r.at) }) : t('maps.windRecent', { lee, from, ago: ago(r.at) });
  };
  const usualText = () => {
    const u = wind.usual;
    if (usualPending) return t('maps.windUsualLoading');
    const lee = compassList(leeAspects(u.from), i18n.language);
    if (u.source === 'default') return t('maps.windUsualDefault', { lee });
    return t('maps.windUsual', { lee, from: compassList(u.from, i18n.language), place: u.zone ? t('maps.windPlaceZone', { zone: u.zone }) : t('maps.windPlaceHere') });
  };
  const fmtM = (m: number) => `${new Intl.NumberFormat(i18n.language).format(m)} m`;
  const ago = (at: number) => {
    const min = Math.round((Date.now() - at) / 60_000);
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
    return min < 60 ? rtf.format(-min, 'minute') : min < 2880 ? rtf.format(-Math.round(min / 60), 'hour') : rtf.format(-Math.round(min / 1440), 'day');
  };

  useEffect(() => {
    const onLine = () => setOnline(navigator.onLine);
    window.addEventListener('online', onLine);
    window.addEventListener('offline', onLine);
    // Contorno de referencia sin teselas (el del mapa de tiempo).
    void loadGeoData().then((geo) => setOutline(outlineFeatures(geo)));
    return () => {
      window.removeEventListener('online', onLine);
      window.removeEventListener('offline', onLine);
    };
  }, []);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null));
  }, [zones]);

  // La primera vez que llega el GPS (y sin vista previa), el mapa va a tu ubicación.
  const [centered, setCentered] = useState(lastView !== null || !!focusTrack);
  useEffect(() => {
    if (fix && !centered) {
      setCentered(true);
      setFlyTo({ lat: fix.lat, lon: fix.lon, zoom: 12, key: Date.now() });
    }
  }, [fix, centered]);

  const waypoints = useMemo(() => [...waypointMap.values()].map((w) => ({ id: w.id, name: w.name, lat: w.lat, lon: w.lon })), [waypointMap]);
  const routes = useMemo(
    () => [...routeMap.values()].map((r) => ({ id: r.id, name: r.name, points: routePoints(r, waypointMap).map((w) => [w.lon, w.lat] as [number, number]) })),
    [routeMap, waypointMap],
  );
  // Qué recorridos se dibujan (ver trackSelect.ts): con muchos tracks superpuestos no se entiende nada, así que por defecto solo el que se
  // graba o el último; se pueden elegir, ver todos o ninguno. El que se abre desde su ficha se ve siempre.
  const trackMode = useSettings((s) => s.settings.mapTracksMode);
  const trackChosen = useSettings((s) => s.settings.mapTracksChosen);
  const showImported = useSettings((s) => s.settings.mapImportedShow);
  const recStatus = useRecorder((s) => s.status);
  const recGaps = useRecorder((s) => s.track?.gaps);
  const focusIds = useMemo(() => (params.get('track') ? [params.get('track')!] : params.get('tracks') ? params.get('tracks')!.split(',') : []), [params]);
  const shownTracks = useMemo(() => tracksToShow(trackMap.values(), trackMode, trackChosen, recStatus !== 'idle', focusIds, showImported), [trackMap, trackMode, trackChosen, recStatus, focusIds, showImported]);
  const tracks = useMemo<MapTrack[]>(
    () =>
      // El que se está grabando va aparte, en su color.
      shownTracks.map((tr, index) => ({
        id: tr.id,
        name: tr.name,
        index,
        lines: tr.segments.map((seg) => seg.map(([lat, lon]) => [lon, lat] as [number, number])),
        points: tr.waypoints.map((w) => ({ name: w.name, lat: w.lat, lon: w.lon })),
      })),
    [shownTracks],
  );
  // Los cortes (pantalla apagada) de lo que se graba y de lo que se ve: rectas punteadas en otro color.
  const gapLinesAll = useMemo(() => [...gapLines(recGaps), ...shownTracks.flatMap((tr) => gapLines(tr.gaps))], [recGaps, shownTracks]);
  const recorded = useRecordedLines();
  const here = useMemo(() => (fix ? { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy } : null), [fix]);
  const tools = useMapTools(fix ? { lat: fix.lat, lon: fix.lon, alt: fix.alt } : null);
  useEffect(() => {
    if (!layers.ecoregions || eco) return;
    let cancelled = false;
    void loadEcoregions().then((d) => {
      if (cancelled) return;
      setEco(d);
      setEcoFailed(!d);
    });
    return () => {
      cancelled = true;
    };
  }, [layers.ecoregions, eco]);
  const fine = useFineEcoregions();
  // La cobertura fina (bosque andino patagónico de las zonas descargadas) va encima de la gruesa de RESOLVE.
  const ecoGeo = useMemo(() => {
    if (!layers.ecoregions || !eco) return null;
    const coarse = ecoregionsGeoJSON(eco, i18n.language);
    return fine ? { ...coarse, features: [...coarse.features, ...ecoregionsGeoJSON(fine, i18n.language).features] } : coarse;
  }, [layers.ecoregions, eco, fine, i18n.language]);
  const ecoPoint = picked && layers.ecoregions ? picked : view;
  const ecoHere = layers.ecoregions && eco ? finerLookup(eco, fine).lookup(ecoPoint.lat, ecoPoint.lon) : null;
  const ecoFine = !!(ecoHere && fine?.ecoregions.some((e) => e.id === ecoHere.id));
  // Geología: lo guardado (base nacional y detalle de las zonas) y, si no hay detalle y hay conexión y servidor propio, una consulta en línea.
  const geoOn = layers.geology && inGeologyCoverage(ecoPoint.lat, ecoPoint.lon);
  const geoIdx = useGeologyIndex(layers.geology);
  const geoHit = geoOn && geoIdx ? geologyAt(geoIdx, ecoPoint.lat, ecoPoint.lon) : null;
  const [geoOnline, setGeoOnline] = useState<{ key: string; unit: GeologyUnit | null } | null>(null);
  const geoKey = `${ecoPoint.lat.toFixed(4)},${ecoPoint.lon.toFixed(4)}`;
  useEffect(() => {
    if (!geoOn || geoHit?.detail || !online || !serverUrl.trim()) return;
    const timer = setTimeout(() => {
      fetch(`${serverUrl.trim().replace(/\/+$/, '')}/api/layers/geology/point?lat=${ecoPoint.lat.toFixed(4)}&lon=${ecoPoint.lon.toFixed(4)}`, { signal: AbortSignal.timeout(15_000) })
        .then((r) => (r.ok ? (r.json() as Promise<{ unit: GeologyUnit | null }>) : null))
        .then((j) => j && setGeoOnline({ key: geoKey, unit: j.unit }))
        .catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoOn, geoKey, online, serverUrl, !!geoHit?.detail]);
  const geoUnit = geoHit?.detail ? geoHit.unit : geoOnline?.key === geoKey && geoOnline.unit ? geoOnline.unit : (geoHit?.unit ?? null);
  const geoViaOnline = !geoHit?.detail && geoOnline?.key === geoKey && !!geoOnline.unit;
  const geoGeo = useMemo(() => (layers.geology && geoIdx ? geologyGeoJSON(geoIdx) : null), [layers.geology, geoIdx]);
  const zoneCircles = useMemo(() => zones.map((z) => ({ id: z.id, name: z.name, lat: z.lat, lon: z.lon, radiusKm: z.radiusKm })), [zones]);
  const maxZoom = panel ? DETAILS.find((d) => d.id === panel.detail)!.maxZoom : 0;
  // Al editar una zona el centro es el de la zona (no el del mapa).
  const editing = panel?.editId ? zones.find((z) => z.id === panel.editId) : undefined;
  const center = editing ?? view;
  const plan = useMemo(() => (panel ? planZone(center.lat, center.lon, panel.radiusKm, maxZoom) : null), [panel, center.lat, center.lon, maxZoom]);
  const source = plan && serverInfo !== undefined ? zoneSource(plan, serverInfo, sourceMode) : null;
  // Una zona que ya está entera en un mapa importado no hace falta bajarla.
  const coveredBy = plan ? imported.find((m) => m.kind === 'vector' && archiveContains({ ...m, updatedAt: m.importedAt }, plan.bounds, plan.maxZoom)) : undefined;
  const preview = useMemo(() => (panel ? { id: 'preview', name: panel.name, lat: center.lat, lon: center.lon, radiusKm: panel.radiusKm } : null), [panel, center.lat, center.lon]);

  const mb = (bytes: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: bytes < 10 * 1024 * 1024 ? 1 : 0 }).format(bytes / 1024 / 1024);
  const setLayer = (key: keyof MapLayers, on: boolean) => void update({ mapLayers: withLayer(layers, key, on) });

  function openPanel() {
    setMessage(null);
    setPanel({ name: t('maps.defaultName', { n: zones.length + 1 }), radiusKm: 10, detail: 'trails' });
    if (view.zoom < 9) setFlyTo({ ...view, zoom: 10, key: Date.now() });
  }

  function openEdit(z: MapZone) {
    setMessage(null);
    const detail = DETAILS.find((d) => d.maxZoom <= z.maxZoom)?.id ?? 'trails';
    setPanel({ name: z.name, radiusKm: z.radiusKm, detail, editId: z.id });
    setFlyTo({ lat: z.lat, lon: z.lon, zoom: Math.max(5, 11 - Math.round(Math.log2(Math.max(1, z.radiusKm / 10)))), key: Date.now() });
  }

  const bajarOpened = useRef(false);
  useEffect(() => {
    if (bajar && online && !bajarOpened.current) {
      bajarOpened.current = true;
      openPanel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bajar, online]);

  /**
   * Baja el detalle de geología (SEGEMAR 1:250.000) y de vegetación (bosque andino patagónico) de la zona, del servidor propio: sin servidor,
   * o fuera de Argentina, la zona queda sin detalle (la base nacional sigue valiendo).
   */
  async function fetchLayers(lat: number, lon: number, radiusKm: number, signal: AbortSignal): Promise<{ layers: boolean; failed: number; covered: boolean }> {
    const tiles = zoneLayerTiles(circleBounds(lat, lon, radiusKm));
    if (!tiles.length) return { layers: false, failed: 0, covered: false };
    if (!serverUrl.trim() || !navigator.onLine) return { layers: false, failed: 0, covered: true };
    const r = await downloadLayerTiles(serverUrl, tiles, signal, (done, total) => setProgress((p) => ({ bytes: 0, failed: 0, ...p, done, total })));
    return { layers: r.ok > 0, failed: r.failed, covered: true };
  }

  /** Agranda o achica una zona ya bajada: baja solo las teselas que faltan y borra las que ya no usa ninguna zona. */
  async function saveEdit(zone: MapZone) {
    if (!panel || !plan) return;
    const name = panel.name.trim() || zone.name;
    const missingDetail = !zone.layers && !!serverUrl.trim() && zoneLayerTiles(circleBounds(zone.lat, zone.lon, panel.radiusKm)).length > 0;
    if (panel.radiusKm === zone.radiusKm && maxZoom === zone.maxZoom && !missingDetail) {
      await add({ ...zone, name });
      setPanel(null);
      setMessage(name === zone.name ? t('maps.noChanges') : t('maps.zoneUpdated', { name, mb: mb(zone.bytes) }));
      return;
    }
    const oldKeys = new Set(zoneKeys(zone));
    const newKeys = zoneKeys({ lat: zone.lat, lon: zone.lon, radiusKm: panel.radiusKm, maxZoom, layers: zone.layers || missingDetail });
    const grows = newKeys.some((k) => !oldKeys.has(k));
    const controller = new AbortController();
    setAbort(controller);
    setMessage(null);
    try {
      let bytes = Math.round((zone.bytes * plan.bytes) / Math.max(1, planZone(zone.lat, zone.lon, zone.radiusKm, zone.maxZoom).bytes));
      let failed = zone.failed;
      if (grows) {
        setProgress({ done: 0, total: 1, bytes: 0, failed: 0 });
        const result = await downloadZone(plan, setProgress, controller.signal, { vectorPublic: source?.ok ? source.vectorPublic : true });
        bytes = result.bytes;
        failed = result.failed;
      }
      const lay = await fetchLayers(zone.lat, zone.lon, panel.radiusKm, controller.signal);
      const updated: MapZone = { ...zone, name, radiusKm: panel.radiusKm, maxZoom, bytes, failed, layers: lay.layers || !!zone.layers };
      await add(updated);
      // Lo que quedó afuera de la zona nueva se borra, salvo que lo use otra zona.
      const keep = new Set([...zoneKeys(updated), ...useMapZones.getState().zones.filter((z) => z.id !== zone.id).flatMap(zoneKeys)]);
      await removeZoneTiles([...oldKeys], keep);
      invalidateLayers();
      setPanel(null);
      setMessage(t('maps.zoneUpdated', { name, mb: mb(bytes) }) + (lay.failed ? ' ' + t('geology.detailPartial', { count: lay.failed }) : ''));
    } catch {
      setMessage(controller.signal.aborted ? t('maps.cancelled') : t('maps.failed'));
    } finally {
      setProgress(null);
      setAbort(null);
    }
  }

  async function startDownload() {
    if (!panel || !plan || !source?.ok) return;
    const controller = new AbortController();
    setAbort(controller);
    setProgress({ done: 0, total: 1, bytes: 0, failed: 0 });
    setMessage(null);
    // Que el navegador no borre los mapas si se queda sin espacio.
    void navigator.storage?.persist?.();
    try {
      const result = await downloadZone(plan, setProgress, controller.signal, { vectorPublic: source.vectorPublic });
      // La isoterma de 0 °C de los próximos días, para la capa de avalanchas sin conexión (si falla, la zona igual sirve).
      // Y el viento habitual con nieve (histórico), para el rayado de sotavento sin datos recientes.
      const [freezing, prevailing] = await Promise.all([
        fetchFreezingSeries(weatherUrl, view.lat, view.lon).catch(() => undefined),
        fetchPrevailing(weatherUrl, view.lat, view.lon).catch(() => undefined),
      ]);
      const lay = await fetchLayers(view.lat, view.lon, panel.radiusKm, controller.signal);
      const zone: MapZone = {
        id: crypto.randomUUID(),
        name: panel.name.trim() || t('maps.defaultName', { n: zones.length + 1 }),
        lat: view.lat,
        lon: view.lon,
        radiusKm: panel.radiusKm,
        maxZoom,
        bytes: result.bytes,
        failed: result.failed,
        createdAt: new Date().toISOString(),
        ...(lay.layers ? { layers: true } : {}),
        ...(freezing ? { freezing } : {}),
        ...(prevailing ? { prevailing } : {}),
      };
      await add(zone);
      setPanel(null);
      const detail = lay.layers ? t(lay.failed ? 'geology.detailPartial' : 'geology.detailOn', { count: lay.failed }) : lay.covered ? t('geology.detailOff') : '';
      setMessage((result.failed ? t('maps.doneWithErrors', { name: zone.name, count: result.failed }) : t('maps.done', { name: zone.name, mb: mb(result.bytes) })) + (detail ? ' ' + detail : ''));
    } catch {
      setMessage(controller.signal.aborted ? t('maps.cancelled') : t('maps.failed'));
    } finally {
      setProgress(null);
      setAbort(null);
    }
  }

  async function handleRemove(zone: MapZone) {
    if (!(await confirmAction(t('maps.confirmDelete', { name: zone.name })))) return;
    await remove(zone.id);
  }

  const selectedWp = selected ? waypointMap.get(selected) : undefined;

  return (
    <div className="stack">
      <div className="page-head">
        <Link className="icon-btn" to="/orientation" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.maps.title')}</h1>
      </div>
      {!online && <p className="hint" role="status">{t('maps.offline')}</p>}

      <FullscreenStage className="maps-stage" overlay={tools.overlay}>
        <MapView
          initial={initial}
          layers={{ ...layers, slopeMin, slopeLee, slopeLeeUsual, slopeCornice }}
          showMine={layers.mine}
          waypoints={waypoints}
          routes={routes}
          tracks={tracks}
          showTracks={layers.tracks}
          here={here}
          zones={zoneCircles}
          preview={preview}
          outline={outline}
          ecoregions={ecoGeo}
          geology={geoGeo}
          flyTo={flyTo}
          tilesVersion={tilesVersion}
          follow={follow && !!fix}
          heading={heading?.trueHeading ?? null}
          onFollowBreak={() => setFollow(false)}
          recorded={recorded}
          gapLines={gapLinesAll}
          onMove={(v) => {
            lastView = v;
            setView(v);
          }}
          onWaypoint={setSelected}
          tool={tools.tool}
          measure={tools.measure}
          target={tools.target}
          onMapClick={tools.onMapClick}
          onPick={(p) => (layers.ecoregions || layers.geology) && setPicked(p)}
          onContextMenu={tools.onContextMenu}
          onMoveStart={tools.closeMenu}
        />
        {tools.floating}
        {tools.menu}
        <CameraButtons threeD={layers.terrain3d} onThreeD={(on) => setLayer('terrain3d', on)} follow={follow && !!fix} onFollow={setFollow} canFollow={!!fix}>
          <RecordButton />
        </CameraButtons>
        {fix && (
          <button className="icon-btn maps-locate" type="button" onClick={() => setFlyTo({ lat: fix.lat, lon: fix.lon, zoom: Math.max(view.zoom, 13), key: Date.now() })} aria-label={t('maps.goHere')}>
            <Locate size={20} />
          </button>
        )}
      </FullscreenStage>
      {tools.toolbar}
      {tools.panel}
      <p className="hint maps-center" data-testid="map-center">
        {t('maps.center', { coords: formatDms(view, t('geo.westLetter')), zoom: Math.round(view.zoom) })}
      </p>

      {layers.ecoregions && (eco || ecoFailed) && (
        <p className="hint" style={{ margin: 0 }} data-testid="map-ecoregion">
          {ecoFailed || !eco
            ? t('maps.ecoUnavailable')
            : ecoHere
              ? t(picked ? 'maps.ecoPicked' : 'maps.ecoHere', { name: ecoregionName(ecoHere, i18n.language), biome: biomeName(ecoFine && fine ? fine : eco, ecoHere), coords: formatDms(ecoPoint, t('geo.westLetter')) })
              : t(picked ? 'maps.ecoPickedNone' : 'maps.ecoNone', { coords: formatDms(ecoPoint, t('geo.westLetter')) })}
          {picked && (
            <>
              {' '}
              <button className="btn" type="button" onClick={() => setPicked(null)} data-testid="eco-pick-clear">{t('maps.ecoPickClear')}</button>
            </>
          )}
        </p>
      )}

      {layers.geology && (
        <p className="hint" style={{ margin: 0 }} data-testid="map-geology">
          {geoUnit
            ? t(picked ? 'geology.picked' : 'geology.here', { name: geoUnit.name, age: unitAge(geoUnit), litho: geoUnit.litho, coords: formatDms(ecoPoint, t('geo.westLetter')) }) + (geoViaOnline ? ' ' + t('geology.online') : '')
            : t('geology.none')}
          {picked && (
            <>
              {' '}
              <button className="btn" type="button" onClick={() => setPicked(null)} data-testid="geo-pick-clear">{t('maps.ecoPickClear')}</button>
            </>
          )}
        </p>
      )}

      {selectedWp && (
        <section className="card row-between" data-testid="map-waypoint">
          <span>
            <MapPin size={16} aria-hidden /> <strong>{selectedWp.name}</strong>
          </span>
          <span className="row-end">
            <Link className="btn" to={`/orientation/waypoints/${selectedWp.id}/go`}>{t('goto.button')}</Link>
            <button className="icon-btn" type="button" onClick={() => setSelected(null)} aria-label={t('common.close')}>
              <X size={18} />
            </button>
          </span>
        </section>
      )}

      <section className="card stack" aria-labelledby="maps-layers">
        <h2 id="maps-layers" className="section-title" style={{ margin: 0 }}>{t('maps.layers')}</h2>
        <div className="chips" role="group" aria-label={t('maps.layers')}>
          {LAYER_KEYS.map((key) => (
            <button key={key} type="button" className="chip" aria-pressed={layers[key]} onClick={() => setLayer(key, !layers[key])}>
              {t(`maps.layer.${key}`)}
            </button>
          ))}
        </div>
        {layers.ecoregions && <p className="hint" style={{ margin: 0 }}>{t('maps.ecoCredit', { credit: ECOREGIONS_CREDIT })}{fine ? ' ' + t('maps.ecoCreditFine', { credit: fineCredit(fine) }) : ''}</p>}
        {layers.geology && <p className="hint" style={{ margin: 0 }}>{t('geology.credit', { credit: geoIdx?.credits.join('; ') ?? '' })} {t('geology.legend')}</p>}
        {layers.tracks && <TrackPicker tracks={trackMap.values()} recordingActive={recStatus !== 'idle'} />}
        {layers.slope && (
          <div className="stack" style={{ gap: 4 }} data-testid="slope-legend">
            <ul className="incl-legend">
              {SLOPE_ZONES.map((z) => (
                <li key={z} data-zone={z}>
                  <span className="incl-swatch" aria-hidden />
                  {t(`inclinometer.legend.${z}`)}
                </li>
              ))}
              {layers.windLoad && (
                <>
                  <li>
                    <span className="incl-swatch hatched" aria-hidden />
                    {t('maps.windLegend')}
                  </li>
                  <li>
                    <span className="incl-swatch hatched-usual" aria-hidden />
                    {t('maps.windLegendUsual')}
                  </li>
                </>
              )}
              {layers.cornices && (
                <li data-testid="cornice-legend">
                  <span className="incl-swatch cornice" aria-hidden />
                  {t('maps.corniceLegend')}
                </li>
              )}
            </ul>
            <p className="hint" style={{ margin: 0 }} data-testid="snowline-status">
              {snowlineManual !== null
                ? t('maps.snowlineManualStatus', { m: fmtM(snowlineManual) })
                : choice.source === 'live'
                  ? t('maps.snowlineAuto', { m: fmtM(choice.meters), freezing: fmtM(choice.freezingMin), ago: ago(choice.at) })
                  : choice.source === 'zone'
                    ? t('maps.snowlineZone', { m: fmtM(choice.meters), freezing: fmtM(choice.freezingMin), zone: choice.zone, ago: ago(choice.at) })
                    : snowlineError || !online
                      ? t('maps.snowlineNone', { m: fmtM(snowlineFallback) })
                      : t('maps.snowlineLoading')}
            </p>
            <label className="check">
              <input type="checkbox" checked={layers.windLoad} onChange={(e) => setLayer('windLoad', e.target.checked)} />
              {t('maps.windToggle')}
            </label>
            <label className="check">
              <input type="checkbox" checked={layers.cornices} onChange={(e) => setLayer('cornices', e.target.checked)} data-testid="cornice-toggle" />
              {t('maps.corniceToggle')}
            </label>
            {layers.windLoad && (
              <>
                <p className="hint" style={{ margin: 0 }} data-testid="wind-recent">
                  {recentText()}
                </p>
                <p className="hint" style={{ margin: 0 }} data-testid="wind-usual">
                  {usualText()}
                </p>
              </>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={snowlineManual !== null}
                onChange={(e) => void update({ snowlineManual: e.target.checked ? (choice.source === 'none' ? snowlineFallback : choice.meters) : null })}
              />
              {t('maps.snowlineManual')}
            </label>
            {snowlineManual === null && choice.source === 'none' && (
              <div className="field">
                <label htmlFor="snowline-fallback">{t('maps.snowlineFallback')}</label>
                <input
                  id="snowline-fallback"
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={7000}
                  step={50}
                  value={snowlineFallback}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) void update({ snowlineFallback: Math.min(7000, Math.round(v)) });
                  }}
                />
              </div>
            )}
            {snowlineManual !== null && (
              <div className="field">
                <label htmlFor="snowline-m">{t('maps.snowlineFrom')}</label>
                <input
                  id="snowline-m"
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={7000}
                  step={50}
                  value={snowlineManual}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) void update({ snowlineManual: Math.min(7000, Math.round(v)) });
                  }}
                />
              </div>
            )}
            <p className="hint" style={{ margin: 0 }}>{t('maps.slopeHint')}</p>
          </div>
        )}
      </section>

      <section className="card stack" aria-labelledby="maps-zones">
        <h2 id="maps-zones" className="section-title" style={{ margin: 0 }}>{t('maps.zones')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('maps.zonesHint')}</p>
        {message && <p className="hint" role="status" data-testid="zone-message">{message}</p>}

        {panel ? (
          <div className="stack" data-testid="zone-panel">
            <div className="field">
              <label htmlFor="zone-name">{t('maps.zoneName')}</label>
              <input id="zone-name" className="input" value={panel.name} onChange={(e) => setPanel({ ...panel, name: e.target.value })} disabled={!!progress} />
            </div>
            <div className="field">
              <label htmlFor="zone-radius">{t('maps.radius')}</label>
              <select id="zone-radius" className="select" value={panel.radiusKm} onChange={(e) => setPanel({ ...panel, radiusKm: Number(e.target.value) })} disabled={!!progress}>
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    {t('maps.km', { count: r })}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="zone-detail">{t('maps.detail')}</label>
              <select id="zone-detail" className="select" value={panel.detail} onChange={(e) => setPanel({ ...panel, detail: e.target.value as DetailId })} disabled={!!progress}>
                {DETAILS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {t(`maps.details.${d.id}`)}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint" style={{ margin: 0 }}>{editing ? t('maps.editHint', { name: editing.name }) : t('maps.centerHint')}</p>
            {plan && (
              <p className={!source || source.ok ? 'hint' : 'error'} style={{ margin: 0 }} data-testid="zone-estimate">
                {t('maps.estimate', { tiles: plan.vectorTiles + plan.demTiles, mb: mb(plan.bytes) })}
                {source && ' '}
                {source &&
                  (source.ok
                    ? t(source.from === 'server' ? 'maps.fromServer' : 'maps.fromPublic')
                    : t(`maps.${source.reason}`, { tiles: serverInfo?.maxZoneTiles ?? 0, mb: serverInfo?.maxZoneMb ?? 0 }))}
              </p>
            )}
            {coveredBy && (
              <p className="hint" style={{ margin: 0 }} data-testid="zone-covered">
                {t('maps.coveredByImport', { name: coveredBy.name })}
              </p>
            )}
            {progress && (
              <div role="status" aria-live="polite">
                <span className="progress">
                  <span className="progress-bar" style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }} />
                </span>
                <span className="hint">{t('maps.progress', { done: progress.done, total: progress.total, mb: mb(progress.bytes) })}</span>
              </div>
            )}
            <div className="row-end">
              {progress ? (
                <button className="btn" type="button" onClick={() => abort?.abort()}>
                  {t('common.cancel')}
                </button>
              ) : (
                <>
                  <button className="btn" type="button" onClick={() => setPanel(null)}>
                    {t('common.cancel')}
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => void (editing ? saveEdit(editing) : startDownload())} disabled={editing ? !!progress : !online || !source?.ok}>
                    <Download size={18} /> {editing ? t('maps.saveChanges') : t('maps.download')}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" type="button" onClick={openPanel} disabled={!online}>
            <Download size={18} /> {t('maps.downloadHere')}
          </button>
        )}

        {zones.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>{t('maps.noZones')}</p>
        ) : (
          <ul className="list" data-testid="zone-list">
            {zones.map((z) => (
              <li key={z.id} className="list-row">
                <button className="list-main zone-go" type="button" onClick={() => setFlyTo({ lat: z.lat, lon: z.lon, zoom: 11, key: Date.now() })}>
                  <span className="list-title">{z.name}</span>
                  <span className="list-sub">
                    {missing.has(z.id)
                      ? t('maps.notOnDevice')
                      : t('maps.zoneSummary', { km: z.radiusKm, mb: mb(z.bytes), date: new Date(z.createdAt).toLocaleDateString(i18n.language) }) + (z.layers ? ' · ' + t('maps.zoneWithDetail') : '')}
                  </span>
                </button>
                <button className="icon-btn" type="button" data-testid={`zone-edit-${z.id}`} onClick={() => openEdit(z)} disabled={!!progress || missing.has(z.id)} aria-label={t('maps.editZone', { name: z.name })}>
                  <Pencil size={18} />
                </button>
                <button className="icon-btn" type="button" onClick={() => void handleRemove(z)} aria-label={t('maps.delete', { name: z.name })}>
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {usage !== null && <p className="hint" style={{ margin: 0 }}>{t('maps.usage', { mb: mb(usage) })}</p>}
        <p className="hint" style={{ margin: 0 }} data-testid="map-source-hint">
          {t('maps.sourceHint', { mode: t(`maps.source.${sourceMode}`) })}
        </p>
      </section>

      <ImportedMaps
        onShow={(v) => {
          // El mapa está arriba: se sube para verlo.
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setFlyTo({ ...v, key: Date.now() });
        }} onChange={(l) => {
          setImported(l);
          setTilesVersion((v) => v + 1);
        }} />

      <p className="hint">{t('maps.attribution')}</p>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, Search } from 'lucide-react';
import { useCapability } from '@/core/capabilities/capabilities';
import { CARDINALS, cardinalOf } from '@/core/geo/geo';
import { declinationAt, orientationFrom } from '@/core/sensors/heading';
import { useDeviceAngles } from '@/core/sensors/useDeviceAngles';
import { useSettings, type StarmapLayers } from '@/core/settings/settings';
import { useEffectiveTheme, useThemeOverride } from '@/core/settings/theme';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { FullscreenStage } from '@/ui/FullscreenStage';
import { Segmented } from '@/ui/Segmented';
import { buildScene, loadSkyData, type SkyData } from './scene';
import { cameraFromDevice, cameraLookingAt, PLANETS, vectorToHorizontal, type Camera, type Horizontal, type PlanetId, type Vec3 } from './sky';
import { SkyCanvas, type SkyTarget, type SkyView } from './SkyCanvas';

type Mode = 'dome' | 'camera';

const MIN_FOV = 20;
const MAX_FOV = 100;
/** Suavizado de la cámara del celular (0 = quieta, 1 = sin suavizar). */
const SMOOTHING = 0.3;

const add = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Fecha y hora local para un <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function StarMapPage() {
  const { t, i18n } = useTranslation();
  const hasCompass = useCapability('orientation');
  const { place, picker } = usePlacePicker();
  const baseTheme = useSettings((s) => s.settings.theme);
  const autoRed = useSettings((s) => s.settings.starmapRed);
  const layers = useSettings((s) => s.settings.starmapLayers);
  const updateSettings = useSettings((s) => s.update);
  const theme = useEffectiveTheme();
  const setThemeOverride = useThemeOverride((s) => s.setOverride);

  const [data, setData] = useState<SkyData | null>(null);
  const [mode, setMode] = useState<Mode>('dome');
  const [custom, setCustom] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [followCompass, setFollowCompass] = useState(true);
  const [manualView, setManualView] = useState<Horizontal | null>(null);
  const [domeTop, setDomeTop] = useState<number | null>(null);
  const [fov, setFov] = useState(60);
  const [query, setQuery] = useState('');
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const smoothed = useRef<Camera | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    void loadSkyData().then(setData);
  }, []);

  // Rojo nocturno al entrar (si está activada la opción); al salir vuelve el tema de siempre.
  useEffect(() => {
    if (useSettings.getState().settings.starmapRed) setThemeOverride('red');
    return () => setThemeOverride(null);
  }, [setThemeOverride]);

  // "Ahora" avanza solo; con una fecha elegida, el cielo queda fijo.
  useEffect(() => {
    if (custom) return;
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [custom]);

  const date = custom ? new Date(custom) : now;
  const minute = Math.floor(date.getTime() / 60_000);
  const lat = place ? Math.round(place.lat * 100) / 100 : null;
  const lon = place ? Math.round(place.lon * 100) / 100 : null;
  const scene = useMemo(
    () => (data && lat !== null && lon !== null ? buildScene(data, new Date(minute * 60_000), lat, lon, i18n.language) : null),
    [data, lat, lon, minute, i18n.language],
  );
  const south = (lat ?? -1) < 0;
  const declination = useMemo(() => (lat === null || lon === null ? 0 : declinationAt(lat, lon)), [lat, lon]);

  const useDevice = hasCompass && (mode === 'camera' || followCompass);
  const angles = useDeviceAngles(useDevice);

  // Vista: cámara del celular, o manual (arrastrando) si no hay brújula.
  let view: SkyView;
  if (mode === 'camera') {
    let camera: Camera;
    if (hasCompass && angles) {
      const raw = cameraFromDevice(angles.alpha, angles.beta, angles.gamma, declination, angles.screenAngle, fov);
      const prev = smoothed.current;
      const forward = prev ? norm(add(prev.forward, raw.forward, SMOOTHING)) : raw.forward;
      const up0 = prev ? norm(add(prev.up, raw.up, SMOOTHING)) : raw.up;
      const right = norm(cross(forward, up0));
      camera = { forward, right, up: cross(right, forward), fov };
      smoothed.current = camera;
    } else {
      camera = cameraLookingAt(manualView ?? { az: south ? 180 : 0, alt: 35 }, fov);
    }
    view = { kind: 'camera', camera };
  } else {
    // En la cúpula, con brújula y el celular acostado, arriba queda hacia donde apunta el celular.
    const compassTop = hasCompass && followCompass && angles ? orientationFrom(angles.alpha, angles.beta, angles.gamma).heading + declination : null;
    view = { kind: 'dome', top: compassTop ?? domeTop ?? (south ? 180 : 0) };
  }

  // Búsqueda: planetas, estrellas con nombre y constelaciones.
  const targets = useMemo(() => {
    if (!scene) return [];
    const list: { key: string; label: string; v: Vec3 }[] = scene.planets.map((p) => ({ key: `p:${p.id}`, label: t(`starmap.planets.${p.id}`), v: p.v }));
    for (const s of scene.stars) if (s.name) list.push({ key: `s:${s.name}`, label: s.name, v: s.v });
    for (const c of scene.constellations) list.push({ key: `c:${c.id}`, label: c.name, v: c.center });
    return list;
  }, [scene, t]);
  const target = targets.find((x) => x.key === targetKey) ?? null;
  const skyTarget: SkyTarget | null = target && { v: target.v, label: target.label };
  const targetPos = target ? vectorToHorizontal(target.v) : null;

  function chooseTarget(text: string) {
    setQuery(text);
    const match = targets.find((x) => x.label.toLowerCase() === text.trim().toLowerCase());
    setTargetKey(match?.key ?? null);
  }

  const labels = useMemo(
    () => ({
      planets: Object.fromEntries(PLANETS.map((p) => [p, t(`starmap.planets.${p}`)])) as Record<PlanetId, string>,
      cardinals: CARDINALS.map((c) => t(`geo.cardinal.${c}`)),
      pole: south ? t('starmap.southPole') : t('starmap.northPole'),
      horizonPoint: south ? t('starmap.south') : t('starmap.north'),
    }),
    [t, south],
  );

  // Arrastrar: sin brújula se mueve la vista (o se gira la cúpula) con el dedo o el mouse.
  const manualDrag = mode === 'camera' ? !(hasCompass && angles) : !(hasCompass && followCompass && angles);
  function onPointerDown(e: PointerEvent) {
    if (!manualDrag) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    const h = e.currentTarget.clientHeight || 1;
    if (mode === 'camera' && view.kind === 'camera') {
      const current = manualView ?? { az: south ? 180 : 0, alt: 35 };
      setManualView({ az: (current.az - (dx * fov) / h + 360) % 360, alt: Math.max(-10, Math.min(90, current.alt + (dy * fov) / h)) });
    } else if (view.kind === 'dome') {
      setDomeTop(((view.top - dx * 0.4) % 360 + 360) % 360);
    }
  }

  /** Solo para esta pantalla: apagarlo gana también sobre el rojo automático por horario. */
  function setRed(on: boolean) {
    setThemeOverride(on ? 'red' : baseTheme === 'red' ? 'dark' : baseTheme);
  }

  const setLayer = (key: keyof StarmapLayers, on: boolean) => void updateSettings({ starmapLayers: { ...layers, [key]: on } });
  const LAYER_KEYS: (keyof StarmapLayers)[] = ['constellationLines', 'constellationNames', 'starNames', 'planets', 'guide', 'grid'];

  const fmtDeg = (n: number) => `${Math.round(n)}°`;
  const looking = view.kind === 'camera' ? vectorToHorizontal(view.camera.forward) : null;
  const pointing =
    looking && t('starmap.pointing', { az: fmtDeg(looking.az), dir: t(`geo.cardinal.${cardinalOf(looking.az)}`), alt: fmtDeg(looking.alt) });
  const targetLine =
    target && targetPos
      ? targetPos.alt > 0
        ? t('starmap.where', { name: target.label, az: fmtDeg(targetPos.az), dir: t(`geo.cardinal.${cardinalOf(targetPos.az)}`), alt: fmtDeg(targetPos.alt) })
        : t('starmap.belowHorizon', { name: target.label })
      : null;

  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.starmap.title')}</h1>

      <Segmented<Mode>
        label={t('starmap.view')}
        value={mode}
        options={[
          { value: 'dome', label: t('starmap.dome') },
          { value: 'camera', label: t('starmap.camera') },
        ]}
        onChange={(m) => {
          setMode(m);
          smoothed.current = null;
        }}
      />

      {!scene ? (
        <p className="empty">{data ? t('starmap.needPlace') : t('starmap.loading')}</p>
      ) : (
        <>
          <FullscreenStage
            className="sky-stage"
            data-mode={mode}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            overlay={
              <>
                {pointing && <span className="fs-big">{pointing}</span>}
                {targetLine && <span>{targetLine}</span>}
              </>
            }
          >
            <SkyCanvas scene={scene} view={view} red={theme === 'red'} layers={layers} target={skyTarget} labels={labels} />
            {mode === 'camera' && (
              <div className="sky-zoom">
                <button className="icon-btn" type="button" onClick={() => setFov(Math.max(MIN_FOV, fov - 10))} aria-label={t('starmap.zoomIn')}>
                  <Plus size={20} />
                </button>
                <button className="icon-btn" type="button" onClick={() => setFov(Math.min(MAX_FOV, fov + 10))} aria-label={t('starmap.zoomOut')}>
                  <Minus size={20} />
                </button>
              </div>
            )}
          </FullscreenStage>
          {pointing && (
            <p className="sky-pointing" data-testid="sky-pointing">
              {pointing}
            </p>
          )}
          <p className="hint" style={{ margin: 0 }} data-testid="sky-hint">
            {mode === 'camera'
              ? hasCompass
                ? t('starmap.cameraHint')
                : t('starmap.dragHint')
              : hasCompass && followCompass
                ? t('starmap.domeCompassHint')
                : t('starmap.domeDragHint')}
          </p>

          <section className="card stack">
            <label className="search">
              <Search size={18} aria-hidden />
              <input
                className="input"
                type="search"
                list="sky-targets"
                placeholder={t('starmap.searchPlaceholder')}
                aria-label={t('starmap.search')}
                value={query}
                onChange={(e) => chooseTarget(e.target.value)}
              />
            </label>
            <datalist id="sky-targets">
              {targets.map((x) => (
                <option key={x.key} value={x.label} />
              ))}
            </datalist>
            {targetLine && (
              <p className="sky-target-info" data-testid="sky-target">
                {targetLine}
              </p>
            )}
          </section>

          <section className="card stack">
            <div className="sky-time">
              <label className="field" style={{ flex: 1 }}>
                <span>{t('starmap.when')}</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={toLocalInput(date)}
                  onChange={(e) => e.target.value && setCustom(e.target.value)}
                />
              </label>
              <button className="btn" type="button" onClick={() => setCustom(null)} disabled={!custom}>
                {t('starmap.now')}
              </button>
            </div>
            <div className="row-end" style={{ justifyContent: 'flex-start' }}>
              <button className="btn" type="button" onClick={() => setCustom(toLocalInput(new Date(date.getTime() - 3_600_000)))}>
                −1 h
              </button>
              <button className="btn" type="button" onClick={() => setCustom(toLocalInput(new Date(date.getTime() + 3_600_000)))}>
                +1 h
              </button>
            </div>
            {hasCompass && mode === 'dome' && (
              <label className="check">
                <input type="checkbox" checked={followCompass} onChange={(e) => setFollowCompass(e.target.checked)} />
                {t('starmap.followCompass')}
              </label>
            )}
          </section>

          <section className="card stack" aria-labelledby="layers-title">
            <h2 id="layers-title" className="section-title" style={{ margin: 0 }}>{t('starmap.layers')}</h2>
            <div className="chips" role="group" aria-label={t('starmap.layers')}>
              {LAYER_KEYS.map((key) => (
                <button key={key} type="button" className="chip" aria-pressed={layers[key]} onClick={() => setLayer(key, !layers[key])}>
                  {key === 'guide' ? (south ? t('starmap.layer.guideSouth') : t('starmap.layer.guideNorth')) : t(`starmap.layer.${key}`)}
                </button>
              ))}
            </div>
            <p className="hint" style={{ margin: 0 }}>{t('starmap.layersHint')}</p>
            {layers.guide && <p className="hint" style={{ margin: 0 }}>{south ? t('starmap.guideSouthHint') : t('starmap.guideNorthHint')}</p>}
          </section>

          <section className="card stack" aria-labelledby="night-title">
            <h2 id="night-title" className="section-title" style={{ margin: 0 }}>{t('starmap.night')}</h2>
            <label className="check">
              <input type="checkbox" checked={theme === 'red'} onChange={(e) => setRed(e.target.checked)} />
              {t('starmap.red')}
            </label>
            <label className="check">
              <input type="checkbox" checked={autoRed} onChange={(e) => void updateSettings({ starmapRed: e.target.checked })} />
              {t('starmap.redOnOpen')}
            </label>
          </section>
        </>
      )}

      {picker}
    </div>
  );
}

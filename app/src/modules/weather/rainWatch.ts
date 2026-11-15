import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { currentPosition } from '@/core/geo/useGeolocation';
import { RAIN_CHECK_MS, useBatterySaver } from '@/core/power/saver';
import { useSettings } from '@/core/settings/settings';
import { useWaypoints } from '@/modules/waypoints/store';
import { CLEAR_AFTER_MS, nextEpisode, type RainEpisode } from './rainEpisode';
import { fetchNowcast, rainOutlook, type RainOutlook } from './nowcast';

/**
 * Avisos de lluvia mientras la app está abierta: cada 15 minutos (60 con ahorro de batería) revisa "mi
 * ubicación" (si está activado) y los waypoints con aviso. Con la app cerrada
 * una PWA no puede leer el GPS ni consultar a tiempo: lo hace el servidor
 * propio con la última ubicación conocida, si se activa (ver rainServer.ts).
 */

export const HERE_ID = 'here';

export interface RainStatus {
  placeId: string;
  label: string;
  outlook: RainOutlook;
  checkedAt: number;
}

interface RainWatchState {
  statuses: Map<string, RainStatus>;
  /** Avisos de esta sesión que el usuario todavía no cerró. */
  notices: RainStatus[];
  /** Última posición GPS leída con la app abierta (también se manda al servidor, ver rainServer.ts). */
  lastHere: { lat: number; lon: number; at: number } | null;
  dismiss: (placeId: string) => void;
}

export const useRainWatch = create<RainWatchState>((set, get) => ({
  statuses: new Map(),
  notices: [],
  lastHere: null,
  dismiss(placeId) {
    set({ notices: get().notices.filter((n) => n.placeId !== placeId) });
  },
}));

/** Episodio de lluvia de cada lugar: no se repite el aviso hasta 3 horas sin lluvia, salvo que se intensifique (rainEpisode.ts). */
const episodes = new Map<string, RainEpisode>();

const canNotify = () => 'Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator;

async function systemNotify(title: string, body: string, tag: string, data: { state: 'raining' | 'soon'; startsAt: number | null }, silent = false) {
  if (!canNotify()) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, { body, tag, silent, icon: 'brand/icon-192.png', badge: 'brand/icon-192.png', data: { url: '#/weather/forecast', ...data } });
}

/**
 * Un aviso de lluvia que quedó en la barra de notificaciones envejece: «en 105 minutos» deja de ser cierto. Con cada revisión la app
 * lo pone al día sin volver a sonar: si ya llueve, pasa a «Está lloviendo»; si falta, recalcula cuánto; y si dejó de llover
 * (20 minutos secos seguidos), lo saca. Si no hay ningún aviso mostrado, no crea uno.
 */
async function refreshShown(tag: string, label: string, outlook: RainOutlook, drySince: number | null, t: (key: string, o?: Record<string, unknown>) => string, lang: string, mmText: string) {
  if (!canNotify()) return;
  const registration = await navigator.serviceWorker.ready;
  const shown = (await registration.getNotifications({ tag }))[0];
  if (!shown) return;
  const data = (shown.data ?? {}) as { state?: string };
  if (outlook.state === 'dry') {
    if (drySince !== null && Date.now() - drySince >= CLEAR_AFTER_MS) shown.close();
  } else if (outlook.state === 'raining') {
    if (data.state !== 'raining') await systemNotify(t('rainAlerts.rainingTitle', { place: label }), t('rainAlerts.body', { mm: mmText }), tag, { state: 'raining', startsAt: null }, true);
  } else {
    const startsAt = Date.now() + outlook.inMinutes * 60_000;
    const time = new Date(startsAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    await systemNotify(t('rainAlerts.soonAtInTitle', { place: label, time, minutes: outlook.inMinutes }), t('rainAlerts.body', { mm: mmText }), tag, { state: 'soon', startsAt }, true);
  }
}

/** Se monta una vez en la app desbloqueada. */
export function useRainWatcher() {
  const { t, i18n } = useTranslation();
  const here = useSettings((s) => s.settings.rainAlertsHere);
  const base = useSettings((s) => s.settings.weatherUrl);
  const checkMs = useBatterySaver() ? RAIN_CHECK_MS.saver : RAIN_CHECK_MS.normal;
  const waypoints = useWaypoints((s) => s.waypoints);
  // La lista se reduce a lo que importa para no reiniciar el ciclo por cambios ajenos (nombre, notas…).
  const watched = [...waypoints.values()].filter((w) => w.rainAlerts);
  const watchKey = watched.map((w) => `${w.id}:${w.lat}:${w.lon}:${w.name}`).join('|');

  useEffect(() => {
    if (!here && watched.length === 0) return;
    let cancelled = false;
    const mm = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });

    async function check() {
      if (!navigator.onLine) return;
      const places: { id: string; label: string; lat: number; lon: number }[] = watched.map((w) => ({ id: w.id, label: w.name, lat: w.lat, lon: w.lon }));
      if (here) {
        try {
          const fix = await currentPosition();
          useRainWatch.setState({ lastHere: { lat: fix.lat, lon: fix.lon, at: Date.now() } });
        } catch {
          // Sin GPS en este momento: se usa la última posición conocida, si la hay.
        }
        const last = useRainWatch.getState().lastHere;
        if (last) places.unshift({ id: HERE_ID, label: t('place.myLocation'), lat: last.lat, lon: last.lon });
      }

      for (const place of places) {
        if (cancelled) return;
        let outlook: RainOutlook;
        try {
          outlook = rainOutlook(await fetchNowcast(base, place.lat, place.lon));
        } catch {
          continue;
        }
        const status: RainStatus = { placeId: place.id, label: place.label, outlook, checkedAt: Date.now() };
        const state = useRainWatch.getState();
        useRainWatch.setState({ statuses: new Map(state.statuses).set(place.id, status) });

        const { episode, notify } = nextEpisode(episodes.get(place.id) ?? null, outlook, Date.now());
        if (episode) episodes.set(place.id, episode);
        else episodes.delete(place.id);
        // Lo que ya está en la barra de notificaciones se pone al día (ya llueve, cuánto falta, o dejó de llover).
        if (!notify || outlook.state === 'dry') {
          await refreshShown(`rain-${place.id}`, place.label, outlook, episode?.drySince ?? null, t, i18n.language, outlook.state === 'dry' ? '' : mm.format(outlook.mm)).catch(() => undefined);
          continue;
        }
        useRainWatch.setState({ notices: [...state.notices.filter((n) => n.placeId !== place.id), status] });
        // La hora de inicio no se vence: el aviso dice «a las 15:40» y la cuenta de cuánto falta se recalcula en cada revisión.
        const startsAt = outlook.state === 'soon' ? Date.now() + outlook.inMinutes * 60_000 : null;
        const time = startsAt === null ? '' : new Date(startsAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
        const title =
          notify === 'stronger'
            ? t('rainAlerts.strongerTitle', { place: place.label })
            : outlook.state === 'raining'
              ? t('rainAlerts.rainingTitle', { place: place.label })
              : t('rainAlerts.soonAtTitle', { place: place.label, time });
        await systemNotify(title, t('rainAlerts.body', { mm: mm.format(outlook.mm) }), `rain-${place.id}`, { state: outlook.state, startsAt });
      }
    }

    void check();
    const timer = setInterval(() => void check(), checkMs);
    // Al volver a la app se pone al día enseguida (los avisos que quedaron en la barra pueden tener horas).
    let lastRun = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRun < 60_000) return;
      lastRun = Date.now();
      void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // `watchKey` resume los waypoints vigilados (la lista `watched` cambia de identidad en cada render).
  }, [here, base, watchKey, checkMs, i18n.language, t]);
}

import { localWeatherFetch } from './weather/openMeteoLocal.ts';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { createFcmSender, readServiceAccount } from './fcm.ts';
import { createPushSender } from './push.ts';
import { glmFeed } from './lightning/glm.ts';
import { readGlmPartial } from './satellite/partial.ts';
import { createLightningStore, mapActive } from './lightning/store.ts';
import { hasPlaces, LIGHTNING_DEFAULTS, runLightningWatch } from './lightning/watch.ts';
import { checkObservedRain, createObservedRainStatus } from './rain/noaaWatch.ts';
import { runRainWatch } from './rain/watch.ts';
import { RADAR_LAG_MS, createRadarStore, radarTick } from './radar/sinarame.ts';
import { createRainMapStore, RAIN_MAP_ACTIVE_MS, updateRainMap } from './rain/map.ts';
import { irObserver, withObservedRain } from './rain/observer.ts';
import { withRadarCheck } from './rain/radarCheck.ts';
import { openMeteoSource } from './rain/source.ts';
import { runScheduler } from './scheduler.ts';
import { runOutingWatch } from './outings/watch.ts';
import { fetchGdacs, fetchQuakes, type HazardEvent } from './hazards/sources.ts';
import { HAZARD_DEFAULTS, runHazardWatch } from './hazards/watch.ts';
import { openMeteoGarden, runGardenWatch } from './garden/watch.ts';
import { createOfficialStore } from './official/store.ts';
import { createOfficialCache, FEEDS, fetchOfficial } from './official/sources.ts';
import { OFFICIAL_DEFAULTS, runOfficialWatch } from './official/watch.ts';
import type { CapSource, OfficialAlert } from './official/cap.ts';
import { fetchAshSigmets } from './official/sigmet.ts';
import { createPeCache, fetchSenamhiBo, fetchSenamhiPe } from './official/senamhi.ts';
import { fetchCenvul } from './volcanoes/cenvul.ts';
import { fetchVolcanoAlerts, type VolcanoAlert } from './volcanoes/oavv.ts';
import { fetchForecasts, type StationForecast } from './rivers/forecast.ts';
import { fetchRiverLevels } from './rivers/ina.ts';
import { loadRiverCatalog, RIVER_EVERY_MS, runRiverForecastWatch, runRiverWatch, stationsToWatch, type RiverLevel, type RiverStation } from './rivers/watch.ts';
import { runVolcanoWatch, volcanoReadStamp, VOLCANO_EVERY_MS } from './volcanoes/watch.ts';
import { createMailNotifier, createSourceMonitor } from './monitor/sources.ts';

const config = loadConfig();
const db = openDb(config.dataDir);
// Avisos a la app nativa por Firebase (FCM): solo si hay una cuenta de servicio configurada; los dispositivos web siguen por Web Push.
let fcm: ReturnType<typeof createFcmSender> | null = null;
if (config.fcmServiceAccountFile) {
  try {
    fcm = createFcmSender(readServiceAccount(config.fcmServiceAccountFile));
    console.log(`FCM activado para el proyecto ${fcm.projectId}`);
  } catch (err) {
    // Un archivo que falta o está mal no tiene que tirar abajo el servidor: sigue sin FCM (se ve en `fcm: false` de /api/health).
    console.error(`FCM apagado: no se pudo leer la cuenta de servicio (${(err as Error).message})`);
  }
}
const push = createPushSender(db, config.vapidSubject, fcm);
// Fuentes externas caídas: un mail al correo de contacto por caída (y otro cuando vuelve).
const monitor = createSourceMonitor(
  db,
  await createMailNotifier(config.smtpUrl, config.adminEmail, config.mailFrom),
  (msg, data) => console.warn(JSON.stringify({ msg, ...data })),
  { minFailures: 3, minDownMs: 30 * 60_000, publicUrl: config.publicUrl ?? undefined },
);
const lightningStore = createLightningStore();
// `lightningTick` se define más abajo; la ruta solo lo despierta.
const observedRain = createObservedRainStatus();
const rainMapStore = createRainMapStore();
const radarStore = createRadarStore();
const officialStore = createOfficialStore();
const officialCache = createOfficialCache();
const senamhiPeCache = createPeCache();
const app = await buildApp(
  config,
  db,
  push,
  true,
  { store: lightningStore, wake: () => void lightningTick() },
  observedRain,
  { store: rainMapStore, wake: () => void rainMapTick() },
  undefined,
  officialStore,
  undefined,
  { store: radarStore },
);

async function tick() {
  try {
    const { sent, removed } = await runScheduler(db, push);
    if (sent || removed) app.log.info({ sent, removed }, 'notificaciones enviadas');
  } catch (err) {
    app.log.error(err, 'falló el envío de notificaciones');
  }
}

const weatherFetch = localWeatherFetch(config.weatherUrl, { localUrl: config.openMeteoLocalUrl, archiveFromYear: config.openMeteoArchiveFromYear });
const forecastSource = openMeteoSource(config.weatherUrl, weatherFetch);
const observer = irObserver();
const observedSource = config.rainObserved ? withObservedRain(forecastSource, observer) : forecastSource;
// Doble chequeo con el radar argentino: solo descarta avisos donde hay cobertura e imágenes recientes (ver rain/radarCheck.ts).
const radarChecked = config.radarSinarame ? withRadarCheck(observedSource, { store: radarStore }) : null;
const rainSource = radarChecked ?? observedSource;
let radarVetoedLogged = 0;

async function rainTick() {
  try {
    const { sent, removed } = await runRainWatch(db, push, rainSource, new Date(), config.rainHereMaxAgeMs);
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de lluvia enviados');
    const vetoed = radarChecked?.vetoed() ?? 0;
    if (vetoed > radarVetoedLogged) app.log.info({ descartados: vetoed - radarVetoedLogged }, 'avisos de lluvia descartados por el radar (sin eco cerca)');
    radarVetoedLogged = vetoed;
    await monitor.ok('open-meteo', 'El pronóstico de lluvia (Open-Meteo)');
  } catch (err) {
    await monitor.fail('open-meteo', 'El pronóstico de lluvia (Open-Meteo)', err);
    app.log.error(err, 'fallaron los avisos de lluvia');
  }
}

const glm = glmFeed({ maxFiles: config.lightningFilesPerPoll, partial: config.lightningPartial ? readGlmPartial : null });
let lightningLoggedAt = 0;
let lightningBusy = false;

async function lightningTick() {
  // Una pasada a la vez (bajar y leer puede tardar más que el intervalo con mala conexión).
  if (!config.lightningEnabled || lightningBusy || (!hasPlaces(db) && !mapActive(lightningStore))) return;
  lightningBusy = true;
  try {
    const filesBefore = glm.stats().files;
    let flashes;
    try {
      flashes = await glm.poll(new Date());
      await monitor.ok('glm', 'Los rayos del satélite GOES-19 (GLM, NOAA)');
    } catch (err) {
      await monitor.fail('glm', 'Los rayos del satélite GOES-19 (GLM, NOAA)', err);
      throw err;
    }
    // Para el mapa: la tanda nueva reemplaza a la anterior, aunque venga vacía; si no hubo archivos nuevos, queda la última.
    if (glm.stats().files > filesBefore) {
      lightningStore.flashes = flashes;
      lightningStore.updatedAt = Date.now();
    }
    const { sent, removed } = await runLightningWatch(db, push, flashes, new Date(), {
      ...LIGHTNING_DEFAULTS,
      radiusKm: config.lightningRadiusKm,
      everyMs: config.lightningNotifyEveryMin * 60_000,
      approachKm: config.lightningApproachKm,
      hereMaxAgeMs: config.rainHereMaxAgeMs,
    });
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de rayos enviados');
    // Una vez por hora, cuánto se bajó del satélite.
    if (Date.now() - lightningLoggedAt > 3_600_000) {
      lightningLoggedAt = Date.now();
      app.log.info(glm.stats(), 'rayos: archivos leídos y bytes bajados desde el arranque');
    }
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de rayos');
  } finally {
    lightningBusy = false;
  }
}

async function observedRainTick() {
  try {
    observedRain.available = await checkObservedRain();
    observedRain.checkedAt = new Date().toISOString();
    if (observedRain.available.length) app.log.warn({ available: observedRain.available }, 'NOAA publicó lluvia estimada en el bucket abierto: se puede sumar como fuente');
  } catch (err) {
    app.log.error(err, 'no se pudo revisar la lluvia estimada de NOAA');
  }
}

let rainMapBusy = false;
let rainMapBytes = 0;

/** Mapa de lluvia estimada: solo mientras alguien lo mira (~5,4 MB por archivo nuevo, cada 10 min). */
async function rainMapTick() {
  if (!config.rainObserved || rainMapBusy || Date.now() - rainMapStore.requestedAt > RAIN_MAP_ACTIVE_MS) return;
  rainMapBusy = true;
  try {
    const done = await updateRainMap(rainMapStore);
    if (done) {
      rainMapBytes += done.bytes;
      app.log.info({ bytes: done.bytes, total: rainMapBytes }, 'mapa de lluvia estimada actualizado');
    }
  } catch (err) {
    app.log.error(err, 'falló el mapa de lluvia estimada');
  } finally {
    rainMapBusy = false;
  }
}

// Peligros naturales: sismos cada 5 minutos y GDACS cada 30 (cambia despacio), solo si hay lugares con aviso.
let gdacsEvents: HazardEvent[] = [];
let gdacsAt = 0;
async function hazardTick() {
  if (!config.hazardsEnabled || !hasPlaces(db)) return;
  try {
    const quakes = await fetchQuakes().then(
      async (q) => {
        await monitor.ok('usgs', 'Los sismos de USGS');
        return q;
      },
      async (err) => {
        await monitor.fail('usgs', 'Los sismos de USGS', err);
        app.log.warn(err, 'no se pudieron leer los sismos de USGS');
        return [];
      },
    );
    if (Date.now() - gdacsAt > 30 * 60_000) {
      try {
        gdacsEvents = await fetchGdacs();
        gdacsAt = Date.now();
        await monitor.ok('gdacs', 'Los eventos de GDACS (inundaciones, ciclones, incendios, volcanes)');
      } catch (err) {
        await monitor.fail('gdacs', 'Los eventos de GDACS (inundaciones, ciclones, incendios, volcanes)', err);
        app.log.warn(err, 'no se pudieron leer los eventos de GDACS');
      }
    }
    const { sent, removed } = await runHazardWatch(db, push, [...quakes, ...gdacsEvents], new Date(), { ...HAZARD_DEFAULTS, hereMaxAgeMs: config.rainHereMaxAgeMs });
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de peligros naturales enviados');
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de peligros naturales');
  }
}
let radarBusy = false;
let radarImages = 0;

/** Radares argentinos (SINARAME): los 19, siempre, una imagen nueva cada 10 minutos por radar y de a un pedido por vez (ver radar/sinarame.ts). */
async function radarTickRun() {
  if (!config.radarSinarame || radarBusy) return;
  radarBusy = true;
  try {
    const got = await radarTick(radarStore, { base: config.radarBaseUrl, pauseMs: config.radarPauseMs, refreshMs: config.radarRefreshMin * 60_000, lagMs: RADAR_LAG_MS });
    if (got) {
      radarImages += got;
      app.log.info({ imagenes: got, total: radarImages, bytes: radarStore.bytes }, 'imágenes de radar bajadas');
    }
    if (radarStore.backoffUntil > Date.now()) app.log.warn({ hasta: new Date(radarStore.backoffUntil).toISOString() }, 'el servicio de radares falló: se espera antes de volver a pedir');
  } catch (err) {
    app.log.error(err, 'falló la tarea de radares');
  } finally {
    radarBusy = false;
  }
}
setInterval(() => void radarTickRun(), 60_000);

const hazardTimer = setInterval(() => void hazardTick(), 5 * 60_000);

// Niveles de los ríos de Argentina (INA): cada media hora, solo de las estaciones que tienen un lugar guardado a menos de 5 km.
let riverStations: RiverStation[] | null = null;
let riverBusy = false;
const RIVER_FORECAST_EVERY_MS = 3 * 3_600_000;
let riverForecasts: { at: number; map: Map<number, StationForecast> } | null = null;
async function riverTick() {
  if (!config.hazardsEnabled || !config.appDir || !hasPlaces(db) || riverBusy) return;
  riverBusy = true;
  try {
    riverStations ??= loadRiverCatalog(`${config.appDir}/data/rivers-AR.json`);
    const now = new Date();
    const watch = stationsToWatch(db, riverStations, now, config.rainHereMaxAgeMs);
    if (!watch.length) return;
    let levels = new Map<number, RiverLevel>();
    try {
      levels = await fetchRiverLevels(watch.map((s) => s.series), now);
      await monitor.ok('ina', 'Los niveles de los ríos (INA)');
      const { sent, removed } = await runRiverWatch(db, push, watch, levels, now, config.rainHereMaxAgeMs);
      if (sent || removed) app.log.info({ sent, removed }, 'avisos de ríos enviados');
    } catch (err) {
      await monitor.fail('ina', 'Los niveles de los ríos (INA)', err);
      app.log.warn({ err: String(err) }, 'no se pudieron leer los niveles de los ríos del INA');
    }
    // Avisos anticipados con el pronóstico del INA (se baja cada 3 horas como máximo, solo de las estaciones vigiladas que lo tienen).
    try {
      const withForecast = watch.filter((s) => s.forecast?.length);
      if (withForecast.length) {
        if (!riverForecasts || now.getTime() - riverForecasts.at > RIVER_FORECAST_EVERY_MS) {
          riverForecasts = { at: now.getTime(), map: await fetchForecasts(withForecast) };
        }
        const { sent, removed } = await runRiverForecastWatch(db, push, withForecast, riverForecasts.map, levels, now, config.rainHereMaxAgeMs);
        if (sent || removed) app.log.info({ sent, removed }, 'avisos anticipados de ríos enviados');
      }
    } catch (err) {
      app.log.warn({ err: String(err) }, 'fallaron los avisos anticipados de ríos');
    }
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de ríos');
  } finally {
    riverBusy = false;
  }
}
const riverTimer = setInterval(() => void riverTick(), RIVER_EVERY_MS);

// Alertas oficiales (SMN, DMC, INUMET, INMET): cada 10 minutos, para el mapa y para avisar. Se bajan solo los CAP nuevos.
let officialBusy = false;
let volcanoesAt = 0;
async function officialTick() {
  if (!config.hazardsEnabled || officialBusy) return;
  officialBusy = true;
  try {
    const all: OfficialAlert[] = [];
    const failed: string[] = [];
    for (const source of Object.keys(FEEDS) as CapSource[]) {
      const label = { SMN: 'Las alertas del SMN', DMC: 'Las alertas de la Dirección Meteorológica de Chile', INUMET: 'Las alertas de INUMET (Uruguay)', INMET: 'Las alertas del INMET (Brasil)' }[source];
      try {
        all.push(...(await fetchOfficial(source, officialCache)));
        await monitor.ok(source, label);
      } catch (err) {
        await monitor.fail(source, label, err);
        failed.push(source);
        // Si falla una fuente, quedan sus alertas de la vuelta anterior (todavía vigentes).
        all.push(...officialStore.alerts.filter((a) => a.source === source && Date.parse(a.expires) > Date.now()));
        app.log.warn({ err: String(err), source }, 'no se pudieron leer las alertas oficiales');
      }
    }
    // Bolivia y Perú: sus SENAMHI no publican CAP; se leen sus datos abiertos.
    const extra: { source: 'SENAMHI_BO' | 'SENAMHI_PE'; label: string; read: () => Promise<OfficialAlert[]> }[] = [
      { source: 'SENAMHI_BO', label: 'Las alertas del SENAMHI de Bolivia', read: () => fetchSenamhiBo() },
      { source: 'SENAMHI_PE', label: 'Los avisos del SENAMHI de Perú', read: () => fetchSenamhiPe(senamhiPeCache) },
    ];
    for (const { source, label, read } of extra) {
      try {
        all.push(...(await read()));
        await monitor.ok(source, label);
      } catch (err) {
        await monitor.fail(source, label, err);
        failed.push(source);
        all.push(...officialStore.alerts.filter((a) => a.source === source && Date.parse(a.expires) > Date.now()));
        app.log.warn({ err: String(err), source }, 'no se pudieron leer las alertas oficiales');
      }
    }
    // Ceniza volcánica (SIGMET de aviación, vía NOAA).
    try {
      all.push(...(await fetchAshSigmets()));
      await monitor.ok('SIGMET', 'Los SIGMET de ceniza volcánica (NOAA)');
    } catch (err) {
      await monitor.fail('SIGMET', 'Los SIGMET de ceniza volcánica (NOAA)', err);
      failed.push('SIGMET');
      all.push(...officialStore.alerts.filter((a) => a.source === 'SIGMET' && Date.parse(a.expires) > Date.now()));
      app.log.warn({ err: String(err) }, 'no se pudieron leer los SIGMET de ceniza');
    }
    // Nivel de alerta de los volcanes (OAVV de Argentina y CENVUL de Perú): cambia despacio, cada media hora.
    if (Date.now() - volcanoesAt > VOLCANO_EVERY_MS) {
      const sources = [
        { id: 'OAVV', label: 'El nivel de alerta de los volcanes (OAVV, SEGEMAR)', read: () => fetchVolcanoAlerts() },
        { id: 'CENVUL', label: 'El nivel de alerta de los volcanes de Perú (CENVUL, IGP)', read: () => fetchCenvul() },
      ] as const;
      const volcanoes: VolcanoAlert[] = [];
      let volcanoFailed = false;
      for (const { id, label, read } of sources) {
        try {
          volcanoes.push(...(await read()));
          await monitor.ok(id, label);
        } catch (err) {
          await monitor.fail(id, label, err);
          failed.push(id);
          volcanoFailed = true;
          // Si falla, quedan los de esa fuente de la vuelta anterior.
          volcanoes.push(...officialStore.volcanoes.filter((v) => v.source === id));
          app.log.warn({ err: String(err), source: id }, 'no se pudo leer el nivel de alerta de los volcanes');
        }
      }
      officialStore.volcanoes = volcanoes;
      // Si falló una fuente se reintenta pronto (antes esperaba 30 min completos).
      volcanoesAt = volcanoReadStamp(!volcanoFailed);
      const v = await runVolcanoWatch(db, push, volcanoes, new Date(), config.rainHereMaxAgeMs);
      if (v.sent || v.removed) app.log.info(v, 'avisos de volcanes enviados');
    }
    officialStore.alerts = all;
    officialStore.failed = failed;
    officialStore.updatedAt = Date.now();
    const { sent, removed } = await runOfficialWatch(db, push, all, new Date(), { ...OFFICIAL_DEFAULTS, hereMaxAgeMs: config.rainHereMaxAgeMs });
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de alertas oficiales enviados');
  } catch (err) {
    app.log.error(err, 'fallaron las alertas oficiales');
  } finally {
    officialBusy = false;
  }
}
const officialTimer = setInterval(() => void officialTick(), 10 * 60_000);
void officialTick();

const gardenWeather = openMeteoGarden(config.weatherUrl, weatherFetch);
async function gardenTick() {
  try {
    const { sent, removed } = await runGardenWatch(db, push, gardenWeather);
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de la huerta enviados');
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de la huerta');
  }
}
// Hora límite de regreso de una salida: cada minuto (una consulta a una tabla chica, sin red).
async function outingTick() {
  try {
    const { sent, removed } = await runOutingWatch(db, push);
    if (sent || removed) app.log.info({ sent, removed }, 'avisos de hora límite de salidas enviados');
  } catch (err) {
    app.log.error(err, 'fallaron los avisos de hora límite de salidas');
  }
}
const outingTimer = setInterval(() => void outingTick(), 60_000);

// Cada 15 minutos: la helada se avisa a partir de las 17 y el riego y las tareas a la hora de aviso de cada uno.
const gardenTimer = setInterval(() => void gardenTick(), 15 * 60_000);
setTimeout(() => void hazardTick(), 30_000);

const timer = setInterval(() => void tick(), config.schedulerIntervalMs);
const rainMapTimer = setInterval(() => void rainMapTick(), 2 * 60_000);
const observedRainTimer = setInterval(() => void observedRainTick(), 24 * 3_600_000);
void observedRainTick();
const lightningTimer = config.lightningEnabled ? setInterval(() => void lightningTick(), config.lightningIntervalMs) : undefined;
const rainTimer = setInterval(() => void rainTick(), config.rainIntervalMs);
void tick();
void rainTick();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    clearInterval(rainTimer);
    clearInterval(rainMapTimer);
    clearInterval(observedRainTimer);
    clearInterval(lightningTimer);
    clearInterval(hazardTimer);
    clearInterval(riverTimer);
    clearInterval(officialTimer);
    clearInterval(gardenTimer);
    clearInterval(outingTimer);
    await app.close();
    db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });

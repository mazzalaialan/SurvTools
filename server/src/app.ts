import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import type { PushSender } from './push.ts';
import { createLightningStore, type LightningStore } from './lightning/store.ts';
import { createMapsService, type MapsService } from './maps/service.ts';
import { createRainMapStore, type RainMapStore } from './rain/map.ts';
import { createObservedRainStatus, type ObservedRainStatus } from './rain/noaaWatch.ts';
import { deviceRoutes } from './routes/devices.ts';
import { lightningRoutes } from './routes/lightning.ts';
import { createOfficialStore, officialRoutes, type OfficialStore } from './official/store.ts';
import { mapRoutes } from './routes/maps.ts';
import { libraryRoutes } from './routes/library.ts';
import { dataRoutes } from './routes/data.ts';
import { layersRoutes } from './routes/layers.ts';
import { osmRoutes } from './routes/osm.ts';
import { omRoutes } from './routes/om.ts';
import { addressRoutes } from './routes/address.ts';
import { openAroundIndex, type AroundIndex } from './osm/around.ts';
import { riversRoutes } from './routes/rivers.ts';
import { tidesRoutes } from './routes/tides.ts';
import { iocRoutes } from './routes/ioc.ts';
import { firesRoutes } from './routes/fires.ts';
import { rainMapRoutes } from './routes/rainMap.ts';
import { liveSessionRoutes } from './routes/liveSessions.ts';
import { sharedOutingRoutes } from './routes/sharedOutings.ts';
import { transferRoutes } from './routes/transfers.ts';

export const VERSION = '0.1.0';

export async function buildApp(
  config: Config,
  db: Db,
  push: PushSender,
  logger = true,
  lightning: { store: LightningStore; wake: () => void } = { store: createLightningStore(), wake: () => undefined },
  observedRain: ObservedRainStatus = createObservedRainStatus(),
  rainMap: { store: RainMapStore; wake: () => void } = { store: createRainMapStore(), wake: () => undefined },
  maps: MapsService = createMapsService(config.mapsDir),
  official: OfficialStore = createOfficialStore(),
  osmIndex: AroundIndex | null = openAroundIndex(config.osmIndexPath),
): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: true });

  await app.register(cors, { origin: config.allowedOrigins === '*' ? true : config.allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] });

  // `observedRain`: si NOAA volvió a publicar lluvia estimada en el bucket abierto (ver rain/noaaWatch.ts).
  // `sourcesDown`: fuentes externas que están fallando ahora (se avisa por mail al pasar el umbral; ver monitor/sources.ts).
  const sourcesDown = db.prepare('SELECT source, since, failures FROM source_status ORDER BY since');
  app.get('/api/health', async () => ({
    ok: true,
    version: VERSION,
    vapidPublicKey: push.publicKey,
    observedRain,
    sourcesDown: (sourcesDown.all() as unknown as { source: string; since: number; failures: number }[]).map((r) => ({ ...r, since: new Date(r.since).toISOString() })),
  }));
  deviceRoutes(app, db, push, { requestsPerMin: config.deviceRequestsPerMin, failuresPer10Min: config.deviceFailuresPer10Min });
  transferRoutes(app, db, config);
  sharedOutingRoutes(app, db, config);
  liveSessionRoutes(app, db, config);
  lightningRoutes(app, lightning.store, lightning.wake);
  rainMapRoutes(app, rainMap.store, rainMap.wake);
  mapRoutes(app, maps, config);
  libraryRoutes(app, config);
  dataRoutes(app, config);
  riversRoutes(app, config);
  layersRoutes(app);
  osmRoutes(app, osmIndex);
  omRoutes(app, { localUrl: config.openMeteoLocalUrl, archiveYears: config.openMeteoArchiveYears });
  addressRoutes(app);
  tidesRoutes(app);
  iocRoutes(app, config);
  firesRoutes(app);
  officialRoutes(app, official);
  app.addHook('onClose', () => maps.close());

  // Opcional: servir la propia PWA para una instalación 100% autónoma.
  if (config.appDir) {
    const root = resolve(config.appDir);
    if (!existsSync(root)) throw new Error(`APP_DIR no existe: ${root}`);
    await app.register(fastifyStatic, { root, wildcard: true });
  }

  return app;
}

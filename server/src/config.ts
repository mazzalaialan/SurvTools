/** Configuración por variables de entorno (ver docs/SERVIDOR.md). */
export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** Orígenes permitidos para CORS; '*' = cualquiera (la autenticación es por token, no por cookies). */
  allowedOrigins: string[] | '*';
  /** Contacto que exige el protocolo Web Push (mailto: o https:). */
  vapidSubject: string;
  transferMaxBytes: number;
  transferTtlMs: number;
  /** Salidas compartidas con un enlace público: cuántas como máximo (el espacio no crece sin control) y cuánto duran. */
  sharedOutingsMax: number;
  sharedOutingsTtlMs: number;
  /** Seguimientos en vivo activos a la vez (el espacio no crece sin control). */
  liveSessionsMax: number;
  /** Carpeta con el build de la PWA para servirla desde acá; vacío = no servirla. */
  appDir: string | null;
  /** Cada cuánto revisar si hay notificaciones para enviar. */
  schedulerIntervalMs: number;
  /** Pronóstico para los avisos de lluvia (API compatible con Open-Meteo). */
  weatherUrl: string;
  /** Clave de la API del IOC (mareógrafos medidos); vacía, la función se apaga. */
  iocApiKey: string | null;
  /** Páginas de CARU y DINAGUA (Uruguay) por si cambian de dirección (ver rivers/uy.ts). */
  caruUrl: string;
  dinaguaUrl: string;
  /** Cada cuánto revisar la lluvia en los lugares con aviso. */
  rainIntervalMs: number;
  /** Hasta qué antigüedad se usa la última ubicación conocida de "donde estoy". */
  rainHereMaxAgeMs: number;
  /** Avisos de rayos (GOES-19 GLM): se bajan archivos del satélite solo si hay lugares con aviso. */
  lightningEnabled: boolean;
  lightningIntervalMs: number;
  /** Archivos de 20 s que se leen como mucho por pasada (si una pasada se atrasa, se pone al día). */
  lightningFilesPerPoll: number;
  /** Bajar solo las coordenadas de los rayos de cada archivo (~36 KB) en vez del archivo completo (~380 KB). */
  lightningPartial: boolean;
  lightningRadiusKm: number;
  /** Lluvia estimada con el infrarrojo del GOES-19 para los avisos (además del pronóstico). */
  rainObserved: boolean;
  /** Avisos de peligros naturales (sismos de USGS y eventos de GDACS). */
  hazardsEnabled: boolean;
  /** Carpeta con vector.pmtiles y elevation.pmtiles (mapas offline); sin archivos, la app usa las fuentes públicas. */
  mapsDir: string | null;
  /** Pedidos de teselas a la vez; más que eso responde 503 y la app pasa a las fuentes públicas. */
  mapsMaxConcurrent: number;
  /** Tamaño máximo de una zona que se baja del servidor (teselas y MB). */
  mapsMaxZoneTiles: number;
  mapsMaxZoneMb: number;
  /** Paquetes de la biblioteca (catalog.json y books/*.zip de tools/library-builder); null = sin biblioteca. */
  libraryDir: string | null;
  /** Clave para bajar los libros con derechos (uso personal); vacía = solo se bajan los libres. */
  libraryKey: string | null;
  /** Avisos al administrador (fuentes caídas): correo de destino y servidor SMTP (smtps://usuario:clave@host:465). Sin SMTP_URL, solo queda en el log. */
  adminEmail: string | null;
  smtpUrl: string | null;
  mailFrom: string | null;
  /** Dirección pública del servidor (para enlaces en los mails). */
  publicUrl: string | null;
  /** Paquetes de datos que se regeneran cada mes (parques, Chile, Uruguay); null = no se ofrecen. */
  dataPacksDir: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const origins = env.ALLOWED_ORIGINS?.trim() || '*';
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '0.0.0.0',
    dataDir: env.DATA_DIR ?? './data',
    allowedOrigins: origins === '*' ? '*' : origins.split(',').map((o) => o.trim()),
    vapidSubject: env.VAPID_SUBJECT ?? 'mailto:admin@localhost',
    transferMaxBytes: Number(env.TRANSFER_MAX_MB ?? 50) * 1024 * 1024,
    transferTtlMs: Number(env.TRANSFER_TTL_HOURS ?? 24) * 3_600_000,
    sharedOutingsMax: Number(env.SHARED_OUTINGS_MAX ?? 2000),
    sharedOutingsTtlMs: Number(env.SHARED_OUTINGS_TTL_DAYS ?? 365) * 86_400_000,
    liveSessionsMax: Number(env.LIVE_SESSIONS_MAX ?? 300),
    appDir: env.APP_DIR?.trim() || null,
    schedulerIntervalMs: Number(env.SCHEDULER_INTERVAL_MINUTES ?? 10) * 60_000,
    weatherUrl: env.WEATHER_URL?.trim() || 'https://api.open-meteo.com',
    iocApiKey: env.IOC_API_KEY?.trim() || null,
    caruUrl: env.CARU_URL?.trim() || 'http://190.0.152.194:8080/alturas/web/user/alturas',
    dinaguaUrl: env.DINAGUA_URL?.trim() || 'https://www.ambiente.gub.uy/dinagua-obh/api/niveles-y-caudales',
    rainIntervalMs: Number(env.RAIN_INTERVAL_MINUTES ?? 15) * 60_000,
    rainHereMaxAgeMs: Number(env.RAIN_HERE_MAX_AGE_HOURS ?? 24) * 3_600_000,
    lightningEnabled: (env.LIGHTNING_ENABLED ?? 'true') !== 'false',
    lightningIntervalMs: Number(env.LIGHTNING_INTERVAL_SECONDS ?? 20) * 1000,
    lightningFilesPerPoll: Number(env.LIGHTNING_FILES_PER_POLL ?? 3),
    lightningPartial: (env.LIGHTNING_PARTIAL ?? 'true') !== 'false',
    lightningRadiusKm: Number(env.LIGHTNING_RADIUS_KM ?? 30),
    rainObserved: (env.RAIN_OBSERVED ?? 'true') !== 'false',
    hazardsEnabled: (env.HAZARDS_ENABLED ?? 'true') !== 'false',
    mapsDir: env.MAPS_DIR === '' ? null : (env.MAPS_DIR ?? `${env.DATA_DIR ?? './data'}/maps`),
    mapsMaxConcurrent: Number(env.MAPS_MAX_CONCURRENT ?? 48),
    adminEmail: env.ADMIN_EMAIL === '' ? null : (env.ADMIN_EMAIL?.trim() ?? 'contacto.vikarg@gmail.com'),
    smtpUrl: env.SMTP_URL?.trim() || null,
    mailFrom: env.MAIL_FROM?.trim() || null,
    publicUrl: env.PUBLIC_URL?.trim() || null,
    dataPacksDir: env.DATA_PACKS_DIR === '' ? null : (env.DATA_PACKS_DIR ?? `${env.DATA_DIR ?? './data'}/packs`),
    mapsMaxZoneTiles: Number(env.MAPS_MAX_ZONE_TILES ?? 60_000),
    mapsMaxZoneMb: Number(env.MAPS_MAX_ZONE_MB ?? 1_500),
    libraryDir: env.LIBRARY_DIR?.trim() || null,
    libraryKey: env.LIBRARY_KEY?.trim() || null,
  };
}

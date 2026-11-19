# Servidor VikArg — Guía de instalación

El servidor es **opcional**. La app funciona completa sin él; el servidor agrega:

- **Notificaciones push confiables:** avisos de vencimiento aunque la app esté cerrada.
- **Avisos de lluvia y rayos con la app cerrada:** en tus waypoints con aviso y donde estás.
- **Avisos de peligros naturales** (sismos, incendios, inundaciones, ciclones, erupciones) cerca de esos lugares y de donde guardás reserva.
- **Avisos de la huerta con la app cerrada:** helada, riego y tareas.
- **Biblioteca privada** *(fase Biblioteca)*: tus libros, solo en tu servidor y con clave.
- **Transferencia con código o QR:** pasar el backup a otro dispositivo sin cables.
- **Servir la propia app:** una instalación que no depende de GitHub.

El servidor nunca ve tu inventario. Solo recibe:
- nombre del artículo y fechas de las alertas, para poder notificar;
- para los avisos de lluvia y rayos: nombre y lugar de los waypoints con aviso y, salvo que lo apagues en **Ajustes → Notificaciones**, tu última ubicación conocida. Todo va redondeado a ~1 km y se borra al apagarlo;
- para los peligros cerca de tu reserva: un punto (~1 km) y el nombre de cada ubicación del inventario con waypoint donde hay algo guardado;
- para la huerta: un punto por lugar (~1 km; los canteros a menos de 1 km son un solo lugar), los nombres de los cultivos al aire libre y desde qué mínima se queman, los datos del riego y el texto de las tareas;
- backups que llegan **ya cifrados** y se borran al descargarlos o a las 24 h.

---

## Requisito: HTTPS

Los navegadores solo permiten notificaciones push y conexiones desde una app HTTPS hacia un servidor también HTTPS. El servidor necesita:

1. **Una máquina siempre encendida con Docker:** un VPS, una mini PC en tu casa, una Raspberry Pi 4/5, etc.
2. **Un dominio o subdominio** que apunte a esa máquina (ej.: `vikarg.tudominio.com`).
3. **Los puertos 80 y 443 abiertos** hacia la máquina. Si está en tu casa, redirigilos en el router.

Con eso, el `docker-compose.yml` incluido obtiene y renueva el certificado HTTPS solo, con Caddy y Let's Encrypt.

> **¿Sin IP pública o sin poder abrir puertos?** Se puede exponer con un túnel, como Cloudflare Tunnel o Tailscale Funnel. Funciona, pero agrega un intermediario externo. Esta guía cubre la opción directa.

---

## Instalación

```bash
git clone https://github.com/mazzalaialan/SurvTools.git
cd SurvTools/deploy
cp .env.example .env
nano .env            # completar DOMAIN (el mail es opcional)
docker compose up -d --build
```

Verificación: abrí `https://TU_DOMINIO/api/health`. Tiene que responder algo como:

```json
{ "ok": true, "version": "0.1.0", "vapidPublicKey": "B…" }
```

La app queda servida en `https://TU_DOMINIO/` y se puede instalar desde ahí.

## Conectar la app

1. En la app: **Ajustes → tocá 7 veces el número de versión** (la sección «Conexiones» está oculta a propósito: es configuración interna) o abrí `#/settings?conexiones=1`. Después **Conexiones → Servidor VikArg**, poné `https://TU_DOMINIO` y tocá **Probar conexión**.
2. **Guardar.**
3. **Ajustes → Notificaciones → Activar notificaciones** y aceptá el permiso.
4. Tocá **Probar**: tiene que llegar una notificación.

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `8080` | Puerto interno del servidor |
| `DATA_DIR` | `/data` | Dónde se guarda la base SQLite |
| `VAPID_SUBJECT` | `https://DOMAIN` (con el compose) | Contacto que exige Web Push (`mailto:` o `https:`). Sin mail se usa la URL del servidor; Let's Encrypt tampoco lo necesita |
| `ALLOWED_ORIGINS` | `*` | Orígenes permitidos (CORS), separados por coma |
| `TRANSFER_MAX_MB` | `50` | Tamaño máximo de un backup transferido |
| `TRANSFER_TTL_HOURS` | `24` | Validez de un código de transferencia |
| `SCHEDULER_INTERVAL_MINUTES` | `10` | Cada cuánto revisa si hay avisos para enviar |
| `APP_DIR` | `/srv/public` | Carpeta de la PWA a servir; vacío = no servirla |
| `WEATHER_URL` | `https://api.open-meteo.com` | Pronóstico para los avisos de lluvia (API compatible con Open-Meteo; puede ser una instancia propia) |
| `RAIN_INTERVAL_MINUTES` | `15` | Cada cuánto revisa la lluvia en los lugares con aviso |
| `RAIN_HERE_MAX_AGE_HOURS` | `24` | Hasta qué antigüedad usa la última ubicación conocida para "donde estoy" (lluvia y rayos) |
| `HAZARDS_ENABLED` | `true` | Avisos de peligros naturales cerca (sismos de USGS y eventos de GDACS). |
| `RAIN_OBSERVED` | `true` | Lluvia estimada con el infrarrojo del GOES-19 en los avisos (además del pronóstico) |
| `RADAR_SINARAME` | `true` | Imágenes de los 19 radares argentinos (SINARAME) para el mapa (`/api/radar`) y para el doble chequeo de avisos de lluvia; **siempre**, sin esperar a que alguien las pida: una imagen nueva por radar cada 10 minutos (~0,5 MB por vuelta con los 19), que descarta avisos sin eco cerca (`rain/radarCheck.ts`, `/api/radar/check`) |
| `RADAR_REFRESH_MIN` | `10` | Cada cuántos minutos se busca una imagen nueva de cada radar (sale una cada 10; mínimo 5) |
| `RADAR_PAUSE_MS` | `300` | Pausa entre pedidos al servicio de radares, en milisegundos (cortesía con un servicio público) |
| `RADAR_BASE_URL` | `https://radares.hidricosargentina.gob.ar` | Dirección del visor de radares |
| `RATE_RADAR_PER_MIN` | `120` | Tope de pedidos por minuto y por IP a `/api/radar` |
| `LIGHTNING_ENABLED` | `true` | Avisos de rayos (GOES-19 GLM); `false` los apaga |
| `LIGHTNING_INTERVAL_SECONDS` | `20` | Cada cuánto busca rayos nuevos (el satélite saca un archivo cada 20 s) |
| `LIGHTNING_FILES_PER_POLL` | `3` | Archivos que lee como mucho por pasada (si se atrasa, se pone al día) |
| `LIGHTNING_PARTIAL` | `true` | Bajar solo las coordenadas de los rayos de cada archivo (~36 KB, ~155 MB por día con los tres por minuto); `false` baja el archivo completo (~380 KB, ~1,6 GB por día) |
| `LIGHTNING_RADIUS_KM` | `30` | Distancia para avisar de rayos |
| `LIGHTNING_NOTIFY_EVERY_MIN` | `30` | Como mucho un aviso de rayos por lugar en estos minutos mientras la tormenta sigue (antes 10: insistía demasiado) |
| `LIGHTNING_APPROACH_KM` | `10` | Si la tormenta se acercó al menos esto desde el último aviso, avisa de nuevo aunque no hayan pasado los minutos de arriba (pero no antes de 10 minutos) |
| `MAPS_DIR` | `/maps` (con el compose; si no, `DATA_DIR/maps`) | Carpeta con `vector.pmtiles` y `elevation.pmtiles`; vacío = sin mapas |
| `OSM_INDEX_PATH` | `./osm` | (Solo compose) carpeta del host con `around.sqlite`, la base de calles y números (ver «Base de calles y números»), que se monta en `/osm` de solo lectura |
| `OSM_INDEX` | `$DATA_DIR/osm/around.sqlite` | Ruta de esa base dentro del contenedor; vacío, se apaga |
| `MAPS_PATH` | `./maps` | (Solo compose) carpeta del host que se monta en `/maps`, de solo lectura |
| `MAPS_MAX_CONCURRENT` | `48` | Teselas que entrega a la vez; con más responde 503 y la app usa las fuentes públicas un rato |
| `MAPS_MAX_ZONE_TILES` | `60000` | Teselas máximas de una zona que la app baja del servidor |
| `MAPS_MAX_ZONE_MB` | `1500` | MB máximos de una zona que la app baja del servidor |
| `SMTP_URL` | (vacío) | Servidor de correo para avisarte cuando una fuente externa no responde, por ejemplo `smtps://contacto.vikarg%40gmail.com:CONTRASEÑA_DE_APLICACION@smtp.gmail.com:465`. Sin esto, el aviso queda solo en el log y en `/api/health` (`sourcesDown`) |
| `ADMIN_EMAIL` | `contacto.vikarg@gmail.com` | A quién avisar; vacío = a nadie |
| `MAIL_FROM` | el usuario de `SMTP_URL` | Remitente de los avisos |
| `PUBLIC_URL` | (vacío) | Dirección pública del servidor, para el enlace al estado en los mails |

## Mapas offline (opcional)

Con los mapas en el servidor, la app baja de acá las zonas offline en vez de OpenFreeMap y AWS. Así no depende de terceros, y las zonas pueden ser mucho más grandes: los servicios públicos permiten hasta 3.000 teselas o 50 MB por zona, y el servidor deja hasta `MAPS_MAX_ZONE_TILES` y `MAPS_MAX_ZONE_MB`. Sin los archivos, todo sigue como antes.

**Archivos.** En la carpeta `deploy/maps/` (o la que diga `MAPS_PATH`):
- `vector.pmtiles`: el mapa, con el esquema OpenMapTiles, el mismo de OpenFreeMap.
- `elevation.pmtiles`: la elevación en formato Terrarium, la misma de Terrain Tiles (AWS). Sirve para el relieve, las curvas de nivel y la capa de avalanchas.

Puede haber uno solo. Para lo que falte, la app usa las fuentes públicas. Para actualizar el mapa, se reemplaza el archivo: el servidor lo vuelve a abrir solo, sin reiniciar.

**Armar el paquete de Argentina, Chile y Uruguay** (desde una copia del repo, con Node 24+):
```bash
cd server
# Elevación hasta zoom 12: ~160.000 teselas bajadas de AWS Open Data, que permite descarga masiva.
# Se puede cortar y volver a correr; sigue desde donde quedó.
npm run maps:elevation -- --out ../deploy/maps/elevation.pmtiles
# Mapa: Planetiler en Docker. Baja el extracto de Sudamérica de Geofabrik y recorta los tres países.
# Necesita ~10 GB de RAM libres y ~30 GB de disco temporal; tarda de una a varias horas.
npm run maps:vector -- ../deploy/maps
```
Para otra zona: `--bounds oeste,sur,este,norte` en la elevación, y `AREA=` y `BOUNDS=` en el mapa (ver `server/src/maps/build-vector.sh`).
Si `osmdata.openstreetmap.de` (polígonos de agua) no responde, `WATER_URL=` permite usar otra copia, por ejemplo la del Wayback Machine.

**Actualizar el mapa una vez por mes** (era cada 3 meses hasta el 2026-11-13: OpenStreetMap cambia todo el tiempo y con el criterio de 30 días no se reconstruye de más). `server/src/maps/update-maps.sh` compara la fecha del extracto de Geofabrik con la del `vector.pmtiles` y, si hay datos de más de 30 días más nuevos (`MIN_DAYS=`), vuelve a armar el mapa. El archivo se reemplaza recién cuando está completo. La elevación no se regenera, porque Terrain Tiles es un conjunto fijo. Con cron:
```
0 4 1 * * sh /ruta/SurvTools/server/src/maps/update-maps.sh /ruta/SurvTools/deploy/maps
```
El registro queda en `deploy/maps/update.log`. Cada reconstrucción cuesta unas 3 horas de procesador, unos 7 GB de memoria (`MEMORY=7g`) y bajar el extracto de Geofabrik (unos 2 GB): conviene que no coincida con un respaldo ni con otra tarea pesada del servidor.

**Cómo lo usa la app.** En *Ajustes → Conexiones (oculta: 7 toques en la versión) → Bajar los mapas de* se elige entre tres opciones:
- **Automático** (por defecto): pide cada tesela a este servidor. Si no responde, está sobrecargado (503) o no tiene esa zona, la pide a las fuentes públicas, y deja de lado al servidor por un rato (lo que diga `Retry-After`, o 5 minutos). Una zona más grande que el límite público se baja solo del servidor: si falla a mitad de camino, quedan teselas sin bajar y se completa repitiendo la descarga más tarde.
- **Solo mi servidor.**
- **Solo servidores públicos**, como antes.

API: `GET /api/maps` informa los archivos (zooms, zona, fecha) y los límites, y `GET /api/maps/{vector|elevation}/z/x/y` entrega una tesela (204 si no hay datos en ese lugar). Las teselas del mapa salen comprimidas tal como están en el archivo (`Content-Encoding: gzip`).

## Base de calles y números (opcional, para «Mi ubicación»)

Con esta base, «Mi ubicación» da la dirección con la altura, las entrecalles, la ruta y el kilómetro en milisegundos, desde tu servidor, en vez de esperar a los servicios públicos de OpenStreetMap (Overpass), que son lentos o se caen. La app consulta primero `GET /api/osm/around?lat=&lon=` (y, para «Buscar cercanos», `GET /api/osm/nearby?lat=&lon=&radius=&service=`) de tu servidor; si no responde (503 sin base, o sin servidor), usa los servicios públicos como antes.

Se arma con osmium en Docker (no hay que instalar nada) a partir del extracto de Sudamérica que ya baja el mapa:

```sh
sh tools/osm-index/build.sh deploy/maps/planetiler/sources/south_america.osm.pbf deploy/osm
```

Deja `deploy/osm/around.sqlite` (se escribe aparte y se renombra al terminar) y el servidor lo abre al reiniciar. Conviene rehacerla una vez por mes, después de actualizar el mapa (`update-maps.sh` baja el extracto nuevo). Los datos son © colaboradores de OpenStreetMap (ODbL). Detalle en `tools/osm-index/README.md`.

## Mantenimiento

**Actualizar a una versión nueva:**
```bash
cd SurvTools && git pull
cd deploy && docker compose up -d --build
```

> **Actualizá el servidor cada vez que se actualiza la app.** Las versiones nuevas pueden mandar tipos de aviso nuevos (por ejemplo, los faltantes de recomendaciones desde la v0.7.0). Un servidor viejo rechaza la lista completa de avisos y deja de notificar hasta que se lo actualice.

**Backup del servidor:** todo está en el volumen `vikarg-data`, en el archivo `vikarg.db`. Ahí están las claves VAPID; si se pierden, cada dispositivo tiene que volver a activar las notificaciones. Los datos de la app **no** están en el servidor: el backup de la app se hace desde la app.

```bash
docker compose exec vikarg sh -c 'cp /data/vikarg.db /data/vikarg-$(date +%F).db'
```

**Logs:**
```bash
docker compose logs -f vikarg
```

## Cómo funcionan los avisos

- La app envía al servidor el índice de alertas cada vez que cambia: nombre del artículo, tipo, fecha de vencimiento y desde cuándo avisar.
- Cada 10 minutos el servidor revisa qué dispositivos llegaron a su hora de aviso (en la zona horaria de cada uno) y les envía **solo lo nuevo** desde el último aviso, o lo que **vence ese día**. No repite la lista todos los días.
- En Android, Chrome entrega los push a través de Google (FCM): no hay forma de evitarlo en una PWA. El contenido viaja **cifrado de punta a punta**, así que Google no puede leerlo.
- Si un dispositivo desinstala la app o revoca el permiso, el servidor lo detecta en el siguiente envío y lo borra.

## Cómo funcionan los avisos de lluvia y rayos

- Funcionan con el servidor y las notificaciones activadas. La app manda los waypoints con aviso ("Avisarme de lluvia y rayos en este punto") y la última ubicación que leyó con la app abierta, si ya tiene permiso de GPS. La ubicación viene activada y se apaga en **Ajustes → Notificaciones**. Con la app cerrada el celular no le da el GPS a una PWA. Todo va redondeado a ~1 km.
- Si la última ubicación está a menos de 10 km de un waypoint con aviso, se ignora y avisa solo el waypoint, para no mandar dos notificaciones.
- Cada 15 minutos el servidor pide el pronóstico de las próximas 2 horas (Open-Meteo `minutely_15`), una sola vez por lugar aunque lo tengan varios dispositivos, y de a 50 lugares por consulta.
- Avisa **una vez por episodio**: "Lluvia en unos 45 min · Refugio" o "Está lloviendo". Vuelve a avisar recién cuando el pronóstico se seca y vuelve a llover. Si la ubicación de "donde estoy" tiene más de media hora, la notificación lo aclara, y si tiene más de 24 h no se usa.
- **El aviso se mantiene al día (2026-11-15):** el título lleva la **hora de inicio** («Lluvia a las 15:40 · Refugio», `rain.startsAt` en el push), porque «en 105 min» quedaba fijo en la barra por horas. Cuando pasa de «va a llover» a «está lloviendo», el servidor manda un segundo push con la misma etiqueta (`rain-<lugar>`, `update: true`) que **reemplaza** el aviso sin volver a sonar; y cuando deja de llover (**20 minutos secos seguidos**, `CLEAR_AFTER_MS`) manda `clear: true` y el service worker saca el aviso (muestra un aviso vacío y lo cierra, porque el navegador exige mostrar algo por cada push). Una lluvia nueva después de sacarlo es un aviso nuevo. Se guarda en `rain_places.notified` (0 sin aviso, 1 «está lloviendo», 2 «va a llover», 3 aviso ya sacado), **sin migración nueva**. Con la app abierta, `rainWatch.ts` hace lo mismo con los avisos que ya están en la barra (recalcula «en unos N min», pasa a «Está lloviendo» o los cierra) en cada revisión y al volver a la app. Pruebas: `server/test/rain.test.ts` y `format.test.ts`. **Sin probar en un celular real.**
- **Rayos:** cada 20 segundos, solo si hay algún lugar con aviso o alguien tiene abierto el mapa de rayos, lee los archivos nuevos del GOES-19 GLM (NOAA, dominio público, `noaa-goes19`, uno cada 20 s con todo el disco) y se queda solo con los rayos de la región (15° S a 60° S, 45° O a 82° O). NOAA no permite pedir una zona, pero de cada archivo (~380 KB) baja solo los ~36 KB con las coordenadas de los rayos, con pedidos parciales (HTTP Range): ~155 MB por día. Si una lectura parcial falla, ese archivo se baja completo. Una vez por hora el log muestra cuánto se bajó. La app los pide en `GET /api/lightning` (sin token: son datos públicos) cada 20 s mientras el mapa del tiempo con la capa de rayos está a la vista; cada tanda reemplaza a la anterior. Avisa si cae uno a menos de 30 km, con la distancia y la dirección ("Rayos a 12 km al noroeste · Casa"), y como mucho una vez cada 30 minutos por lugar mientras sigan cayendo, salvo que la tormenta se acerque 10 km o más desde el último aviso (ahí avisa de nuevo, pero no antes de 10 minutos). El satélite tiene unos 8 km de error y ~1 minuto de demora.
- **Lluvia observada:** NOAA retiró la lluvia estimada del GOES (`ABI-L2-RRQPEF`) el 2 de noviembre de 2026, y su reemplazo por ahora no está en el bucket abierto. Una vez por día el servidor revisa si aparece: si es así, lo anota en el log y en `/api/health` (`observedRain.available`).
- **Lluvia estimada propia:** mientras tanto, el servidor estima la lluvia con el infrarrojo del GOES-19 (banda 13), leyendo solo las franjas que cubren los lugares con aviso (~400 KB cada 10 minutos por franja). Si en el lugar el satélite ve lluvia, el aviso es "está lloviendo" con la intensidad estimada. Es orientativa: nubes altas muy frías que no llueven pueden dar falsas alarmas. En el mapa del tiempo, la capa "Lluvia estimada (satélite)" muestra la misma estimación para toda la región: mientras alguien la mira, cada 10 minutos el servidor lee la región entera (~5,4 MB) y arma una imagen de ~30 KB. `RAIN_OBSERVED=false` la apaga (avisos y mapa).
- Es pronóstico, no radar: en Argentina el horario es orientativo, con margen de una hora. La fuente es intercambiable (`server/src/rain/source.ts`), para sumar lluvia observada (GOES-19 o el radar del SMN) más adelante.

- **Peligros naturales:** en los mismos lugares y en los de tu reserva (ubicaciones del inventario con waypoint), el servidor avisa de sismos (USGS, `2.5_day.geojson`, ~50 KB cada 5 minutos) y de incendios forestales, inundaciones, ciclones y erupciones (GDACS, de la ONU y la Comisión Europea; cada 30 minutos, las páginas con eventos vigentes, ~270 KB). Solo si hay lugares con aviso. Los sismos se avisan según la magnitud: 3,5 a menos de 40 km, 4 a 100 km, 5 a 300 km, 6 a 600 km y 7 o más a 1500 km, y solo si son de las últimas 3 horas. Los de GDACS: alerta verde a menos de 100 km, naranja a 500 km y roja a 800 km. **Un solo aviso por evento**, aunque toque varios lugares: nombra el más cercano y, si hay reserva cerca, lo dice ("Tenés reserva cerca: Casa. Si podés, ponela a resguardo"). Se vuelve a avisar si el evento sube de nivel (tabla `hazard_notices`, se limpia a los 30 días). Se apagan por dispositivo en **Ajustes → Notificaciones**, y en todo el servidor con `HAZARDS_ENABLED=false`.
- Son **avisos informativos, no alertas oficiales**. En Argentina, la emisión de alertas meteorológicas y avisos oficiales a la población es competencia exclusiva del SMN: la app lo aclara en Clima, el mapa del clima, Notificaciones y Acerca de, y cada notificación de lluvia o rayos lo dice al final.

## Cómo funcionan los avisos de la huerta

- La app manda (`PUT /api/devices/:id/garden`) un lugar por cada grupo de canteros a menos de ~1 km, sacado del waypoint de cada cantero: sin waypoint no hay avisos (el GPS del celular no dice dónde está la huerta). Los canteros en invernadero no cuentan.
- Cada 15 minutos el servidor pide a Open-Meteo (`WEATHER_URL`) la evapotranspiración, la lluvia de los últimos 10 días y la mínima de los próximos 3, una vez por celda de ~1 km.
- **Helada:** a partir de las 17 (hora del lugar), si la mínima de la madrugada siguiente quema algo de lo plantado (sensibles con 2 °C, semirresistentes con −2 °C), un aviso por lugar y por noche.
- **Riego:** a la hora de aviso, balance de agua del suelo (ET0 × Kc menos la lluvia útil desde el último "regué"); si falta más que lo que las raíces sacan fácil, un aviso por episodio. Al marcar "Regué" en la app se vuelve a contar.
- **Tareas** (trasplantar, empezar a cosechar, terminar): a la hora de aviso, todas las que ya corresponden juntas en un solo aviso, una vez.

## Ríos: avisos y niveles de Bolivia

- **Avisos de ríos de Argentina (`server/src/rivers/watch.ts`):** cada 30 minutos el servidor lee, del INA (Alerta Hidrológico), el nivel de las estaciones que tienen un lugar guardado (waypoint, reserva o cantero) a menos de 5 km, y manda un aviso cuando el río llega a su nivel de alerta o de evacuación, o baja a «aguas bajas». Una vez por estación y lugar (otra vez si empeora, y de nuevo en la próxima crecida o bajante); una lectura de más de 12 horas no avisa. Funciona con los mismos avisos de peligro que sismos y volcanes (el interruptor de la app). Necesita `APP_DIR` (lee el catálogo `data/rivers-AR.json` de la app compilada). La fuente `INA` aparece en el aviso de fuentes caídas.
- **Niveles de Bolivia (`GET /api/rivers/bo`, `server/src/rivers/bo.ts`):** el SENAMHI Bolivia publica un PDF por día hábil; el servidor lo baja, lo lee (con `unpdf`, sin programas externos) y lo guarda 3 horas, solo cuando alguien lo pide. Si el SENAMHI falla devuelve el último bueno (hasta 7 días) marcado `stale`. No requiere cuenta ni token.

## Hora límite de regreso de una salida

En Entrena → Salidas, cada salida puede tener un plan con hora límite de regreso. Con las notificaciones activadas, la app le avisa al servidor **solo la hora límite, el nombre de la salida (para el título del aviso) y un texto ya escrito** (`PUT /api/devices/:id/deadline`, con el código del dispositivo; una por dispositivo). Integrantes, contactos y plan B **nunca salen del dispositivo** (salvo que el usuario mande el plan por SMS o WhatsApp). Si la hora pasa sin que la app la extienda ni cierre la salida, el servidor (`outings/watch.ts`, cada minuto) manda un push al propio dispositivo: el primero al pasar la hora y después cada 30 minutos, hasta tres. Se borra al cerrar la salida (`DELETE` del mismo camino), al borrar la cuenta (cascada) o 12 horas después de vencida. La hora debe estar entre un día atrás y un mes adelante, y el texto tiene tope (120 y 300 caracteres). Si hay un seguimiento en vivo en curso, la página pública para la familia suma la hora límite en relativo ("faltan 2 h" o "pasó hace 40 min, último «estoy bien» hace 20 min") y, si se pasó, el consejo de llamar a emergencias; solo lleva horas, no datos personales.

## Biblioteca (opcional)

La app lista los libros del servidor por categoría: los **libres** (dominio público o licencia libre) en verde, y los **con derechos** con candado. Estos últimos se bajan solo con la **clave VikArg** y llegan **cifrados** (PBKDF2-SHA256 + AES-256-GCM): se descifran en el celular. Si los archivos terminaran en git o copiados en otro lado, sin la clave no se pueden abrir.

```bash
# 1. La clave (una sola vez; fuera del repositorio).
echo 'la-clave' > ~/vikarg-library/.library-key && chmod 600 ~/vikarg-library/.library-key
# 2. Convertir lo que falta (los libros nuevos que agregues a la carpeta se detectan solos) y armar los paquetes.
sh tools/library-builder/run.sh status     # qué falta
sh tools/library-builder/run.sh update     # convierte solo lo pendiente
sh tools/library-builder/run.sh package    # catálogo + un ZIP por libro (los con derechos, cifrados)
```

El orden es siempre el mismo: primero los libros con texto (segundos cada uno) y después los escaneados, que necesitan OCR, de menos a más páginas. `update --no-ocr` hace solo los rápidos (los escaneados quedan pendientes, no se dan por hechos) y `update --limit 10` convierte como mucho 10 y termina (sale con código 3 si no quedaba nada): así se pueden armar los paquetes entre tandas y los libros van apareciendo en la app. Los que fallaron van al final de cada tanda. Para rehacer libros ya convertidos (por ejemplo, después de un arreglo del conversor), sus ids van en `~/vikarg-library/redo.txt`, uno por línea: la próxima corrida los convierte de nuevo y los saca de la lista.

En `deploy/.env`: `LIBRARY_PATH=/home/usuario/vikarg-library/packages` y `LIBRARY_KEY=` con la misma clave. El servidor relee el catálogo cuando cambia: no hace falta reiniciarlo.

API: `GET /api/library` (catálogo), `POST /api/library/key` (comprobar la clave; 10 intentos por IP cada 10 minutos) y `GET /api/library/books/:id` (los con derechos piden la clave en `x-library-key`).

## Datos que se actualizan solos (cada mes)

Los parques nacionales de Argentina (APN e IGN) y las áreas de CONAF en Chile, y las comisarías, bomberos y centros de salud de Chile y Uruguay cambian de vez en cuando. El servidor los vuelve a generar dos veces por mes (si una fuente falla, queda el anterior y se reintenta en la otra corrida) con las mismas herramientas del repositorio (`tools/`), dentro de un contenedor de Node, y los ofrece en `GET /api/data/:file` (`parks-AR.json`, `parks-CL.json`, `CL.json`, `UY.json`). La app compara la fecha (`generatedAt`) y se queda con la copia más nueva, la suya o la del servidor; queda guardada para usarla sin conexión. No hace falta publicar una versión nueva de la app.

Un archivo nuevo reemplaza al anterior solo si es JSON válido, trae fecha y no es mucho más chico (si una fuente cambió de formato o falló, queda el que estaba). Registro en `deploy/data-packs/update.log`. En el crontab del usuario:

```
0 5 3,17 * * sh ~/vikarg/server/src/data/update-data.sh ~/vikarg/deploy/data-packs
```

## Aviso de fuentes caídas

Si una fuente externa (SMN, Dirección Meteorológica de Chile, INUMET, los SENAMHI de Bolivia y Perú, SIGMET de ceniza, OAVV, CENVUL, USGS, GDACS, Open-Meteo o los rayos del GOES-19) falla 3 veces seguidas durante al menos 30 minutos, el servidor manda **un** mail a `ADMIN_EMAIL`, y otro cuando vuelve a responder. El estado se guarda en la base (`source_status`), así que reiniciar no repite el aviso. Mientras tanto la app sigue mostrando lo último que se pudo leer. Para Gmail hace falta la verificación en 2 pasos y una contraseña de aplicación (Cuenta de Google → Seguridad → Contraseñas de aplicaciones).

## Avisos de actualizaciones importantes

No salen solos con cada versión: se mandan a mano, solo cuando una versión trae algo importante. Llegan a los dispositivos con notificaciones que no apagaron **Ajustes → Notificaciones → "Avisarme de actualizaciones importantes de la app"** (viene prendido). Al tocarlo se abre la app, que baja la versión nueva. Cada versión se anuncia una sola vez: el servidor anota cuáles ya mandó (tabla `announcements`).

```bash
cd SurvTools/deploy
# Prueba: cuántos dispositivos lo recibirían, sin mandar nada.
docker compose exec vikarg node src/announce.ts --version 0.23.0 \
  --title-es "VikArg 0.23" --body-es "Ahora te avisamos de las actualizaciones importantes." \
  --title-en "VikArg 0.23" --body-en "We now let you know about important updates." --dry-run
# El envío: lo mismo sin --dry-run. Para repetir una versión ya anunciada, --force.
```

Título hasta 80 caracteres y texto hasta 300, en español y en inglés (cada celular muestra el de su idioma). El comando dice cuántos se entregaron y borra las suscripciones que ya no existen.

## Eliminar una cuenta

Cada dispositivo puede borrar su cuenta y todos sus datos del servidor desde **Ajustes → Eliminar mi cuenta** (pide la contraseña de la app). Si alguien ya no tiene la app y lo pide por mail con el código de dispositivo:

```bash
cd SurvTools/deploy
docker compose exec vikarg node src/deleteDevice.ts <código de dispositivo>
```

Borra el dispositivo y, en cascada, sus vencimientos, lugares de avisos, huerta, depósitos y avisos enviados. Toda tabla nueva con `device_id` tiene que llevar `ON DELETE CASCADE` (lo verifica un test).

## Seguridad

- Cada dispositivo recibe un token propio al registrarse. El servidor guarda solo su hash.
- Los códigos de transferencia son de un solo uso. Una IP que prueba más de 20 códigos inválidos en 10 minutos queda bloqueada temporalmente.
- El servidor corre como usuario sin privilegios dentro del contenedor.

## Mareógrafos medidos del IOC

`GET /api/ioc/:code` devuelve las últimas 30 horas de un mareógrafo (un punto cada 10 minutos, un solo sensor). Necesita `IOC_API_KEY` en `deploy/.env` (se pide en ioc-sealevelmonitoring.org con una cuenta del grupo «Access gauges API»); sin ella responde 404 y la app no muestra la línea medida. Solo atiende los códigos de `app/public/data/ioc-stations.json` (se regenera con `node tools/tide-data/ioc.mjs`) y guarda cada respuesta 5 minutos; si el IOC falla, devuelve la última buena (hasta 6 horas) marcada `stale`. Uso no comercial: en una copia paga o institucional se apaga con `VITE_COMMERCIAL=1` y sin clave.

## Ríos: aviso anticipado con el pronóstico del INA

Además del aviso en vivo, `runRiverForecastWatch` (`server/src/rivers/watch.ts`, con `rivers/forecast.ts`) avisa si el pronóstico del INA (la línea principal, no la banda) indica que el río llegará dentro de 7 días al nivel de alerta, de evacuación o a aguas bajas, y hay un lugar guardado a menos de 5 km. Solo para las estaciones con `forecast` en `rivers-AR.json` (17). El pronóstico se baja cada 3 horas como máximo y solo de las estaciones vigiladas (modelos `sim/calibrados/{id}/corridas?includeProno=true`; el del Delta, casi 1 MB, se pide solo si la estación vigilada lo necesita). Una vez por estación, lugar y nivel (claves `river-fc:` y `river-fc-low:` en `hazard_notices`); si el pronóstico después suma un nivel más grave se avisa de nuevo, y cuando deja de cruzar se borra lo avisado. Si el río ya está en ese nivel, avisa el aviso en vivo. La notificación lleva `river.forecast = true`.

## Índice de paquetes de datos

`GET /api/data/index.json` devuelve `{ files: { "CL.json": { date, bytes }, … } }` con la fecha de generación (`generatedAt`, vacía si el paquete no la trae) y el peso de cada paquete de `DATA_PACKS_DIR` que figura en la lista de `/api/data/:file`. La app lo compara con el índice que trae (`public/data/index.json`) para bajar solo los paquetes guardados que cambiaron, en vez de los archivos enteros. No hace falta tocar `update-data.sh`: el índice se arma leyendo la carpeta (con caché por fecha de modificación y peso).

## Focos de calor: GET /api/fires

Baja las listas públicas de NASA FIRMS (VIIRS NOAA-20 y NOAA-21, últimos 7 días, ~10 MB, sin clave), se queda con toda América del Sur (lon −83 a −33, lat −57 a 13; Brasil entero), muestra solo las últimas 24 horas, oculta las detecciones nominales y de baja confianza de las fuentes fijas (6 o más fechas distintas en la región original, 8 fuera de ella, de las últimas 8, en el mismo cuadro de ~1 km) y devuelve celdas de 0,1° `[lat, lon, detecciones, alta confianza, nominales, FRP total, minutos desde la más reciente]`, más `fetchedAt`, `newestAt`, `total`, `hidden` (las ocultas) y `sources`. En Brasil suma `inpe` (opcional): por celda `[riesgo de fuego, días sin lluvia, bioma, "Municipio-UF"]` del CSV diario del INPE Queimadas (`fires/inpe.ts`; solo enriquece, no suma detecciones). Guarda 30 minutos en memoria; si FIRMS falla devuelve la última buena (hasta 6 horas) con `stale: true`, y 503 si no hay ninguna. Un satélite que falla no tira al otro. Sin tocar la base de datos ni el cron.

## Bolivia (pronóstico y lago) y Uruguay: GET /api/rivers/bo/extra y GET /api/rivers/uy

- **`/api/rivers/bo/extra`:** el resumen del pronóstico hidrológico del SENAMHI Bolivia, el boletín semanal del lago Titicaca y la **planilla por estación** del pronóstico (`rivers/boExtra.ts` y `rivers/boPlanilla.ts`: amenaza, tendencia, cuánto falta para el desborde y período, leídos por la posición de cada texto del PDF). Busca el PDF más nuevo en las páginas de listados del SENAMHI, lo lee con `unpdf` y devuelve `{ forecast, lake, fetchedAt, stale }`. Guarda 6 horas si salieron el pronóstico y el boletín del lago (si falta uno, reintenta a la hora); si falla, devuelve lo último bueno hasta 14 días con `stale: true`; cada uno puede fallar sin tirar al otro.
- **`/api/rivers/uy`:** niveles de CARU y DINAGUA (`rivers/uy.ts`). Guarda 2 horas si salieron las dos fuentes (si falta una, reintenta a los 10 minutos y conserva las estaciones de la última lectura de la que falló); si falla del todo, lo último bueno hasta 3 días. CARU tiene 20 s de tiempo de espera (su servidor es lento a veces) y DINAGUA 60 s. Variables de entorno opcionales `CARU_URL` (por defecto `http://190.0.152.194:8080/alturas/web/user/alturas`; si CARU cambia de IP) y `DINAGUA_URL` (por defecto `https://www.ambiente.gub.uy/dinagua-obh/api/niveles-y-caudales`, 5,7 MB por consulta). Una fuente caída no tira a la otra. Sin migraciones ni cron.

## Open-Meteo propio: GET /api/om/v1/{forecast|archive|marine}

**Qué es.** Una copia propia de Open-Meteo (software AGPL-3.0, imagen `ghcr.io/open-meteo/open-meteo`) con los datos de la región (lat −57 a 1, lon −83 a −33) bajados del bucket público de Open-Meteo. Es la **primera opción** para el clima; el servicio público (`api.open-meteo.com`) queda de respaldo.

**Piezas** (`deploy/docker-compose.yml`):
- `openmeteo`: sirve la API en la red interna del compose (sin puerto publicado). Lee `OPEN_METEO_PATH` (por defecto `./openmeteo-data`).
- `openmeteo-sync` (`deploy/openmeteo/sync.sh`): cada hora baja el pronóstico (ECMWF IFS, GFS 0,13° y 0,25°, ICON, ARPEGE, UKMO, JMA, probabilidad de lluvia, olas; 92 días atrás; ARPEGE, UKMO y JMA son para «Comparación de pronósticos»), cada día el historial ERA5 desde `OPEN_METEO_ARCHIVE_FROM` (2020) hasta hoy y una vez el relieve (DEM 90 m, necesario para corregir la temperatura por altura). La región está en `deploy/openmeteo/region.json`.
- El servidor VikArg (`OPEN_METEO_LOCAL_URL`, por defecto `http://openmeteo:8080`) expone `/api/om/v1/...` y la usa también para los avisos de lluvia y de la huerta.

**Cómo decide la app** (`app/src/modules/weather/omFetch.ts`): prueba `/api/om/...` y, si responde 404 («ese dato no está en la copia»: fechas de historial anteriores a lo que se baja, un lugar fuera de la región, una variable sin datos o huecos en el historial) o 503/error (copia apagada o caída), pide lo mismo al servicio público. Tras un error del servidor no vuelve a probar el propio por 5 minutos. Si la persona puso otra dirección de clima en Ajustes, se respeta y no se toca.

**Medido (2026-11-17, piloto en esta máquina):** pronóstico completo con 92 días ≈ 14 GB; historial ERA5 ≈ 2,1 GB por año (11 variables; 2020–2026 ≈ 15 GB y crece ~2 GB por año); relieve 10 GB (se bajó el mundo entero); total del piloto 34 GB. Con un mismo modelo (ECMWF, GFS, ERA5) la copia propia da exactamente lo mismo que la API pública; sin elegir modelo, la API pública mezcla más modelos y la diferencia típica es de ~1,5 °C en temperatura. ICON necesita además la grilla nativa de tres dominios (`dwd_icon_global_native`, `dwd_icon_global_eps_native`, `dwd_icon_eu_native`: ~85 MB cada uno); `sync.sh` los baja con `curl` (función `icon_static`) porque `sync` no lo hace y, sin ellos, el servidor responde «Missing native ICON grid artifact».

**Para cambiar el área o el año de inicio:** `deploy/openmeteo/region.json` y `OPEN_METEO_ARCHIVE_FROM` (si se cambia, también `ARCHIVE_FROM_YEAR` en `app/src/modules/weather/omFetch.ts`: las heladas de la huerta y el viento predominante se calculan desde ese año). Sin la carpeta de datos (o sin los contenedores), todo sigue funcionando con el servicio público.


## Seguridad: límites de pedidos y lista de verificación (2026-11-18)

**Qué se revisó.** El código del servidor no tiene vías de inyección: no usa `eval` ni `child_process`, el SQL va con parámetros (solo las migraciones arman texto y no dependen de lo que mande quien llama), los archivos que sirve salen de listas fijas (paquetes de datos) o de un identificador de letras minúsculas, números y guiones (biblioteca), los pedidos tienen tope de tamaño y los tokens de los dispositivos se guardan con hash. Lo débil era el **abuso** de los endpoints públicos que cuestan algo.

**Límites de pedidos por IP** (`server/src/rateLimit.ts`, enganchados en `app.ts`). Al pasarse responde `429` con `Retry-After`; la app pasa sola al servicio público (ver `omFetch.ts`). Se cambian con variables de entorno del servicio `vikarg` (0 = sin límite):

| Variable | Por defecto | Qué limita |
|---|---|---|
| `RATE_OM_PER_MIN` | 300 | Clima propio, `/api/om/*` (cada pantalla de clima pide unas pocas consultas) |
| `RATE_ADDRESS_PER_MIN` | 60 | Altura de calle, `/api/address/*` (cada consulta va a Georef en nombre del servidor) |
| `RATE_OSM_PER_MIN` | 300 | Base de calles, `/api/osm/*` |
| `RATE_TRANSFER_UPLOADS_PER_HOUR` | 4 | Subidas de backups de transferencia por hora (`POST /api/transfers`, hasta 50 MB cada una): más de 4 desde la misma IP se considera abuso. Una persona que migra sus datos usa 1; si varias personas comparten IP (una escuela), subirlo |
| `TRANSFER_STORE_MAX_MB` | 1024 | Tope de lo que se guarda de transferencias a la vez; al llegar, `503 storage-full` (se vacían solas a las 24 h o al entregarse) |

Con una escuela entera detrás de una sola IP los valores de clima, calles y alturas sobran; el de transferencias es estricto a propósito (4 por hora): en una copia institucional donde muchas personas migren a la vez, subirlo. Detrás de Caddy se usa la IP real del visitante (`trustProxy`).

**Lista de verificación del equipo que aloja el servidor** (esto NO lo cubre el código):
1. **Qué se ve desde internet.** En el router, solo deben estar reenviados el **80 y el 443**. Revisar las reglas de reenvío de puertos, la zona **DMZ** (apagada) y **UPnP** (apagado). Probar desde el celular con datos móviles (sin wifi) que otros servicios del equipo no respondan por la IP pública (por ejemplo Dozzle 9999, Qdrant 6333, Ollama 11434, el escritorio remoto 3389). El 2026-11-18 se vio que, conectándose a la IP pública desde el propio equipo, todos esos puertos respondían: puede ser solo el espejo del router, pero hay que confirmarlo desde afuera.
2. **Servicios que escuchan en todas las interfaces.** Los contenedores ajenos a VikArg publican puertos en `0.0.0.0`: si no necesitan verse desde otro equipo, publicarlos solo en `127.0.0.1` (`127.0.0.1:PUERTO:PUERTO` en su `docker-compose`). Docker saltea `ufw` y `fail2ban` para los puertos que publica.
3. **SSH.** Solo con clave (`PasswordAuthentication no` en `/etc/ssh/sshd_config`, probando antes con la clave desde otra terminal) y, si no hace falta desde afuera, sin reenviar el puerto 22.
4. **fail2ban para SSH.** `sudo apt install -y fail2ban`, un archivo `/etc/fail2ban/jail.d/sshd-local.conf` con `[sshd] enabled = true`, `backend = systemd`, `maxretry = 5`, `findtime = 10m`, `bantime = 1h` y `ignoreip` con la red local; `sudo systemctl enable --now fail2ban` y comprobar con `sudo fail2ban-client status sshd`.
5. **Actualizaciones** del sistema y de las imágenes de Docker (`caddy`, `open-meteo`), y copia de seguridad del volumen `vikarg-data`.


### Equipo en la zona DMZ del módem (2026-11-18)

El equipo que aloja el servidor está en la **zona DMZ**: el proveedor no da acceso al módem y solo abre puertos así. Con DMZ, el módem manda **todo** el tráfico de internet al equipo, así que cada servicio que escucha en todas las interfaces queda público. Se encontró expuesto lo ajeno a VikArg (Ollama, Qdrant, Dozzle, administrador, Filebrowser, Jellyfin y demás, más el escritorio remoto): Ollama ya tenía pedidos de escáneres de IPs públicas y SSH, unos 31.000 intentos fallidos en 7 días (no hubo logins aceptados desde fuera de la LAN).

Como `ufw` no filtra los puertos que publica Docker (van por `FORWARD`), la defensa se hace en la propia máquina con los scripts de `deploy/seguridad/` (se corren con `sudo`, sin `--apply` solo simulan):

| Script | Qué hace |
|---|---|
| `cerrar-puertos.sh` | Reglas en `DOCKER-USER`: desde internet solo entran 80 y 443; la LAN (`LAN=192.168.0.0/24`) y los contenedores entre sí siguen igual. Escritorio remoto (3389) solo desde `RDP_FROM`. Instala `cerrar-puertos.service` para que sobreviva al reinicio. |
| `ssh-solo-clave.sh` | SSH sin contraseña (archivo aparte en `sshd_config.d`, validado con `sshd -t`). Probar antes que se entra con clave. |

Aplicado el 2026-11-18: `cerrar-puertos.sh`. Se verificó que 9999 y 11434 dejaron de responder por la IP pública y que nomad y VikArg siguen andando. Pendiente de confirmar desde afuera (datos del celular). fail2ban tiene activa la jaula `sshd` (5 intentos, ban de 1 h, LAN exenta). Regla general: **un servicio nuevo en este equipo se publica en `127.0.0.1` o desde la LAN, nunca abierto, salvo 80/443.**



### Opción: alojarlo en un VPS (por ejemplo, Hostinger KVM) — anotada el 2026-11-18, sin decidir

Alternativa a seguir en el equipo de casa. Ventajas: sin la DMZ del proveedor de internet (el servidor queda aislado de la red de casa), IP fija (se acaba el DDNS gratuito que hay que confirmar cada 30 días), siempre encendido y más ancho de banda. Planes KVM de Hostinger (especificaciones coincidentes en varias fuentes, [página oficial](https://www.hostinger.com/pricing/vps-hosting); **los precios no se confirmaron**: los de lanzamiento valen solo el primer período y la renovación es bastante más cara):

| Plan | vCPU | Memoria | Disco | Transferencia |
|---|---|---|---|---|
| KVM 1 | 1 | 4 GB | 50 GB | 4 TB |
| KVM 2 | 2 | 8 GB | 100 GB | 8 TB |
| KVM 4 | 4 | 16 GB | 200 GB | 16 TB |
| KVM 8 | 8 | 32 GB | 400 GB | 32 TB |

Qué plan: el núcleo del servidor (avisos, transferencias, rayos, biblioteca) pesa menos de 1 GB de datos + ~1,5 GB de imágenes de Docker, así que **KVM 1** alcanza para eso solo. **KVM 2** para sumar los mapas (16 GB) y las calles (1,3 GB). **KVM 4** para tener además el clima propio (45 GB, crece 5–10 GB por año) y poder reconstruir los mapas (unos 7 GB de memoria y 30 GB de disco temporal durante ~3 horas de procesador). Las partes pesadas son opcionales: sin ellas la app usa las fuentes públicas.

Para mudarlo: seguir «Si hubiera que pasar el servidor a otro equipo» (abajo). Conviene **conservar el mismo nombre de dominio** (`valhallarust2.ddns.net`) y solo repuntarlo a la IP nueva: así ningún dispositivo tiene que reconfigurarse. Lo único irrecuperable sigue siendo el volumen `vikarg-data` (claves VAPID), el `.env` y el `Caddyfile`. Repetir la seguridad (`deploy/seguridad/`) y las tareas programadas. **Sin verificar:** las condiciones de uso de Hostinger para este tipo de servicio y qué centros de datos ofrece (uno cercano, como São Paulo, bajaría la latencia).

## Mudar el servidor a otro equipo

**Cuánto disco hace falta** (medido el 2026-11-18): unos **65 GB** de datos, y conviene tener **100 GB libres**.

| Qué | Espacio | Se puede regenerar |
|---|---|---|
| `deploy/openmeteo-data` (clima propio) | 45 GB | Sí: `openmeteo-sync` lo vuelve a bajar solo; la primera descarga tarda horas. Crece 5–10 GB por año. |
| `deploy/maps` (mapas offline) | 16 GB | Con `tools/maps` (horas y ~30 GB de disco temporal): mejor copiarlo. |
| `deploy/osm` (calles y números) | 1,3 GB | Con `tools/osm-index`: mejor copiarlo. |
| `deploy/data-packs` | 10 MB | Sí, con `server/src/data/update-data.sh`. |
| Imágenes de Docker (Open-Meteo, Caddy, VikArg) | ~1,5 GB | Se bajan solas. |
| Código (`git clone`) | 0,7 GB | Sí. |

Lo **único que no se puede regenerar** es el volumen `vikarg-data` (menos de 1 MB: la base SQLite con las cuentas de dispositivos, los avisos y las **claves VAPID**), el `.env` y el `Caddyfile`. Si se pierden las claves VAPID, cada dispositivo tiene que volver a activar las notificaciones. Sin clima propio (no copiarlo ni dejar `openmeteo` corriendo) alcanza con ~20 GB: la app pasa sola al servicio público.

**Pasos** (el equipo nuevo necesita Docker con el plugin `compose`, `git` y los puertos 80 y 443 alcanzables desde internet):

1. **En el equipo nuevo, preparar:** `git clone` del repositorio y entrar en `deploy/`. Copiar el `.env` del equipo viejo (tiene el dominio y las claves; **no lo subas a ningún lado**) y el `Caddyfile` si lo cambiaste.
2. **Copiar los datos grandes antes del corte** (con el servidor viejo todavía andando, así el corte dura minutos). Desde el equipo viejo:
   ```bash
   rsync -aH --info=progress2 ~/vikarg/deploy/{maps,osm,data-packs} usuario@NUEVO:vikarg/deploy/
   rsync -aH --info=progress2 ~/vikarg/deploy/openmeteo-data usuario@NUEVO:vikarg/deploy/   # opcional, 45 GB
   ```
   Se puede repetir: la segunda pasada solo manda lo que cambió.
3. **Corte (el servidor viejo queda parado unos minutos).** En el viejo, bajar solo VikArg y copiar la base:
   ```bash
   cd ~/vikarg/deploy && docker compose stop vikarg
   docker run --rm -v deploy_vikarg-data:/data -v "$PWD":/out alpine tar czf /out/vikarg-data.tgz -C /data .
   scp vikarg-data.tgz usuario@NUEVO:vikarg/deploy/
   ```
   En el nuevo, crear el volumen y cargarlo **antes** del primer arranque:
   ```bash
   cd ~/vikarg/deploy && docker volume create deploy_vikarg-data
   docker run --rm -v deploy_vikarg-data:/data -v "$PWD":/in alpine tar xzf /in/vikarg-data.tgz -C /data
   docker compose up -d --build
   ```
   El nombre del volumen sale de la carpeta (`deploy_`): si el compose se corre desde otra, cambia (`docker volume ls`).
4. **Cambiar el DNS** del dominio a la IP del equipo nuevo. Caddy saca el certificado HTTPS solo cuando el dominio ya apunta ahí (si el nuevo equipo está detrás de un módem, abrir 80 y 443 hacia él; ver «Equipo en la zona DMZ» más arriba por los riesgos). Mientras el DNS no cambie, el viejo sigue siendo el que ven los usuarios: si se cortó el paso 3, volver a `docker compose start vikarg` en el viejo.
5. **Repetir en el nuevo la seguridad** (`deploy/seguridad/`: `cerrar-puertos.sh` y `ssh-solo-clave.sh`) y las **tareas programadas** del equipo viejo (`crontab -l`: el mapa mensual `server/src/maps/update-maps.sh` y los datos `server/src/data/update-data.sh`, que apuntan a `~/vikarg/deploy/...`).
6. **Verificar:** `curl https://DOMINIO/api/health` (`ok: true`); abrir la app, comprobar que el dispositivo sigue con sus notificaciones (misma clave VAPID: no hace falta reactivar), un pedido a `/api/om/v1/forecast` y que el mapa offline carga. Mirar `docker compose logs --tail 100`.
7. **Apagar el viejo** solo cuando todo esté probado y pasaron unos días. Si el clima propio no se copió, `openmeteo-sync` arranca a bajarlo en el nuevo (los pedidos mientras tanto caen al servicio público).

**Si cambia el dominio** (no solo la IP): cada dispositivo tiene la dirección del servidor guardada en Ajustes y habría que cambiarla uno por uno. Conviene conservar el dominio.


## Avisos a la app nativa (FCM) — preparado, sin activar

El servidor ya sabe mandar avisos a dispositivos nativos por **Firebase Cloud Messaging** (`server/src/fcm.ts`); los dispositivos web siguen por Web Push como siempre. Está **apagado** hasta que haya una cuenta de Firebase y una app nativa.

- **Cómo se activa (hecho así en el equipo de producción el 2026-11-18):** crear el proyecto de Firebase con la cuenta del proyecto, generar la **clave de cuenta de servicio** (Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada; archivo JSON) y copiarla al servidor como `deploy/secrets/fcm-service-account.json` (carpeta con permisos 700, archivo 600, **ignorada por git**). Un `deploy/docker-compose.override.yml` propio del equipo (también ignorado) monta `./secrets` en `/run/secrets` y define `FCM_SERVICE_ACCOUNT_FILE=/run/secrets/fcm-service-account.json`; después `docker compose up -d vikarg` (no hace falta reconstruir). Si el archivo falta o está mal, el servidor arranca igual sin FCM y lo dice en el log. Sin esa variable, el servidor rechaza el registro de dispositivos nativos con `fcm-not-configured`. `GET /api/health` informa `fcm: true|false`.
- **Cómo se registra un dispositivo nativo:** `POST /api/devices` con `subscription: { fcm: "<token>", platform: "android" | "ios" }` en lugar de la suscripción web. Se guarda en la misma columna `devices.subscription` (**sin migración**); todo lo demás (avisos, lugares, borrado de cuenta) funciona igual.
- **Qué viaja (decisión provisional del 2026-11-18, para el APK de prueba):** solo el **tipo** de aviso (`data.type`) y un texto **genérico** que el propio teléfono traduce con claves de idioma (`notif_title`, `notif_body_new`, `notif_body_test` en `strings.xml` de la app, en español y en inglés). No viajan nombres de botiquines, lugares ni artículos: FCM no tiene el cifrado de punta a punta del Web Push, y Google vería el contenido. Un mensaje de datos puro no se muestra en Android con la app cerrada, por eso lleva el bloque `notification`. Cambiarlo es reemplazar `fcmMessage` en `fcm.ts`; hay una prueba que falla si el contenido de un aviso llegara a viajar.
- **Sin probar con Google de verdad:** el envío está probado con un `fetch` simulado y con el formato documentado de la API HTTP v1 (OAuth2 con JWT RS256, `messages:send`). Con la primera cuenta real hay que mandar un aviso de prueba a un teléfono y comprobar la respuesta (en especial el mapeo de errores: un token vencido es `UNREGISTERED`/404 y borra el dispositivo; el resto se lanza).
- **iPhone:** un mensaje de datos solo despierta la app; mostrar el texto sin que viaje en el mensaje necesita una extensión nativa de iOS. Pendiente para la versión de iPhone.


### Servidor y app nativa de Android

- **`ALLOWED_ORIGINS`:** el WebView de la app nativa tiene el origen `https://localhost` (Capacitor, `androidScheme: https`). Con el valor por defecto (`*`) anda sin tocar nada; si se restringe la lista (por ejemplo `ALLOWED_ORIGINS=https://vikarg.ejemplo.com,https://mazzalaialan.github.io`), hay que **sumar `https://localhost`** o la app nativa no podrá hablar con el servidor.
- **Avisos por FCM:** ver «Avisos a la app nativa (FCM)». El teléfono traduce el texto con claves de idioma; el ícono chico y el color salen de `ic_stat_vikarg` y `notification_color` del proyecto de Android.

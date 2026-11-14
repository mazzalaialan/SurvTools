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

1. En la app: **Ajustes → Conexiones → Servidor VikArg**, poné `https://TU_DOMINIO` y tocá **Probar conexión**.
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
| `LIGHTNING_ENABLED` | `true` | Avisos de rayos (GOES-19 GLM); `false` los apaga |
| `LIGHTNING_INTERVAL_SECONDS` | `20` | Cada cuánto busca rayos nuevos (el satélite saca un archivo cada 20 s) |
| `LIGHTNING_FILES_PER_POLL` | `3` | Archivos que lee como mucho por pasada (si se atrasa, se pone al día) |
| `LIGHTNING_PARTIAL` | `true` | Bajar solo las coordenadas de los rayos de cada archivo (~36 KB, ~155 MB por día con los tres por minuto); `false` baja el archivo completo (~380 KB, ~1,6 GB por día) |
| `LIGHTNING_RADIUS_KM` | `30` | Distancia para avisar de rayos |
| `MAPS_DIR` | `/maps` (con el compose; si no, `DATA_DIR/maps`) | Carpeta con `vector.pmtiles` y `elevation.pmtiles`; vacío = sin mapas |
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

**Cómo lo usa la app.** En *Ajustes → Conexiones → Bajar los mapas de* se elige entre tres opciones:
- **Automático** (por defecto): pide cada tesela a este servidor. Si no responde, está sobrecargado (503) o no tiene esa zona, la pide a las fuentes públicas, y deja de lado al servidor por un rato (lo que diga `Retry-After`, o 5 minutos). Una zona más grande que el límite público se baja solo del servidor: si falla a mitad de camino, quedan teselas sin bajar y se completa repitiendo la descarga más tarde.
- **Solo mi servidor.**
- **Solo servidores públicos**, como antes.

API: `GET /api/maps` informa los archivos (zooms, zona, fecha) y los límites, y `GET /api/maps/{vector|elevation}/z/x/y` entrega una tesela (204 si no hay datos en ese lugar). Las teselas del mapa salen comprimidas tal como están en el archivo (`Content-Encoding: gzip`).

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
- **Rayos:** cada 20 segundos, solo si hay algún lugar con aviso o alguien tiene abierto el mapa de rayos, lee los archivos nuevos del GOES-19 GLM (NOAA, dominio público, `noaa-goes19`, uno cada 20 s con todo el disco) y se queda solo con los rayos de la región (15° S a 60° S, 45° O a 82° O). NOAA no permite pedir una zona, pero de cada archivo (~380 KB) baja solo los ~36 KB con las coordenadas de los rayos, con pedidos parciales (HTTP Range): ~155 MB por día. Si una lectura parcial falla, ese archivo se baja completo. Una vez por hora el log muestra cuánto se bajó. La app los pide en `GET /api/lightning` (sin token: son datos públicos) cada 20 s mientras el mapa del tiempo con la capa de rayos está a la vista; cada tanda reemplaza a la anterior. Avisa si cae uno a menos de 30 km, con la distancia y la dirección ("Rayos a 12 km al noroeste · Casa"), y como mucho una vez cada 10 minutos por lugar mientras sigan cayendo. El satélite tiene unos 8 km de error y ~1 minuto de demora.
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

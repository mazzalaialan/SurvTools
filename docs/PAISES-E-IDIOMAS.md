# Sumar un país o un idioma nuevo

Guía de trabajo (escrita el 2026-11-16 revisando el código real y con una investigación de fuentes de Paraguay). Sirve para **cualquier país** que se quiera agregar y para **cualquier idioma**. Al final están los dos casos pendientes: **Paraguay** y **portugués**. **Paraguay ya está cargado (2026-11-16)**; el portugués, Brasil, Ecuador, Colombia y Venezuela quedan pendientes.

Reglas que valen siempre (ver `CLAUDE.md`): datos con licencia anotada (fuente, licencia y fecha), sin saltear protecciones de terceros, alertas «informativas» nunca oficiales, ninguna función depende de la red, y publicar solo con aprobación explícita.

---

## A. Sumar un país: lista de lugares que se tocan

Hoy hay cinco países (AR, CL, UY, BO, PE) y el código los repite en estos sitios. Para el país nuevo `XX` hay que pasar por **todos**; olvidarse de uno deja al país a medias sin que falle una prueba.

### A1. Tipos y detección (app)
| Dónde | Qué |
|---|---|
| `app/src/core/settings/settings.ts` | `Country` y `COUNTRIES`; `detectCountry()` (por zona horaria del dispositivo: agregar la de `XX`); `GardenZone` si hay zona de huerta propia |
| `app/src/modules/weathermap/geo.ts` | `GeoCountry` y `GEO_COUNTRIES` |
| `app/src/modules/emergency/` | `country.ts`, `countryDetector.ts`, `borders.ts`, `countryDownload.ts`, `currentCountry.ts`: usan `COUNTRIES`; revisar que no tengan listas propias |
| `app/src/modules/emergency/national.ts` | números nacionales (emergencias, bomberos, policía, ambulancia, otros) con fuente |
| `app/src/modules/firstAid/guides/types.ts` | teléfonos de la guía de primeros auxilios (emergencias, ambulancia, bomberos, **toxicología**: cada país tiene un centro distinto y el texto va en es y en) |
| `app/src/modules/emergency/RadioPage.tsx`, `repeaters.ts` | radio y repetidoras (¿hay listado abierto?) y si el país tiene parques |
| `app/src/modules/emergency/data.ts` | cargadores de parques por país (si hay) |
| `app/src/modules/garden/calendar.ts` | zona de huerta del país (`zoneFor`); hoy BO y PE devuelven `null` o zona propia, UY usa `pampeana` |
| `app/src/locales/{es,en}.json` | nombre del país, ajustes, textos propios |

### A2. Datos que se generan (herramientas)
| Herramienta | Qué hay que hacer |
|---|---|
| `tools/geo-data/build.mjs` | `COUNTRIES` (código A3→A2); sacarlo de `NEIGHBORS` si ya estaba como vecino (hoy Paraguay está ahí); regiones (admin-1 de Natural Earth), capitales, nombre del país. Atajo: `--solo-contornos` solo suma contornos sin volver a bajar todo |
| `tools/emergency-data/borders.mjs` | fronteras para detectar el país → `borders-data.json` |
| `tools/country-data/build.mjs` | `RADIO_XX`, textos por categoría (bomberos, policía, centro de salud) y llamada `build('XX', …)`; genera `app/public/data/XX.json` |
| `tools/services-data/build.mjs` | `COUNTRIES` y `MIN_FUEL.XX` (mínimo de surtidores para dar el dato por bueno); genera `pharmacy/fuel/atm/vet/repair/tyres/shelter/water/aed/nautical-XX.json` desde OpenStreetMap (hoy vía Overpass; la idea pendiente es Geofabrik) |
| `tools/emergency-data/parks-*.mjs` | parques: solo con fuente que permita redistribuir (**WDPA/Protected Planet no**: prohíbe redistribuir en mapas web y apps) |
| `tools/tide-data`, `tools/river-data` | mareógrafos y estaciones de ríos del país, si existen |
| `npm run data-sizes` | regenerar `data-sizes.json` e `index.json` (una prueba avisa si quedó viejo) |

### A3. Servidor
- `server/src/routes/data.ts`: `SERVICE_COUNTRIES` y la lista de archivos que sirve (`XX.json`, `parks-XX.json`).
- `server/src/data/update-data.sh`: un `step` por archivo y el `for cc in …` de los servicios.
- Ríos, alertas o lluvia propios del país: carpeta nueva en `server/src/` (ejemplo: `rivers/bo.ts` para el PDF de Bolivia) con su ruta, caché de «último bueno» y pruebas con la respuesta real guardada como fixture. **Migraciones:** solo al final de `db.ts`.

### A4. Pruebas y documentación
- Pruebas que listan países: `country.test.ts`, `countryDetector.test.ts`, `countryDownload.test.ts`, `borders.test.ts`, `services.test.ts`, `parks.test.ts`, `garden.test.ts`, `tides.test.ts` y el e2e `country-detect.spec.ts` (agregar un caso con la zona horaria del país).
- `docs/FUENTES-DE-DATOS.md`: qué se probó, qué sirve y qué no, con fuente, licencia y fecha.
- Catálogo de licencias (`legal`/pantalla de licencias): cada fuente nueva con su licencia; las «derechos reservados» o «no comercial» llevan el interruptor de la copia comercial.
- `docs/PENDIENTES.md` y esta guía.

### A5. Orden recomendado
1. **Investigar fuentes** con `vikarg-investigador` (teléfonos, meteorología, ríos, parques, radio, límites, OSM, huso horario) y anotarlas en `FUENTES-DE-DATOS.md` antes de escribir código.
2. Tipos y detección (A1) + límites y contorno (geo-data, borders).
3. Datos de OSM y teléfonos (country-data, services-data) y revisión de cantidades.
4. Pantallas con datos propios (ríos, alertas) solo si hay fuente usable.
5. Huerta: sin calendario regional respaldado, **no inventar**: reusar una zona parecida marcándolo, o dejar la huerta sin recomendaciones.
6. Pruebas, e2e una vez al final, y recién ahí publicar.

---

## B. Sumar un idioma: lista de lugares que se tocan

Hoy hay dos idiomas (`es`, `en`). El español es el respaldo y el inglés se carga bajo demanda (`core/i18n/i18n.ts`).

| Dónde | Qué |
|---|---|
| `core/settings/settings.ts` | `Language`, `LANGUAGES`, `detectLanguage()` (hoy: si el navegador no es español, inglés; hay que detectar también `pt`) |
| `core/i18n/i18n.ts` | cargar `pt.json` bajo demanda como el inglés; `setLanguage` |
| `app/src/locales/pt.json` | **3.577 textos, unos 145.000 caracteres** (copia de `es.json`). `locales.test.ts` exige las mismas claves que es y en |
| `core/notifications/format.ts` y `sw.ts` | textos de las notificaciones: viven en el código porque el service worker no carga i18next; sumar `pt` en `TEXT` |
| `server/src/routes/devices.ts` | el esquema de `language` es `enum: ['es','en']` y el tipo `'es' \| 'en'`; la columna es `TEXT`, **no hace falta migración**. Revisar `outings/watch.ts` y `announce.ts` (textos que arma el servidor) |
| Contenido con tablas `{ es, en }` en el código | `knots/knots.ts` (97 KB), `knots/anchors.ts` (47 KB), `knots/content.ts` (15 KB), `firstAid/guides/content.ts` y `types.ts` (59 KB), `garden/crops.ts` (40 KB), `garden/seeds.json` (160 KB), `starmap/scene.ts`, `weathermap/geo.ts` (nombres de países) |
| `core/speech/speech.ts`, `training/cues.ts` | voz: hoy `'es' \| 'en'`; las voces de `pt` dependen del dispositivo |
| `maps/print/*` | el mapa impreso usa `es-AR` fijo (fecha, escala, textos «Escala», «Hoja»): hay que pasarlo por el idioma |
| `index.html`, manifiesto, ícono | `lang`, nombre de la app y descripción |
| `library-builder/books.yaml` | libros por idioma (`lang`) |
| Textos legales (`about.ts`, avisos de fuentes) | el aviso de «informativas» y las atribuciones |
| Tiendas | ficha, capturas y política de privacidad en el idioma |

### Cómo se hace sin romper nada
- Los textos que **falten** caen al español (`fallbackLng`); para las tablas `{ es, en }` hay que volver `pt` **opcional** (`pt?:`) y caer a es/en. Así se puede publicar por etapas (interfaz primero, contenido largo después).
- Traducción: borrador con Claude por lotes (con agentes) y **revisión de una persona que hable portugués** antes de publicar. En lo que toca seguridad (primeros auxilios, nudos, toxicología, alertas) la revisión no es opcional.
- Plurales: i18next ya trae reglas de `pt`; las claves llevan `_one`/`_other` como en es.
- **Variante:** decidir pt-BR (recomendado: es lo que hablan Brasil y la frontera con Paraguay, Argentina y Uruguay) o pt-PT. No mezclar.
- Un idioma **no** es un país: portugués no suma Brasil. Brasil sería otro país nuevo (sección A) con sus números (192 SAMU, 193 bombeiros, 190 polícia), INMET, ANA y demás, y es mucho más grande que los cinco actuales.

---

## C. Caso: Paraguay (investigado y cargado el 2026-11-16)

Lo cargado y de dónde sale cada dato está en `docs/FUENTES-DE-DATOS.md` («Paraguay»); lo que sigue es el análisis previo, que sirve de ejemplo.

### Qué hay y qué no
| Ítem | Resultado | Dificultad |
|---|---|---|
| Teléfonos | **911** (Policía y sistema nacional, gratis, Ley 4739), **132** bomberos voluntarios (oficial, CBVP; una nota del 24/10/2026 dice que estuvo caído por el proveedor: verificar y mostrar con aclaración), **141** SEME (ambulancia del Ministerio de Salud, oficial), **137** SOS Mujer y **147** Fono Ayuda (una sola fuente, la embajada alemana en 2023). Otros: ESSAP 0800 11 0888, Hospital de Trauma (021) 204-800, MADES 021 2879000. **No usar el 192** de la CIA Factbook (ninguna fuente paraguaya lo confirma). ANDE (021) 160 y Cruz Roja: sin confirmar | Fácil |
| Meteorología | **DMH** (meteorologia.gov.py): sin API pública, sin CAP ni RSS de avisos (`/avisos/` es HTML y hoy dice «no hay aviso»), radar en mantenimiento. Pronóstico de respaldo: **Open-Meteo** (ya usado). Sin licencia declarada | Media: no hay alertas oficiales para mostrar |
| Ríos | **DMH** publica niveles en **tablas HTML** (convencionales diarias: `/nivel-rio/indexconvencional.php`; automáticas cada 10 min: `indexautomatica.php`): Paraguay (Asunción, Concepción, Pilar, Alberdi, Villeta), Paraná (Ciudad del Este, Encarnación, Salto del Guairá, Ayolas), Pilcomayo (Pozo Hondo), Tebicuary, Negro; con mínimo y máximo históricos. Sin CORS: **por el servidor**, como el PDF de Bolivia (último bueno, validar filas). Sin licencia declarada. No se probaron Itaipú, Yacyretá ni la ANA de Brasil | Fácil/media |
| Límites | Natural Earth 1:10m admin-1 trae **18 unidades** (17 departamentos y Asunción como distrito capital), dominio público, con `name_es` | Fácil |
| Capitales departamentales | El GeoJSON da un punto representativo, no la capital: sacarlas de OSM (`place=city/town`) | Media |
| Parques | MADES no publica datos descargables; datos.gov.py estaba en mantenimiento; **WDPA no se puede redistribuir en apps**. Queda **OSM** (`boundary=protected_area`), sin consultar todavía | Difícil |
| Radio | CONATEL y Radio Nacional no publican listados abiertos; sin repetidoras de radioaficionados ni frecuencias de emergencia oficiales | No existe (dejar vacío) |
| Focos de calor | NASA FIRMS (ya se usa); la DMH tiene su visor propio | Fácil |
| Huerta | No hay calendario regional respaldado (solo notas de heladas del MAG). Paraguay es subtropical, parecido a la zona `nea` argentina | Sin datos: reusar `nea` marcado como aproximado o dejar sin recomendaciones |
| OSM (Geofabrik) | Extracto de **155 MB**; cantidades por país: farmacias 984, combustible 1.440, cajeros 187, veterinarias 158, talleres 629, **agua 42** (poca), hospitales 318, policía 1.297, bomberos 87 | Hay datos; el agua es débil |
| Convenciones | Huso **America/Asuncion = UTC-3 todo el año** (se abolió el cambio de hora en octubre de 2024; **dispositivos con tzdata viejo todavía lo cambian**), prefijo +595, Asunción 021 | Fácil |

### Particularidades para el código
- `PRY` hoy está en `NEIGHBORS` de `geo-data` como contorno gris: al sumarlo hay que **sacarlo de ahí** y pasarlo a `COUNTRIES` con sus departamentos.
- `detectCountry()`: agregar `America/Asuncion`.
- Idioma: español, con muchas palabras en **guaraní** (nombres de lugares, ríos); el guaraní no hace falta traducirlo.
- Ya hay datos compartidos: el río **Paraguay** y el **Paraná** también salen del INA (Argentina) en sus tramos argentinos; Formosa ya está.
- Mareas: no hay mar; no hay estaciones del IOC.

### Estimación
Teléfonos, límites, OSM, detección y pruebas: **1 a 2 días**. Ríos de la DMH por servidor: **1 día más**. Parques, radio y huerta quedan vacíos o aproximados salvo que aparezcan fuentes. Pedir autorización a la DMH si se quiere citarla formalmente.

### Pendiente de confirmar antes de empezar
Teléfono de la Cruz Roja Paraguaya, ANDE en fuente oficial, si el 132 ya se arregló, OSM de áreas protegidas, y los puntos de Itaipú y Yacyretá.

---

## D. Caso: portugués

**Qué necesitás vos (decisiones y recursos):**
1. **Variante:** pt-BR (recomendado) o pt-PT.
2. **Alcance de la primera etapa:** solo la interfaz (3.577 textos) con el contenido largo en español/inglés por ahora, o todo junto. Recomiendo interfaz primero.
3. **Una persona que hable portugués y revise**, sobre todo primeros auxilios, nudos, toxicología y avisos. Sin esa revisión no se publica el contenido de seguridad.
4. Decidir si Brasil entra como país (otro trabajo: sección A) o si el portugués es solo idioma.

**Qué hago yo:** el código (A/B de arriba, **medio día a 1 día**), el borrador de traducción por lotes con agentes (unos 145.000 caracteres de interfaz y otros ~420 KB de contenido en el código y en `seeds.json`; el contenido largo es lo caro), las pruebas (la de claves iguales ya exige paridad) y la documentación.

**Orden sugerido:** (1) tipo `Language` y carga bajo demanda con respaldo en español; (2) `pt.json` completo; (3) notificaciones y servidor; (4) contenido largo con `pt?` opcional; (5) revisión humana; (6) ficha de la tienda y manifiesto.

---

## E. Pendientes de analizar (anotado el 2026-11-16)

- **Brasil** (con el portugués): país completo y mucho más grande que los demás. Números 192 (SAMU), 193 (bombeiros), 190 (polícia), 199 (Defesa Civil); INMET (alertas, CAP) y ANA (ríos, telemetría); límites por estados (Natural Earth); OSM por Geofabrik (extracto enorme: habría que recortarlo por zonas); huso horario por estado. Es un trabajo de semanas, no de días.
- **Ecuador, Colombia y Venezuela:** sin investigar. Para cada uno, la lista de la sección A (teléfonos oficiales, meteorología y alertas, ríos, parques, radio, límites, OSM, huerta y huso horario), con `vikarg-investigador`, y anotar fuente, licencia y fecha en `FUENTES-DE-DATOS.md` antes de escribir código. Pistas: Ecuador tiene el ECU 911 único y el INAMHI; Colombia el 123 (emergencias) y el IDEAM (alertas y niveles de ríos con datos abiertos); en Venezuela la información pública es limitada y cambia (verificar mucho).
- **Selector de país:** con más de siete países conviene pasarlo a una lista agrupada por región en lugar de botones en fila.

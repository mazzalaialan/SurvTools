# Sección Pesca (diseño y datos)

Estado: **app hecha; datos reales de Neuquén** (2026-11-23). La sección funciona con datos de prueba (`app/e2e/fixtures/fish-AR.json`, e2e `fishing.spec.ts`); falta generar `public/data/fish-AR.json`. Decisiones del dueño del proyecto: empezar por **Patagonia**, **tramos ubicados a mano** en el mapa (no el río entero) y **tabla propia orientativa de carnadas**.

## Qué hace

- Mapa con los tramos de pesca: elegir un pez y ver pintados los tramos donde se puede pescar.
- Tocar un tramo y ver todos los peces de ese tramo, si están abiertos o en veda, y con qué carnada.
- Ficha de cada pez: nombre común y científico, dibujo propio, veda, talla mínima, cupo, devolución obligatoria, carnadas (natural y señuelo).
- Siempre con fuente, fecha y «Consultá el reglamento vigente». Las reglas son **informativas**, nunca oficiales.
- Funciona sin conexión: un paquete por país (`fish-<CC>.json`) que se baja con los demás archivos del país (`countryFiles`).

## Diseño (propuesta de `vikarg-ux`, aprobada)

- Entrada en «Más» y tarjeta en Inicio; no se toca la barra inferior.
- Rutas: `/fishing` (portada), `/fishing/map`, `/fishing/fish/:id`, `/fishing/sector/:id`, `/fishing/rules`.
- Portada: estado de los datos (país, fecha, aviso de normativa) → «Mapa de pesca» (único botón primario) → «Buscar por pez» → «Buscar por río» («Cerca de mí» primero si hay ubicación) → «Normativa».
- Mapa propio (no capa de Mapas), reusando `buildStyle`/`themeColors` de `maps/style.ts` y las teselas offline. Los tramos van en una capa GeoJSON propia; al tocar se buscan todos los tramos en 44 px y, si hay más de uno, la hoja dice «Acá se cruzan N tramos».
- Un pez por defecto; hasta 4 a la vez con Okabe-Ito (#0072B2, #D55E00, #009E73, #CC79A7) **y** trazo distinto (lleno, punteado, trazo-punto, doble), para que se distingan también en el tema rojo. Modo «Todos»: color neutro y número de especies por tramo.
- Hoja inferior con botones (no arrastre): plegada muestra el conteo y «Ver lista»; como máximo media pantalla.
- Veda calculada con la fecha del teléfono: «abierta hasta el …» / «en veda hasta el …», nunca «se puede pescar hoy» sin la fecha de la norma.
- Cruces útiles: aviso de crecida si la estación del INA del río está en alerta o evacuación; aviso «puede estar dentro de un área protegida» si el tramo cae en un parque (`parks-<CC>.json`).
- Estados: sin datos para ese río, país sin datos o sin bajar, datos de más de un año, sin GPS (funciona igual).
- Fuera de la primera versión: pronóstico de picada, comunidad o registro de capturas, alertas de veda por GPS, mar y costa, fotos con licencia (van siluetas propias).

## Datos

Fuentes (investigación del 2026-11-23, `vikarg-investigador`):

- **Normativa y especies por ambiente:** Reglamento General de Pesca Deportiva Continental Patagónico (APN Res. 417/2025, Boletín Oficial 09/12/2025) y sus anexos por provincia y Parques Nacionales. Sin licencia declarada: se usa con atribución. Confirmar si salió el de la temporada 2026/27 antes de cargar valores.
- **Geometría:** OpenStreetMap (`waterway=river|stream`, `natural=water`; ODbL) con el IGN como contraste (atribución, «Capas SIG»). Los tramos se cortan a mano entre los puntos de referencia del reglamento (puentes, desembocaduras, lagos).
- **Registros de especies (capa secundaria):** GBIF, ocurrencias de peces de Argentina (CC BY 4.0 casi todas).
- **Carnadas:** tabla propia de VikArg, **orientativa**, a partir de la dieta de cada especie (FishBase, CC BY-NC: se usa con crédito mientras la app sea gratuita) y de lo que recomiendan los foros de pesca (por pedido del dueño: «son los que más saben»). De los foros se toma el **dato** (qué carnada o señuelo funciona con cada pez, y en qué época), escrito con palabras propias; no se copian textos ni fotos, y no se saltean protecciones de los sitios. En la ficha: «Carnadas orientativas, según la dieta del pez y la experiencia de pescadores».

Formato propuesto de `fish-<CC>.json`:

```jsonc
{
  "version": 1,
  "generatedAt": "2026-11-23",
  "season": { "label": "2025/2026", "from": "2025-11-01", "to": "2026-05-01" },
  "sources": [{ "id": "apn-417-2025", "name": "…", "url": "…", "license": "Sin licencia declarada (atribución)", "date": "2025-12-09" }],
  "species": [{
    "id": "trucha-arcoiris", "scientific": "Oncorhynchus mykiss", "native": false,
    "name": { "es": "Trucha arcoíris", "en": "Rainbow trout", "pt": "Truta arco-íris" },
    "baits": { "natural": ["…"], "lures": ["…"], "fly": ["…"], "source": "fishbase-diet" }
  }],
  "regions": [{ "id": "neuquen", "name": "Neuquén", "rules": "…", "source": "apn-417-2025" }],
  "sectors": [{
    "id": "neuquen-chimehuin-alto", "region": "neuquen", "water": "Río Chimehuin",
    "name": "Desde la boca del lago Huechulafquen hasta el puente de la ruta 40",
    "geometry": { "type": "MultiLineString", "coordinates": [] },
    "season": { "from": "…", "to": "…" },
    "modality": ["fly", "spinning"], "catchAndRelease": true,
    "species": [{ "id": "trucha-arcoiris", "limit": 0, "minSizeCm": null }],
    "notes": "…", "source": "apn-417-2025", "page": 12
  }]
}
```

## Orden de trabajo

1. Extraer del reglamento los ambientes y tramos de Neuquén, Río Negro, Chubut y APN (texto, especies, modalidad, cupo, temporada, página).
2. Ubicar cada tramo en OSM entre sus puntos de referencia (`tools/fishing-data/`), con fuente y página por tramo.
3. Tabla de carnadas por especie (10–15 peces).
4. App: portada, mapa, fichas, paquete por país, textos es/en/pt, pruebas.

## Avance de los datos (2026-11-23)

Trabajo en `~/vikarg-fishing-work/` (fuera del repo, con las fuentes descargadas y su sha256):

- **Reglamento vigente:** el de la temporada **2026/2027** (cuadernillo de 104 págs. de la Comisión Consultiva, publicado por Chubut: `https://chubutstorage.s3.amazonaws.com/Pesca/Reglamento%20PDCP%202026-27%20Baja.pdf`, generado el 2026-10-20). Temporada del 01/11/2026 al 01/05/2027, con excepciones por ambiente. No se encontró la resolución APN de 2026/27 (la 417/2025 era de 2025/26).
- `ambientes.json`: 366 tramos (Chubut 87, Neuquén 97, Río Negro 39, Parques Nacionales del Sur 143) con el texto literal del tramo y la página. Los campos estructurados (cupo, talla, devolución) salieron por patrones y **hay que revisarlos a mano**; en varios lagos de PN el cupo cambia por fecha (Nahuel Huapi, Gutiérrez, Mascardi, Traful, Limay).
- `reglas_generales.json` (55 reglas), `especies.json` (18), `carnadas.json` (13 especies, con confianza).
- **Carnada natural:** casi no se permite en Patagonia (señuelo artificial de un anzuelo; art. 13 y 15). Excepciones: pejerrey en ambientes autorizados de Neuquén («carnada viva», sin aclarar) y pasta de harinas vegetales para carpa y pejerrey en Neuquén y Río Negro. Contradicciones anotadas: art. 15 contra el anexo de Neuquén, y art. 22 (cebado) contra la pasta vegetal.
- **A confirmar:** Aquihueco (Neuquén) trae fechas de la temporada anterior; Santa Cruz y Tierra del Fuego tienen reglamento propio (fuera de este documento).
- **Piloto Neuquén (hecho 2026-11-23):** `tools/fishing-data/` (ver su README). 97 entradas → **79 tramos en el mapa** (66 ríos o lagos enteros por nombre, 13 zonas cortadas con `cuts.json`; 5 entradas generales se reemplazan por sus zonas y una remite a otra), 7 vedadas («Pesca no autorizada»). **Sin ubicar (11):** lagunas Aquihueco, Doña Pancha, El Aparato, El Palau, Epu Lauquen, Matetue, Puyulafquen y Verde - Selva Triste, ríos Kilka y Ruca Choroy (sin nombre en OSM) y la Zona I del Pulmarí (falta ese pedazo en OSM): se agregan con coordenada a mano. **Aproximados:** Limay Zona I (sin los 500 m bajo la presa), Limay Zona III (hasta la cola del embalse, Álamo Guacho no está en el mapa), Neuquén Zona III (Villa Manzano) y las dos zonas de Piedra del Águila (lago entero). **Supuestos:** en 20 tramos el texto no nombra especies («Devolución obligatoria.»): se toman truchas arcoíris y marrón; «1 trucha» (cupo conjunto) figura como 1 de cada una. Paquete: 512 KB (148 KB comprimido).
- **Falta:** Río Negro, Chubut y Parques Nacionales del Sur (269 tramos), los 11 sin ubicar y revisar los cupos que cambian por fecha.

## Actualización de la normativa

- **Vigilancia en el servidor** (`server/src/fishing/watch.ts`): **solo desde 45 días antes del fin de la vigencia** (`VALID_UNTIL`, hoy 31/10/2027) y, pasada esa fecha, cada día hasta que aparezca el nuevo (decisión del dueño: no todo el año). Baja el reglamento vigente (`FISHING_DOCS`) y compara su huella (sha256, guardada en `settings` como `fishing-watch:<url>`); si cambió, o si ya existe el PDF de la temporada siguiente (mismo nombre con los años nuevos), manda un mail al correo de contacto. Agregar en `FISHING_DOCS` las páginas oficiales de cada jurisdicción nueva (por ejemplo, la de permisos).
- **No regenera solo:** la transcripción se revisa a mano (`tools/fishing-data`, README). Al regenerar `app/public/data/fish-AR.json` y publicar, los teléfonos lo bajan solos (el archivo tiene `generatedAt` y la app trae el más nuevo del servidor; ver `modules/emergency/dataFile.ts`). Mientras tanto la app muestra los datos anteriores con su fecha y el aviso de consultar el reglamento vigente.

## Supervivencia

- En cada pez, «En supervivencia: qué come» (`tools/fishing-data/survival.json`): carnadas naturales según la dieta, aparte de lo reglamentario y con la aclaración de que hoy están prohibidas.
- Módulo «Pesca de supervivencia» (`/fishing/survival`, `app/src/modules/fishing/survival.ts`): dónde y cuándo pescar, anzuelos improvisados, línea de mano, líneas fijas, trampas para peces, fija y pesca a mano, y limpiar/cocinar/guardar. Texto propio basado en FM 3-05.70 (dominio público). Sin venenos ni explosivos.

## Próximos pasos (para seguir, 2026-11-23)

**Resto de la Patagonia (ya preparado):** `tools/fishing-data` funciona por jurisdicción. Para Río Negro, Chubut y Parques Nacionales del Sur: (1) escribir en `cuts.json` los puntos de corte de sus zonas (leer el texto de cada «Zona» en `~/vikarg-fishing-work/ambientes.json`); (2) `locate.mjs … <Jurisdicción>`; (3) agregar sus permisos en `permits.json` (Río Negro ya tiene el enlace; Chubut sin enlace verificado); (4) `build.mjs ~/vikarg-fishing-work Neuquén,Río Negro,Chubut,Parques Nacionales del Sur` y `npm run data-sizes`. **Ambientes compartidos** (Limay, lago Azul…: figuran en varios anexos con reglas distintas). Decisión del dueño: un solo tramo en el mapa, y en la ficha **los reglamentos de cada jurisdicción, cada uno con a quién pertenece** («Según Parques Nacionales: …», «Según Chubut: …»). En `build.mjs`: juntar por agua (y tramo) las entradas de distintos anexos (`compartido_con`) en un sector con una lista de reglas por jurisdicción.

**Resto de Argentina (la lista crece mucho):** cada provincia tiene su reglamento propio (Buenos Aires, Litoral, Cuyo, NOA, Santa Cruz, Tierra del Fuego). Decisiones del dueño para entonces:
- **Normativa por provincia según dónde estás**: como en el clima, se elige por la ubicación actual o por un waypoint (ver cómo lo hace Meteorología), y la portada muestra las reglas y el permiso de esa provincia. Requiere que cada tramo y región tenga su provincia (`region`) y un contorno de provincias para saber en cuál cae el punto (la app ya tiene los contornos en `modules/maps/outline`).
- **Un solo paquete por ahora** (decisión del dueño): primero medir cuánto pesa con todo; solo si es demasiado, pensar en partirlo (Neuquén solo: 512 KB, 148 KB comprimido).
- **Peces de río y de mar, separados** a futuro: el modelo ya tiene `sectors` con geometría; para mar haría falta otro tipo (costa, puertos, pesca embarcada) y otras fuentes (normativa de pesca marítima provincial y nacional). La portada podría tener «Agua dulce» y «Mar».
- **Vigilancia**: sumar a `FISHING_DOCS` (`server/src/fishing/watch.ts`) el reglamento de cada provincia nueva.

**Pendientes chicos de Pesca:** cierre anticipado de la trucha de arroyo en ríos y arroyos (01/03/2027, reglamento pág. 13) como aviso en su ficha y tramos; los 11 ambientes de Neuquén sin ubicar (necesitan coordenada a mano); reemplazar las fotos provisorias de perca y pejerrey por ilustraciones de perfil si aparecen con licencia libre; imágenes de trucha de lago, salmón chinook y róbalo (candidatas en `~/vikarg-fishing-work/imagenes/imagenes.json`).

## Patagonia completa (2026-11-23)

Cargadas las cuatro jurisdicciones del reglamento 2026/27: **300 tramos** en el mapa (Neuquén 79, Río Negro 35, Chubut 73, Parques Nacionales del Sur 125, menos 12 entradas repetidas de ambientes compartidos), 11 vedados. **Paquete: 1,78 MB (504 KB comprimido).** Extracto de OSM ampliado hasta Tierra del Fuego (Los Glaciares y PN Tierra del Fuego). Nombres dobles («Wintter o Vintter») se prueban por separado; los embalses se buscan como lagos.
- **Ambientes compartidos:** 12 juntados (mismo dibujo y el reglamento dice «compartido»); la ficha muestra el reglamento de cada jurisdicción en su bloque («Según Neuquén», «Según Río Negro»). En el mapa y las listas, las especies de todas con la regla más estricta.
- **Cortes nuevos:** Limay y Neuquén Zona IV (Río Negro, como en Neuquén), río Negro (confluencia → Pomona → mar, aproximado en Pomona), río Chubut (paralelo 42° → Las Plumas; dique Florentino Ameghino → mar), Manso Superior (naciente → Mascardi). Aproximados: Manso Medio e Inferior (río entero), Piedra del Águila Zona II (lago entero). Sin ubicar: tramo 28 de Julio del río Chubut.
- **Sin ubicar (40):** lagunas y arroyos sin nombre en OSM (lista en la salida de `build.mjs`); se agregan con coordenada a mano en `cuts.json`.
- **Especies supuestas (145 tramos):** el texto no nombra especies (muy común en Parques: «Mosca solamente. Devolución obligatoria.»): se toman truchas arcoíris y marrón.
- **Permisos:** Río Negro con su tienda oficial; Chubut y Parques sin enlace propio (vale el permiso de Neuquén o Río Negro en línea).

## Ambientes sin ubicar (2026-11-23)

Con la búsqueda de coordenadas (`~/vikarg-fishing-work/coordenadas.json`: IGN WFS de hidrografía —libre, Ley 27.275—, GeoNames CC BY, Wikipedia, OSM) se ubicaron 24 más (323 tramos en el mapa). **Quedan 16**, que se ven en las listas con su reglamento pero no en el mapa:
- **Sin rastro en ninguna fuente:** lagunas Doña Pancha (o Nedalafquen), El Aparato, Matetue y Puyulafquen (Neuquén); Derivador Azud, arroyos Rifleros y Vicente —afluente del Lepa— (Chubut); arroyo Canal de Doña Rosa (o de Alarcón), arroyo Llodconto (sección Mascardi/Steffen), lago Los Raulíes (¿cerca del arroyo de los Raulíes, -39.44, -71.36?), laguna Media Luna y río Nuevo (Parques Nacionales).
- **Candidato dudoso (no cargado):** El Palau → ¿laguna Palao (-36.9323, -70.3151) o Palau Mahuida (-38.80, -70.68)?; Laguna Verde - Selva Triste → ¿Laguna Verde de Villa La Angostura (OSM way 191658886)?; río Colehual → ¿arroyo Calihuel?; río Rillaqueo → ¿errata de arroyo Millaqueo (desemboca en -41.0025, -71.5762)?
- **A medias:** tramo 28 de Julio del río Chubut (empieza en el salto de Boca Toma, -43.4423, -65.9407; falta el «puente de madera» donde termina).
- **A quién preguntar:** Dirección de Fauna de Neuquén, intendencias de los PN Los Alerces y Nahuel Huapi, Instituto Provincial del Agua de Chubut (Azud). Al confirmar uno: agregarlo en `tools/fishing-data/cuts.json` (`name` si está en OSM con otro nombre, `at: [lon, lat]` para un lago, `path: [[lon, lat], [lon, lat]]` para un río) y regenerar.

## Litoral y zonas (2026-11-24)

- **Zonas por cuenca** (Patagonia, Litoral): la app muestra peces, ríos, normativa y permisos de la zona de tu lugar (waypoint de «tu lugar» o última ubicación, como Huerta y Meteorología), o la elegida a mano (se recuerda en el dispositivo). En el mapa, la fila de peces muestra los que tienen tramos en lo que se ve.
- **Litoral:** 27 ríos y lagunas (`tools/fishing-data/litoral-waters.json`), el Paraná en 5 tramos con el reglamento de cada orilla, el río Uruguay de la CARU. Reglas por jurisdicción y especie en `litoral-rules.json` (tallas, cupos, vedas anuales, prohibiciones, vedas totales con fecha de Misiones); permisos en `permits.json`. Lo que no tiene regla dice «Sin regla específica: rige la norma general» (nunca «libre»). Fichas de 21 peces (`~/vikarg-fishing-work/litoral/especies.json`) con riesgo al manipularlos; 18 imágenes validadas.
- **Pendientes del Litoral:** laguna Setúbal sin ubicar; fichas e imágenes de corvina, virreyna, bagre negro y armado chancho (sin imagen libre); reemplazar la imagen del bagre blanco (chica), del pacú (de acuario) y de la raya (no es vista de arriba); confirmar con el texto oficial las reglas de Entre Ríos marcadas «sin confirmar» y las contradicciones de vedas del surubí entre Santa Fe y Entre Ríos; precios 2026 de Santa Fe, Corrientes, Chaco y Misiones; tallas y cupos de Chaco, Misiones y Formosa. Paquete: 2,66 MB (≈760 KB comprimido).

## Reglas por fecha (2026-11-24)

Se leen del texto del tramo y se muestran en cada pez: «A partir del / Desde el …: devolución obligatoria (de todos los salmónidos)» → `releaseFrom` (hasta esa fecha rige el cupo; después, amarillo); cierre anticipado de la trucha de arroyo en ríos y arroyos desde el 01/03/2027 (Reglamento, pág. 13, 2.b); «durante octubre de 2027» → segundo período de temporada (`season.also`); «1 trucha», «2 salmónidos» → cupo en total para el grupo (`groupLimit`). Siguen solo en el texto: «desde el … al …» con reglas propias de ese período y los horarios por mes del Limay en PN.

## Santa Cruz y Tierra del Fuego (2026-11-24)

- **Normas:** Santa Cruz, Disposición N.º 241/2026 de la Secretaría de Estado de Pesca y Acuicultura (temporada 01/10/2026 al 30/09/2027; ríos y arroyos cierran casi todos el 03/05/2027; lagos grandes todo el año). El PDF es escaneado: transcripción a mano. El pie del portal dice «Todos los derechos reservados»; el dueño decidió usar los datos con atribución (la leyenda es del sitio, no de la disposición). Tierra del Fuego, Resolución S.A. N.º 259/2026 (30/10/2026 al 02/05/2027; río Grande y afluentes hasta el 18/04/2027; devolución obligatoria en toda la provincia desde el 01/03/2027; la arco iris con devolución hasta el 01/01/2027; cupo general 1 por día). Fuentes, transcripción y permisos en `~/vikarg-fishing-work/sur/`.
- **En el mapa:** Santa Cruz 53 tramos, Tierra del Fuego 30 (436 en total). Los ríos que OSM no tiene salen de las cartas del IGN (capas de hidrografía del WFS, copiadas a `~/vikarg-fishing-work/ign/`; `ign` en `cuts.json`).
- **Subtramos plegados** (`fold` en `cuts.json`): vedas junto a puentes, ventana de extracción de febrero en el Gallegos, régimen del chinook, róbalo y trolling en el río Santa Cruz: van como nota del tramo general. Las reglas por especie con redacción libre se cargaron a mano (`species` en `cuts.json`): steelhead del río Santa Cruz (1 por temporada, devolución desde el 15/03/2027), chinook (temporada 01/08–30/11/2027), róbalo (10 por día, 30 cm), chinook de Las Vueltas y La Leona.
- **Trucha de mar:** las dos normas la tratan como trucha marrón (Gallegos, Grande, Coyle: devolución obligatoria; Gallegos permite 1 por día del 01 al 28/02/2027).
- **Vigilancia:** `FISHING_DOCS` del servidor revisa cada norma desde 45 días antes de su propio vencimiento (`validUntil`).
- **Dudas:** en Tierra del Fuego la página oficial dice devolución en el Grande «hasta el 13 de abril» y la resolución fija el cierre el 18/04 (se usó la resolución); Pierrestegui «Apertura: 01/1/2026» (errata probable de 01/10/2026); compra de permisos de Tierra del Fuego sin enlace oficial verificado.

## Sin ubicar (2026-11-24)

27 ambientes se ven en las listas con su reglamento pero no en el mapa (búsqueda en IGN, OSM, GeoNames, prensa y guías: `~/vikarg-fishing-work/coordenadas2.json`):
- **Neuquén:** lagunas Doña Pancha (Nedalafquen), El Aparato, Matetue, Puyulafquen; El Palau (¿laguna Palao o Palau Mahuida?).
- **Chubut:** Derivador Azud, arroyos Rifleros y Vicente; el tramo 28 de Julio del río Chubut está a medias (falta el «puente de madera»).
- **Parques Nacionales:** arroyo Canal de Doña Rosa (o de Alarcón), lago Los Raulíes, laguna Media Luna, río Nuevo, río Rillaqueo (¿Millaqueo?).
- **Santa Cruz:** laguna Cuesta de la Pava, arroyo Del Hacha, río Senger sector Los Monos.
- **Tierra del Fuego:** ríos Rasmussen, Indio, Palacios y Malanguena, arroyos Videla, Subiabre y Mimica, lagunas Palacios, Bombilla y Tres Marías (el IGN la pone al norte; el reglamento, en una bahía del Fagnano), chorrillo Los Salmones.
- **Equivalencias deducidas, marcadas como aproximadas:** Colehual = arroyo Calihuel, Peloue = río Pelque.
- **A quién preguntar:** Dirección de Fauna de Neuquén, Instituto Provincial del Agua de Chubut, intendencias de los PN Nahuel Huapi y Los Alerces, Dirección de Pesca Continental de Santa Cruz y Secretaría de Ambiente de Tierra del Fuego (pescacontinentaltdf@gmail.com, el contacto que publica la resolución).

## Peces completados (2026-11-24)

Fichas nuevas: corvina de río (*Plagioscion ternetzi*; el MAGyP llama así a otra, *Pachyurus bonariensis*), bagre negro (*Rhamdia quelen*), róbalo patagónico (*Eleginops maclovinus*) y virreyna (*Megalonema platanum*, identificada por el Informe Técnico 62 del MAGyP; sin datos de carnada en ninguna fuente). Datos en `tools/fishing-data/litoral-extra.json` con fuente y confianza. Imágenes nuevas o reemplazadas (todas miran a la izquierda, validadas por `vikarg-critico-dibujos`): perca, pejerrey, bagre blanco, pacú, raya, corvina, bagre negro, armado chancho, róbalo, virreyna. **Provisorias:** corvina (en manos), armado chancho (pez muerto sobre juncos) y virreyna (con otros peces alrededor): cambiarlas si aparece una foto libre mejor. Las ilustraciones del MAGyP (300 px) solo como último recurso, por calidad.

## Especies del MAGyP (2026-11-24)

Sumadas las que lista Pesca Continental del MAGyP y faltaban (48 peces en total): anchoa de río, morena, banderita, sabalito, cucharón, chanchita, dientudo jorobado, tachuela, lisa, mandubá, vieja de agua, vieja de látigo, carpa cabezona, carpa plateada y piraña (*Pygocentrus nattereri*, distinta de la palometa). Dónde está cada una en `tools/fishing-data/presence.json` (ríos, lagunas o aguas nombradas); fichas en `litoral-extra.json`. **No cargadas:** bagre de mar (el MAGyP lo trata como el bagre blanco: va como otro nombre), tilapia y carpa herbívora (sin registros silvestres confirmados en el Litoral). **Imágenes provisorias:** cucharón, chanchita, lisa (grabado de *Mugil brasiliensis*) y mandubá (lámina de *A. militaris*). Otros nombres de cada pez en `aka.json` (FishBase, MAGyP, GBIF).

## Buenos Aires y Litoral, primera tanda (2026-11-24)

23 aguas nuevas (459 tramos): lagunas de Buenos Aires (Encadenadas del Oeste: del Monte, Cochicó, Alsina, Inchauspe, La Paraguaya; Las Barrancas, Mar Chiquita de Junín, El Hinojo, Las Tunas, Kakel Huincul, Vitel, Adela, Chis Chis, La Salada de Pedro Luro, Blanca Grande, San Lorenzo, Sauce Grande), La Picasa (Santa Fe y Buenos Aires) y los ríos Luján, Samborombón, Feliciano, Guayquiraró y Mocoretá. Las lagunas se ubican por su id de OSM (`osm` en `cuts.json`), por las homónimas. Reglas: Buenos Aires con licencia 2026 (Ley 15.558) y pejerrey corregido (cupo 10 en lagunas; del 1/09 al 1/12 solo fines de semana y feriados, no veda total); Entre Ríos con la veda oficial del surubí. **Sigue:** Paso de las Piedras (¿se permite pescar? abastece de agua a Bahía Blanca), lagunas Salada Grande, Las Flores, Ranchos, Cerrillos, Indio Muerto, Los Patos, Gómez/Carpincho, La Brava, Blanca Chica, Cabeza de Buey, Melincué, Paiva, Galarza; brazos del Delta y Río de la Plata costero; Arroyo Grande, Miriñay, Aguapey, Iguazú, ríos de Misiones, Chaco y Formosa. Dudas: cuál El Hinojo nombran los clubes (hay dos), y que Las Barrancas y Mar Chiquita sean las de pesca. Reglas que faltan: precios de permisos de Santa Fe, Corrientes, Chaco y Misiones; tallas y cupos de Chaco, Misiones y Formosa; texto oficial de Entre Ríos para dorado, pacú, manguruyú, tallas y cupos (pedir a la Dirección de Recursos Naturales).

## Buenos Aires y Litoral, segunda tanda (2026-11-24)

23 aguas más (482 tramos): lagunas La Salada Grande, Las Flores Grande, del Burro, La Brava (Balcarce), Blanca Chica, Cabeza de Buey, El Carpincho, Chasicó y Los Horcones (Buenos Aires), Melincué y Paiva (Santa Fe), Galarza y de Luna (Iberá); ríos Miriñay, Aguapey, Pilcomayo, Paraná Miní, Barca Grande, Ibicuy, Arrecifes, Areco, Carcarañá y Tapenagá. Corregidas El Hinojo y Las Tunas: ahora son las de Trenque Lauquen (Hinojo Chico y Tunas Grandes), no las homónimas del sur de Santa Fe. Ríos con homónimos recortados por zona (`clip` en `cuts.json`): Ibicuy (no el Ibicuí de Brasil), Paraná Miní (el del Delta), Pilcomayo (solo Formosa). Quedan: Paso de las Piedras, río Iguazú (el tramo del PN Iguazú tiene sus reglas), Río de la Plata costero, otros brazos del Delta, ríos de Misiones y del Chaco, y las reglas pendientes (precios de Santa Fe, Corrientes, Chaco y Misiones; tallas de Chaco, Misiones y Formosa).

**Reglas del Litoral (2026-11-24, segunda vuelta):** la veda del surubí no es contradictoria: Santa Fe veda pintado y atigrado del 1/11 al 31/12 (Res. 168/05) y Entre Ríos el pintado del 15/08 al 15/03 (Res. 276/07); en 2026 no hubo veda compartida del Paraná. Precios: Santa Fe en módulos tributarios (cantidades de prensa, sin confirmar); Formosa con los importes de su portal (parecen desactualizados). Corrientes, Chaco y Misiones: sin precios publicados. Tallas y cupos de Chaco, Misiones y Formosa: compendio del MAGyP de 2019 (vigencia no verificada; marcados «sin confirmar»). Falta el texto de la Res. 1078/2020 y el Dec. 1623/10 del Chaco.

## Descarga aparte (2026-11-24)

Decisión del dueño: los datos de pesca son una **descarga aparte** de los del país. Ya no van en `countryFiles`: tienen `fishFiles` y `fishPackState` (`modules/emergency/countryDownload.ts`), `downloadFishPack` y `deleteFishPack` (`countryDelete.ts`) y su estado en `useCountryPackStore` (`fish`, `busyFish`). En Ajustes → País, cada país con paquete de pesca tiene un botón con un pez al costado del de los datos generales (bajar, actualizar o, si está al día, borrar). En la sección Pesca, si no está bajado, se ofrece bajarlo (`FishPackOffer`), y la portada avisa cuando hay una versión nueva. Sin el paquete, la sección no baja nada sola.

## Cuyo (en curso, 2026-11-24)

**Mendoza: investigación HECHA (2026-11-24), falta cargarla.** Norma: Res. 322/2026 de la Subsecretaría de Ambiente (BO 32709, 30/10/2026; copia leída del diario El Sol, cotejar con boe.mendoza.gov.ar; sin licencia declarada = con crédito). 24 ambientes (Atuel 2 tramos, Diamante con coto, Tunuyán, Mendoza, Malargüe, Salado, Grande, Barrancas; embalses Potrerillos, Nihuil, Valle Grande, Los Reyunos, Agua del Toro, El Carrizal; lagunas del Diamante, Vaca Lauquen, El Alambrado, El Sosneado; vedadas Llancanelo y La Salina). Temporada salmónidos 01/11/2026–01/05/2027 (en 4 embalses desde el 01/12), pejerrey y perca 01/12/2026–30/09/2027, carpas todo el año; veda total de bagres, cangrejos y anguilas. Sin precios 2026 del carnet. Dudas de la norma anotadas en `dudas` de cada entrada. Investigación en `~/vikarg-fishing-work/cuyo/` (fuentes, `ambientes.json` con el formato del patagónico, `reglas_generales.json`, `permisos.json`), guardada a medida que avanza. **Para retomar:** (1) revisar lo que haya en esa carpeta; (2) sumar «Mendoza» a `OWN` en `tools/fishing-data/build.mjs` (fuente, temporada) y su recuadro en `locate.mjs` (`BBOX`, aprox. [-70.6, -37.6, -66.5, -32.0]); (3) `prepare.sh` con ese recuadro en `~/vikarg-fishing-work/osm-cuyo` y `locate.mjs … Mendoza`; (4) permisos a `permits.json`, zona «Cuyo» en `ZONES` del build (las regiones de Mendoza, San Juan y San Luis); (5) vigilancia en `server/src/fishing/watch.ts`. Después, San Juan y San Luis.

## Vencimiento de la normativa (2026-11-24)

- **En la app:** cada tramo (y cada bloque de un ambiente compartido) trae `validUntil`, la vigencia de la norma cargada: Patagonia común y Mendoza hasta el 31/10/2027 (permisos de temporada), Santa Cruz hasta el 30/09/2027, Tierra del Fuego hasta el 29/10/2027. Pasada esa fecha, si el paquete no se actualizó, el tramo pasa a «Sin regla específica encontrada» (gris, sin cupos ni colores viejos) con el aviso de consultar la norma vigente (`rulesExpired` en `modules/fishing/fishing.ts`). Las normas del Litoral son leyes y resoluciones sin vencimiento: no llevan `validUntil` (las vedas con fecha, como las de Misiones, dejan de regir solas).
- **En el servidor** (`server/src/fishing/watch.ts`): desde 45 días antes de cada vencimiento baja la norma y prueba la de la temporada siguiente; avisa por mail si cambió, si apareció la nueva o, una sola vez, si venció sin reemplazo (para revisar si la fuente cambió de dirección o si cambió la norma: veda levantada, pesca liberada…). Lo último revisado queda en la tabla `settings`, clave `fishing-watch:last` (fecha, qué se revisó, qué falló, qué cambió, qué venció); las huellas, en `fishing-watch:<url>`.
- **Al cargar una norma nueva:** actualizar `validUntil` (en `OWN` del build y `PDCP_VALID_UNTIL`), la URL y `validUntil` en `FISHING_DOCS` del servidor.

## Cuyo completo (2026-11-24)

- **San Juan:** Reglamento de Pesca Deportiva y Sustentable (Ley 606-L y Res. 956-SEAYDS-2025; «de cada año», sin vencimiento propio: diques del 01/12 al 19/08, ríos del 15/09 al 30/06). 16 ambientes: embalses Ullum, Punta Negra, Cuesta del Viento (todo el año), San Agustín (pejerrey y sogyo = carpa herbívora), Caracoles y Los Cauquenes (cerrados); ríos Castaño, Los Patos, Blanco (Calingasta), Calingasta, San Juan (sector 1 hasta el puente Ing. Raúl Suárez; sector 2 hasta Caracoles, cerrado), Agua Negra (2 sectores, aproximados), Jáchal, Blanco (Iglesia). En varios ríos la talla de la trucha es MÁXIMA (25 cm). Lo no nombrado está vedado (la norma lo dice): por eso no se cargaron lagunas de altura.
- **San Luis:** Res. 395 DB-SAyDS-2025, Calendario Íctico 2026 (vence el 31/12/2026; el servidor prueba el de 2027). 21 de 23 ambientes en el mapa (faltan Villa Mercedes y Los Manantiales, sin nombre en OSM): 17 embalses con cupo de pejerrey (10 a 35), trucha 1 en diques (0 en La Estrechura) y tararira con su temporada; 3 vedados (Piscu Yaco, San Pedro, Vulpiani); ríos Quinto, Conlara y Grande con devolución de truchas.
- **Reglas estructuradas:** la investigación entrega `reglas_app` por ambiente (temporada, cerrado, devolución, especies con cupo, tallas y temporada propia); el build las usa tal cual (`reglas_app` en `build.mjs`).
- **Dudas:** Los Patos (prensa habla de un sector 2 y una actualización no publicada), cupo conjunto «10 pejerreyes y/o 5 sogyos» de San Agustín, precios 2026 de San Juan y San Luis sin confirmar, fechas de veda del pejerrey de San Luis (las fija la autoridad).

## Permisos: contactos y pantalla (2026-11-25)

- **Contactos oficiales** en `tools/fishing-data/permits.json`, por jurisdicción: `buyUrl` (sitio de compra o trámite), `infoUrl`, `phone` y `email` (listas; lo que va entre paréntesis es la aclaración, por ejemplo a qué oficina corresponde), `where` (trámite en persona) y `extra` (avisos: dato de prensa, correo de 2022, «la CARU no emite permiso»). Investigación del 2026-11-25 en `~/vikarg-fishing-work/permisos-contacto.json` (fuente y fecha de cada dato).
- **Sin contacto completo:** Mendoza (el sitio oficial bloquea los accesos automáticos; solo puntos de venta de 2021), San Juan (solo el trámite en Ciudadano Digital), Santa Fe y Corrientes (solo correo), Entre Ríos y Misiones (teléfonos de prensa, marcados para confirmar).
- **En la app** (`PermitCard` en `modules/fishing/parts.tsx`): botones para llamar (`tel:`) y escribir (`mailto:`) con solo el número o la dirección; la aclaración se lee debajo en letra chica (en el celular no hay «pasar el mouse»).

## Mapa: panel de zona y tramos (2026-11-25)

En `FishingMapPage.tsx`: la zona va plegada («Zona: Patagonia ▾», se despliega para cambiarla) y el panel entero se puede ocultar con la flecha de arriba a la derecha; queda el botón «Mostrar zona y tramos». Al tocar un tramo, el panel aparece igual con sus peces.

## Orden de los peces en un tramo (2026-11-25)

Por regla y, dentro de cada grupo, alfabético: prohibidos o en veda hoy, devolución, con cupo, sin límite, sin regla (`RULE_ORDER` en `FishingPages.tsx`). La regla es la de hoy: un pez cambia de grupo el día que entra en veda o pasa a devolución.

## Córdoba y La Pampa (2026-11-25)

- **Córdoba:** Res. 318/2026 (BO 02/10/2026; copia de AICACYP, el sitio oficial bloquea accesos automáticos). 24 de 26 ambientes en el mapa (faltan las lagunas Viamonte y La Margarita, sin OSM): 14 embalses y 5 lagunas con cupo de pejerrey (10 a 50, talla 25 cm, del 01/12 al 31/08), carpa, tararira, bagres y mojarra; La Quebrada vedada; ríos de truchas de las Sierras con devolución (trucha marrón y perca vedadas hasta el 31/12/2027). Veda nocturna en lagos y lagunas. Vence el 30/09/2027. Mar Chiquita (Ansenuza) no figura en la norma.
- **La Pampa:** Disp. 011/2026 (sin vencimiento: rige hasta la siguiente). 12 ambientes: río Quinto y lagunas (pejerrey 25 de 25 cm, bagre sapo, tararira con devolución, carpa libre), río Colorado y Casa de Piedra (pejerrey y 2 truchas; Casa de Piedra por analogía, sin confirmar), y vedados el Salado, Chadileuvú, Curacó y el Atuel (recortados a la provincia).
- **Permisos:** Córdoba por Ciudadano Digital (precios de prensa, sin confirmar); La Pampa en tramitesdrn.lapampa.gob.ar con teléfonos y correo de la Dirección de Recursos Naturales. Datos en `~/vikarg-fishing-work/pampeana/`.

## NOA (2026-11-25)

Investigación en `~/vikarg-fishing-work/noa/` (una provincia por archivo; fuentes casi todas copias de AICACYP). 33 tramos en el mapa (618 en total).
- **Tucumán:** Res. 117/2026 (ríos: pejerrey 30, bagre 8, tararira 3, boga 8; habilitación hasta el 20/09/2026, así que hoy esos ríos figuran «sin regla específica»); Res. 385/2026: diques El Cadillal, Escaba y La Angostura vedados sin fecha de fin. Sin norma de truchas para Tafí ni El Siambón.
- **Santiago del Estero:** sin reglamento 2026/27 publicado: cupos de 2024 (bagre, boga, sábalo, tararira), sin confirmar; vedas por resolución, casi siempre en diciembre.
- **Salta:** Res. 567/2026 (vence el 31/08/2027): 13 ambientes; dorado solo con devolución, sábalo prohibido, tararira vedada del 15/11 al 15/01; Bermejo con veda total desde el 02/11/2026 (Res. 821/2026); Arenales vedado.
- **Jujuy:** ríos San Francisco y Lavayén vedados desde el 21/10/2026 (Res. 131/2026, sin fecha de fin); diques Las Maderas, La Ciénaga y Los Alisos con cupos de la Res. 60/2022.
- **Catamarca:** Disp. 309/2026 (ríos del 01/11 al 30/04, diques al 31/08/2027; solo viernes a domingo y feriados): diques y ríos con pejerrey 30, trucha 5, perca 5. La Puntilla, reserva por 2 años.
- **La Rioja:** sin norma de temporada publicada (Ley 4.678 delega en un acto anual que no aparece): solo Los Sauces en el mapa, sin reglas; preguntar a la Secretaría de Ambiente.
- **Sin ficha:** dientudo, bocacha, yusca, bagre cuchara: quedan solo en el texto de cada ambiente.

## Reglamentos vencidos o sin norma vigente: revisar periódicamente (al 2026-11-25)

Revisar al menos una vez por mes (y cuando llegue un aviso del servidor) si apareció la norma nueva. El servidor mira cada día la página siguiente de AICACYP y los sitios oficiales de Tucumán (Producción y Boletín Oficial), Santiago del Estero (Bosques y Fauna) y La Rioja (Ambiente), comparando solo las líneas que dicen «pesca» o «veda»; al cargarla, actualizar `validUntil`, la fuente y `FISHING_DOCS` del servidor.

| Jurisdicción | Estado | Qué buscar | Dónde |
|---|---|---|---|
| Tucumán (ríos Tafí, Salí, Marapa, Los Sosa, Chavarría, Río Hondo) | **Vencida** el 20/09/2026 (Res. 117/2026); la app ya los muestra «sin regla específica» | Nueva habilitación de pesca en ríos | Dirección de Flora, Fauna Silvestre y Suelos (producciontucuman.gob.ar), AICACYP |
| Tucumán (diques El Cadillal, Escaba, La Angostura, El Frontal) | Veda sin fecha de fin (Res. 385/2026) | Levantamiento de la veda y cupos de diques | ídem |
| Santiago del Estero | **Sin norma 2025/26 ni 2026/27**: cupos de 2024 «sin confirmar» | Reglamentación de temporada y vedas de diciembre | Dirección General de Bosques y Fauna (dgbyf.gob.ar) |
| La Rioja | **Sin norma de temporada publicada** (Ley 4.678 delega en un acto anual) | Resolución anual de pesca | Secretaría de Ambiente de La Rioja |
| Jujuy (ríos San Francisco y Lavayén) | Veda desde el 21/10/2026, sin fecha de fin (Res. 131/2026) | Levantamiento y nueva habilitación | Secretaría de Biodiversidad y Desarrollo Sustentable, AICACYP |
| Jujuy (diques) | Cupos de la Res. 60/2022 | Norma de cupos actualizada | ídem |
| Salta (río Bermejo) | Veda total desde el 02/11/2026 (Res. 821/2026) | Fin de la veda | Secretaría de Ambiente de Salta |
| San Luis | **Vence el 31/12/2026** (Calendario Íctico 2026) | Calendario Íctico 2027 (el servidor ya lo prueba) | permisosdepesca.sanluis.gov.ar |
| Entre Ríos | Tallas, cupos y especies prohibidas sin texto oficial; resolución del Paraná oct–dic 2026 sin hallar | Resoluciones de la DRNyF | mail redactado en `~/vikarg-fishing-work/mails/` |
| Chaco | Res. 1078/2020 y Dec. 1623/10 sin texto; cupos del compendio 2019 | Texto vigente | mail redactado en `~/vikarg-fishing-work/mails/` |
| Litoral (Chaco, Misiones, Formosa) | Tallas y cupos de 2019 (compendio del MAGyP) | Normas provinciales vigentes | sitios provinciales |

Próximos vencimientos: Salta y Catamarca 31/08/2027; Córdoba y Santa Cruz 30/09/2027; Tierra del Fuego 29/10/2027; Patagonia común y Mendoza 31/10/2027. El servidor (`server/src/fishing/watch.ts`) los revisa solo desde 45 días antes y avisa por mail.

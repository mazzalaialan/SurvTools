# Sección Pesca (diseño y datos)

Estado: **app hecha, faltan los datos reales** (2026-11-23). La sección funciona con datos de prueba (`app/e2e/fixtures/fish-AR.json`, e2e `fishing.spec.ts`); falta generar `public/data/fish-AR.json`. Decisiones del dueño del proyecto: empezar por **Patagonia**, **tramos ubicados a mano** en el mapa (no el río entero) y **tabla propia orientativa de carnadas**.

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
- **Falta:** ubicar los 366 tramos en el mapa (OSM) y revisar los campos de cada tramo.

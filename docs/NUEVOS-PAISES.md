# Nuevos países: Ecuador, Colombia, Venezuela y Brasil

Estado: **investigación hecha el 2026-11-19, nada implementado.** Este documento resume lo decidido, lo que se encontró y lo que sigue, para retomarlo más tarde sin releer todo. Los informes completos (15 puntos por país, con tablas de fuente, licencia, formato, frecuencia, confianza y esfuerzo, más ejemplos reales de respuestas) están en `docs/investigaciones/`:

- `ecuador-2026-11-19.md`, `colombia-2026-11-19.md`, `venezuela-2026-11-19.md`, `brasil-2026-11-19.md`
- `legal-cc-by-sa-colombia-2026-11-19.md` (revisión legal orientativa de CC BY-SA y textos de atribución propuestos)

Qué hay que tocar para sumar un país o un idioma (lista de lugares del código): `docs/PAISES-E-IDIOMAS.md`. Cómo se documenta cada fuente: `docs/FUENTES-DE-DATOS.md`.

> Las muestras que bajaron los investigadores (carpetas temporales `ec/`, `co-dl/`, `ve/`, `br-dl/`) **no se guardaron**: son re-descargables con las URL de cada informe. Los datos de prensa (terremotos, estados de excepción, precios) vienen de búsquedas web y **no están verificados contra fuente oficial**: no usarlos en la app.

## Decisiones de política tomadas (2026-11-19)

Están en `CLAUDE.md`:

1. **Dato sin licencia declarada: se usa con retribución** (crédito visible: organismo, enlace y fecha del dato, en la app y en `FUENTES-DE-DATOS.md`).
2. **«Creative Commons» sin aclarar cuál: se asume CC BY** (Atribución).
   - **MapBiomas: se toma como CC BY** (el usuario lo decidió el 2026-11-19; Earth Engine declara CC BY 4.0 y el propio MapBiomas dijo CC BY-SA en 2024, contradicción que se resuelve a favor de CC BY). Se usa con atribución completa. Si MapBiomas publicara una condición share-alike explícita, volver a revisar.
   - **CC BY-ND (sin derivadas): se usa** (decidido el 2026-11-19: «no estamos modificando el dato, sino permitiendo visualizarlo de una manera distinta… le retribuimos por su información»). Vale para ANP (combustible) y CNES (salud) de Brasil: se muestran con crédito, sin alterar los valores. Queda como punto a validar por un abogado dónde está el límite entre presentar y adaptar (por ejemplo, agregar coordenadas a la ANP, que no las trae, es agregar información y no solo mostrarla).
3. **No comercial:** se usa mientras la app sea gratuita y sin publicidad, con interruptor para apagarlo en una copia paga.
4. **«Derechos reservados» declarado de forma explícita, o que prohíba redistribuir: no, salvo autorización.** Si los derechos reservados **no están declarados**, se trata como CC BY (decidido el 2026-11-19: «derechos reservados, si no son declarados, es BY para nosotros»). Efecto: lo que no declara nada se usa con crédito; lo que dice «Todos los Derechos Reservados» o lo prohíbe expresamente (por ejemplo el pie del INAMEH de Venezuela y Agritempo de Brasil) sigue pidiendo autorización.
5. **Share-alike (CC BY-SA, ODbL fuera de OSM): caso por caso.** Aceptado **solo** para los datos hidrológicos de Colombia (IDEAM, datos.gov.co), como conjunto separado y con atribución completa. Falta validación de un abogado (ver la lista del informe legal).
6. Sigue valiendo: no saltear Cloudflare, captchas, claves ni límites; las alertas son «informativas», nunca oficiales; solo `contacto.vikarg@gmail.com`.

## Cuadro comparativo

| Módulo | Ecuador | Colombia | Venezuela | Brasil |
|---|---|---|---|---|
| Alertas meteorológicas oficiales | PDF de imagen del INAMHI, sin CAP | **CAP 1.2 del IDEAM, CC BY 4.0** | Nada usable | **CAP 1.2 y RSS del INMET** («public domain», citar fuente) |
| Pronóstico oficial | JSON del INAMHI (30 localidades, sin licencia) | No evaluado | PDF diario del INAMEH, derechos reservados | CPTEC (XML legado); Open-Meteo ya cubre |
| Sismos oficiales | IGEPN prohíbe redistribuir | SGC sin feed vivo (403) | FUNVISIS: JSON no documentado | Sin dato abierto confirmado |
| Volcanes | SNGR con semáforo, datos dispares | 21 con semáforo del SGC | No hay holocenos | No hay activos (no verificado) |
| Parques | Solo OSM | **RUNAP CC BY 4.0** | OSM (INPARQUES dice «Creative Commons»: se asume CC BY) | **CNUC CC BY** (3.576 unidades) |
| Ríos | API de estaciones da 403, sin umbrales | datos.gov.co CC BY-SA, 4-5 días de atraso | PDF del Orinoco, sin umbrales | **ANA telemetría (5.477 estaciones, 15 min) + umbrales del SGB (cuenca del Uruguay)** |
| Mareas | INOCAR (25 puertos, HTML) + IOC | IOC (11) + DIMAR por PDF | Ninguna | Marinha bloqueada (Cloudflare); IOC |
| Teléfonos confirmados | 911, CIATOX | 123, 144, UNGRD, toxicología, PNN | FUNVISIS, INAMEH (911 con baja confianza) | Lista de Anatel (190…199, 180, 188), toxicología 0800 722 6001 |
| OSM de servicios | Bueno (desfibriladores: 2) | Bueno (cajeros y agua pobres) | Aceptable (costa central puede estar desfasada) | Bueno en ciudades; cajeros, agua y DEA flojos |
| Huerta | Sin calendario | Sin calendario | Sin calendario | ZARC (CC BY) solo para ~13 cultivos; no cubre hortalizas de huerta |
| Idioma | Español | Español | Español | **Portugués (pt-BR): la app no lo tiene** |

## Resumen por país

**Colombia (el más fácil de sumar bien).** Alertas CAP del IDEAM (`alertascap.ideam.gov.co/ospa/xml`, CC BY 4.0, encaja con el patrón de servidor de Bolivia y Perú), RUNAP (parques, CC BY 4.0), volcanes con semáforo del SGC (copia de agosto; boletín semanal del Ruiz en PDF), geología 1:1.000.000 del SGC (CC BY 4.0), teléfonos oficiales (123, 144, UNGRD 018000 113200, toxicología 018000-916012, PNN 018000 129722, Cruz Roja 018005198534). Ríos y lluvia en datos.gov.co (CC BY-SA, aceptada): 168 estaciones de nivel y 508 de lluvia, **4 a 5 días de atraso** y sin umbrales; las coordenadas vienen invertidas en el catálogo. API `/UngrdApi/alertas` del IDEAM sin licencia declarada (se puede usar con crédito, pedir confirmación). Sin confirmar: 119 de bomberos, 132 de Cruz Roja, ambulancia nacional (no usar 112, 125 ni 141). Guías de primeros auxilios de Minsalud: «derechos reservados», no se copian. Banda ciudadana: requiere autorización. El mapa offline actual llega hasta lat. 0: Colombia llega a ~12,7° N (15,5° con San Andrés).

**Ecuador.** Se puede sumar: 911, CIATOX (1800 836 366), 24 provincias de Natural Earth (con Galápagos), dos zonas horarias (`America/Guayaquil`, `Pacific/Galapagos`), OSM (extracto 120 MB), pronóstico JSON del INAMHI (sin licencia: con crédito; consultar solo desde el servidor y **no enlazar `inamhi.gob.ec`: cargaba un script de un sitio de apuestas**), mareas INOCAR (HTML) e IOC, tabla de declaratorias de la SNGR (nivel informativo), geología Macrostrat. Bloqueado o limitado: IGEPN (Cloudflare y términos que prohíben redistribuir), `datosabiertos.gob.ec` (WAF), Cruz Roja (403), API de datos horarios del INAMHI (403), límites oficiales de áreas protegidas (solo un Drive sin licencia), IGM (derechos reservados). El mapa offline (hasta lat. 0) corta el norte y deja fuera Galápagos (inferencia, no probada).

**Venezuela.** Conviene sumarlo **con datos reducidos y avisos claros**; lo estable son las fuentes internacionales (USGS, Open-Meteo/GloFAS, OSM, HDX). Se puede sumar: contornos de Natural Earth (la Guayana Esequiba figura como de Guyana y Venezuela la reclama: **decisión del usuario**), `America/Caracas` (UTC-4 fijo; hasta 2016 fue UTC-4:30), sismos USGS más el JSON de FUNVISIS (`funvisis.gob.ve/maravilla.json`, por HTTP, con campos mal rotulados: magnitud en `phone`, hora en `city`, profundidad en `state`), OSM (extracto 128,8 MB; costa central posiblemente desfasada tras el terremoto de junio), límites de municipios y parroquias (COD-AB en HDX, CC BY-IGO). Con trabajo: ríos del Orinoco desde los PDF del INAMEH (derechos reservados: pedir autorización; sin umbrales), refugios y requisitos de INPARQUES (Pico Bolívar exige registro; se asume CC BY), radio (CONATEL marca 7.100-7.150 kHz). Teléfonos: solo los oficiales confirmados (FUNVISIS 0800-836-2567, INAMEH); el resto («911», bomberos, Protección Civil) sin confirmar o contradictorios. Sin cubrir: mareas, huerta, cartografía oficial, vegetación, combustible. Sitios caídos hoy: Protección Civil, VEN 911, SHO.

**Brasil (el que más dato abierto tiene, pero exige idioma).** Se puede sumar: alertas CAP del INMET (`apiprevmet3.inmet.gov.br/avisos/ativos` y `/avisos/rss`), telemetría de la ANA (XML, 15 min, ~30 min de atraso) con umbrales del SGB para la cuenca del Uruguay (Uruguaiana: 650/750/850 cm), CNUC (parques, CC BY), IBGE (estados y municipios), INPE focos de calor (CSV cada 10 min, mejora lo de FIRMS), teléfonos de la lista de Anatel. Huerta: ZARC (CC BY, ~580 MB y ~2,5 millones de filas) **no sirve para hortalizas**; sirve para ~13 cultivos que coinciden. Bloqueado: Marinha/CHM e IBGE-portal (Cloudflare), descarga del CEMADEN (captcha), radar REDEMET y nueva API HidroWeb (clave), Agritempo (derechos reservados). Licencias resueltas por política: **CC BY-ND 3.0** (ANP combustible, sin coordenadas; CNES salud, con coordenadas y teléfono): se usa con crédito; MapBiomas: **se usa como CC BY**, TOPODATA (sin texto de licencia). Escala: sumar **por regiones, Sul y Mato Grosso do Sul primero** (OSM: Sul 411 MB + Centro-Oeste 198 MB; el país entero pesa 2,0 GB), y no un `BR.json`; los datos nacionales (INMET, ANA, CNUC, IBGE, INPE) se cargan enteros.

## Hallazgos transversales (afectan al código)

- **Países vecinos hoy:** Ecuador y Brasil están en `NEIGHBORS` de `tools/geo-data/build.mjs`: hay que sacarlos de ahí y pasarlos a `COUNTRIES` al sumarlos.
- **Detección de país por zona horaria:** `America/Sao_Paulo` coincide en offset con Argentina, Uruguay y Paraguay, y `America/Rio_Branco` con Perú y Colombia. **Detectar por el nombre IANA, no por el offset.** Brasil tiene 16 zonas IANA (UTC−2 a −5) y Ecuador dos (`America/Guayaquil` y `Pacific/Galapagos`).
- **Mapa offline:** el límite norte actual (lat. 0) hay que ampliarlo para Colombia (~12,7° N; 15,5° con San Andrés), Venezuela y buena parte de Brasil; Ecuador y Galápagos también quedan cortados o fuera (a medir al implementar).
- **UTM y datum (para el mapa impreso con cuadrícula):** Colombia usa EPSG:9377 (Origen Nacional); Brasil UTM 18 a 25 (más la isla Trindade en la 26), SIRGAS 2000 = EPSG:4674; Ecuador zonas 17 y 18 (Galápagos 15 y 16, por cálculo, sin confirmar con el IGM); Venezuela, REGVEN/SIRGAS.
- **Ecorregiones:** el archivo de ecorregiones ya trae las de Colombia, pero hay que regenerarlo al sumar países para no cortar los bordes.
- **Natural Earth:** Colombia trae un polígono sin nombre y «del Tolima» (corregir); en Brasil una etiqueta del Distrito Federal sale «Federal».
- **Idioma portugués:** 3.577 textos de interfaz (~145.000 caracteres) más ~420 KB de contenido largo (nudos, primeros auxilios, huerta, semillas); 13 apariciones de `es-AR` fijo en `app/src` y 40 archivos con `toLocale…`. La revisión de textos de seguridad necesita una persona de Brasil. Nombre sugerido: «Ferramentas de Sobrevivência por VikArg».
- **Huerta:** ningún país tiene un calendario oficial adecuado para hortalizas de huerta doméstica. **No se inventa**: Ecuador, Colombia y Venezuela quedan sin recomendaciones; Brasil, solo ZARC rotulado «cultivos comerciales».
- **Alertas oficiales por servidor** (patrón existente en Bolivia y Perú, con «último bueno»): candidatos claros son IDEAM (CAP) e INMET (CAP/RSS).
- **Contexto de riesgo reportado por los informes** (de prensa, sin verificar): Ecuador en alerta roja nacional por El Niño; Venezuela con terremotos de 24-jun-2026 (USGS: M7,5 y M7,2; cifras de muertos contradictorias, no usar ninguna); Colombia con un terremoto del 10-ago-2026 en el Eje Cafetero. Antes de sumar cualquier país, revisar si hay estados de excepción o restricciones de acceso vigentes.

## Revisión pendiente: que la ANP no duplique lo que ya viene de OSM

Antes de implementar la ANP (combustible, Brasil), **comprobar qué agrega frente a OpenStreetMap**: OSM ya trae los surtidores de las ciudades medidas (Foz do Iguaçu 48, Florianópolis 89, Curitiba 254). La ANP tiene 45.846 estaciones oficiales, pero sin coordenadas. Pasos: (1) cruzar una región de prueba (por ejemplo Foz do Iguaçu y Florianópolis) por dirección y nombre y contar cuántas estaciones de la ANP no están en OSM; (2) ver si agrega algo que OSM no tiene (razón social, bandera, estado de la autorización, tipos de combustible); (3) si no suma o suma poco, **no cargarla** y quedarse con OSM; (4) si se usa, que el dato de la ANP no duplique el pin de OSM en el mapa (una sola entrada por estación). Lo mismo vale para el CNES frente a los hospitales y farmacias de OSM.

## Para cuando se sumen otros continentes: satélite infrarrojo equivalente a GOES-19

Hoy el servidor usa **solo GOES-19** (banda 13, infrarrojo; `server/src/rain/observer.ts`, `goesIr.ts`, `noaaWatch.ts`) para estimar la lluvia en los lugares con aviso y para parte del mapa del clima. GOES-19 cubre todos los países soportados y los que se investigaron (Ecuador, Colombia, Venezuela, Brasil); **no hace falta otro satélite mientras el proyecto siga en América**. GOES-18 (Pacífico oriental) está en el mismo bucket de NOAA, pero no se usa.

Al sumar otro continente hay que **investigar y verificar** un equivalente (lo siguiente es lo que se sabe en general, **sin verificar al 2026-11-19**: formato, licencia y exigencia de registro de cada uno están por confirmar):

| Zona | Satélite candidato | Cómo se obtendría (a verificar) |
|---|---|---|
| Asia y Oceanía | Himawari-9 (Japón) | Bucket abierto de NOAA en AWS, parecido al de GOES: el que más fácil encajaría con lo que ya se hace |
| Europa y África | Meteosat de EUMETSAT (uno sobre el meridiano 0, otro sobre el Índico) | Data Store de EUMETSAT; suele pedir registro gratuito |
| Corea, China, India | GK-2A, FY-4, INSAT | Portales de cada agencia, con registro; no se sabe si hay copia abierta sin cuenta |
| Pacífico oriental | GOES-18 | Mismo bucket de NOAA que GOES-19 |
| Imagen global (solo visual) | NASA GIBS | Teselas ya armadas de varios geoestacionarios; sirve para mostrar nubes, no para leer valores |

Qué hay que mirar de cada uno antes de elegir: bucket o servicio, formato (NetCDF u otro), licencia y atribución (aplica la política de `CLAUDE.md`), frecuencia, si exige registro (no se saltea), y sobre todo **si se puede leer solo la franja de filas que cubre cada lugar** (como se hace con GOES: ~400 KB por franja de 50 km) en vez de bajar el disco completo. Limitaciones conocidas: la estimación de lluvia por infrarrojo pierde precisión hacia el borde del disco de cada satélite, y el servidor hoy asume la geometría y el nombre de archivo de GOES (`goesIr.ts`), que habría que generalizar por satélite.

Cuando se decida el primer continente nuevo, lanzar una investigación con el agente investigador sobre este punto, igual que las de los países.

## Estado de Brasil (2026-11-19, sin publicar)

Se empezó por Brasil, con la **interfaz en portugués** y la **base del país** para **Sul + Mato Grosso do Sul** (RS, SC, PR y MS):

- **Código:** `BR` en `Country`/`COUNTRIES`, detección por el **nombre** de la zona horaria (`America/Sao_Paulo`, `Manaus`, `Cuiaba`, `Campo_Grande`, `Rio_Branco`, etc.; no por el desfase), `GeoCountry`, vista inicial del mapa del clima, números de emergencia (190, 192, 193, 199, 191, 197, 188, 180 y Disque-Intoxicação 0800 722 6001, lista de la Anatel), guía de primeros auxilios, huerta **sin zona sugerida** (no se inventa; el ZARC solo cubre cultivos comerciales), textos legales propios («INMET y Defesa Civil») y textos en es/en/pt.
- **Mapa base:** 27 estados con nombre oficial en portugués, frontera y capitales (`node tools/geo-data/build.mjs --solo-brasil`, tolerancia 0,03°, +73 KB); contorno para detectar el país en `borders-data.json` (+32 KB).
- **Datos (2,87 MB en 12 archivos, todos en `app/public/data/*-BR.json` y `BR.json`):** servicios de OpenStreetMap solo de Sul y MS (extracto de Geofabrik del 2026-11-18; recorte con las fronteras de OSM de los cuatro estados: `tools/osm-index/brazil.sh`): surtidores 5.959, farmacias 4.222, talleres 2.737, cajeros 1.601, agua 1.270, gomerías 671, náutica 590, veterinarias 407, refugios 200, desfibriladores 11; `BR.json` con 1.311 localidades (GeoNames), 437 bomberos, 1.617 policía y 4.805 centros de salud, **sin radios** (no hay fuente pública verificada). **Parques:** CNUC (CC BY), 208 áreas (todos los parques nacionales con polígono, 75 de 77, más las unidades federales y estaduales de RS, SC, PR y MS), 735 KB; 18 estaduales del PR sin polígono van con un cuadrado de ±2 km marcado `areaApprox`.
- **Servidor:** alertas CAP del **INMET** (`/avisos/rss` y `/avisos/rss/{id}`, «public domain» citando la fuente): se reproducen como informativas; el polígono del aviso es una envolvente de todas las zonas (puede dar falsos positivos cerca del borde; hacerlo por municipio pediría una tabla IBGE de 5.571 centroides).
- **Pruebas:** vitest app 1068, servidor 268; e2e **sin correr todavía** (hay que correr la completa antes de publicar).

**Falta de Brasil:** (1) **revisión humana del portugués** (ver `docs/TRADUCCION-PT-BR.md`) y el contenido largo en portugués (nudos, primeros auxilios, huerta, semillas); (2) **más sectores** (Sudeste, Nordeste, Norte, resto del Centro-Oeste): decidir si se parte Brasil por macrorregiones del IBGE con descarga por sector (cada uno ~3 MB como el actual) y cambiar `countryDownload` y la pantalla de países; (3) ~~**ríos**~~ **(hecho el 2026-11-19, sin publicar):** tarjeta «Ríos de Brasil» en Navegación con 33 estaciones de la ANA (29 de la cuenca del Uruguay, 24 de ellas con cotas de atención/alerta/inundación del SGB/CPRM de 2023; Iguazú y Paraná de frontera solo con nivel), por servidor (`GET /api/rivers/br`); falta el aviso push, más cuencas y la capa en el mapa (ver `docs/FUENTES-DE-DATOS.md`, «Brasil, ANA y SGB: ríos»); (4) ~~focos de calor del INPE~~ **hecho el 2026-11-19** (ver abajo); (5) servidor: sumar `BR` a `DATA_FILES` y a `update-data.sh` si se quiere la regeneración mensual (hoy los paquetes de Brasil van solo con la app); (6) ANP y CNES (ya aceptados con crédito; comprobar antes que no dupliquen OSM); (7) la geología (Macrostrat) y las ecorregiones del país; (8) pedidos formales.

**Focos de calor (hecho, 2026-11-19, sin publicar):** `/api/fires` cubre toda América del Sur (`FIRE_REGION = [-83, -57, -33, 13]`, Brasil entero; 9.207 detecciones de 24 h, 3.344 celdas, 91 KB contra 2.241, 792 y 22 KB antes) y en Brasil suma del INPE Queimadas riesgo de fuego, días sin lluvia, bioma y municipio-UF (campo opcional `inpe`, +62 KB; sin INPE queda FIRMS solo). Fuera de la región original una fuente fija necesita las 8 fechas (con 6 se ocultaban quemas del Amapá y Marajó). Falta: licencia de redistribución del INPE y revisión humana del portugués de los textos nuevos. Detalle y mediciones en `docs/FUENTES-DE-DATOS.md`.

## Brasil por sectores y borrado de paquetes (2026-11-19, sin publicar)

- **Sectores:** Brasil se baja por las cinco macrorregiones del IBGE (`app/src/modules/emergency/sectors.ts`): Sul (PR, SC, RS), Sudeste (SP, RJ, MG, ES), Centro-Oeste (MT, MS, GO, DF), Nordeste (MA, PI, CE, RN, PB, PE, AL, SE, BA) y Norte (AC, AM, AP, PA, RO, RR, TO). Archivos por sector: `BR-<sector>.json`, `<categoría>-BR-<sector>.json` y `parks-BR-<sector>.json`. Para el resto de la app Brasil sigue siendo un país (`BR`): localidades, servicios y parques se juntan de los sectores elegidos (`settings.brSectors`; `mergePackages`, `mergeServiceData`, `mergeParks`).
- **Pantalla:** en Ajustes → País, al **tocar Brasil** se despliega (y al volver a tocarlo se esconde) una fila por sector con su peso, tilde, descarga y papelera (`CountryPackPicker.tsx`). Tocar Brasil **no cambia el país actual**: es para poder bajar el sector pegado a donde vas (por ejemplo desde Misiones); «Usar Brasil como país actual» es un botón aparte dentro de la lista. Elegir Brasil no baja nada solo. El mapa de países permite marcar y usar Brasil y remite a Ajustes para bajar por sector.
- **Mapa de países:** Brasil ya no es una sola zona: son sus cinco sectores, cada uno con su color de estado, su nombre corto, los límites de los estados que lo forman (para reconocerlos al acercar) y el mismo flujo de toques (marcar, bajar o actualizar; botón para borrar). Pensado para quien está en un país vecino (por ejemplo Misiones) y quiere bajar el sector brasileño pegado sin conocer Brasil. Elegir Brasil como país actual desde cualquier sector marca los cinco con ★ y el halo rodea todo el país (`CountryPackMap.tsx`).
- **Cambio de criterio del país (2026-11-19):** la app usa siempre el país elegido en Ajustes (emergencias, guía, radio, mapa, paquetes), sin mirar el GPS; si el GPS detecta otro país pregunta si querés cambiarlo y, si aceptás, cambia y baja el paquete (en Brasil, el sector donde estás). Ver `docs/COLABORAR.md`.
- **Detección por ubicación:** si estás en Brasil **y Brasil es el país elegido**, la app baja el sector donde estás parado (`downloadSectorFor` en `countryAutomation.ts`; el estado sale del mapa base): con Wi-Fi sin avisar; con datos móviles o conexión desconocida, preguntando antes (el mismo aviso de los países). No baja un sector que borraste a mano (`brSectorsDeclined`) ni uno al que dijiste «Ahora no» en la sesión. Solo reacciona a eventos de ubicación (no pide el GPS).
- **Borrar paquetes:** cada país bajado (menos el activo y menos Brasil, que se borra por sector) y cada sector tienen una papelera con confirmación que dice cuánto se libera (`countryDelete.ts`). No se borra lo que usa otro país (ecorregiones; parques y repetidoras de Chile, que usa Argentina; `deletableFiles`).
- **APK solo con Argentina (2026-11-19):** el APK ya no trae los datos de los demás países ni los sectores de Brasil (`app/scripts/prune-native-data.mjs`, corre en `npm run android:debug`): pasa de 34 MB a 6,5 MB de datos sin comprimir. La app nativa los pide a la web publicada o al servidor propio al bajar un país (`dataFile.ts`). Consecuencia: la primera vez que se baja un país en el APK hace falta conexión (Argentina funciona sin ella desde el primer segundo).
- **Idiomas:** vienen con la app (el inglés y el portugués son archivos de ~82 a 87 KB comprimidos que la PWA guarda en la instalación y la APK trae adentro); no hay pantalla de descarga. Hacerlos paquetes descargables agregaría complejidad media (cargador de idiomas, versionado, pantalla de primer inicio sin conexión) y casi no ahorraría peso; conviene recién si el contenido largo traducido llevara cada idioma a ~1 MB.

## Orden recomendado

1. **Colombia** (alertas CAP del IDEAM, RUNAP, volcanes, teléfonos, ríos con aviso de atraso).
2. **Ecuador** (base, pronóstico INAMHI por servidor, mareas, parques desde OSM).
3. **Brasil por regiones**, empezando por **portugués y base del país**; después INMET, ríos de frontera (ANA + SGB), CNUC, OSM por región, focos INPE; CNES solo después de resolver la licencia ND; huerta solo con ZARC parcial.
4. **Venezuela** con datos reducidos y avisos claros (sismos USGS + FUNVISIS, OSM, contornos).

Cada país empieza igual: tipos y detección (`Country`, `COUNTRIES`, zona horaria), contornos y fronteras, teléfonos con fuente, y recién después las fuentes por servidor.

## Decisiones que quedan para quien dirige el proyecto

- Guayana Esequiba en el mapa de Venezuela (¿contorno de Natural Earth o con la reclamación?).
- Cualquier dato share-alike fuera de los ríos de Colombia (por ejemplo, si apareciera una condición CC BY-SA en otra fuente).
- Brasil: ¿se suma por regiones y con qué región primero? ¿Quién revisa la traducción de textos de seguridad?
- Precios de combustible: no mostrarlos (las fuentes se contradicen en Ecuador y Venezuela).
- Validación por un abogado matriculado de lo que lista el informe legal (alcance de share-alike, compatibilidad con ODbL, DRM en tiendas, `CONTRIBUTING.md`, términos del servidor).

## Pedidos formales pendientes (desde `contacto.vikarg@gmail.com`)

Ningún pedido se envió. Cada informe tiene el detalle y a quién va; resumen:

- **Ecuador:** IGEPN (permiso para sismos y volcanes), INAMHI (autorización del JSON, feed CAP/RSS, API de estaciones y umbrales de crecida), SNGR (JSON o CAP de declaratorias), Ministerio de Ambiente y Energía (límites del SNAP), INOCAR (constantes armónicas), IGM e IIGE (licencia y descarga), ARCOTEL (bandas), ARCH (estaciones de servicio), Cruz Roja y Ministerio de Salud (teléfono vigente y guías con licencia). Avisar al INAMHI del script sospechoso en su sitio.
- **Colombia:** IDEAM (licencia y estabilidad de `UngrdApi`, umbrales, atraso del radar), SGC (feed vivo de sismos y aclarar el 403), UNGRD y bomberos (confirmar 119 y números), Minsalud (ambulancia y permiso para las guías), Parques Nacionales (teléfonos por parque y estado de acceso), DIMAR (tablas de marea), LCRA y MinTIC (repetidoras), Agrosavia, UPRA o ICA (calendarios de siembra).
- **Venezuela:** INAMEH (autorización de los PDF), FUNVISIS (documentación y licencia del feed), INPARQUES (qué Creative Commons es, límites de parques, requisito del Roraima), VEN 911 o Interior (bomberos y Protección Civil), Ministerio de Salud (toxicología), Hidrografía y Navegación (mareas), IGVSB (capas vectoriales y datum), Radio Club Venezolano (repetidoras y red de emergencia).
- **Brasil:** INMET, ANA, SGB (umbrales de las demás cuencas), CENAD/MIDR, CEMADEN, DECEA, Marinha, ICMBio (teléfonos por unidad), Ministério da Saúde, ANP, MapBiomas, INPE, LABRE y Anatel.

## Texto de atribución propuesto para los datos de Colombia (borrador)

Detalle y versión en inglés en `docs/investigaciones/legal-cc-by-sa-colombia-2026-11-19.md` (§4). Línea para la pantalla de ríos:

> Datos: IDEAM (Instituto de Hidrología, Meteorología y Estudios Ambientales de Colombia), en datos.gov.co, CC BY-SA 4.0; adaptados por VikArg, sin aval del IDEAM. Datos crudos sin validar y con días de atraso: informativo, no es una alerta oficial.

Variante corta para la leyenda de la capa: «Ríos y lluvia de Colombia: IDEAM (datos.gov.co, CC BY-SA 4.0), adaptados. Informativo, no oficial.». La entrada completa va en la lista de créditos de la app (`licenses.credit`, hoy texto plano: conviene que el enlace sea clicable) y en `FUENTES-DE-DATOS.md`. Las modificaciones que se declaren tienen que ser las que realmente se hacen.

## Lo que quedó sin hacer en este tema

Nada de esto está en el código ni en la app: no hay tipos nuevos, ni paquetes de datos, ni textos, ni atribuciones cargadas. Antes de implementar un país, releer su informe completo (las tablas traen URL exactas, formato y ejemplos de respuesta) y volver a probar las fuentes: son del 2026-11-19 y varias son intermitentes.

### Brasil: ANA y CNES contra OSM (2026-11-20)

- **ANA:** las 33 estaciones de `rivers-BR.json` no existen en OSM (0 elementos `monitoring_station`/`waterway=gauge` a 500 m ni a 5 km). OSM no aporta ni el código ANA ni umbrales: se mantiene la ANA y no se toma nada de OSM.
- **CNES** (CSV nacional de 57 MB, `s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_csv.zip`, 233 MB descomprimido, latin-1, `;`, actualizado a diario; CC BY-ND 3.0 según el portal `dadosabertos.saude.gov.br`; la wiki de OSM lo llama «dominio público» y habla de una importación, pero manda el portal oficial). Hay 503.557 establecimientos activos (sin `CO_MOTIVO_DESAB`), 229.852 de ellos consultorios (tipo 22).
  - **Cruce real** (OSM = hospital/clínica/médico sin farmacias ni dentistas; CNES activos con coordenadas): **Foz do Iguaçu** OSM 36 vs CNES 575; **Florianópolis y alrededores** (caja) OSM 140 vs CNES 3.356. De los elementos de OSM, 33/36 (Foz) y 124/140 (Florianópolis) tienen un CNES a menos de 150 m: OSM es casi un subconjunto del CNES. En sentido contrario, solo el 24 % (Foz) y el 41 % (Florianópolis) de los CNES tienen un OSM a 150 m.
  - **Con los tipos grandes** (hospital, pronto atendimento, policlínica, posto y centro de salud, UPA: 108 en Foz, 247 en Florianópolis) el solapamiento a 150 m es del 32 % y del 49 %, y sube a 51 % y 70 % a 300 m: **falta en OSM la mitad de lo que importa**. El CNES trae además teléfono (98 % en estas ciudades; OSM 9 % y 40 %), 24 h (24 y 116 establecimientos) y atención SUS.
  - **Códigos `TP_UNIDADE` (confirmados el 2026-11-20 con el cadastro oficial CnesWeb/DATASUS, `cnes2.datasus.gov.br/Mod_Ind_Unidade.asp`):** 01 posto de saúde, 02 centro de saúde/unidad básica, 05 hospital general, 07 hospital especializado, 20 pronto socorro general, 21 pronto socorro especializado, 73 pronto atendimento. Coinciden con los nombres de la muestra: 04 policlínica (se incluye), 70 CAPS (salud mental: **se deja afuera**). Por confirmar antes de implementar: 15 (unidad mixta), 62 (hospital-día) y 72 (salud indígena). Excluidos: 22 consultorio, 36 clínica/ambulatorio especializado, 39 apoyo diagnóstico, 43 farmacia, 42 y 40 unidades móviles. El cruce de arriba usó una lista provisoria (1, 2, 4, 5, 7, 15, 20, 32, 62, 70, 72, 73); con la lista confirmada los números cambian un poco, pero no la conclusión. Falta cargar el «Dicionário de dados» completo para cerrar 15, 62 y 72.
  - **Pin doble — decisión del usuario (2026-11-20):** si OSM y el CNES tienen el mismo establecimiento, se muestra el del CNES y se oculta el de OSM a menos de ~150 m. Cada pin viene de una sola fuente (CC BY-ND: no se mezclan campos).
  - **Recomendación:** cargar del CNES solo hospitales, pronto atendimento/UPA, policlínicas y postos/centros de salud SUS, con 24 h, teléfono y SUS, filtrando los dados de baja; sin consultorios privados ni laboratorios. Cada pin de una sola fuente (el CNES no se mezcla con OSM: BY-ND).

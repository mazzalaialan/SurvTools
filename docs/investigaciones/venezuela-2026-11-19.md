# Venezuela para VikArg: investigación de fuentes abiertas

Consultado el **2026-11-19** desde el servidor de VikArg (`curl -4`, agente `VikArg-Prepping-Tools/1.0`, sin saltear nada). Solo investigación: no se tocó el repositorio. Archivos bajados en `(carpeta temporal de la sesión, ya no disponible)/ve/` y `.../ne/` (no se copiaron al repo).

Leí antes `CLAUDE.md`, `docs/PAISES-E-IDIOMAS.md` (tabla A1–A4) y `docs/FUENTES-DE-DATOS.md` (formato de Bolivia, Perú y Paraguay). Se usa el mismo criterio de confianza: oficial / confirmado por 2 fuentes / sin confirmar, más alto-medio-bajo en la columna de confianza.

---

## 0. Contexto que cambia todo: el doble terremoto del 24 de junio de 2026

Esto no es un detalle: para una app de emergencias es lo primero que hay que saber del país hoy.

- El **24 de junio de 2026** hubo dos terremotos seguidos en la costa central: **M7,5** a 20 km al oeste de Catia La Mar (10,60 N, 67,22 O, 10 km de profundidad) y **M7,2** a 20 km al este de San Felipe (Yaracuy; 10,37 N, 68,56 O). **Verificado en el catálogo del USGS** (consulta FDSN de hoy, 2 eventos M>=6,5 en Venezuela en 2026) y en el informe especial del EMSC (`https://emsc-csem.org/Special_reports/?id=420`, Mw 7,2 y 7,5, 22:04 y 22:05 UTC).
- Balance de víctimas: **las fuentes no coinciden y cambian con el tiempo** (prensa: 235 en las primeras horas, 920, 1.430 según OPS a fines de junio, 3.811, 4.100, 5.208 el 19/07, 6.125 el 03/08, **6.509 el 24/08** según el gobierno interino citado por AFP/El Diario; desaparecidos: 157 oficiales contra una estimación de la ONU de hasta 50.000). No usar ninguna cifra en la app. Fuente: búsqueda web (El Diario, Teleamazonas/AFP, NTN24), **sin abrir el parte oficial**.
- Cobertura de internet: la Cámara de Empresas de Servicios de Telecomunicaciones habló de **daños de hasta 90 % en el sistema de comunicaciones del litoral central** (The Objective, 2026-07-01). Hubo SMS por satélite Starlink Mobile de Movistar en La Guaira y puntos Starlink comunitarios. Es un dato de prensa, **no verificado** por organismo.
- Hubo **réplicas**: FUNVISIS informa 100 a 120 sismos por semana todavía en agosto-octubre de 2026 (El Diario, 2026-08-21 y 2026-09-11; NTN24, octubre). Una nota de NTN24 de noviembre cita dos sismos en Zulia.
- Consecuencias para VikArg: (a) la infraestructura de servicios (hospitales, estaciones, cajeros, comunicaciones) en La Guaira, Caracas, Miranda, Carabobo, Yaracuy y Falcón cambió después de junio y **el OSM de la zona puede estar desfasado**; (b) hay mucho dato humanitario abierto nuevo (HDX, ver punto 2); (c) hay un gobierno **interino** (AFP lo llama así) y los organismos pueden cambiar de nombre, de sitio o de política: ninguna fuente estatal da garantía de continuidad.

Hay que decirlo con honestidad: no pude abrir el parte oficial de Protección Civil (sitio caído, ver abajo); las cifras de arriba son de prensa y organismos internacionales.

---

## Resumen ejecutivo

**Se puede sumar YA con fuente usable (esfuerzo chico):**
1. Contornos y regiones: Natural Earth 1:10m admin-1 trae **26 unidades** de Venezuela (23 estados, Distrito Capital, Dependencias Federales y la Isla de Aves sin nombre). Dominio público. Ojo con dos detalles de nombre (`Estado Vargas` = hoy La Guaira) y con la Guayana Esequiba (ver punto 5).
2. Zona horaria y detección: **`America/Caracas`, UTC-4 fijo** (sin horario de verano; el país estuvo en UTC-4:30 entre 2007-12-09 y 2016-05-01: un dispositivo con tzdata viejo podría seguir en -4:30; verificado con `zdump`).
3. Pronóstico, lluvia, ríos modelados y oleaje: **Open-Meteo** ya cubre Venezuela (probado: pronóstico en Caracas y la API de crecidas GloFAS con caudal del Orinoco en Ciudad Bolívar).
4. Sismos: **USGS** (probado: 96 eventos M2,5+ en el último año en el recuadro del país, 51 desde el 24 de junio; el USGS registra pocos sismos chicos en Venezuela, por eso el catálogo de FUNVISIS aporta más) y el **feed de FUNVISIS** (`http://www.funvisis.gob.ve/maravilla.json`, los últimos 20 sismos, JSON abierto sin clave, aunque no documentado y con campos mal rotulados).
5. Volcanes: **no hay volcanes holocenos en Venezuela** (consulta al WFS de Smithsonian GVP con recuadro del país: 0 en Venezuela; solo salen volcanes de San Vicente y Granada).
6. Servicios cercanos con OSM: hay datos razonables (Geofabrik: extracto de 128,8 MB al 18-nov-2026; Overpass: 835 hospitales, 1.176 clínicas/consultorios, 1.008 policías, 203 bomberos, 1.354 surtidores, 184 cajeros), con **muy pocos teléfonos** (9 surtidores) y **cero desfibriladores**.
7. Teléfonos: el **911** (VEN 911) está respaldado por varias páginas oficiales y por la prensa; el resto (bomberos, Protección Civil) **sin un número nacional único confirmado**.

**Sirve con trabajo (mediano):**
- **Ríos del Orinoco y Apure**: INAMEH publica PDF diarios con nivel y pronóstico de 15 días para Ciudad Bolívar, Caicara y otras (ejemplo real en el anexo). Hay que leer PDF (como Bolivia) y las coordenadas del propio PDF tienen un error. Ojo: el sitio está en **HTTP** con certificado propio mal emitido; la página se baja bien por `http://`.
- **Pronóstico textual de 24 horas del INAMEH** (PDF diario, regiones del país): útil como texto, sin licencia («Todos los derechos reservados» al pie).
- **Parques (INPARQUES)**: el sitio nuevo de INPARQUES funciona y trae refugios de alta montaña con coordenadas, capacidad y WhatsApp, pero **no hay límites en GeoJSON/Shapefile**. Hay que sacarlos de OSM (`boundary=protected_area`) y cargar a mano pocos datos.
- **Radio**: el Reglamento de la CONATEL (PDF) da las bandas de radioaficionados; la Red Nacional de Emergencia del Radio Club Venezolano usa **7.135 MHz** (prensa). No hay listado abierto de repetidoras.
- **HDX**: bastante material con licencia clara (ver punto 2 y 5).

**Bloqueado o caído hoy:** `pcivil.gob.ve` (Protección Civil: conexión rechazada), `ven911.gob.ve` (tiempo de espera / conexión rechazada), `sho.gob.ve` (hidrografía: el nombre no resuelve), `proteccioncivil.gob.ve` (no resuelve), `funvisis.gob.ve` por HTTPS (falla el apretón TLS; el HTTP funciona), `inameh.gob.ve` por HTTPS (certificado inválido; el HTTP funciona). `radioclubvenezolano.org` **no es el Radio Club de radioaficionados**: es un sitio de noticias genérico (cuidado: homónimo, no usarlo como fuente). No hay bloqueos anti-bot ni Cloudflare en lo que probé.

**Orden recomendado:** (1) tipos, detección, contornos y fronteras; (2) teléfonos (911 + los de INAMEH/FUNVISIS/Cruz Roja con aclaración); (3) OSM servicios con las cantidades de abajo; (4) sismos (USGS + FUNVISIS) y focos de calor (FIRMS ya global); (5) ríos del Orinoco/Apure vía PDF del INAMEH en el servidor; (6) refugios de montaña de INPARQUES y parques desde OSM; (7) huerta: dejar sin recomendaciones.

**Apreciación honesta:** conviene sumarlo **con datos reducidos y avisos claros**, y vale la pena por el terremoto y por el uso real (montañismo en Mérida, Roraima, Canaima, viajeros). Lo que **quedaría sin cubrir**: alertas meteorológicas oficiales (no hay CAP/RSS/API; solo texto en PDF), teléfono de toxicología nacional, calendario de huerta, límites oficiales de parques con licencia, mareas oficiales, y la continuidad de todas las fuentes estatales (INAMEH, FUNVISIS, INPARQUES publican, pero con servidores intermitentes y certificados inválidos). Habría que mostrar «sin confirmar» en casi todos los teléfonos. Lo más estable del país son las fuentes **internacionales** (USGS, Open-Meteo/GloFAS, OSM, HDX, NASA FIRMS).

---

## 1. Emergencias: teléfonos

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo de VikArg | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| **911** (VEN 911, número único: policía, bomberos, ambulancia, Protección Civil) | `https://ven911.gob.ve/` (no abrió hoy); `http://www.ivss.gob.ve/noticia/ivss-inaugur-red-de-coordinacin-hospitalaria-en-alianza-con-el-ven-911`; `https://contraloriamonagas.gob.ve/?p=3548`; `http://www.pcivil.gob.ve/?p=5619` (página de Protección Civil de 2020, hoy el sitio no responde); El Diario 2024-02-24 (`eldiario.com/2024/02/24/el-088-no-es-numero-de-emergencia-en-venezuela/`) y 2026-06-24 | sin licencia explícita | HTML / prensa | — | **medio-alto** (varias páginas oficiales de organismos del Estado y prensa lo llaman «línea única»; no pude leer la fuente primaria). Cobertura **no nacional completa**: El Diario 2024 dice que está instalado en varios estados y en el Distrito Capital, y que «cada cuerpo tiene su propio número según estado y zona». Las notas de 2020 hablan de 26 centros | `emergency/national.ts`, `firstAid/guides/types.ts` | chico | sitio oficial caído |
| **171** (número tradicional) | una nota local sin fecha; no confirmado | — | prensa | — | **bajo** (no usar) | — | — | — |
| **088** | El Diario 2024-02-24: **no funciona** (probado desde Movistar y Digitel: «no puede ser procesado») | — | prensa | — | medio | no cargar | — | — |
| **Bomberos** nacional | no hay número nacional confirmado. Caracas: 0212-542-02-43 / 0212-542-26-23 (El Diario 2026-06-24, **solo prensa**); Carabobo 0424-4022160 (nota de la gobernación, ~noviembre 2026, no abrió); El Espectador menciona 167 (sin fecha, sin confirmar) | — | prensa | — | **bajo / sin confirmar** | `national.ts` (solo 911 + aclaración) | — | — |
| **Protección Civil y Administración de Desastres** | Caracas 0212-575-18-23 y Municipio Libertador 0800-725-3661 / 0212-541-0830 (El Diario 2026-06-24); 0800-PCIVIL1 = **0800-724-8451** (aviso del Ministerio de Interior de 2018, citado por el buscador; no hay confirmación vigente); El Espectador menciona 166; Infobae menciona 0800-558842 | — | prensa | — | **bajo / sin confirmar**, **contradicciones entre fuentes** (166, 0800-724-8451, 0800-558842) | `national.ts` | chico | `pcivil.gob.ve` rechaza la conexión (hoy) |
| **FUNVISIS (sismos): 0800-TEMBLOR = 0800-836-2567** | `http://www.funvisis.gob.ve/index.php` (enlace `tel:08008362567` en la página); también El Diario 2026-06-24 | sin licencia explícita | HTML | 2026-11-19 | **oficial** (de la página de FUNVISIS, con fecha de hoy) | `national.ts` (otros) | chico | HTTPS roto, HTTP anda |
| **INAMEH, pronóstico 24 h**: +58 212 535 0971 / 535 0972; `pronosticador@inameh.gob.ve` | `http://www.inameh.gob.ve/web/robolivar.php` (pie de página) | derechos reservados (solo el texto de la página; el teléfono es un dato) | HTML | 2026-11-19 | **oficial** | — | chico | — |
| **Cruz Roja Venezolana**: sin línea nacional de emergencia hallada. 41 filiales con teléfono (ej. Caracas +58 212 571 4380; Maracay +58 243 553 2629; Mérida +58 274 263 2219; Maracaibo +58 261 798 6455) en `https://cruzroja.ve/nuestra-presencia/` | `https://www.cruzrojavenezolana.org` (redirige a `cruzroja.ve`) | sin licencia explícita | HTML | 2026-11-19 | **oficial** (filiales); línea nacional: **no encontrada** | `national.ts`, radio | mediano (elegir cuáles mostrar) | — |
| **Toxicología**: **no hay línea nacional** hallada. El MPPS publica un protocolo (abril de 2026) con la Dirección General de Epidemiología: (0212) 408 01 73/74 y 408 00 60, **que es administrativo, no atención toxicológica**. Existe el Centro Toxicológico Regional Centroccidental «Dra. Elba Luz Bermúdez» (Barquisimeto) y una cifra de 13 centros según OMS (artículo de 2010). **Sin teléfono verificado.** | `https://mpps.gob.ve/wp-content/uploads/2026/04/Protocolo-de-Vigilancia-y-Manejo-Inmediato-de-Intoxicaciones.pdf` (último cambio 2026-04-10, 268 KB) | sin licencia explícita | PDF | 2026-04 | teléfono de toxicología: **no encontrado** | `firstAid/guides/types.ts` | — | pedir al MPPS/Hospital Universitario de Caracas |
| Guías de primeros auxilios del MPPS | no encontradas en `mpps.gob.ve` en esta pasada (el sitio abre: 200, 160 KB; no busqué a fondo) | — | — | — | **no encontrado** | — | — | — |
| Rescate de montaña | INPARQUES: refugio Pico Bolívar-Albornoz, WhatsApp **+58 424 1403088** (`https://www.inparques.gob.ve/andes/picobolivar.html`); INPARQUES central +58 212 273 2811; el refugio dice tener botiquín con oxígeno y guardaparques en temporada alta | «Licencia Creative Commons» en el pie del sitio, **sin decir cuál** | HTML | 2026-11-19 | **oficial** (INPARQUES) | `emergency/` parques, radio | chico | variante CC sin aclarar |

Dudas: no hay página oficial legible con la lista de teléfonos; las de prensa difieren. Propuesta: cargar **911** como número principal y poner Protección Civil/bomberos solo «sin confirmar» o dejarlos afuera.

---

## 2. Servicios cercanos: OpenStreetMap y HDX

Medición real el 2026-11-19 con consultas livianas a Overpass (`amenity=...`, área `ISO3166-1=VE`, `nwr`, `out count`) y encabezados de Geofabrik.

| dato | cantidad / valor | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|---|
| Extracto Geofabrik | **128.765.710 bytes (~123 MiB)** `venezuela-261118.osm.pbf` | `https://download.geofabrik.de/south-america/venezuela-latest.osm.pbf` (redirige al del 18-nov) | ODbL, © OpenStreetMap contributors | PBF | diaria | alto | `tools/services-data/build.mjs` | chico | — |
| Hospitales | **835** (45 con teléfono) | Overpass | ODbL | JSON | continua | medio | `services` | chico | — |
| Clínicas + consultorios (`clinic|doctors`) | **1.176** | Overpass | ODbL | JSON | — | medio | `services` | chico | — |
| Policía | **1.008** | Overpass | ODbL | JSON | — | medio | `services` | chico | — |
| Bomberos | **203** | Overpass | ODbL | JSON | — | medio | `services` | chico | — |
| Surtidores | **1.354** (solo **9 con teléfono**) | Overpass | ODbL | JSON | — | medio (hay que revisar la marca/estado: subsidio y escasez) | `services`, `MIN_FUEL.VE` | chico | — |
| Cajeros | **184** | Overpass | ODbL | JSON | — | bajo-medio (poco para un país de 28 millones; muchos no entregan efectivo) | `services` | chico | — |
| Farmacias | tengo **229 con teléfono**; el conteo total **no pude medirlo** (Overpass falló tres veces por carga) | Overpass | ODbL | JSON | — | medio | `services` | chico | Overpass saturado |
| Refugios (`amenity=shelter`) | **305** | Overpass | ODbL | JSON | — | bajo (incluye paradas y refugios de montaña) | `services` | chico | — |
| Agua potable | **58** | Overpass | ODbL | JSON | — | bajo (débil, como Paraguay) | `services` | chico | — |
| Desfibriladores (`emergency=defibrillator`) | **0** | Overpass | ODbL | JSON | — | — | `services` | — | no hay dato |
| Refugios de alta montaña (`tourism=alpine_hut`) | **24** | Overpass | ODbL | JSON | — | medio | mapa | chico | — |
| Veterinarias, talleres, gomerías | **no medido** (Overpass saturado) | — | — | — | — | — | — | — | — |
| HDX Healthsites (OSM) | `venezuela-healthsites`, 90 días; GeoJSON 4,3 MB, CSV 0,8 MB | `https://data.humdata.org/dataset/venezuela-healthsites` | **ODbL** | GeoJSON/CSV/SHP | cada 90 días (último 2026-09-29) | medio-alto | `services` | chico | — |
| HDX HOT: salud, servicios financieros, aeropuertos, puertos, lugares poblados | `hotosm_ven_health_facilities`, `hotosm_ven_financial_services`, `hotosm_ven_populated_places`… (GeoJSON de 0,2 a 0,5 MB) | `https://data.humdata.org/dataset/hotosm_ven_health_facilities` | **ODbL** | GeoJSON/GPKG/KML | cada 30 días (2026-11-03) | medio-alto | `services` | chico | — |
| HDX evaluación rápida de establecimientos de salud tras el terremoto | `venezuela-earthquake-rapid-assessment-of-health-facilities` (2026-07-14) | `https://data.humdata.org/dataset/venezuela-earthquake-rapid-assessment-of-health-facilities` | no revisé la licencia (el listado la muestra vacía) | — | puntual | medio | solo para entender daños | — | — |
| HDX Overture: instalaciones de emergencia en Caracas | `hot_overture_ven_emergency_facilities` (2026-06-25) | `https://data.humdata.org/dataset/hot_overture_ven_emergency_facilities` | licencia no revisada (Overture es CDLA/ODbL) | — | puntual | medio | — | — | — |

Lectura: **hay datos suficientes para sumar el país** con el mismo `build.mjs`. Mismo orden de magnitud que Paraguay en bomberos (203 vs 87), mejor en policía y hospitales. Faltan teléfonos (9 de 1.354 surtidores). OSM de la zona del terremoto puede estar desactualizado o haber sumado marcas posteriores; correr de nuevo antes de publicar.

---

## 3. Radioafición y comunicaciones

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| Asociación nacional: **Radio Club Venezolano (RCV)**; administra la Red Nacional de Emergencia | Wikipedia (`wikipedia.com/wiki/Radio_Club_Venezolano`) y The Objective 2026-07-01 (`theobjective.com/tecnologia/2026-07-01/tecnologia-comunicados-venezolanos-90-red/`). **No encontré su sitio oficial**: `radioclubvenezolano.org` es un portal de noticias ajeno | — | prensa | — | medio (2 fuentes de prensa) | `RadioPage.tsx` | chico | — |
| Red Nacional de Emergencia: **VHF, HF 7.135 MHz y DMR**; se mencionó a la Cruz Roja como contacto | The Objective 2026-07-01 (una sola fuente) | — | prensa | tras el terremoto | **sin confirmar** (una sola fuente, de prensa) | radio | chico | — |
| Bandas de radioaficionados por categoría (A: HF 160/80/40/15/10 m, 6 m, 220 MHz, 23 cm; no 2 m ni 70 cm; potencia máx. HF 200 W, VHF 25 W, UHF 5 W) | `https://conatel.gob.ve/wp-content/uploads/2024/08/reglamento-servicio-radioaficionados.pdf` (PDF de 180 KB, creado en enero de 2017, subido en 2024). En 40 m el segmento **7.100–7.150 kHz** está marcado «Fonia, Servicio de Radioaficionados de Emergencia» (coincide con el 7.135 de la red) | normativa pública (sin licencia explícita) | PDF | desactualizado (2017) | **oficial pero antiguo** (la categoría A no tiene 2 m; las categorías B y superiores sí, no las leí todas) | texto de ayuda en `RadioPage` | chico | — |
| Listado de repetidoras | **no encontrado** (solo páginas antiguas de qsl.net de los años 80: 146.970 -600 kHz Cerro El Volcán, 147.180 +600 kHz El Junquito, Ávila 147.000/147.600; **desactualizado, no usar**) | qsl.net | HTML | 1982–1984 | bajo | — | — | — |
| Frecuencias de montaña/rescate | **no encontradas** en ninguna fuente | — | — | — | — | — | — | — |
| Banda ciudadana, canales de uso libre | el Reglamento de la CONATEL menciona «Coordinación de Banda Ciudadana y Radioaficionados»; no extraje los canales | — | PDF | — | no verificado | — | — | — |
| Regla para VikArg | no mostrar repetidoras de Venezuela; mostrar solo 7.135 MHz «sin confirmar» y las bandas del reglamento con su fecha | | | | | | | |

---

## 4. Parques nacionales y áreas protegidas

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| Sitio oficial de INPARQUES: parques nacionales, monumentos, parques de recreación, refugios; trámites por estado | `https://www.inparques.gob.ve` (200, 118 KB, `last-modified` 2026-11-11) | pie del sitio: «Licencia Creative Commons» (**variante sin declarar**: duda anotada) | HTML | ocasional | oficial; pero hay **textos que parecen redactados con asistencia** y deben tomarse con cuidado | `emergency/data.ts` | mediano | — |
| **Límites** en GeoJSON/Shapefile | **no encontrados** en INPARQUES. Alternativa: OSM `boundary=protected_area` / `national_park` (medido: **68** `boundary=protected_area` y **105** `boundary=national_park`; se superponen y hay que depurar, sin comprobar contra la lista de INPARQUES) | ODbL | JSON | continua | medio | `parks-VE.json` | mediano | — |
| WDPA/Protected Planet | **NO** (prohíbe redistribuir en apps); solo como lista de control | no comercial | — | — | — | — | — | — |
| Contacto: INPARQUES central +58 212 273 2811, Edificio Sur del Museo del Transporte, Caracas | `https://www.inparques.gob.ve/Parques%20Nacionales/canaima2.html` | — | HTML | 2026-11-19 | oficial | parques | chico | — |
| **Pico Bolívar / Sierra Nevada**: «Registro y control obligatorio» para expedicionarios a los picos glaciares: formulario de asunción de riesgo, inspección de equipo por guardaparques, ruta y cronograma | `https://www.inparques.gob.ve/tramites.html` | CC (sin variante) | HTML | 2026-11-19 | oficial (en el sitio nuevo) | texto del parque | chico | — |
| Refugios de alta montaña de Mérida: **Pico Bolívar-Albornoz** (4.814 m, 15 plazas, 8,5351732 N, 71,0481693 O, WhatsApp +58 424 1403088; solar, internet satelital, botiquín con oxígeno), La Culata y Chorro de Humo (Pico Humboldt «próximamente»); reservas en `reservacionesoficial.inparques.gob.ve` | `https://www.inparques.gob.ve/refugiosdelosandes.html`, `.../andes/picobolivar.html` | CC | HTML | 2026-11-19 | oficial | mapa/refugios | chico | no abrí el sitio de reservas |
| **Roraima / Canaima**: el sitio dice que el turismo es guiado por comunidades Pemón; no encontré el requisito exacto de permiso. Las notas oficiales de INPARQUES solo detallan permisos de investigación. Cerro Autana: acceso solo vía operadoras registradas, permiso fluvial | `.../tramites.html`, `.../Parques%20Nacionales/canaima2.html` | CC | HTML | — | **parcial**; falta el trámite para turistas | texto del parque | — | — |
| Cantidades (según OSM) | 68 `protected_area` + 105 `national_park` (con superposición posible) | Overpass | ODbL | — | — | bajo-medio | `parks-VE.json` | mediano | — |

---

## 5. Límites y contexto geográfico

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| Admin-1: **26 unidades** (23 estados, Distrito Capital, Dependencias Federales, Isla de Aves sin nombre, `iso_3166_2 = VE-X01~`) | `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson` (40,7 MB; bajado hoy) | dominio público | GeoJSON | rara | alto | `tools/geo-data/build.mjs` (`COUNTRIES.VEN = 'VE'`) | chico | — |
| Nombres: `name_es` viene vacío para varios; «Estado Vargas» y «Capital» hay que normalizar a **La Guaira** y **Distrito Capital** (Vargas se renombró La Guaira) | idem | — | — | — | alto | `geo-data` | chico | — |
| **Guayana Esequiba**: Natural Earth la asigna a **Guyana** (por ejemplo `Cuyuni-Mazaruni`, `Potaro-Siparuni`); Venezuela la reclama como «Zona en Reclamación» y el INAMEH la menciona en su pronóstico. **Decisión del proyecto** (política de mapas): VikArg usa Natural Earth para los otros países | — | — | — | — | — | — | — | — |
| COD-AB oficial (HDX): `cod-ab-ven` niveles 0 a 3 (estados, municipios, parroquias), fuente INE 2017/2018, última revisión 2024-02 | `https://data.humdata.org/dataset/cod-ab-ven` (CKAN API leída hoy; SHP 18,8 MB, GeoJSON 17,5 MB, GDB 8,8 MB, XLSX 0,3 MB; modificado 2026-08-14) | **CC BY-IGO** | SHP/GeoJSON | cada 365 días | alto | si se quieren municipios | mediano | — |
| Lugares poblados (INE) | `https://data.humdata.org/dataset/venezuela-populated-places` (2021-12-14, SHP 0,6 MB) | CC BY | SHP | anual | medio (2021) | capitales | chico | — |
| Capitales estatales | sacar de OSM `place=city/town` o del SHP del INE | ODbL / CC BY | — | — | — | `geo-data` | mediano | — |
| **Zona horaria IANA: `America/Caracas`**, UTC-4 todo el año. Historial de tzdata: UTC-4 hasta 2007-12-09; **UTC-4:30 hasta 2016-05-01**; desde entonces UTC-4 | `/usr/share/zoneinfo/tzdata.zi` del servidor (verificado) | dominio público | tzdata | — | alto (dispositivos con tzdata anterior a 2016 pueden dar -4:30) | `settings.ts` → `detectCountry()` agregar `America/Caracas` | chico | — |
| Huso UTM: Venezuela cubre **zonas 18N, 19N y 20N** (de 73,4 O a 59,8 O; la mayor parte en 19N y 20N). Valor de longitudes: 18N (78 O a 72 O), 19N (72 O a 66 O), 20N (66 O a 60 O). Es cálculo propio, no una fuente | cálculo propio | — | — | — | medio (a confirmar con IGVSB) | `maps/print` | chico | — |
| Datum oficial: **SIRGAS-REGVEN**, época 1995,4 (adopción en 1999, ratificada por decreto: «Cambio de Datum» en la lista de documentos del IGVSB; antes PSAD56/La Canoa). **No pude abrir el decreto**; sin confirmar el texto | `https://igvsb.gob.ve/documentos` (lista), `https://igvsb.gob.ve/servicios_geodesicos` (menciona «Red Geodésica de Venezuela 1995» y REMOS) | — | HTML | — | medio | `maps/print` (usar WGS84; la diferencia con SIRGAS es del orden de centímetros) | chico | — |
| Teléfono país | +58; los de Caracas 0212; móviles 0412/0414/0424/0416/0426 | — | — | — | alto | formato | chico | — |

---

## 6. Meteorología y alertas

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| **INAMEH** (sitio): `http://www.inameh.gob.ve/web/` abre en HTTP (302 de `/` a `web/`); **el HTTPS falla** (el certificado es propio y dice `CN=inameh.gob.ve`; con `www.` no coincide; no se saltea) | `http://www.inameh.gob.ve/web/` | pie: «INAMEH, Todos los Derechos Reservados» (**derechos reservados: no copiar textos ni imágenes; los datos numéricos son hechos**) | HTML + PDF | diaria | oficial, continuidad dudosa | — | — | HTTPS inválido |
| **Pronóstico 24 horas** (PDF con situación general y tabla por región) | `http://www.inameh.gob.ve/web/PDF/Pronostico%2024%20horas.pdf` (260 KB, `Last-Modified` 2026-11-19 09:00 GMT; texto de ejemplo en el anexo) | derechos reservados | PDF | **diario** | oficial | texto opcional en el clima | mediano (leer PDF) | — |
| Alertas oficiales en CAP/RSS/JSON | **no existen** en el sitio de INAMEH (menú: pronóstico 24 h, discusión sinóptica, precipitación estimada, oleaje, climatología, ENOS, hidrología, riesgo de incendios). Venezuela no figura en el registro de alertas CAP de la OMM (no verificado hoy) | — | — | — | — | `alerts` | — | — |
| Estaciones y observaciones abiertas | no hay API; el sitio muestra temperaturas máx/mín de 15 ciudades en HTML | — | HTML | diaria | medio | — | grande | — |
| Radares | **no hay imágenes públicas verificadas** (INAMEH no lista radar; sección «precipitación estimada» con imágenes de satélite) | — | — | — | no encontrado | — | — | — |
| Protección Civil | sitio caído | — | — | — | — | — | — | conexión rechazada |
| Respaldo internacional | **Open-Meteo** (probado: Caracas, 24,6 °C a las 10:45 local, 2026-11-19); modelos globales; GloFAS (punto 7); NASA FIRMS para focos de calor | Open-Meteo CC BY 4.0 (uso no comercial gratis, hay interruptor para copia paga ya en el proyecto) | JSON | horaria | alto | clima, lluvia, rayos (GLM de GOES-19 cubre el país) | chico | — |
| Redes sociales de INAMEH (X, Facebook, Instagram `@inamehoficial`) publican los avisos; prensa los reproduce (La Patilla 2026-11-13 y 11-14) | prensa | — | — | — | — | — | — | — |

---

## 7. Ríos e hidrología

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| **Pronóstico de nivel del Orinoco en Ciudad Bolívar**: serie de 15 días (observado y pronóstico con límites inferior/superior, y máximo/medio/mínimo histórico) | `http://www.inameh.gob.ve/web/PDF/Pronostico%20de%20Niveles%20en%20Ciudad%20Bolivar%20del%20Rio%20Orinoco.pdf` (98 KB, **2026-11-18**; ejemplo en el anexo) | derechos reservados (datos numéricos: hechos; no copiar gráficos) | PDF | **diario** | oficial; **bueno** | `server/src/rivers/ve.ts` (nuevo, igual que `bo.ts`) | mediano | — |
| Pronóstico de Caicara | `.../Pronostico%20de%20Niveles%20en%20Caicara,%20Rio%20Orinoco.pdf` (126 KB, **2026-11-18**) | idem | PDF | diario | oficial | idem | mediano | — |
| Comportamiento actual: Orinoco en **Caicara** (2026-11-18), **Puerto Ayacucho** (2026-11-18), **Palúa** (2026-11-11), **Apure en San Fernando** (2026-09-13), **Ciudad Bolívar** (¡`Last-Modified` 2025-03-18: **desactualizado**!) | `http://www.inameh.gob.ve/web/PDF/Rio%20Orinoco%20en%20Caicara.pdf` etc. | idem | PDF | **irregular** | oficial; **cada río con una fecha distinta** | idem | mediano | — |
| Pronósticos viejos: Puerto Ayacucho (2025-02-06), San Fernando de Apure (2024-09-08) | idem | — | — | **desactualizados** | bajo | no cargar | — | — |
| **Boletín hidrológico mensual** (octubre de 2026): tabla diaria de 6 estaciones (Ciudad Bolívar, San Fernando, Puerto Ayacucho, Caicara, Palúa, Caroní) | `http://www.inameh.gob.ve/web/PDF/BOLETIN%20HIDROLOGICO%20MENSUAL%20%20OCTUBRE%202026.pdf` (2,9 MB, 2026-11-04) | idem | PDF | **mensual** | oficial | contexto, histórico | mediano | — |
| Cotas de alerta/umbrales | solo **cota de desborde** como línea en el gráfico del PDF de Ciudad Bolívar; **no hay tabla de umbrales** de nivel | — | gráfico | — | bajo | — | — | — |
| **Errores en los PDF**: el de Ciudad Bolívar da coordenadas **8,1333 N, -65,5333 O**; la ciudad está en ~63,55 O (el PDF tiene un error de 2 grados de longitud). El de Apure da **coordenadas UTM** (E 668.242 N 873.760) sin huso. El boletín da «0,00» en San Fernando de Apure en octubre (probable falta de dato) | los PDF | — | — | — | — | usar coordenadas propias de OSM | — | — |
| Otras estaciones (Caroní, Guri, Meta, Arauca, Zulia, Catatumbo) | **no encontradas** abiertas | — | — | — | — | — | — | — |
| **GloFAS (Open-Meteo Flood API)**: caudal modelado diario. Probado: celda 8,175 N, 63,575 O (Orinoco en Ciudad Bolívar) = **15.274 m³/s** el 2026-11-19; la celda a 0,05 grados que cae fuera del cauce da 0. Hay que **elegir la celda sobre el río** | `https://flood-api.open-meteo.com/v1/flood?latitude=8.15&longitude=-63.55&daily=river_discharge` | datos GloFAS (Copernicus/CEMS, licencia CC BY 4.0 o equivalente de Copernicus: no verificada hoy); servicio de Open-Meteo CC BY 4.0, uso no comercial | JSON | diaria | medio (modelo, no medición) | ríos, mapa de clima | chico | — |
| GRDC | no verificado hoy (datos con registro y condiciones propias) | — | — | — | — | — | — | — |

---

## 8. Mareas y mar

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| Servicio de Hidrografía, Oceanografía, Meteorología y Cartografía Náutica (SHN) | `https://iho.int/uploads/user/Inter-Regional%20Coordination/RHC/MACHC/MACHC25/MACHC25_2024_06.15_SP_REPORTE_NACIONAL_Venezuela.pdf` (informe nacional 2024) | OHI | PDF | — | oficial (descripción) | — | — | — |
| Sitio del SHN | `sho.gob.ve`: **el nombre no resuelve** (hoy, error 6 de DNS); no encontré otro dominio oficial | — | — | — | — | — | — | **caído / no encontrado** |
| Tablas de marea oficiales | **no encontradas** (búsqueda del 2026-11-19: solo sitios comerciales: `tidechecker.com`, `cabaigne.net`, `searates.com`) | — | — | — | — | — | — | — |
| Mareógrafos IOC (`sealevelmonitoring.org`, lista de 1.910 estaciones bajada hoy, 1,9 MB): **0 estaciones de Venezuela**. Cercanas: Ballenas y Puerto Bolívar (Colombia), Bullen Bay (Curazao), Galeota y Port of Spain (Trinidad), Prickly Bay (Granada) | `https://www.ioc-sealevelmonitoring.org/service.php?query=stationlist&showall=a` | datos IOC (condiciones de uso propias; ya usado en el proyecto) | JSON | tiempo real | alto (la ausencia) | `tools/tide-data` | — | — |
| PSMSL: La Guaira y Puerto Cabello (series antiguas) | `https://psmsl.org/data/obtaining/stations/705.php` (aclara «no es calidad de investigación») | PSMSL | HTML | — | bajo | — | — | — |
| Tsunamis | alertas de PTWC/NOAA (`tsunami.gov`) para el Caribe; FUNVISIS enlaza `https://www.tsunami.gov`; tras el terremoto de junio el sistema de alerta de tsunamis de EE. UU. dio la magnitud de 7,5 | NOAA, dominio público | — | tiempo real | medio | `weathermap` | chico | — |
| Armónicos de marea para La Guaira/Puerto Cabello | hoy **no los hay** en el proyecto (ver `tools/tide-data`): habría que modelar desde TPXO/FES o pedir al SHN | — | — | — | — | `tides` | grande | — |

Veredicto: **mareas sin cubrir** con fuente oficial; costa del Caribe sin mareógrafos de la IOC.

---

## 9. Volcanes y sismos

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| **Feed de FUNVISIS** (`maravilla.json`): FeatureCollection con **los últimos 20 sismos**; hoy cada ítem trae `lat`/`long`, y en campos que no corresponden: `phone`=magnitud, `city`=hora, `postalCode`=fecha dd-mm-aaaa, `state` y `phoneFormatted`=profundidad, `address`=localización textual («40 km al suroeste de Bucaramanga»). Cabecera `Last-Modified` = hora de la consulta; 6.433 bytes; sin documentación | `http://www.funvisis.gob.ve/maravilla.json` (lo consume `/assets/mapa-leaflet/js/map.js` de su página principal) | **sin licencia explícita** | JSON (GeoJSON mal rotulado) | tiempo real (el servidor lo regenera) | oficial pero **no documentado**: puede cambiar sin aviso | `weathermap` sismos | mediano (parser defensivo) | HTTPS no responde; usar HTTP |
| Sismos en el catálogo del USGS | `https://earthquake.usgs.gov/fdsnws/event/1/query` (probado hoy) | dominio público | GeoJSON | tiempo real | alto | `weathermap` (ya existe) | — | — |
| Cantidad reciente: 96 eventos M2,5+ entre 2025-11-19 y 2026-11-19 (51 desde el 2026-06-24) en el recuadro 0–13 N, 74–59 O (incluye Colombia/Caribe) | `.../fdsnws/event/1/count?...` | — | texto | — | alto | — | — | — |
| Boletines semanales de FUNVISIS (103 a 122 sismos por semana, agosto–octubre de 2026) | prensa (El Diario, La Patilla, NTN24) | — | — | semanal | medio | — | — | — |
| Catálogo histórico, «Observatorio Nacional de Sismos», «Atlas Sismológico» | enlaces en `http://www.funvisis.gob.ve/index.php` y `atlas_sis.php` (200); no los exploré a fondo | — | HTML/PDF | — | — | — | — | — |
| Volcanes | GVP/Smithsonian: **0 volcanes holocenos en Venezuela** (WFS, recuadro del país, hoy); OSM `natural=volcano`: no medido | GVP: gratuito, términos del Smithsonian | JSON | — | alto | `geo-data` | — | — |
| Volcanes en la zona cercana: Soufrière (San Vicente, última erupción 2021) y Kick 'em Jenny (Granada, 2017): no están en territorio venezolano | GVP | — | — | — | alto | — | — | — |

---

## 10. Geología, vegetación y ecorregiones

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| Geología: **Macrostrat** (fuente 1087, «Geological Map of South America 2018», 1:5.000.000) responde para Venezuela (consulta de prueba en el Pico Bolívar) | `https://macrostrat.org/api/v2/geologic_units/map?lat=8.54&lng=-71.05&scale=small` | **CC BY 4.0** (la API lo dice) | JSON / MVT | — | medio (escala 1:5M) | `geology` (igual que Bolivia y Paraguay) | chico | — |
| Geología digital del USGS: Data Series 199, «Digital geologic map and GIS database of Venezuela», 1:750.000 (ZIP de 45 MB, geodatabase) | `https://pubs.usgs.gov/ds/2006/199/` | dominio público (producto USGS; los autores avisan que no es fiable a escalas mayores que 1:750.000) | GDB | estática | medio | alternativa mejor que Macrostrat | mediano (convertir GDB; no se descargó) | — |
| INGEOMIN (oficial) | **sin descarga abierta hallada** (no revisé `ingeomin.gov.ve` directamente) | — | — | — | — | — | — | — |
| Ecorregiones: RESOLVE 2017 es global; cubre Venezuela (sin volver a abrir el archivo de 150 MB) | `https://storage.googleapis.com/teow2016/Ecoregions2017.zip` | CC BY 4.0 | SHP | — | alto | `tools/eco-data/build.mjs` | chico | — |
| Cobertura vegetal/uso de suelo | no encontré fuente oficial abierta. Candidatos globales (no verificados hoy): ESA WorldCover (CC BY 4.0), MapBiomas Amazonía/RAISG | — | — | — | — | — | — | — |

---

## 11. Huerta y agricultura

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| Calendario de siembra oficial por región | **no encontrado** (búsqueda del 2026-11-19). Existe un calendario de siembra de **un solo estado (Carabobo)** hecho con estaciones de INAMEH y zonificación agroclimática (repositorio de la UNIA, `dspace.unia.es/bitstream/handle/10334/3766/978-84-7993-324-1_144.pdf`, licencia no revisada) | no revisada | PDF | — | bajo (una región) | `garden/calendar.ts` | — | — |
| Boletines INIA 2026 (`inia.gob.ve/wp-content/uploads/2026/…/Boletin-INIA-NN.pdf`) | informes de actividades, **sin fechas de siembra** | sin licencia explícita | PDF | semanal | — | no sirve | — | — |
| Zonas agroecológicas: «Sistema de Información de las Áreas Agroecológicas (SIAA)» del INIA, citado en un artículo de 2016 | no encontré un acceso | — | — | — | — | — | — | — |
| Producción FAOSTAT para Venezuela | `https://data.humdata.org/dataset/ven-faostat-crops-livestock-production` | CC BY-IGO (típico HDX; no revisado) | CSV | — | — | no es un calendario | — | — |
| Recomendación | **no inventar**: dejar la huerta sin recomendaciones, o reutilizar una zona parecida **marcada como aproximada** como en Paraguay (`nea`); Venezuela es tropical con dos estaciones (lluviosa/seca), sin heladas salvo en los Andes altos | | | | | | | |

---

## 12. Mapas y relieve sin conexión

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| IGVSB (Instituto Geográfico de Venezuela Simón Bolívar): `https://igvsb.gob.ve/` abre (200, 45 KB; `www.` da error de certificado, 60). Servicios: mapas físicos y políticos por estado (PDF), **«Capas Vectoriales»**, índices de hojas topográficas, mapoteca, «servicio API mapoteca» | `https://igvsb.gob.ve/servicios_cartograficos`, `.../servicio_api_mapoteca` | no explorada (la lista de enlaces no mostró licencia) | HTML/PDF | — | oficial; **licencia y descarga no verificadas** | — | — | no seguí (no hice descargas) |
| Mapa base: OpenFreeMap/OSM global (Geofabrik 123 MiB; ver punto 2) | — | ODbL | — | — | alto | ya está | — | — |
| Curvas de nivel / DEM nacional abierto | **no encontrado** (el IGVSB ofrece hojas topográficas, no pude ver si digitales). Alternativa global ya usada por el proyecto (Copernicus DEM / SRTM / AWS Terrain Tiles) | — | — | — | medio | ya está | — | — |
| Aeropuertos (OurAirports) y puertos (HOT) | HDX `ourairports-ven` (CC BY-IGO, CSV 155 KB, 2026-10-06) y `hotosm_ven_sea_ports` | CC BY-IGO / ODbL | CSV | mensual | alto | — | — | — |
| Daño por el terremoto (HDX): vías bloqueadas (2026-08-15), daños a edificios (Sentinel-1), análisis DISHA | `https://data.humdata.org/dataset/venezuela-earthquake-road-blockages` etc. | no revisadas | — | puntual | — | **no usar en la app** (info humanitaria y de otro propósito) | — | — |

---

## 13. Combustible, cajeros y otros servicios

| dato | fuente (URL) | licencia | formato | frecuencia | confianza | módulo | esfuerzo | bloqueos |
|---|---|---|---|---|---|---|---|---|
| Surtidores en OSM: 1.354; con teléfono: 9 | Overpass (punto 2) | ODbL | JSON | — | medio | `services` | chico | — |
| Registro oficial de estaciones de servicio con licencia abierta | **no encontrado** | — | — | — | — | — | — | — |
| Régimen de combustible 2026 (prensa, **sin abrir fuentes oficiales**): gasolina **subsidiada con cupo mensual** (120 litros según una nota de marzo de 2026) y registro en una aplicación; el resto a «precio internacional» (~0,50 US$/litro); en algunos estados el suministro se controla por **placa**; **cronograma semanal de distribución** que publica la prensa (`eldiario.com/2026/10/24/cronograma-distribucion-gasolina-26-de-octubre-al-1-noviembre/`); gasolina premium de 97 octanos en divisas; fin del subsidio total al diésel industrial (julio de 2026); escasez y protestas en estados; mercado negro | El Diario, La Prensa, Bloomberg Línea, Bancaynegocios (2026) | — | — | medio-bajo (las notas se contradicen en fechas y precios) | texto de advertencia en servicios | chico | — |
| Cajeros | OSM: 184. En la práctica muchos cajeros no entregan efectivo y se usa dólar en efectivo/pago móvil (**no verificado con fuente**) | — | — | — | bajo | — | — | — |
| Recomendación | mostrar surtidores de OSM con la leyenda «puede haber escasez, cupos y filas; confirmar» | | | | | | | |

---

## 14. Seguridad y contexto práctico

Solo hechos con fuente; sin abrir fuentes oficiales de los países que emiten advertencias (usé el buscador, a verificar):

- **Terremoto y réplicas** (punto 0): zonas costeras y centrales afectadas, edificios dañados; las réplicas continúan (100 a 120 por semana).
- **Avisos de viaje** (prensa, 2026): EE. UU. bajó el nivel de 4 a 3 en marzo de 2026 (riesgo de secuestro, criminalidad, sanidad); España, abril de 2026 «no viajar salvo necesidad», y el 17 de septiembre de 2026 «extremar la precaución y abstenerse de determinadas zonas» (`exteriores.gob.es`, página no abierta). Grupos armados («colectivos») siguen activos (medio alemán, citado por el buscador). Las fuentes de noviembre de 2025 sobre cierre del espacio aéreo **ya no describen la situación actual**.
- **Montaña**: Pico Bolívar a 4.978 m (el refugio Albornoz está a 4.814 m); el mal de altura se menciona en el botiquín del refugio. **Roraima** 2.810 m: punto triple Venezuela–Brasil–Guyana, ascenso de varios días y comunidades Pemón (INPARQUES). Selva y crecidas: los ríos grandes (Orinoco, Apure) suben de mayo a agosto y bajan en el estiaje; la temporada de lluvias se refleja en el pronóstico del INAMEH (onda tropical).
- **Conectividad**: tras el terremoto se usaron Starlink, SMS por satélite y redes mesh (Bitchat, Guacamaya). No hay cifra oficial de cobertura. Internet y electricidad son inestables (el INAMEH y FUNVISIS tienen sitios que a veces no abren): **por eso la app tiene que funcionar sin conexión**.
- No puedo afirmar nada de restricciones de acceso a parques más allá de las de INPARQUES.

---

## 15. Idioma y localización

| dato | detalle | fuente | confianza | módulo |
|---|---|---|---|---|
| Idioma | español; léxico propio («curiara», «chinchorro», «caraota», «cambur», «onda tropical»); voseo no se usa | — | alto | `locales/es.json` (no hace falta idioma nuevo) |
| Formato numérico | decimal con coma y miles con punto, como el español del proyecto; el INAMEH escribe «8,71» | PDF INAMEH | alto | — |
| Fecha | dd/mm/aaaa (PDF del INAMEH) | — | alto | `maps/print` usa `es-AR`; sirve |
| Unidades | métricas; ríos en **msnm** | INAMEH | alto | — |
| Moneda | **bolívar (VES)**, con un recorte de seis ceros mencionado en 2026 (una nota de prensa, fecha no clara) y uso extendido del dólar | prensa, sin confirmar | bajo | solo si la app muestra precios (hoy no) |
| Prefijo telefónico | +58 | — | alto | formateo |

---

## Preguntas abiertas y pedidos formales

| a quién | qué pedir |
|---|---|
| **VEN 911 / Ministerio de Relaciones Interiores** (contacto: sitio `mpprijp.gob.ve`, directorio) | confirmar cobertura nacional del 911 y los números de bomberos y Protección Civil vigentes; si hay un 0800 nacional |
| **Protección Civil y Administración de Desastres** | confirmar número nacional, y pedir permiso para citar su parte oficial |
| **INAMEH** (`pronosticador@inameh.gob.ve`, +58 212 535 0971; pedir desde `contacto.vikarg@gmail.com`) | autorización por escrito para leer los PDF diarios (pronóstico 24 h y niveles del Orinoco/Apure) con una identificación `VikArg-Prepping-Tools/1.0`, y su licencia (hoy «derechos reservados»); un camino HTTPS válido; si publican alertas en CAP o API; ¿hay otras estaciones (Caroní, Guri, Meta)? |
| **FUNVISIS** | permiso y documentación del feed `maravilla.json`; licencia; confirmar `0800-TEMBLOR` |
| **INPARQUES** | qué Creative Commons es; límites de parques en SHP/GeoJSON con licencia; requisito de permiso para Roraima; teléfonos por parque |
| **IGVSB** | si «Capas Vectoriales» e índices de hojas topográficas se pueden redistribuir; el decreto de datum; huso UTM oficial |
| **SHN (Armada)** | tablas de marea y constantes armónicas de La Guaira y Puerto Cabello; el sitio correcto |
| **Radio Club Venezolano** | sitio oficial, listado de repetidoras, frecuencias de la Red Nacional de Emergencia |
| **Ministerio de Salud (MPPS)** | línea de toxicología; guías de primeros auxilios y su licencia |
| **Overpass** | repetir el conteo de farmacias y veterinarias (fallaron por saturación) o usar `tools/country-data/build.mjs` con el extracto de Geofabrik |

---

## Anexo: ejemplos reales (recortados)

**A. FUNVISIS `http://www.funvisis.gob.ve/maravilla.json` (2026-11-19, 6.433 bytes, 20 ítems; primer ítem)**
```
{"type":"Feature","geometry":{"type":"Point","coordinates":[-73.39,6.88],"marcador":"marker"},
 "properties":{"phoneFormatted":"127.0 km","phone":"2.7","address":"40 km al suroeste de Bucaramanga",
 "city":"06:32","country":"Venezuela","postalCode":"19-11-2026","state":"127.0 km","lat":"6.88","long":"-73.39"}}
```
(interpretación: magnitud 2,7, hora 06:32, fecha 19-11-2026, profundidad 127 km; el sismo era de Colombia, el feed incluye ítems fuera del país).

**B. INAMEH, Pronóstico de niveles del Orinoco en Ciudad Bolívar (PDF, realizado el 18/11/2026; validez 19/11 a 3/12/2026), texto extraído**
```
Fecha       Nivel Registrado  Pronóstico  Lím.Inf  Lím.Sup  Máximo  Medio  Mínimo
31/10/2026  10,08                                            13,93   11,72  8,80
18/11/2026   8,71             8,71        8,71     8,71      13,71   10,39  7,62
19/11/2026                    8,74        8,66     8,81      13,66   10,32  7,65
3/12/2026                     9,45        8,66     10,47     12,89    9,37  6,64
```
Nivel en msnm. Corresponde a un río en descenso del máximo anual (13,70 m al 1/10/2026 según el boletín mensual).

**C. INAMEH, Pronóstico 24 horas (PDF `Last-Modified` 2026-11-19 09:00 GMT), primeras líneas**
```
FECHA DE ELABORACIÓN: JUEVES 19 DE NOVIEMBRE DE 2026.
SITUACION GENERAL: Durante la madrugada y la mañana, tendremos cielo poco nublado en la mayor parte del territorio nacional
exceptuando en Delta Amacuro, este de Sucre y Falcón, norte de Amazonas y lago de Maracaibo ...
Región Andes (Trujillo, Mérida y Táchira): Nubosidad fragmentada ... lluvias o lloviznas dispersas
```

**D. INAMEH, Río Orinoco en Ciudad Bolívar (0870), PDF viejo (18/03/2025)**: «Latitud = 8,1333, Longitud = -65,5333» (error de longitud), «Nivel máximo histórico: 25 de agosto de 2018 con 18,34 msnm; mínimo: 17 y 18 de marzo de 1959 con 1,58 msnm».

**E. HDX COD-AB Venezuela (`package_show?id=cod-ab-ven`)**: licencia «CC BY-IGO», fuente «Instituto Nacional de Estadística», recursos `ven_admin_boundaries.geojson.zip` (17.451.359 bytes), `.shp.zip` (18.822.230), `.gdb.zip` (8.799.519), `.xlsx` (276.295), modificado 2026-08-14.

**F. Terremoto, USGS FDSN**: `M 7.5 - 20 km W of Catia La Mar, Venezuela [-67.2205, 10.5955, 10]` y `M 7.2 - 20 km E of San Felipe, Venezuela [-68.5564, 10.3713, 10]` (época 1782338704 s).

**G. Zona horaria (tzdata del servidor)**: `Z America/Caracas -4:27:44 LMT 1890; -4:27:40 CMT 1912 F 12; -4:30 1965; -4 2007 D 9 3; -4:30 2016 May 1 2:30; -4`.

**H. GloFAS (Open-Meteo)**: `latitude 8.175003, longitude -63.57499, river_discharge [15274.66, 15065.07, 14824.18]` (m³/s, 3 días desde 2026-11-19).

**I. IOC**: 1.910 estaciones en la lista; `country=="VEN"` → 0.

**J. Overpass (2026-11-19)**: cajeros 184; hospitales 835; policía 1.008; bomberos 203; surtidores 1.354; clínicas+doctores 1.176; refugios 305; agua potable 58; desfibriladores 0; alpine_hut 24; surtidores con teléfono 9; farmacias con teléfono 229; hospitales con teléfono 45.

**K. INPARQUES refugio Pico Bolívar-Albornoz**: «Capacidad: 15 personas, Latitud: 8.5351732, Longitud: -71.0481693, Altitud: 4.814 msnm, Whatsapp: +58 424 1403088».

**L. Fallas anotadas (2026-11-19, desde este servidor)**: `ven911.gob.ve` (timeout y conexión rechazada), `pcivil.gob.ve` (conexión rechazada al 190.201.248.251), `proteccioncivil.gob.ve` y `sho.gob.ve` (no resuelven), `funvisis.gob.ve` HTTPS (falla TLS), `inameh.gob.ve` HTTPS (certificado propio que no coincide con `www.`), `www.igvsb.gob.ve` (certificado inválido; `igvsb.gob.ve` sin `www` anda). No se saltearon: se usó el HTTP/URL alternativa que el propio sitio ofrece, sin `-k` ni proxies.

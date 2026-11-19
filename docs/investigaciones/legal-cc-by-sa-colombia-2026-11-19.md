# Datos hidrológicos del IDEAM (datos.gov.co) bajo CC BY-SA 4.0: qué implica para VikArg

**Esto no es asesoramiento legal definitivo.** Es un análisis de riesgos con borradores. Cada punto dice si es **SEGURO** (sale del texto de la licencia o de la ficha oficial, verificado el 2026-11-19), **OPINIÓN** (interpretación razonable pero discutible) o **NO SÉ**. Antes de publicar, lo valida un abogado matriculado (lista en el §5).

## 0. Lo verificado

- **SEGURO (ficha oficial, API `https://www.datos.gov.co/api/views/<id>.json`, 2026-11-19):** los tres conjuntos tienen `licenseId: CC_40_BY_SA` («Creative Commons Attribution | Share Alike 4.0 International», `termsLink` al legalcode 4.0). Campo `attribution`: **«Instituto de Hidrología, Meteorología y Estudios Ambientales - IDEAM, Bogotá D.C.»**, con `attributionLink` `https://www.ideam.gov.co/`. Los conjuntos son:
  - `bdmn-sqnh` «Nivel Instantáneo del Rio» (Subdirección de Hidrología): https://www.datos.gov.co/d/bdmn-sqnh
  - `s54a-sgyg` «Precipitación»: https://www.datos.gov.co/d/s54a-sgyg
  - `hp9r-jxuu` «Catálogo Nacional de Estaciones del IDEAM»: https://www.datos.gov.co/d/hp9r-jxuu
- **SEGURO:** la descripción de cada ficha tiene 8 «cláusulas» del IDEAM: los datos no están validados, son crudos, pueden llegar tarde o tener errores, «el posterior uso e interpretación… queda bajo la exclusiva responsabilidad del portador de los datos» y «no podrán ser utilizados como evidencia jurídica». Funcionan como **aviso de exención de responsabilidad** del licenciante. El §3(a)(1)(A)(iv) de CC BY-SA 4.0 pide conservar ese aviso «si el licenciante lo provee». Encaja con el «informativo, no oficial» de VikArg.
- **SEGURO (legalcode 4.0):**
  - §1(a): el «Adapted Material» es material derivado o basado en el licenciado, y modificado de una forma que requiera permiso según los derechos de autor y derechos afines.
  - §2(a)(2): donde aplican excepciones y limitaciones, la licencia no se aplica.
  - §2(a)(5)(C): no se pueden imponer términos adicionales ni medidas tecnológicas efectivas (DRM) que restrinjan los derechos de quien recibe el material.
  - §2(a)(6): la licencia no permite insinuar aval.
  - §3(a): pide atribución, aviso de licencia con enlace, indicar si hubo modificación y conservar los avisos. Se cumple «de cualquier forma razonable según el medio».
  - §3(b): share-alike sobre el «Adapted Material» que se **comparte** («Share»). La licencia del adaptador tiene que ser BY-SA 4.0 o posterior o una «compatible», con su enlace, y sin restricciones adicionales.
  - §4: si se incluye «todo o una parte sustancial» del contenido de una base en otra base sobre la que hay derechos *sui generis*, esa base (no su contenido individual) es «Adapted Material».
- **SEGURO (página oficial de CC):** las licencias compatibles con BY-SA 4.0 son BY-SA 4.0 o posterior, sus versiones adaptadas a cada país, Free Art License 1.3 y **GPLv3, solo en un sentido** (una adaptación BY-SA 4.0 se puede licenciar bajo GPLv3; al revés, no). **La ODbL no figura.**

## 1. Arquitectura: uso, adaptación y hasta dónde llega el share-alike

### 1.1 Qué es «uso» y qué es «adaptación»

| Paso en VikArg | Calificación | Obligación |
|---|---|---|
| El servidor consulta la API SODA y guarda los valores en SQLite (no se distribuye la base) | Uso / reproducción interna. **SEGURO:** el share-alike solo se dispara al **compartir** (§3(b)) | Ninguna mientras no salga del servidor. Conviene registrar fuente, licencia y fecha |
| Normalizar: unidades, tipos, fechas a UTC, corrección de lat/lon invertidas, filtro por distancia, unión nivel + catálogo (las dos fuentes son del IDEAM y BY-SA) | **OPINIÓN:** si hay algún derecho, es «Adapted Material» (modificado). Corregir datos y unir dos bases se suele tratar como adaptación | Si se comparte: atribución + «modificado» + BY-SA 4.0 sobre **ese** conjunto |
| La API propia (`/api/rivers/co` o similar) entrega esos valores a la app | **SEGURO:** es «Share» (poner a disposición del público) | Atribución completa en la respuesta. El conjunto entregado queda bajo BY-SA 4.0. No sumar condiciones que restrinjan reusar **esos datos** |
| La app muestra valores, listas y gráficos | **OPINIÓN:** mostrar los valores es «Share» del material (con atribución). El gráfico es una presentación de hechos y, si es «Adapted Material», lo es como imagen de esos datos, no como programa | Línea de atribución visible en la pantalla o el gráfico |
| Paquete offline cacheado en el teléfono (`CO-rivers.json` o similar) | **SEGURO:** es distribución («Share») | El archivo lleva adentro sus metadatos de licencia y atribución |
| El código de la app y del servidor que hace todo esto | **OPINIÓN firme:** **no** es «Adapted Material». Es una obra distinta que procesa los datos; los datos no se transforman en código. Además, la GPLv3 es BY-SA-compatible en un sentido, así que tampoco habría choque con la versión GPL | Ninguna sobre el código |

**Matiz importante (OPINIÓN, para el abogado).** Las mediciones (nivel, lluvia, coordenadas) son **hechos** y, en general, no tienen derecho de autor. CC lo dice en su FAQ de datos: «Facts are not subject to copyright». En Colombia y en la Argentina, hasta donde sé, **no existe un derecho *sui generis* sobre bases de datos** como el de la Unión Europea. Las compilaciones se protegen solo si la selección o disposición es original (Decisión Andina 351 en Colombia, sin verificar el texto exacto). Una red nacional completa de estaciones difícilmente tenga originalidad de selección. Si no hay derecho, por el §2(a)(2) la licencia ni siquiera se aplica y el share-alike tendría poco alcance real. **Igual recomiendo cumplirla como si se aplicara del todo**: cuesta poco, el IDEAM la eligió a propósito y es un organismo público con el que conviene llevarse bien.

### 1.2 Sobre qué cae el share-alike

- **Solo sobre el conjunto de datos derivado del IDEAM** que VikArg comparte: respuestas de la API, paquete offline y, si existiera, un archivo exportable.
- **No** sobre el código de la app, del servidor ni de `tools/` (OPINIÓN firme).
- **No** sobre otras capas que solo se muestran **al lado**: el mapa base de OSM, alertas CC BY, ríos de Natural Earth. CC considera que incluir una obra SA sin modificar junto a material ajeno no crea una adaptación (página «ShareAlike interpretation»). OPINIÓN: superponer capas independientes en un mapa entra en ese caso.
- **Sí** sobre cualquier **base unificada** a la que se le meta «todo o una parte sustancial» de los datos del IDEAM, incluidos otros datos propios o ajenos mezclados en los mismos registros (§4(b)). Ahí está el riesgo.

### 1.3 Recomendaciones para achicar el alcance

1. **Conjunto separado.** En el servidor, tablas propias del IDEAM (prefijo `co_ideam_…`) o, mejor, un archivo SQLite aparte. Columnas `source` y `license` en cada tabla. **No guardar en la misma fila** datos del IDEAM junto con datos de otra licencia (umbrales de otra fuente, nombres de río de OSM, ubicaciones corregidas con OSM, «sin licencia declarada»). La base del servidor no se distribuye, pero mantener la separación evita que un export o un endpoint futuro mezcle sin querer.
2. **Endpoint y paquete «puros».** La respuesta de la API y el paquete offline de Colombia llevan **solo** datos del IDEAM (más los campos técnicos propios, que son triviales) y un bloque de metadatos:
   ```json
   "license": {"id": "CC-BY-SA-4.0", "url": "https://creativecommons.org/licenses/by-sa/4.0/",
     "attribution": "Instituto de Hidrología, Meteorología y Estudios Ambientales - IDEAM, Bogotá D.C.",
     "source": ["https://www.datos.gov.co/d/bdmn-sqnh", "https://www.datos.gov.co/d/hp9r-jxuu"],
     "modified": "Adaptado por VikArg: formato, unidades, hora UTC y coordenadas corregidas (en el catálogo, latitud y longitud invertidas)",
     "disclaimer": "Datos crudos sin validar por el IDEAM; informativo, no oficial."}
   ```
3. **Unir en la pantalla, no en la base.** Si hace falta el río de OSM, un umbral de otra fuente o un color de alerta de IDEAM CAP, se combinan **en el teléfono al dibujar**, como capas o campos que se ven juntos, y no se fusionan en un archivo que se distribuya. OPINIÓN: así queda como «colección» y no como adaptación.
4. **No meter datos del IDEAM en archivos de código fuente** (`.ts`, `.json` dentro de `app/src/`) ni en el binario de la app. Que viajen como datos aparte (servidor o `public/data/`). Eso los separa del código con doble licencia (ver §3) y de la DRM de las tiendas.
5. **Sin restricciones adicionales sobre esos datos.** Si los términos del servidor o de la app prohíben «extraer o redistribuir datos», hay que exceptuar los CC BY-SA. Los límites de uso del servidor (cuántos pedidos por minuto) son una condición del **servicio**, no de la licencia de los datos. OPINIÓN: se pueden mantener, más todavía si los datos quedan disponibles por otra vía (la fuente original es pública).
6. **Tiendas y DRM (§2(a)(5)(C)).** OPINIÓN: el riesgo es bajo si los datos no van dentro del binario sino que se bajan del servidor como archivo abierto. Opcionalmente, publicar el conjunto derivado como archivo descargable (por ejemplo, un enlace en Licencias) cierra la discusión. Es el mismo argumento que se usa con la GPL en la App Store, y conviene que lo mire el abogado.
7. **Anotar** en `docs/FUENTES-DE-DATOS.md` qué transformaciones se hacen: lo pide el §3(a)(1)(B).

## 2. Compatibilidad con lo que ya usa VikArg

| Combinación | Mostrar juntos (capas, pantalla, créditos) | Mezclar en una sola base distribuida |
|---|---|---|
| CC BY-SA 4.0 + **dominio público** (Natural Earth, etc.) | Sin problema (SEGURO) | Sin problema: el resultado va BY-SA (SEGURO) |
| CC BY-SA 4.0 + **CC BY 4.0** (SINARAME/SMN, IDEAM CAP, RUNAP, SGC, Open-Meteo) | Sin problema, cada capa con su crédito (SEGURO) | Se puede: CC BY admite cualquier licencia del adaptador, así que el resultado va **BY-SA 4.0** con atribución a las dos fuentes (SEGURO según la tabla de compatibilidad de CC). Igual conviene **no hacerlo**: arrastra datos CC BY al share-alike sin necesidad |
| CC BY-SA 4.0 + **ODbL** (OpenStreetMap) | OPINIÓN: sin problema como capas separadas. El mapa renderizado de OSM es una «Produced Work» de la ODbL (pide aviso de atribución, no impone licencia a la imagen) | **No.** La ODbL no está en la lista de compatibles de CC BY-SA 4.0 (SEGURO), y OSM considera la CC BY-SA incompatible para importar (wiki y minutas del Licensing Working Group de la OSMF). Hasta donde sé no hay camino legal para fusionar las dos en una base que se distribuya. **Que lo confirme el abogado**, pero la regla práctica es clara: **no mezclarlas** |
| CC BY-SA 4.0 + **«sin licencia declarada»** (INA, DMH, CARU, SENAMHI BO…) | Sin problema como fuentes separadas citadas | **No:** VikArg no puede licenciar bajo BY-SA datos ajenos sin licencia |
| CC BY-SA 4.0 + **no comercial** (CC BY-NC-SA, «solo sin fines comerciales») | Sin problema como capas separadas | **No:** licencias incompatibles |
| CC BY-SA 4.0 + **código GPL-3.0-or-later** | — | No aplica: el código no es una adaptación. Aunque lo fuera, BY-SA 4.0 → GPLv3 es compatible en un sentido (SEGURO) |

Caso concreto a evitar: «ubicar mejor una estación del IDEAM con OSM» o «ponerle el nombre del río desde OSM» y guardar eso en el paquete de Colombia. Con la corrección propia de lat/lon invertidas no hay problema: se usan los campos `latitud`/`longitud` del mismo IDEAM.

## 3. Copia paga/institucional y aportes externos

**Copia paga:**
- SEGURO: CC BY-SA 4.0 **permite el uso comercial**. A diferencia de las fuentes «no comerciales» del proyecto, **no hace falta apagar** estos datos en la copia paga.
- La licencia comercial de VikArg (doble licencia) **no puede alcanzar a los datos del IDEAM**: VikArg no es su titular y BY-SA prohíbe sumar condiciones. El contrato o la licencia comercial tiene que decir que **el contenido y los datos de terceros se rigen por su propia licencia y quedan excluidos** de la licencia comercial y de cualquier cláusula de confidencialidad o de no redistribuir.
- La institución puede redistribuir esos datos bajo BY-SA, y eso no se le puede prohibir.
- Si la copia institucional se distribuye cerrada (binario sin la GPL), los datos del IDEAM tienen que seguir separados y accesibles sin DRM (ver §1.3, puntos 4 y 6).
- En la App Store, si la cuenta es de la escuela, la escuela pasa a ser quien «comparte»: el contrato le traslada la obligación de mantener la atribución.

**Aportes externos (CONTRIBUTING.md, BORRADOR pendiente de abogado; no lo modifiqué):**
- El acuerdo de contribución le da al titular una licencia para sublicenciar comercialmente **lo que es del colaborador**. Un colaborador no puede otorgar derechos sobre datos del IDEAM.
- **Sugerencia para el abogado** (no tocar el texto sin su revisión): agregar algo como «Los datos y contenidos de terceros incluidos en una contribución no forman parte de esta licencia; se aportan bajo su licencia original, en archivos separados y con su fuente, licencia y fecha anotadas en `docs/FUENTES-DE-DATOS.md`».
- También conviene que el punto 4 del acuerdo («tu contribución se publica bajo GPL-3.0-or-later») aclare que eso vale **para el código**, no para los datos de terceros.

## 4. Textos de atribución (BORRADOR)

Sigue el tono de lo que ya hay: `navigation.pyRivers.source` y `uyRivers.source` («Datos: … Informativo, no es una alerta oficial.»), `sinarameCredit` y `licenses.credit.*`.

**Qué cubre del §3(a):**
- creador y a quién atribuir (IDEAM, con el texto exacto del campo `attribution`);
- aviso de licencia con enlace;
- indicación de modificación;
- fuente (URL del conjunto, o un enlace a la pantalla de Licencias que la tenga: lo admite el §3(a)(2));
- conservación del aviso de exención («sin validar»);
- falta de aval (§2(a)(6));
- «informativo, no oficial».

No hay aviso de *copyright* explícito provisto por el licenciante, así que no hace falta inventar un «©».

### 4(a) Línea en la pantalla o el gráfico (una frase)

En la pantalla, «CC BY-SA 4.0» va como **enlace** a https://creativecommons.org/licenses/by-sa/4.0/ y «IDEAM» puede enlazar a la ficha de datos.gov.co.

- **es:** «Datos: IDEAM (Instituto de Hidrología, Meteorología y Estudios Ambientales de Colombia), en datos.gov.co, CC BY-SA 4.0; adaptados por VikArg, sin aval del IDEAM. Datos crudos sin validar y con días de atraso: informativo, no es una alerta oficial.»
- **en:** «Data: IDEAM (Colombia's Institute of Hydrology, Meteorology and Environmental Studies), via datos.gov.co, CC BY-SA 4.0; adapted by VikArg, not endorsed by IDEAM. Raw, unvalidated data, several days behind: informational, not an official alert.»

Variante corta para la leyenda del mapa o un gráfico chico (como `sinarameCredit`), con la línea completa en la pantalla de detalle:

- **es:** «Ríos y lluvia de Colombia: IDEAM (datos.gov.co, CC BY-SA 4.0), adaptados. Informativo, no oficial.»
- **en:** «Colombian rivers and rain: IDEAM (datos.gov.co, CC BY-SA 4.0), adapted. Informational, not official.»

### 4(b) Entrada completa para «Licencias y créditos» y para docs/FUENTES-DE-DATOS.md

**es:**
> **Ríos y lluvia de Colombia:** «Nivel Instantáneo del Rio», «Precipitación» y «Catálogo Nacional de Estaciones del IDEAM», del Instituto de Hidrología, Meteorología y Estudios Ambientales - IDEAM, Bogotá D.C. (ideam.gov.co), publicados en datos.gov.co (https://www.datos.gov.co/d/bdmn-sqnh, https://www.datos.gov.co/d/s54a-sgyg y https://www.datos.gov.co/d/hp9r-jxuu) bajo la licencia Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/). VikArg los adaptó: cambió el formato, pasó las horas a UTC, unió cada lectura con su estación y corrigió coordenadas que venían con la latitud y la longitud invertidas. Los datos adaptados se comparten bajo la misma licencia CC BY-SA 4.0. Según el IDEAM, son datos crudos sin validar, que pueden tener errores o atraso, y su uso es responsabilidad de quien los usa. Su inclusión no implica que el IDEAM avale ni respalde a VikArg. Informativo, no es una alerta oficial: para alertas oficiales, mirá los boletines del IDEAM y de la UNGRD.

**en:**
> **Colombian rivers and rain:** "Nivel Instantáneo del Rio", "Precipitación" and "Catálogo Nacional de Estaciones del IDEAM", by the Instituto de Hidrología, Meteorología y Estudios Ambientales - IDEAM, Bogotá D.C. (ideam.gov.co), published on datos.gov.co (https://www.datos.gov.co/d/bdmn-sqnh, https://www.datos.gov.co/d/s54a-sgyg and https://www.datos.gov.co/d/hp9r-jxuu) under the Creative Commons Attribution-ShareAlike 4.0 International license (CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/). Adapted by VikArg: format changed, times converted to UTC, readings joined with their stations, and coordinates corrected where latitude and longitude were swapped. The adapted data is shared under the same CC BY-SA 4.0 license. According to IDEAM, this is raw, unvalidated data that may contain errors or delays, and its use is the user's own responsibility. Its inclusion does not mean IDEAM endorses VikArg. Informational, not an official alert: for official alerts, see the IDEAM and UNGRD bulletins.

Si se carga solo el nivel (sin lluvia), se saca «Precipitación» y su URL. Si no se convierte ninguna unidad, no se menciona: la indicación de cambios tiene que ser **verdadera**.

### Dónde mostrarlas (propuesta)

1. **Pantalla de ríos de Colombia** (nuevo `navigation.coRivers.source`, mismo lugar que `pyRivers.source`): la línea 4(a) completa.
2. **Capa del mapa del tiempo** (lluvia o niveles de Colombia), como `sinarameCredit`: la variante corta, visible cuando la capa está activa, y la entrada en «Referencia rápida».
3. **Gráfico de nivel o lluvia:** la variante corta debajo del gráfico (y en el PDF o la imagen, si alguna vez se exporta o se comparte).
4. **Licencias y créditos** (`licenses.credit.colombiaWater` o una entrada «Colombia» en `CREDITS`): la entrada 4(b). Hoy esa lista es texto plano: **conviene que el enlace a la licencia sea clicable** (§3(a)(1)(C) pide texto o URI; un URI escrito alcanza, pero un enlace es más razonable).
5. **Respuesta de la API y paquete offline:** el bloque `license` del §1.3 punto 2.
6. **`docs/FUENTES-DE-DATOS.md`:** la entrada 4(b) en español, más la fecha de verificación (2026-11-19), los identificadores SODA y la lista de transformaciones.
7. **Tiendas** (opcional): una línea en la descripción («Datos de Colombia: IDEAM, CC BY-SA 4.0»). No es obligatorio si la app ya atribuye.

## 5. Qué debe validar un abogado matriculado

1. Si en Colombia y en la Argentina las series de mediciones del IDEAM tienen **algún** derecho (de autor sobre la compilación o afín) y, por lo tanto, cuánto pesa en la práctica el share-alike (§1(a), §2(a)(2), §4).
2. Que **el código no es «Adapted Material»** y que el share-alike no alcanza a la copia con licencia comercial, siempre que los datos viajen separados.
3. Que **mostrar en capas** OSM (ODbL) + IDEAM (BY-SA) + fuentes CC BY no crea una obra derivada única, y la **incompatibilidad** CC BY-SA 4.0 ↔ ODbL para fusionarlas en una base.
4. Distribución por **App Store / Google Play** y la cláusula anti-DRM (§2(a)(5)(C)) si en algún momento los datos van dentro del binario.
5. La redacción de la exclusión de datos de terceros en la **licencia comercial / contrato institucional** y en **CONTRIBUTING.md**.
6. Si las «cláusulas» de la ficha del IDEAM (por ejemplo, «no podrán ser utilizados como evidencia jurídica») son términos adicionales válidos o solo un descargo, y si chocan con la licencia.
7. Si los términos de uso del servidor (límites, prohibición de extracción masiva) necesitan una excepción expresa para los datos BY-SA.

## Qué no pude confirmar

- El texto exacto de la Decisión Andina 351 sobre compilaciones y la falta de derecho *sui generis* en Colombia y la Argentina: lo digo por conocimiento general, sin verificarlo en la fuente.
- Una postura oficial y actual de la OSMF específicamente sobre CC BY-SA 4.0 (encontré la tabla del wiki de OSM y las minutas del LWG de 2025, que dicen «incompatible» en general para licencias con condiciones idénticas).
- Si el IDEAM tiene una política de atribución propia más allá del campo `attribution` de la ficha (no la busqué en ideam.gov.co).
- La FAQ de datos de CC no trata expresamente si un gráfico o una visualización es «Adapted Material».

## Fuentes

- CC BY-SA 4.0, texto legal: https://creativecommons.org/licenses/by-sa/4.0/legalcode.en
- CC, licencias compatibles: https://creativecommons.org/share-your-work/licensing-considerations/compatible-licenses/
- CC, FAQ de datos: https://wiki.creativecommons.org/Data
- CC, ShareAlike interpretation: https://wiki.creativecommons.org/wiki/ShareAlike_interpretation
- OSMF, minutas del LWG 2025-08-11: https://osmfoundation.org/wiki/Licensing_Working_Group/Minutes/2025-08-11
- OSM wiki, CC BY 4.0 / compatibilidad: https://wiki.openstreetmap.org/wiki/CC_BY_4.0
- Fichas de datos.gov.co: https://www.datos.gov.co/api/views/bdmn-sqnh.json, …/s54a-sgyg.json, …/hp9r-jxuu.json (consultadas el 2026-11-19)

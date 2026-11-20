# Guía de primeros auxilios: propuesta de textos más cortos y hallazgos (2026-11-20)

Estado (2026-11-20): **las propuestas [forma] están aplicadas** en `app/src/modules/firstAid/guides/` (ver «Qué se aplicó» al final); las **[SENTIDO]** NO se tocaron y quedan en «Pendientes de validación clínica». Lo de interfaz se aplicó antes (`docs/DISENO.md`, «Pantallas de uso bajo estrés»).

Criterio de la simplificación: una frase corta por paso (idealmente ≤ 12 palabras), verbo de acción al principio, sin jerga ni paréntesis, 3 a 5 pasos por pantalla. Cada propuesta lleva una marca:

- **[forma]** solo acorta o reordena palabras; el sentido clínico es el mismo.
- **[SENTIDO]** quita o cambia un dato o una condición: **requiere que lo valide una persona con formación médica**.

Los textos en inglés siguen la misma lógica; se dejan los más importantes. El portugués (pt-BR) ya está traducido completo pero **sin revisión humana** (ver `docs/TRADUCCION-PT-BR.md`); si algo de abajo cambia tras la validación clínica, hay que cambiarlo también en pt.

## 1. Propuestas por tema y paso

### Evaluación inicial (`assess`)

| Paso | Texto actual (es) | Propuesta | Razón / marca |
|---|---|---|---|
| `safe` 1 | Antes de acercarte mirá alrededor: tránsito, fuego, humo, cables, gas, agua, piedras que caen, animales. | Mirá alrededor antes de acercarte: tránsito, fuego, cables, gas, agua, piedras. | Lista más corta de ejemplos. **[forma]** (humo/animales quedan implícitos en «fuego»/«peligro»; si querés conservarlos, dejarlos). |
| `safe` 2 | Protegete: guantes o una bolsa en las manos si hay sangre. | Si hay sangre, ponete guantes o una bolsa en las manos. | Condición primero, acción después. **[forma]** |
| `unsafe` 1-2 | No te acerques: si te lastimás vos, ya son dos para rescatar. / Si se puede, eliminá el peligro sin arriesgarte: cortá la luz, señalizá el accidente, alejá el fuego. | No te acerques: si te lastimás, son dos para rescatar. / Si podés sin riesgo, cortá la luz, señalizá o alejá el fuego. | **[forma]** |
| `unsafe` 3 y 4 | (ciudad) Llamá al {emergency} (o al {fire}…) y esperá a los que tienen equipo. (agreste) Pedí rescate al {emergency} (Policía / rescate de montaña) y pasá las coordenadas de "Mi ubicación". Si no hay señal, probá desde un punto alto o mandá un SMS; si son varios, que alguien vaya a buscar ayuda con la ubicación anotada. | (agreste) Pedí rescate al {emergency} y pasá tu ubicación. Sin señal: subí a un punto alto o mandá un SMS. | `WILD_RESCUE` tiene 52 palabras: es el paso más largo de toda la guía y aparece en ~15 pantallas. Propuesta: partirlo en 2 pasos («Pedí rescate…» y «Sin señal: …; si son varios, que uno vaya a buscar ayuda con la ubicación anotada»). **[forma]** |
| `responds` 1 | Tocale los hombros y hablale fuerte: "¿Me escuchás? ¿Estás bien?" | Tocale los hombros y preguntale fuerte: «¿Me escuchás?» | **[forma]** |
| `breathing` 1 | Pedí ayuda a gritos: que alguien llame al {medical} y traiga un desfibrilador (DEA) si hay. | Pedí ayuda a gritos. Que alguien llame al {medical} y traiga el desfibrilador (DEA). | Dos frases. **[forma]** |
| `breathing` 2 | Abrí la vía aérea: una mano en la frente, inclinala hacia atrás y levantá el mentón con dos dedos. | Una mano en la frente: inclinale la cabeza atrás y levantale el mentón. | «Vía aérea» es jerga. **[forma]**, pero revisar si se quiere conservar «con dos dedos». |
| `breathing` 3-4 | Mirá el pecho, escuchá y sentí el aire hasta 10 segundos. / Bocanadas aisladas o ruidos (respiración agónica) NO son respirar normalmente. | Mirá el pecho 10 segundos. Si no respira o solo da bocanadas: no respira normal. | «Respiración agónica» es jerga. **[forma]** |

### RCP (`cpr`)

| Paso | Actual | Propuesta | Marca |
|---|---|---|---|
| `start` 1 | Llamá al {medical} y poné el altavoz: te van a ir guiando. | Llamá al {medical} con el altavoz puesto: te guían. | **[forma]** |
| `start` 4 | Talón de una mano en el centro del pecho, la otra encima, brazos rectos. | Una mano sobre la otra, en el centro del pecho. Brazos rectos. | «Talón de la mano» es jerga. **[forma]** |
| `start` 5 | Hundí el pecho 5 a 6 cm, rápido: 100 a 120 por minuto (el ritmo de "La Bamba" o "Stayin' Alive"). Dejá que el pecho vuelva a subir. | Hundí el pecho 5 a 6 cm, rápido (como «Stayin' Alive»). Dejá que vuelva a subir. | **[forma]**. Ver hallazgo H1 sobre «La Bamba». |
| `start` 6-7 | Si sabés dar respiraciones: 30 compresiones y 2 respiraciones. Si no, solo compresiones sin parar. / Si son varios, túrnense cada 2 minutos sin frenar. | Igual de largo; 2 pasos cortos ya. Sugerencia: pasar «túrnense» a la pantalla `continue`. | **[forma]** |
| `continue` 3 (niños) | En chicos: si sabés, empezá con 5 respiraciones; hundí un tercio del pecho (con una mano, o dos dedos en bebés). | Sin cambio de texto, pero **proponer una pantalla aparte «RCP en niños y bebés»** con las diferencias. Hoy es la última línea de la última pantalla. | Hallazgo H4. |
| `continue` 4 (agreste) | Lejos de un hospital la RCP sola rara vez alcanza, pero hacela igual: si la persona está muy fría (hipotermia), no abandones; puede recuperarse aun después de mucho tiempo. | Hacela igual. Si está muy fría (hipotermia), no abandones: puede recuperarse. | Quita «rara vez alcanza» (dato de pronóstico). **[SENTIDO]** |

### Sangrado abundante (`bleeding`)

| Paso | Actual | Propuesta | Marca |
|---|---|---|---|
| `pressure` 2 | Acostala. Apretá directo sobre la herida con gasa, un trapo o la ropa, con las dos manos y todo tu peso. | Acostala. Apretá fuerte sobre la herida con un trapo o la ropa, con las dos manos. | Quita «gasa» y «todo tu peso». **[forma]** (conservar «gasa» si el botiquín la lleva). |
| `pressure` 3 | No levantes la gasa para mirar: si se empapa, poné más encima y apretá más fuerte, al menos 10 minutos. | No levantes el trapo para mirar. Si se empapa, poné otro encima y seguí apretando. Mínimo 10 minutos. | **[forma]** |
| `pressure` 4-5 | Llamá al {medical} (o que otro llame mientras vos apretás). + `WILD_RESCUE` | Que otro llame al {medical} mientras vos apretás. (agreste: ver `WILD_RESCUE` partido) | **[forma]** |

### Mordedura de serpiente (`snakebite`)

La pantalla tiene **10 pasos** (el máximo recomendado es 5). Propuesta: partirla en tres pantallas encadenadas con «Seguir»: (1) *Qué hacer ya*: alejarse, calmar y quieto, sacar anillos, llamar al {poison}; (2) *Cómo inmovilizar*: férula a la altura del corazón, marcar borde y hora; (3) *Llevarla al hospital* (ciudad / agreste) y los «No hacer». Resumen del primer bloque:

1. Alejate de la serpiente. No la agarres ni la mates.
2. Que la persona no se mueva y esté calma.
3. Sacale anillos, reloj y pulseras.
4. Llamá al {poison}: te dicen a qué hospital ir.

Los «No hacer» (hoy una sola línea de 30 palabras: *no hagas torniquete, no cortes, no chupes, no pongas hielo ni calor, no des alcohol ni remedios caseros*) deberían ir como **una lista de 5 ítems cortos** («No hagas torniquete.», «No cortes la herida.», «No chupes el veneno.», «No pongas hielo ni calor.», «No des alcohol»). **[forma]**: mismas prohibiciones. La interfaz ya los muestra en recuadro rojo; se ve mejor con un ítem por línea.

### «Lo primero» (resumen de la lista, `locales/*.json` clave `guides.first`)

Es texto de interfaz (no está en `content.ts`) pero también es clínico, así que se deja aquí:

| Ítem | Actual | Propuesta |
|---|---|---|
| Protegete | Mirá que el lugar sea seguro antes de acercarte (tránsito, fuego, cables, agua, piedras). | Mirá que el lugar sea seguro antes de acercarte. |
| Avisá | Llamá al {medical}. En zona agreste, pedí rescate y pasá tus coordenadas. | Llamá al {medical}. En zona agreste, pedí rescate con tu ubicación. |
| ¿Respira normal? | Si no respira o solo da bocanadas: RCP ya, 100 a 120 compresiones por minuto en el centro del pecho. | Si no respira o solo da bocanadas: RCP ya. |
| ¿Sangra mucho? | Apretá fuerte sobre la herida; si es un brazo o una pierna y no para, torniquete. | Apretá fuerte sobre la herida. Si no para en un brazo o pierna: torniquete. |
| Abrigala… | salvo peligro. Si no responde pero respira, de costado (posición lateral de seguridad). | Abrigala y no la muevas, salvo peligro. Si no responde pero respira: de costado. |

Las propuestas quitan la cifra de compresiones del resumen (queda en el paso de RCP): **[SENTIDO] leve**, a confirmar. Nota: el e2e busca «RCP ya» y «Protegete» en esa tarjeta; se conservan.

## 2. Hallazgos

### Ambigüedades o posibles errores (validar)

- **H1. «La Bamba» como ritmo de RCP** (solo en español; en inglés solo «Stayin' Alive»). Las referencias habituales son «Stayin' Alive» (~103 bpm) y canciones de 100-120 bpm; «La Bamba» suele ubicarse por encima de ese rango. Verificar el tempo o quitarla. No inventé un dato: queda a validar por quien tenga la fuente.
- **H2. Compresiones: «5 a 6 cm»**: coincide con ERC/AHA para adultos, pero la guía no aclara «sin pasarse de 6 cm». Validar si se quiere agregar.
- **H3. Orden «llamar» vs «hacer»**: en `breathing` y `bleeding`, «llamá» está entre los primeros pasos, bien. En `unsafe` y `other`, la llamada va después de «no te acerques»/«posición cómoda». Con el cambio de interfaz, los botones de llamada ya aparecen **arriba** de los pasos en todas las pantallas; si el orden textual debe ser otro (p. ej. en `unsafe`), se puede decidir.
- **H4. RCP en niños** está en una sola línea del último paso (`continue`). Es una diferencia importante (5 respiraciones iniciales, un tercio del pecho) enterrada al final. Proponer pantalla propia.
- **H5. Torniquete** (`bleeding`/`march`): hay dos posturas citadas en MARCH (manual MSAL 2016 vs TCCC 2026); en la guía simple conviene que el usuario no tenga que elegir. Validar cuál va en la ruta corta.
- **H6. Opciones «No responde»** repetidas en 6 temas con la misma etiqueta pero el mismo destino (`topic:assess`): para quien lo ve en pantalla suena a «reiniciar»; mejor «Dejó de responder». **[forma]** (cambia la etiqueta, no el destino).

### Pasos demasiado largos (palabras)

`WILD_RESCUE` (52), línea de «No hacer» de mordedura de serpiente (30), pasos de `march` (varios de 35 a 50 palabras, líneas 323, 351, 373-385 de `content.ts`), `fall` (líneas 501, 656). Hay 13 pasos de más de 170 caracteres. Todos son buenos candidatos para partir en dos o tres frases.

### Jerga a reemplazar

vía aérea, talón de la mano, respiración agónica, posición lateral de seguridad (mantener, pero con el dibujo/explicación corta: «de costado, con la cabeza ladeada»), férula, DEA (aclarar «desfibrilador» primero), ofidio, hipotermia/hipoglucemia (siempre con la explicación entre paréntesis ya existente).

### Pantallas con muchas opciones

- `assess → what` tiene **18 opciones**: la interfaz ya las muestra con ícono por tema, pero conviene **ordenarlas por urgencia** y quizá dividir en dos pasos («¿Qué ves?» con 6 grandes: no respira / sangra / se ahoga / dolor de pecho / convulsión / otro; y «Otra cosa» con el resto). Cambiaría la estructura del árbol (no solo texto): lo dejo propuesto.

### Temas que faltan (más comunes en montaña y hogar)

Montaña: **rayo / electrocución**, **congelamiento local (pies y manos)**, **deshidratación y agotamiento**, **ceguera de nieve**, **ampollas**, **picadura de garrapata**, **mordedura de perro o animal**, **torcedura de tobillo con evacuación** (hoy en «fractura»), **cuerpo extraño en el ojo**, **vivac de emergencia / abrigo** (se menciona pero sin guía).
Hogar y calle: **desmayo (síncope)**, **ataque de asma**, **hemorragia nasal**, **dolor abdominal fuerte**, **intoxicación alimentaria / diarrea con deshidratación**, **cortes y heridas menores**, **cuerpo extraño en nariz u oído (niños)**, **electrocución doméstica**, **parto de emergencia**, **crisis de pánico / estrés agudo**.
Ya cubiertos: RCP, atragantamiento, sangrado, MARCH, ACV, dolor de pecho, anafilaxia, convulsión, quemaduras, hipotermia, golpe de calor, hipoglucemia, ahogamiento, mal de altura, serpientes, picaduras, intoxicación, caídas, fracturas.
No inventé contenido clínico para estos temas: harán falta fuentes (ERC, Cruz Roja, Ministerio de Salud) y revisión.

### Otros

- Portugués: toda la guía en pt muestra español (`useLang` devuelve `es` o `en`). **Pendiente de traducción**.
- Lectura en voz alta: lee título, pasos, pregunta y opciones; no lee «Paso N» ni el rótulo «No hacer» (decisión: no repetir). Los «No hacer» no se distinguen en la voz: se podría anteponer «No hacer:» en la lectura si se valida.

## 3. Preguntas para validar

1. ¿Se aprueban las versiones **[forma]** para aplicarlas en bloque? ¿Quién valida las **[SENTIDO]**?
2. ¿Partimos `snakebite`, `march` y `WILD_RESCUE` en pantallas/frases más cortas?
3. ¿Se quiere reordenar «¿Qué le pasó?» en dos niveles (cambio de árbol)?
4. ¿Qué temas faltantes primero? (Sugerencia para montaña: rayo, congelamiento, deshidratación, torcedura.)

## 4. Qué se aplicó (2026-11-20)

- **[forma] aplicadas:** `safe` 2 (condición primero), `unsafe` 1-2, `responds`, `breathing` 1-4, `cpr start` 1, 4 y 5, `pressure` 3 («No levantes la gasa para mirar. Si se empapa…»), «Lo primero» (protegete, avisá, sangra, abrigala), etiquetas «Dejó de responder» (H6).
- **Se conservó el texto original (ante la duda, como [SENTIDO]):** `safe` 1 (se mantienen humo, piedras que caen y animales), «con dos dedos» (`breathing` 2), «con gasa» y «todo tu peso» (`pressure` 2), la llamada «Llamá al {medical} (o que otro llame…)» de `pressure`, y la cifra «100 a 120 por minuto» en `cpr start` 5 y en «Lo primero» (por pedido expreso).
- **Canción del ritmo de RCP:** «La Bamba» y «Stayin' Alive» se reemplazaron por «Another One Bites the Dust» (Queen, ≈110 pulsos por minuto) en es/en/pt; se mantiene «100 a 120 por minuto».
- **Pasos partidos:** `snakebite` en 3 pantallas (`start` qué hacer ya, `splint` inmovilizar con los 5 «No hacer» uno por línea, `hospital`; «No hagas torniquete» también en la primera); `march`: `m` → `m` + `m2`, `after` → `after` + `after2`, y `intro` → `intro` + `about` (de dónde sale), más frases cortas en `a`, `r`, `c`, `h`.
- **Pedido de rescate:** `WILD_RESCUE` pasó de 52 a ~18 palabras («Pedí rescate al {emergency} y pasá tu ubicación. Sin señal: subí a un punto alto o mandá un SMS.»); el detalle («si son varios, que alguien vaya a buscar ayuda con la ubicación anotada», Policía o rescate de montaña) está en la guía nueva `rescue` («Pedir rescate»), a la que se llega desde `unsafe` y `other` (opción «Cómo pedir rescate»), desde la lista y por búsqueda.
- **«¿Qué le pasó?» en dos niveles** (`assess/what`): 8 opciones de primer nivel: «No responde o no respira» (va a `breathing`), «Sangrado grave» (va a la guía de sangrado) y «Se ahoga con algo (atragantamiento)» (va a la guía) quedan a un toque; «Ahogo, dolor de pecho o desmayo» (`heart`: pecho, ACV, anafilaxia, convulsión, diabético, casi ahogado, altura), «Golpe, caída o hueso roto» (`injury`: caída, fractura, MARCH), «Quemadura, frío o calor» (`temp`), «Veneno, picadura o mordedura» (`venom`: serpiente, picadura, intoxicación) y «Otra cosa o no sé» (`other`). Las 18 situaciones originales siguen con el mismo texto de botón en el segundo nivel. Cambian testids/nombres accesibles solo en esto: aparecen los 5 botones de categoría y 2 directos nuevos («No responde o no respira», «Sangrado grave»); en `march` aparecen «De dónde sale esta guía», «Seguir: torniquete y relleno» y «Seguir: dolor y anotaciones»; en `snakebite`, «Seguir: inmovilizar» y «Seguir: llevarla al hospital»; las etiquetas «No responde»/«Deja de responder» que volvían a `assess` ahora dicen «Dejó de responder».
- **Orden de textos coherente con las llamadas arriba:** en `unsafe` la llamada pasó al segundo paso (después de «No te acerques»), y «Si podés sin riesgo, eliminá el peligro…» al final; en `other` la condición «Si empeora… llamá al {same}» pasó al primer paso.
- Se corrigió «Llamá al el centro…» (Bolivia, Paraguay y Brasil) quitando el artículo de esos tres nombres en `POISON_NAME` (es).

## 5. Pendientes de validación clínica

Todo esto lo tiene que ver una persona con formación médica **antes** de aplicar (no se tocó el texto actual):

1. **Torniquete: dos posturas distintas en la app.** (a) Guía de sangrado (`bleeding/tourniquet`): presión primero (10 minutos), torniquete solo si sigue saliendo en chorro, ingle/axila/cuello con gasa común, aclaración de que las fuentes difieren (Manual del Ministerio de Salud 2016 lo desaconseja en heridas comunes; TCCC 2026 y TECC 2024 lo recomiendan si no cede). (b) MARCH (`march/m` y `m2`): torniquete directo apenas la presión no frena un sangrado de miembro (sin los 10 minutos), gasa hemostática y 3 minutos de presión. Decidir cuál va en la ruta corta, o si se unifican.
2. **[SENTIDO] del informe, no aplicadas:** `continue` 4 (quitar «rara vez alcanza»); cifra de compresiones fuera de «Lo primero»; H2 («sin pasarse de 6 cm»); H3 (si el orden de `unsafe`/`other` debe ser otro); H4 (pantalla propia «RCP en niños y bebés»: hoy sigue en la última línea de `continue`); quitar «con gasa» y «todo tu peso» de `pressure` 2; «Que otro llame al {medical} mientras vos apretás» (supone que hay otra persona); acortar `safe` 1 (humo, animales, piedras que caen); «una mano sobre la otra» ya reemplaza al «talón de una mano» en `cpr start` 4 (se aplicó como [forma]: confirmar que no pierde técnica).
3. **Pantallas que siguen con más de 5 pasos numerados** (hay una prueba que lo exige salvo para esta lista): `cpr/start` (7), `unconscious/start`, `bleeding/tourniquet`, `anaphylaxis/start`, `fall/conscious`, `fracture/start` (7-8), `chest/start` (hasta 8), `stroke/start`, `hypothermia/start`, `heat/start`. Partirlas cambia el orden de lectura de pasos clínicos: validar cómo.
4. **Serpientes y portugués:** el paso de especies dice «En Argentina…»; en pt se tradujo igual («Na Argentina, as perigosas são as jararacas (yarará), a cascavel e a coral»). Para Brasil hace falta un texto propio (jararaca, cascavel, coral-verdadeira; soro antiofídico) y los centros de toxicología de Brasil, validados por alguien de allí.
5. **Los números de la guía en pt** salen de `CALLS` según el país elegido (Brasil: SAMU 192, Bombeiros 193, Polícia 190, Disque-Intoxicação 0800 722 6001).
6. **Lectura en voz alta:** anteponer «No hacer:» en los «No hacer» (sigue pendiente de decisión).
7. **Temas que faltan** (sección 2): sin contenido clínico escrito.

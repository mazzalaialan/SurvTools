# Proceso para revisar y corregir los diagramas de nudos (versión RIGUROSA, 2026-11-21)

El proceso anterior (más abajo, «versión eficiente») dejó errores de cruces porque se comparaba la secuencia A/B sola y se miraba la figura entera. Lo que manda ahora: **cada cruce se verifica uno por uno contra la referencia real, con la figura numerada al lado de la foto.**

## Los tres errores que hay que cazar primero (decisión del usuario)
1. **Arriba/abajo:** en cada cruce, qué cuerda pasa por encima y cuál por debajo.
2. **Por dentro o por fuera de la vuelta:** la punta entra a la gaza/seno desde el lado correcto y enlaza de verdad con la otra cuerda (no basta con que toque).
3. **Sentido de recorrido:** hacia dónde gira la cuerda (horario o antihorario, mirando de frente), de qué lado queda la punta y si la vuelta va por delante o por detrás del firme.
Después, la legibilidad: aunque esté bien, un cruce apretado o casi paralelo que no se entiende es un defecto.

## Herramienta nueva: `node numerado.mjs <id> <paso> [salida.png] [--zoom=2]`
Una imagen con la figura de la app con **cada cruce numerado**, las fotos/figuras reales del nudo (`app/public/knots/<id>-*.webp`) y la tabla «#, dónde, por arriba (cuerda y % del recorrido), por debajo, ángulo». El % es la posición a lo largo de la cuerda (0 % = firme, 100 % = punta). Se abre con una sola lectura de imagen y sirve para el ciclo de abajo.

## Ciclo por nudo (corrector → crítico, hasta 3 vueltas)
1. **Referencia por escrito (corrector, modelo con visión).** Del nudo TERMINADO, con fotos reales ampliadas (3x o más), escribir en `refs/<id>.json` un campo `recorrido`: la cuerda seguida del firme a la punta, **cruce por cruce, sin saltear ninguno**: «1. pasa por ARRIBA del firme, entrando por DENTRO de la gaza; 2. …», con el sentido de giro. Más la secuencia A/B de `pasos`. Los pasos intermedios sin referencia propia se **deducen hacia atrás desde el nudo terminado** (deshacer el último movimiento) y se marcan `"deducido": true`; nunca se inventan.
2. **Dibujo.** Editar el spec; `node check.mjs <id>` hasta que COINCIDA; no dejar ambiguos sin justificar; **nada de trampa** (ver reglas del corrector).
3. **Verificación visual cruce por cruce.** `node numerado.mjs <id> <paso>` para CADA figura cambiada; comprobar uno por uno los cruces numerados contra la foto (arriba/abajo, dentro/fuera, sentido). Anotar la tabla con ✔/✘.
4. **Crítico (modelo distinto, solo lee).** Repite la verificación por su cuenta con `numerado.mjs`, compara también con el texto del paso (`app/src/modules/knots/knots.ts`) y devuelve OK o una lista de cruces concretos a corregir («cruce #3 debe ir ABAJO», «la punta debe entrar por dentro de la gaza»). Si hay defectos vuelve al corrector (máx. 3 vueltas; si no sale, queda «PENDIENTE» con lo probado).
5. `npx vitest run src/modules/knots`, `node build.mjs` y commit por grupo, quien dirige.

---

# (Anterior) versión eficiente

Objetivo: que cada diagrama represente el nudo real y se entienda, gastando pocos tokens. Reglas de oro (del usuario): se parte del nudo REAL (nunca se inventa), el dibujo tiene que SE ENTENDER, y no se hace trampa con los controles.

## Herramientas (baratas, sin mirar imágenes)
- `node check.mjs <id>… | all`: por figura, la secuencia arriba/abajo de cada cuerda (A/B), cruces ambiguos y, si hay `refs/<id>.json`, COINCIDE / NO COINCIDE con la referencia real (acepta el espejo).
- `node montage.mjs <id> <paso>`: UNA imagen con la figura completa y solo los cruces ambiguos ampliados (o los 4 de menor ángulo). Una lectura de imagen por figura, no una por cruce.
- `node trace.mjs <id> <paso>`: el recorrido detallado (solo si hace falta depurar).
- `node tipo.mjs <id>… | all` (2026-11-12): qué nudo es, de verdad, el dibujo (figuras de una sola cuerda abierta): invariantes v2 (Polyak–Viro) y determinante, comparados con `"v2"`/`"det"` de `refs/<id>.json` (valores de la tabla de nudos, p. ej. KnotInfo). Sirve cuando la referencia arma el nudo con otra forma (la secuencia no se puede comparar) o cuando la imagen no se lee bien. Valores distintos prueban que el dibujo NO es ese nudo; iguales no lo prueban del todo. No distingue nada en los nudos atados en seno (gazas en el medio de la cuerda: de punta a punta son "sin nudo"). El det supone las dos puntas del lado de afuera del dibujo.
- `node build.mjs`: regenera los SVG. `refs/<id>.json`: la secuencia leída de la referencia real, con fuente y licencia.

## Flujo por nudo (un nudo o un grupo chico por vez)
1. **Referencia (una sola vez por nudo, modelo con visión fuerte).** Conseguir la figura de referencia (preferir SVG vectoriales de Commons: se leen con un script, sin mirar), leer cruce por cruce la secuencia real, escribir `refs/<id>.json` (fuente, licencia, secuencia por cuerda del paso terminado y de los pasos que se puedan leer). Si no hay referencia confiable: "SIN REFERENCIA" y no se inventa.
2. **Corrección (modelo económico, en bucle automático).** Editar el spec; repetir `node check.mjs <id>` hasta que COINCIDA y no queden ambiguos sin justificar. Recién entonces mirar UN montage por figura cambiada. Máximo 4 vueltas por nudo; si no sale, informar qué se probó.
3. **Revisión visual final (una pasada, sobre los montages).** Ver los montages de las figuras cambiadas y decidir OK o CORREGIR con defectos concretos. No se vuelven a leer referencias ni a abrir recortes sueltos.
4. Commit por grupo. `npx vitest run src/modules/knots` antes de commitear.

## Límites para ahorrar
- No lanzar varios agentes de revisión a la vez sobre el mismo grupo ni ciclos completos de analista→corrector→analista: la verificación de secuencia es automática, la visual es una pasada.
- No releer lo que ya está aprobado (`escape`, grupos 1 y 3, y lo que `check.mjs` ya da COINCIDE y sin ambiguos).
- Respuestas de los agentes: corto, por nudo, solo lo que cambió.

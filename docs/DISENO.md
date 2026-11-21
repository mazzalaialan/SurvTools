# Sistema de diseño de VikArg

Referencia práctica, nacida en **Emergencias** (`/first-aid/*`, 2026-11-20) y extendida a toda la app el mismo día. Primero va la función: cada decisión se juzga por si se lee y se toca más rápido y con menos errores (con prisa, guantes, de noche, a pleno sol); recién después, por si se ve mejor. Ante la duda, gana lo claro sobre lo lindo.

## Cómo está armado

- **Tokens:** `app/src/styles/theme.css` (color por tema, radios, escala tipográfica, espaciado, elevación).
- **Sistema global (2026-11-20):** el estilo que nació en Emergencias y Ajustes **vive en las clases base** de `app/src/styles/app.css` (`.btn`, `.btn-primary`, `.chip`, `.segmented`, `.input/.select`, `.card`, `.list-row`, `.empty`, `.error`, `.warning-box`, `.bottomnav`, `.module-card`, `.dialog`, `.toast`...), así que toda la app lo usa; ya no hay que acotar nada por sección. El bloque «Controles» (arriba del archivo) es la referencia. Lo propio de cada sección (llamadas, ubicación, guías, selector de país, desplegables) va con sus propias clases, sin prefijo.
- **Únicos `data-area` que quedan:** `data-area="country-picker"` (componente `CountryPackPicker`, estilos acotados porque reutiliza clases comunes en un layout propio) y `data-area="emergency"` en `<nav class="bottomnav">` (`Shell.tsx`), que solo cambia el tono de la solapa activa a rojo dentro de `/first-aid`.
- Se tocan **solo** CSS y marcado visual. Textos, `aria-label`, `data-testid`, roles y rutas no se cambian (las e2e buscan por eso).
- **Colores:** nada de hexadecimales sueltos fuera de mapas y diagramas; siempre variables (así el rojo nocturno sigue siendo solo rojo). Los tamaños de fuente van en `--fs-*` (salvo cifras de instrumentos en pantalla grande) y los radios en `--radius-ctl` / `--radius-card`.

## Tokens

| Tema | Valores |
|---|---|
| Color neutro | `--bg` fondo, `--surface` tarjeta, `--surface-2` control/relleno, `--border` línea decorativa, `--control-border` borde de campos y botones (≥3:1), `--text`, `--text-muted` (≥4,5:1 sobre `--surface`) |
| Acento (uno solo) | `--accent` cobre (acciones, selección, foco, bordes de llamada), `--accent-strong` (pulsado), `--on-accent` (texto encima) |
| Estado (solo para estados) | `--danger` peligro/emergencia (+ `--on-danger` para el texto encima), `--warn` atención, `--ok` correcto, `--info` informativo |
| Radios | `--radius-ctl` 8 px (botones, campos, chips, filas, avisos); `--radius-card` 10 px (tarjetas, grupos). Círculo solo para avatares. |
| Escala tipográfica | `--fs-xs` .75 rem (etiquetas, fuentes) · `--fs-sm` .875 (ayudas, subtítulos, títulos de bloque) · `--fs-md` 1 (cuerpo, botones, campos) · `--fs-lg` 1.125 (números de llamada, pasos de guías, dato secundario) · `--fs-xl` 1.5 (título de página, coordenadas). Nada de tamaños sueltos. |
| Espaciado | `--sp-1..` 4 · 8 · 12 · 16 · 24 px. Entre bloques de una página 16; dentro de una tarjeta 12; entre ícono y texto 8–12. |
| Elevación | `--elev-1` tarjetas (sombra mínima + borde fino); `--elev-2` solo lo que flota (diálogos, menús). Botones y filas: sin sombra. En ahorro y rojo nocturno no hay sombras: manda el borde. |

Cifras: `font-variant-numeric: tabular-nums` en toda la sección (teléfonos, coordenadas, distancias, horarios).

## Componentes

- **Tarjeta** (`.card`): `--surface`, borde `--border` 1 px, `--radius-card`, `--elev-1`, padding 16. No anidar tarjetas: dentro se separa con líneas finas (`border-bottom: 1px solid var(--border)`) o espacio.
- **Título de bloque** (`.section-title`): `--fs-sm`, mayúsculas, peso 700, `--text-muted`. Es etiqueta, no protagonista.
- **Botón** (`.btn`): mínimo 48 px de alto, `--radius-ctl`, borde `--control-border`, peso 600. **Primario** (`.btn-primary`): una acción principal por bloque; en Emergencias es neutro (ver «Regla final» abajo). **Secundario**: el `.btn` común. **Peligro** (`.btn-danger`, `--danger` con `--on-danger`): solo para llamar a emergencias o lo irreversible; **peligro contorno** (`.btn-danger-outline`) para borrar. Pulsado: relleno `--border` con sombra interior. Deshabilitado: sin relleno, borde punteado, texto atenuado pero legible (no solo opacidad).
- **Botón de llamada** (`.btn-call`, `.call-911`, `.call-other`): lo vital. Mínimo 52–56 px, número en `--fs-lg` negrita, **siempre con el ícono de teléfono** (no depende del color). «Llamar al 911»: sólido en `--danger`, arriba de todo. Otros números del país (salud, bomberos): contorno de 2 px en `--danger`. Teléfonos de una lista: contorno de 2 px en `--accent` sobre `--surface-2`. Al lado, copiar (`.icon-btn`, 44 px).
- **Chip** (`.chip`, filtros): 44 px, `--radius-ctl`, borde `--control-border`, texto `--text`. Activo (`aria-pressed`): relleno `--text`, letra `--bg`, negrita y aro interior (se distingue sin color).
- **Campo** (`.input`, `.select`): 48 px, `--radius-ctl`, borde `--control-border`, texto 1 rem (no hace zoom en iOS), foco con el contorno de `--focus`. Con error (`aria-invalid="true"`): borde de 2 px en `--danger` y mensaje de texto debajo.
- **Lista** (`.list`, `.contact-row`): fila = ícono neutro (`--text-muted`, 24 px) + texto + acción a la derecha; título 1 rem peso 600, subtítulo `--fs-sm`; separador de 1 px. La acción baja debajo del texto cuando no entra (números largos, pt/en). El ícono va arriba en filas altas.
- **Avisos** (`.warning-box`, `.ok-box`, `.error`): barra de 4 px a la izquierda + **texto** que dice qué pasa. El color solo refuerza.
- **Estado vacío** (`.empty`): caja punteada, texto a la izquierda y que diga qué hacer, no una pantalla en blanco.
- **Estados de carga/error:** línea `.hint` con `role="status"` mientras carga; `.error` con borde si falla, y un botón para reintentar cuando se puede.
- **Íconos:** de `lucide-react`, siempre `aria-hidden` si hay texto al lado; de un solo color neutro. Los íconos de color de peligro se reservan para lo que es peligro (módulos de Emergencias, llamadas, alergias).

## Reglas de uso

1. Una cosa principal por pantalla; lo vital (llamar, la coordenada, el paso actual) arriba y grande.
2. Datos a la vista antes que aire: líneas finas y espacio de 4/8/12/16, no cajas dentro de cajas.
3. Color con propósito: neutros + UN acento + colores de estado solo para estados. Nunca un color como único portador de significado: sumar ícono, texto, forma o borde.
4. Modo rojo nocturno: solo rojos (usar siempre variables; nunca `#fff` ni colores sueltos); modo ahorro: sin sombras; `prefers-reduced-motion` respetado (la sección no usa animaciones).
5. Textos largos: probar en `pt` y `en`; ninguna palabra puede salirse de su caja; los botones largos pueden partirse en dos líneas, nunca desbordar.
6. Objetivos táctiles: 48 px para lo importante, 44 px como mínimo para el resto, con 8 px entre vecinos.

## Qué NO hacer (aspecto «de IA»)

Degradados violeta/azul, brillos, glassmorphism, neones, sombras largas y difusas, halos en los bordes; todo en tarjetas idénticas con la misma sombra; listas de «tarjeta + ícono + título + subtítulo» sin jerarquía; emojis o íconos como adorno de títulos; íconos de colores distintos sin razón; gris azulado genérico y demasiados acentos; animaciones gratuitas (rebotes, entradas escalonadas, pulsos); centrados y «héroes» en pantallas que son herramientas; opacidad baja para «apagar» algo que hay que leer.

## Cómo verificar

- **Contraste:** WCAG AA, 4,5:1 texto normal, 3:1 texto grande y controles. Los pares de tokens se calcularon con la fórmula de luminancia relativa para los cuatro temas; resultados clave: `--text-muted` sobre `--surface` ≥4,6 en todos; `--on-danger` sobre `--danger` 5,6–6,8; `--control-border` sobre `--surface` 3,4–4,2. Excepciones conocidas: `--danger` como texto sobre `--surface-2` en oscuro da 3,8 (usarlo solo sobre `--surface`/`--bg` o en tamaño grande/negrita) y `--ok` en rojo nocturno 3,8 (ver propuestas).
- **Táctil:** en el inspector, alto y ancho ≥48 px (≥44 para secundarios) en un viewport de 390×844.
- **Capturas:** spec temporal de Playwright con prefijo `_diseno_` (celular 390×844 y escritorio; temas claro, oscuro y rojo; `es` y `pt`), con `npm run e2e:full -- e2e/_diseno_x.spec.ts --project=desktop`; se borra al terminar. Imprimir pantalla completa deja el menú de abajo en el medio de la captura: es un artefacto, no un error.
- **Sin romper:** `npx tsc --noEmit -p .`, `npx vitest run` y las e2e de las pantallas tocadas.

## Un solo tono por función (2026-11-20)
Dentro de Emergencias, **todo lo que llama, avisa o marca la sección usa `--danger`**: botones de llamada (Contactos y Mi ubicación), íconos de la grilla y la solapa activa del menú de abajo (`.bottomnav[data-area='emergency'] a.active`). `--accent` (cobre) queda para enlaces y foco. No mezclar los dos tonos para la misma función: se nota como inconsistencia.

## Regla final de color de controles en Emergencias (2026-11-20)
Problema: los botones de gestión (Buscar cercanos, Nuevo contacto, país activo) iban en cobre sólido junto a las llamadas en rojo óxido: dos tonos parecidos y distintos en la misma pantalla. Decisión: **el rojo es solo de lo que llama o avisa; el cobre solo de enlaces y foco; las acciones de gestión y los selectores son neutros** (color del texto), con jerarquía por forma (borde, relleno, ícono, peso) y no por color.

| Función | Token / forma |
|---|---|
| Llamar | `--danger`: «Llamar al 911» sólido (`--on-danger`); otros números, contorno de 2 px, siempre con ícono de teléfono |
| Acción primaria (Buscar cercanos, Nuevo contacto/ficha/botiquín, Agregar) | Fondo `--surface`, borde de 2 px `--text`, texto `--text` negrita, ícono (+, lupa) |
| Acción secundaria (`.btn`) | Fondo `--surface-2`, borde 1 px `--control-border`, texto `--text` |
| Selector / chip seleccionado (país, filtros, segmentado) | Relleno `--text`, letra `--bg`, negrita y aro interior; no seleccionado: borde `--control-border` sobre `--surface` |
| Botón con estado (`aria-pressed`, ej. «Ver en el mapa») | Como la secundaria con borde de 2 px `--text` y negrita al estar activo |
| Enlace | `--accent` subrayado (`.map-link`, `.btn-link`, enlaces en texto) |
| Peligro destructivo (borrar) | `.btn-danger-outline`: contorno `--danger`, sin relleno |
| Solapa activa del menú de abajo | Color `--text` + barra de 3 px arriba (a la izquierda en el riel lateral): se distingue sin color. En Emergencias la barra y el ícono van en `--danger`. Es navegación, no un enlace: por eso no es cobre |
| Deshabilitado | Sin relleno, borde punteado, texto `--text-muted` |

En rojo nocturno todo lo anterior sigue siendo rojo (`--text`, `--bg` y `--danger` son rojos ahí): se distinguen por forma. Al pasar otras secciones, aplicar la misma tabla.

## Selector de país (2026-11-20)
Componente único: `app/src/modules/emergency/CountryPackPicker.tsx`, con `mode="manage"` (Ajustes → País) y `mode="choose"` (`CountrySwitch`, usado en Contactos de emergencia y en la guía de primeros auxilios). Mismo orden (continentes y, dentro de cada uno, alfabético), mismo diseño y mismo store (`useSettings.update({ country })`). Estilos acotados con `data-area="country-picker"` en el contenedor (al final de `app.css`), así no se mueve el resto de Ajustes.

- **Continente:** título de bloque (`--fs-sm`, mayúsculas, `--text-muted`) con línea fina arriba; sin caja alrededor.
- **País:** botón de 48 px, `--radius-ctl`, borde `--control-border`. El **país actual** va relleno (`--text`/`--bg`), en negrita, con ícono de ubicación y, en Ajustes, la leyenda «País actual» (texto fuera del botón y `aria-hidden`: el nombre accesible sigue siendo solo el país). `aria-pressed` se conserva.
- **Ajustes (manage):** una fila por país; a la derecha una celda de 48 px con el estado del paquete, siempre ícono + peso (MB/KB): bajado y al día (tilde, borde punteado), sin bajar (flecha, botón), hay versión nueva (actualizar, borde de 2 px `--warn`), bajando (rueda). Borrar es una acción aparte, sin borde ni relleno, con el rojo solo en el ícono; no se ofrece para el país actual ni para Brasil entero.
- **Brasil:** los sectores (Sul, Sudeste...) aparecen **debajo de la fila de Brasil**, sangrados y con una línea vertical a la izquierda; cada uno con su peso y su acción a la derecha. Un país sin sectores no cambia.
- **Brasil como país actual (Ajustes):** tocar la fila de Brasil solo despliega los sectores y NO cambia el país actual. La acción «Usar Brasil como país actual» va **al pie de la lista de sectores** (primero qué es cada sector y cuánto pesa), como fila de texto de 48 px: ancho de la lista, sin relleno ni negrita fuerte (no se parece a «bajar»), borde `--control-border` e ícono de ubicación (el mismo que marca al país actual). Si Brasil ya es el país actual no se muestra (lo dice la fila de Brasil, rellena y con «País actual»). Antes era un botón ancho relleno arriba de los sectores, que competía con las descargas.
- **Elegir (choose):** grilla de dos columnas, sin descargas, borrado, sectores ni mapa; elegir cambia el país actual (la descarga la sigue haciendo `useCountryPrefetch`). Brasil se elige directo.
- **Pendiente de decisión:** pasar el resto de Ajustes al mismo sistema y mostrar el peso solo cuando hay datos.

## Ajustes (2026-11-20)
Hoy ya no hay `data-area="settings"`: estas reglas son globales (ver «Sistema global»). Aplica la tabla de «Regla final de color de controles» sin cambios, y concreta dos filas que antes iban en cobre sólido:

| Función | Token / forma en Ajustes |
|---|---|
| Segmentado / selector (Tema, Rojo nocturno automático, Idioma, Unidades) | 48 px, `--radius-ctl`. Elegido: relleno `--text`, letra `--bg`, negrita y aro interior; no elegido: `--surface`, texto `--text`. Foco: contorno `--focus` |
| Acción primaria (Activar notificaciones, Guardar, Quitar contraseña, verificar/rehacer descargas) | Fondo `--surface`, borde de 2 px `--text`, texto `--text` negrita. Deshabilitada: sin relleno, borde punteado de 1 px, texto `--text-muted` |
| Casillas | `accent-color: --text` (neutro), fila de 48 px mínimo |
| Lista «Este dispositivo» | ✓/✗ con texto; el sí en `--text`, el no en `--text-muted` (el verde queda para estados reales) |

### Desplegables (`app/src/ui/Collapsible.tsx`)
Criterio: va en desplegable **cerrado** lo de uso poco frecuente (formularios largos, listas, referencia). Lo frecuente (Tema, Idioma, País, Unidades, Backup) queda a la vista. Encabezado de 48 px completo como botón (`aria-expanded`, `aria-controls`), título en mayúsculas de bloque, **resumen con el estado que importa visible aunque esté cerrado** (p. ej. «La app no tiene contraseña…» con ícono de advertencia, o «Bloqueo automático: 5 min») y chevron. Sin animación. El contenido sigue montado (`hidden`), así no se pierde lo escrito. Las e2e lo abren con `openSection(page, 'security' | 'storage' | 'device')` (`app/e2e/settingsSections.ts`). Hoy: Seguridad, Almacenamiento, Este dispositivo, y (2026-11-21) los textos de referencia: «Cómo funciona» del Altímetro, el «Machete» del Declinómetro, «Sobre los modelos» de Comparar pronósticos, «Fuentes y licencias» de Navegación y «Norte verdadero o magnético, declinación y calibración» de la Brújula. Los `<details>` con la clase `.more-options` (Clima, Seguir un recorrido, waypoint) llevan una flecha propia (abajo = cerrado): con `display: flex` el navegador pierde su triángulo y no se notaba que eran desplegables. Una pantalla nueva con texto que se lee una sola vez usa `Collapsible`, no una tarjeta abierta.

Selector de país: los continentes arrancan **cerrados**; «País actual» siempre visible arriba. En las e2e, `openContinent(page)` (`app/e2e/countryPicker.ts`).

## Sistema global: tabla final y decisiones (2026-11-20)

| Función | Token / forma (en toda la app) |
|---|---|
| Llamar / peligro | `--danger` (`.btn-danger` sólido con `--on-danger`; `.btn-call`, `.call-other` contorno de 2 px con ícono de teléfono; `.btn-danger-outline` para borrar; `.error` con barra de 4 px) |
| Enlace, foco | `--accent` + subrayado (`a`, `.btn-link`); foco `--focus` |
| Gestión, selectores, segmentados, primarios, casillas, rangos | Neutro: `--text`/`--bg`; primario = borde 2 px `--text`; seleccionado = relleno `--text`, letra `--bg`, negrita, aro interior |
| Íconos de listas y grillas | `--text-muted`; el de Emergencias en `--danger`; íconos de estado (`--ok/--warn/--info/--danger`) solo cuando son un estado |
| Estado de un dato (río, amenaza, nivel de pronóstico) | `--ok`, `--info`, `--warn`, `--danger` o `--scale-*` del tema, siempre con el texto del nivel |
| Solapa activa | `--text` + barra de 3 px (rojo solo en Emergencias) |
| Desplegable de detalle (`summary`) | `--text` con la flecha nativa |
| Pulsado | Relleno `--border` (botones, chips, filas, segmentados, íconos); peligro: aro interior |
| Deshabilitado | Sin relleno, borde punteado, `--text-muted` (también `.chip:disabled`) |
| Vacío | `.empty`: caja punteada, texto a la izquierda |
| Ritmo vertical | 16 px (`--sp-4`) entre bloques; títulos de bloque con 24 arriba y 12 abajo; tarjetas sueltas bajo `.content` con 16 de separación (`.content > .card:not(:last-child)`); dentro de una tarjeta 12 |
| Cabecera | Celular (≤420 px): menos aire entre botones y título de 14 px para que el nombre no baje a 4 líneas |
| Radios | `--radius-ctl` 8 (controles, filas, chips, avisos, etiquetas) y `--radius-card` 10 (tarjetas, grupos, diálogos, toasts); redondo solo para avatares, puntos, barras de progreso y cintas sobre mapas |
| Elevación | `--elev-1` tarjetas; `--elev-2` diálogos y toasts |

Cambios de comportamiento visual respecto del estilo viejo: botones primarios y chips/segmentados seleccionados dejaron de ser cobre sólido; los íconos de las grillas (Inicio y portadas de módulo) son neutros; el toast y el diálogo llevan borde `--control-border` en vez de cobre; estados de río y amenaza usan variables del tema (antes eran hexadecimales fijos, que no se ponían rojos en el modo nocturno).

### Pantallas revisadas (celular 390×844, oscuro y claro; rojo nocturno y portugués en muestra)
Inicio, Orientación (portada, brújula, waypoints y rutas, tracks, mapa estelar, declinómetro, inclinómetro, altímetro, mapas offline), Meteo (portada, clima, comparación, histórico, navegación/ríos, mapa de alertas y clima, sol y luna), Entrenamiento (portada, sesiones, salidas, mapa en vivo vacío), Inventario (portada, artículos, ubicaciones, alta de artículo), Documentos (lista, alta), Huerta (portada, calendario), Cabuyería (guía), Biblioteca (portada, libros), Compartir, Backup/Transferencia, Acerca de, Ajustes, Emergencias (comparada píxel a píxel contra el estado anterior), pantallas de bóveda (crear, clave de recuperación, desbloquear), diálogo de confirmación, «Más».

### Pendiente de revisar con datos reales o sensores
Pantallas que dependen de sensores o datos que no hay en la prueba (brújula con rumbo, inclinómetro con acelerómetro, grabación en vivo de Entrenamiento, lector de libros, huerta con canteros cargados, ficha del nudo, toasts en pantalla), pantalla completa de mapas y de la brújula 3D, y los controles dentro de los mapas (MapLibre). Objetivos táctiles de 32 px que se dejaron por ser densidad sobre mapas o grillas: `.map-link`, `.wmap-fs-menu .chip`, `.garden-cell`, `.first-steps-list a`.

## Pantallas de «uso bajo estrés» (guía de primeros auxilios, 2026-11-20)

Para cualquier pantalla que se use con pánico, guantes, de noche o a pleno sol. Se aplicó a `GuideTopicPage` y `GuidesPage` (CSS `.guide*`).

1. **Una decisión por pantalla, en este orden:** contexto chico («Paso N», tema) → **título grande** (`--fs-xl`, 800) → **a quién llamar** → pasos numerados → pregunta → respuestas → «Volver al paso anterior».
2. **Lo vital arriba y grande:** botones de llamada de ancho completo, 60 px, número en `--fs-xl`, siempre con ícono de teléfono. El primero (el que más urge) va **sólido** en `--danger`; los demás, contorno de 2 px. «Mi ubicación» (zona agreste) va debajo, neutro.
3. **Pasos:** máx. 3 a 5 por pantalla, una frase corta cada uno, texto de ≥`--fs-lg` y `line-height` 1.4, número en un cuadro de 28 px (2 px de borde `--text`). Los «No hacer» **no se numeran**: recuadro con borde `--danger` de 2 px (banda de 6 px a la izquierda), ícono `Ban` y el rótulo «No hacer» visibles (ícono + texto, no solo color); el texto va en `--text`.
4. **Respuestas:** botones de ancho completo, **≥60 px** (≥56 px cuando son muchas, `.many`), borde de 2 px, texto en negrita `--fs-lg` (`--fs-md` si son más de 6), ícono a la izquierda y flecha a la derecha. Opciones que pasan a otra guía llevan el ícono neutro de su tema (`TOPIC_ICON` en `parts.tsx`); las categorías sin ícono propio, ninguno.
5. **Sí / No (excepción semántica a «un tono por función»):** verde (`--ok`) = sí, rojo (`--danger`) = no. Decisión: **todo el botón** lleva el tono, pero **suave**: borde de 2 px + banda de 8 px a la izquierda + relleno del 10 % (`color-mix` con `--surface`), y el texto sigue en `--text` (contraste del texto no depende del tono). No se usa relleno sólido: competiría con «Llamar» (sólido rojo) y un «No» sólido rojo se leería como peligro o llamada. La forma distingue sin color: **tilde en cuadro relleno** (sí) vs **cruz en cuadro de contorno** (no), siempre con el texto. En rojo nocturno ambos son rojos: se distinguen por la forma del ícono (relleno/contorno). Se marca en el contenido con el campo opcional `answer?: 'yes' | 'no'` de `Option` (`types.ts`; metadato de interfaz, no cambia el texto médico), puesto **solo** en las respuestas que son un sí/no claro (8 pares en `content.ts`: seguro, responde, respira, sangra, ¿DEA?, ¿paró?, altura, tose). Los resultados («No respira») y las categorías («Brazo o pierna») no se marcan. Verificar contraste del borde `--ok` ≥3:1 sobre `--surface` en los temas claro, oscuro y ahorro al tocar los tokens.
6. **«Volver al paso anterior»** (`guide-back`): debajo de las respuestas, ancho completo, 52 px, **relleno gris `--surface-2`, borde fino y centrado**, con ícono `Undo2`: junto a las opciones pero con otra forma (no parece una respuesta). **«Volver a evaluar»** y **«Todas las guías»**: solo enlaces de texto (`.btn-link`, `--fs-sm`) bajo la tarjeta, discretos pero ≥44 px.
7. **Selector Ciudad / Zona agreste:** una línea (dos botones del mismo ancho de 52 px; el elegido va relleno) y «detectar con mi ubicación» como cuadrado de 52 px con ícono (en la lista, con texto y la explicación debajo). Sin párrafos explicativos en los pasos.
8. **Lista:** orden: «Empezar evaluación» (64 px, a ancho completo) → selector de entorno → **«Lo más urgente»** (8 botones en 2 columnas de ≥72 px con ícono: RCP, sangrado, atragantamiento, dolor de pecho, ACV, alergia grave, serpiente, hipotermia; «Pedir rescate» no entra: se llega desde `unsafe`/`other` y la lista) → resumen «Lo primero» → buscador y situaciones con ícono → país → aviso legal. El país (define los números) es un ajuste, por eso va abajo; el aviso legal, al final y sin competir.
9. **Voz y accesibilidad:** los nombres accesibles de los botones siguen siendo el texto de la opción (íconos `aria-hidden`); la voz no lee «Paso N» y antepone «No hacer:» («Don't:», «Não faça:», clave `guides.dontSpoken`) a los pasos `dont`.
10. **Hecho (2026-11-20, contenido):** «¿Qué le pasó?» en dos niveles, `snakebite`/`march`/pedido de rescate partidos y textos [forma] simplificados; lo que cambia el sentido médico sigue pendiente de validación clínica: ver `docs/investigaciones/guia-primeros-auxilios-simplificada.md` (apartados 4 y 5).
11. **Panel de respuestas fijo abajo (2026-11-20):** pregunta + opciones + «Volver al paso anterior» van en `.guide-answers` (`data-testid="guide-answers"`, dentro de `guide-node`), con `position: sticky` abajo, encima de la barra de navegación (`--bottomnav-h` 60 px + área segura; en escritorio, con riel lateral, `bottom: 0`). Los pasos hacen scroll por encima; al llegar al final de los pasos el panel queda en su lugar (no tapa nada, no hace falta reservar alto). Celular: de borde a borde, borde superior de 2 px. Tope de alto 50 dvh: la lista de opciones tiene scroll propio (`.guide-answers-scroll`) y el «Volver» queda siempre visible. Sin opciones (final de guía) el panel trae «Volver al paso anterior» y «Volver a evaluar» (en ese caso se saca del pie para no duplicarlo). Regla para toda pantalla bajo estrés: **la decisión (pregunta y respuestas) nunca queda debajo del pliegue**.

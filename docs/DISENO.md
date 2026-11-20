# Sistema de diseño de VikArg

Referencia práctica, hecha sobre la sección **Emergencias** (`/first-aid/*`, 2026-11-20) para replicarla en las demás. Primero va la función: cada decisión se juzga por si se lee y se toca más rápido y con menos errores (con prisa, guantes, de noche, a pleno sol); recién después, por si se ve mejor. Ante la duda, gana lo claro sobre lo lindo.

## Cómo está armado

- **Tokens:** `app/src/styles/theme.css` (color por tema, radios, escala tipográfica, espaciado, elevación).
- **Alcance por sección:** `Shell.tsx` pone `data-area="emergency"` en `<main class="content">` cuando la ruta empieza con `/first-aid`. Los estilos de la pasada están al final de `app/src/styles/app.css` y todos llevan el prefijo `.content[data-area='emergency']`, así las clases compartidas (`.card`, `.btn`, `.input`, `.chip`...) no cambian en el resto de la app. **Para pasar otra sección:** agregar su ruta en `Shell.tsx` (`data-area="orientation"`, etc.) y repetir/generalizar el bloque cambiando el prefijo. Cuando todas estén pasadas, el bloque sube a las clases base y se borra el prefijo.
- Se tocan **solo** CSS y marcado visual. Textos, `aria-label`, `data-testid`, roles y rutas no se cambian (las e2e buscan por eso).

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
- **Botón** (`.btn`): mínimo 48 px de alto, `--radius-ctl`, borde `--control-border`, peso 600. **Primario** (`.btn-primary`, acento): una acción principal por bloque. **Secundario**: el `.btn` común. **Peligro** (`.btn-danger`, `--danger` con `--on-danger`): solo para llamar a emergencias o lo irreversible; **peligro contorno** (`.btn-danger-outline`) para borrar. Pulsado: relleno `--border` con sombra interior. Deshabilitado: sin relleno, borde punteado, texto atenuado pero legible (no solo opacidad).
- **Botón de llamada** (`.btn-call`, `.call-911`, `.call-other`): lo vital. Mínimo 52–56 px, número en `--fs-lg` negrita, **siempre con el ícono de teléfono** (no depende del color). «Llamar al 911»: sólido en `--danger`, arriba de todo. Otros números del país (salud, bomberos): contorno de 2 px en `--danger`. Teléfonos de una lista: contorno de 2 px en `--accent` sobre `--surface-2`. Al lado, copiar (`.icon-btn`, 44 px).
- **Chip** (`.chip`, filtros): 44 px, `--radius-ctl`, borde `--control-border`, texto `--text`. Activo (`aria-pressed`): relleno `--accent`, texto `--on-accent`, negrita y aro interior (se distingue sin color).
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
Dentro de Emergencias, **todo lo que llama, avisa o marca la sección usa `--danger`**: botones de llamada (Contactos y Mi ubicación), íconos de la grilla y la solapa activa del menú de abajo (`.bottomnav[data-area='emergency'] a.active`). `--accent` (cobre) queda para enlaces, acciones comunes y la solapa activa en el resto de la app. No mezclar los dos tonos para la misma función: se nota como inconsistencia.

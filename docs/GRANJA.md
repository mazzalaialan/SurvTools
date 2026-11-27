# Animales de granja (sección aparte; diseño del 2026-11-27)

Decisión del dueño: sección propia, no dentro de Fauna (Fauna = caza y vida silvestre; Granja = cría propia). Diseño del agente de UX.

## Arquitectura
- Sección `farm` en `SECTIONS` (`app/src/modules/registry.ts`), después de `garden`. «Animales de granja» / «Farm animals» / «Animais de criação».
- Portada `/farm`: «Mis animales» (lotes, tareas de hoy, avisos de clima), especies por grupo (Aves, Conejos, Rumiantes, Cerdos, Abejas, Peces de estanque), Calculadora, Calendario, Normas. Botón principal «Agregar lote».
- Rutas: `/farm/species`, `/farm/species/:id`, `/farm/plan`, `/farm/calendar`, `/farm/herd`, `/farm/rules`, `/farm/vet`.

## Ficha (bloques plegables)
Identidad y razas · Espacio · Alimento y agua · Producción esperada · Cría (por zona, `garden/calendar.ts`) · Sanidad (vacunas y desparasitación según SENASA, señales de alarma; **nunca dosis**) · Zoonosis · Faena y conservación (bienestar animal) · Normativa (SENASA, RENSPA, tránsito, municipio, Código Alimentario).
Cada cifra con fuente, organismo y fecha; sin fuente: «sin dato verificado». INTA es CC BY-NC-SA: solo datos, con cita, nunca texto ni fotos. Avisos sanitarios y legales fijos (sin «Entendido»).

## Herramientas
- Calculadora «cuántos animales para N personas» (lógica de `recommendations/calc.ts`).
- Calendario de tareas con avisos locales (como Huerta).
- Registro de lotes, eventos y producción (botones grandes, cifrado como `gardenBeds`), «Sumar al inventario».
- Clima: calor y heladas (aviso de Huerta) con el waypoint del corral; Huerta: estiércol, compost, forraje.
- Triage veterinario: señales de urgencia → «llamá al veterinario».

## Datos
Fichas base dentro de la app (como `garden/seeds.json`) para que ande sin descargar; fotos en paquete aparte `farm-AR.json` con el botón de descarga de Fauna. Generador `tools/farm-data/` con `sources.json`. Investigación en `~/vikarg-fishing-work/granja/`.

## Etapas
0. Investigación SENASA/INTA de las especies del MVP (antes de cualquier cifra).
1. MVP: sección, portada, rutas, fichas de gallina, codorniz, pato y conejo, avisos fijos.
2. Calculadora, calendario, registro con «Sumar al inventario».
3. Clima y waypoint, Huerta, triage, paquete de fotos.
4. Cabras, ovejas, cerdos, vacas, abejas, peces (más riesgo sanitario y normativo).

## Riesgos
Sanidad (nada de dosis), normativa variable por provincia y municipio (manda la norma vigente), licencias, Inicio con 12 secciones, confusión con Fauna.

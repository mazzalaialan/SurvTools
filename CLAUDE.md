# Herramientas de Supervivencia por VikArg: guía para Claude Code

Este archivo se carga solo al abrir el proyecto. Lo largo está en `docs/COLABORAR.md` (léelo antes de tocar nada importante).

## Reglas que no se discuten

- **Idioma:** español rioplatense (voseo) con la persona; textos de la app, comentarios y commits, en español. Los nombres de la app son «Herramientas de Supervivencia por VikArg» (es) y «Survival Tools By VikArg» (en); el ícono dice «SurvTools».
- **Aportes de otras personas:** van con el acuerdo de contribución de `CONTRIBUTING.md` (borrador pendiente de un abogado; no se toca su texto sin esa revisión). Es la puerta de entrada de los colaboradores externos.
- **Nunca publiques sin aprobación explícita** de quien dirige el proyecto («publicalo», «sí, publicá»). Commitear y probar en local está bien; empujar una versión, no. Detalle en `docs/COLABORAR.md` §4.
- **Nunca pongas el mail personal de nadie** en la app, los documentos, la configuración del servidor ni los commits. El único correo permitido es `contacto.vikarg@gmail.com` (`CONTACT_EMAIL`).
- **Filosofía:** todo lo que pueda ser local y propio, lo es. Los servicios de terceros son opcionales, configurables y reemplazables. Ninguna función puede depender de la red. Decisiones completas en `docs/ARQUITECTURA.md`.
- **Migraciones del servidor** (`server/src/db.ts`): siempre al final de la lista, jamás en el medio. Rompió producción una vez (v0.41.0).
- **No saltees protecciones de terceros** (Cloudflare, desafíos anti-bot, límites de uso) aunque el dato sea público. Se pide autorización o acceso formal.
- **No copies datos ni textos con licencia dudosa.** Anotá fuente, licencia y fecha de cada dato que cargues.
- **Datos sin licencia declarada: se usan con retribución** (crédito visible a la fuente en la app y en `docs/FUENTES-DE-DATOS.md`: organismo, enlace y fecha del dato). Licencia no comercial: se usa mientras la app sea gratuita y sin publicidad, con interruptor para apagarla en una copia paga. Si dice «Creative Commons» sin aclarar cuál, se asume CC BY (Atribución): se usa con el crédito. «Derechos reservados» o que prohíba redistribuir: no, salvo autorización. Share-alike (CC BY-SA, ODbL fuera de OSM): decisión caso por caso; hoy solo está aceptada para los datos hidrológicos de Colombia (IDEAM), como conjunto separado y con atribución completa.
- **Las alertas son «informativas»**, nunca oficiales (aclaración exigida por el SMN: `legal.smn`).

## Cómo se trabaja

- La carpeta `app/` es la app (React + TypeScript + Vite, PWA); `server/` es el servidor opcional (Fastify + SQLite); `tools/` genera paquetes de datos y diagramas; `docs/` es la documentación.
- Pruebas: `npx vitest run` y `npx tsc --noEmit -p .` por cada cambio (baratas); la e2e (`npm run e2e:full` en `app/`) se corre **una vez al final de un lote** y antes de publicar, no por cada cambio.
- Lo pendiente y lo hecho está en `docs/PENDIENTES.md`: actualizalo al terminar algo.
- Subagentes en `.claude/agents/`: ver tabla y regla de costo en `docs/COLABORAR.md` §6.

## Documentos

- `CONTRIBUTING.md`: acuerdo de contribución (doble licencia) y mínimos para enviar un aporte.
- `docs/COLABORAR.md`: cómo se trabaja, se publica y se prueba; entorno y servidor; agentes; decisiones que no conviene revertir.
- `docs/PENDIENTES.md`: lo hecho y lo que falta. **Arriba de todo está la primera tarea** (revisión de nudos y datos de cultivos, a hacer apenas se reinicia el límite semanal el domingo).
- `docs/PAISES-E-IDIOMAS.md`: qué hay que tocar para sumar un país o un idioma (lista completa de lugares del código y las herramientas) y los casos pendientes de Paraguay y portugués.
- `docs/FUENTES-DE-DATOS.md`: lluvia, radar del SMN, alertas y teléfonos de Bolivia y Perú, calendarios de huerta: qué se probó y qué no sirve.
- `docs/ENTRENAMIENTO.md`: requisitos originales de Entrenamiento.
- `docs/ARQUITECTURA.md` y `docs/SERVIDOR.md`: arquitectura y servidor.

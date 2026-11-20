# Portugués de Brasil (pt-BR): estado y dudas de traducción

Estado (2026-11-19): la **interfaz está completa** (`app/src/locales/pt.json`, 3.577 textos, mismas claves que `es.json` y `en.json`; `locales.test.ts` exige la paridad y los marcadores `{{x}}`). Es un **borrador hecho con Claude por lotes (6 agentes) sin revisión de una persona de Brasil**: antes de publicar el portugués, y sobre todo en lo que toca seguridad (primeros auxilios, alertas, toxicología, nudos), **hace falta que lo revise alguien que hable portugués de Brasil**. El **contenido largo** (nudos, huerta, semillas, nombres de países) sigue en español/inglés: ver el final. **La guía de primeros auxilios ya está traducida** (2026-11-20, ver abajo).

- Glosario y reglas de traducción usados: `docs/glosario-pt-br.md`.
- Validador de un archivo traducido contra el español: `node tools/i18n/validate-pt.mjs <pt.json> <es.json>` (claves, estructura y marcadores).
- Cómo cae al español: `fallbackLng: 'es'` (i18n.ts); lo que falte en `pt.json` se ve en español.

## Dudas que dejaron los traductores (para quien revise)

Términos y decisiones tomadas; cada una es un reemplazo global si se prefiere otra:

- **Recorrido / ruta / track:** «recorrido» → «rota» (glosario); los grabados: «trilha gravada» o «Trilhas» (título del módulo) o «track». «Ruta» como carretera: «rodovia» / «estradas». Alternativa para lo grabado: «percurso».
- **Sismos:** se tradujo «terremotos» en todo un bloque (el glosario no lo fija); alternativa «sismos».
- **Obra social / prepaga:** «plano de saúde» (con ejemplo «Unimed, Amil, SUS»); «carnet» → «carteirinha»; «DNI» → «RG» (puede ser inexacto para otros países).
- **Sistema de salud y organismos:** «Prefectura» (náutica) → «Prefeitura Naval» (adaptación); «Gendarmería» → «Gendarmeria»; «Protección Civil» → «Defesa Civil»; «Intendencia» → «Administração»; «guardería»/«guardaparques» → «posto de guarda» / «guarda-parques»; «Sistema de Alerta Temprana» → «Sistema de Alerta Precoce». Nombres propios locales sin traducir: «Línea Vida», «Familia Segura», «SOS Mujer», «Fono Ayuda», «Carabineros», «Inmujeres», «mutualista», «serenazgo», «huaicos», «comuna».
- **Huerta:** «almácigo» → «sementeira» (alternativas «semeadeira», «viveiro»); «cantero» → «canteiro»; «plantines» → «mudas»; «cuadros» → «quadros»; «helada blanca» → «geada branca»; «secano» → «sequeiro»; «Limiar» (umbral de pulso). Los títulos de publicaciones de `garden.sources` se dejaron en español (nombres propios de documentos). «Valles de Bolivia» → «Vales da Bolívia» y «Sierra del Perú» → «Serra do Peru» a confirmar.
- **Montaña y mapa:** «teselas» → «blocos do mapa»; «punto de escape» → «ponto de fuga» (alternativa «ponto de evacuação»); «cornisas» → «cornijas» (en Brasil, «cornija de neve»); «coladas» (avalanchas de nieve suelta) → «escorregamentos» (técnico: «avalanches de neve solta»); «placas» → «placas de neve»; «Punteros» (Alfa y Beta Centauri) → «Guardas (Alfa e Beta do Centauro)» (confirmar).
- **Mar:** escala de estado del mar con los nombres de la escala Douglas de la Marinha (Calmo, Encrespado, Suave, Leve, Moderado, Agitado, Muito agitado, Grosso, Enorme); «oleaje» → «ondulação»; «nafta» → «gasolina»; «GNC» → «GNV»; «gomería» → «borracharia»; «guarderías náuticas» → «garagens náuticas».
- **Puntos cardinales:** el Este pasa de «E» a «L» (Leste) en `geo.cardinal.E` y `cardinalLong.E`; solo se usa para mostrar (verificado en el código). Oeste «O» igual.
- **Abreviaturas:** «lpm» → «bpm»; HR → UR; «r.» (ráfagas) → «raj.»; NV → NG; «Ajustes» de iOS se dejó «Ajustes → Safari» / «Ajustes → VikArg» porque es el nombre que muestra iOS en español (en la app: «Configurações»).
- **Expresiones argentinas:** «Invitame un cafecito» → «Me pague um cafezinho»; el lema «Hay que estar listo para que no te agarre un imprevisto» → «É preciso estar pronto para que um imprevisto não pegue você de surpresa» (la más difícil de pasar); «Día por medio» → «Dia sim, dia não»; «Cargar sesión»/«Cargar a mano» → «Registrar sessão»/«Registrar manualmente» («carregar» sonaría a descarga).
- **Otros:** «Cabuyería» → «Nós e cordas»; «machete» (hoja de consulta) → «Resumo rápido»; «matafuegos» → «extintores»; «huella» (biometría) → «digital»; «clave» (biblioteca) → «Chave VikArg»; «Temporal» (viento) → «Vendaval»; «Inhalá/Exhalá» → «Inspire/Expire»; «Bajo techo» → «Em local fechado» (puede ser largo para un botón); «DMH», «DINAGUA», «SHN» sin traducir; «Servicio de Hidrografía Naval» y «Dirección de Meteorología e Hidrología» quedaron en español (nombres oficiales); la regla «GMER» se explicó en el texto (en portugués la sigla no funciona como regla mnemotécnica).
- **Comillas:** el original usaba «» y `\"`; el traductor del bloque 1 usó “ ” para evitar escapes.
- **Nombre que crea el app:** `biometric.cleanup` menciona «Prueba de biometría de VikArg», que es el nombre literal de la passkey: si ese nombre se traduce en el código, hay que ajustar el texto.

## Qué falta del portugués

1. **Revisión humana** (obligatoria antes de publicar; ver arriba).
2. **Contenido largo con tablas `{ es, en }` en el código** (nudos, anclajes, huerta, semillas, nombres de países en el mapa, estrellas): hoy un usuario en portugués lo ve en español. Hay que volver `pt` opcional (`pt?:`) en esos tipos y traducirlo por etapas.
3. **Mapa impreso** (`maps/print/*`): usa `es-AR` fijo para fecha, escala y textos «Escala» y «Hoja».
4. **Textos del servidor** (`outings/watch.ts`, `liveSessions.ts`, `sharedOutings.ts`, avisos de `announce.ts`): el aviso de actualización ya acepta `--title-pt/--body-pt` (opcional; sin él, español).
5. **Biblioteca** (`library-builder/books.yaml`): libros por idioma.
6. **Manifiesto, `index.html`, ficha de las tiendas** y política de privacidad en portugués.
7. **Notificaciones**: ya hay textos en portugués en `core/notifications/format.ts` (usan nombres genéricos de organismos); revisar con quien hable el idioma.

## Guía de primeros auxilios en pt-BR: PENDIENTE DE REVISIÓN POR UNA PERSONA (2026-11-20)

Es **contenido de seguridad** traducido por Claude **sin revisión humana**. Antes de publicar el portugués hay que hacer que lo lea alguien de Brasil con formación en primeros auxilios. Mientras tanto, la guía muestra en pt, siempre visible (no se puede ocultar), la frase «Tradução pendente de revisão por uma pessoa.» (`guides.ptPending`, `data-testid="guide-pt-pending"`, al pie de la lista y de cada pantalla).

- Alcance: 22 guías, 66 pantallas, 524 textos (títulos, palabras clave de búsqueda, pasos, preguntas y opciones) más el resumen «Lo primero» y el aviso legal (`guides.*` de `pt.json`). El tipo `LG` (`types.ts`) hace obligatorio el `pt` en cada texto de la guía y `content.test.ts` exige que ninguno quede vacío ni igual al español.
- Vocabulario: SAMU 192, Bombeiros 193, Polícia 190, Disque-Intoxicação 0800 722 6001; compresiones = «compressões torácicas»; torniquete = «torniquete»; DEA = «DEA»; zona agreste = «zona remota» (como el resto de la app); RCP = «RCP»; posición lateral de seguridad = «posição lateral de segurança».
- A mirar con atención: dosis y tiempos (aspirina 300 mg, 15 minutos de azúcar, 20 minutos de agua en quemaduras), la manobra de Heimlich, «soro antiofídico», «insolação/golpe de calor», «pneumotórax hipertensivo», y el paso de serpientes (habla de Argentina; ver `docs/investigaciones/guia-primeros-auxilios-simplificada.md`, apartado 5).
- Archivos: `app/src/modules/firstAid/guides/helpers.ts`, `topics-1.ts`, `topics-2.ts`, `topics-3.ts` (contenido), `types.ts` (`LG`, `GuideLang`, nombres del centro toxicológico en pt, `fillGuideText` con «ou»), `parts.tsx` (`useLang` devuelve `pt`), `GuidesPage.tsx` y `GuideTopicPage.tsx` (aviso), y `app/src/locales/pt.json` (claves `guides.first.*`, `guides.ptPending`).

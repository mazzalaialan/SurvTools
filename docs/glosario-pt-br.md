# Glosario y reglas de traducción es → pt-BR (VikArg)

Variante: **portugués de Brasil (pt-BR)**. Trato: «você» (neutro, informal-profesional); imperativo en tercera persona o infinitivo para botones («Toque», «Salvar», «Baixar»). Nada de «tu», ni voseo, ni portugués europeo («ecrã», «telemóvel», «utilizador»: NO; sí «tela», «celular», «usuário»).

## Nombre de la app
- «Herramientas de Supervivencia por VikArg» → **«Ferramentas de Sobrevivência por VikArg»**. El ícono dice «SurvTools» (no se traduce). «VikArg» no se traduce.

## Términos fijos (usar siempre igual)
| es | pt-BR |
|---|---|
| bóveda | cofre |
| contraseña | senha |
| copia de seguridad | backup |
| Ajustes / configuración | Configurações |
| Inicio | Início |
| Emergencia | Emergência |
| Orientación | Orientação |
| Meteo | Clima |
| Entrenamiento / Entrena | Treino |
| Inventario | Inventário |
| Cabuyería | Nós e cordas |
| nudo(s) | nó(s) |
| Huerta | Horta |
| Biblioteca | Biblioteca |
| Documentos | Documentos |
| primeros auxilios | primeiros socorros |
| botiquín | kit de primeiros socorros |
| brújula | bússola |
| inclinómetro | inclinômetro |
| altímetro | altímetro |
| declinación magnética | declinação magnética |
| linterna | lanterna |
| waypoint / punto guardado | waypoint |
| ruta / recorrido | rota |
| track / traza | trilha gravada (o «track» si el contexto es técnico) |
| salida (planificada) | saída |
| mapa sin conexión | mapa offline |
| sin conexión | sem conexão / offline |
| ahorro de batería | economia de bateria |
| rayos (tormenta) | raios |
| lluvia | chuva |
| viento | vento |
| satélite, radar | satélite, radar |
| alerta / aviso | alerta / aviso |
| «informativo, no oficial» | «informativo, não oficial» |
| país / provincia / departamento / región | país / província / departamento / região (según el país; mantené el término que dice el original) |
| pellizcar (zoom) | pinça com dois dedos |
| servidor | servidor |
| notificaciones | notificações |
| ubicación | localização |
| Desbloquear / bloquear | Desbloquear / bloquear |
| descargar (bajar datos) | baixar |
| actualizar | atualizar |
| copia paga / institucional | cópia paga / institucional |

## Reglas técnicas (OBLIGATORIAS)
1. Devolvé **JSON válido** con **exactamente las mismas claves y la misma estructura** que el archivo de entrada. No agregues, quites ni renombres claves (incluidos los sufijos de plural `_one`, `_other`, `_zero`, etc.). Los valores van traducidos.
2. Conservá intactos: marcadores `{{nombre}}`, etiquetas HTML o `<0>…</0>`, saltos `\n`, emojis, símbolos (°, ×, →, …), URLs, códigos, nombres de teclas, unidades abreviadas (km, m, mm, h, °C). Tienen que estar los mismos marcadores en cada valor.
3. No traduzcas nombres propios de organismos, servicios y productos (por ejemplo SMN, INA, SENAMHI, GOES-19, OpenStreetMap, Open-Meteo, NASA FIRMS, SINARAME, WhatsApp). Sí traducí los nombres comunes que los acompañan («Servicio Meteorológico Nacional» puede quedar como está porque es el nombre oficial argentino).
4. Plurales: mantené las claves `_one` / `_other` y usá la forma correcta del portugués (en portugués 0 y 1 son singular en la forma `_one` para la mayoría de los casos; no cambies la estructura de claves).
5. Formatos: decimal con coma si el texto escribe números a mano; fechas «dd/mm/aaaa»; la hora en 24 h. Si el original usa un ejemplo con «es-AR», dejalo como ejemplo de formato.
6. Texto de seguridad (primeros auxilios, toxicología, alertas, hipotermia, etc.): traducción **fiel y literal**, sin suavizar, sin agregar ni quitar pasos ni advertencias. Ante una duda de traducción, elegí la versión más literal y anotá la duda en tu informe final (no agregues claves al JSON).
7. Tono de las advertencias legales («informativo», «no oficial», «bajo tu responsabilidad»): igual de claro que el original.
8. Longitud: botones y etiquetas cortas, que entren en la pantalla de un celular.
9. No inventes información que no esté en el original ni la «mejores».

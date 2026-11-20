# Guía de primeros auxilios: responder en voz alta (análisis, 2026-11-20)

**Pedido del usuario:** que en la guía paso a paso la persona pueda **responder en voz alta** (en vez de tocar un botón) y se seleccione la opción. **Decisión (2026-11-20): hacerlo con un modelo propio sin conexión (Vosk o similar); no se hace ahora, queda en pendientes.** Los tamaños y tiempos de abajo son estimaciones, **no verificadas** el día del análisis: hay que medirlos en el prototipo.

## Por qué sirve
Es útil justo cuando las manos están ocupadas (RCP, presionar una herida, sostener a alguien). Es probablemente la mejora más práctica de la guía en esas situaciones.

## Opciones consideradas

| Opción | Sin conexión | Cuándo sirve | Esfuerzo estimado |
|---|---|---|---|
| Reconocimiento del navegador (Web Speech API) | **No** (en Chrome el audio va a servidores de Google; choca con la filosofía «todo local» de `docs/ARQUITECTURA.md`) | Solo web instalada y con datos | Bajo (~1 día) |
| Reconocedor de Android (plugin de Capacitor sobre `SpeechRecognizer`) | A veces (depende del paquete de idioma del teléfono) | Solo la APK; varía según el celular | Medio (1 a 2 días) |
| **Modelo propio sin conexión (Vosk, código abierto, o similar)** | **Sí, siempre** (~40 a 50 MB por idioma, se bajan como los paquetes de países) | APK y web (en la web, más pesado) | Alto (4 a 6 días con pruebas) |

**Elegida: modelo propio sin conexión.** (`whisper.cpp` tiny/base es la alternativa si Vosk no alcanza, pero pesa y gasta más batería; no se evaluó a fondo.)

## Criterios de diseño (a respetar al implementarlo)
- **Gramática cerrada:** en cada paso hay 2 a 6 respuestas posibles («sí», «no», «brazo o pierna»…). Vosk permite limitar el vocabulario a esas palabras: mucho más confiable y liviano que un dictado libre.
- **Nunca seleccionar a ciegas:** con estrés, viento o ruido una respuesta mal entendida puede llevar a un paso médico equivocado. Repetir lo entendido («Entendí: **sí**») y dar unos segundos para corregir. Los botones y «Volver al paso anterior» siguen siempre disponibles; la voz es un agregado, no un reemplazo.
- **Turnos de voz:** la guía ya lee los pasos en voz alta (`core/speech`); el micrófono escucharía esa voz. Cortar la lectura → pitido → escuchar 5 a 8 segundos → repetir lo entendido.
- **Idiomas:** es, en y pt, un modelo por idioma (como los paquetes de países: descarga con peso visible y se puede borrar). En portugués y en acentos regionales puede fallar más.
- **Batería y permisos:** permiso de micrófono; escuchar solo con la pantalla encendida y esperando una respuesta.
- **Interfaz:** función **experimental** en Ajustes («Responder con la voz»), apagada por defecto, primero solo en la APK.

## Plan sugerido
1. Prototipo sin conexión con gramática cerrada en español, en la APK, y probarlo en el Motorola con ruido y con el teléfono a distancia (lo que más importa: tasa de aciertos y de falsos positivos).
2. Si funciona, sumar inglés y portugués y el paquete descargable por idioma.
3. Pruebas: unitarias de la gramática por paso (a partir de las opciones de `content.ts`) y de la lógica de confirmación; la prueba real es en el teléfono.

## Riesgos abiertos
- Ambiente ruidoso o con viento: probablemente no será perfecto; solo se sabe probando.
- Tamaño del modelo en la APK/descarga y consumo de batería: a medir.
- Licencias: Vosk es Apache-2.0; verificar la licencia de cada modelo de idioma antes de redistribuirlo (anotar fuente, licencia y fecha según CLAUDE.md).

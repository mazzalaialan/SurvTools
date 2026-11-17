# Herramientas de Supervivencia por VikArg — Documento de Arquitectura

> *"Hay que estar listo para que no te agarre un imprevisto".*

| | |
|---|---|
| Estado | Aprobado |
| Fecha | 2026-10-30 |
| Licencia del código | Open source (repositorio público en GitHub) |

---

## 1. Principios rectores

Estos principios ordenan todas las decisiones. Ante una duda de diseño, se resuelve a favor del principio de mayor jerarquía.

1. **Offline-first absoluto.** Toda funcionalidad que *puede* funcionar sin internet, funciona sin internet. La red es una mejora, nunca un requisito.
2. **Autosuficiencia.** Todo lo que se puede tener local y propio, se tiene local y propio. Ningún servicio de terceros es imprescindible; los servicios externos (clima, servidor) son configurables y reemplazables.
3. **El dispositivo es la fuente de verdad.** El servidor es opcional y auxiliar (notificaciones y transferencia). Si desaparece, no se pierde nada.
4. **Privacidad por defecto.** Los datos del usuario se cifran en reposo. El backup sale cifrado.
5. **Modularidad.** Cada funcionalidad es un módulo independiente que se puede habilitar, deshabilitar o degradar según las capacidades del dispositivo.
6. **Diseño para crecer.** El modelo de datos está preparado para sincronización desde el día 1, aunque la sincronización continua no exista todavía.

---

## 2. Alcance y plataformas

| Tema | Decisión |
|---|---|
| Tipo de app | Progressive Web App (PWA) instalable |
| Plataformas objetivo | **Android (Chrome)** y **PC (Chrome / Edge)** |
| iOS | Fuera de alcance (no se bloquea, pero no se prueba ni se optimiza) |
| Distribución | Instalación desde el navegador. Opcional: APK (TWA) en GitHub Releases. **Sin Play Store** por ahora (ver §13) |
| Idiomas | Español e inglés desde el inicio, arquitectura multi-idioma |
| Unidades | Sistema métrico por defecto, imperial seleccionable en Ajustes |
| Usuarios | Un solo usuario por instalación. Puede tener varios dispositivos |
| Monetización | Gratuita |

### 2.1 Degradación por capacidades

No se detecta "es PC" o "es celular": se detecta **cada capacidad** (brújula, acelerómetro, GPS, cámara, lector de códigos, notificaciones, etc.).

- Si un módulo **no puede funcionar** sin la capacidad → se muestra deshabilitado (grisado) con un mensaje que explica qué falta.
- Si un módulo **puede funcionar degradado** → funciona con carga manual. Ejemplos:
  - Sol y luna: sin GPS, el usuario elige una ciudad.
  - Mapa estelar: sin brújula, se puede rotar a mano.
  - Waypoints: sin GPS, coordenadas escritas a mano.

---

## 3. Arquitectura general

```
┌──────────────────────────── Dispositivo (PWA) ────────────────────────────┐
│                                                                            │
│  UI (React)  ──►  Módulos de funcionalidad  ──►  Núcleo (core)             │
│                   inventario, alertas,           db, crypto, i18n,         │
│                   biblioteca, mapas, sensores,   sensores, unidades,       │
│                   astronomía, clima, backup...   temas, capacidades        │
│                                                                            │
│  Service Worker (Workbox): app offline, aviso diario en segundo plano,     │
│                            recepción de push                               │
│                                                                            │
│  Almacenamiento:                                                           │
│   • IndexedDB "vikarg-user"     → datos del usuario (CIFRADOS)             │
│   • IndexedDB "vikarg-content"  → metadatos de biblioteca y mapas          │
│   • OPFS                        → archivos grandes: libros, PDF, mapas     │
│   • Cache Storage               → la app en sí (HTML/JS/CSS/íconos)        │
└────────────────────────────────────────────────────────────────────────────┘
            │  (opcional, solo con conexión)
            ▼
┌──────────── Servidor VikArg (Docker, autoalojado) ────────────┐
│  • Notificaciones push programadas                             │
│  • Transferencia de backup con código                          │
│  • (Opcional) sirve la propia PWA y los paquetes de biblioteca │
└────────────────────────────────────────────────────────────────┘

Servicios externos opcionales y reemplazables:
  • Clima: Open-Meteo (open source, autoalojable, URL configurable)
  • Paquetes de biblioteca: GitHub Releases y/o servidor propio (espejos)
```

---

## 4. Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Lenguaje | **TypeScript** (estricto) | Tipado del modelo de datos; menos errores al escalar |
| UI | **React** | Ecosistema maduro, fácil de mantener por terceros (open source) |
| Build | **Vite** + `vite-plugin-pwa` (**Workbox**) | Rápido; genera el Service Worker y el manifest |
| Base local | **Dexie** (sobre IndexedDB) | Versionado de esquema y migraciones; volumen esperado bajo (miles de registros) |
| Archivos grandes | **OPFS** (Origin Private File System) | Libros, PDF y mapas de cientos de MB sin pasar por IndexedDB |
| Cifrado | **WebCrypto** nativo (AES-GCM, PBKDF2) + **WebAuthn PRF** para huella | Sin dependencias criptográficas externas |
| Estado | Zustand | Simple y liviano |
| Rutas | React Router | |
| i18n | i18next | Estándar; soporta plurales y fallback |
| Mapas | **MapLibre GL** + **PMTiles** + `maplibre-contour` | Mapas vectoriales offline; curvas de nivel calculadas en el dispositivo |
| PDF | **pdf.js** | Visor y extracción de texto para búsqueda |
| Búsqueda | **MiniSearch** | Índices serializables, se generan de antemano por paquete |
| Entrenamiento | Sesiones (caminata, correr, trekking, remo, ciclismo y bajo techo; tablas `workouts` y `outings`, cifradas) con calorías (ACSM y MET, con el peso de la ficha médica), tiempo en movimiento, ritmo o velocidad, parciales por km, desnivel, mapa y gráfico de desnivel; historial por semana, récords y salidas que agrupan actividades. Usa el grabador de Tracks, cuyos puntos llevan la hora | Sin GPS: carga manual y actividades bajo techo |
| Astronomía | `astronomy-engine` | Sol, luna, fases, planetas y coordenadas estelares, 100% offline |
| Declinación magnética | Modelo WMM (offline) | En Argentina el desvío supera los 10°; sin corregir, los rumbos son erróneos |
| Códigos de barras | `BarcodeDetector` nativo (Android). Respaldo `zxing-wasm` para PC: pendiente; mientras tanto en PC el código se tipea | |
| Imágenes | Compresión propia con `OffscreenCanvas` → WebP | Sin dependencias |
| Tests | Vitest + Playwright | |
| Servidor | Node.js + Fastify + SQLite, empaquetado en Docker | Mínimo, autoalojable en cualquier máquina |

**Arranque liviano (06/11/2026):** cada pantalla se carga recién al abrirla (`React.lazy` en `app/App.tsx`, `Suspense` alrededor del contenido en `Shell`); solo Inicio y las portadas de sección vienen en el archivo principal. Los stores que cargan datos al desbloquear o quedan escuchando (grabador de tracks, avisos) se importan igual al arrancar (`app/stores.ts`). El inglés se baja recién si se elige (el español es el respaldo y viene siempre). Lo que baja el celular al abrir la app pasó de 1,64 MB a 0,92 MB; todo sigue precacheado para usarse sin conexión.

---

## 5. Modelo de datos

### 5.1 Campos comunes (todas las entidades del usuario)

Preparan la app para sincronizar sin rehacer el modelo.

| Campo | Tipo | Uso |
|---|---|---|
| `id` | UUID v7 | Identificador global, ordenable por fecha, sin colisiones entre dispositivos |
| `createdAt` | ISO 8601 | |
| `updatedAt` | ISO 8601 | Resolución de conflictos (gana el último) |
| `deletedAt` | ISO 8601 \| null | Borrado lógico; se purga tras un período |

### 5.2 Entidades

```
Categoría 1───* Artículo 1───* Lote *───1 Ubicación (árbol, 4 niveles)
                    │                          │
                    └──* StockMínimo *─────────┘
Artículo / Documento / Ubicación / Waypoint ──* Adjunto (fotos)
```

**Categoría**
| Campo | Notas |
|---|---|
| `name` / `nameKey` | Las del sistema usan una clave de traducción; las del usuario, texto libre |
| `isSystem` | Las del sistema no se borran (sí se renombran u ocultan) |
| `hidden` | |
| `icon`, `color` | |
| `controlType` | `none` · `expiryDate` · `shelfLife` · `capacity` (ver §6) |
| `alertsEnabled` | Hay categorías sin notificaciones |
| `alertLeadDays` | Anticipación del aviso |
| `alertCapacityPct` | Umbral para tipo `capacity` |
| `order` | |

Categorías del sistema iniciales:

| Categoría | Control por defecto | Alertas |
|---|---|---|
| Agua | Fecha de vencimiento | Sí |
| Alimento | Fecha de vencimiento | Sí |
| Filtros de agua | Capacidad / usos | Sí |
| Filtros de aire | Fecha de vencimiento | Sí |
| Botiquín | Fecha de vencimiento | Sí |
| Energía / Iluminación | Vida útil desde fecha | Sí |
| Seguridad | Fecha de vencimiento | Sí |
| Fuego | Ninguno | No |
| Refugio | Ninguno | No |
| Abrigos | Ninguno | No |
| Higiene | Fecha de vencimiento | Sí |
| Herramientas | Ninguno | No |
| Entretenimiento | Ninguno | No |
| Otros | Ninguno | No |

**Ubicación**
| Campo | Notas |
|---|---|
| `parentId` | null = raíz |
| `depth` | 1 a 4 (validado). Ej.: Casa › Sótano › Estante 3 › Caja A |
| `name`, `notes` | |
| `waypointId` | Opcional: dónde está (uno de "Mis waypoints", o se crea con el GPS). Las de adentro heredan el de la de arriba. Sirve para los avisos de peligros naturales cerca de la reserva (ver "Avisos de peligros naturales") |

**Artículo** (*qué es*)
| Campo | Notas |
|---|---|
| `name`, `categoryId`, `notes`, `barcode` | |
| `unit` | Texto libre (ej.: "latas", "L", "raciones"). Sin conversiones. Vive en el artículo para poder sumar sus lotes |
| `weightGrams` | Peso por unidad, **guardado siempre en gramos**; se muestra en el sistema elegido |
| `favorite` | Marca de seguimiento / favorito |
| `controlType` | null = hereda de la categoría |
| `alertsEnabled`, `alertLeadDays`, `alertCapacityPct` | null = hereda de la categoría |

**Lote** (*cuánto hay, dónde y hasta cuándo*)
| Campo | Notas |
|---|---|
| `itemId`, `locationId`, `quantity` | |
| `expiryDate` | Tipo `expiryDate` |
| `manufactureDate`, `shelfLifeMonths` | Tipo `shelfLife`: vencimiento calculado |
| `capacityTotal`, `capacityRemaining`, `capacityUnit` | Tipo `capacity`. El remanente se **carga a mano** |
| `notes` | |

No se guarda historial de movimientos: solo el estado actual.

**StockMínimo**: (`itemId`, `locationId`, `minQuantity`). Lo define el usuario.

**Documento personal**: `title`, `notes`, `tags` + N adjuntos (fotos). Ej.: copias de DNI, escrituras, pólizas. Distinto de los libros de la biblioteca.

**Adjunto**: `ownerType`, `ownerId`, `mime`, `width`, `height`, `order`, `blob` (cifrado). Artículos: 0–1 foto típicamente; documentos: N.

**Waypoint**: `name`, `lat`, `lon`, `alt`, `icon`, `notes`.

**Grupo familiar y recomendaciones**
- `HouseholdMember`: `label`, `count` (ej.: "Adultos", 2; "Niños", 1; "Perros", 1).
- `RecommendationRule`: `description`, `categoryId` o `itemId`, `quantityPerMemberPerDay`, `unit`, `targetDays`, a qué miembros aplica.
- Las reglas **las define el usuario**; la app solo calcula y sugiere un stock mínimo, nunca lo impone.

**Huerta** (§10.1): `GardenBed` (cantero o maceta: medidas, sol, en invernadero, `waypointId`) y `Planting` (cultivo de la ficha, cantero y cuadros, almácigo o siembra directa, fechas, estado, notas, cosechas con el lote del inventario si se sumó). Foto de cada siembra como adjunto `planting`.

**Ajustes**: idioma, sistema de unidades, tema, ciudad o ubicación manual, URL del servidor, URL de clima, espejos de biblioteca, tiempo de autobloqueo. Huerta: zona (o automática), fecha de la última helada, avisos de helada y riego, y el último "regué" de cada lugar.

### 5.3 Índice de alertas (no cifrado)

Tabla mínima `AlertIndex` (`lotId`, `itemName`, `dueDate`, `kind`), **guardada sin cifrar**. Permite que el aviso en segundo plano funcione con la app bloqueada y es lo único que se envía al servidor de push. Contiene solo nombre del artículo y fecha; cantidades, ubicaciones, fotos y waypoints permanecen cifrados.

**Faltantes de un botiquín (2026-11-17):** para agrupar el aviso («Faltan 12 artículos en Botiquín del auto» en vez de una línea por artículo), el nombre de los artículos debajo del stock mínimo de un botiquín lleva también **el nombre del botiquín**, separado por U+001F (`KIT_SEPARATOR`, `core/notifications/format.ts`). Es una decisión consciente: el nombre de un botiquín («Auto», «Mochila de escape») es de la misma sensibilidad que el del artículo y queda en el índice en claro y en el servidor de push; no se agregó ninguna columna ni se cambió lo que acepta el servidor (guarda `itemName` tal cual, máx. 200). Quien no quiera que el nombre salga del dispositivo puede llamar al botiquín de forma genérica.

### 5.4 Versionado y migraciones

- Esquema versionado con Dexie; cada versión tiene su migración.
- El formato de backup lleva su propia versión (`formatVersion`) y la versión de esquema; la importación migra backups antiguos.

---

## 6. Vencimientos y alertas

### 6.1 Tipos de control

| Tipo | Ejemplos | Fecha / condición de alerta |
|---|---|---|
| `none` | Abrigos, Refugio | Nunca |
| `expiryDate` | Alimentos, medicamentos, matafuegos | `expiryDate − leadDays` |
| `shelfLife` | Pilas, baterías | `manufactureDate + shelfLifeMonths − leadDays` |
| `capacity` | Filtros de agua | `capacityRemaining / capacityTotal < pct` |

### 6.2 Herencia de configuración

Para cada lote: **artículo → categoría → valor global**. Si el artículo tiene valor, gana el artículo; si no, el de la categoría; si no, el global (30 días por defecto). Si la categoría tiene `alertsEnabled = false` y el artículo no lo sobrescribe, no hay alerta.

### 6.3 Canales de aviso (se suman)

| Nivel | Mecanismo | Requiere | Garantía |
|---|---|---|---|
| 1 | Panel de alertas al abrir la app | Nada | Siempre |
| 2 | Periodic Background Sync → notificación local | App instalada (Android) | Aproximadamente diaria; la frecuencia la decide Chrome |
| 3 | Web Push desde el servidor propio | Servidor configurado y conexión | Confiable |

> **Nota:** en Android, Chrome entrega todo push a través de Google (FCM). El contenido viaja cifrado de punta a punta (RFC 8291): Google no lo puede leer. Es una limitación de la plataforma, no evitable en una PWA.

---

## 7. Seguridad y cifrado

### 7.1 Esquema de claves

```
Contraseña (≥ 8 caracteres) ── PBKDF2-SHA256 (600k iter.) ──► KEK₁ ─┐
Clave de recuperación (impresa) ── PBKDF2 ───────────────────► KEK₂ ─┼─► envuelven a la DEK
Huella (WebAuthn PRF, opcional) ─────────────────────────────► KEK₃ ─┘
                                                                     │
                                         DEK (AES-256-GCM, aleatoria)┘
                                         cifra los datos del usuario
```

- La **DEK** (clave de datos) se genera una vez y nunca sale del dispositivo sin envolver.
- Cambiar la contraseña solo re-envuelve la DEK; no re-cifra los datos.
- **Clave de recuperación:** código largo mostrado una única vez en la configuración inicial, para imprimir o anotar.
- **Si se pierden contraseña y clave de recuperación, los datos son irrecuperables.** La app lo advierte explícitamente.
- Desbloqueo diario con huella (opcional); la contraseña se pide periódicamente y tras reinicios.
- Autobloqueo por inactividad (configurable).

### 7.1.1 Sin contraseña (opcional, 2026-11-12)

Al configurar la app se puede elegir «Usar sin contraseña» (con una advertencia). La DEK se guarda **sin envolver** en `meta` (`OpenVaultHeader`: `{ open: true, key }`, `core/security/vault.ts`) y la app se abre sola al iniciar (`unlockOpenVault` en `useVault.refresh`). Los datos siguen cifrados con la DEK, con el mismo formato: poner contraseña después (`addPassword`, Ajustes › Seguridad; da una clave de recuperación nueva) o quitarla (`removePassword`, pide la actual) solo cambia cómo se guarda la DEK, no re-cifra nada. Sin contraseña no hay bloqueo (ni botón, ni autobloqueo: `useVault.lock` no hace nada). El **backup** igual sale cifrado: se elige una contraseña para él al exportarlo o enviarlo (sin clave de recuperación; `vault.open` en el manifiesto) y al restaurarlo el dispositivo queda otra vez sin contraseña. Borrar la cuenta del servidor se confirma escribiendo BORRAR.

### 7.1.2 Datos de emergencia sin desbloquear (opcional, 2026-11-12)

Ajustes › Seguridad › «Mostrar datos de emergencia sin desbloquear» (`settings.emergencyOnLock`, por defecto no): la pantalla de la contraseña muestra los números de emergencia del país y, de cada persona (no mascotas), grupo sanguíneo, alergias, enfermedades, medicación, a quién avisar, médicos y obra social, como la ficha médica de los celulares. Es una **copia reducida sin cifrar** (`meta.emergencyCard`, `core/security/emergencyCard.ts`; sin notas, fotos ni fecha de nacimiento, solo la edad) que la app mantiene al día mientras está desbloqueada (`useEmergencyCardSync` en el Shell) y borra al desactivar la opción.

### 7.2 Qué se cifra

| Dato | Cifrado |
|---|---|
| Artículos, lotes, ubicaciones, documentos, waypoints, fotos, grupo familiar, reglas | **Sí** |
| Índice de alertas (§5.3) | No (decisión explícita) |
| Ajustes no sensibles (idioma, tema) | No (se necesitan antes del desbloqueo) |
| Datos de emergencia para la pantalla de bloqueo (§7.1.2), solo si se activan | No (decisión del usuario) |
| Todo, si se eligió usar la app sin contraseña (§7.1.1) | Cifrado, pero con la clave guardada al lado: en la práctica, sin protección |
| Biblioteca y mapas | No (contenido público y pesado) |

### 7.3 Consultas sobre datos cifrados

Los campos cifrados no se pueden indexar en IndexedDB. Dado el volumen esperado (miles de registros), **al desbloquear se descifra todo a memoria** y las consultas se hacen en memoria. Cada escritura se cifra y persiste al instante. Si el volumen creciera mucho, se agregan índices ciegos (HMAC) sin cambiar el modelo.

### 7.4 HTML importado

Los manuales HTML se muestran en un `iframe` con `sandbox` (sin scripts, sin acceso a la app) y una política CSP restrictiva.

---

## 8. Backup, restauración y transferencia

### 8.1 Archivo de backup (`.vikarg`)

ZIP con:
- `manifest.json`: `formatVersion`, versión de app y de esquema, fecha, encabezado criptográfico (DEK envuelta por contraseña y por clave de recuperación).
- `data.enc`: todas las entidades del usuario, cifradas.
- `attachments/*.enc`: fotos cifradas.
- Lista de paquetes de biblioteca y mapas instalados (**no** su contenido, para que el backup no pese GB). Al restaurar, la app ofrece volver a descargarlos.

Restaurar **reemplaza todo** (con confirmación). Para abrir el backup se pide la contraseña o la clave de recuperación.

### 8.2 Transferencia entre dispositivos

| Escenario | Método |
|---|---|
| Sin internet | Exportar archivo → botón *Compartir* de Android (Quick Share, Bluetooth, USB, mensajería) |
| Con internet | **Código de transferencia:** el backup (ya cifrado) se sube al servidor propio, que devuelve un código de 8 caracteres de un solo uso, válido 24 h. Se ingresa el código (o se escanea su QR) en el otro dispositivo |

Un QR con los datos completos se descartó: un QR guarda ~2,9 KB y un inventario con fotos pesa cientos de KB o más.

### 8.3 Compartir con un familiar (`.vikshare`)

A diferencia del backup (que reemplaza todo y se abre con la contraseña propia), sirve para pasarle datos a **otra persona con su propia bóveda**, y se **suma** a lo que ya tiene (`modules/share`).

- **Contenido elegible:** huerta (canteros con su waypoint, siembras y cosechas), fichas médicas (con su foto y sus médicos/veterinarios, que viajan siempre con ellas), el resto de los contactos y los documentos (con fotos). Si no van las fichas, los documentos llegan como generales.
- **Cifrado:** JSON comprimido (gzip) y cifrado con una DEK nueva envuelta con una **contraseña elegida para el envío** (PBKDF2 + AES-GCM, igual que la bóveda). La contraseña se dice por otro medio.
- **Mezcla (`merge.ts`, función pura con pruebas):** nunca borra.
  - *Fichas:* la misma si tiene el mismo id (ya compartida antes) o mismo nombre y especie y la fecha de nacimiento no se contradice; el resumen permite separarlas ("no es la misma persona").
  - *Datos sueltos* (nacimiento, grupo, alergias, enfermedades, notas, teléfono, obra social, datos de mascota): si falta se completa; si difiere se pregunta, y por defecto queda el propio. Fechas de vacunas y desparasitación: la más reciente.
  - *Listas* (medicamentos, médicos, contactos de emergencia): se suman las que faltan, sin duplicar (teléfonos comparados por sus últimos 8 dígitos).
  - *No viaja lo que depende de quién mira:* parentesco, "Yo", "Mostrar en contactos" y el orden de los documentos. Las fichas nuevas llegan sin parentesco.
  - *Contactos:* el mismo si tiene el mismo id o teléfono; solo se completan sus datos vacíos. Las referencias (médico de una ficha, contacto de emergencia que es otra ficha) se reubican a los ids locales.
  - *Documentos:* se agregan los que no están (por id), con sus fotos.
  - *Waypoints:* el mismo si tiene el mismo id o el mismo nombre a menos de 30 m. *Rutas:* se agregan las que falten (por id o nombre), apuntando a los waypoints propios.
  - *Inventario* (apagado por defecto): categorías del sistema por id y propias por nombre; ubicaciones por nombre dentro de la misma ubicación padre; artículos por nombre dentro de la misma categoría (se completan código, unidad, peso y notas vacíos); lotes y mínimos se agregan los que falten (por id), así recibir dos veces no duplica el stock. Pensado para quienes comparten la casa.
  - *Huerta*: canteros (el mismo por id o por nombre) con el waypoint de cada uno (viaja aunque no se compartan los waypoints: sin él no hay helada ni riego); siembras que falten (por id), sin pisar cuadros ocupados de este lado; las cosechas llegan sin el lote del inventario del otro.
- Recibir el mismo archivo dos veces no duplica nada.
- **Regla para módulos nuevos (huerta y los que vengan):** todo módulo con datos del usuario suma su sección en `SHARE_SECTIONS` (`modules/share/package.ts`) y su regla de mezcla en `merge.ts`, con pruebas, siguiendo los mismos principios: no borrar, reconocer lo mismo por id o por un dato natural, completar lo vacío y no pisar lo que depende de quién mira.

---

## 9. Servidor VikArg (opcional, autoalojado)

- **Imagen Docker** única: Node.js + Fastify + SQLite. Sin otras dependencias.
- **No hay instancia obligatoria:** cada usuario instala la suya o usa la de alguien de confianza. La URL se configura en Ajustes.
- Las claves VAPID (push) se generan en el primer arranque.

| Endpoint | Función |
|---|---|
| `GET /api/health` | Verificación desde la app; expone la clave pública VAPID |
| `POST /api/devices` | Registra la suscripción push; devuelve id + token del dispositivo |
| `PUT /api/devices/:id` | Reemplaza el índice de alertas (§5.3), zona horaria y hora de aviso |
| `PUT /api/devices/:id/stock` | Lugares con reserva del inventario (waypoints de las ubicaciones, ~1 km), solo para los avisos de peligros naturales |
| `PUT /api/devices/:id/garden` | Huerta (§10.1): un lugar por grupo de canteros a menos de ~1 km (coordenadas redondeadas, cultivos al aire libre y desde qué mínima se queman, datos del riego) y las tareas ya escritas. El servidor avisa la helada a partir de las 17 (la madrugada siguiente), el riego una vez por episodio y las tareas juntas a la hora de aviso |
| `DELETE /api/devices/:id` · `POST /api/devices/:id/test` | Baja · notificación de prueba |
| Tarea cada 10 min | Envía a cada dispositivo, a su hora local, solo las alertas nuevas o que vencen ese día |
| `POST /api/transfers` / `GET /api/transfers/:code` | Transferencia con código de un solo uso (§8.2) |

Implementación: Node 26 (TypeScript ejecutado sin build), Fastify y SQLite integrado (`node:sqlite`). Instalación: [SERVIDOR.md](SERVIDOR.md).
| Estático (opcional) | Sirve la propia PWA y los paquetes de biblioteca: instalación 100% autónoma |
| Mapas (opcional) | Sirve archivos PMTiles regionales con *range requests* para la descarga por área (§12) |

El servidor nunca ve datos del inventario, salvo el índice de alertas y, para los peligros naturales, un punto (~1 km) con el nombre de cada ubicación con waypoint donde hay reserva. De la huerta recibe un punto por lugar con los cultivos al aire libre y los datos del riego, y las tareas ya escritas. Los backups le llegan cifrados.

**Biblioteca privada** (fase Biblioteca, §11.2): los paquetes privados se sirven solo con la clave de acceso a la biblioteca privada configurada en el servidor.

---

## 10. Módulos

La app se organiza en siete secciones:

| Sección | Módulos |
|---|---|
| Emergencias (antes "Botiquín") | Contactos de emergencia, mi ubicación para socorristas, botiquines por tipo, ficha médica familiar, guías de primeros auxilios, radio |
| Documentos | Documentos personales con N fotos |
| Orientación | Brújula, declinómetro, inclinómetro, GPS y waypoints, mapas offline, mapa estelar |
| Meteorología | Clima, sol y luna, Mapa de alertas y clima (alertas oficiales y peligros naturales, §12.4) |
| Inventario | Artículos, ubicaciones, alertas, categorías, recomendaciones |
| Huerta y cultivo | Calendario de siembra y cosecha, canteros y seguimiento |
| Biblioteca | Manuales |

**Declinómetro** (`/orientation/declination`, después de la Brújula; `modules/declination`): declinación de cualquier lugar (GPS, waypoint o coordenadas a mano) con el modelo WMM 2025 incluido (`magvar`, válido 2025–2030; fuera de ese período avisa), con dibujo de los dos nortes, cambio anual (diferencia con la fecha de un año después), error en metros por km si no se corrige, conversor de rumbos magnético ↔ geográfico con la cuenta a la vista, cuenta para un mapa de papel viejo (declinación y variación anual del margen, con botones "Oeste (−)" y "Este (+)" y el signo escrito con el número; el modelo no sirve para años anteriores) y un machete: fórmulas, regla "de la brújula al mapa: Este se suma, Oeste se resta", regla nemotécnica GMER (de Geográfico a Magnético, el Este Resta), pasos con brújula de placa, brújulas con ajuste, norte de cuadrícula y valores de la región. La Brújula enlaza al Declinómetro. En toda la app se dice "norte/rumbo geográfico" (decisión del usuario, 06/11/2026), nunca "verdadero"; el machete aclara que en manuales en inglés es "true north".

Navegación en el celular: Inicio, Emergencias, Documentos, Orientación, Meteorología y "Más" (Inventario, Huerta, Biblioteca). Inicio muestra las secciones en ese mismo orden, con las alertas arriba de todo. En pantallas anchas el riel lateral muestra todas. Ajustes se abre desde la barra superior; incluye Backup y transferencia (§8). **Acerca de** (`/about`, al pie del Inicio y al final de Ajustes): versión, privacidad, código fuente, formulario para reportar un problema, sugerir una mejora o dejar un mensaje (con versión y datos técnicos del dispositivo opcionales) que se envía como issue de GitHub o se copia; también se puede enviar por mail a contacto.vikarg@gmail.com (`CONTACT_EMAIL` en `core/about.ts`, la casilla de contacto de VikArg), y más adelante por el servidor. Incluye el enlace a cafecito.app/vikarg.

**Botiquines.** Un botiquín es una ubicación del inventario con `kitType` (`general`, `trauma`, `bleeding`, `anaphylaxis`, `burns`, `other`): físicamente es una caja o mochila que puede estar en la casa, el auto o la mochila de escape. Su contenido son lotes del inventario (se cargan una vez); lo que falta sale del stock mínimo por ubicación. La sección muestra los vencimientos de todo lo que está en botiquines o en la categoría Botiquín.

**Ficha médica** (`MedicalProfile`, cifrada): nombre, fecha de nacimiento, grupo sanguíneo, alergias, enfermedades, medicación habitual (nombre, dosis, cuándo), contacto de emergencia, médico / obra social y notas.

**Avisos de tiempo (lluvia y rayos).** Se activan por punto: cada waypoint tiene su interruptor, y "donde estoy" es una opción aparte.
- *Lluvia:* pronóstico de Open-Meteo cada 15 minutos (`minutely_15`) para las próximas 2 horas. En Sudamérica esos valores se interpolan del pronóstico por hora (solo Norteamérica y Europa central tienen modelos nativos de 15 minutos), así que la precisión es la de una hora; un aviso al minuto requiere radar (§12.4). Avisa una vez por episodio ("lluvia en unos 45 min · Refugio"). Con la app abierta revisa cada 15 minutos. **Con la app cerrada** avisa el servidor propio (`server/src/rain`, `server/src/lightning`): la app le manda los waypoints con aviso y, salvo que se apague en Ajustes → Notificaciones (`serverLocation`, prendido por defecto por decisión del usuario), la última ubicación conocida, que lee al abrir y cada 15 minutos solo si ya hay permiso de GPS. Todo va redondeado a 0,01° (~1 km); al apagarlo el servidor la borra. Si "donde estoy" está a menos de 10 km de un waypoint con aviso del mismo dispositivo, se ignora (`server/src/places.ts`). Al abrir la app, hasta tener GPS, manda `keepHere` para no perder el episodio en curso. El servidor revisa cada 15 minutos, consulta Open-Meteo de a 50 puntos sin repetir lugares, avisa una vez por episodio (se mantiene si "donde estoy" se movió menos de ~10 km) y no usa ubicaciones de más de 24 h. El push lleva la misma etiqueta que el aviso de la app abierta (`rain-<lugar>`), así que no suena dos veces. La fuente es intercambiable (`RainSource`). Lluvia observada: NOAA retiró GOES RRQPE (`ABI-L2-RRQPEF`) el 2026-11-02 a las 15:00 UTC; el reemplazo (Enterprise Rainfall Rate, `ABI-L2-FLDK-RRQPE-AWIPS`) solo se distribuye por PDA. El servidor revisa una vez por día si aparece en el bucket abierto (`rain/noaaWatch.ts`, en `/api/health`). EUMETSAT no tiene la lluvia del GOES-East en su Data Store (solo por EUMETCast); su lluvia del MTG (H SAF h40B, cada 10 min, ~3 MB, cuenta gratuita) nos ve en el borde del disco, con píxeles muy deformados y ~25 min de demora: descartada por ahora. **Estimación propia** (`rain/goesIr.ts`, `rain/observer.ts`): con la banda 13 del GOES-19 (infrarrojo de 10,3 µm, cada 10 min, 24 MB por archivo en franjas de 24 filas a lo ancho del disco) se leen con lectura parcial solo las franjas que cubren los lugares con aviso (50 km alrededor; ~400 KB por franja) y se pasa la temperatura del tope a lluvia con el Auto-Estimator de NESDIS (Vicente et al., 1998: R = 1,1183·10¹¹·exp(−3,6382·10⁻²·T^1,2), tope 72 mm/h; llueve desde 1 mm/h, ~235 K). Si en el lugar (a menos de 5 km) hay lluvia estimada, el aviso es "está lloviendo" con la intensidad, aunque el pronóstico no la tuviera; si no, decide Open-Meteo, que también avisa "en X min". Datos de más de 30 min no se usan. Es orientativa: yunques de cirros fríos dan falsas alarmas y la lluvia de nubes bajas no se ve. `RAIN_OBSERVED=false` la apaga. **Capa "Lluvia estimada (satélite)"** del mapa del tiempo (`rain/map.ts`): mientras alguien pidió `/api/rain/map` en los últimos 15 min, cada archivo nuevo (10 min) el servidor lee la región entera (medido con Bolivia y Perú: ~12,5 MB por actualización y ~2,0 s de procesador, con lectura parcial), la pasa a Mercator con una tabla fija (720 × 1766 px, los mismos límites que el mapa: de 82° O a 52° O y de 58° S a 2° N, con Bolivia y Perú) y arma un PNG propio (zlib, sin dependencias, ~30 KB) transparente donde no llueve, de celeste (1 mm/h) a rojo (>40 mm/h). La app pide la ubicación de la imagen cada 5 min con la capa prendida y la dibuja entre el satélite y el radar. Pendiente: radar del SMN (acceso pedido).
- *Limitación de las PWA:* con la app cerrada el navegador no le da el GPS a la app, y el chequeo periódico de Chrome es de horas. Por eso, para "donde estoy" en segundo plano, el servidor usa la **última ubicación conocida**, que la app le envía cada vez que está abierta, e indica su antigüedad. Leer el GPS en segundo plano solo es posible con una app nativa.
- *Rayos (hecho, servidor):* GOES‑19 GLM de NOAA (dominio público, cubre Argentina, unos 8 km de precisión, retraso de alrededor de un minuto). Cada 60 s, si hay lugares con aviso, el servidor lee los tres archivos nuevos del minuto con h5wasm (WebAssembly, sin binarios nativos) y **lectura parcial** (`satellite/partial.ts`, común a rayos e infrarrojo): en un worker intercepta `fs.readSync` de h5wasm sobre un archivo disperso del tamaño real y, cuando falta un bloque de 1 KB, espera (`Atomics.wait`) a que un segundo worker lo baje con HTTP Range. Así baja ~36 KB de ~380 KB por archivo (~155 MB por día) sin bloquear el servidor; si falla, baja el archivo completo. Después se queda con los rayos de buena calidad de la región y avisa por push a menos de 30 km, con distancia y dirección, como mucho una vez cada 10 minutos por lugar. **En el mapa del tiempo** (capa "Rayos", necesita el servidor): la app pide `GET /api/lightning` cada 20 s solo con el mapa a la vista y la capa prendida; cada tanda reemplaza a la anterior. Cada rayo es un círculo amarillo y cada grupo (celda de 36 px) lleva un ⚡ que titila a destiempo (fijo con ahorro de batería); se dibujan encima de las etiquetas del clima. Alrededor de mi ubicación, anillos de 10, 20 y 30 km. El servidor busca rayos cada 20 s si hay lugares con aviso o si alguien pidió el mapa en los últimos 5 minutos (`lightning/store.ts`). Se descartó Blitzortung: sus condiciones no permiten usar los datos para sistemas de aviso.
- *Radar (fase Mapas):* necesita el motor de mapas. La API gratuita de RainViewer quedó limitada a zoom 7 y sin predicción (2026); las fuentes se evalúan al llegar a la fase Mapas.
- Todos estos avisos son orientativos, se calculan a partir de pronósticos y no son alertas oficiales.

**Guías de primeros auxilios** (`modules/firstAid/guides`, hecho): primero "Lo primero" (proteger, avisar, ¿responde?, ¿respira?, sangrado, abrigo) y un botón **Empezar evaluación** que pregunta en orden (escena segura → responde → respira → sangra mucho → qué le pasó) y deriva al tema. Cada tema es un **árbol de pasos y preguntas** (`content.ts`, ES/EN en el mismo archivo, con pruebas que verifican que toda opción lleve a un paso existente y que todo sea alcanzable) con botones para llamar y, en zona agreste, acceso a Mi ubicación. El entorno (**ciudad** o **zona agreste**) se elige arriba a mano o con **Detectar con mi ubicación** (`detect.ts`, sin conexión: lo más cercano entre hospitales y guardias (no postas ni centros de salud chicos), cuarteles de bomberos y localidades urbanas del nomenclátor, de todo el país; tiempo estimado en auto = distancia en línea recta × 1,3 a 60 km/h; más de 60 minutos = zona agreste; la falta de conexión sola no lo define porque también pasa en ciudades), y queda guardado: cada paso puede valer para uno, otro o ambos (en zona agreste: pedir rescate con coordenadas, espera larga, abrigo, evacuar e improvisar). Temas: RCP, inconsciente que respira, sangrado (presión, torniquete, uniones, tronco, shock), atragantamiento, serpiente (yarará, cascabel, coral; sin torniquete, antiveneno vía Centro de Intoxicaciones), picaduras (alacrán, arañas, abeja), anafilaxia, caída de altura / columna, fracturas, quemaduras (térmica, química, eléctrica), dolor de pecho, ACV, convulsión, intoxicación y monóxido, hipotermia, golpe de calor, hipoglucemia y ahogamiento. El contenido sigue las recomendaciones del ERC (2021), la IFRC (2020), la AHA y la guía de ofidismo del Ministerio de Salud; la app aclara que no reemplaza un curso. **Lectura en voz alta** (`core/speech/speech.ts`, ajuste `guideVoice`): botón de altavoz en cada paso; lee título, instrucciones, pregunta y opciones con la voz del sistema (Web Speech API; en Android, las voces de Google instaladas, sin conexión; se prefiere una voz local y, en español, la de Argentina). Sin voz para el idioma, el botón no aparece. Una web no puede saber si hay una llamada en curso: la lectura se corta al tocar un botón de llamar y al pasar a segundo plano (abrir el marcador), y al volver no sigue sola (botón "repetir"). No se puede elegir altavoz o auricular: sale por el audio multimedia. Pendiente: enlazar con los manuales de la Biblioteca cuando exista.

**Números de emergencia por país** (`emergency/national.ts`; el país se detecta por la zona horaria y se cambia en Contactos o en la guía, queda en `settings.country`):
- *Argentina:* 911, 107, 100, 103, 106, 105, Centro Nacional de Intoxicaciones (0800-333-0160), Toxicología del Hospital de Niños R. Gutiérrez (0800-444-8694), Hospital de Quemados de la Ciudad (011 4923-4082), Línea de Salud Mental del Ministerio de Salud (0800-999-0091, 24 h) y 144.
- *Chile:* 131 SAMU, 133 Carabineros, 132 Bomberos, 134 PDI, 137 rescate marítimo, CITUC (+56 2 2635 3800, 24 h) y \*4141 prevención del suicidio.
- *Uruguay:* 911 (todas las emergencias), 104 Bomberos, 106 Prefectura, CIAT del Hospital de Clínicas (1722, 24 h), Línea Vida (0800 0767 / \*0767) y violencia doméstica (0800 4141 / \*4141).

**Datos sin conexión por país** (`emergency/country.ts`, `loadCountryData`): Argentina viene con la app (bomberos, comisarías y salud de PBA, Radio Nacional, nomenclátor Georef). Chile y Uruguay son **paquetes aparte** (`app/public/data/CL.json` ~420 KB y `UY.json` ~265 KB, generados con `tools/country-data/build.mjs [UY|CL]`: bomberos, policía y centros de salud de OpenStreetMap (ODbL); en **Uruguay** la base son los listados oficiales del catálogo de datos abiertos (Licencia de Datos Abiertos de Uruguay): 278 comisarías con teléfono y dirección y 77 destacamentos de bomberos del Ministerio del Interior, y las unidades asistenciales de ASSE (hospitales, centros de salud, policlínicas y consultorios, con teléfono), y de OpenStreetMap se suman los que no están a menos de 150 m (mutualistas, emergencias móviles; marcados `osm`) y el teléfono que le falte a uno oficial. Uruguay no publica frecuencias de emergencia ni contactos o límites de las áreas del SNAP, así que no tiene sección de parques. Localidades con población de GeoNames (CC BY 4.0) y radios), fuera de la precarga del service worker (`globIgnores: data/**`): se bajan en segundo plano al elegir el país (`useCountryPrefetch`) y quedan en Cache Storage (`vikarg-country`) para usarlos sin conexión; con conexión se renuevan solos. Los usan Buscar cercanos, la radio más cercana, la detección de ciudad o zona agreste y la ubicación de repetidoras de RepeaterBook sin coordenadas. Radio: Uruguay muestra Radio Uruguay (SODRE, AM 1050) y su red de repetidoras FM; Chile, que no tiene radio pública nacional, la red de Radio Bío-Bío (privada, todas las regiones) con una nota sobre el Sistema de Alerta de Emergencia (SAE) de SENAPRED. Pendiente: pasar también Argentina a paquete para aliviar la descarga de quienes usan la app en otro país.

**Datos que se actualizan solos (06/11/2026):** el servidor propio vuelve a generar cada mes los parques de Argentina (`parks-AR.json`) y de Chile, y los paquetes de Chile y Uruguay, con las mismas herramientas de `tools/` (`server/src/data/update-data.sh`, por cron, dentro de un contenedor de Node; las herramientas ya no dependen de `node_modules`). Los ofrece en `GET /api/data/:file` (solo los de la lista `DATA_FILES`; desde el 2026-11-12, también las estaciones de servicio `fuel-XX.json`). La app (`emergency/dataFile.ts`) compara `generatedAt` y se queda con la copia más nueva entre la que trae, la guardada y la del servidor (`preferNewer` para lo que viene dentro de la app, como los parques de Argentina). Un archivo nuevo reemplaza al anterior solo si es JSON válido, trae fecha y no es mucho más chico. Las repetidoras de Chile (PDF de SUBTEL) siguen a mano.

La guía de primeros auxilios escribe los números con marcas (`{medical}`, `{same}`, `{emergency}`, `{fire}`, `{poison}`) que se completan según el país (`fillGuideText`), y sus botones de llamada salen de `CALLS[país]` sin repetir.
**Contactos de emergencia** (`modules/emergency/`, tabla `contacts`, cifrada y en el backup): Buscar cercanos tiene rangos de 5 a 200 km y "lo más cercano (sin límite)": los 3 más cercanos de cada tipo con los datos oficiales incluidos, y OpenStreetMap hasta 200 km; si no hay nada en el rango, muestra igual lo más cercano de cada tipo (zonas agrestes). la pantalla va en este orden: mis datos, números nacionales, **servicios de emergencia cercanos** (los contactos de tipo policía, bomberos, ambulancia, hospital o defensa civil, guardados desde "Buscar cercanos" o a mano, con el botón de búsqueda) y **mis contactos** (familia, médicos de las fichas, obra social y el resto). números nacionales (911, 107 SAME, 100, 103, 105, 106, Intoxicaciones 0800-333-0160, 144; fuente argentina.gob.ar), contactos propios y búsqueda de cercanos. El teléfono se toca para llamar (`tel:`) o se copia; la dirección abre Google Maps.
- *Cercanos sin conexión:* datos oficiales incluidos en la app (`tools/emergency-data/build.mjs`, CC BY 4.0), de **todo el país**: cuarteles de bomberos (IGN / Consejo Nacional de Bomberos Voluntarios, ~1.080), edificios de seguridad (comisarías, destacamentos, Gendarmería, Prefectura, puestos camineros, guardaparques; capa del IGN, ~3.500) y establecimientos de salud (capa del IGN con SISA, ~7.000; sin teléfono). En la Provincia de Buenos Aires mandan los listados provinciales, que traen teléfono y dirección (~320 comisarías y ~2.300 de salud): un punto del IGN a menos de 150 m de uno provincial se descarta. Teléfonos de OpenStreetMap (ODbL) incluidos al generar: a cada punto del IGN sin teléfono se le pasa el de un lugar de OSM del mismo tipo a menos de 400 m con nombre equivalente (la mitad o más de las palabras importantes en común, mirado desde los dos lados), y se suman los lugares de OSM con teléfono que el IGN no tiene (si no hay otro del mismo tipo a 150 m). Resultado: ~4.200 de seguridad (1.266 con teléfono) y ~10.700 de salud (3.913 con teléfono); ~2 MB (445 KB comprimido). Si Overpass corta la respuesta ("remark" o menos de 4.000 lugares), el generador prueba el espejo y si no, no genera. El REFES nacional se descartó: la última versión (2024) no trae coordenadas ni teléfono.
- *Con conexión:* se suma OpenStreetMap (Overpass, con un espejo de respaldo porque los servidores públicos a veces se saturan) y se unen los duplicados (mismo tipo a menos de 150 m), completando teléfono y dirección.
- *Filtros y servicios (2026-11-12):* Todo · Policía · Bomberos · Salud · Defensa Civil · Vehículos · Agua · Refugios · Cajeros. Salud tiene opciones: hospitales y centros de atención (la que viene elegida), farmacias, desfibriladores (DEA) y veterinarias; Vehículos: estaciones de servicio (elegida), gomerías y talleres mecánicos. «Todo» son solo los servicios de emergencia (policía, bomberos, hospitales y centros de atención, Defensa Civil): el resto se ve con su filtro, porque en una ciudad hay decenas de cada uno y taparían a los demás. Los servicios vienen de un archivo por categoría y país, `app/public/data/<categoría>-<país>.json` (categorías `fuel`, `tyres`, `repair`, `pharmacy`, `aed`, `vet`, `water`, `shelter`, `atm`; generados con `tools/services-data/build.mjs [país] [categoría]`), fuera de la descarga inicial: se bajan en segundo plano con el país (`prefetchServices`, solo los que falten) y quedan guardados; el servidor los regenera cada mes. Fuente: OpenStreetMap; las estaciones de Argentina, el listado oficial de la Secretaría de Energía (precios vigentes en surtidor, Res. 314/2016, CC BY 4.0; ~4.100 que informaron en los últimos 2 años, con bandera, dirección y combustibles) más las de OpenStreetMap que faltan (a más de 150 m, o 400 m si son de la misma bandera). Agua: bebederos, canillas, puntos de agua y vertientes (se aclara si la vertiente es potable, no potable o no se sabe). Refugios: de montaña, no atendidos y vivacs (no las paradas de colectivo), con altura y capacidad. DEA: con dónde está adentro del edificio, si se sabe. Con conexión, Overpass suma solo la categoría elegida (`SERVICE_SELECTORS` en `osm.ts`, las mismas etiquetas que el generador). Se guardan como contacto de su tipo, en la sección de servicios (el veterinario, en «mis contactos»).
- *Ver en el mapa (2026-11-12):* botón debajo de los filtros que cambia la lista por un mapa (`NearbyMap.tsx`, MapLibre cargado aparte) con un punto y el nombre de cada resultado visible, del color de su tipo (`MapPoint.tone`), y el punto de búsqueda; arranca encuadrando todo (`MapView.initialBounds`). Tocar un punto muestra su ficha (teléfono y «Cómo llegar», que abre «Ir a un punto» en el mapa). Sirve para ver qué se alcanza de verdad (un lago, la ruta), cosa que la distancia en línea recta no dice.

**Mi ubicación para socorristas:** coordenadas (decimal y GMS), precisión y altura; con conexión, dirección aproximada (Nominatim), calles cercanas, ruta y mojón kilométrico (Overpass); sin conexión, distancia y rumbo al waypoint más cercano. Arma un mensaje listo para copiar, compartir, SMS o WhatsApp, y un botón para llamar al 911.

**Radio:** Radio Nacional más cercana con AM/FM (incluida en la app; fuente Wikipedia, ubicada con OpenStreetMap), frecuencias internacionales de socorro (VHF marítimo canal 16, aeronáutica 121,5 MHz) y nota sobre radioaficionados: un texto general (escuchar no requiere licencia; ante peligro de vida se puede pedir auxilio por cualquier medio) y la licencia según el país elegido (ENACOM, SUBTEL o URSEC). **Frecuencias de montaña** (con país Argentina o Chile, las de los dos países juntas: en la cordillera se está a pocos km del otro): FEM 140,970 MHz (solo emergencias) y las de uso libre 139,970 y 138,510 MHz (Resolución 5/2015; Federación Andinistas Argentinos 2021, Club Andino Mercedario 2024); en Chile no hay frecuencia oficial de montaña: se muestra la del Cuerpo de Socorro Andino (150,625 MHz, de guías de montaña, sin confirmación oficial) y se recomienda escuchar también la FEM. **Solo con la vida en peligro** (decisión del usuario, 2026-11-05: ante un peligro de vida se puede pedir auxilio por cualquier medio), marcadas "Solo si tu vida depende de eso": guardaparques 142,800 MHz (Andesport, Aconcagua; Meunier; sin publicación oficial), CONAF 143,950 MHz y Radio Club de Carabineros 146,910 MHz (repetidora de radioaficionados; Wikiexplora). **Parque nacional** (solo Argentina; `tools/emergency-data/parks.mjs` → `emergency/parks-data.json`, 49 áreas de Parques Nacionales): límites del IGN (capa "Área protegida", jurisdicción nacional, simplificados a ~150 m), intendencia, dirección y teléfonos de la página de cada área en argentina.gob.ar (CC BY 4.0, copiados a mano porque las páginas no tienen formato fijo), teléfonos de emergencia publicados (ICE 105 y radioestación del Nahuel Huapi, Campo San Juan, Iguazú, Jaramillo) y **solo las frecuencias VHF que el propio parque publica para visitantes**, con su fuente: 155,675 MHz "VHF de Emergencia APN" en Nahuel Huapi y Los Arrayanes (mapa de trekking de Villa La Angostura; hoja Pampa Linda), 150,335 MHz ICE y 148,450 MHz Club Andino Bariloche (hoja Pampa Linda), y 155,675 MHz en Lanín (carteles en la base del volcán, la intendencia y Cerro Colorado, vistos por el usuario en 2026). No se supone que una frecuencia vale en un parque que no la publica. **Chile (CONAF)**: `tools/emergency-data/parks-cl.mjs` → `app/public/data/parks-CL.json` (112 áreas; se baja aparte como el paquete de Chile, también con país Argentina por la cordillera): contactos del bloque "Información de contacto" de cada página de conaf.cl (oficina regional o de la unidad; el teléfono de un administrador queda como "Administración", sin el nombre), el 130 de CONAF (incendios forestales) y la frecuencia VHF que la página publica (143,800 MHz en Torres del Paine y Kawésqar, con la frase citada); límites de OpenStreetMap (ODbL), 10 monumentos chicos sin límite. La 143,950 de Wikiexplora queda en la lista general con el aviso de que no está confirmada y que en Magallanes CONAF publica la 143,800. **Bolivia y Perú (2026-11-08):** `tools/emergency-data/parks-bo.mjs` → `parks-BO.json` (áreas protegidas del SERNAP, de OpenStreetMap, ODbL, con el contacto de la sede central) y `parks-pe.mjs` → `parks-PE.json` (SERNANP, capa "ANP Nacional Definitiva", con el contacto de la sede central); ninguno publica frecuencias propias, así que su texto de parques no menciona frecuencia. Perú suma la red de emergencia de radioaficionados RENER con las frecuencias confirmadas del manual 2024 del Radio Club Peruano. Se bajan aparte, como los de Chile. **Frecuencias de parques** en Radio (Argentina y Chile): primero el parque donde se está o a menos de 5 km del límite (frecuencias, teléfonos de emergencia, intendencia u oficina; si no publica frecuencia: la FEM), después hasta 10 parques más que publican frecuencia y están a menos de 50 km del límite. **Las de montaña de cada país solo si el lugar está en ese país o a menos de 50 km de su frontera** (decisión del usuario, 2026-11-06): contorno de Argentina y Chile de Natural Earth 1:50 m (dominio público; `tools/emergency-data/borders.mjs` → `emergency/borders-data.json`, 54 KB, va con la app y funciona sin conexión; `emergency/borders.ts`). Todo se mide desde el lugar elegido arriba en Radio (GPS o coordenadas a mano); sin lugar, se muestran todas las de montaña y ningún parque lejano. Así las frecuencias quedan en tres lugares: generales (montaña), por parque (parques) y repetidoras. En Buscar cercanos se suman las intendencias (con internos, teléfonos de emergencia y frecuencias; las que comparten intendencia van en una sola fila) y las seccionales y guardaparques de adentro de un parque llevan sus frecuencias. **Mis frecuencias:** las que le dan al usuario en un refugio o un club (tabla `contacts`, `kind: 'radio'`, con tono, notas y lugar). **Repetidoras:** se **importan** desde un archivo que el usuario exporta para uso personal (RepeaterBook: CSV, GPX o KML con coordenadas; o CSV de CHIRP, sin coordenadas) y se ordenan por cercanía. El CSV de RepeaterBook para Argentina **no trae coordenadas** (solo "Localidad - detalle"): esas se ubican en el centro de su localidad con un nomenclátor incluido en la app (`places-ar.json`, Georef INDEC/IGN CC BY 4.0 + población de Natural Earth para desempatar nombres repetidos; `tools/places-data/build.mjs`; se carga solo al importar) y la distancia se muestra con "≈"; se guardan cifradas (`repeaters`) y viajan en el backup. Las de RepeaterBook no se incluyen en la app: sus condiciones prohíben redistribuir, guardar para uso sin conexión o espejar sin permiso escrito, y su API requiere aprobación (pedido de permiso enviado desde contacto.vikarg@gmail.com; también al Radio Club Argentino por un listado para Argentina). **Listados oficiales** (información pública del Estado): Chile, el "Listado oficial de repetidoras" de SUBTEL (`tools/country-data/repeaters-cl.py` lee el PDF → `app/public/data/repeaters-CL.json`, ~190 repetidoras con radioclub titular, coordenadas y vencimiento de la licencia; `emergency/officialRepeaters.ts`). Se baja aparte y queda guardado como los paquetes por país; se muestra con país Chile y, con Argentina, las que estén a menos de 150 km del lugar (cordillera). Se mezclan con las importadas por cercanía, sin duplicar; las de licencia vencida se marcan. Argentina (ENACOM) y Uruguay (URSEC) no publican un listado de repetidoras. Cada repetidora tiene "Avisar que no funciona o tiene datos mal", que abre el formulario de Acerca de con los datos ya escritos (`/about?tipo=bug&texto=…`). **No se incluyen frecuencias de Gendarmería ni policía:** no son públicas, muchas están cifradas y captarlas sin autorización puede ser delito (Código Penal, art. 153). Las de guardaparques, CONAF y el Radio Club de Carabineros van solo para pedir auxilio con la vida en peligro (ver arriba).

| Módulo | Descripción | Sin sensor / sin red |
|---|---|---|
| Inventario | Artículos, lotes, categorías, stock mínimo, favoritos, búsqueda, peso total por ubicación | — |
| Ubicaciones | Árbol de 4 niveles | — |
| Alertas | §6 | — |
| Fotos | Cámara o archivo → WebP, máx. 1280 px, calidad ~0,75 | Archivo desde disco |
| Códigos de barras | Escaneo para buscar o crear artículos | Carga manual |
| Documentos | Documentos personales con N fotos y vencimiento opcional: avisa 60 días antes (turnos y trámites), en Inicio, Alertas y notificaciones (`doc:<id>` en el índice, tipo `expiry`) | — |
| Recomendaciones | Calculadora según grupo familiar y reglas del usuario | — |
| Brújula | Rumbo magnético y geográfico (WMM); integrada con mapas y estrellas | Deshabilitada |
| Inclinómetro | Pendiente en grados con la escala de avalanchas (como CalTopo y swisstopo): menos de 25° verde, 25–30° ámbar, 30–45° rojo (la gran mayoría de las placas), 45–55° naranja (menos placas, coladas frecuentes) y más de 55° gris (pared o roca); el riesgo nunca baja con más pendiente; aviso de que es orientativo. Tres modos con un dibujo de cómo poner el celular: Apoyado (sobre la ladera), Apuntando (a lo largo de la mira) y Horizonte (parado, vertical u horizontal: horizonte artificial e inclinación lateral con un decimal, "derecho" o hacia qué lado; sin zonas de avalancha) | Deshabilitado |
| Mapas offline | §12. En Orientación va tercero, después de Brújula e Inclinómetro | — |
| Waypoints y Rutas | Guardar puntos; rumbo y distancia a un waypoint. Las rutas (puntos unidos en orden) van abajo, en la misma pantalla (`/orientation/routes` redirige ahí) | Coordenadas manuales |
| Tracks | Importados (GPX) y grabados con la app (§16, Mapas) | — |
| Astronomía | Amanecer, anochecer, crepúsculos, fases lunares | Ubicación por GPS, por ciudad cercana (lista offline GeoNames) o tocando un punto en el mapa |
| Clima | Pronóstico descargado y cacheado; muestra "actualizado hace X" | Último dato guardado |
| Mapa estelar | Carta del cielo orientada con la brújula; estrellas hasta mag. ~5,5, constelaciones, planetas; Cruz del Sur destacada para hallar el sur | Rotación manual |
| Biblioteca | §11 | — |
| Huerta | Fichas, calendario por zona, canteros en grilla, seguimiento, avisos de helada y riego (§10.1) | Zona elegida a mano |
| Backup | §8 | — |
| Ajustes | Idioma, unidades, tema, seguridad, servidor, espejos | — |

**Posibles cornisas (06/11/2026):** subopción del riesgo de avalancha, prendida por defecto (`mapLayers.cornices`), en violeta. Desde el zoom 13 se marca el borde de arriba de los filos donde, siguiendo el viento (el mismo de la carga por viento: reciente, habitual o del oeste), el terreno cae al menos 30° de pendiente media en 90 m y del lado del viento no hay nada más alto en 30 m; solo por encima de la línea de nieve (`corniceMask` en `maps/slope.ts`). Se mide en metros, no en píxeles, para que dé lo mismo en cualquier zoom (la tesela lleva el margen necesario). Con la elevación de ~38 m por píxel los filos salen redondeados: es orientativo y marca de menos; una caída más corta (35° en 30 m) casi no aparecía en el Cerro Catedral.

### 10.1 Huerta (definida el 05/11/2026)

Se hace todo junto: fichas, calendario, canteros, seguimiento y avisos.

**Fichas de cultivo** (incluidas en la app, sin conexión): unas 35 hortalizas y aromáticas de la huerta familiar. Cada una tiene familia (para la rotación), forma de siembra (directa o almácigo y trasplante), distancia entre plantas y entre líneas, días hasta la cosecha, comportamiento ante la helada (resistente, semirresistente, sensible), si tolera media sombra, si se puede en maceta, con qué asociarla y con qué no, con qué rotarla, período crítico de falta de agua, rendimiento orientativo y cómo se cosecha.

**Zonas.** Se sugieren con el waypoint de un cantero (si no hay, con el lugar del clima o el GPS: solo define la región). Regiones del INTA ProHuerta: Pampeana (centro y AMBA), NEA, NOA, Cuyo, Patagonia norte (valles irrigados) y Patagonia sur y andina. La app sugiere la zona según la ubicación y se puede cambiar a mano. **Chile y Uruguay** no tienen calendario oficial de huerta familiar (INIA Chile e INIA/MGAP Uruguay, revisado el 05/11/2026), así que usan la zona argentina de clima parecido y la app lo aclara: Uruguay → Pampeana; Chile central (Valparaíso a Biobío) → Cuyo; Araucanía a Aysén → Patagonia sur y andina; Magallanes → Patagonia sur y andina; norte de Chile → NOA. Opcionalmente, el usuario carga la fecha de su última helada de primavera: los cultivos sensibles no se recomiendan al aire libre antes de esa fecha.

**Fuentes de datos** (se citan en la app):
- Planificador ProHuerta (Parés, Ediciones INTA 2012, argentina.gob.ar): fichas y calendario de la zona Pampeana.
- Manual de cultivos para la huerta orgánica familiar (Goites, INTA 2008, CC BY 4.0): fichas, rendimientos, períodos críticos de agua.
- Calendario de cultivo a campo para el norte de la Patagonia (INTA EEA Alto Valle) y calendario del Valle Inferior del río Negro (INTA EEA Valle Inferior): Patagonia norte; también referencia para Cuyo.
- Planificador de huerta del sur de Santa Cruz (INTA EEA Santa Cruz): Patagonia sur y andina.
- Calendario de huerta agroecológica de La Rioja (INTA EEA La Rioja) y temporadas de Mendoza (INTA AER Rivadavia): NOA y Cuyo.
- Calendario de siembra para La Pampa (INTA EEA Anguil): control de la zona Pampeana.
- NEA: sin cartilla regional encontrada; se arma con la Pampeana corrida para clima subtropical (sin heladas fuertes, verano muy caluroso) y se marca como estimada.
Las publicaciones del repositorio del INTA tienen licencia CC BY-NC-SA 4.0: de ellas se toman solo datos (meses, distancias, días), no textos ni imágenes, y se citan.

**Calendario.** "Este mes": qué sembrar directo, qué almacigar, qué trasplantar y qué cosechar en la zona. Línea de 12 meses por cultivo con franjas de siembra directa, almácigo, trasplante y cosecha, y la marca de hoy.

**Canteros** (tabla `gardenBeds`, cifrada): nombre, tipo (cantero o maceta), **en invernadero** sí/no, ancho y largo, horas de sol directo, **waypoint** (uno de "Mis waypoints", como las ubicaciones del inventario; se puede crear en el momento con el GPS), notas. La helada y el riego se calculan **solo con el waypoint del cantero** (el GPS del celular está donde está la persona, no la huerta): un cantero sin waypoint no tiene esos avisos y la app lo marca. Los canteros cuyos waypoints están a menos de ~1 km son **un solo lugar con un solo aviso** (todos los de casa avisan una vez); canteros en lugares distintos (casa y campo) tienen cada uno su pronóstico, su lluvia, su aviso y su "regué". Los que están en invernadero no cuentan para el aviso de helada ni para el cálculo de riego por lluvia (no les llueve: se riegan siempre a mano). Se dibujan como **grilla de cuadros de 30 cm** (una maceta chica es un solo cuadro). Cada cuadro tiene lo que está plantado ahí. **Recomendaciones por cantero**: cultivos que se pueden sembrar o trasplantar ahora o el mes que viene en la zona, que toleran el sol que tiene (media sombra si tiene menos de 6 h) y la helada (en invernadero, la helada no cuenta), ordenados por asociaciones con lo que ya está plantado y penalizando la familia que ocupó ese cantero la temporada anterior (rotación). Cuántas plantas entran por cuadro según la distancia de la ficha.

**Seguimiento** (tabla `plantings`, cifrada): qué cultivo, en qué cantero y cuadros, cómo se sembró (directa o almácigo), fechas, estado (almácigo, sembrado, trasplantado, cosechando, terminado), notas y fotos, y la **cosecha** (fecha, cantidad, unidad). Al cargar una cosecha hay una opción **"Sumar al inventario"**: crea o suma un lote del artículo con el nombre del cultivo en la categoría Alimento. **Tareas automáticas**: trasplantar (almácigo + días de la ficha), empezar a cosechar (siembra o trasplante + días a cosecha), terminar; aparecen en las alertas de Inicio.

**Avisos.**
- **Helada:** si el pronóstico da mínima ≤ 2 °C en los próximos dos días y hay plantas sensibles o semirresistentes en canteros que no están en invernadero, avisa ("tapá los canteros"). Con la app abierta usa el pronóstico guardado; con la app cerrada, el servidor (ubicación de la huerta y una marca de que hay plantas sensibles; nada más del cultivo).
- **Riego:** balance de agua del suelo con la evapotranspiración de referencia (ET0, FAO-56) y la lluvia de Open-Meteo, y un coeficiente de cultivo según el estado de las plantas; solo cuentan los canteros que no están en invernadero. Si en los últimos días la lluvia no alcanzó y el déficit supera la reserva fácilmente aprovechable (según profundidad de raíz), avisa "regá"; después de regar se marca "regado" y el balance vuelve a cero. Mismo esquema: app abierta y servidor.
- El servidor recibe un punto por lugar (redondeado a ~1 km), no los canteros.

**Compartir** (§8.3): sección propia "Huerta" (canteros y siembras); se reconoce lo mismo por id y no se pisa lo del otro.

### 10.2 Cabuyería y anclajes (definida el 05/11/2026)

Sección propia en Inicio, **antes de Huerta**: Guía de nudos, Anclajes, Cuerdas y Glosario. Todo dentro de la app, sin conexión.

**Guía de nudos** (~40 para empezar). Cada ficha: nombres (principal, alternativos y en inglés, y el número de *The Ashley Book of Knots* cuando corresponde), para qué sirve, **paso a paso con imagen**, datos clave (si aguanta bajo carga, si se desata fácil después de cargarlo, si necesita nudo de seguridad, cuánta resistencia le saca a la cuerda, si sirve con cuerda mojada o resbalosa), errores comunes y cómo revisarlo, nudos relacionados y "para leer más" en la biblioteca. Los textos son propios.

**Búsqueda:** por nombre o alias (sin acentos), por **uso** (rappel y escalada, rescate, campamento y refugio, carga y transporte, náutica, pesca, primeros auxilios, supervivencia), por **tipo** (lazos, uniones, amarres, autobloqueantes, de tope, acortamientos, ataduras de palos), por propiedades ("se suelta fácil", "aguanta bajo carga", "con una mano") y un asistente "¿Qué necesito hacer?" con preguntas cortas.

**Modo práctica:** pantalla completa, imagen grande, anterior y siguiente, voz para leer cada paso (como las guías de primeros auxilios). Marcar "aprendido" para ver el progreso (en los ajustes del dispositivo).

**Cuerdas y glosario:** términos (chicote, firme, seno, vuelta, cote, gaza), tipos de cuerda (dinámica, estática, paracord, fibras naturales) y su cuidado. **Aviso de seguridad** en rappel, escalada y rescate: practicar con un instructor; la guía no reemplaza la formación.

**Imágenes** (la app es pública: no lleva imágenes de libros con derechos):
1. Dominio público: figuras del FM 3-05.70 (Apéndice G) y del FM 3-97.61 *Military Mountaineering* (Ejército de EE. UU.), separadas paso por paso.
2. Licencia libre: diagramas de Wikimedia Commons (CC BY-SA o dominio público), con crédito.
3. Dibujos propios en SVG para lo que no esté en ninguna de las dos.
4. **Biblioteca privada del usuario:** cada ficha guarda dónde aparece el nudo en los libros (ej.: "Enciclopedia ilustrada de los nudos, pág. 87"); si el paquete privado está en el dispositivo, la ficha muestra esas imágenes y el enlace al libro. La app no las lleva: las toma de la copia del usuario.

**Hecho (05/11/2026):** `modules/knots`, 49 nudos con 82 imágenes (~1 MB, en `public/knots/`, disponibles sin conexión): figuras de los FM separadas por paso con `tools/knot-images/extract.py`, y de Wikimedia Commons con autor y licencia en cada ficha. Búsqueda por nombre y alias sin acentos, uso, tipo y propiedades; asistente con 10 necesidades; modo práctica con voz; "aprendido" en Ajustes (`knotsLearned`). Las referencias a la biblioteca privada se suman cuando esté el visor de la Biblioteca.

**Anclajes** (`modules/knots/anchors.ts`, 24 fichas): lo básico (principios: fuerte, redundante, repartido, sin extensión, simple; ángulos y fuerzas; cómo probarlo), puntos naturales (árbol, bloques, piedras trabadas, salientes y puentes de roca, arbustos), cómo sujetar (cinta apoyada, rodeando o con alondra; cuerda atada; anclaje sin tensión), armados (repartido con cordino, autorrepartido, dos árboles con ocho de dos gazas, rappel con anillo de abandono) e improvisados (estacas con su tabla de resistencia, "hombre muerto", vehículo, vientos de carpa). Fuentes: FM 3-97.61 cap. 5 y FM 5-125 cap. 4 (dominio público), figuras incluidas. **Árbol:** el manual no da un tamaño; la app recomienda al menos 20 cm de diámetro (~63 cm alrededor del tronco) para una persona y 30 cm (~94 cm) para rescate, siempre vivo, sano, bien arraigado y atado abajo. **Ángulos:** la tabla del FM 3-97.61 (fig. 5-20) da 1150 % para 170°, un error (la cuenta es 574 %): la app usa los valores calculados y muestra solo el dibujo. Cada ficha enlaza sus nudos y cada nudo los anclajes en que se usa; el asistente suma "Armar un punto fijo".

**Referencias de la biblioteca (05/11/2026, `knots/libraryRefs.ts`):** la ficha de cada nudo tiene "En tu biblioteca": busca en el celular, sin conexión, en los libros de nudos bajados (categoría Cabuyería o "nudo/knot/cuerda…" en el título) por el nombre en los dos idiomas, los alias específicos (sin palabras sueltas como "lazo" u "ocho") y el número de Ashley ("ABOK #1010" o el párrafo "1010." del propio libro). Muestra hasta dos menciones por libro (primero el capítulo que se llama como el nudo), con la frase, la figura más cercana tomada de la copia del usuario y un enlace al lector, que abre ese capítulo con la frase resaltada (`?cap=…&q=…`). No hay índice armado en el servidor: aparecen más referencias a medida que se bajan libros.

**Ampliación (05/11/2026):** corredizos (lazo #1114, as de guía corredizo #1117, de escape #529), ocho simple (#520), tensor ajustable (#1856), dos medios cotes (#1710), nudo de ancla (#1841), cornamusa, constrictor (#1249), cirujano (#463), cadena (#2868), Uni y atadura diagonal; números verificados en el texto de Ashley, sin número los que no lo tienen claro. Anclajes nuevos: polipasto 3:1 ("Z") y pasamanos para cruzar un río (figuras y datos del FM 3-97.61), bolardo de nieve y piolet enterrado, línea de techo para lona y colgar la comida. Imágenes: FM 5-125 (ocho simple, nudo de ancla, medios cotes), FM 3-97.61, Wikimedia Commons con crédito, y dibujos esquemáticos propios en SVG pasados a WebP (vehículo, vientos de carpa, línea de techo, colgar la comida) donde no había una imagen libre verificable; nunca imágenes generadas por IA, para que cada línea coincida con los pasos.

**Revisión (05/11/2026):** se sacaron los números de Ashley que no se pudieron confirmar y se corrigió el nudo guarda según el FM 3-97.61 (dos mosquetones iguales, mejor ovalados).

**Diagramas paso a paso propios (06/11/2026):** muchos nudos tenían una sola figura para todos los pasos. Ahora cada paso de los 50 nudos tiene un diagrama propio, todos con el mismo estilo (177 SVG en `public/knots/pasos/`, ~1 MB sin comprimir, disponibles sin conexión). Las figuras de los FM y de Wikimedia pasan a la galería de cada nudo; la miniatura de la lista es el último paso. Los arma `tools/knot-diagrams` (`node build.mjs`, o `node build.mjs <id>… --debug` para una hoja PNG de revisión): cada cuerda es una curva suave por puntos de control, los cruces se calculan solos y en cada uno la parte de arriba deja un hueco en la de abajo; por defecto va arriba lo que se hizo después, y se corrige con la profundidad de cada punto (`[x, y, z]`, lo de z ≤ −1 va más oscuro y detrás de palos y argollas) o con `under`; `tilt` da perspectiva a las vueltas (espiras en vez de zigzag) y `zoom` agranda los nudos chicos (pesca, mosquetón). Revisión 06/11/2026 con el usuario: se corrigieron el leñador (el chicote se enrosca sobre su propia vuelta; cote cerca de la punta para arrastrar), el seguro del as de guía, el ocho direccional (según el FM 3-97.61), el dinámico y la mula sobre la barra del mosquetón, la cadena (cada seno pasa por la punta del anterior, como en la foto de ABOK #1144), el clinch mejorado (la punta pasa por dentro del lazo chico y del grande), el Palomar (simple con la tanza doble), el nudo de ancla, la atadura diagonal y el ballestrinque en mosquetón. **Escalera de cuerda** (nudo 50): dos cuerdas y travesaños con un ballestrinque en cada punta, asegurado con muesca o amarre de hilo (con la cuerda continua no hay chicote para un medio cote). Las figuras son esquemas dibujados a partir de la técnica de cada nudo, no copias: los libros de la biblioteca sin licencia libre (por ejemplo *Cabuyería*, Exploradores de Don Bosco) no se calcan ni se copian. Un paso sin figura propia (`null`, por ejemplo "en un mosquetón…") usa la del paso anterior; `diagrams.json` guarda el número de figura de cada paso.

# Análisis de Causas Raíz (RCA): Anomalías Visuales, Ciclo de Vida y Persistencia en transcript-plus v0.4.1

| Metadato | Detalle |
| :--- | :--- |
| **Módulo** | `mods/transcript-plus` |
| **Versión Diagnosticada** | `v0.4.1` (commit base `2b8afd5`) |
| **Fecha de Auditoría** | 2 de noviembre de 2026 |
| **Perfil Metodológico** | Correctivo + Preventivo (Forense sobre trazas, bytecode del motor y store) |
| **Binario del Motor** | Claude Code CLI v2.1.316 (`claude.exe` @ offsets `283045793`–`316266000`) |
| **Estado** | Diagnóstico completado — 7 Causas Raíz Estructurales Identificadas |

---

## 1. Resumen Ejecutivo

Durante el uso del mod `transcript-plus` v0.4.1 en terminales Windows (ConPTY / Windows Terminal / VS Code TTY), se manifestaron tres grupos de anomalías críticas:

1. **Anomalías Geométricas y de Pintado TUI**: Descuadre de marcos redondeados en `ToolGroup`, saltos de línea donde el borde superior aparece partido en la fila inferior (`─ 🕐 ... | ToolGroup ───────╮│`), residuos de caracteres flotantes (`2   ─ │`) en `UserMessage`, pérdida de espacios de separación exclusivamente tras el emoji `🪝` (`🪝2.3s` vs `🔧 55s`) y congelación permanente de la corrupción visual al avanzar el scroll.
2. **Anomalías de Ciclo de Vida y Atribución**: Mensajes de respuesta intermedia del modelo (bloques de narración bajo *adaptive thinking*) sin footer `🧠` ni hora fija, contadores en vivo de `ToolGroup` que retroceden bruscamente al cerrarse (`1m 02s…` $\rightarrow$ `55s`), atribución indebida del glifo `🪝` a notificaciones de subagentes en segundo plano (`<task-notification>`) y pérdida del timestamp en el `Spinner` cuando coexisten tareas `in_progress`.
3. **Colapso de Persistencia**: Bloqueo silencioso del 100% de las operaciones de escritura en `$.store` desde el 25 de octubre de 2026, causando que cualquier sesión reanudada con `--resume` o `--continue` pierda duraciones y horas históricas.

El análisis forense demostró que estos fallos **no son errores aislados ni fallos aleatorios de la TTY**, sino el resultado directo de **7 causas raíz estructurales (CR-1 a CR-7)** provocadas por discrepancias entre el árbol Flexbox devuelto por el mod y los mecanismos internos de reconciliación Yoga, generación diferencial ANSI (`class lf`) y gestión de cuotas de Claude Code v2.1.316.

---

## 2. Matriz de Causas Raíz (CR-1 a CR-7)

| ID | Dominio | Causa Raíz Estructural | Síntoma Observable | Severidad |
| :--- | :--- | :--- | :--- | :--- |
| **CR-1** | Geometría Yoga / TUI | `ToolGroup` vive en un contenedor `flexDirection: "row"` sin `width: 100%`. Al cerrarse, la subfila `wu` (`flexGrow: 1`) se desmonta y el recuadro colapsa de 152 a 41 cols. La combinación `column-reverse` + `marginBottom: -1` en `withTimestamp` marca `childrenOverlap = true` y anula el *safe-blit*. | Descuadre de marcos, rotura del recuadro superior y activación de `overflow: "hidden"` en TTY. | **Alta** |
| **CR-2** | ANSI / ConPTY / `lf` | `🪝` (`U+1FA9D`) es el único glifo en el rango `U+1FA70..U+1FAFF` que activa la rama `NC(u.char)` en `claude.exe:Lb`, emitiendo `cursorTo` que ConPTY solapa. Los residuos quedan congelados cuando `pe < q` (`scrolledOutRows`). | Texto `🪝2.3s` sin espacio, residuos `2   ─ │` flotantes y bordes partidos congelados en pantalla. | **Alta** |
| **CR-3** | Ciclo de Vida / Eventos | Chunks de narración de *adaptive thinking* (`type: "thinking"`, `isSummary: true`) son ignorados por `onStep` (no limpian `lastCall`) y por `onAppend` (no registran `uuid`). | Mensajes `assistant` intermedios sin footer `🧠` y contador de `ToolGroup` que retrocede en vivo. | **Media-Alta** |
| **CR-4** | Reactividad de Estado | `RESOLVER.AssistantMessage` no declara `subscribed: true` ni `onAppend` invalida `ui.render` tras fijar la duración del bloque de respuesta. | Pérdida de footer `🧠` en bloques de texto que se pintan antes de que finalice la respuesta. | **Media** |
| **CR-5** | Persistencia / Almacén | `$.store.set` rechaza objetos mayores a 4 MiB. El archivo acumuló 62.801 entradas (4.194.268 bytes compactos); `loadStore` solo poda por días (30d) y no por cuota de bytes. | Bloqueo total de persistencia; sesiones reanudadas pierden duraciones y timestamps. | **Crítica** |
| **CR-6** | Atribución de Eventos | `onSubmit` y `RESOLVER.UserMessage` capturan todo `prompt.submit` sin validar `e.origin.kind === 'composer'`, asignando `🪝` a tareas secundarias. | Notificaciones `<task-notification>` de subagentes marcadas erróneamente con icono `🪝`. | **Baja-Media** |
| **CR-7** | Layout / UI Helpers | Variable global `expandedView` contaminada por `UserMessage` fuera de `ctrl+o`. `withSpinner` no prefija la hora cuando `props.message === null` y hay tareas `in_progress`. | Espaciado vertical irregular bajo el header (`marginTop: 0`) y pérdida del reloj en el `Spinner`. | **Baja-Media** |

---

## 3. Metodología y Trazabilidad Forense

La investigación se ejecutó bajo un enfoque **no invasivo de solo lectura**, estructurado en 5 etapas:

1. **Reconstrucción Forense del Turno**:
   - **Captura analizada**: `Sin título.png` (`1002×272 px`, 17 filas × ~152 columnas).
   - **Sesión origen**: `C:\Users\Cristian\.claude\projects\C--Users-Cristian-Desktop-Proyectos-Voices-AI-Voice-InterConnector\2f87992d-eb28-4ff2-aad1-b5d25c1f2607.jsonl` (líneas 766–925, eventos entre las `17:48:35.008Z` y `17:51:04.117Z`).
   - **Store persistente**: `C:\Users\Cristian\.claude\plugins\store\transcript-plus_inline-f6bcfe55deb3.json` (249.737 líneas, 5,88 MB en disco).
2. **Auditoría de Layout y Tipos**:
   - `mods/transcript-plus/hooks/register.js` (`register.js:640-745`).
   - `mods/transcript-plus/.claude-plugin/types/claude-code/index.d.ts` (`index.d.ts:890-1023`, `10360-10700`, `13153-13193`).
3. **Auditoría de Ciclo de Vida de Eventos**:
   - Validación de los 14 hooks de `register.js` contra el catálogo de eventos en `index.d.ts` (`3467-3525`, `9347-9715`, `11269-11398`, `14485-14740`).
4. **Análisis de Regresión sobre Pruebas Previas**:
   - Auditoría de la sesión `9bfb96f8-5c08-4367-aa5f-6e7eff525061.jsonl` (commit `2b8afd5`). Se determinó por qué los scripts de emulación PTY (`drive2.py` y `replay.py`) no detectaron el fallo: solo evaluaron scroll estático sobre un mensaje largo, omitiendo la transición dinámica de contracción de un `ToolGroup`.
5. **Inspección de Bytecode del Motor Nativo**:
   - Extracción y desensamblado del motor JS en `C:\Users\Cristian\.local\bin\claude.exe` v2.1.316 (offsets `283045793`–`316266000`), abarcando el reconciliador Yoga/Ink (`pe`, `gv`, `xR`, `Z$n`), componentes (`ToolGroup`/`iP`, `AssistantMessage`/`zi`, `Spinner`/`xn`) y el motor de dibujo ANSI (`class lf`, `Rg`, `Hb`, `Lb`, `NC`, `mf`).

---

## 4. Detalle Técnico de Causas Raíz

### CR-1: Inestabilidad Dimensional de `ToolGroup` en Flex-Row y Conflicto con `column-reverse`

#### Evidencia en el Motor (`claude.exe:316261800`, `316265735`, `315960496`)
En el switch principal del transcript, `UserMessage` y `AssistantMessage` se montan dentro de `<Box flexDirection="column" width="100%">`, lo que fuerza su expansión al ancho total del terminal (`COLS`). Sin embargo, `ToolGroup` (`case "collapsed_read_search"`) se monta dentro del componente envoltorio `iP`:
```javascript
function iP({ children: i }) {
  let r = Se(om), [t, o, l] = b(), f = A(i);
  ...
  return e(s, { ref: t, children: f.current });
}
```
El componente `s` (`pe` en `claude.exe:297988000`) define `l.flexDirection ??= "row"` y no asigna `width`. En Yoga, un contenedor `row` restringe el ancho a la suma intrínseca de sus hijos, a menos que un hijo declare `flexGrow: 1`.

#### Transición Dinámica de Contracción (`claude.exe:316216300`)
- **Estado Activo (`T === true`)**: Se renderiza la subfila `wu` (`  ⎿  "Restart..."`), cuyo nodo hijo es `e(s, { flexDirection: "column", flexGrow: 1 })`. Esto estira el recuadro de `ToolGroup` al 100% del viewport (**152 columnas × 4 filas**).
- **Estado Inactivo (`T === false`)**: Al terminar las herramientas, `wu` se desmonta y queda únicamente el resumen `Mu` (`Searched for 4 patterns, read 2 files`), el cual carece de `flexGrow`. En un solo frame de render, el recuadro **se encoge de 152 cols × 4 filas a 41 cols × 3 filas**.

```
Frame N   (Activo):   ╭─ 🕐 2:48:47 p.m. | ToolGroup ─────────────────────────────────────────────────────────╮ (152 cols)
                      │ ⎿ Reading codebase-memory-mcp...                                                      │
Frame N+1 (Inactivo): ╭─ 🕐 2:48:47 p.m. | ToolGroup ───────╮ (41 cols)
```

#### Colisión de Geometría en `withTimestamp` (`register.js:699-738` y `claude.exe:298318500`)
En `withTimestamp`, el contenedor exterior tiene `flexDirection: 'column-reverse'` y coloca el header en flujo con `{ marginBottom: -1 }`. La función de detección de solapamiento del motor (`gv`):
```javascript
if (q ||= Se.x < ae && V < Se.x + Se.width && Se.y < ne && ee < Se.y + Se.height, q)
  n.childrenOverlap = !0;
```
Al compartir la fila `y = L + 1` dos hijos en flujo (el borde superior del marco y el header), `gv` marca `OuterBox.childrenOverlap = true`, lo que **invalida el mecanismo de optimización por blit (`xR`)**. Además, al conservar el footer con `position: 'absolute'`, la función `Z$n` (`claude.exe:312023200`) detecta posicionamiento absoluto y fuerza `overflow: "hidden"` en el render site, recortando caracteres cuando hay contracción dimensional.

---

### CR-2: Diferenciador ANSI (`lf.render`), Glifo `🪝` (`U+1FA9D`) y Congelación en `scrolledOutRows`

#### Comportamiento Exclusivo del Emoji `🪝` (`claude.exe:298272900`)
En el generador de secuencias de escape ANSI (`class lf`), la función `Lb` evalúa si el carácter pertenece a bloques extendidos:
```javascript
function NC(n) {
  let u = n.codePointAt(0);
  if (u === void 0) return !1;
  if (u >= 129648 && u <= 129791 || u >= 129792 && u <= 130047) return !0;
  return !1;
}
```
El rango `129648..129791` corresponde al bloque Unicode `U+1FA70..U+1FAFF`. Se compararon los cinco emojis del mod:
- `🕐` (`U+1F550` = `128336`) $\rightarrow$ `NC` = `false`
- `🔧` (`U+1F527` = `128295`) $\rightarrow$ `NC` = `false`
- `🧠` (`U+1F9E0` = `129504`) $\rightarrow$ `NC` = `false`
- `👤` (`U+1F464` = `128100`) $\rightarrow$ `NC` = `false`
- **`🪝` (`U+1FA9D` = `129693`) $\rightarrow$ `NC` = `true`**

Al renderizar `🪝`, `Lb` emite saltos de cursor relativos (`{ cursorTo: p + 2 }, " ", { cursorTo: p + 1 }, "🪝", { cursorTo: p + 3 }`). Dado que `vg` (`claude.exe:298216000`) omite celdas con espacios vacíos y `mf` (`claude.exe:298283719`) colapsa `cursorTo` consecutivos, Windows ConPTY pierde la posición horizontal del espacio posterior, resultando invariablemente en la secuencia comprimida **`🪝2.3s`**.

#### Desfase y Congelación de Residuos (`claude.exe:298269500-298270500`)
Cuando `ToolGroup` se encoge 1 fila (`ce = 1`), `lf.render` ejecuta un borrado relativo `clear(1)` con `cursorMove(0, -1)`. Si la posición del cursor difiere por 1 celda:
1. En `UserMessage`, la esquina inferior derecha previa deja huérfana la secuencia `2   ─ │` en la fila superior.
2. En `ToolGroup`, el carácter `╭` se dibuja en la columna `COLS - 1`, provocando que el resto del borde superior (`─ 🕐 ... ╮`) haga *soft-wrap* a la línea siguiente, solapándose con el contenido.
3. Al agregarse nuevos bloques en el transcript, el contador `q` (`scrolledOutRows`) avanza:
```javascript
// claude.exe:298269800 (función Rg)
if (pe < q) {
  if (f || G || pe >= Y) return se = !0, ye = pe, !0;
  return; // Aborta repintado: fila fuera de la ventana activa
}
```
Una vez que las filas defectuosas quedan por encima de `q`, **`lf.render` no vuelve a tocarlas**, congelando la corrupción visual de forma permanente.

---

### CR-3: Omisión de Narración en *Adaptive Thinking* (`isSummary: true`) y Fuga de `lastCall`

#### Naturaleza del Mensaje (`2f87992d...jsonl:842` y `claude.exe:316094300`)
En Claude Opus 5.5 con `thinking: { type: "adaptive", display: "updates" }`, los mensajes emitidos entre llamadas a herramientas son bloques `type: "thinking"` con firma de narración. El motor de Claude Code los instancia mediante la función `zi` como:
```javascript
// claude.exe:316094300
AssistantMessage({ text: M9(x), isFirstOfReply: f, isSummary: true })
```

#### Brechas en el Ciclo de Vida (`register.js:395-406, 455, 479-484`)
1. **Filtro en `onStep`**:
   ```javascript
   if (b.kind !== 'thinking') { ... } // Descarta por completo el bloque
   ```
   Al no procesar `thinking`, nunca se ejecuta `lastCall.delete(agent)` (línea 398, restringida a `b.kind === 'text'`).
2. **Filtro en `onAppend`**:
   ```javascript
   const textOf = message => message.content.filter(b => b.type === 'text').map(b => b.text).join('')
   ```
   Para la fila `response` del mensaje de narración, `textOf` devuelve `""` y la línea 480 (`if (!text.trim()) break`) aborta sin registrar el `uuid` del mensaje ni invocar `pinTiming`.

#### Consecuencias Verificadas
- **Ausencia de Footer `🧠`**: `RESOLVER.AssistantMessage` no encuentra entrada fijada y genera una entrada efímera `{ time: Date.now() }` sin duración (`duration: undefined`).
- **Retroceso de Contadores**: Como `lastCall` no se eliminó, el `ToolGroup` anterior asume erróneamente `awaitsAnotherCall(calls) === true`. Su contador continúa avanzando en vivo (`56s…`, `57s…`, `1m 02s…`) y cuando arranca el siguiente `ToolGroup` y sobrescribe `lastCall`, el grupo anterior se cierra bruscamente y su footer salta hacia atrás a `🔧 55s`.

---

### CR-4: Falta de Reactividad e Invalidación de Render en `AssistantMessage`

En `mods/transcript-plus/hooks/register.js:572`, el resolver de `AssistantMessage` no se suscribe al estado reactivo:
```javascript
AssistantMessage: e => ({ ...entryFor(e.requestId), icon: '🧠', noMargin: expandedView })
```
A diferencia de `ToolUse` o `ToolGroup`, no incluye `subscribed: true`. Cuando `onAppend` recibe el evento de finalización del turno y calcula la duración del texto mediante `pinTiming($, e.uuid, ...)`, no emite ninguna señal de invalidación (`$.ui.invalidate('ui.render')`). Si el componente `AssistantMessage` fue renderizado por Ink antes de la resolución asíncrona de `onAppend`, el componente se queda permanentemente con la duración `undefined` y no dibuja el footer `🧠`.

---

### CR-5: Bloqueo de Persistencia por Saturación del Límite de 4 MiB en `$.store`

#### Límite del Motor (`index.d.ts:3480`)
El motor de Claude Code impone una restricción estricta de **4 MiB (4.194.304 bytes)** sobre el payload JSON serializado de cada plugin. Toda llamada a `$.store.set` que exceda este umbral es rechazada.

#### Estado del Store Real (`transcript-plus_inline-f6bcfe55deb3.json`)
La auditoría del archivo de almacenamiento arrojó:
- **Total de entradas indexadas**: 62.801 claves (`25.249` de tipo `u:`, `25.435` de tipo `r:`, `5.111` de tipo `g:` y `7.006` UUIDs).
- **Tamaño en disco (formato expandido)**: 5.878.001 bytes.
- **Tamaño JSON compacto (`JSON.stringify`)**: **4.194.268 bytes**.
- **Margen disponible**: **36 bytes**.

#### Defecto en la Política de Retención (`register.js:129, 145-162, 201-214`)
`loadStore` implementa únicamente una política de caducidad temporal:
```javascript
const RETENTION_DAYS = 30
```
Dado que las 62.801 entradas se acumularon en solo 16 días (del 10 al 25 de octubre de 2026), ningún bucket diario fue purgado. Desde el **25 de octubre de 2026 a las 18:08 UTC**, **el 100% de las escrituras en `flush($)` son rechazadas**. El mod ejecuta `pendingKeys.clear()` en memoria pero los datos nunca llegan a disco, rompiendo la persistencia histórica en todas las sesiones posteriores.

---

### CR-6: Atribución Indebida del Emoji `🪝` a Tareas Secundarias

#### Eventos Interceptados (`register.js:331-358` e `index.d.ts:9347-9460`)
El manejador `onSubmit` intercepta todos los eventos del canal `prompt.submit` sin discriminar su origen:
```javascript
async function onSubmit($, e, next) {
  pendingSubmit = Date.now()
  currentPrompt = { submittedAt: pendingSubmit }
  return next(e)
}
```
Según el contrato de la API (`index.d.ts`), `prompt.submit` se dispara para múltiples orígenes (`composer`, `task-notification`, `scheduled-trigger`, `auto-continuation`). Cuando un subagente completa una tarea y emite una `<task-notification>` (como en la línea 766 del `.jsonl`), el hook lo captura como si fuera un prompt interactivo del usuario y le asigna el tiempo transcurrido hasta el siguiente turno bajo el glifo `🪝`, distorsionando las métricas de respuesta humana.

---

### CR-7: Fragilidad en `expandedView` y Desincronización del `Spinner`

1. **Contaminación de `expandedView` (`register.js:510, 646, 712`)**:
   `expandedView` es una variable global en memoria asignada a partir de `UserMessage.props.isExpanded`. Sin embargo, `UserMessage.props.isExpanded` también se activa fuera del modo expandido (`ctrl+o`) cuando un mensaje se renderiza bajo un *speaker label* cuyo texto no desborda el límite. Cuando esto ocurre, `expandedView` se queda en `true`, provocando que los `AssistantMessage` subsecuentes apliquen `marginTop: 0` en lugar de `-1`, introduciendo una fila vacía artificial bajo el header.
2. **Pérdida de Timestamp en `Spinner` (`register.js:748-760` y `claude.exe:312071500`)**:
   En el componente nativo `xn` (`Spinner`), el texto en pantalla se resuelve priorizando `activeForm` de la tarea activa sobre `props.word`:
   ```javascript
   At = _ ?? (_t === void 0 ? void 0 : NSr(_t, V)) ?? (J || Mt)
   ```
   Cuando `e.props.message === null` y existe una tarea en estado `in_progress`, `withSpinner` no inyecta el timestamp en `props.message`, por lo que el `Spinner` muestra el texto de la tarea sin el prefijo `🕐 hora · `.

---

## 5. Directrices de Remediación Arquitectónica (v0.5.0)

Para erradicar definitivamente las anomalías sin parches sintomáticos, el diseño de la versión 0.5.0 debe implementar las siguientes directrices:

### 1. Reestructuración Geométrica de `withTimestamp`
- **Ancho Forzado en `ToolGroup`**: Asegurar que el contenedor raíz envuelto por `withTimestamp` en `ToolGroup` posea `width: '100%'` (o `flexGrow: 1` con `alignSelf: 'stretch'`), evitando que la contracción interna de `wu` altere el ancho del recuadro exterior.
- **Eliminación de `column-reverse` con Superposición Negativa**: Reemplazar la superposición de dos hijos en flujo (`marginBottom: -1`) por un árbol donde el header y el marco no compitan por la misma coordenada `y`, restableciendo `childrenOverlap = false` para habilitar el *safe-blit* (`xR`) y permitir el uso de `overflow: 'visible'`.
- **Sustitución Segura del Emoji `🪝`**: Reemplazar `🪝` (`U+1FA9D`) por un símbolo fuera del bloque `U+1FA70..U+1FAFF` (por ejemplo, `⚡`, `📥`, `↵` o `⏱`), eliminando la invocación de `NC(u.char)` en `claude.exe` y normalizando el avance de cursor en Windows ConPTY.

### 2. Soporte Completo para *Adaptive Thinking* y Narración
- **Inclusión de `thinking` en `onStep`**: Registrar chunks `thinking` en `modelBlocks` y ejecutar `lastCall.delete(agent)` al detectar bloques de narración (`isSummary: true`), cerrando a tiempo el contador del `ToolGroup` previo.
- **Procesamiento de Narración en `onAppend`**: Extraer texto tanto de bloques `text` como de bloques `thinking` de narración, permitiendo que `pinTiming` fije la duración `🧠` de todos los mensajes de respuesta del asistente.
- **Invalidación Reactiva en `AssistantMessage`**: Incorporar `subscribed: true` en el resolver de `AssistantMessage` o emitir `$.ui.invalidate('ui.render')` en `onAppend` tras registrar la duración.

### 3. Presupuesto de Bytes y Poda LRU en `$.store`
- **Poda por Tamaño (Byte Quota Management)**: Implementar una función `pruneStoreToBudget(store, maxBytes = 3.5 * 1024 * 1024)` que evalúe `JSON.stringify(store).length` tanto en `loadStore` como en `flush`. Si supera los 3,5 MiB, desalojar progresivamente los buckets diarios más antiguos hasta restablecer un margen de seguridad.
- **Compactación de Claves**: Eliminar campos redundantes en las entradas persistidas (p. ej. omitir `fromEvent` o almacenar deltas de tiempo enteros en milisegundos).
- **Manejo Robusto de Excepciones**: Envolver `$.store.set` en un bloque `try/catch` que registre advertencias y fuerce una poda de emergencia en caso de error `QUOTA_EXCEEDED`.

### 4. Discriminación Estricta de Orígenes en Hooks
- **Filtrado por `e.origin.kind`**: Condicionar la captura en `onSubmit` y la asignación de métricas `🪝` exclusivamente a eventos con `e.origin?.kind === 'composer'` (o `e.props.origin?.kind === 'composer'`), ignorando notificaciones `<task-notification>`, triggers automáticos y continuaciones internas.
- **Mapeo Robusto en `withSpinner`**: Prefijar la hora formateada directamente en `props.message` cuando `props.message === null` pero existe una tarea activa, garantizando la visibilidad del timestamp en todos los estados del `Spinner`.

---

## 6. Conclusión y Próximos Pasos

El presente análisis forense cierra la fase de diagnóstico e investigación de la incidencia. La persistencia de este informe en el repositorio formaliza la línea base técnica para la etapa de **Diseño y Planificación de Cambios (Specification Delta)**, garantizando que la versión 0.5.0 resuelva integralmente la estabilidad visual TUI, la fidelidad de métricas de ciclo de vida y la resiliencia del almacenamiento persistente.

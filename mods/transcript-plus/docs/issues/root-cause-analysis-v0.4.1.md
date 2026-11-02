# Análisis de Causas Raíz (RCA): Anomalías Visuales, Ciclo de Vida y Persistencia en transcript-plus v0.4.1

- **Módulo**: `mods/transcript-plus`
- **Versión diagnosticada**: `v0.4.1`
- **Fecha**: 2 de noviembre de 2026
- **Perfil**: Correctivo + Preventivo (Forense e Inspección de Motor)
- **Estado**: Diagnóstico completado

---

## Recorrido

La investigación se ejecutó bajo el perfil combinado **Correctivo + Preventivo**, sin realizar ninguna modificación en el repositorio ni en la configuración del usuario, siguiendo las cinco tareas del plan aprobado:

1. **Tarea 1 (Reconstrucción forense del turno capturado)**: Se localizó y examinó el transcript exacto al que pertenece la captura `c:\Users\Cristian\Downloads\Sin título.png` (`1002×272 px`, equivalentes a 17 filas × ~152 columnas) en `C:\Users\Cristian\.claude\projects\C--Users-Cristian-Desktop-Proyectos-Voices-AI-Voice-InterConnector\2f87992d-eb28-4ff2-aad1-b5d25c1f2607.jsonl` (líneas 766–925, entre las `17:48:35.008Z` y las `17:51:04.117Z`), así como el almacén persistente del plugin en `C:\Users\Cristian\.claude\plugins\store\transcript-plus_inline-f6bcfe55deb3.json` (249.737 líneas).
2. **Tarea 2 (Auditoría del árbol de layout y bordes)**: Se contrastó el árbol `RenderElement` devuelto por `withTimestamp` en `mods/transcript-plus/hooks/register.js` (`register.js:645-740`) contra el contrato de validación y tipos en `mods/transcript-plus/.claude-plugin/types/claude-code/index.d.ts` (`index.d.ts:890-1023`, `10360-10700`, `13153-13193`).
3. **Tarea 3 (Auditoría del ciclo de vida de eventos, atribución y persistencia)**: Se analizaron en `mods/transcript-plus/hooks/register.js` los manejadores `loadStore`, `pinTiming`, `flush`, `scheduleClock`, `onSubmit`, `onTurnStart`, `onTurnComplete`, `onStep`, `onToolCall`, `onCommandRun`, `onAppend`, `group`, `RESOLVER`, `withSpinner` y `withTurnDuration` frente a los tipos de eventos en `index.d.ts` (`3467-3525`, `9347-9715`, `11269-11398`, `14485-14740`).
4. **Tarea 4 (Análisis de la sesión previa de diagnóstico)**: Se inspeccionó `C:\Users\Cristian\.claude\projects\C--Users-Cristian-Desktop-EvolutiveX-EvolutiveX-Agent-Orchestrator\9bfb96f8-5c08-4367-aa5f-6e7eff525061.jsonl` (líneas 66–432) para determinar qué probaron `drive2.py` y `replay.py` al introducir el commit `2b8afd5` (`column-reverse` + `marginBottom: -1`) y por qué esos experimentos no detectaron las anomalías de la captura actual.
5. **Tarea 5 (Inspección del motor de renderizado y diferenciador ANSI)**: Dado que la librería `pyte` del directorio temporal de la sesión `1a17f58d` ya había sido limpiada en el cierre de `9bfb96f8` (única adaptación respecto al plan, sustituida por la extracción directa de los módulos JavaScript compilados dentro del ejecutable nativo `C:\Users\Cristian\.local\bin\claude.exe` v2.1.316), se inspeccionó el código fuente real del motor de Claude Code en `claude.exe` (offsets `283045793`–`316266000`): el reconciliador Yoga/Ink (`pe`, `ks`, `gv`, `xR`, `ER`, `nR`), el adaptador de hooks `ui.render` (`useRenderDrawing` / `Z$n`), los componentes nativos `ToolGroup` (`tm` / `mf` / `iP`), `AssistantMessage` (`Br` / `zi`) y `Spinner` (`MRr` / `xn`), y el diferenciador de celdas a secuencias ANSI (`class lf`, `Rg`, `Hb`, `Lb`, `NC`, `mf`).

---

## Respuestas a los objetivos

- **Objetivo 1 (Reconstrucción cronológica y estado real de la captura)**: Los cuatro bloques de la captura corresponden a los eventos de `2f87992d-eb28-4ff2-aad1-b5d25c1f2607.jsonl` entre las `2:48:35 p.m.` y las `2:51:04 p.m.`: (1) fila `user` `uuid=6500224c...` a las `2:48:35.058 p.m.` originada por una `<task-notification>` del subagente `a9fc2714900758064`, a la que `onTurnStart` (`2:48:37.426 p.m.`) fijó `2.3s` con icono `🪝`; (2) `ToolGroup` de 11 llamadas (`2:48:47.562 p.m.` a `2:49:42.162 p.m.`, `54.6s` → `🔧 55s`); (3) fila `assistant` `uuid=e9633a9e...` a las `2:49:49.944 p.m.`, que **no es un bloque `text` sino un bloque `thinking` de narración (`isSummary: true`)**, motivo por el cual carece de footer `🧠`; y (4) `ToolGroup` activo de 13 llamadas iniciado a las `2:49:50.027 p.m.` y capturado a las `2:51:04 p.m.` (`🔧 1m 14s…`). Además, ninguno de estos bloques se guardó en `$.store` porque el archivo `transcript-plus_inline-f6bcfe55deb3.json` alcanzó el tope duro de 4 MiB el 25 de octubre de 2026.
- **Objetivo 2 (Causa raíz geométrica del descuadre en `ToolGroup` y residuos en `UserMessage`)**: El descuadre proviene de la combinación de tres factores del motor (`claude.exe`): primero, el transcript envuelve `ToolGroup` en un `<Box>` con `flexDirection: "row"` por defecto (`iP`), de modo que mientras está activo su subfila `⎿` (`flexGrow: 1`) fuerza el ancho al 100% del viewport (`152` columnas × `4` filas), pero al terminar colapsa de golpe a su ancho intrínseco (`41` columnas × `3` filas); segundo, en `withTimestamp`, usar `flexDirection: 'column-reverse'` con dos hijos en flujo superpuestos en `y = L + 1` (`marginBottom: -1`) activa `OuterBox.childrenOverlap = true` en el motor de pintado (`gv`), inhabilitando el *safe-blit* (`xR`) e inyectando `overflow: "hidden"` en el contenedor (`Z$n`) porque el footer sigue siendo `position: 'absolute'`; tercero, cuando se produce ese encogimiento vertical/horizontal o un *reflow* de 1 columna y los bloques posteriores empujan esas filas por encima de `scrolledOutRows` (`q` en `lf.render`), el diferenciador deja de repintar las filas con `pe < q`, congelando en pantalla el `╭` en `col = COLS - 1`, el salto de línea `─ 🕐 ... | ToolGroup ───────╮│` y el residuo `2   ─ │`.
- **Objetivo 3 (Brechas del ciclo de vida de eventos, atribución y persistencia)**: Se identificaron cinco fallos estructurales de estado: (1) los bloques de narración de *adaptive thinking* (`type: "thinking"` renderizados como `AssistantMessage` con `isSummary: true`) son ignorados tanto por `onStep` como por `onAppend`, dejándolos sin footer `🧠`, sin persistencia y sin cerrar `lastCall` del `ToolGroup` previo; (2) `$.store` está 100% bloqueado desde el 25 de octubre de 2026 por superar el límite de 4 MiB de JSON impuesto por el motor (`4.194.268` / `4.194.304` bytes); (3) `onSubmit` y `RESOLVER.UserMessage` no filtran `e.origin.kind === 'composer'`, atribuyendo `🪝` a notificaciones de subagentes; (4) `AssistantMessage` no se suscribe a cambios ni invalida el render al recibir su duración en `onAppend`; y (5) `expandedView` se infiere de una variable global mutable a partir de `UserMessage.props.isExpanded`, y `withSpinner` pierde la hora cuando hay tareas `in_progress`.
- **Objetivo 4 (Verificación empírica en el motor de layout y secuencias ANSI)**: La inspección directa del diferenciador `class lf` en `claude.exe` demostró por qué el icono `🪝` se comporta distinto a `🕐`, `🔧`, `🧠` y `👤`: la función interna `NC(u.char)` (`claude.exe:298272900`) activa un reposicionamiento especial de cursor exclusivamente para el bloque Unicode `U+1FA70..U+1FAFF` (al que pertenece `🪝` = `U+1FA9D`), que al combinarse con la omisión de espacios sin estilo en `vg` y la fusión de `cursorTo` consecutivos en `mf(q)` provoca en ConPTY/Windows Terminal que `🪝` pise el espacio siguiente (`🪝2.3s`).

---

## Hallazgos por tema

### 1. Contracción brusca de dimensiones en `ToolGroup` y colisión con `column-reverse` (`CR-1`)

- **Hecho verificado (`claude.exe:316261800`, `316263000`, `316265735`, `315960496`)**: En el switch principal del transcript de Claude Code, las filas `assistant` y `user` se montan dentro de `<Box flexDirection="column" width="100%">`, lo que estira horizontalmente sus recuadros a todo el ancho del terminal (`COLS`). En cambio, `case "collapsed_read_search"` (`ToolGroup`) se monta dentro del envoltorio de visibilidad `iP`:
  ```js
  function iP({ children: i }) {
    ...
    return e(s, { ref: t, children: f.current });
  }
  ```
  El componente `s` (`pe` en `claude.exe:297988000`) define por defecto `l.flexDirection ??= "row"` y no fija `width`. En un contenedor Flexbox `row`, el eje principal es el horizontal, por lo que el hijo no se estira al ancho del viewport salvo que algún descendiente tenga `flexGrow: 1`.
- **Hecho verificado (`claude.exe:316216300`)**: Dentro del componente `mf` de `ToolGroup`, mientras el grupo está activo (`T === true`, como en el 4.º bloque de la captura), se renderiza la subfila `wu` (`  ⎿  "Restart\b|Restart \{"`), cuyo segundo hijo es `e(s, { flexDirection: "column", flexGrow: 1, ... })`. En Yoga, un nodo con `flexGrow: 1` dentro de un árbol con restricción `AtMost(COLS)` se expande al 100% del viewport (`152` columnas). En el instante en que el grupo pasa a inactivo (`T === false`, como en el 2.º bloque de la captura), `wu` desaparece y queda únicamente `Mu` (`Searched for 4 patterns, read 2 files`), que carece de `flexGrow: 1`. Como resultado, el recuadro de `ToolGroup` **se contrae en un único frame de 152 columnas × 4 filas a 41 columnas × 3 filas**.
- **Hecho verificado (`mods/transcript-plus/hooks/register.js:699-738` y `claude.exe:298318200-298320000`)**: En `withTimestamp` (modificado en el commit `2b8afd5`), el `Box` exterior usa `flexDirection: 'column-reverse'` y declara como segundo hijo en flujo el contenedor del header con `{ marginLeft: 2, marginRight: 2, marginBottom: -1 }`. En la función `gv` del motor de pintado (`claude.exe:298318500`), el motor verifica si los rectángulos de los hijos en flujo (`!pe`, es decir, `style.position !== "absolute"`) se solapan:
  ```js
  if (q ||= Se.x < ae && V < Se.x + Se.width && Se.y < ne && ee < Se.y + Se.height, q)
    n.childrenOverlap = !0;
  ```
  Como el `Box` con `borderStyle: 'round'` y el `Box` del header son ambos hijos en flujo y comparten la fila `y = L + 1` debido a `marginBottom: -1`, el motor marca permanentemente `OuterBox.childrenOverlap = true`. Esto aborta en `xR` (`claude.exe:298319000`: `if (P.childrenOverlap !== !1) return p`) la reutilización por *blit* de subárboles adyacentes.
- **Hecho verificado (`claude.exe:312023200` y `286005000`)**: En `useRenderDrawing` (`Z$n`), cuando la sesión corre en el buffer normal del terminal (`!Ai()`, fuera de *fullscreen*), el motor evalúa `M = (f || !_) && R !== void 0 && _fr(R)`, donde `_fr(R)` devuelve `true` si cualquier `Box` del árbol tiene `position` o `top/left/right/bottom`. Como el footer de `withTimestamp` sigue usando `position: 'absolute', bottom: 0`, `_fr(R)` es `true` y el motor envuelve automáticamente el sitio en un `<Box overflow="hidden">`.

### 2. Diferenciador ANSI (`lf.render`), anomalía exclusiva del glifo `🪝` (`U+1FA9D`) y congelación en `scrolledOutRows` (`CR-2`)

- **Hecho verificado (`claude.exe:298272500-298273000`)**: En `class lf` (el generador de parches ANSI de Claude Code), la función `Lb` aplica un tratamiento especial de cursor cuando `T = m >= 3 || (m === 2 && NC(u.char))` es verdadero:
  ```js
  function NC(n) {
    let u = n.codePointAt(0);
    if (u === void 0) return !1;
    if (u >= 129648 && u <= 129791 || u >= 129792 && u <= 130047) return !0;
    ...
  }
  ```
  El rango `129648..129791` corresponde a `U+1FA70..U+1FAFF` (*Symbols and Pictographs Extended-A*). De los cinco emojis utilizados por `transcript-plus`:
  - `🕐` (`U+1F550` = `128336`) → `NC` es `false`
  - `🔧` (`U+1F527` = `128295`) → `NC` es `false`
  - `🧠` (`U+1F9E0` = `129504`) → `NC` es `false`
  - `👤` (`U+1F464` = `128100`) → `NC` es `false`
  - **`🪝` (`U+1FA9D` = `129693`) → `NC` es `true`**
  Cuando `Lb` dibuja `🪝` en la columna `p`, emite `{ cursorTo: p + 2 }, " ", { cursorTo: p + 1 }, "🪝", { cursorTo: p + 3 }`. Sin embargo, en `Hb` (`claude.exe:298272100`), `vg` (`claude.exe:298216000`) omite las celdas cuyo carácter es el espacio sin estilo (`v === 0`), y a continuación el optimizador `mf` (`claude.exe:298283719`) fusiona operaciones `cursorTo` adyacentes (`if (p === "cursorTo" && T === "cursorTo") u[g] = m`). Al atravesar la capa de traducción de Windows ConPTY (`OpenConsole.exe`), el glifo `🪝` invade la celda del espacio siguiente, causando que `" 🪝 2.3s "` se pinte como **`🪝2.3s`** sin espacio de separación (exactamente como se observa en el Bloque 1 de la captura, mientras que `🔧 55s` y `🔧 1m 14s…` sí conservan su espacio).
- **Hecho verificado (`claude.exe:298269500-298270500`)**: Cuando el alto del documento disminuye en `ce` filas (`G = z < 0`, p. ej. cuando el `ToolGroup` de las `2:48:47 p.m.` se pliega al terminar a las `2:49:42 p.m.`), `lf.render` ejecuta al inicio del frame un borrado relativo desde la posición previa del cursor (`P.txn` con `clear(ce)` y `cursorMove(0, -1)`). Si en esa transición o por un ajuste de ancho/reflow del terminal el borde previo de ancho completo se desfasa en 1 fila/columna:
  - En el Bloque 1 (`UserMessage`), quedan sin limpiar en la fila 1 (extremo derecho de la línea de contenido) los caracteres **`2   ─ │`**, situados exactamente en las mismas columnas horizontales que `2.3s ─╯` de la fila 2.
  - En el Bloque 2 (`ToolGroup`), el carácter inicial **`╭`** cae en la última columna (`col = COLS - 1`) de las filas 3 y 4, provocando que los 40 caracteres restantes del borde superior (`─ 🕐 2:48:47 p.m. | ToolGroup ───────╮`) hagan *soft-wrap* a las columnas `0..39` de la fila 4 (una columna a la izquierda del borde derecho real del recuadro en `col = 40`, dejando visible el `│` previo y formando `╮│`).
- **Hecho verificado (`claude.exe:298269800`)**: En modo normal (`altScreen === false`), `lf.render` calcula el límite de filas salidas del viewport activo:
  ```js
  q = Math.max(..., this.scrolledOutRows.get(n) ?? 0);
  // Dentro de Rg:
  if (pe < q) {
    if (f || G || pe >= Y) return se = !0, ye = pe, !0;
    return;
  }
  ```
  En cuanto se añadieron el Bloque 3 (`2:49:49 p.m.`) y el Bloque 4 (`2:49:50 p.m.`), `q` avanzó por debajo de los Bloques 1 y 2. A partir de ese instante, `lf.render` ignora toda celda con `pe < q`, razón por la cual los Bloques 1 y 2 quedaron congelados con la corrupción visual mientras que los Bloques 3 y 4 se dibujaron completamente limpios.
- **Hecho verificado sobre por qué no se detectó en la sesión `9bfb96f8` (`9bfb96f8...jsonl:160, 350`)**: El detector `replay.py` utilizado para validar la variante `vN` (`column-reverse`) solo buscaba con una expresión regular si la línea con `🕐 ... | Tipo` no tenía `╭` tres posiciones antes, y las pruebas se centraron en *scroll* sobre un mensaje largo ya renderizado, sin evaluar la contracción de un `ToolGroup` de 100% de ancho a 41 columnas seguida de crecimiento de `scrolledOutRows`.

### 3. Invisibilidad de los bloques de narración (`AssistantMessage` con `isSummary: true`) y retroceso de contadores en `ToolGroup` (`CR-3`)

- **Hecho verificado (`2f87992d...jsonl:766, 840, 842` y `claude.exe:316094300`)**: Con Claude Opus 5.5 y el beta `thinking-display-updates-2026-08-18` (`thinking: { type: "adaptive", display: "updates" }`), los mensajes de avance que el modelo emite entre llamadas a herramientas (como el Bloque 3 de la captura a las `2:49:49 p.m.`: *"Confirmé dos defectos reales..."*) se guardan en la conversación como bloques `type: "thinking"` firmados con `narration` (línea 842 del `.jsonl`). En la TUI, la función `zi` (`claude.exe:316094300`) los monta como componente **`AssistantMessage`** pasándole **`props: { text: M9(x), isFirstOfReply: f, isSummary: true }`**.
- **Hecho verificado (`mods/transcript-plus/hooks/register.js:395-406, 455, 479-484`)**:
  1. En `onStep` (`register.js:395`), la condición `if (b.kind !== 'thinking')` descarta todos los chunks `thinking`. Nunca los añade a `modelBlocks` y **nunca ejecuta `lastCall.delete(agent)`** (que solo se ejecuta si `b.kind === 'text'` en la línea 398).
  2. En `onAppend` (`register.js:455`), `textOf` filtra exclusivamente `message.content.filter(b => b.type === 'text')`. Cuando llega por `session.append` la fila `response` de la línea 842 (cuyo único bloque es `type: "thinking"`), `textOf` devuelve `""` y la línea 480 (`if (!text.trim()) break`) aborta sin llamar a `pinTiming`.
- **Efectos verificados**:
  1. **Ausencia de footer `🧠`**: Como `onAppend` nunca registra el `uuid` de ese `AssistantMessage` (`e9633a9e-f989-4de3-83fb-7f19d0ad0b8a`), `RESOLVER.AssistantMessage` cae en `entryFor(e.requestId)`, que crea en pleno render `{ time: Date.now() }` sin `duration` y sin `fromEvent: true`. Por eso el Bloque 3 de la captura no tiene footer `🧠` y su hora tampoco se marca para guardar en `$.store`.
  2. **Fuga de `lastCall` y salto hacia atrás del contador de `ToolGroup`**: Como el bloque de narración no limpia `lastCall` en `onStep`, el `ToolGroup` anterior (`2:48:47 p.m.`) mantiene `awaitsAnotherCall(calls) === true` incluso después de que el `AssistantMessage` ya apareció en pantalla a las `2:49:49 p.m.`. Su contador en vivo sigue avanzando (`56s…`, `57s…`, …, `1m 02s…`) y recién cuando arranca la primera llamada del *nuevo* `ToolGroup` a las `2:49:50 p.m.` y sobrescribe `lastCall`, el primer `ToolGroup` se cierra y su footer retrocede de golpe a `🔧 55s`.

### 4. Bloqueo total de persistencia en `$.store` por agotamiento del límite de 4 MiB (`CR-4`)

- **Hecho verificado (`mods/transcript-plus/.claude-plugin/types/claude-code/index.d.ts:3480` y `C:\Users\Cristian\.claude\plugins\store\transcript-plus_inline-f6bcfe55deb3.json`)**: El método `$.store.set(key, value)` del motor rechaza cualquier escritura cuando el JSON total serializado del store supera **4 MiB (`4.194.304` bytes)**.
- **Hecho verificado (medición directa del archivo de store)**: El archivo `transcript-plus_inline-f6bcfe55deb3.json` contiene actualmente 16 buckets diarios (`days/2026-10-10` a `days/2026-10-25`) con **62.801 entradas** (`25.249` claves `u:`, `25.435` claves `r:`, `5.111` claves `g:` y `7.006` claves `uuid`). Su tamaño en disco (formateado a 2 espacios) es de **`5.878.001` bytes** y su longitud en JSON compacto (`JSON.stringify`) es de **`4.194.268` bytes**, quedando únicamente **36 bytes libres** respecto al límite de `4.194.304` bytes.
- **Hecho verificado (`mods/transcript-plus/hooks/register.js:129, 145-162, 201-214`)**: `loadStore` solo elimina buckets cuya fecha sea anterior a `RETENTION_DAYS = 30` días. Como entre el 10 de octubre y el 25 de octubre solo habían transcurrido 15 días, ningún bucket fue podado; desde la entrada `r:call-df10e2d9...` del **25 de octubre de 2026**, **todas las llamadas a `await $.store.set(...)` dentro de `flush($)` son rechazadas por el motor**, tras haber vaciado `pendingKeys.clear()` en la línea 210. En consecuencia, ninguna sesión de los últimos 8 días se ha persistido: al reanudar cualquier sesión con `--resume` o `--continue`, todos los bloques pierden su duración y muestran la hora actual del render.

### 5. Atribución indebida de `🪝`, condiciones de carrera en `AssistantMessage` y fragilidad de `expandedView` / `Spinner` (`CR-5`, `CR-6`, `CR-7`)

- **Atribución de `🪝` a notificaciones de sistema (`register.js:331-358, 471-478, 567-569` e `index.d.ts:9347-9460`)**:
  - `onSubmit` se ejecuta ante cualquier evento `prompt.submit` sin inspeccionar `e.origin.kind`. Según `index.d.ts:9347`, `prompt.submit` se dispara no solo cuando el usuario pulsa Enter (`e.origin.kind === 'composer'`), sino también en `task-notification` (subagente finalizado, como el Bloque 1 de la captura), `scheduled-trigger`, `peer`, `channel`, `auto-continuation`, etc.
  - Además, `RESOLVER.UserMessage` (`register.js:569`) asigna fijo `icon: '🪝'` a todo `UserMessage` con `requestId !== 'placeholder'`, y `UserMessage` en `index.d.ts:10414` recibe `e.props.origin` de solo lectura.
- **Falta de invalidación/suscripción en `AssistantMessage` (`register.js:479-484, 572, 653`)**:
  - `RESOLVER.AssistantMessage` nunca activa `subscribed: true`, y `onAppend` (al fijar la duración de `door === 'response'`) no llama a `$.ui.invalidate('ui.render')` ni actualiza `$.state`. Si un `AssistantMessage` de texto normal se dibuja antes de que `pinTiming` complete su `duration`, o si el texto renderizado difiere de `b.text.trim()` porque el motor oculta etiquetas como `<context>` (`index.d.ts:10459`), el bloque queda permanentemente sin footer `🧠`.
- **Contaminación de `expandedView` y márgenes `noMargin` (`register.js:510, 572, 646, 712` y `claude.exe:316204500`)**:
  - `expandedView` es un booleano global que toma el valor de `e.props.isExpanded` del último `UserMessage` renderizado (`register.js:646`). Sin embargo, `index.d.ts:10419` documenta que `UserMessage.props.isExpanded` también es `true` fuera de `ctrl+o` en filas bajo *speaker label* cuyo cuerpo cabe en el límite de vista, mientras que `AssistantMessage` no expone `isExpanded` en sus `props` (`claude.exe:316088388`). Si un `UserMessage` con `isExpanded: true` se renderiza fuera de `ctrl+o`, activa `expandedView = true` y hace que los `AssistantMessage` posteriores usen `marginTop: 0` en lugar de `-1`, dejando una línea vacía bajo el header.
  - Simétricamente, dentro de un `ToolGroup` expandido (`claude.exe:316204500`), las notificaciones `<task-notification>` se montan con `addMargin: false` (`marginTop: 0`), pero `RESOLVER.UserMessage` no declara `noMargin`, por lo que `marginTop: -1` recorta su contenido.
- **Pérdida del timestamp en `Spinner` cuando hay tareas en curso (`register.js:748-760` y `claude.exe:312071500`)**:
  - En el componente `xn` del `Spinner` (`claude.exe:312071500`), el texto mostrado se resuelve como `At = _ ?? (_t === void 0 ? void 0 : NSr(_t, V)) ?? (J || Mt)`, donde `_` es `props.message`, `_t` es el `activeForm`/`subject` de la tarea activa (`in_progress`) y `J` es `props.word`. Cuando `e.props.message === null` y existe una tarea `in_progress`, `withSpinner` deja `message: null` y solo prefija `word`, por lo que el `Spinner` muestra `_t` sin la marca `🕐 hora · `.

---

## Conclusiones

Las anomalías visuales y de estado no son fallos aislados ni aleatorios, sino el efecto directo de **siete causas raíz estructurales** donde las suposiciones de `transcript-plus` chocan con el funcionamiento interno del motor de Claude Code v2.1.316:

1. **Arquitectura del árbol en `withTimestamp` (`CR-1` y `CR-2`)**:
   - El uso de `flexDirection: 'column-reverse'` con el header en flujo (`marginBottom: -1`) y el footer en `position: 'absolute'` provoca que dos hijos en flujo se solapen (`childrenOverlap = true`) y que el contenedor del render site active `overflow: "hidden"` en modo normal. Unido a que `ToolGroup` vive dentro de un `<Box flexDirection="row">` (`iP`) que pasa de 100% de ancho (cuando tiene la subfila `⎿` con `flexGrow: 1`) a ~41 columnas (al colapsarse), el cambio brusco de ancho y alto desalinea el repintado diferencial (`lf.render`), y el avance de `scrolledOutRows` (`q`) congela los residuos en las filas superiores.
   - El icono `🪝` (`U+1FA9D`) es el único de los cinco iconos del mod que cae dentro del rango `U+1FA70..U+1FAFF` interceptado por `NC(u.char)` en `claude.exe`, lo que dispara secuencias `cursorTo` adicionales que en ConPTY se comen el espacio posterior (`🪝2.3s`). Sustituir `🪝` por un símbolo fuera de `U+1FA70..U+1FBFF` (o asegurar un separador no omitible por `vg`) elimina de raíz esa discrepancia de avance de cursor.
2. **Arquitectura del ciclo de vida de eventos (`CR-3`, `CR-5`, `CR-6`, `CR-7`)**:
   - `onStep` y `onAppend` deben tratar los bloques de narración (`thinking` mostrados como `AssistantMessage` con `e.props.isSummary === true`) igual que los bloques `text`: registrando su inicio/fin, limpiando `lastCall` del agente para cerrar a tiempo el `ToolGroup` previo, y fijando su duración `🧠`.
   - `onSubmit` y `RESOLVER.UserMessage` deben filtrar `e.origin?.kind === 'composer'` (o `e.props.origin?.kind === 'composer'`) para que solo los prompts humanos reciban la medición `🪝` de hooks `UserPromptSubmit`, dejando las notificaciones de tareas en segundo plano (`task-notification`) solo con su hora de creación.
3. **Arquitectura de persistencia en `$.store` (`CR-4`)**:
   - `$.store` necesita una política de **poda por presupuesto de bytes** (manteniendo el tamaño serializado total bajo un umbral seguro, p. ej. `<= 3,5 MiB` de los `4 MiB` máximos, desalojando los días más antiguos en `loadStore` y `flush`) además de la retención por días, junto con manejo de errores en `$.store.set` y compactación de claves si es necesario. Sin esto, el store actual seguirá bloqueado en `4.194.268` bytes sin persistir ningún dato nuevo.
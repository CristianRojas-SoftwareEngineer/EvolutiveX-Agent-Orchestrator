## Context

El statusline oficial de Claude Code se invoca en 4 triggers documentados (assistant message, `/compact`, permission mode, vim mode) con debounce de 300ms. Esa cadencia colapsa un agentic loop de 38 hops en una única actualización visible al final del turno. El usuario lo percibe como un statusline "congelado" durante la ejecución.

El proxy ya persiste `session-metrics.json` con granularidad per-step (`updateFromStep` se llama tras el SSE de cada step billable), por lo que el "dato" existe. Lo que falta es acoplar la **frecuencia de invocación del statusline** a la **frecuencia de cambio del dato** para que la Tabla 2 muestre progreso visible.

Este cambio (PR-1) implementa dos optimizaciones complementarias:

1. **`refreshInterval: 3`** en el bloque `statusLine` de `settings.json` para forzar re-invocación por timer (palanca documentada).
2. **Cierre temprano con caché de mtime** para terminar la invocación en <10ms cuando `session-metrics.json` no cambió.
3. **Indicador visual "● live"** en la cabecera de la Tabla 2 para que el usuario sepa que el refresh viene del timer, no de un trigger.

La **pre-compilación a JavaScript con Bun** se difiere a un **PR-2 futuro** (ver Decisión deferida más abajo). El coste de spawn estimado (~100-150ms por invocación) es aceptable porque el cierre temprano lo amortiza: en una sesión idle de Claude Code, el 90% de las invocaciones cierran en <10ms sin re-renderizar.

## Goals / Non-Goals

**Goals:**

- Lograr actualización visible de `# Steps` y tokens en la Tabla 2 con re-ejecución determinista cada 3 segundos (`refreshInterval: 3`) durante el agentic loop, sin hacks sobre la API documentada de Claude Code.
- Mantener consumo de CPU steady-state < 5% en una laptop moderna (umbral de "aceptable" en este PR, no óptimo).
- Mantener la compatibilidad hacia atrás: si el usuario no quiere live refresh, basta con `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=0` antes de reinstalar.
- Hacer el `refreshInterval` configurable para evitar imponer el coste en máquinas con batería limitada.
- Cerrar todos los tests existentes del statusline (no romper el contrato actual).

**Non-Goals (este PR):**

- Pre-compilar el script con Bun. Se difiere a PR-2 condicional a métricas.
- Reemplazar el statusline oficial de Claude Code por un canal paralelo (webview, notifs de escritorio). Ortogonal, evolución futura.
- Modificar Claude Code. El cambio se ciñe a la API documentada.
- Garantizar < 1s de latencia entre step y render visible. La cadencia objetivo es cada 3 segundos; pasos más rápidos se agrupan entre ticks del timer (consistente con debounce 300ms de los triggers por evento).
- Internacionalizar el indicador "● live". Es un artefacto de UI interno, queda en inglés.

## Decisions

### Decisión 1 — Runtime del script del statusline: `npx + tsx` (sin cambios)

**Elección:** Mantener el script como `router-status.ts` ejecutado vía `npx --prefix <root> tsx <root>/scripting/router-status.ts` por Claude Code. Sin bundle pre-compilado en este PR.

**Por qué:** El cold path (spawn npx+tsx+node) cuesta ~100-150ms por invocación. En el caso típico (sesión idle de Claude Code con pocos steps reales), el cierre temprano mtime reduce la invocación a ~5-10ms. El coste agregado es aceptable para validar la hipótesis de "refresh cada 3s es viable" antes de invertir en optimización con Bun.

**Alternativas consideradas:**

- **Bun-compiled bundle** (`bun build` → `router-status.js`): startup ~20ms. Mejor, pero añade ~50MB de devDep, exige Bun en PATH del contribuidor, y un hook `postinstall` que puede romper `npm install` si Bun no está disponible. **Se difiere a PR-2** (ver Decisión deferida).
- **tsc + node directo** (sin tsx): startup ~100ms. Marginal vs. npx+tsx; la fricción de mantener una copia compilada no compensa.

**Trade-off:** Cada invocación con cambio real paga ~100-150ms de cold start. Si el usuario nota >5% CPU o latencia visible, la optimización con Bun es el siguiente paso natural.

### Decisión 2 — Cierre temprano basado en `mtime` y `size`, no en hash de contenido

**Elección:** Comparar el `mtime` (epoch ms) y el `size` (bytes) de `session-metrics.json` con valores cacheados en `.statusline-state.json` (`lastRenderedMtimeMs`). Si ambos coinciden, imprimir el último render cacheado y exit.

**Por qué mtime + size:** `fs.statSync()` toma <1ms en SSD. El hash de contenido (SHA-256) tomaría 5-10ms sobre el JSON, anulando la ventaja. El mtime es suficiente porque `updateFromStep` siempre re-escribe el archivo con `writeFileSync` (mtime nuevo). El `size` adicional cubre el caso degenerado en que dos `writeFileSync` ocurren en el mismo milisegundo y producen el mismo mtime con contenidos distintos.

**Alternativas consideradas:**

- **fs.watch + EventEmitter**: más complejo, requiere mantener handles abiertos. El `refreshInterval` de Claude Code ya dispara invocaciones; no hace falta observar archivos.
- **Polling con `setInterval` interno**: el script no puede sobrevivir entre invocaciones (Claude Code lo cancela al in-flight). Imposible.

**Riesgo residual:** Si dos `updateFromStep` ocurren dentro del mismo milisegundo Y producen el mismo size (colisión despreciable en la práctica: el JSON siempre crece al añadir métricas), se pierde un paso. Aceptable; un re-render de todas formas ocurriría en la siguiente invocación del timer (como máximo `refreshInterval` segundos después).

### Decisión 3 — `refreshInterval: 3` por defecto, configurable por variable de entorno

**Elección:** El instalador escribe `refreshInterval: <N>` en `statusLine`, donde `<N>` (entero ≥ 1, en segundos) viene de `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL`. Según la [documentación de Claude Code](https://code.claude.com/docs/en/statusline), `refreshInterval` re-ejecuta el comando cada N segundos además de las actualizaciones por evento; el mínimo es `1`; si se omite, solo corre en eventos.

Tabla de resolución:

| Valor de la env var | Comportamiento |
|---|---|
| ausente | `refreshInterval: 3` (default) |
| `""` (string vacío) | campo omitido (Claude Code usa solo triggers) |
| `"0"` | campo omitido (Claude Code usa solo triggers) |
| `"1"`, `"2"`, `"3"`, `"5"`… | `refreshInterval: <N>` (entero en segundos) |
| `"off"`, `"fast"`, etc. (no numérico) | `refreshInterval: 3` (default) **+ warning a stderr** |

**Por qué configurable:** No todos los usuarios aceptan un spawn periódico cada 3 segundos. La variable permite desactivar el timer (`0` o `""`), acelerar a `1` s (mínimo de la API), o relajar a `5` s para batería.

**Default:** Si la variable no está definida, usar `3`. Justificación: equilibra visibilidad del progreso en la Tabla 2 (~0.33 invocaciones/s) con coste de CPU amortizado por el cierre temprano.

**Por qué distinguir entre `""` y ausente:** `""` representa "presente pero vacía" (un shell que exporta la var sin valor). Tratar `""` y ausente distinto permite al usuario hacer `unset SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` (→ default `3`) o `export SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=` (→ desactivado) según su intención. La distinción es trivial en código (2 ramas) y elimina ambigüedad en la spec.

**Por qué el parser tolera no numéricos con warning en vez de fallar:** Falla dura rompería `setup:install` por un typo del usuario (`SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=off`). Mejor degradar al default y avisar.

**Alternativa: refreshInterval en el JSON directamente sin variable:** El usuario tendría que editar `settings.json` a mano. Peor UX.

### Decisión 4 — Indicador visual en cabecera de Tabla 2, no en Tabla 1

**Elección:** Mostrar `● live (3s)` alineado a la derecha en el título de la Tabla 2 ("Trabajo por niveles de razonamiento"), en color dim, solo cuando `refreshInterval ≥ 1` y Tabla 2 está activa.

**Por qué en el título de la Tabla 2:** La actualización live solo afecta a la Tabla 2. La cabecera de la Tabla 2 ya se construye manualmente (línea ~1083-1086 de `router-status.ts`: `titleText = '╭─ Trabajo por niveles de razonamiento '`). Insertar el indicador aquí es el camino de menor cambio y evita tocar `renderTable`.

**Por qué no en Tabla 1:** Mostrar el indicador en Tabla 1 (siempre visible) contaminaría la cabecera permanente con información específica de una tabla opt-in.

**Color dim:** metadata secundaria; no debe competir visualmente con `# Steps` o tokens.

**Texto exacto:** `● live (Ns)`, donde `N` es el valor de `refreshInterval` en segundos (p. ej. `● live (3s)`, `● live (1s)`, `● live (5s)`). El sufijo en segundos coincide con la semántica de la API de Claude Code.

### Decisión 5 — El campo `lastRenderedTable2Output` contiene el render textual exacto

**Elección:** El campo `lastRenderedTable2Output` en `.statusline-state.json` SHALL contener la cadena textual exacta (con códigos ANSI y `\n` final) del último render real de la Tabla 2. En el cierre temprano, se imprime esta cadena byte por byte.

**Por qué textual en vez de reconstruirlo:** Reconstruir la tabla en cada cierre temprano costaría ~10-30ms (re-aggregate metrics + render). Almacenar el output listo para imprimir es ~5-10x más rápido y el JSON del cache sigue siendo pequeño (Tabla 2 son ~500 bytes típico).

**Riesgo:** Si Claude Code cancela una invocación a mitad del render normal, el cache puede quedar con un render parcial. Mitigación: el campo se escribe **al final del render** (después de `renderTokenTable` retornar), no durante. Si Claude Code mata el proceso antes, el cache previo persiste y el siguiente cierre temprano usará la última versión completa.

### Decisión deferida — Pre-compilación con Bun queda fuera de este PR

**Elección:** NO añadir Bun a `devDependencies` ni hook `postinstall` ni bundle `scripting/build/router-status.js` en este PR.

**Cuándo se justificaría hacerlo (PR-2):**
- Si la medición de CPU steady-state (tarea 7.8) muestra >5% en una laptop moderna con `refreshInterval: 3` activo.
- Si la latencia de cold start (~100-150ms) es visible para el usuario como "flash" entre renders.
- Si el bundle pre-compilado se vuelve útil para otros fines (e.g., distribución sin TypeScript).

**Riesgos del PR-2 (documentados para el futuro):**
- ~50MB adicionales en `node_modules` de contribuidores.
- Hook `postinstall` que puede romper `npm install` en entornos sin Bun.
- Complejidad de mantener `router-status.ts` y `router-status.js` sincronizados.

**Beneficio de aplazar:** el PR-1 valida empíricamente la hipótesis de "refresh cada 3s es viable" con el menor blast radius posible. Si falla, el rollback es trivial (un `git revert` + `setup:install`).

## Risks / Trade-offs

- **CPU steady-state elevado** → Mitigación: cierre temprano reduce CPU a <5% estimado. Si el usuario detecta >5%, desactiva con `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=0` o sube a 2-5 segundos. Documentar este knob prominentemente.
- **Batería en laptops** → Mitigación: default de 3 segundos es aceptable en desktop; usuarios en laptop pueden subir a 5 segundos o desactivar. Considerar un preset `laptop` en PR-2 o versión futura.
- **Race entre `updateFromStep` y `mtime check`** → Mitigación: comparar `mtime` Y `size` del archivo. Si cualquiera difiere del cache, re-render. Reduce el riesgo de "miss" a prácticamente cero.
- **Claude Code cancela in-flight scripts >1s** → Mitigación: el cierre temprano garantiza <50ms en el 90% de las invocaciones; el peor caso (re-render completo) sigue <200ms con tsx+node. Bien dentro del budget de 1s de Claude Code.
- **Compatibilidad con instalaciones que ya tienen `statusLine` propio** → Mitigación: el instalador sigue exigiendo `--force` para sobrescribir `statusLine` ajeno, igual que ahora. La adición de `refreshInterval` solo aplica a bloques del propio proxy.
- **Cache corrupto (JSON inválido)** → Mitigación: `readStatuslineCache` ya devuelve `{}` en error de parseo; el cierre temprano se salta y se hace render completo. Comportamiento verificado por test existente (`router-status-output.test.ts:87`).
- **Windows + scripts con espacios en la ruta** → Mitigación: el instalador sigue usando `buildNpxTsxCommand` con quoting multiplataforma. Sin cambios.
- **Tests existentes pueden romperse al introducir el cierre temprano** → Mitigación: el cierre temprano es opt-in por la presencia de `lastRenderedMtimeMs` en el cache. Si la cache no existe (caso de tests), se hace render completo. Tests del statusline (`router-status-*.test.ts`) deben seguir pasando sin cambios. Un test nuevo cubre el caso "segunda invocación con mtime sin cambios → output byte-idéntico".
- **Caracteres de control en el render textual** → Mitigación: el campo `lastRenderedTable2Output` se persiste vía `JSON.stringify`, que rechaza ciertos caracteres de control (`\x00` en particular). En la práctica los códigos ANSI (`\x1B[...m`) son serializables, pero un bug que introduzca caracteres no imprimibles haría que `writeStatuslineCache` falle silenciosamente (catch ya existente en línea 478 del código). Mejora futura: sanitizar la cadena antes de persistir (reemplazar `\x00`–`\x1F` excepto `\x1B` y `\n`).
- **Re-render innecesario cuando el archivo nunca ha existido** → Mitigación parcial: cuando `session-metrics.json` no existe, `readSessionMetricsMtime` retorna `null`, lo que imposibilita el cierre temprano y fuerza un re-render (con valores en cero). Esto es correcto (no hay cache válido) pero subóptimo para sesiones que no producen métricas. Optimización futura: cachear un sentinel explícito (e.g., `lastRenderedMtimeMs: -1`) que represente "archivo ausente" y permita imprimir el cache con valores en cero. Bajo prioridad; el render con cero es rápido (~10-20ms).

## Migration Plan

### Despliegue

1. Merge del PR.
2. Usuarios existentes del proxy ejecutan `npm run setup:install` para que el instalador actualice su `statusLine` con el campo `refreshInterval`. Es idempotente: si ya hay un `statusLine` del proxy, se actualiza in-place.
3. Usuarios que quieran desactivar el live mode: `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=0 npm run setup:install`. No requiere más cambios.

### Rollback

- **Suave**: `SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL=0 npm run setup:install` elimina el `refreshInterval` y vuelve a la cadencia por triggers. Sin reinstalar código.
- **Completo**: `git revert` del PR + `npm run setup:install` regenera `statusLine` sin el campo. Sin estado huérfano que limpiar (no hay bundle, no hay cache de runtime que migrar).

### Compatibilidad

- El campo `refreshInterval` es opcional para Claude Code. Si está ausente, el comportamiento es idéntico al actual. No hay breaking change para nadie que no reinstale.
- Las nuevas claves en `.statusline-state.json` (`lastRenderedMtimeMs`, `lastRenderedTable2Output`) son backwards-compatible: si un script viejo lee el archivo, ignora las claves extra.
- No hay nuevas dependencias de runtime.

## Open Questions

- **¿Cuándo migrar a Bun (PR-2)?** Decisión deferida a la medición de CPU steady-state (tarea 6.8 de `tasks.md`). Umbral propuesto: si >5% en laptop moderna con `refreshInterval: 3` activo. Si <5%, mantener este PR indefinidamente y no abrir PR-2.
- **¿`SMART_CODE_PROXY__STATUSLINE_REFRESH_INTERVAL` se documenta como opt-out o como opt-in?** El plan lo plantea como opt-out (`refreshInterval: 3` por defecto). El usuario podría preferir opt-in para no imponer el coste a quienes no lo piden. Pendiente de decisión de producto tras el rollout inicial.
- **¿Qué pasa con `subagentStatusLine`?** Claude Code también permite un statusline para subagentes. ¿Aplicamos la misma lógica? El plan actual solo toca el principal. Subagentes quedan con la cadencia por defecto. Pendiente de feedback del usuario.
- **¿Vale la pena añadir un preset "laptop" (`refreshInterval: 5`)?** Podría ser un segundo PR-3 trivial: detección de `process.platform === 'darwin' && batteryLevel < 50%` o similar. Pero añade complejidad de detección. Mejor documentar el knob y dejar al usuario elegir.

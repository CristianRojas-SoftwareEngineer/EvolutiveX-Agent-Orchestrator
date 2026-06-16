## Context

El borde hooks del proxy (`POST /hooks` → `AuditHookEventHandler`) tiene cuatro puntos ciegos de observabilidad identificados mediante análisis de logs de producción y revisión de código. Los cambios son acotados y quirúrgicos: ninguno requiere nueva arquitectura, dependencias externas ni cambios de interfaz pública. Todos operan sobre código ya existente.

Fuentes examinadas: `src/3-operations/audit-hook-event.handler.ts`, `src/5-user-interfaces/http/hooks.controller.ts`, `scripting/post-hook-event.ts`, `configs/hooks.json`, docs oficiales de Claude Code (exit codes y semántica de `SessionStart.source`).

## Goals / Non-Goals

**Goals:**
- Elevar a `warn` (y en un caso a `error`) los logs de fallo de correlación en `Stop`, `SubagentStop` y `StopFailure`
- Detectar y logear como `warn` los payloads con `eventName` vacío antes de despacharlos al handler
- Retornar exit code `1` (error no bloqueante según docs de Claude Code) cuando el relay falla al contactar el servidor
- Corregir el matcher de `SessionStart` en `configs/hooks.json` para incluir todos los valores documentados de `source`

**Non-Goals:**
- Cambiar el contrato de `parseHookEvent` (sigue sin lanzar)
- Cambiar el endpoint HTTP `/hooks` (contrato 202 rápido se mantiene)
- Introducir IPC o endpoint de health para visibilizar errores del relay
- Cubrir eventos de hook no instalados en `configs/hooks.json`

## Decisions

### D1 — Nivel de log para correlación fallida de cierre

**Decisión**: `info` → `warn` para los tres casos de workflow no encontrado en `Stop`, `SubagentStop` (caso 1: agentId no en índice) y `StopFailure`. El caso adicional `SubagentStop` donde el agentId existe en el índice wire pero no en el lifecycle del repositorio se eleva a `error`.

**Alternativa descartada**: mantener `info` para diferenciarlo de errores reales. Descartado porque `Stop`/`StopFailure` sin workflow es siempre una anomalía —no existe un flujo normal en el que lleguen sin un workflow activo— y la invisibilidad en monitoreo es el problema raíz.

**Alternativa descartada**: lanzar excepción. Descartada porque la ejecución del handler es `void` (fire-and-forget) y una excepción no propagada no agregaría observabilidad.

**Justificación del `error` en el caso wire/lifecycle**: agentId en el índice wire pero ausente en el lifecycle indica una inconsistencia de estado interno del `WorkflowRepositoryService` que no puede ocurrir en flujo normal. Es cualitativamente distinto de un evento fuera de orden.

### D2 — Guarda de payload inválido en el controlador, no en el parser

**Decisión**: la guarda `if (!event.eventName)` se añade en `HooksController.handle` entre `parseHookEvent` y `hookEventHandler.execute`. Si el eventName está vacío, se logea `warn` con los primeros 200 caracteres del body y se retorna sin invocar el handler.

**Por qué en el controlador y no en `parseHookEvent`**: `parseHookEvent` tiene un contrato deliberado de "nunca lanzar, siempre devolver un objeto válido". Cambiarlo o agregar lógica de log allí violaría su naturaleza de función pura de dominio (capa 1). El controlador (capa 5) es el punto de entrada correcto para decisiones de logging HTTP.

**Por qué cortar y no solo logear**: despachar un evento con `eventName: ''` al handler invoca el `default` branch del switch (log info "hook desconocido") sin ningún valor. Cortar antes es más directo y evita el procesamiento inútil.

### D3 — Exit code `1` en el relay ante fallo

**Decisión**: `post-hook-event.ts` retorna `1` (en lugar de `0`) cuando `fetch` lanza o cuando `!res.ok`. Retorna `0` solo en éxito o cuando el servidor responde con cualquier código OK.

**Base documental**: la documentación oficial de Claude Code establece que exit code `1` (y otros distintos de `0` y `2`) es un error no bloqueante cuyo stderr aparece en el transcript. Exit code `2` bloquea la acción del asistente —incorrecto para un hook de auditoría. Exit code `0` silencia el error completamente —el problema actual.

**Efecto observable**: si el servidor proxy no está disponible, el usuario verá en el transcript de Claude Code mensajes de "hook error" con el texto que el relay escribe a stderr. No bloquea el flujo del asistente.

**Tradeoff aceptado**: los errores transitorios de red (servidor reiniciándose) generarán ruido en el transcript. Se acepta porque la alternativa (invisibilidad total) ya causó que 5 fallos de correlación en producción pasaran sin detección.

### D4 — Eliminar matcher de `SessionStart` en `configs/hooks.json`

**Decisión**: remover el campo `"matcher": "startup|resume"` de la entrada `SessionStart`. Sin matcher, Claude Code despacha el hook para todos los valores de `source`.

**Base documental**: los docs de Claude Code especifican cuatro valores para `source` en `SessionStart`: `startup`, `resume`, `clear`, `compact`. El matcher actual excluye `clear` (tras `/clear`) y `compact` (tras compactación), que son transiciones de estado de sesión que el proxy debería conocer para correlación correcta.

**Alternativa descartada**: `"matcher": "startup|resume|clear|compact"`. Descartada porque cualquier extensión futura de valores de `source` requeriría actualizar el matcher. Sin matcher es más robusto.

**Alternativa descartada**: `"matcher": "*"`. Equivalente a sin matcher para la semántica de `source`, pero menos idiomático que la ausencia del campo.

## Risks / Trade-offs

- **Ruido en transcript por errores transitorios del relay** (D3) → El usuario verá mensajes de "hook error" durante reinicios del servidor. Mitigación: el mensaje en stderr es conciso (`post-hook-event: HTTP 503 http://...`) y los reinicios son infrecuentes.
- **`clear` y `compact` ahora disparan `SessionStart` hacia el proxy** (D4) → El handler actual emite solo un toast "Sesión iniciada" sin usar el campo `source`. El efecto es que el toast aparece también tras `/clear` y compactación. Es el comportamiento correcto, no un problema.
- **`error` en el caso wire/lifecycle de `SubagentStop`** (D1) → Si hay un bug latente que produce esta inconsistencia con frecuencia, el log de error aumentará el ruido. Mitigación: el log incluye `agentId` y `wfId` para diagnóstico, y la presencia del error señalaría un bug real que debe corregirse.

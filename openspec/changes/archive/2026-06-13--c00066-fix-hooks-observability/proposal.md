## Why

El borde de hooks del proxy silencia cuatro clases de eventos que deberían ser visibles en monitoreo: los fallos de correlación de cierre de ciclo de vida (`Stop`, `SubagentStop`, `StopFailure`) se registran a nivel `info`; los payloads malformados que llegan a `POST /hooks` se procesan sin advertencia; el relay `post-hook-event.ts` siempre retorna exit code `0` incluso ante errores de red, haciéndolos invisibles; y el matcher de `SessionStart` en `configs/hooks.json` excluye los sub-tipos `clear` y `compact` documentados por Claude Code. La investigación de logs identificó 5 fallos de correlación de continuación ocurridos en producción que no generaron ninguna alerta, evidenciando el impacto real.

## What Changes

- **Nivel de log elevado**: cuatro llamadas `logger?.info` → `logger?.warn` en `AuditHookEventHandler` para los casos `Stop`, `SubagentStop` (×2) y `StopFailure` cuando no se encuentra el workflow. El caso de inconsistencia entre índice wire y lifecycle pasa a `logger?.error`.
- **Guarda de payload inválido**: en `HooksController.handle`, tras `parseHookEvent`, se añade una guarda que detecta `eventName === ''` y logea `warn` con los primeros 200 caracteres del body recibido, retornando antes de invocar el handler.
- **Exit codes diferenciados en el relay**: `post-hook-event.ts` retorna `1` (error no bloqueante, documentado por Claude Code) cuando el POST al servidor falla por error de red o respuesta HTTP no-ok; retorna `0` solo en éxito.
- **Corrección del matcher de `SessionStart`**: eliminar el campo `"matcher"` de la entrada `SessionStart` en `configs/hooks.json` para que cubra todos los valores documentados de `source` (`startup`, `resume`, `clear`, `compact`) sin mantenimiento de una lista fija.

## Capabilities

### New Capabilities

- `hooks-observability-hardening`: Conjunto de mejoras de observabilidad en el borde hooks: nivel de log correcto para eventos de cierre no correlacionados, detección temprana de payloads malformados, exit codes semánticos en el relay, y cobertura completa de `SessionStart`.

### Modified Capabilities

- `hooks-lifecycle-correlation`: Cambia el nivel de log de los casos de workflow no encontrado en `Stop`, `SubagentStop` y `StopFailure` de `info` a `warn`/`error`; se añade la guarda de `eventName` vacío en el controlador.

## Impact

- **Capas PKA afectadas**: `3-operations` (`AuditHookEventHandler`), `5-user-interfaces` (`HooksController`), scripting (`post-hook-event.ts`), config (`configs/hooks.json`).
- **Sin cambios de interfaz pública**: el endpoint `/hooks` mantiene su contrato HTTP (202 rápido); `parseHookEvent` no cambia.
- **Sin cambios de persistencia**: no se tocan `sessions/`, schemas ni lógica de workflow.
- **Sin dependencias nuevas**: todos los cambios son ediciones de código existente.
- **Efecto observable en producción**: los fallos de correlación de cierre aparecerán en el nivel `warn` del log del servidor; los fallos del relay aparecerán en el transcript de Claude Code como mensajes de "hook error" no bloqueantes.

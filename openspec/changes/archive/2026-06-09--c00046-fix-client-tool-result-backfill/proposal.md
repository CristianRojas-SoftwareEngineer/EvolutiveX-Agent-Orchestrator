## Why

La sesión patrón `8c440211` expuso que `tools/*/result.json` queda vacío o con `PostToolUseFailure` genérico para Bash, aunque el stdout/stderr real llega en la continuation HTTP ~100 ms después. El fix de junio (`completeClientToolResultsFromContinuation`) asumía que `PostToolUse` **no llegaba**; en producción los hooks **sí llegan** pero sin `lastAssistantMessage`, completan el tool en estado terminal y el guard de idempotencia de `completeToolUse` impide el backfill. Dos fuentes de verdad compiten sin precedencia definida.

## What Changes

- Introducir **autoridad de completación determinista** por canal de registro del tool (`continuation` vs `hook`), sin heurísticas de payload ni upgrade de placeholders.
- Tools **client-side** (`registerToolUse`: Bash, Read, Grep, Glob, Edit, …) SHALL completarse **únicamente** desde bloques `tool_result` de la continuation HTTP.
- `AuditHookEventHandler` SHALL **no** invocar `completeToolUse` para tools con autoridad `continuation`.
- Tool **Agent** (pending server-side) SHALL usar autoridad `continuation` (su resultado canónico es el `tool_result` del padre).
- Tools **web_search** / **web_fetch** mantienen autoridad `hook` (no reciben `tool_result` vía continuation estándar).
- Actualizar requisitos de proyección, hooks y persistencia; tests golden con fixture de sesión `8c440211`.
- Actualizar `docs/session-audit-model.md` con tabla de precedencia hook vs continuation.

## Capabilities

### New Capabilities

_(ninguna — el cambio extiende el modelo de correlación existente)_

### Modified Capabilities

- `gateway-audit-projection`: autoridad de completación; PostToolUse acotado; continuation como vía canónica client-side; ajuste del requisito de registro client-side.
- `hooks-lifecycle-correlation`: semántica de `PostToolUse` / `PostToolUseFailure` limitada a tools con autoridad `hook`.
- `session-persistence`: `tool_result` client-side proviene exclusivamente de continuation (no “fallback”).

## No objetivos

- Heurísticas de placeholder (`null`, `PostToolUseFailure` genérico) ni sobrescritura de resultados terminales.
- Retrocompatibilidad con sesiones ya auditadas con `result.json` vacío.
- Enriquecer el relay del harness para incluir stdout en `lastAssistantMessage` (solución F).
- Archivos hermanos `result.stdout.txt` para salidas grandes (complemento futuro).
- Cambios en tools MCP o harnesses distintos de Claude Code.

## Impact

| Capa / directorio | Componentes |
|-------------------|-------------|
| **1-domain** | `IToolUse`, tipos de autoridad de completación, posible helper en `gateway/` |
| **2-services** | `WorkflowRepositoryService` (`registerToolUse`, `registerPendingToolUse`, lookup de autoridad) |
| **3-operations** | `AuditHookEventHandler`, `AuditWorkflowHandler` (`completeClientToolResultsFromContinuation`) |
| **docs/** | `session-audit-model.md` |
| **tests/** | `audit-hook-event.handler.test.ts`, `audit-workflow.handler.test.ts`, `workflow-repository.test.ts`, fixture golden `8c440211` |

Verificación: `npm run test:quick`; re-análisis de sesión `8c440211` tras apply.

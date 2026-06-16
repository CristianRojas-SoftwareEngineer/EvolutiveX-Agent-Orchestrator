## Context

El proxy audita sesiones Claude Code bajo layout `causal-workflows-v1`. Los tools se registran por dos caminos estructurales ya existentes en `AuditSseResponseHandler`:

| Camino | API repositorio | Tools típicos | Coalescing server-side |
|--------|-----------------|---------------|------------------------|
| Client-side | `registerToolUse` | Bash, Read, Grep, Glob, Edit, Write, … | No |
| Server-side pending | `registerPendingToolUse` | Agent, WebSearch, WebFetch | Sí (agent / internal HTTP) |

Hoy `AuditHookEventHandler.handlePostToolUse` completa **cualquier** tool encontrado por `toolUseId`, incluso client-side, con `result: null` o `{ error: 'PostToolUseFailure' }` cuando `lastAssistantMessage` está vacío. Eso crea un estado terminal falso antes de la continuation HTTP, que es donde el protocolo Anthropic Messages API transporta el `tool_result` canónico que el modelo consume.

El fix residual de junio añadió `completeClientToolResultsFromContinuation` como “fallback si PostToolUse no llega”. El escenario real con hooks activos no estaba modelado.

## Goals / Non-Goals

**Goals:**

- Una sola fuente de verdad **determinista** por tool: `continuation` (HTTP body) o `hook` (PostToolUse), fijada en el momento del registro.
- `tools/KK-slug/result.json` SHALL reflejar el mismo contenido que el bloque `tool_result` de la continuation para tools client-side.
- Un único evento `tool_result` por `tool_call` (idempotencia intacta).
- Tests que reproduzcan la carrera hook→continuation de la sesión `8c440211`.

**Non-Goals:**

- Detectar placeholders ni permitir sobrescritura de terminales.
- Confiar en `lastAssistantMessage` del harness para tools client-side.
- Migrar o reparar artefactos de sesiones históricas.

## Decisions

### D1 — Autoridad de completación en `IToolUse` (elegida)

Añadir `completionAuthority: 'continuation' | 'hook'` a `IToolUse`, asignado al registrar:

| Registro | `completionAuthority` | Razón |
|----------|----------------------|-------|
| `registerToolUse` | `continuation` | El harness resuelve localmente; el proxy recibe el resultado en la siguiente request HTTP |
| `registerPendingToolUse` + nombre `Agent` | `continuation` | El resultado del subagente llega como `tool_result` en la continuation del padre (coalescing) |
| `registerPendingToolUse` + `web_search` / `web_fetch` | `hook` | La implementación es HTTP interna al proxy; no hay `tool_result` de continuation estándar |

`AuditHookEventHandler` SHALL llamar `completeToolUse` **solo** si `completionAuthority === 'hook'`.

`handleContinuation` → `completeClientToolResultsFromContinuation` SHALL seguir siendo la vía para `completionAuthority === 'continuation'`.

**Alternativa rechazada — heurística placeholder (A+C):** inspeccionar `result === null` o `PostToolUseFailure` para permitir sobrescritura. Frágil, no determinista, contradice idempotencia documentada.

**Alternativa rechazada — defer por `lastAssistantMessage` vacío (C sola):** sigue siendo heurística de payload, no de rol arquitectónico del tool.

**Alternativa rechazada — PostToolUse nunca completa (hook global off):** rompe WebSearch/WebFetch que dependen del hook al no tener continuation con `tool_result`.

### D2 — Sin segundo evento de reconciliación

La continuation es la **primera** completación para tools `continuation`. El bus emite un solo `tool_result`; `SessionPersistence` escribe `result.json` una vez. No se introduce `tool_result_reconciled`.

### D3 — Idempotencia de `completeToolUse` sin cambios

El guard `status === 'completed' | 'error'` se mantiene. Al eliminar la completación prematura desde hooks client-side, la continuation será la primera (y única) llamada exitosa.

### D4 — API de consulta en repositorio

Exponer `getToolCompletionAuthority(workflowId, toolUseId): 'continuation' | 'hook' | undefined` (o leer desde `IToolUse`) para que `AuditHookEventHandler` no duplique lógica de nombres.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Tool `continuation` queda `running` si la continuation nunca llega | Estado honesto; `lostPending*` / cierre wire documenta tools incompletos (comportamiento existente) |
| WebSearch/WebFetch con hook vacío sigue pudiendo producir placeholder | Fuera del alcance client-side; autoridad `hook` asume harness útil o mejora futura en handler interno |
| Tests existentes asumen PostToolUse completa Bash | Actualizar tests; añadir escenario carrera hook ignorado + continuation |

## Migration Plan

1. Implementar autoridad en registro + guard en hook handler.
2. Actualizar tests unitarios e integración.
3. Sincronizar specs y `docs/session-audit-model.md`.
4. Verificar con fixture golden derivado de `8c440211` (3 Bash, 1 error).
5. Rollback: revertir commit; sin migración de datos en `sessions/`.

## Open Questions

_(ninguna bloqueante — decisión de autoridad por canal de registro cerrada)_

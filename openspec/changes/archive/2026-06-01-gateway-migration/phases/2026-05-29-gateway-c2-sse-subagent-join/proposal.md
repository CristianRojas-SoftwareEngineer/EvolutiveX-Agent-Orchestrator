> **Orquestador:** `gateway-migration` | **Fase:** c2 (Correlación wire)

## Why

C1 (`gateway-c1-wire-agent-headers`) introdujo correlación determinista por cabeceras (plano A, §22) pero dejó una limitación deliberada: con N `PendingAgentToolUse` paralelos, el join `tool_use_id`↔subagente queda `null` porque la rama de cabeceras en `handleSubagent` solo resuelve `triggeringToolUseId` cuando hay exactamente un pending. Además, el join heurístico ad-hoc (`resolvePendingByPrompt`) convive como método privado inline en el handler, separado de la rama de cabeceras y frágil ante el caso multi-pending. C2 cierra esta laguna implementando la tabla de política de join de [§23](../../../docs/proposals/gateway-design.md#23-plano-b--join-tooluse%E2%86%94subagente) como función pura de dominio testeable.

## What Changes

- **Nueva función pura de dominio** `joinToolUseToSubagent(pendings, agentCtx, subagentPrompt)` en capa 1 (`src/1-domain/services/`) que implementa la tabla de política de join de §23: unique → prompt → FIFO → diferido.
- **Nuevo valor `'fifo-pending'`** en el tipo `CorrelationMethod` (capa 1), para el caso N-pendings-sin-match-de-prompt (hoy resuelve como `'none'`/unresolved).
- **Retiro de `resolvePendingByPrompt`**: la lógica inline del handler se absorbe en la función pura y el método privado se elimina.
- **Refactorización quirúrgica de `handleSubagent`**: ambas ramas (con y sin cabeceras) delegan en `joinToolUseToSubagent`, unificando la lógica de resolución.
- **Actualización de `docs/session-audit-model.md`**: tabla `CorrelationMethod` con `'fifo-pending'` y descripción de la política de join plano B.

## Capabilities

### New Capabilities

*(ninguna — C2 completa la correlación wire iniciada por C1; no introduce una capability nueva)*

### Modified Capabilities

- `wire-agent-correlation`: Extender con join determinista `tool_use_id`↔subagente (tabla §23); añadir `'fifo-pending'` a `CorrelationMethod`; actualizar el requisito de precedencia por cabeceras para cubrir N pendings; absorber la lógica de `resolvePendingByPrompt`.

## No Objetivos

- Endpoint `POST /hooks` (`confirmSubagentFromHook`) — corresponde a C3.
- Cierre E2E del ciclo de vida de workflows — corresponde a C4.
- Migración del registro de pendings de `ISessionStore` a `IWorkflowRepository` — corresponde a G2.
- Eliminación de la rama fallback completa (sin-cabeceras) — corresponde a G2.
- Cambios en el layout `sessions/` — corresponde al bloque P.
- Rutas HTTP nuevas o modificadas.

## Impact

- **Capa 1 — dominio** (`src/1-domain/`): nuevo archivo `services/join-tool-use-to-subagent.service.ts`; modificación de `types/audit.types.ts` (añadir `'fifo-pending'` a `CorrelationMethod`, actualizar JSDoc).
- **Capa 3 — operations** (`src/3-operations/`): refactorización quirúrgica de `audit-interaction.handler.ts` — `handleSubagent` (`:332-477`) y eliminación de `resolvePendingByPrompt` (`:299-324`).
- **Tests**: nuevo `tests/1-domain/join-tool-use-to-subagent.test.ts`; ampliación de `tests/3-operations/audit-interaction.handler.test.ts`; ampliación/creación de test E2E en `tests/5-user-interfaces/`.
- **Docs**: `docs/session-audit-model.md`.
- **Sin cambios en**: `audit-sse-response.handler.ts`, `ISessionStore`, `IWorkflowRepository`, rutas HTTP, layout `sessions/`.

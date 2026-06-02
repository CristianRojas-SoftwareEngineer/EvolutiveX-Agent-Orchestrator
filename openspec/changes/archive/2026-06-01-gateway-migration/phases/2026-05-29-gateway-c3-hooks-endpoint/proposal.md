> **Orquestador:** `gateway-migration` | **Fase:** c3 (Borde hooks)

## Why

La correlación de subagentes depende hoy exclusivamente de señales **wire** (SSE), que son heurísticas y transitorias. Claude Code emite **hooks autoritativos** ([§24](../../../docs/proposals/gateway-design.md#24-plano-c--hooks-claude-code), [§25](../../../docs/proposals/gateway-design.md#25-integración-wire--hooks-correlación-y-autoridad)) que el proxy aún no recibe. Sin el borde hooks:

- La confirmación del join subagente vía `SubagentStart` no ocurre; el registro wire de C1/C2 queda sin confirmación autoritativa.
- El cierre autoritativo (`Stop` / `SubagentStop` / `StopFailure`) y `WorkflowResult.finalText` no están disponibles (diferidos a C4, que depende de C3).

C3 abre el segundo canal de entrada: el endpoint `POST /hooks` (capa 5) y el `AuditHookEventHandler` (capa 3) que mapea los 10 eventos §24 al correlador en memoria, confirmando el join vía `SubagentStart → confirmSubagentFromHook`.

## What Changes

- **Endpoint `POST /hooks`** (capa 5): registrado antes del proxy catch-all; responde 2xx antes del procesamiento completo; excluido de side-interactions y del reenvío a upstream.
- **Tipos de hook** (capa 1): `ClaudeHookEvent` con `eventName`, `sessionId`, `toolUseId?`, `agentId?`, `stopHookActive?`, `backgroundTasks?`, `lastAssistantMessage?`; unión de nombres de evento para los 10 eventos §24.
- **`AuditHookEventHandler`** (capa 3): establece el borde de despacho para los 10 eventos §24. **Solo `SubagentStart`** ejecuta una mutación real (`confirmSubagentFromHook`); los demás eventos se reconocen y se registran como stubs forward-compatible — sus mutaciones de estado (`ToolUse.status`, `readyToClose`) se difieren a G1/G2/C4.
- **`confirmSubagentFromHook(agentId, toolUseId?)`** en `IWorkflowRepository` (capa 1) + implementación en `WorkflowRepositoryService` (capa 2): confirma la entrada wire del subagente por `agentId`; registra `triggeringToolUseId` si `toolUseId` está presente; maneja la carrera hook-antes-wire.

## Capabilities

### New Capabilities

- `hooks-lifecycle-correlation`: endpoint `POST /hooks`, parsing puro de eventos, despacho de los 10 eventos §24, `confirmSubagentFromHook` (única mutación real de C3), stubs de despacho forward-compatible para los demás eventos.

### Modified Capabilities

*(ninguna — C3 introduce el borde hooks como concern separado; no toca `wire-agent-correlation`)*

## No Objetivos

- `buildWorkflowResult` + `AuditWorkflowClosureHandler` + proyección a disco → **C4**.
- Mutaciones de estado de `ToolUse` (`running`/`completed`/`error`) y lifecycle `readyToClose` → requieren el modelo `Workflow/Step/ToolUse` de **G1–G2/C4**; diferidas. C3 corre antes del refactor G.
- Timer de timeout `ToolUse` §24.1 → **diferido** (no asignado en el registro; ligado a cierre/proyección §32.9).
- Migración de pendings de `ISessionStore` a `IWorkflowRepository` → **G2**.
- Layout de disco nuevo (`causal-workflows-v1`) → **fases P**.
- Modificación de la ruta `/v1/messages` o del proxy catch-all existente.

## Impact

- **Capa 1 — dominio** (`src/1-domain/`): nuevo `types/hook.types.ts` (tipos `ClaudeHookEvent` + nombres evento); nueva firma `confirmSubagentFromHook` en `IWorkflowRepository`.
- **Capa 2 — servicios** (`src/2-services/`): implementar `confirmSubagentFromHook` en `WorkflowRepositoryService`, extendiendo `WireSubagentEntry` con `confirmed: boolean` y `triggeringToolUseId?: string`.
- **Capa 3 — operations** (`src/3-operations/`): nuevo `audit-hook-event.handler.ts` (`AuditHookEventHandler`) con despacho de los 10 eventos §24.
- **Capa 4 — api/composition** (`src/4-api/`): instanciar `AuditHookEventHandler` en `composition-root.ts`; exportar en `ProxyDependencies`.
- **Capa 5 — delivery** (`src/5-user-interfaces/http/`): nuevo `HooksController` en `hooks.controller.ts` + ruta `POST /hooks` registrada en `src/app.ts` antes de `register(proxyRoutes)`.
- **Tests**: tests unitarios capa 1 (`parseHookEvent`), capa 3 (`AuditHookEventHandler`); test E2E Fastify `POST /hooks` (evento → mutación correlador → 2xx).
- **Docs**: `README.md`, `docs/proposals/gateway-design.md`.
- **No toca**: `wire-agent-correlation`, ruta `/v1/messages`, layout `sessions/`, `audit-sse-response.handler.ts`, `audit-interaction.handler.ts`.

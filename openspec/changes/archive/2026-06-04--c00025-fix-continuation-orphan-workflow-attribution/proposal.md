## Why

El `AuditSseResponseHandler` resuelve el workflow destino de los chunks SSE y del `registerPendingToolUse` mediante `workflowRepo.getWorkflowBySessionId(context.auditSessionId)`. Esta búsqueda **siempre devuelve el mismo workflow** (el main con `id == sessionId` o el primer `kind: 'main'` que coincida por `sessionId`), independientemente del workflow específico que abrió el `AuditWorkflowHandler` para esa request.

El síntoma observable es una cascada de **50 warnings** `[audit] No se encontró workflow padre para continuation — creando workflow standalone` en `server/logs.jsonl` durante la sesión `fe6e7d92-6ed3-4cb9-9144-79ce74178c48`, con un layout `causal-workflows-v1` resultante que tiene 65 directorios `workflows/NN/` pero **49 de ellos con `stepCount: 0`, `continuationOrphan: true` y duración ~6 ms** (workflows que se crean, no encuentran padre, se cierran inmediatamente). El contenido real de la auditoría (5986 stream_chunks, 201 step_response, 201 tool_call) se atribuye incorrectamente al workflow con `id == sessionId` en lugar de a los wire-N que se acaban de crear.

Diagnóstico completo en `docs/issues/CONTINUATION-ORPHAN-DRIFT.md`.

## What Changes

- Añadir `workflowId: string` al tipo `AuditWorkflowContext` (`src/1-domain/types/audit.types.ts`) para que el contexto del SSE handler propague el workflowId específico que abrió el `AuditWorkflowHandler`, en lugar de resolverlo por sessionId.
- Modificar `AuditSseResponseHandler.execute()` (`src/3-operations/audit-sse-response.handler.ts:45`) para usar `getWorkflow(context.workflowId)` cuando `context.workflowId` esté disponible, cayendo al lookup por `sessionId` solo como fallback (defensive).
- Modificar el punto donde se construye `AuditWorkflowContext` para propagar el `workflowId` del workflow recién abierto por `AuditWorkflowHandler` (en el composition root o en el orquestador que invoca ambos handlers).
- Corregir `forceClose` (`src/2-services/workflow-repository.service.ts:300`) para que `closedByEvent` refleje el evento que originó el cierre (`orphaned` para `forceClose` por orphan) o se omita cuando no aplica, en lugar del literal `"StopFailure"` incorrecto.
- Añadir limpieza del índice `toolUseIdToWorkflowId` en `stream.on('error')` y en el path de `audit-upstream-error.handler` para evitar acumulaciones si el stream se aborta.
- Corregir `audit-hook-event.handler.ts:53` (drift #1 latente): `SubagentStop` debe usar `getWorkflowByAgentId(agentId)?.workflowId` y luego `getWorkflow(workflowId)`, no `getWorkflow(agentId)` directamente.
- Tests: nuevo escenario que reproduce el bug actual (workflow main con id=sessionId recibe chunks de otros workflows) y verifica que con la corrección los wire-N reciben su atribución correcta. Actualizar el test `'continuation sin tool_use_id registrado crea workflow orphan'` para que represente el caso genuino (response SSE no llegó por error upstream), no el caso patológico actual.

**BREAKING (cambio de tipo):** `AuditWorkflowContext` añade un campo obligatorio `workflowId`. Todos los constructores de este tipo en `src/` deben actualizarse. No afecta al wire protocol ni al layout en disco.

## Capabilities

### New Capabilities

_(ninguna — el cambio encaja en specs existentes)_

### Modified Capabilities

- `gateway-audit-projection`: añadir requisito normativo de que los eventos publicados por `AuditSseResponseHandler` (stream_chunk, step_response, tool_call, registerPendingToolUse) deben atribuirse al workflowId específico del `AuditWorkflowContext`, no al workflow main de la sesión. Esto garantiza que la proyección a disco refleje la atribución causal correcta.
- `gateway-workflow-lifecycle`: añadir requisito de que `forceClose` registre el `closedByEvent` correcto o lo omita cuando no hay evento hook que lo cause, y que limpie el índice `toolUseIdToWorkflowId` para `toolUseId`s reservados por el workflow cerrado.
- `wire-agent-correlation`: añadir requisito de que `AuditHookEventHandler` resuelva workflows de subagente a través de `getWorkflowByAgentId` → `getWorkflow`, en lugar de `getWorkflow(agentId)` directo.

## Impact

| Área | Archivos / sistemas |
|------|---------------------|
| PKA 1-domain | `src/1-domain/types/audit.types.ts` (nuevo campo en `AuditWorkflowContext`) |
| PKA 2-services | `src/2-services/workflow-repository.service.ts` (`forceClose` `closedByEvent`; posible método helper de limpieza del índice) |
| PKA 3-operations | `src/3-operations/audit-sse-response.handler.ts` (lookup por `workflowId`); `src/3-operations/audit-workflow.handler.ts` (propagación); `src/3-operations/audit-hook-event.handler.ts` (drift #1); `src/3-operations/audit-upstream-error.handler.ts` (limpieza del índice en error path) |
| Composición | Punto donde se invoca `AuditSseResponseHandler.execute()` (probablemente en `4-api` o en el orquestador de la response en `3-operations`) |
| Tests | `tests/3-operations/audit-sse-response.handler.test.ts` (nuevo escenario de atribución); `tests/3-operations/audit-workflow.handler.test.ts` (actualizar test del orphan genuino); `tests/2-services/workflow-repository.test.ts` (test de `forceClose` con `closedByEvent` correcto) |
| OpenSpec | Deltas en este change; tras sync, `openspec/specs/` refleja el contrato |

## No objetivos

- Cambiar la semántica de `findWorkflowByToolUseId` (la búsqueda exacta por `toolUseId` se mantiene; solo se garantiza que el índice `toolUseIdToWorkflowId` se rellene contra el workflow correcto).
- Introducir heurísticas de fallback como "último workflow running" o "FIFO". El único fallback aceptado es: cuando `context.workflowId` no está disponible (código legacy), usar `getWorkflowBySessionId`. El contrato de correlación exacta `toolUseId → workflowId` permanece.
- Migrar workflows ya huérfanos en sesiones existentes: el cambio aplica solo al flujo futuro. Las sesiones previas conservan sus artifacts (con la nota de drift si se requiere limpieza manual, fuera de alcance).
- Reordenar la asignación de layoutIndex (la convención de `workflows/00` siendo subagente vs main es un drift separado, identificado pero fuera de alcance de este change).
- Resolver el drift #2 de `stop-hook-ux.ts` con `CLAUDE_PROJECT_DIR` (no verificado en logs activos, queda como issue latente).
- Modificar el spec archivado de hooks-lifecycle-correlation (solo añadir requisitos al spec vivo).

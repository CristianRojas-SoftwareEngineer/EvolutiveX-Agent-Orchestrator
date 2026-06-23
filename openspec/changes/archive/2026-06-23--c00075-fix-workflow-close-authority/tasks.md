## 1. Modelo de dominio: tipo y campo closeAuthority

- [x] 1.1 Añadir el tipo `WorkflowCloseAuthority = 'stop-hook' | 'sse'` en `src/1-domain/types/gateway/workflow.types.ts`
- [x] 1.2 Añadir el campo obligatorio `closeAuthority: WorkflowCloseAuthority` a la interface `IWorkflow` en `src/1-domain/interfaces/gateway/IWorkflow.ts`
- [x] 1.3 Añadir el campo `closeAuthority` al modelo `Workflow` (`src/1-domain/models/gateway/Workflow.ts`) y asignarlo en el constructor (`this.closeAuthority = data.closeAuthority`)

## 2. Asignación determinista en el repositorio

- [x] 2.1 En `workflow-repository.service.ts` `openWorkflow`: construir el `Workflow` con `closeAuthority: options.forceNew ? 'sse' : 'stop-hook'`
- [x] 2.2 En `workflow-repository.service.ts` `openSubagentWorkflow`: construir el `Workflow` con `closeAuthority: 'stop-hook'`
- [x] 2.3 En `workflow-repository.service.ts` `close()`: el resultado defensivo sintético (rama `!workflow`) construye el `Workflow` con `closeAuthority: 'stop-hook'`

## 3. Discriminador de cierre por autoridad

- [x] 3.1 En `gateway-wire-step.util.ts` `closeWireWorkflowOnTerminalStop`: reemplazar las guardas `workflow.id === workflow.sessionId` y `workflow.kind === 'subagent'` por una sola `if (workflow.closeAuthority !== 'sse') return;`, conservando intactas las guardas `workflow.result != null` y `step.stepKind === 'side-request'`
- [x] 3.2 Actualizar el comentario de cabecera de `closeWireWorkflowOnTerminalStop` para describir el criterio por `closeAuthority`
- [x] 3.3 Reescribir el comentario `I3` en `handleContinuation` (`audit-workflow.handler.ts`) para reflejar las dos rutas de cierre disjuntas del huérfano (SSE-terminal con steps reales / reaper en `awaitingContinuation`) y la invariante de no cerrar prematuramente con 0 steps

## 4. Fixtures de test

- [x] 4.1 Actualizar los literales `IWorkflow` en `tests/**` para incluir `closeAuthority` (`'stop-hook'` por defecto; `'sse'` solo en los que prueban el huérfano), de modo que compilen con el campo obligatorio

## 5. Tests de regresión

- [x] 5.1 Test: un workflow `turn-N` (`id === ${sessionId}-turn-2`, `closeAuthority: 'stop-hook'`) NO se fuerza a cerrar ante `stopReason: end_turn` en `closeWireWorkflowOnTerminalStop` (permanece `result === null` y `getWorkflowBySessionId` lo devuelve)
- [x] 5.2 Test: un workflow wire huérfano (`closeAuthority: 'sse'`) SÍ se fuerza a cerrar vía `forceClose` ante `stopReason: end_turn`, con `stepCount >= 1`
- [x] 5.3 Test: el primer turno (`id === sessionId`, `closeAuthority: 'stop-hook'`) y un sub-workflow (`kind: subagent`, `closeAuthority: 'stop-hook'`) conservan el comportamiento de no cerrar en SSE terminal

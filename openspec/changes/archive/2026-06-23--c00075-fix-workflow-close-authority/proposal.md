## Why

El hook `Stop` no cierra el workflow ni emite voz/toast en los turnos posteriores al primero (`-turn-N`, N≥2). La causa es estructural: el discriminador de autoridad de cierre en `closeWireWorkflowOnTerminalStop` (`gateway-wire-step.util.ts:231`) usa la heurística `workflow.id === workflow.sessionId`, que solo es verdadera en el primer turno. Para los turnos `-turn-N` esa guarda no se cumple, así que el correlador los fuerza a cerrar en SSE (`forceClose`) **antes** de que llegue el hook `Stop`; cuando el hook llega, `getWorkflowBySessionId` ya no encuentra workflow abierto y el evento se ignora (sin cierre por hook, sin voz, sin toast). La heurística confunde "primer turno" con "turno E2E", y "no es el primer turno" con "huérfano".

## What Changes

- Se introduce un campo de primera clase `closeAuthority: 'stop-hook' | 'sse'` en el modelo `Workflow`, que declara explícitamente qué autoridad cierra cada workflow, reemplazando la heurística frágil basada en el esquema de `id`.
- `closeAuthority` se fija de forma determinista en la creación: workflows de turno E2E (primero `id === sessionId` y posteriores `-turn-N`) y sub-workflows (`kind: subagent`) → `'stop-hook'`; workflows wire huérfanos de continuation (`forceNew`) → `'sse'`.
- `closeWireWorkflowOnTerminalStop` sustituye las guardas `id === sessionId` y `kind === 'subagent'` por una única guarda `closeAuthority !== 'sse'`. Con esto **todos** los turnos E2E (no solo el primero) defieren su cierre al hook `Stop`/`SubagentStop`/`StopFailure`.
- Se aclara el modelo de cierre del workflow huérfano de continuation, haciéndolo explícito y coherente: cierra en su stop terminal SSE con sus steps reales ya cerrados (nunca un cierre prematuro de 0 steps), o por el reaper cuando queda en `awaitingContinuation`. El comentario `I3` en `handleContinuation`, hoy inexacto, se corrige.

## Capabilities

### Modified Capabilities

- `gateway-workflow-lifecycle`: el requirement "Cierre E2E del turno solo por hook" se generaliza de `id === sessionId` a la autoridad explícita `closeAuthority === 'stop-hook'`, cubriendo los turnos `-turn-N`; el requirement de lifecycle del repositorio incorpora el campo `closeAuthority` en el modelo `Workflow` y su asignación determinista en `openWorkflow`/`openSubagentWorkflow`; el requirement "Rama huérfana de continuation — workflow abierto hasta reaper o shutdown" se completa para reflejar la rama de cierre SSE-terminal legítima (con steps reales) además de la del reaper, y la invariante de no cerrar prematuramente con 0 steps.
- `gateway-audit-projection`: el requirement "Cierre de workflows wire en stop terminal SSE" reemplaza el discriminador `workflowId === sessionId` / `kind: subagent` por `closeAuthority` (`'stop-hook'` defiere al hook; `'sse'` cierra vía `forceClose`), eliminando la dependencia del esquema de `id` y dejando el criterio coherente con `gateway-workflow-lifecycle`.

## Impact

- `src/1-domain/types/gateway/workflow.types.ts`: nuevo tipo `WorkflowCloseAuthority`.
- `src/1-domain/interfaces/gateway/IWorkflow.ts` y `src/1-domain/models/gateway/Workflow.ts`: campo `closeAuthority`.
- `src/2-services/workflow-repository.service.ts`: asignación de `closeAuthority` en `openWorkflow` (`forceNew ? 'sse' : 'stop-hook'`), `openSubagentWorkflow` (`'stop-hook'`) y el fallback defensivo de `close()`.
- `src/3-operations/gateway-wire-step.util.ts`: discriminador de `closeWireWorkflowOnTerminalStop` por `closeAuthority`.
- `src/3-operations/audit-workflow.handler.ts`: corrección del comentario `I3` en `handleContinuation`.
- Tests de regresión del correlador: un turno `-turn-N` (`closeAuthority: 'stop-hook'`) no se fuerza a cerrar en stop terminal SSE; un workflow wire huérfano (`closeAuthority: 'sse'`) sí.
- Sin cambios de comportamiento en `scripting/install/features/voice.ts` ni en la capa TTS.

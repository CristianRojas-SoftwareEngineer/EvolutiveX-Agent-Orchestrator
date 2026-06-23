## Context

El correlador del gateway abre un workflow por turno E2E (primer turno con `id === sessionId`, posteriores con `id === ${sessionId}-turn-N`) y, en el caso degradado de una continuation sin padre, un workflow wire huérfano (`openWireWorkflow`, `forceNew: true`, `id === ${sessionId}-wire-N`). Existen dos autoridades de cierre: el hook (`Stop`/`SubagentStop`/`StopFailure`), que cierra los turnos E2E, y el cierre SSE-terminal (`closeWireWorkflowOnTerminalStop` → `forceClose`), pensado para los huérfanos.

El discriminador entre ambas rutas en `gateway-wire-step.util.ts:231` es la heurística `workflow.id === workflow.sessionId`, verdadera **solo** en el primer turno. Para los turnos `-turn-N` la guarda no se cumple y caen en la rama de `forceClose`: se cierran en SSE antes de que llegue el hook `Stop`, de modo que `getWorkflowBySessionId` (que filtra `result == null`) ya no los encuentra y el evento `Stop` se ignora — sin cierre por hook, sin voz, sin toast. La heurística confunde "primer turno" con "turno E2E".

Investigación previa descartó que tocar el cierre del huérfano reintroduzca el antiguo bug de métricas: ese bug era un `forceClose` **prematuro con 0 steps** al crear el huérfano (ya eliminado), que quemaba la guarda de idempotencia de `finalizeWorkflowMetrics` (`session-metrics.service.ts:199,232`). El cierre SSE-terminal ocurre tras `closeStep` (`gateway-wire-step.util.ts:103-106`), con `closedSteps.length >= 1`, y el finalize corre con steps reales (`audit-sse-response.handler.ts:286-290`).

## Goals / Non-Goals

**Goals:**
- Que **todos** los turnos E2E (primero y `-turn-N`) defieran su cierre al hook, no solo el primero, restaurando voz/toast/cierre por hook en turnos ≥2.
- Sustituir la heurística frágil basada en el esquema de `id` por una autoridad de cierre explícita y declarada en la creación.
- Dejar coherentes y explícitos los specs de `gateway-workflow-lifecycle` y `gateway-audit-projection` respecto a las rutas de cierre del huérfano.

**Non-Goals:**
- No se cambia el comportamiento del primer turno ni de los subagentes (siguen cerrando por hook).
- No se cambia el comportamiento observable del huérfano (sigue cerrando en SSE-terminal o por reaper); solo se hace explícito vía el campo.
- No se toca la capa TTS ni `scripting/install/features/voice.ts`.

## Decisions

**D1 — Campo explícito `closeAuthority` en el modelo de dominio.** Se añade el tipo `WorkflowCloseAuthority = 'stop-hook' | 'sse'` en `src/1-domain/types/gateway/workflow.types.ts` y el campo `closeAuthority: WorkflowCloseAuthority` en `IWorkflow` y en el modelo `Workflow` (asignado en el constructor). *Alternativa descartada:* corregir la heurística in situ (p. ej. `kind === 'main' && !continuationOrphan`) — mantiene una condición derivada implícita y sigue siendo frágil ante futuros esquemas de `id`; contradice resolver el origen.

**Campo obligatorio (no opcional).** `closeAuthority` es requerido en `IWorkflow` para forzar asignación explícita en cada punto de construcción y obtener garantía en tiempo de compilación. *Alternativa descartada:* opcional con default implícito `'stop-hook'` — minimiza churn en fixtures pero reintroduce un default implícito, justo el tipo de comportamiento tácito que este cambio elimina.

**D2 — Asignación determinista en la creación (`workflow-repository.service.ts`).** `openWorkflow` asigna `closeAuthority: options.forceNew ? 'sse' : 'stop-hook'`; `openSubagentWorkflow` asigna `'stop-hook'`; el resultado defensivo sintético de `close()` (cuando el workflow no existe) usa `'stop-hook'`. El único caller de `forceNew: true` es `openWireWorkflow` (continuation huérfana), de modo que `'sse'` queda restringido exactamente a los huérfanos.

**D3 — Discriminador por autoridad en `closeWireWorkflowOnTerminalStop`.** Las dos guardas `workflow.id === workflow.sessionId` y `workflow.kind === 'subagent'` se reemplazan por una sola: `if (workflow.closeAuthority !== 'sse') return;`. Se conservan intactas `if (workflow.result != null) return;` (idempotencia) y `if (step.stepKind === 'side-request') return;` (invariante I1). Así, solo los workflows con `closeAuthority === 'sse'` (huérfanos) llegan a `forceClose`.

**Comentario I3.** El comentario en `handleContinuation` (`audit-workflow.handler.ts:665-666`), hoy inexacto, se reescribe para describir las dos rutas de cierre disjuntas del huérfano (SSE-terminal con steps reales / reaper en `awaitingContinuation`) y la invariante de no cerrar prematuramente con 0 steps.

## Risks / Trade-offs

- **Fixtures de test que construyen `IWorkflow` sin el campo** → al ser obligatorio, dejarán de compilar. Mitigación: la etapa `apply` añade `closeAuthority` a cada fixture afectado (`tests/**` con literales `IWorkflow`), eligiendo `'stop-hook'` por defecto salvo en los que prueban explícitamente el huérfano.
- **Doble cierre del huérfano (SSE vs reaper/hook)** → `forceClose` y `close` son idempotentes (`result != null` ⇒ no-op), así que la convivencia de rutas es benigna. Sin mitigación adicional necesaria.
- **`getWorkflowBySessionId` con turno y huérfano abiertos a la vez** → comportamiento preexistente, no alterado por este cambio; el filtro `result == null` y la idempotencia del cierre lo mantienen seguro.

## Migration Plan

No hay retirada de archivos: la heurística `id === sessionId` es una condición inline que se sustituye en el mismo sitio (`gateway-wire-step.util.ts`), no código en módulos separados. Pasos: (1) añadir tipo y campo; (2) asignar en los 3 puntos de construcción; (3) reemplazar el discriminador; (4) reescribir el comentario I3; (5) actualizar fixtures de test; (6) añadir tests de regresión del cierre de `-turn-N` y del huérfano. Rollback: `git revert` del commit del freeze (cambio contenido en un solo commit) restaura la heurística previa.

## Open Questions

Ninguna. Las decisiones D1–D3, la obligatoriedad del campo y la seguridad del cierre del huérfano quedaron resueltas por investigación antes de esta etapa.

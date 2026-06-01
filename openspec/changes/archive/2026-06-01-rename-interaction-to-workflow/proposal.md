## Why

El modelo de dominio del proxy fue migrado de "Interaction" a "Workflow/Step/ToolUse" (fases C–P2), pero
los identificadores en código fuente (clases, interfaces, campos, métodos) conservan el término "Interaction"
de la era pre-migración. Esto crea fricción cognitiva: el sistema ya opera sobre `IWorkflow`/`IStep`/`IToolUse`
y el layout `causal-workflows-v1`, pero los nombres del código aún hablan el lenguaje del modelo retirado.
Es un deuda de nomenclatura, no de implementación.

## What Changes

- Renombrar `AuditInteractionHandler` → `AuditWorkflowHandler` (clase, archivo, export, tests).
- Renombrar `AuditInteractionResult` → `AuditWorkflowResult` (interfaz, campos).
- Renombrar `AuditInteractionContext` → `AuditWorkflowContext` (interfaz, consumidores en 3 handlers + controller).
- Renombrar los tipos `@deprecated` `InteractionType` → `WorkflowRequestKind` e `InteractionOutcome` → `WorkflowOutcome` (o eliminar el alias si `WorkflowOutcome` ya existe con los mismos miembros).
- Renombrar campos de instancia/parámetro: `auditInteractionDir` → `auditWorkflowDir`, `interactionType` (en contextos y augments) → `workflowKind`, `parentInteractionDir` → `parentWorkflowDir`.
- Renombrar métodos: `closeOrphanInteraction()` → `closeOrphanWorkflow()`, `formatAuditInteractionDirName()` → `formatWorkflowDirName()`, `resolveWorkflowIdForInteraction()` → `resolveWorkflowId()`.
- Renombrar `aggregateInteractionMetrics()` → `aggregateSessionMetrics()` en `scripting/router-status.ts`.
- Actualizar augments de Fastify (`fastify.augments.d.ts`), la interfaz `IWorkflowRepository`, y todos los consumidores de las interfaces renombradas en tests.
- Eliminar los tipos `@deprecated` `InteractionType` e `InteractionOutcome` del módulo `audit.types.ts`
  una vez sustituidos en todos sus consumidores (dado que `WorkflowKind`/`WorkflowOutcome` ya existen).

## No objetivos

- No cambiar la lógica de persistencia, el EventBus ni el layout de `sessions/`.
- No renombrar archivos externos a `src/`, `tests/` y `scripting/` (ej. documentación histórica de la migración ya archivada).
- No introducir nuevas abstracciones ni cambiar contratos de la API HTTP.

## Capabilities

### New Capabilities

_Ninguna._ El change es exclusivamente de nomenclatura; no introduce comportamiento nuevo.

### Modified Capabilities

- `gateway-domain-types`: Se renombran `InteractionType` e `InteractionOutcome`; el spec debe reflejar los nombres canónicos finales `WorkflowRequestKind` y `WorkflowOutcome` (o confirmar que los aliases se eliminan).
- `gateway-audit-projection`: La interfaz `AuditInteractionContext` (renombrada a `AuditWorkflowContext`) aparece en los contratos de paso entre controller y handlers de L3; el spec debe reflejar el nombre actualizado.

## Impact

- **Capas afectadas:** 1-domain (tipos), 2-services (repositorio), 3-operations (handlers), 4-api (composition root), 5-user-interfaces (controller, augments).
- **Archivos clave:**
  - `src/1-domain/types/audit.types.ts`
  - `src/1-domain/repositories/IWorkflowRepository.ts`
  - `src/1-domain/services/session-resolver.service.ts`
  - `src/3-operations/audit-interaction.handler.ts` → `audit-workflow.handler.ts`
  - `src/3-operations/gateway-wire-step.util.ts`
  - `src/5-user-interfaces/http/proxy.controller.ts`
  - `src/5-user-interfaces/http/fastify.augments.d.ts`
  - `scripting/router-status.ts`
  - Todos los archivos de tests que importen los símbolos renombrados.
- **Breaking:** Solo internamente (no hay contratos públicos expuestos vía HTTP que cambien).
- **Sin cambios en:** `sessions/` (paths en disco), API HTTP, `events.ndjson`, `workflow-sequence.json`.

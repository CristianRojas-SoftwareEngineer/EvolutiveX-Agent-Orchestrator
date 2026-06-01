## 1. Capa 1 — Tipos de dominio

- [x] 1.1 En `src/1-domain/types/audit.types.ts`: definir `WorkflowRequestKind = 'client-preflight' | 'agentic' | 'side-request'` como tipo canónico (sin `@deprecated`).
- [x] 1.2 En `audit.types.ts`: migrar `SubagentSummary.outcome` de `InteractionOutcome | 'unknown'` a `WorkflowOutcome` aplicando la tabla de mapeo del §D-2 del design.
- [x] 1.3 En `audit.types.ts`: renombrar la interfaz `AuditInteractionContext` → `AuditWorkflowContext` y sus campos (`auditInteractionDir` → `auditWorkflowDir`, `interactionType` → `workflowKind: WorkflowRequestKind`).
- [x] 1.4 En `audit.types.ts`: renombrar `ParentContext.parentInteractionDir` → `parentWorkflowDir`.
- [x] 1.5 En `audit.types.ts`: renombrar `SseReconstructOptions.interactionDir` → `workflowDir`.
- [x] 1.6 En `audit.types.ts`: renombrar `MarkdownRenderContext.interactionType` → `workflowKind: WorkflowRequestKind`.
- [x] 1.7 Verificar `npm run test:quick` en verde antes de continuar.

## 2. Capa 1 — Servicios de dominio y repositorios

- [x] 2.1 En `src/1-domain/services/session-resolver.service.ts`: renombrar `formatAuditInteractionDirName()` → `formatWorkflowDirName()`.
- [x] 2.2 En `src/1-domain/repositories/IWorkflowRepository.ts`: renombrar el campo `interactionType` de `OpenWorkflowOptions` → `workflowKind: WorkflowRequestKind` y actualizar el tipo `WireWorkflowMeta` en consecuencia.

## 3. Capa 2 — Services

- [x] 3.1 En `src/2-services/workflow-repository.service.ts`: actualizar consumidores del campo renombrado `workflowKind` (era `interactionType`) en `openWorkflow()` y `patchWireMeta()`.
- [x] 3.2 En `src/2-services/sse-reconstruct.service.ts`: actualizar referencias a `opts.interactionDir` → `opts.workflowDir` para reflejar el renombre de `SseReconstructOptions`.

## 4. Capa 3 — Operaciones

- [x] 4.1 En `src/3-operations/audit-interaction.handler.ts`: renombrar la clase `AuditInteractionHandler` → `AuditWorkflowHandler` y la interfaz `AuditInteractionResult` → `AuditWorkflowResult`.
- [x] 4.2 En el mismo archivo: renombrar el método `closeOrphanInteraction()` → `closeOrphanWorkflow()` y `closeOrphanInteractions()` → `closeOrphanWorkflows()`.
- [x] 4.3 En el mismo archivo: actualizar todos los usos internos de `AuditInteractionContext` → `AuditWorkflowContext`, `auditInteractionDir` → `auditWorkflowDir`, `interactionType` → `workflowKind`, `InteractionType` → `WorkflowRequestKind`.
- [x] 4.4 En `src/3-operations/audit-sse-response.handler.ts`: actualizar el import y uso de `AuditWorkflowContext`.
- [x] 4.5 En `src/3-operations/audit-standard-response.handler.ts`: actualizar el import y uso de `AuditWorkflowContext`.
- [x] 4.6 En `src/3-operations/gateway-wire-step.util.ts`: renombrar `resolveWorkflowIdForInteraction()` → `resolveWorkflowId()`.
- [x] 4.7 En `src/1-domain/services/markdown-renderer.service.ts`: actualizar la referencia `context.interactionType` → `context.workflowKind` y el tipo `InteractionType` → `WorkflowRequestKind` en la lógica de etiquetado.
- [x] 4.8 Verificar `npm run test:quick` en verde antes de continuar.

## 5. Capas 4 y 5 — Composition root e interfaces HTTP

- [x] 5.1 En `src/4-api/composition-root.ts`: actualizar el import de `AuditWorkflowHandler` (nuevo nombre de clase y archivo provisional).
- [x] 5.2 En `src/5-user-interfaces/http/fastify.augments.d.ts`: renombrar `request.auditInteractionDir` → `request.auditWorkflowDir` y `request.interactionType` → `request.workflowKind: WorkflowRequestKind`.
- [x] 5.3 En `src/5-user-interfaces/http/proxy.controller.ts`: actualizar referencias a `auditInteractionDir` → `auditWorkflowDir`, `interactionType` → `workflowKind`, y `AuditWorkflowContext` en la construcción del contexto.

## 6. Scripting

- [x] 6.1 En `scripting/router-status.ts`: renombrar la función `aggregateInteractionMetrics()` → `aggregateSessionMetrics()` y actualizar su llamador interno (línea ~1003).

## 7. Rename de archivo del handler y limpieza de tipos deprecated

- [x] 7.1 Renombrar el archivo `src/3-operations/audit-interaction.handler.ts` → `src/3-operations/audit-workflow.handler.ts` y actualizar todos los imports en `src/` que lo referencien.
- [x] 7.2 En `src/1-domain/types/audit.types.ts`: eliminar `InteractionType` (reemplazado por `WorkflowRequestKind` en paso 1.1) y `InteractionOutcome` (migrado en paso 1.2).
- [x] 7.3 Verificar que `grep -rn "InteractionType\|InteractionOutcome\|AuditInteractionHandler\|AuditInteractionContext\|auditInteractionDir\|interactionType" src/` devuelve 0 resultados.

## 8. Tests

- [x] 8.1 Renombrar `tests/3-operations/audit-interaction.handler.test.ts` → `tests/3-operations/audit-workflow.handler.test.ts` y actualizar imports internos del test.
- [x] 8.2 Actualizar `tests/3-operations/audit-sse-response.handler.test.ts`: campos del contexto `auditWorkflowDir`, `workflowKind`.
- [x] 8.3 Actualizar `tests/3-operations/audit-standard-response.handler.test.ts`: ídem.
- [x] 8.4 Actualizar `tests/scripting/router-status-metrics.test.ts`: renombrar la llamada a `aggregateSessionMetrics()`.
- [x] 8.5 Actualizar `tests/1-domain/session-resolver.test.ts`: renombrar la llamada a `formatWorkflowDirName()`.
- [x] 8.6 Actualizar cualquier otro test que importe `InteractionType`, `InteractionOutcome` o símbolos renombrados.

## 9. Verificación final y openspec sync

- [x] 9.1 Ejecutar `npm run test` completo (321 tests) y confirmar verde.
- [x] 9.2 Ejecutar `npm run test:quick` (lint + typecheck) sin warnings.
- [x] 9.3 Actualizar `docs/session-audit-model.md` y `README.md` para reflejar los nombres canónicos (`AuditWorkflowHandler`, `AuditWorkflowContext`, `WorkflowRequestKind`).
- [x] 9.4 Marcar el change como sync (openspec-sync) para propagar los deltas de specs a `openspec/specs/`.
- [x] 9.5 Archivar el change (openspec-archive).

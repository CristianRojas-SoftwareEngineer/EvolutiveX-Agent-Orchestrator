## 1. Dominio — aggregateWorkflowUsageByModel e ISessionMetrics

- [x] 1.1 Crear `src/1-domain/types/gateway/session-metrics.types.ts` con `ISessionMetrics`, tipos por modelo (`count`, `input_tokens`, `output_tokens`, `cache_*`, `cache_efficiency`) y `session_totals` alineados a §33.2 (sin `duration_ms` ni `outcome`). Aceptación: typecheck pasa
- [x] 1.2 Crear `src/1-domain/services/gateway/aggregate-workflow-usage-by-model.ts` con la función pura que agrupa por `step.inferenceRequest.model`. Aceptación: tests unitarios de agrupación, acumulación y pureza
- [x] 1.3 Deprecar o eliminar `SessionMetrics` y `SessionModelMetrics` en `audit.types.ts`; reexportar alias `@deprecated` si hay consumidores transitorios. Aceptación: sin imports huérfanos en capa 1
- [x] 1.4 Verificar: `npm run test:quick`

## 2. Servicios — projector, SessionMetricsService y retiro legacy writer

- [x] 2.1 Crear `src/2-services/workflow-result-projector.service.ts` (o función pura en capa 2) que mapee `IWorkflowResult` + steps cerrados + contexto → `InteractionMetadata` para `meta.json` behavior-preserving. Aceptación: tests de equivalencia de campos clave (`outcome`, `stepCount`, `totals`, timestamps)
- [x] 2.2 Crear `src/2-services/session-metrics.service.ts` con escritura atómica (temp + rename), `writeQueue` serializado, merge incremental de `session-metrics.json`, cálculo de `cache_efficiency` y `session_totals`. Aceptación: tests unitarios de merge y atomicidad (mock fs)
- [x] 2.3 Eliminar `updateSessionMetrics()` de `audit-writer.service.ts` y `audit-writer.port.ts`. Aceptación: ningún call site en handlers migrados
- [x] 2.4 Verificar: `npm run test:quick`

## 3. Operations — wire→correlador y AuditWorkflowClosureHandler

- [x] 3.1 En `audit-sse-response.handler.ts`: construir `IStep` desde request + `assembler.result()`; invocar `registerStep`/`closeStep` según `stopReason`; eliminar llamadas a `updateSessionMetrics`. Aceptación: tests con mock de `IWorkflowRepository`
- [x] 3.2 En `audit-standard-response.handler.ts`: mismo cableado wire→correlador y retiro de `updateSessionMetrics`. Aceptación: tests con mock de repo
- [x] 3.3 Crear `audit-workflow-closure.handler.ts`: proyectar `IWorkflowResult` a `meta.json` vía projector; invocar `SessionMetricsService` solo si `kind === 'main'`. Aceptación: tests unitarios con directorios temporales
- [x] 3.4 En `audit-hook-event.handler.ts`: tras `close()` en `Stop`/`SubagentStop`/`StopFailure`, delegar en `AuditWorkflowClosureHandler` con `sessionDir`/`interactionDir` resueltos. Aceptación: tests verifican delegación tras cierre
- [x] 3.5 Reducir escritura de `meta.json` en handlers wire a fallback documentado (`@deprecated-fallback`); ruta principal de cierre vía hooks + closure handler. Aceptación: no doble escritura en flujo nominal con hooks
- [x] 3.6 Migrar o documentar excepción en `audit-upstream-error.handler.ts` y `audit-interaction.handler.ts` (retiro de `updateSessionMetrics`). Aceptación: compilación sin referencias al método eliminado
- [x] 3.7 Verificar: `npm run test:quick`

## 4. Composition root — cableado DI

- [x] 4.1 En `src/4-api/**` (composition root): instanciar e inyectar `SessionMetricsService`, `WorkflowResultProjector` y `AuditWorkflowClosureHandler` en `AuditHookEventHandler`; inyectar `IWorkflowRepository` ya existente en handlers wire si falta. Aceptación: arranque sin errores de DI
- [x] 4.2 Verificar: `npm run test:quick`

## 5. Tests de integración y regresión

- [x] 5.1 Tests unitarios de `aggregateWorkflowUsageByModel`: multi-modelo, mismo modelo, steps sin usage, pureza
- [x] 5.2 Tests de `SessionMetricsService`: invariante G16 (main sí, subagent no), merge incremental, `cache_efficiency`
- [x] 5.3 Tests de regresión: `meta.json` equivalente pre/post para turno con hooks; `session-metrics.json` con desglose por modelo tras cierre main
- [x] 5.4 Subset E2E §37b: casos de cierre vía hooks y campos de `meta.json` (`outcome`, `usage`, `closedByEvent` si expuesto). Aceptación: casos acordados en design pasan con `npm run test`
- [x] 5.5 Verificar gate completo: `npm run test` (persistencia en disco)

## 6. Gate de calidad

- [x] 6.1 `npm run test:quick` verde en commits intermedios
- [x] 6.2 `npm run test` verde antes de cerrar el change (escritura a `sessions/`)
- [x] 6.3 `openspec validate --changes gateway-g4-audit-projection` sin errores

## 7. Documentación

- [x] 7.1 Actualizar `docs/session-audit-model.md`: proyección desde `WorkflowResult`, `AuditWorkflowClosureHandler`, `SessionMetricsService` e invariante G16
- [x] 7.2 Actualizar `docs/proposals/gateway-design.md` §33.2 y §40 solo donde G4 implemente comportamiento (marcar `SessionMetricsService` y proyección como implementados en G4, sin afirmar layout P)
- [x] 7.3 Revisión manual de coherencia con §28b (bus diferido) y §41

## 9. Absorción post-migración — rename-interaction-to-workflow (2026-06-01)

El change complementario `2026-06-01-rename-interaction-to-workflow` completó el item diferido
explícitamente en G1 («Legacy retirado: tipos `Interaction*` reemplazados — diferido a G4/P»):
renombró `AuditInteraction*`→`AuditWorkflow*` y eliminó los tipos `@deprecated`
`InteractionType`/`InteractionOutcome`. Su spec primario es `gateway-audit-projection`, capability
creada en G4. Se absorbe aquí para que el registro de la migración quede autocontenido.

- [x] 9.1 Definir `WorkflowRequestKind` en `audit.types.ts` y migrar `SubagentSummary.outcome` a `WorkflowOutcome`
- [x] 9.2 Renombrar `AuditInteractionContext` → `AuditWorkflowContext` y sus campos
- [x] 9.3 Renombrar `ParentContext.parentInteractionDir` → `parentWorkflowDir`
- [x] 9.4 Renombrar `SseReconstructOptions.interactionDir` → `workflowDir`
- [x] 9.5 Renombrar `MarkdownRenderContext.interactionType` → `workflowKind: WorkflowRequestKind`
- [x] 9.6 Renombrar `formatAuditInteractionDirName()` → `formatWorkflowDirName()` en `session-resolver.service.ts`
- [x] 9.7 Actualizar `IWorkflowRepository.ts`: `interactionType` → `workflowKind: WorkflowRequestKind`
- [x] 9.8 Actualizar handlers L3 (`audit-sse-response`, `audit-standard-response`, `audit-interaction`) y `gateway-wire-step.util.ts`
- [x] 9.9 Actualizar augments Fastify y `proxy.controller.ts` en capa 5
- [x] 9.10 Renombrar `aggregateInteractionMetrics()` → `aggregateSessionMetrics()` en `scripting/router-status.ts`
- [x] 9.11 Renombrar archivo `audit-interaction.handler.ts` → `audit-workflow.handler.ts` y actualizar imports
- [x] 9.12 Eliminar `InteractionType` e `InteractionOutcome` de `audit.types.ts`
- [x] 9.13 Actualizar todos los tests afectados por los renombres
- [x] 9.14 `npm run test` verde (321 tests); `grep -rn "InteractionType\|InteractionOutcome\|AuditInteractionHandler\|AuditInteractionContext\|auditInteractionDir\|interactionType" src/` sin resultados
- [x] 9.15 `openspec-sync` de deltas a `openspec/specs/`; archivar change

## 8. Legacy y gobernanza del orquestador

- [x] 8.1 Confirmar retiro de `updateSessionMetrics`, fuente primaria `InteractionMetadata` en handlers wire, y degradación de cierre wire-only; sin imports huérfanos
- [x] 8.2 Actualizar estado de G4 a `en-curso` en el registro de [`openspec/changes/archive/2026-06-01--c00012-gateway-migration/design.md`](../../design.md) al iniciar implementación
- [x] 8.3 Ejecutar skill `migration-phase-gate` antes de archivar
- [x] 8.4 `openspec-sync` de deltas a `openspec/specs/`; corregir Purpose TBD en `gateway-workflow-lifecycle/spec.md` si aplica
- [x] 8.5 Archivar change (`openspec-archive`); marcar G4 → `archivada` en registro del orquestador

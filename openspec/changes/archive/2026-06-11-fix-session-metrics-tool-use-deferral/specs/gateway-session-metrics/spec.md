## MODIFIED Requirements

### Requirement: Steps contables — stop_reason y cierre en correlador

La actualización per-step SHALL aplicarse a **todo** step de workflows **`kind: 'main'` o `kind: 'subagent'`** cerrado en el correlador con `usage` válido, **independientemente de `stop_reason`** (incluido `tool_use`). SHALL NOT existir un gate por stop terminal en el path per-step: la única condición de contabilidad es `usage` válido presente en el step cerrado.

#### Scenario: Hop tool_use con usage cuenta al cerrar el stream SSE

- **GIVEN** un hop de inferencia agéntico (main o subagent) cuyo stream SSE finaliza con `stop_reason: 'tool_use'` y `usage` válido
- **WHEN** el handler enriquece y cierra el step en el correlador (`closedAt` definido)
- **THEN** la actualización per-step SHALL ejecutarse una vez para ese step
- **AND** `session-metrics.json` SHALL reflejar `billable_hops` y tokens incrementados sin esperar al hook `Stop`

#### Scenario: Step de error sin usage no escribe métricas

- **GIVEN** un step cerrado por error upstream sin objeto `usage`
- **WHEN** se evalúa la actualización per-step
- **THEN** `session-metrics.json` NO SHALL modificarse por ese step

### Requirement: SessionMetricsService — actualización incremental por step (agentic)

El sistema SHALL proveer en `SessionMetricsService` un método de actualización por step (p. ej. `updateFromStep`) que mergee en `session-metrics.json` el consumo de **un** step cerrado con `usage` válido, incrementando `billable_hops` y los contadores de tokens del `modelId` correspondiente, recalculando `cache_efficiency` y `session_totals`. El método SHALL:

- Ejecutarse para workflows con `kind: 'main'` **o** `kind: 'subagent'`.
- Usar la misma cola serializada (`writeQueue`) y escritura atómica que el path de cierre.
- Ser **idempotente** por `step.id`: un mismo step no SHALL incrementar contadores más de una vez aunque se reintente la invocación.
- **NO** incrementar `finalized_runs` (reservado al cierre de la ejecución agéntica).

#### Scenario: Hop tool_use main persiste métricas inmediatamente

- **GIVEN** un workflow `kind: 'main'` con un step cerrado en correlador con `stop_reason: 'tool_use'`, `usage` presente y `step.id` no contabilizado previamente
- **WHEN** el proxy invoca la actualización per-step tras cerrar ese step
- **THEN** `session-metrics.json` SHALL reflejar `billable_hops` y tokens incrementados para ese `modelId`
- **AND** `finalized_runs` del modelo SHALL permanecer sin cambio

#### Scenario: Step terminal subagent persiste métricas en tiempo real

- **GIVEN** un workflow `kind: 'subagent'` con un step cerrado, `usage` presente y `step.id` no contabilizado
- **WHEN** el proxy invoca la actualización per-step tras cerrar ese step
- **THEN** `session-metrics.json` SHALL reflejar `billable_hops` y tokens para el `modelId` del hop del subagente
- **AND** `finalized_runs` SHALL permanecer sin cambio hasta `SubagentStop`

#### Scenario: Reintento idempotente del mismo step

- **GIVEN** un step ya contabilizado en `session-metrics.json` (mismo `step.id`)
- **WHEN** se invoca de nuevo la actualización per-step para ese step
- **THEN** los contadores del modelo NO SHALL incrementarse otra vez

#### Scenario: Step sin usage no escribe métricas

- **GIVEN** un step cerrado sin objeto `usage` o sin tokens facturables según las reglas del dominio
- **WHEN** se intenta la actualización per-step
- **THEN** `session-metrics.json` NO SHALL modificarse por ese step

### Requirement: SessionMetricsService — escritura atómica de session-metrics.json

El sistema SHALL proveer `SessionMetricsService` en `src/2-services/session-metrics.service.ts` (capa 2) que mantenga `sessions/{sessionId}/session-metrics.json` como fuente agregada de la sesión. El servicio SHALL:

- Actualizar contadores de hops y tokens **por step** cuando cualquier step agéntico con `usage` cierra (requisito per-step, sin condición de stop terminal).
- Al cerrar una ejecución agéntica (`main` o `subagent`), invocar `finalizeWorkflowMetrics` que incremente `finalized_runs` en **exactamente 1** para el modelo atribuido del workflow y recalcule totales, **sin volver a sumar** hops/tokens ya persistidos per-step en la misma ejecución. El servicio SHALL registrar el `workflowId` en `finalized_workflow_ids` de forma **incondicional** —incluso cuando no hay `usage` ni modelo atribuido— garantizando idempotencia entre sus tres callers (`AuditHookEventHandler` en `Stop`, `StopFailure` y `SubagentStop`).
- Calcular `cache_efficiency` por modelo según §33.2.
- Escribir el archivo de forma **atómica** (archivo temporal + rename) y persistir idempotencia en sidecar `session-metrics-applied.json`.
- Serializar escrituras concurrentes mediante cola serializada (`writeQueue`).
- Invocarse desde handlers wire (vía `persistBillableStepMetricsIfNeeded`) para steps agénticos contables y desde `AuditHookEventHandler.delegateClosure` para cierres main y subagent.

#### Scenario: Cierre de workflow main actualiza session-metrics.json

- **GIVEN** un workflow `kind: 'main'` cerrado cuyos steps contables ya fueron volcados per-step
- **WHEN** `delegateClosure` completa el cierre del workflow
- **THEN** `session-metrics.json` SHALL tener `finalized_runs` incrementado en 1 para el modelo atribuido del workflow
- **AND** `billable_hops` y tokens por modelo NO SHALL duplicar los hops ya contabilizados per-step
- **AND** `session_totals.finalized_runs` SHALL ser igual a `finalized_workflow_ids.length`

#### Scenario: Cierre de sub-workflow incrementa finalized_runs del subagente

- **GIVEN** un workflow `kind: 'subagent'` cerrado vía `SubagentStop` con al menos un step con `usage`
- **WHEN** `delegateClosure` completa el cierre
- **THEN** `finalized_runs` SHALL incrementarse en 1 para el modelo atribuido del sub-workflow
- **AND** `session_totals.finalized_runs` SHALL reflejar la nueva ejecución en `finalized_workflow_ids`

#### Scenario: Hallazgo 2 — side-request y agentic con modelos distintos

- **GIVEN** un único workflow `kind: 'main'` cerrado
- **AND** el step de menor `index` con `usage` tiene `stepKind: 'side-request'` y `model-a`
- **AND** el primer step con `stepKind: 'agentic'` y `usage` tiene `model-b`
- **WHEN** `finalizeWorkflowMetrics` ejecuta para ese workflow
- **THEN** `models[model-b].finalized_runs` SHALL incrementarse en 1
- **AND** `models[model-a].finalized_runs` SHALL permanecer sin incremento por este cierre
- **AND** ambos modelos SHALL reflejar sus `billable_hops` y tokens per-step
- **AND** `session_totals.finalized_runs` SHALL ser 1

#### Scenario: Dos ejecuciones del mismo modelo acumulan finalized_runs

- **WHEN** el path de cierre se invoca para dos workflows distintos (main o subagent) atribuidos al mismo `modelId`
- **THEN** `finalized_runs` del modelo SHALL ser `2`
- **AND** `session_totals.finalized_runs` SHALL ser `2`

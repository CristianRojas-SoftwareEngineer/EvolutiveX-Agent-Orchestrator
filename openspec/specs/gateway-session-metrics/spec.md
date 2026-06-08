# gateway-session-metrics Specification

## Purpose

Métricas agregadas de sesión en `session-metrics.json` (§33.2): tipos gateway `ISessionMetrics`,
`SessionMetricsService` y invariante G16 (solo workflows `kind: 'main'`). Implementado en fase G4 (2026-05-29).
## Requirements
### Requirement: ISessionMetrics — tipo de dominio para session-metrics.json

El sistema SHALL definir `ISessionMetrics` y tipos asociados en `src/1-domain/types/gateway/session-metrics.types.ts` (capa 1). El schema SHALL alinearse con [§28.2](../../../docs/gateway-architecture.md#282-session-metricsjson-raíz-de-sesión):

- `models`: mapa por `modelId` con `count`, `workflow_count`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_efficiency`.
- `session_totals`: agregado de la sesión incluyendo `total_workflows`.
- Los campos `duration_ms` y `outcome` a nivel de archivo NO SHALL incluirse en G4 (diferidos).

Los tipos legacy `SessionMetrics` y `SessionModelMetrics` en `audit.types.ts` SHALL reexportarse como alias `@deprecated` hacia los tipos gateway.

#### Scenario: Tipo gateway exporta campos §33.2 obligatorios

- **WHEN** se inspecciona `ISessionMetrics` en tipos gateway
- **THEN** incluye `models` con desglose por modelo y `session_totals`
- **AND** cada entrada de modelo incluye `cache_efficiency` y `workflow_count`
- **AND** `session_totals` incluye `total_workflows`

### Requirement: SessionMetricsService — actualización incremental por step (main)

El sistema SHALL proveer en `SessionMetricsService` un método de actualización por step (p. ej. `updateFromStep`) que mergee en `session-metrics.json` el consumo de **un** step cerrado con `usage` válido, incrementando `count` y los contadores de tokens del `modelId` correspondiente, recalculando `cache_efficiency` y `session_totals`. El método SHALL:

- Ejecutarse solo para workflows con `kind: 'main'`.
- Usar la misma cola serializada (`writeQueue`) y escritura atómica que el path de cierre.
- Ser **idempotente** por `step.id`: un mismo step no SHALL incrementar contadores más de una vez aunque se reintente la invocación.
- **NO** incrementar `workflow_count` ni `total_workflows` (reservado al cierre del workflow).

#### Scenario: Step terminal main persiste métricas antes del hook Stop

- **GIVEN** un workflow `kind: 'main'` con un step cerrado en correlador, `usage` presente y `step.id` no contabilizado previamente
- **WHEN** el proxy invoca la actualización per-step tras registrar/cerrar ese step
- **THEN** `session-metrics.json` SHALL reflejar `count` y tokens incrementados para ese `modelId`
- **AND** `workflow_count` del modelo SHALL permanecer sin cambio

#### Scenario: Reintento idempotente del mismo step

- **GIVEN** un step ya contabilizado en `session-metrics.json` (mismo `step.id`)
- **WHEN** se invoca de nuevo la actualización per-step para ese step
- **THEN** los contadores del modelo NO SHALL incrementarse otra vez

#### Scenario: Step sin usage no escribe métricas

- **GIVEN** un step cerrado sin objeto `usage` o sin tokens facturables según las reglas del dominio
- **WHEN** se intenta la actualización per-step
- **THEN** `session-metrics.json` NO SHALL modificarse por ese step

### Requirement: Steps contables — stop_reason y cierre en correlador

La actualización per-step SHALL aplicarse únicamente a steps del workflow **main** que el correlador trate como contables para métricas de sesión: step con `usage` válido y cuya condición de cierre coincida con la del dominio (stop terminal tras `closeStep`; hops `tool_use` no cuentan hasta un hop terminal posterior).

#### Scenario: Hop con stop_reason terminal cuenta al cerrarse el step

- **GIVEN** un hop de inferencia main con `stop_reason` terminal (`end_turn`, `max_tokens`, o equivalente documentado) y `closeStep` ejecutado
- **WHEN** finaliza el registro wire del step con `usage`
- **THEN** la actualización per-step SHALL ejecutarse una vez para ese step

### Requirement: SessionMetricsService — escritura atómica de session-metrics.json

El sistema SHALL proveer `SessionMetricsService` en `src/2-services/session-metrics.service.ts` (capa 2) que mantenga `sessions/{sessionId}/session-metrics.json` como fuente agregada de la sesión. El servicio SHALL:

- Actualizar contadores de steps y tokens **por step** cuando un step main contable cierra (requisito per-step).
- Al cerrar un workflow main, invocar `finalizeWorkflowMetrics` que incremente `workflow_count` por modelo presente en ese workflow y recalcule totales, **sin volver a sumar** steps/tokens ya persistidos por step en la misma sesión/workflow.
- Calcular `cache_efficiency` por modelo según §33.2.
- Escribir el archivo de forma **atómica** (archivo temporal + rename) y persistir idempotencia en sidecar `session-metrics-applied.json`.
- Serializar escrituras concurrentes mediante cola serializada (`writeQueue`).
- Invocarse desde handlers wire (vía `persistBillableStepMetricsIfNeeded`) para steps main contables y desde `AuditHookEventHandler.delegateClosure` para el cierre main.

#### Scenario: Cierre de workflow main actualiza session-metrics.json

- **GIVEN** un workflow `kind: 'main'` cerrado cuyos steps contables ya fueron volcados per-step
- **WHEN** `delegateClosure` completa el cierre del workflow
- **THEN** `session-metrics.json` SHALL tener `workflow_count` incrementado en 1 por cada modelo usado en ese workflow
- **AND** `count` y tokens por modelo NO SHALL duplicar los hops ya contabilizados per-step
- **AND** `session_totals` SHALL reflejar la suma coherente de los modelos

#### Scenario: Dos cierres de workflow main acumulan workflow_count correctamente

- **WHEN** el path de cierre de workflow se invoca dos veces para workflows main distintos del mismo modelo
- **THEN** `workflow_count` del modelo SHALL ser `2`
- **AND** `total_workflows` SHALL ser `2`

### Requirement: workflow_count en IModelSessionMetrics

`IModelSessionMetrics` SHALL incluir el campo `workflow_count: number` que acumula el número de workflows main cerrados que usaron ese modelId.

#### Scenario: Serialización de workflow_count en session-metrics.json

- **WHEN** `SessionMetricsService` escribe `session-metrics.json` tras el cierre de un workflow main
- **THEN** cada entrada en `models` SHALL incluir `workflow_count` con valor ≥ 1

### Requirement: total_workflows en ISessionTotals

`ISessionTotals` SHALL incluir el campo `total_workflows: number` igual a la suma de `workflow_count` de todos los modelos de la sesión.

#### Scenario: total_workflows refleja la suma de modelos

- **WHEN** `recalcSessionTotals` agrega los modelos
- **THEN** `session_totals.total_workflows` SHALL ser igual a la suma de `workflow_count` de cada modelo

### Requirement: Invariante G16 — solo workflows main actualizan métricas de sesión

`SessionMetricsService` SHALL actualizar `session-metrics.json` **únicamente** cuando el workflow cerrado tiene `kind: 'main'`. Los sub-workflows (`kind: 'subagent'`) NO SHALL escribir métricas de sesión.

#### Scenario: Cierre de sub-workflow no escribe session-metrics

- **GIVEN** un sub-workflow `kind: 'subagent'` que cierra con `SubagentStop`
- **WHEN** `AuditHookEventHandler` ejecuta `delegateClosure` para ese workflow
- **THEN** `SessionMetricsService` NO SHALL modificar `session-metrics.json`

### Requirement: Retiro de updateSessionMetrics legacy

El método `updateSessionMetrics()` en `audit-writer.service.ts` y su declaración en `audit-writer.port.ts` SHALL permanecer eliminados. La actualización de sesión SHALL concentrarse en `SessionMetricsService` vía actualización **per-step** (contadores y tokens) y vía cierre de workflow **main** (`workflow_count`), no en handlers wire legacy ni en escaneo de artefactos.

#### Scenario: audit-writer sin updateSessionMetrics

- **WHEN** se inspecciona el shim `ISseAuditWriter` / `AuditWriterService` tras este change
- **THEN** `updateSessionMetrics` NO SHALL estar en el port
- **AND** la actualización per-step NO SHALL reintroducirse en `AuditWriterService`

### Requirement: Finalize métricas al cierre terminal SSE de workflow wire

Cuando un workflow wire (`workflowId !== sessionId`) cierra por stop terminal SSE (`end_turn`, `max_tokens`, etc.) vía `forceClose`, el handler SSE SHALL invocar `finalizeWorkflowMetrics` con los steps cerrados del workflow, incrementando `workflow_count` y `session_totals.total_workflows`.

#### Scenario: Wire workflow agentic cerrado incrementa total_workflows

- **GIVEN** un workflow wire con al menos un step contable con `usage`
- **WHEN** `registerWireStepInCorrelator` cierra el workflow por stop terminal SSE
- **THEN** `session-metrics.json` SHALL tener `total_workflows` incrementado en al menos 1
- **AND** el `workflowId` SHALL quedar en `finalized_workflow_ids` del sidecar


## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: SessionMetricsService — escritura atómica de session-metrics.json

El sistema SHALL proveer `SessionMetricsService` en `src/2-services/session-metrics.service.ts` (capa 2) que actualice `sessions/{sessionId}/session-metrics.json` al cerrar un workflow main. El servicio SHALL:

- Calcular el desglose por modelo usando `aggregateWorkflowUsageByModel` sobre los steps cerrados del workflow.
- Calcular `cache_efficiency` por modelo según §33.2.
- Incrementar `workflow_count` en 1 para cada modelo presente en el merge del workflow cerrado.
- Escribir el archivo de forma **atómica** (archivo temporal + rename).
- Serializar escrituras concurrentes mediante cola serializada (`writeQueue`).
- Invocarse desde `AuditWorkflowClosureHandler` tras proyección del `WorkflowResult`.

#### Scenario: Cierre de workflow main actualiza session-metrics.json

- **GIVEN** un workflow `kind: 'main'` cerrado con steps que tienen `usage` y modelos distintos
- **WHEN** `AuditWorkflowClosureHandler` completa la proyección
- **THEN** `SessionMetricsService` SHALL actualizar `session-metrics.json` en la raíz de la sesión
- **AND** `session_totals` SHALL reflejar la suma de los modelos
- **AND** cada modelo presente en el workflow SHALL tener `workflow_count` incrementado en 1

#### Scenario: Dos cierres de workflow main acumulan workflow_count correctamente

- **WHEN** `updateFromWorkflow` se invoca dos veces para el mismo modelo
- **THEN** `workflow_count` del modelo SHALL ser `2`
- **AND** `total_workflows` SHALL ser `2`

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

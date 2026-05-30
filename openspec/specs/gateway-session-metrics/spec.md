# gateway-session-metrics Specification

## Purpose

Métricas agregadas de sesión en `session-metrics.json` (§33.2): tipos gateway `ISessionMetrics`,
`SessionMetricsService` y invariante G16 (solo workflows `kind: 'main'`). Implementado en fase G4 (2026-05-29).

## Requirements

### Requirement: ISessionMetrics — tipo de dominio para session-metrics.json

El sistema SHALL definir `ISessionMetrics` y tipos asociados en `src/1-domain/types/gateway/session-metrics.types.ts` (capa 1). El schema SHALL alinearse con [§33.2](../../docs/proposals/gateway-design.md#332-session-metricsjson-raíz-de-sesión):

- `models`: mapa por `modelId` con `count`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_efficiency`.
- `session_totals`: agregado de la sesión.
- Los campos `duration_ms` y `outcome` a nivel de archivo NO SHALL incluirse en G4 (diferidos).

Los tipos legacy `SessionMetrics` y `SessionModelMetrics` en `audit.types.ts` SHALL reexportarse como alias `@deprecated` hacia los tipos gateway.

#### Scenario: Tipo gateway exporta campos §33.2 obligatorios

- **WHEN** se inspecciona `ISessionMetrics` en tipos gateway
- **THEN** incluye `models` con desglose por modelo y `session_totals`
- **AND** cada entrada de modelo incluye `cache_efficiency`

### Requirement: SessionMetricsService — escritura atómica de session-metrics.json

El sistema SHALL proveer `SessionMetricsService` en `src/2-services/session-metrics.service.ts` (capa 2) que actualice `sessions/{sessionId}/session-metrics.json` al cerrar un workflow main. El servicio SHALL:

- Calcular el desglose por modelo usando `aggregateWorkflowUsageByModel` sobre los steps cerrados del workflow.
- Calcular `cache_efficiency` por modelo según §33.2.
- Escribir el archivo de forma **atómica** (archivo temporal + rename).
- Serializar escrituras concurrentes mediante cola serializada (`writeQueue`).
- Invocarse desde `AuditWorkflowClosureHandler` tras proyección del `WorkflowResult`.

#### Scenario: Cierre de workflow main actualiza session-metrics.json

- **GIVEN** un workflow `kind: 'main'` cerrado con steps que tienen `usage` y modelos distintos
- **WHEN** `AuditWorkflowClosureHandler` completa la proyección
- **THEN** `SessionMetricsService` SHALL actualizar `session-metrics.json` en la raíz de la sesión
- **AND** `session_totals` SHALL reflejar la suma de los modelos

### Requirement: Invariante G16 — solo workflows main actualizan métricas de sesión

`SessionMetricsService` SHALL actualizar `session-metrics.json` **únicamente** cuando el workflow cerrado tiene `kind: 'main'`. Los sub-workflows (`kind: 'subagent'`) NO SHALL escribir métricas de sesión.

#### Scenario: Cierre de sub-workflow no escribe session-metrics

- **GIVEN** un sub-workflow `kind: 'subagent'` que cierra con `SubagentStop`
- **WHEN** `AuditWorkflowClosureHandler` proyecta el resultado
- **THEN** `SessionMetricsService` NO SHALL modificar `session-metrics.json`

### Requirement: Retiro de updateSessionMetrics legacy

El método `updateSessionMetrics()` en `audit-writer.service.ts` y su declaración en `audit-writer.port.ts` SHALL eliminarse. Los call sites per-step en handlers wire SHALL eliminarse; la actualización de sesión SHALL concentrarse en el cierre del workflow main vía `SessionMetricsService`.

#### Scenario: audit-writer sin updateSessionMetrics

- **WHEN** se inspecciona `IAuditWriter` tras G4
- **THEN** `updateSessionMetrics` NO SHALL estar en el port
- **AND** `AuditWriterService` NO SHALL implementar el método

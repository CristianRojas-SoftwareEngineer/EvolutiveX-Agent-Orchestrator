## ADDED Requirements

### Requirement: ISessionMetrics — tipo de dominio para session-metrics.json

El sistema SHALL definir `ISessionMetrics` y tipos asociados en `src/1-domain/types/gateway/session-metrics.types.ts` (capa 1), migrando la semántica de `SessionMetrics` y `SessionModelMetrics` desde `audit.types.ts`. El schema SHALL alinearse con [§33.2](../../../docs/proposals/gateway-design.md#332-session-metricsjson-raíz-de-sesión):

- `models`: mapa por `modelId` con `count`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_efficiency`.
- `session_totals`: agregado de la sesión.
- Los campos `duration_ms` y `outcome` a nivel de archivo NO SHALL incluirse en G4 (diferidos).

Los tipos legacy `SessionMetrics` y `SessionModelMetrics` en `audit.types.ts` SHALL retirarse o reexportarse como alias `@deprecated` hacia los tipos gateway.

#### Scenario: Tipo gateway exporta campos §33.2 obligatorios

- **WHEN** se inspecciona `ISessionMetrics` en tipos gateway
- **THEN** incluye `models` con desglose por modelo y `session_totals`
- **AND** cada entrada de modelo incluye `cache_efficiency`

### Requirement: SessionMetricsService — escritura atómica de session-metrics.json

El sistema SHALL proveer `SessionMetricsService` en `src/2-services/session-metrics.service.ts` (capa 2) que actualice `sessions/{sessionId}/session-metrics.json` al cerrar un workflow main. El servicio SHALL:

- Calcular el desglose por modelo usando `aggregateWorkflowUsageByModel` sobre los steps cerrados del workflow.
- Calcular `cache_efficiency` por modelo según §33.2.
- Escribir el archivo de forma **atómica** (archivo temporal + rename).
- Serializar escrituras concurrentes mediante `writeQueue` (mismo patrón que `audit-writer.service.ts`) para evitar races.
- Invocarse desde `AuditWorkflowClosureHandler` tras proyección del `WorkflowResult`.

#### Scenario: Cierre de workflow main actualiza session-metrics.json

- **GIVEN** un workflow `kind: 'main'` cerrado con steps que tienen `usage` y modelos distintos
- **WHEN** `AuditWorkflowClosureHandler` completa la proyección
- **THEN** `SessionMetricsService` SHALL actualizar `session-metrics.json` en la raíz de la sesión
- **AND** el archivo SHALL contener entradas en `models` por cada `modelId` observado
- **AND** `session_totals` SHALL reflejar la suma de los modelos

#### Scenario: Escritura atómica evita archivos corruptos

- **GIVEN** una actualización de métricas en curso
- **WHEN** `SessionMetricsService` escribe el archivo
- **THEN** SHALL usar escritura temporal seguida de rename
- **AND** lectores concurrentes NO SHALL observar JSON parcial

### Requirement: Invariante G16 — solo workflows main actualizan métricas de sesión

`SessionMetricsService` SHALL actualizar `session-metrics.json` **únicamente** cuando el workflow cerrado tiene `kind: 'main'`. Los sub-workflows (`kind: 'subagent'`) NO SHALL escribir métricas de sesión porque su consumo ya está incluido en el rollup de `WorkflowResult.usage` del workflow padre. Esto evita doble conteo padre/hijo (invariante G16, §15.7.1).

Referencia: [§15.7.1](../../../docs/proposals/gateway-design.md#1571-agregación-a-nivel-session) e invariante G16 en §39.

#### Scenario: Cierre de sub-workflow no escribe session-metrics

- **GIVEN** un sub-workflow `kind: 'subagent'` que cierra con `SubagentStop`
- **WHEN** `AuditWorkflowClosureHandler` proyecta el resultado
- **THEN** `SessionMetricsService` NO SHALL modificar `session-metrics.json`

#### Scenario: Cierre de workflow main sí escribe session-metrics

- **GIVEN** un workflow `kind: 'main'` que cierra con `Stop`
- **WHEN** `AuditWorkflowClosureHandler` proyecta el resultado
- **THEN** `SessionMetricsService` SHALL actualizar `session-metrics.json`

### Requirement: Retiro de updateSessionMetrics legacy

El método `updateSessionMetrics()` en `audit-writer.service.ts` y su declaración en `audit-writer.port.ts` SHALL eliminarse. Todos los call sites en handlers wire (`AuditSseResponseHandler`, `AuditStandardResponseHandler`, `audit-interaction.handler.ts`, `audit-upstream-error.handler.ts`) SHALL migrar a la actualización vía `SessionMetricsService` en el cierre del workflow main, o eliminar la llamada per-step si el cierre hook-driven concentra la escritura en el closure handler.

#### Scenario: audit-writer sin updateSessionMetrics

- **WHEN** se inspecciona `IAuditWriter` tras G4
- **THEN** `updateSessionMetrics` NO SHALL estar en el port
- **AND** `AuditWriterService` NO SHALL implementar el método

#### Scenario: Handler SSE no llama updateSessionMetrics por step

- **GIVEN** una inferencia SSE completada en un workflow main
- **WHEN** el step se registra en el correlador
- **THEN** `updateSessionMetrics` NO SHALL invocarse en el camino caliente del handler SSE
- **AND** las métricas de sesión SHALL actualizarse al cierre del workflow vía `SessionMetricsService`

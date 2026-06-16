## ADDED Requirements

### Requirement: SessionMetricsService — actualización incremental por step (main)

El sistema SHALL proveer en `SessionMetricsService` un método de actualización por step (p. ej. `updateFromStep`) que mergee en `session-metrics.json` el consumo de **un** step cerrado con `usage` válido, incrementando `count` y los contadores de tokens del `modelId` correspondiente, recalculando `cache_efficiency` y `session_totals`. El método SHALL:

- Ejecutarse solo para workflows con `kind: 'main'`.
- Usar la misma cola serializada (`writeQueue`) y escritura atómica que `updateFromWorkflow`.
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

La actualización per-step SHALL aplicarse únicamente a steps del workflow **main** que el correlador trate como contables para métricas de sesión: step con `usage` válido y cuya condición de cierre coincida con la del dominio (p. ej. step con `closedAt` establecido por `closeStep` tras stop terminal, o la regla documentada en diseño para hops `tool_use` si se incluyen).

#### Scenario: Hop con stop_reason terminal cuenta al cerrarse el step

- **GIVEN** un hop de inferencia main con `stop_reason` terminal (`end_turn`, `max_tokens`, o equivalente documentado) y `closeStep` ejecutado
- **WHEN** finaliza el registro wire del step con `usage`
- **THEN** la actualización per-step SHALL ejecutarse una vez para ese step

## MODIFIED Requirements

### Requirement: SessionMetricsService — escritura atómica de session-metrics.json

El sistema SHALL proveer `SessionMetricsService` en `src/2-services/session-metrics.service.ts` (capa 2) que mantenga `sessions/{sessionId}/session-metrics.json` como fuente agregada de la sesión. El servicio SHALL:

- Actualizar contadores de steps y tokens **por step** cuando un step main contable cierra (requisito per-step).
- Al cerrar un workflow main, invocar un path de cierre (p. ej. `finalizeWorkflowMetrics` o `updateFromWorkflow` ajustado) que incremente `workflow_count` por modelo presente en ese workflow y recalcule totales, **sin volver a sumar** steps/tokens ya persistidos por step en la misma sesión/workflow.
- Calcular `cache_efficiency` por modelo según §33.2.
- Escribir el archivo de forma **atómica** (archivo temporal + rename).
- Serializar escrituras concurrentes mediante cola serializada (`writeQueue`).
- Invocarse desde el wire/correlador para steps main contables y desde `AuditHookEventHandler.delegateClosure` para el cierre main.

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

### Requirement: Retiro de updateSessionMetrics legacy

El método `updateSessionMetrics()` en `audit-writer.service.ts` y su declaración en `audit-writer.port.ts` SHALL permanecer eliminados. La actualización de sesión SHALL concentrarse en `SessionMetricsService` vía actualización **per-step** (contadores y tokens) y vía cierre de workflow **main** (`workflow_count`), no en handlers wire legacy ni en escaneo de artefactos.

#### Scenario: audit-writer sin updateSessionMetrics

- **WHEN** se inspecciona el shim `ISseAuditWriter` / `AuditWriterService` tras este change
- **THEN** `updateSessionMetrics` NO SHALL estar en el port
- **AND** la actualización per-step NO SHALL reintroducirse en `AuditWriterService`

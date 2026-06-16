## MODIFIED Requirements

### Requirement: ISessionMetrics — tipo de dominio para session-metrics.json

El sistema SHALL definir `ISessionMetrics` y tipos asociados en `src/1-domain/types/gateway/session-metrics.types.ts` (capa 1). El schema SHALL alinearse con [§28.2](../../../docs/gateway-architecture.md#282-session-metricsjson-raíz-de-sesión) **con los nombres de contadores actualizados**:

- `models`: mapa por `modelId` con `billable_hops`, `finalized_runs`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `cache_efficiency`.
- `session_totals`: agregado de la sesión incluyendo `billable_hops` y `finalized_runs` (conteo estructural).
- Los campos `count`, `workflow_count`, `total_steps`, `total_workflows` y contadores de tokens en camelCase SHALL NOT existir en escrituras ni ser aceptados como lectura canónica.
- Los campos `duration_ms` y `outcome` a nivel de archivo NO SHALL incluirse (diferidos).

Los tipos canónicos SHALL ser únicamente `ISessionMetrics` / `IModelSessionMetrics` en `session-metrics.types.ts`.

#### Scenario: Tipo gateway exporta campos renombrados obligatorios

- **WHEN** se inspecciona `ISessionMetrics` en tipos gateway
- **THEN** incluye `models` con desglose por modelo y `session_totals`
- **AND** cada entrada de modelo incluye `cache_efficiency`, `billable_hops` y `finalized_runs`
- **AND** `session_totals` incluye `billable_hops` y `finalized_runs`

### Requirement: SessionMetricsService — actualización incremental por step (agentic)

El sistema SHALL proveer en `SessionMetricsService` un método de actualización por step (p. ej. `updateFromStep`) que mergee en `session-metrics.json` el consumo de **un** step cerrado con `usage` válido, incrementando `billable_hops` y los contadores de tokens del `modelId` correspondiente, recalculando `cache_efficiency` y `session_totals`. El método SHALL:

- Ejecutarse para workflows con `kind: 'main'` **o** `kind: 'subagent'`.
- Usar la misma cola serializada (`writeQueue`) y escritura atómica que el path de cierre.
- Ser **idempotente** por `step.id`: un mismo step no SHALL incrementar contadores más de una vez aunque se reintente la invocación.
- **NO** incrementar `finalized_runs` (reservado al cierre de la ejecución agéntica).

#### Scenario: Step terminal main persiste métricas antes del hook Stop

- **GIVEN** un workflow `kind: 'main'` con un step cerrado en correlador, `usage` presente y `step.id` no contabilizado previamente
- **WHEN** el proxy invoca la actualización per-step tras registrar/cerrar ese step
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

### Requirement: Steps contables — stop_reason y cierre en correlador

La actualización per-step SHALL aplicarse a steps de workflows **`kind: 'main'` o `kind: 'subagent'`** que el correlador trate como contables para métricas de sesión: step con `usage` válido y cuya condición de cierre coincida con la del dominio (stop terminal tras `closeStep`; hops `tool_use` no cuentan hasta un hop terminal posterior).

#### Scenario: Hop con stop_reason terminal cuenta al cerrarse el step

- **GIVEN** un hop de inferencia agéntico (main o subagent) con `stop_reason` terminal (`end_turn`, `max_tokens`, o equivalente documentado) y `closeStep` ejecutado
- **WHEN** finaliza el registro wire del step con `usage`
- **THEN** la actualización per-step SHALL ejecutarse una vez para ese step

### Requirement: SessionMetricsService — escritura atómica de session-metrics.json

El sistema SHALL proveer `SessionMetricsService` en `src/2-services/session-metrics.service.ts` (capa 2) que mantenga `sessions/{sessionId}/session-metrics.json` como fuente agregada de la sesión. El servicio SHALL:

- Actualizar contadores de hops y tokens **por step** cuando un step agéntico contable cierra (requisito per-step).
- Al cerrar una ejecución agéntica (`main` o `subagent`), invocar `finalizeWorkflowMetrics` que incremente `finalized_runs` en **exactamente 1** para el modelo atribuido del workflow y recalcule totales, **sin volver a sumar** hops/tokens ya persistidos per-step en la misma ejecución.
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

## REMOVED Requirements

### Requirement: workflow_count en IModelSessionMetrics

**Reason**: Reemplazado por `finalized_runs`.

**Migration**: Sustituido por `finalized_runs`; sin alias de lectura.

### Requirement: total_workflows en ISessionTotals

**Reason**: Reemplazado por `session_totals.finalized_runs` estructural.

**Migration**: Sustituido por `finalized_runs`; sin alias de lectura.

### Requirement: total_steps en ISessionTotals

**Reason**: Reemplazado por `session_totals.billable_hops`.

**Migration**: Sustituido por `billable_hops`; sin alias de lectura.

### Requirement: count en IModelSessionMetrics

**Reason**: Reemplazado por `billable_hops` per-modelo.

**Migration**: Sustituido por `billable_hops`; sin alias de lectura.

### Requirement: Alias deprecated SessionMetrics en audit.types

**Reason**: Tipos canónicos únicos en `session-metrics.types.ts`; sin consumidores del alias.

**Migration**: Eliminar reexports de `audit.types.ts`.

### Requirement: Invariante G16 — solo workflows main actualizan métricas de sesión

**Reason**: Sustituido por G16′ — subagentes deben contribuir a la Tabla 2 por nivel de razonamiento.

**Migration**: Actualizar `persistBillableStepMetricsIfNeeded`, `delegateClosure` y escenarios de spec que citen G16.

### Requirement: Finalize métricas al cierre terminal SSE de workflow wire

**Reason**: El requisito mezclaba cierre SSE wire con conteo por modelo participante; la semántica de finalize queda unificada en el requisito de escritura atómica con atribución 1:1 y G16′.

**Migration**: Los paths SSE que invocan `finalizeWorkflowMetrics` SHALL seguir la misma regla de atribución y G16′; escenarios específicos pasan al requisito de escritura atómica.

## ADDED Requirements

### Requirement: finalized_runs en IModelSessionMetrics

`IModelSessionMetrics` SHALL incluir `finalized_runs: number`: número de ejecuciones agénticas (`kind: 'main'` o `kind: 'subagent'`) cerradas y atribuidas a ese `modelId` en la sesión.

#### Scenario: Serialización de finalized_runs en session-metrics.json

- **WHEN** `SessionMetricsService` escribe `session-metrics.json` tras el cierre de una ejecución agéntica con hops facturables
- **THEN** exactamente un `modelId` SHALL incrementar `finalized_runs` en 1
- **AND** cada entrada en `models` SHALL incluir el campo `finalized_runs`

### Requirement: billable_hops en IModelSessionMetrics

`IModelSessionMetrics` SHALL incluir `billable_hops: number`: hops de inferencia cerrados con `usage` válido atribuidos a ese `modelId` en la sesión (main y subagent).

#### Scenario: billable_hops refleja hops per-step

- **WHEN** dos steps distintos con `usage` del mismo `modelId` se contabilizan per-step
- **THEN** `billable_hops` del modelo SHALL ser `2`

### Requirement: billable_hops agregado en ISessionTotals

`ISessionTotals` SHALL incluir `billable_hops: number` igual a la suma de `billable_hops` de todas las entradas en `models`, recalculado en cada escritura (`recalcSessionTotals`). Alimenta la columna `# Steps` de la fila Totales en la Tabla 2 del statusline.

#### Scenario: total_steps sustituido por billable_hops

- **WHEN** `SessionMetricsService` escribe `session-metrics.json` tras dos hops con `usage` en modelos distintos
- **THEN** `session_totals.billable_hops` SHALL ser `2`
- **AND** el archivo SHALL NOT contener `total_steps`

### Requirement: finalized_runs estructural en ISessionTotals

`ISessionTotals` SHALL incluir `finalized_runs: number` igual a la cantidad de IDs en `finalized_workflow_ids` del sidecar tras el último cierre procesado, **no** la suma de `finalized_runs` de cada modelo. Alimenta la columna `# Workflows` de la fila Totales en la Tabla 2.

#### Scenario: total de sesión refleja ejecuciones estructurales

- **WHEN** la sesión tiene un main y dos subagentes cerrados (tres `workflowId` distintos en `finalized_workflow_ids`)
- **THEN** `session_totals.finalized_runs` SHALL ser `3`

#### Scenario: total no duplica por multi-modelo en un solo main (hallazgo 2)

- **WHEN** la sesión tiene un solo workflow main cerrado en `finalized_workflow_ids`
- **AND** ese main usó dos modelos en hops distintos
- **THEN** `session_totals.finalized_runs` SHALL ser `1`

### Requirement: Atribución de modelo en finalize

Al invocar `finalizeWorkflowMetrics`, el `modelId` que recibe `+1` en `finalized_runs` SHALL ser el `inferenceRequest.model` del **primer** step cerrado del workflow que cumpla:

- `stepKind === 'agentic'`;
- `usage` válido presente.

La selección SHALL ordenar por `index` ascendente. El servicio SHALL NOT usar `languageModelId`, el último hop, ni ningún otro criterio de fallback.

Si no existe ningún step que cumpla ambas condiciones, `finalizeWorkflowMetrics` SHALL NOT incrementar `finalized_runs` en ningún modelo.

El servicio SHALL NOT incrementar `finalized_runs` para más de un `modelId` por invocación de finalize.

#### Scenario: Atribución al primer hop agéntico con usage

- **GIVEN** un workflow cerrado con un step `side-request` con `usage` en `model-lite` (índice menor)
- **AND** un step `agentic` con `usage` en `model-main` (índice posterior)
- **WHEN** finalize ejecuta al cierre
- **THEN** solo `models['model-main'].finalized_runs` SHALL incrementarse
- **AND** `models['model-lite'].billable_hops` SHALL reflejar el side-request sin `finalized_runs`

#### Scenario: Sin hop agéntico con usage no atribuye ejecución

- **GIVEN** un workflow cerrado cuyos únicos steps con `usage` tienen `stepKind: 'side-request'`
- **WHEN** finalize ejecuta al cierre
- **THEN** ningún `models[*].finalized_runs` SHALL incrementarse
- **AND** los `billable_hops` de los side-requests SHALL permanecer contabilizados per-step

### Requirement: Invariante G16′ — ejecuciones agénticas main y subagent

`SessionMetricsService` SHALL actualizar `session-metrics.json` para workflows con `kind: 'main'` o `kind: 'subagent'`. Los workflows que no representen ejecución agéntica proyectada (p. ej. preflights excluidos del árbol causal) NO SHALL escribir métricas.

#### Scenario: Cierre de sub-workflow escribe session-metrics

- **GIVEN** un sub-workflow `kind: 'subagent'` que cierra con `SubagentStop` y steps con `usage`
- **WHEN** `AuditHookEventHandler` ejecuta `delegateClosure` para ese workflow
- **THEN** `SessionMetricsService` SHALL modificar `session-metrics.json`

#### Scenario: Preflight excluido no escribe métricas

- **GIVEN** un hop clasificado como preflight sin proyección causal
- **WHEN** completa upstream
- **THEN** `session-metrics.json` NO SHALL modificarse por ese hop

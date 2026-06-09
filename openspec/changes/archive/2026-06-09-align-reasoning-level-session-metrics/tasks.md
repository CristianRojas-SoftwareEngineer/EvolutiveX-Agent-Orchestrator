## 1. Retiro dominio zombie (capa 1)

- [x] 1.1 Eliminar `languageModelId` de `IWorkflow` y `Workflow`.
- [x] 1.2 Eliminar `setWorkflowModel` de `IWorkflowRepository` y `WorkflowRepositoryService`.
- [x] 1.3 Eliminar tests de `setWorkflowModel` en `workflow-repository.test.ts`.
- [x] 1.4 Eliminar reexports `@deprecated` `SessionMetrics` / `SessionModelMetrics` de `audit.types.ts`.
- [x] 1.5 En `session-metrics.types.ts`: schema único `billable_hops` / `finalized_runs`; retirar `count`, `workflow_count`, `total_steps`, `total_workflows`.
- [x] 1.6 Añadir `resolveAttributedModelId(closedSteps)`: primer step `stepKind === 'agentic'` con `usage`, orden por `index`; sin fallbacks.

## 2. SessionMetricsService (capa 2)

- [x] 2.1 Reescribir `defaultModelMetrics`, `mergeModelUsage`, `recalcSessionTotals` con nombres canónicos; `session_totals.billable_hops` = Σ `models[*].billable_hops` en cada escritura (D1).
- [x] 2.2 `session_totals.finalized_runs` = `finalized_workflow_ids.length` tras finalize (D6).
- [x] 2.3 `updateFromStep` → `billable_hops` + tokens; idempotencia por `step.id`.
- [x] 2.4 `finalizeWorkflowMetrics`: atribución D3 vía `resolveAttributedModelId`; un solo `finalized_runs` +1; sin bucle por modelos (hallazgo 2).
- [x] 2.5 Si `resolveAttributedModelId` retorna `undefined` → no incrementar `finalized_runs` (D5).
- [x] 2.6 JSDoc y comentarios: G16′ (eliminar referencias G16 / `workflow_count`).

## 3. Wire y handlers (capa 3)

- [x] 3.1 `buildInferenceRequestSnapshot`: D8 — `assembled.model` → step en `assignedStepIndex` → modelo del request; eliminar `languageModelId`.
- [x] 3.2 `audit-standard-response.handler.ts`: pasar modelo/step al fallback sin depender de workflow agregado.
- [x] 3.3 `persist-billable-step-metrics.util.ts`: permitir `kind: 'subagent'` (G16′).
- [x] 3.4 `audit-hook-event.handler.ts` `delegateClosure`: finalize para main y subagent.
- [x] 3.5 Revisar `audit-sse-response.handler.ts`: coherencia finalize sin `setWorkflowModel`.
- [x] 3.6 Eliminar `setWorkflowModel: vi.fn()` de mocks de tests de handlers si el port ya no lo expone.

## 4. Statusline — schema único (scripting)

- [x] 4.1 Reemplazar `SessionModelMetricsEntry` por tipos alineados a `ISessionMetrics` (solo snake_case canónico).
- [x] 4.2 Por fila de nivel: agregar `billable_hops` → `# Steps`, `finalized_runs` → `# Workflows`; tokens en snake_case. **Sin** leer `count`, `workflow_count`, ni camelCase.
- [x] 4.3 Fila totales: `# Steps` ← `session_totals.billable_hops`; `# Workflows` ← `session_totals.finalized_runs` (D6; no sumar columnas de nivel para workflows).
- [x] 4.4 Retornar `session_totals` desde `aggregateSessionMetrics` (o leer en render) para alimentar la fila Totales.
- [x] 4.5 Actualizar `.statusline-state.json` snapshot si los nombres internos de métricas cambian (`billableHops` / `finalizedRuns` o equivalente consistente).

## 5. Tests

- [x] 5.1 `session-metrics.service.test.ts`: asserts canónicos; hallazgo 2 (side-request + agentic); solo side-request sin runs.
- [x] 5.2 `persist-billable-step-metrics.util.test.ts`: subagent → `updateFromStep`.
- [x] 5.3 `audit-hook-event.handler.test.ts`: `SubagentStop` → finalize; sin expectativas G16.
- [x] 5.4 `router-status-metrics.test.ts` y `router-status-output.test.ts`: fixtures con schema canónico; test JSON solo G4 (`count`/`workflow_count`) → ceros; asserts de fila Totales desde `session_totals`.
- [x] 5.5 Verificar que no queden referencias a `setWorkflowModel`, `languageModelId`, `workflow_count`, `total_workflows` en tests del change (`rg`).

## 6. Documentación, specs y cierre

- [x] 6.1 `docs/session-metrics-system.md`: tabla renombre G4 → canónico, G16′, atribución, mapeo Tabla 2.
- [x] 6.2 `docs/router-statusline.md` §3.2: fuentes canónicas; sin dual-read; totales estructurales.
- [x] 6.3 `docs/gateway-architecture.md`: retirar o actualizar fila `languageModelId` en tabla `IWorkflow`.
- [x] 6.4 `npm run test:quick` — suite verde.
- [x] 6.5 Sync `openspec/specs/` (cuatro capabilities) y archivar change (`openspec-apply`).

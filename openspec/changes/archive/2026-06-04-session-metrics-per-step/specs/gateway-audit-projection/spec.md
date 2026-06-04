## MODIFIED Requirements

### Requirement: delegateClosure — métricas de sesión sin doble conteo

`delegateClosure()` en `AuditHookEventHandler` SHALL, cuando el workflow sea de kind `main`, invocar el path de **cierre** de `SessionMetricsService` (incremento de `workflow_count` / reconciliación de workflow) y NO SHALL re-ejecutar un merge completo de steps/tokens que duplique hops ya contabilizados per-step en el mismo workflow. NO SHALL invocar `AuditWorkflowClosureHandler.execute()` ni resolver rutas flat legacy.

#### Scenario: Delegación de cierre actualiza workflow_count sin duplicar steps

- **GIVEN** un workflow de kind `main` cerrado en el correlador vía hook `Stop`
- **AND** sus steps contables ya actualizaron `session-metrics.json` per-step
- **WHEN** `AuditHookEventHandler` ejecuta `delegateClosure()`
- **THEN** SHALL invocar el path de cierre de métricas de sesión para ese workflow
- **AND** `workflow_count` SHALL incrementarse según los modelos del workflow
- **AND** `count` y tokens por modelo NO SHALL incrementarse de nuevo por los mismos steps

#### Scenario: Workflow subagente no actualiza métricas de sesión

- **GIVEN** un workflow de kind `subagent` cerrado vía hook `SubagentStop`
- **WHEN** `AuditHookEventHandler` ejecuta `delegateClosure()`
- **THEN** NO SHALL invocar ningún path de `SessionMetricsService` (solo workflows `main`, invariante G16)

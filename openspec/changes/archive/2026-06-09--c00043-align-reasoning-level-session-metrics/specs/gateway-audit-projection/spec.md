## MODIFIED Requirements

### Requirement: Delegación de cierre de workflow main en delegateClosure

`delegateClosure()` en `AuditHookEventHandler` SHALL, cuando el workflow sea de kind `main` **o** `subagent`, invocar `sessionMetrics.finalizeWorkflowMetrics()` (incremento de `finalized_runs` / reconciliación de ejecución) y NO SHALL re-ejecutar un merge completo de steps/tokens que duplique hops ya contabilizados per-step en la misma ejecución. NO SHALL invocar `AuditWorkflowClosureHandler.execute()` ni resolver rutas flat legacy.

#### Scenario: Delegación de cierre main actualiza finalized_runs sin duplicar steps

- **GIVEN** un workflow `kind: 'main'` cerrado por hook `Stop` o `StopFailure`
- **AND** sus steps contables ya fueron persistidos vía `updateFromStep`
- **WHEN** `delegateClosure` ejecuta
- **THEN** `finalizeWorkflowMetrics` SHALL invocarse una vez
- **AND** `finalized_runs` SHALL incrementarse en 1 para el modelo atribuido del workflow
- **AND** `billable_hops` y tokens NO SHALL duplicarse

#### Scenario: Delegación de cierre subagent actualiza finalized_runs

- **GIVEN** un workflow `kind: 'subagent'` cerrado por hook `SubagentStop`
- **AND** al menos un step del subagent tuvo `usage` contabilizado per-step
- **WHEN** `delegateClosure` ejecuta
- **THEN** `finalizeWorkflowMetrics` SHALL invocarse
- **AND** `finalized_runs` SHALL incrementarse para el modelo atribuido del sub-workflow

## REMOVED Requirements

### Requirement: (fragmento G16 en delegación de cierre)

**Reason**: El escenario «Workflow subagente no actualiza métricas de sesión» contradice G16′ y el propósito de la Tabla 2.

**Migration**: Reemplazado por escenario «Delegación de cierre subagent actualiza finalized_runs» arriba.

#### Scenario: Workflow subagente no actualiza métricas de sesión

- **REMOVED** — ver escenario subagent positivo en requisito modificado de delegación.

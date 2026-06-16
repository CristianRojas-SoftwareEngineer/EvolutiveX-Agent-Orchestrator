## MODIFIED Requirements

### Requirement: finalized_runs estructural en ISessionTotals

`ISessionTotals` SHALL incluir `finalized_runs: number` igual a la cantidad de IDs en `finalized_workflow_ids` del sidecar tras el último cierre procesado, **no** la suma de `finalized_runs` de cada modelo. Nota: el statusline deriva la columna `# Workflows` de la fila Totales de la **suma de los niveles renderizados** (lite + standard + reasoning + frontier), no desde `session_totals.finalized_runs` directamente (ver `statusline-runtime`); ambos valores difieren cuando hay workflows sin modelo atribuido.

#### Scenario: total de sesión refleja ejecuciones estructurales

- **WHEN** la sesión tiene un main y dos subagentes cerrados (tres `workflowId` distintos en `finalized_workflow_ids`)
- **THEN** `session_totals.finalized_runs` SHALL ser `3`

#### Scenario: total no duplica por multi-modelo en un solo main (hallazgo 2)

- **WHEN** la sesión tiene un solo workflow main cerrado en `finalized_workflow_ids`
- **AND** ese main usó dos modelos en hops distintos
- **THEN** `session_totals.finalized_runs` SHALL ser `1`

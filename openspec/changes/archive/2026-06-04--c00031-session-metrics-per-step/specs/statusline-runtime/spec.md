## ADDED Requirements

### Requirement: Tabla 2 refleja session-metrics.json intra-workflow

Cuando el proxy ha persistido métricas per-step en `session-metrics.json`, el statusline SHALL mostrar en la Tabla 2 los contadores actualizados en la **siguiente** invocación que Claude Code realice, sin requerir cambios en el algoritmo de agregación de `aggregateSessionMetrics` más allá de leer el archivo vigente.

#### Scenario: Métricas visibles tras un hop sin esperar al Stop

- **GIVEN** `EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **AND** `sessions/<sessionId>/session-metrics.json` fue actualizado tras cerrar un step main contable
- **AND** Claude Code invoca el statusline con ese `session_id`
- **WHEN** `buildStatuslineOutput` agrega desde `session-metrics.json`
- **THEN** la Tabla 2 SHALL incluir el incremento de `# Steps` y tokens correspondiente a ese hop
- **AND** `# Workflows` SHALL reflejar solo workflows main ya cerrados (sin incremento anticipado por el hop aislado)

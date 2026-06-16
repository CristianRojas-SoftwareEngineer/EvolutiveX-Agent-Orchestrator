## MODIFIED Requirements

### Requirement: meta.json fusiona identidad y estado del workflow

En `workflow_start`, `meta.json` SHALL incluir `workflowKind` (estructural: `main` | `subagent`) y `interactionType` (semántico: `agentic` | `side-request` | `client-preflight` | `session-shell`, desde payload `workflowKind` del correlador).

#### Scenario: workflow_start persiste interactionType semántico

- **WHEN** el correlador emite `workflow_start` con `workflowKind: 'side-request'` en payload
- **THEN** `meta.json` SHALL contener `workflowKind: 'main'` y `interactionType: 'side-request'`

#### Scenario: Shell de sesión persiste session-shell

- **WHEN** el correlador emite `workflow_start` para el workflow contenedor (`workflowId === sessionId`) con `workflowKind: 'session-shell'` en payload
- **THEN** `meta.json` SHALL contener `workflowKind: 'main'` y `interactionType: 'session-shell'`
- **AND** SHALL NOT usar `interactionType: 'main'` como fallback semántico

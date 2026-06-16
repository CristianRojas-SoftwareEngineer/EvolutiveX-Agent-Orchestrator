## ADDED Requirements

### Requirement: Propagación del modelo observado al workflow

El port `IWorkflowRepository` (capa 1) SHALL exponer una operación `setWorkflowModel(workflowId, modelId)` que asigne `workflow.languageModelId` con el **primer modelo observado** para ese workflow. La operación SHALL ser idempotente respecto al modelo: si `languageModelId` ya está fijado, no lo sobrescribe. Si el `workflowId` no existe en el correlador, la operación SHALL ser un no-op (sin error). Este dato es prerequisito de `SessionMetricsService` en G4 para desglosar `session-metrics.json` por modelo.

#### Scenario: Primer modelo observado fija languageModelId

- **WHEN** se invoca `setWorkflowModel(workflowId, 'claude-sonnet-4-6')` sobre un workflow cuyo `languageModelId` está sin fijar
- **THEN** `workflow.languageModelId` queda en `'claude-sonnet-4-6'`

#### Scenario: Modelo posterior no sobrescribe el primero

- **WHEN** un workflow ya tiene `languageModelId` fijado y se invoca `setWorkflowModel` con un modelo distinto
- **THEN** `workflow.languageModelId` conserva el primer valor observado

#### Scenario: Workflow inexistente es no-op

- **WHEN** se invoca `setWorkflowModel` con un `workflowId` no registrado en el correlador
- **THEN** la operación retorna sin error y sin mutar ningún workflow

### Requirement: El handler SSE propaga el modelo al completar la inferencia

`AuditSseResponseHandler` (capa 3) SHALL propagar, al completar la inferencia, el modelo del request hacia el correlador resolviendo el workflow por su clave de correlación (`sessionId` para el workflow main, `agentId` para subagente) e invocando `setWorkflowModel`. La propagación SHALL ser defensiva: si el workflow aún no fue abierto en el correlador (que corre en paralelo en memoria, sin impacto en disco), la propagación no produce efecto ni error.

#### Scenario: Propagación al workflow main abierto por hooks

- **WHEN** una inferencia de un workflow main completa y el workflow ya fue abierto en el correlador (vía `UserPromptSubmit`)
- **THEN** el handler invoca `setWorkflowModel(sessionId, modelId)` y `workflow.languageModelId` queda fijado con el modelo del request

#### Scenario: Propagación sin workflow abierto no afecta el flujo

- **WHEN** una inferencia completa pero el correlador no tiene el workflow correspondiente abierto
- **THEN** la propagación es no-op y el pipeline de auditoría legacy continúa sin alteración

## REMOVED Requirements

### Requirement: Propagación del modelo observado al workflow

**Reason**: `setWorkflowModel` y `languageModelId` eran prerequisito G3/G4 nunca cableados en producción; la atribución por modelo vive en `IStep.inferenceRequest.model` y en `resolveAttributedModelId` para `finalized_runs`. Mantener el port zombie contradice el principio de un solo camino estructural.

**Migration**: Eliminar `setWorkflowModel` de `IWorkflowRepository` y `WorkflowRepositoryService`; eliminar `languageModelId` de `IWorkflow` y `Workflow`; actualizar `buildInferenceRequestSnapshot` (design D8); eliminar tests de `setWorkflowModel`.

#### Scenario: Primer modelo observado fija languageModelId

- **REMOVED**

#### Scenario: Modelo posterior no sobrescribe el primero

- **REMOVED**

#### Scenario: Workflow inexistente es no-op

- **REMOVED**

### Requirement: El handler SSE propaga el modelo al completar la inferencia

**Reason**: Dependía de `setWorkflowModel`; el modelo del hop se captura en el step al abrir/cerrar el wire, no en un agregado del workflow.

**Migration**: Ningún handler SHALL invocar `setWorkflowModel`.

#### Scenario: Propagación al workflow main abierto por hooks

- **REMOVED**

#### Scenario: Propagación sin workflow abierto no afecta el flujo

- **REMOVED**

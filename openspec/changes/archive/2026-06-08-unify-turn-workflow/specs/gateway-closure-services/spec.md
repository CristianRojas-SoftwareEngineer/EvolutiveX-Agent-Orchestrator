## MODIFIED Requirements

### Requirement: buildWorkflowResult — construcción pura de WorkflowResult

El sistema SHALL proveer la función pura `buildWorkflowResult(workflow, steps, childWorkflows, hook)`
en `src/1-domain/services/gateway/build-workflow-result.ts`.

Contrato:
- Firma: `buildWorkflowResult(workflow: IWorkflow, closedSteps: IStep[], childResults: IWorkflowResult[], hook: ClaudeHookEvent): IWorkflowResult`
- Recibe el workflow actual, los steps cerrados, los results de child workflows y el hook de cierre.
- Devuelve `IWorkflowResult` con: `outcome` (via `deriveOutcome`), `finalText` (via `deriveFinalText` desde `last_assistant_message` del hook), `closedByEvent` (mapeo de `hook.eventName` a `WorkflowClosedByEvent`; fallback conservador si no es uno de los tres valores válidos), `sessionId: hook.sessionId`, `stepCount: closedSteps.length`, `usage` (via `aggregateWorkflowUsage`).
- `finalText` SHALL provenir **únicamente** del hook de cierre. Si `last_assistant_message` está ausente → `undefined`. SHALL NOT reconstruirse desde `Step.assistantMessage` ni desde el último hop `end_turn`.
- La función SHALL ser pura: sin I/O, sin efectos secundarios, sin mutación de argumentos.
- El cierre del workflow SHALL expresarse como llamada a esta función desde el handler de capa 3, NO como un método `Workflow.complete()` con efectos.

Referencia técnica: [§36 gateway-architecture.md](../../../../docs/gateway-architecture.md#36-capa-1--domain).
Semántica en §9.6–§9.7 de `docs/gateway-architecture.md`.

#### Scenario: Construcción correcta de WorkflowResult (turno o subagent)

- **GIVEN** un `IWorkflow` con steps cerrados y hook de cierre con `last_assistant_message`
- **WHEN** se invoca `buildWorkflowResult(workflow, steps, [], hook)`
- **THEN** el resultado SHALL tener `outcome` derivado del hook, `finalText` extraído vía `deriveFinalText` y tokens agregados de los steps

#### Scenario: Workflow de turno incluye finalText del hook

- **GIVEN** un workflow de turno con `workflow.id === hook.sessionId`
- **WHEN** se invoca `buildWorkflowResult(workflow, steps, [], hook)` tras hook `Stop` con `last_assistant_message`
- **THEN** el resultado SHALL incluir `finalText` con el valor del hook
- **AND** SHALL conservar `outcome`, `stepCount`, `usage` y `closedByEvent`

#### Scenario: Inclusión de child workflows en el resultado

- **GIVEN** un workflow padre con child workflows resueltos (`IWorkflowResult[]` no vacío)
- **WHEN** se invoca `buildWorkflowResult(workflow, steps, childWorkflows, hook)`
- **THEN** los tokens de los child workflows SHALL estar incluidos en los totales del resultado padre

#### Scenario: Pureza — sin I/O

- **GIVEN** un entorno de test Vitest sin infraestructura montada
- **WHEN** se importa y se invoca `buildWorkflowResult` con datos de prueba
- **THEN** la función SHALL completarse sin llamadas a `fs`, `fetch` ni Fastify

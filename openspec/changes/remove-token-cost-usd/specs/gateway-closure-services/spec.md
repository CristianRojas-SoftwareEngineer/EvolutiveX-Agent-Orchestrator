## MODIFIED Requirements

### Requirement: buildWorkflowResult — construcción pura de WorkflowResult

El sistema SHALL proveer la función pura `buildWorkflowResult(workflow, steps, childWorkflows, hook)`
en `src/1-domain/services/gateway/build-workflow-result.ts`.

Contrato:
- Firma: `buildWorkflowResult(workflow: IWorkflow, closedSteps: IStep[], childResults: IWorkflowResult[], hook: ClaudeHookEvent): IWorkflowResult`
- Recibe el workflow actual, los steps cerrados, los results de child workflows y el hook de cierre.
- Devuelve `IWorkflowResult` con: `outcome` (via `deriveOutcome`), `finalText` (via `deriveFinalText`),
  `closedByEvent` (mapeo de `hook.eventName` a `WorkflowClosedByEvent`; fallback conservador si no
  es uno de los tres valores válidos), `sessionId: hook.sessionId`, `stepCount: closedSteps.length`,
  `usage` (via `aggregateWorkflowUsage`).
- La función SHALL ser pura: sin I/O, sin efectos secundarios, sin mutación de argumentos.
- El cierre del workflow SHALL expresarse como llamada a esta función desde el handler de capa 3,
  NO como un método `Workflow.complete()` con efectos.

Referencia técnica: [§39 gateway-design.md](../../docs/proposals/gateway-design.md#capa-1-objetivo).
Semántica en §15.7–§15.8 de `docs/proposals/gateway-design.md`.

#### Scenario: Construcción correcta de WorkflowResult

- **GIVEN** un `IWorkflow`, un array de `IStep` completos y el hook de cierre
- **WHEN** se invoca `buildWorkflowResult(workflow, steps, [], hook)`
- **THEN** el resultado SHALL tener `outcome` derivado del hook, `finalText` extraído y tokens
  agregados de los steps

#### Scenario: Inclusión de child workflows en el resultado

- **GIVEN** un workflow padre con child workflows resueltos (`IWorkflowResult[]` no vacío)
- **WHEN** se invoca `buildWorkflowResult(workflow, steps, childWorkflows, hook)`
- **THEN** los tokens de los child workflows SHALL estar incluidos en los totales del resultado padre

#### Scenario: Pureza — sin I/O

- **GIVEN** un entorno de test Vitest sin infraestructura montada
- **WHEN** se importa y se invoca `buildWorkflowResult` con datos de prueba
- **THEN** la función SHALL completarse sin llamadas a `fs`, `fetch` ni Fastify
- **AND** `npm run test:quick` SHALL pasar

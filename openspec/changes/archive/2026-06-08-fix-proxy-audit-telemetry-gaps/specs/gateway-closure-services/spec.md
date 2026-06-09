## MODIFIED Requirements

### Requirement: buildWorkflowResult — construcción pura de WorkflowResult

El sistema SHALL proveer la función pura `buildWorkflowResult(workflow, steps, childWorkflows, hook)`
en `src/1-domain/services/gateway/build-workflow-result.ts`.

Contrato:
- Firma: `buildWorkflowResult(workflow: IWorkflow, closedSteps: IStep[], childResults: IWorkflowResult[], hook: ClaudeHookEvent): IWorkflowResult`
- Recibe el workflow actual, los steps cerrados, los results de child workflows y el hook de cierre.
- Devuelve `IWorkflowResult` con: `outcome` (via `deriveOutcome`), `finalText` (via `deriveFinalText` **salvo** contenedor de sesión; ver abajo), `closedByEvent` (mapeo de `hook.eventName` a `WorkflowClosedByEvent`; fallback conservador si no es uno de los tres valores válidos), `sessionId: hook.sessionId`, `stepCount: closedSteps.length`, `usage` (via `aggregateWorkflowUsage`).
- Cuando el workflow cerrado es el contenedor de sesión (`workflow.id === hook.sessionId`), el resultado SHALL **omitir** el campo `finalText`. El texto final del turno agentic SHALL residir únicamente en el `IWorkflowResult` del workflow wire cerrado por SSE.
- La función SHALL ser pura: sin I/O, sin efectos secundarios, sin mutación de argumentos.
- El cierre del workflow SHALL expresarse como llamada a esta función desde el handler de capa 3, NO como un método `Workflow.complete()` con efectos.

#### Scenario: Construcción correcta de WorkflowResult (workflow wire o subagent)

- **GIVEN** un `IWorkflow` con `id !== hook.sessionId` (wire agentic o subagente), steps cerrados y hook de cierre
- **WHEN** se invoca `buildWorkflowResult(workflow, steps, [], hook)`
- **THEN** el resultado SHALL tener `outcome` derivado del hook, `finalText` extraído vía `deriveFinalText` y tokens agregados de los steps

#### Scenario: Shell de sesión omite finalText

- **GIVEN** un workflow contenedor con `workflow.id === hook.sessionId`
- **WHEN** se invoca `buildWorkflowResult(workflow, steps, [], hook)` tras hook `Stop`
- **THEN** el resultado SHALL NOT incluir la propiedad `finalText`
- **AND** SHALL conservar `outcome`, `stepCount`, `usage` y `closedByEvent`

#### Scenario: Inclusión de child workflows en el resultado

- **GIVEN** un workflow padre con child workflows resueltos (`IWorkflowResult[]` no vacío)
- **WHEN** se invoca `buildWorkflowResult(workflow, steps, childWorkflows, hook)`
- **THEN** los tokens de los child workflows SHALL estar incluidos en los totales del resultado padre

#### Scenario: Pureza — sin I/O

- **GIVEN** un entorno de test Vitest sin infraestructura montada
- **WHEN** se importa y se invoca `buildWorkflowResult` con datos de prueba
- **THEN** la función SHALL completarse sin llamadas a `fs`, `fetch` ni Fastify
- **AND** `npm run test:quick` SHALL pasar

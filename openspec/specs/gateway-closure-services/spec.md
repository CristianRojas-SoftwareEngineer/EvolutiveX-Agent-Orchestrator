## Purpose

Domain services puros de cierre del workflow en `src/1-domain/services/gateway/`.
Funciones puras sin I/O: `aggregateWorkflowUsage`, `buildWorkflowResult`, `deriveOutcome`,
`deriveFinalText`, `validate-workflow-invariants`. Implementado en fase G1 (2026-05-29).

## Requirements

### Requirement: aggregateWorkflowUsage — suma determinista de tokens

El sistema SHALL proveer la función pura `aggregateWorkflowUsage(steps, childWorkflows)` en
`src/1-domain/services/gateway/aggregate-workflow-usage.ts`.

Contrato:
- Recibe un array de `IStep` (steps cerrados del workflow actual) y un array de `IWorkflowResult`
  (resultados de child workflows ejecutados como tool_use Agent).
- Devuelve `AnthropicUsage | undefined`: suma de `input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens` de steps cerrados con `usage` presente,
  más `usage` de los child results. Si ninguno aporta `usage` → `undefined` (no inventar ceros).
- Omite `service_tier` e `inference_geo` en el agregado (no son aditivos).
- La suma SHALL ser determinista: mismas entradas → mismo resultado.
- NO SHALL tener efectos secundarios ni acceder a I/O.

Referencia técnica: [§39 gateway-design.md](../../docs/proposals/gateway-design.md#capa-1-objetivo)
y semántica en §15.6 de `docs/proposals/gateway-design.md`.

#### Scenario: Suma de tokens de steps y child workflows

- **GIVEN** un array de `IStep` con tokens definidos y un array de `IWorkflowResult` con sus totales
- **WHEN** se invoca `aggregateWorkflowUsage(steps, childWorkflows)`
- **THEN** el resultado SHALL igualar la suma aritmética de todos los tokens de input y output
- **AND** los tokens de child workflows SHALL incluirse en el total

#### Scenario: Arrays vacíos retornan undefined

- **GIVEN** que se invoca `aggregateWorkflowUsage([], [])`
- **WHEN** la función se ejecuta
- **THEN** el resultado SHALL ser `undefined` (no hay datos de uso disponibles)

#### Scenario: Pureza — sin I/O

- **GIVEN** un entorno de test Vitest sin dependencias de infraestructura montadas
- **WHEN** se importa y se invoca `aggregateWorkflowUsage` con datos de prueba
- **THEN** la función SHALL ejecutarse sin llamadas a `fs`, `fetch` ni timers
- **AND** el test SHALL pasar con `npm run test:quick`

---

### Requirement: buildWorkflowResult — construcción pura de WorkflowResult

El sistema SHALL proveer la función pura `buildWorkflowResult(workflow, steps, childWorkflows, hook)`
en `src/1-domain/services/gateway/build-workflow-result.ts`.

Contrato:
- Firma: `buildWorkflowResult(workflow: IWorkflow, closedSteps: IStep[], childResults: IWorkflowResult[], hook: ClaudeHookEvent): IWorkflowResult`
- Recibe el workflow actual, los steps cerrados, los results de child workflows y el hook de cierre.
- Devuelve `IWorkflowResult` con: `outcome` (via `deriveOutcome`), `finalText` (via `deriveFinalText`),
  `closedByEvent` (mapeo de `hook.eventName` a `WorkflowClosedByEvent`; fallback conservador si no
  es uno de los tres valores válidos), `sessionId: hook.sessionId`, `stepCount: closedSteps.length`,
  `usage` (via `aggregateWorkflowUsage`). `totalCostUsd` queda `undefined` en G1 (cálculo de coste
  depende de pricing — diferido a fase posterior).
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

---

### Requirement: deriveOutcome — derivación pura del outcome desde el hook

El sistema SHALL proveer la función pura `deriveOutcome(hook)` en
`src/1-domain/services/gateway/derive-outcome.ts`.

Contrato:
- Recibe el hook de cierre del workflow (`ClaudeHookEvent` de `hook.types.ts`).
- Devuelve el `WorkflowOutcome` correspondiente según `hook.eventName`:
  `Stop | SubagentStop → 'success'`; `StopFailure → 'api_error'`; resto → `'unknown'`.
  La rama `'aborted'` (PostToolBatch con decision:block) no tiene campo en `ClaudeHookEvent` v1;
  se difiere a fase posterior.
- La función SHALL ser pura: sin I/O, determinista.

Referencia técnica: [§39 gateway-design.md](../../docs/proposals/gateway-design.md#capa-1-objetivo).
Semántica del hook de cierre en §15.7.1 de `docs/proposals/gateway-design.md`.

#### Scenario: Derivación de outcome success

- **GIVEN** un hook de cierre con `eventName: 'Stop'` o `eventName: 'SubagentStop'`
- **WHEN** se invoca `deriveOutcome(hook)`
- **THEN** el resultado SHALL ser `'success'`

#### Scenario: Derivación de outcome api_error

- **GIVEN** un hook de cierre con `eventName: 'StopFailure'`
- **WHEN** se invoca `deriveOutcome(hook)`
- **THEN** el resultado SHALL ser `'api_error'`

#### Scenario: Derivación de outcome unknown para evento no clasificado

- **GIVEN** un hook con `eventName` que no es `Stop`, `SubagentStop` ni `StopFailure`
- **WHEN** se invoca `deriveOutcome(hook)`
- **THEN** el resultado SHALL ser `'unknown'`

---

### Requirement: deriveFinalText — extracción pura del texto final del hook

El sistema SHALL proveer la función pura `deriveFinalText(hook)` en
`src/1-domain/services/gateway/derive-final-text.ts`.

Contrato:
- Recibe el hook de cierre del workflow (`ClaudeHookEvent` de `hook.types.ts`).
- Devuelve `hook.lastAssistantMessage` como passthrough (`string | undefined`).
  Si es vacío o undefined → `undefined`. Sin derivación ni join de bloques.
- La función SHALL ser pura: sin I/O, sin efectos secundarios.

Referencia técnica: semántica en §15.8 de `docs/proposals/gateway-design.md`.

#### Scenario: Extracción de texto presente

- **GIVEN** un hook de cierre con `lastAssistantMessage` presente y no vacío
- **WHEN** se invoca `deriveFinalText(hook)`
- **THEN** el resultado SHALL ser el string de texto del mensaje final (passthrough sin modificar)

#### Scenario: Ausencia de texto retorna undefined

- **GIVEN** un hook de cierre con `lastAssistantMessage` ausente o vacío
- **WHEN** se invoca `deriveFinalText(hook)`
- **THEN** el resultado SHALL ser `undefined`

---

### Requirement: validate-workflow-invariants — validaciones puras de dominio

El sistema SHALL proveer en `src/1-domain/services/gateway/validate-workflow-invariants.ts` las
funciones puras de validación de invariantes del dominio gateway relevantes a G1 (subconjunto
de los invariantes G1–G19 de [§39](../../docs/proposals/gateway-design.md#capa-1-objetivo)):

- Un sub-workflow SHALL tener `parentWorkflowId` y `parentToolUseId` no nulos ni vacíos.
- Un workflow raíz (`kind: 'main'`) es válido sin `parentWorkflowId`.

Estas funciones exponen `isValidSubWorkflow` (devuelve `boolean`) y `assertValidSubWorkflow`
(lanza `Error` con mensaje descriptivo). Sin I/O.

#### Scenario: Sub-workflow sin parentWorkflowId es inválido

- **GIVEN** un objeto que representa un sub-workflow con `parentWorkflowId: undefined`
- **WHEN** se invoca el validador de invariante de sub-workflow
- **THEN** el resultado SHALL indicar invariante violado (retorno `false` o lanzamiento de `Error`)

#### Scenario: Workflow raíz sin parentWorkflowId es válido

- **GIVEN** un objeto que representa un workflow raíz con `kind: 'main'` y `parentWorkflowId: undefined`
- **WHEN** se invoca el validador de invariante de sub-workflow
- **THEN** el resultado SHALL indicar invariante satisfecho (retorno `true` o sin error lanzado)

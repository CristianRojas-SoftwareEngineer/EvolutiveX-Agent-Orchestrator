## ADDED Requirements

### Requirement: aggregateWorkflowUsageByModel — agrupación pura por modelo

El sistema SHALL proveer la función pura `aggregateWorkflowUsageByModel(closedSteps: IStep[])` en `src/1-domain/services/gateway/aggregate-workflow-usage-by-model.ts`.

Contrato:
- Recibe un array de `IStep` cerrados del workflow.
- Agrupa `step.usage` por `step.inferenceRequest.model` (modelId).
- Devuelve `Record<string, { usage: AnthropicUsage; stepCount: number }>` donde cada entrada acumula tokens de todos los steps de ese modelo y cuenta cuántos steps contribuyeron.
- Si un step no tiene `usage`, no contribuye al agregado de su modelo.
- Si ningún step aporta `usage`, devuelve un objeto vacío `{}` (no inventar ceros por modelo).
- Omite `service_tier` e `inference_geo` (no son aditivos), coherente con `aggregateWorkflowUsage`.
- La función SHALL ser determinista y sin efectos secundarios ni I/O.

Referencia: [§33.2 gateway-design.md](../../../../../docs/proposals/gateway-design.md#332-session-metricsjson-raíz-de-sesión) y decisión orquestador G3/G4 en `gateway-migration`.

#### Scenario: Agrupación de dos modelos distintos

- **GIVEN** dos steps cerrados con `inferenceRequest.model` `'model-a'` y `'model-b'` y `usage` definido en cada uno
- **WHEN** se invoca `aggregateWorkflowUsageByModel(steps)`
- **THEN** el resultado SHALL tener entradas separadas para `'model-a'` y `'model-b'`
- **AND** cada entrada SHALL incluir `stepCount` igual al número de steps de ese modelo
- **AND** los tokens de cada entrada SHALL ser la suma aritmética de los `usage` de sus steps

#### Scenario: Varios steps del mismo modelo se acumulan

- **GIVEN** tres steps cerrados con el mismo `inferenceRequest.model` y `usage` definido
- **WHEN** se invoca `aggregateWorkflowUsageByModel(steps)`
- **THEN** la entrada de ese modelo SHALL tener `stepCount: 3`
- **AND** los contadores de tokens SHALL ser la suma de los tres steps

#### Scenario: Steps sin usage no contribuyen

- **GIVEN** un step cerrado sin campo `usage`
- **WHEN** se invoca `aggregateWorkflowUsageByModel([step])`
- **THEN** el resultado SHALL ser `{}`

#### Scenario: Pureza — sin I/O

- **GIVEN** un entorno de test Vitest sin infraestructura montada
- **WHEN** se importa y se invoca `aggregateWorkflowUsageByModel` con datos de prueba
- **THEN** la función SHALL ejecutarse sin llamadas a `fs`, `fetch` ni timers
- **AND** `npm run test:quick` SHALL pasar

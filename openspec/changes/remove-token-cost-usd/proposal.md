## Why

El gateway se usa con proveedores de pago por uso, planes de tokens y proveedores gratuitos; el mismo modelo puede tener distintos costos (o ninguno) según el proveedor, por lo que calcular un costo en USD por token es ambiguo, costoso de mantener y sin valor observacional real. La lógica de costo en USD nunca llegó a implementarse (es un esqueleto inerte) y conviene eliminarlo antes de que contamine las fases P0–P2 pendientes del bloque de persistencia.

## What Changes

- Se elimina el campo `totalCostUsd?: number` de `IWorkflowResult` y su inicialización `undefined` en `buildWorkflowResult`.
- Se borra `src/1-domain/types/pricing.types.ts` (tipos `ModelCosts`, `PricingModelDefinition`, `ModelPricingConfig`, `PricingDefaultModifiers`); no tenía importadores en `src/`.
- Se elimina la clave `"costs"` de los 17 archivos `routing/providers/*/models/*/metadata.json`, conservando `modelId` y `displayName`.
- Se borran `docs/how-to-calculate-anthropic-api-costs.md` y `docs/how-to-calculate-openrouter-api-costs.md`.
- Se limpian en `docs/proposals/gateway-design.md` todas las referencias a `totalCostUsd`, `pricingService.estimate`, `calculateCost`, los enlaces a los docs de cálculo y la mención a `pricing.types.ts`, preservando la semántica de consumo de tokens (`usage`, agregación por hop).
- Se elimina de los tests la aserción `expect(result.totalCostUsd).toBeUndefined()`.

**No se toca** la lógica de consumo de tokens: `IWorkflowResult.usage`, `session-metrics.json`, `SessionMetricsService`, agregadores `aggregateWorkflowUsage` / `aggregateWorkflowUsageByModel`, ni los tipos `IModelSessionMetrics` / `ISessionMetrics`.

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `gateway-closure-services`: la descripción del contrato de `buildWorkflowResult` menciona `totalCostUsd: undefined` como parte del resultado esperado; se elimina esa cláusula.
- `gateway-workflow-lifecycle`: el requirement de `close` incluye el bullet "El resultado `IWorkflowResult` devuelto SHALL tener `totalCostUsd: undefined`…"; se elimina.

## No objetivos

- Este change no modifica la lógica de agregación de tokens de input, output ni caché.
- No altera el enrutamiento de modelos ni los campos `modelId` / `displayName` de los `metadata.json`.
- No introduce ningún sistema de métricas alternativo al ya existente.

## Impact

- **`src/1-domain`** (capa 1): `types/pricing.types.ts` (borrado), `interfaces/gateway/IWorkflowResult.ts` (campo eliminado).
- **`src/1-domain/services/gateway`** (capa 1): `build-workflow-result.ts` (propiedad + comentario).
- **`tests/1-domain/gateway`**: `build-workflow-result.test.ts` (una aserción).
- **`routing/providers/*/models/*/metadata.json`** (17 archivos): clave `"costs"` eliminada.
- **`docs/`**: borrado de dos archivos `how-to-calculate-*.md`; limpieza de referencias en `gateway-design.md`.
- **`openspec/specs/`**: deltas MODIFIED en `gateway-closure-services` y `gateway-workflow-lifecycle`.

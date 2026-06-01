## 1. Código — capa de dominio

- [x] 1.1 Borrar `src/1-domain/types/pricing.types.ts`
  - Criterio: el archivo no existe; `npm run typecheck` pasa (no tenía importadores).
- [x] 1.2 Eliminar `totalCostUsd?: number` y su comentario de `src/1-domain/interfaces/gateway/IWorkflowResult.ts` (líneas 18–19)
  - Criterio: la interfaz compila sin el campo.
- [x] 1.3 Eliminar `totalCostUsd: undefined` y el comentario asociado de `src/1-domain/services/gateway/build-workflow-result.ts` (línea 31 y línea 15)
  - Criterio: la función retorna un objeto sin esa propiedad; typecheck pasa.

## 2. Tests

- [x] 2.1 Eliminar la aserción `expect(result.totalCostUsd).toBeUndefined()` de `tests/1-domain/gateway/build-workflow-result.test.ts` (línea 53)
  - Criterio: el test sigue pasando sin esa aserción; `npm run test:quick` verde.

## 3. Routing — datos de precio

- [x] 3.1 Eliminar la clave `"costs"` de los 17 archivos `routing/providers/*/models/*/metadata.json`, conservando `modelId` y `displayName`
  - Archivos: `anthropic/claude-haiku-4-5`, `anthropic/claude-sonnet-4-6`, `anthropic/claude-opus-4-6`, `openrouter/deepseek-v4-flash`, `openrouter/deepseek-v4-pro`, `openrouter/ring-2.6`, `openrouter/kimi-k2.6`, `openrouter/owl-alpha`, `xiaomi/mimo-v2-omni`, `xiaomi/mimo-v2-5`, `xiaomi/mimo-v2-5-pro`, `ollama/gemini-3-flash-preview`, `ollama/minimax-m2.5`, `ollama/minimax-m2.7`, `opencode/minimax-m2.5`, `opencode/ling-2.6-flash`, `opencode/hy3-preview`
  - Criterio: ningún `metadata.json` contiene la clave `"costs"`; `npm run typecheck` pasa.
- [x] 3.2 Eliminar la clave `"pricing_rules"` de `routing/providers/*/config.json`
  - Proveedores: `anthropic`, `minimax`, `ollama`, `openrouter`, `opencode`, `xiaomi`
  - Criterio: ningún `config.json` de proveedor contiene `"pricing_rules"`; `grep -rn pricing_rules routing/providers` sin resultados.

## 4. Sincronización de specs activos

- [x] 4.1 Aplicar el delta MODIFIED de `openspec/changes/remove-token-cost-usd/specs/gateway-closure-services/spec.md` sobre `openspec/specs/gateway-closure-services/spec.md`
  - Criterio: el Requirement "buildWorkflowResult" del spec sincronizado no menciona `totalCostUsd`.
- [x] 4.2 Aplicar el delta MODIFIED de `openspec/changes/remove-token-cost-usd/specs/gateway-workflow-lifecycle/spec.md` sobre `openspec/specs/gateway-workflow-lifecycle/spec.md`
  - Criterio: el Requirement "close" del spec sincronizado no menciona `totalCostUsd`.

## 5. Documentación

- [x] 5.1 Borrar `docs/how-to-calculate-anthropic-api-costs.md`
  - Criterio: el archivo no existe; no quedan enlaces a él en `gateway-design.md`.
- [x] 5.2 Borrar `docs/how-to-calculate-openrouter-api-costs.md`
  - Criterio: ídem.
- [x] 5.3 Limpiar en `docs/proposals/gateway-design.md` todas las referencias a costo en USD
  - Puntos a editar: menciones de `totalCostUsd`, `pricingService.estimate`, `calculateCost`,
    `pricing.types.ts`, y los enlaces a los dos docs borrados en 5.1/5.2.
  - Conservar íntegra la semántica de consumo de tokens (`usage`, agregación por hop,
    `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`).
  - Criterio: `grep -n "totalCostUsd\|pricingService\|calculateCost\|how-to-calculate\|pricing\.types" docs/proposals/gateway-design.md` sin resultados.
- [x] 5.4 Eliminar de `docs/how-to-start.md` los dos enlaces a los docs borrados en 5.1/5.2 (líneas 237-238)
  - Criterio: `grep -n "how-to-calculate" docs/how-to-start.md` sin resultados.

## 6. Gate final

- [x] 6.1 `npm run test:quick` pasa sin errores (lint + typecheck + unit)
- [x] 6.2 `grep -rn "totalCostUsd\|pricing\.types" src tests` sin resultados
- [x] 6.3 Ningún `metadata.json` contiene la clave `"costs"`
- [x] 6.4 Ningún `routing/providers/*/config.json` contiene la clave `"pricing_rules"`

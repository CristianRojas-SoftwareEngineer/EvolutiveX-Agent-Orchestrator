## Context

El gateway registra métricas de consumo de tokens (input / output / caché) correctamente mediante
`IWorkflowResult.usage`, `session-metrics.json` y los servicios de agregación por modelo. Sin embargo,
el diseño histórico también preveía una característica de **costo en USD por uso de tokens** que nunca
llegó a implementarse: es un esqueleto inerte compuesto por tipos TypeScript sin importadores,
un campo `totalCostUsd` siempre `undefined`, datos de precio en archivos `metadata.json` que ningún
servicio lee, y documentación de referencia que describe la fórmula de cálculo.

Esta característica no aporta valor real porque el gateway se usa con proveedores de pago por uso,
planes de tokens y proveedores gratuitos, y el mismo modelo puede costar distinto (o nada) según el
proveedor. Eliminarla ahora evita que contamine las fases P0–P2 pendientes del bloque de persistencia
y simplifica los specs activos.

## Goals / Non-Goals

**Goals:**
- Eliminar completamente el esqueleto de costo en USD: tipos, campo en la interfaz, datos de precio
  en routing y documentación de cálculo.
- Actualizar los specs activos `gateway-closure-services` y `gateway-workflow-lifecycle` para que sus
  contratos no mencionen `totalCostUsd`.
- Dejar `npm run test:quick` verde tras los borrados.

**Non-Goals:**
- No se toca la lógica de consumo de tokens (`usage`, `session-metrics`, agregadores).
- No se introduce ningún sistema de métricas alternativo.
- No se altera el routing ni los campos `modelId` / `displayName` de los `metadata.json`.

## Decisions

### Solo eliminación, sin deprecación

La característica nunca estuvo activa en runtime, por lo que no hay período de transición necesario.
No se usa el patrón `@deprecated` + fecha de retirada; se borra directamente. Esto es coherente con
la política "cero zombie/legacy" del orquestador de migración.

### Change standalone, fuera del registro de fases de `gateway-migration`

La eliminación del esqueleto de costo no pertenece a ninguna fase de la migración del layout de disco
(bloques C/G/P). Es un change de limpieza que libera el terreno antes del bloque P. No se inscribe
en el registro de fases del orquestador, aunque su `proposal.md` menciona la coordinación.

### Conservar `metadata.json`, eliminar solo la clave `"costs"`

Los archivos `routing/providers/*/models/*/metadata.json` contienen `modelId` y `displayName`, útiles
para routing y presentación de statusline. Solo la clave `"costs"` (datos de precio) es el objetivo;
los archivos se conservan sin ella.

## Inventario de eliminación

| Artefacto | Acción | Motivo |
|---|---|---|
| `src/1-domain/types/pricing.types.ts` | Borrar archivo | Sin importadores; tipos de costo no usados |
| `IWorkflowResult.totalCostUsd?: number` | Eliminar campo + comentario | Siempre `undefined`; característica retirada |
| `build-workflow-result.ts:31` | Eliminar propiedad + comentario | Inicialización del campo eliminado |
| `build-workflow-result.test.ts:53` | Eliminar aserción | Test del campo eliminado |
| `routing/**/metadata.json` (17 archivos) | Eliminar clave `"costs"` | Ningún servicio la consume |
| `docs/how-to-calculate-anthropic-api-costs.md` | Borrar archivo | Trata exclusivamente de costo en USD |
| `docs/how-to-calculate-openrouter-api-costs.md` | Borrar archivo | Trata exclusivamente de costo en USD |
| `docs/proposals/gateway-design.md` | Limpiar referencias a costo | `totalCostUsd`, `pricingService.estimate`, `calculateCost`, enlaces a docs de cálculo, mención de `pricing.types.ts`; preservar semántica de `usage` |
| `openspec/specs/gateway-closure-services/spec.md` | Sync tras apply | Cláusula `totalCostUsd undefined` del contrato de `buildWorkflowResult` |
| `openspec/specs/gateway-workflow-lifecycle/spec.md` | Sync tras apply | Bullet `totalCostUsd: undefined` del requirement `close` |

## Risks / Trade-offs

- **Riesgo: referencia olvidada en `gateway-design.md`** — el documento es extenso (~3200 líneas) y
  tiene múltiples menciones dispersas. Mitigación: grep específico tras editar (`totalCostUsd`,
  `pricingService`, `calculateCost`, `how-to-calculate`, `pricing.types`) para confirmar limpieza.
- **Riesgo: `metadata.json` sin `"costs"` quiebra algún consumidor futuro** — hoy ningún servicio
  lee la clave; el riesgo es teórico. Mitigación: typecheck pasa sin el campo ya que `ILanguageModel`
  no lo incluye; lint detectaría referencias rotas.

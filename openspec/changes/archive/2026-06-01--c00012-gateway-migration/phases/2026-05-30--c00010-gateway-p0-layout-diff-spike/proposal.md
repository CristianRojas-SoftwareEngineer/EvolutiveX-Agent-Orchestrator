> **Orquestador:** `gateway-migration` | **Fase:** p0 (P)

## Why

El bloque P (Persistencia) necesita reescribir la proyección a disco del layout de sesiones. Antes de que P1 ejecute la pila `EventBus` + `SessionPersistence` (Opción A ratificada, §28b/§40), es necesario confirmar las ubicaciones concretas de código en `src/` para cada componente, los puntos de emisión del correlador, el ownership del timer, la estrategia de composition root y el corte limpio. Sin este spike, P1 tendría que resolver ambigüedades de implementación durante la fase de código, con riesgo de retrabajo.

El diseño del layout objetivo (`causal-workflows-v1`) ya está fijado por las decisiones D1/D2/D3 del orquestador: `output/result.json`, fusión de `state.json` en `meta.json`, schemas de §33.3 y §33.4b. Este spike no reabre esas decisiones.

## What Changes

- **Spike de análisis documentado** en `openspec/changes/archive/2026-06-01--c00012-gateway-migration/phases/2026-05-30--c00010-gateway-p0-layout-diff-spike/design.md` que cubre 5 entregables:
  1. Inventario de componentes §28b/§40 con archivo destino propuesto en `src/` y fase (P1 o P2).
  2. Puntos de emisión del correlador: para cada método de mutación de `WorkflowRepositoryService`, el evento de §28b.3 que emite.
  3. Confirmación del ownership del timer de timeout en el correlador (§24.1/G19); `SessionPersistence` no implementa timer propio.
  4. Estrategia de cableado en composition root (capa 4, §42): dónde crear `EventBus`, cómo inyectarlo en el correlador y en `SessionPersistence`.
  5. Estrategia de corte limpio: eliminación de `sessions/` anterior antes del cambio de layout.

- **Actualización de §28b, §40, §42** de `docs/proposals/gateway-design.md` para reflejar las confirmaciones del spike.

No se implementa código. No se crea la pila `EventBus` + `SessionPersistence`; eso es trabajo de P1.

## Capabilities

### New Capabilities
_— Ninguna. Este es un spike de análisis, no introduce comportamiento nuevo._

### Modified Capabilities
_— Ninguna. No cambia requisitos de specs existentes._

## Impact

- **Affected directories:** `openspec/changes/archive/2026-06-01--c00012-gateway-migration/phases/2026-05-30--c00010-gateway-p0-layout-diff-spike/` (archivado), `docs/proposals/gateway-design.md` (§28b, §40, §42 actualizados).
- **PKA layers afectadas:** ninguna directamente (spike documental); las capas afectadas por la implementación resultante son 1-domain (IEventBus, tipos), 2-services (EventBus, SessionPersistence, correlador con emisión), 4-api (composition root).
- **Dependencias:** G4 debe estar `validada` o `archivada` en el registro del orquestador antes de iniciar este change.
- **Legacy:** este spike no retira código; el retiro de `audit-writer.service.ts`, `session-store.service.ts`, `workflow-result-projector.service.ts` y tipos legacy (`ActiveInteraction`, `InteractionMetadata`) es trabajo de P1.

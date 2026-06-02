## ADDED Requirements

### Requirement: El spike de P0 SHALL cubrir los 5 criterios del DoD

El documento de spike (`design.md` del change archivado `archive/2026-06-01-gateway-migration/phases/2026-05-30-gateway-p0-layout-diff-spike`) SHALL incluir las 5 secciones que corresponden a los criterios de aceptación de P0 definidos en el bloque P0 del orquestador `gateway-migration` (`tasks.md`).

#### Scenario: Inventario de componentes documentado
- **WHEN** se lee el spike de P0
- **THEN** existe una tabla que lista cada componente de §28b/§40 con su archivo destino propuesto en `src/` y su fase (P1 o P2)

#### Scenario: Puntos de emisión documentados
- **WHEN** se lee el spike de P0
- **THEN** existe una tabla que mapea cada método de mutación de `WorkflowRepositoryService` a su evento correspondiente del catálogo §28b.3

#### Scenario: Ownership del timer confirmado
- **WHEN** se lee el spike de P0
- **THEN** existe una sección que confirma que el timer de timeout de `ToolUse` permanece en el correlador (§24.1/G19) y que `SessionPersistence` no implementa timer propio

#### Scenario: Composition root documentado
- **WHEN** se lee el spike de P0
- **THEN** existe una sección que describe la estrategia de cableado en `composition-root.ts` (capa 4, §42): creación de `EventBus`, inyección en el correlador e inyección en `SessionPersistence`

#### Scenario: Corte limpio documentado
- **WHEN** se lee el spike de P0
- **THEN** existe una sección que especifica la estrategia de eliminación de `sessions/` anterior antes del cambio de layout

### Requirement: El spike SHALL referenciar las decisiones D1/D2/D3 del orquestador

El spike SHALL documentar que el diseño del layout objetivo ya está fijado por las decisiones D1/D2/D3 del orquestador `gateway-migration`, y que este spike no reabre esas decisiones.

#### Scenario: Decisiones referenciadas
- **WHEN** se lee el spike de P0
- **THEN** se mencionan las decisiones D1 (output/result.json), D2 (fusión state.json→meta.json) y D3 (separación meta.json vs output/result.json) como diseño fijado

### Requirement: El spike SHALL enlazar secciones de `gateway-design.md` sin copiar contenido

El spike SHALL referenciar §28b, §40, §42, §24.1 y §28b.3 de `docs/proposals/gateway-design.md` por sección, sin copiar contenido extenso.

#### Scenario: Referencias por sección
- **WHEN** se lee el spike de P0
- **THEN** las referencias a `gateway-design.md` son por sección (§28b, §40, §42, §24.1, §28b.3) y no se copia contenido extenso del documento de diseño

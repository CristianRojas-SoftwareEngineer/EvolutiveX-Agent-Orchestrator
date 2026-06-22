# statusline-runtime delta — add-statusline-router-details-toggle

## ADDED Requirements

### Requirement: Visibilidad condicional de la Tabla 2

`buildStatuslineOutput` SHALL renderizar la Tabla 2 ("Steps y consumo de tokens por
nivel") únicamente cuando `settingsEnv.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS`
tenga el valor exacto `on` (case-insensitive, trim). En cualquier otro caso (valor
ausente, `off`, o cualquier otro string) la Tabla 2 SHALL omitirse por completo del
output: no se calcula `targetWidth`, no se llama a `renderTokenTable`, no se escribe
el cache de métricas y el string de salida NO incluye ninguna línea de dicha tabla.

#### Scenario: Variable en on — Tabla 2 visible

- **WHEN** `settingsEnv.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **THEN** `buildStatuslineOutput` SHALL incluir la Tabla 2 en el output devuelto
- **AND** el bloque superior (Tabla 1 y, si aplica, Tabla 3) SHALL renderizarse con normalidad

#### Scenario: Variable ausente — Tabla 2 oculta

- **WHEN** `settingsEnv` no contiene la clave `EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS`
- **THEN** el output SHALL NOT contener la Tabla 2
- **AND** el bloque superior SHALL estar presente e intacto

#### Scenario: Variable en off — Tabla 2 oculta

- **WHEN** `settingsEnv.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"off"`
- **THEN** el output SHALL NOT contener la Tabla 2
- **AND** el bloque superior SHALL estar presente e intacto

#### Scenario: Variable con valor desconocido — Tabla 2 oculta

- **WHEN** `settingsEnv.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` tiene un valor distinto de `"on"` (p. ej. `"1"`, `"true"`, `"yes"`)
- **THEN** el output SHALL NOT contener la Tabla 2

#### Scenario: Tabla 2 oculta — bloque superior sin alteraciones

- **GIVEN** `EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` no es `"on"`
- **WHEN** el método de auth es `oauth` con cuotas disponibles
- **THEN** el output SHALL contener Tabla 1 y Tabla 3 renderizadas side-by-side, igual que si Tabla 2 estuviera visible

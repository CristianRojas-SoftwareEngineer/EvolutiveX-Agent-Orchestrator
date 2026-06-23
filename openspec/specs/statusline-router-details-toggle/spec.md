# statusline-router-details-toggle Specification

## Purpose

Comportamiento de la CLI `scripting/provider/statusline-router-details.ts` para activar,
desactivar o invertir la visibilidad de la Tabla 2 del statusline, persistiendo el
estado en el bloque `env` de `~/.claude/settings.json` bajo la clave
`EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS`.

## Requirements

### Requirement: Activar visibilidad de Tabla 2

La CLI SHALL escribir `on` en `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS`
al ejecutar el subcomando `on`, preservando todas las demás claves del bloque `env`.

#### Scenario: Subcomando on — variable ausente

- **WHEN** `settings.env` no contiene `EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS`
- **AND** se ejecuta `statusline-router-details.ts on`
- **THEN** el archivo `settings.json` SHALL contener `"EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS": "on"`
- **AND** las demás claves del bloque `env` SHALL permanecer sin cambios

#### Scenario: Subcomando on — variable ya en on

- **WHEN** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **AND** se ejecuta `statusline-router-details.ts on`
- **THEN** el archivo SHALL seguir conteniendo `"EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS": "on"`

#### Scenario: Subcomando on — variable en off

- **WHEN** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"off"`
- **AND** se ejecuta `statusline-router-details.ts on`
- **THEN** el archivo SHALL contener `"EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS": "on"`

### Requirement: Desactivar visibilidad de Tabla 2

La CLI SHALL escribir `off` en `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS`
al ejecutar el subcomando `off`, preservando todas las demás claves del bloque `env`.

#### Scenario: Subcomando off — variable en on

- **WHEN** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **AND** se ejecuta `statusline-router-details.ts off`
- **THEN** el archivo SHALL contener `"EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS": "off"`

#### Scenario: Subcomando off — variable ausente

- **WHEN** `settings.env` no contiene la clave
- **AND** se ejecuta `statusline-router-details.ts off`
- **THEN** el archivo SHALL contener `"EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS": "off"`

### Requirement: Invertir visibilidad de Tabla 2 (toggle)

La CLI SHALL invertir el valor de `EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` al
ejecutar el subcomando `toggle`: `on` → `off`; cualquier otro valor o ausente → `on`.

#### Scenario: Toggle desde on

- **WHEN** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"on"`
- **AND** se ejecuta `statusline-router-details.ts toggle`
- **THEN** el archivo SHALL contener `"EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS": "off"`

#### Scenario: Toggle desde off

- **WHEN** `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` es `"off"`
- **AND** se ejecuta `statusline-router-details.ts toggle`
- **THEN** el archivo SHALL contener `"EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS": "on"`

#### Scenario: Toggle desde ausente

- **WHEN** `settings.env` no contiene la clave
- **AND** se ejecuta `statusline-router-details.ts toggle`
- **THEN** el archivo SHALL contener `"EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS": "on"`

### Requirement: Dry-run no escribe en settings.json

La CLI SHALL aceptar la opción `--dry-run` en cualquier subcomando y, cuando esté
activa, SHALL imprimir el valor que se escribiría sin modificar `settings.json`.

#### Scenario: Dry-run con on

- **WHEN** se ejecuta `statusline-router-details.ts on --dry-run`
- **THEN** la CLI SHALL imprimir el valor resultante (`on`) sin modificar el archivo

#### Scenario: Dry-run con toggle

- **WHEN** se ejecuta `statusline-router-details.ts toggle --dry-run`
- **THEN** la CLI SHALL imprimir el valor que resultaría de invertir el estado actual
- **AND** `settings.json` SHALL permanecer sin cambios

### Requirement: Preservar otras claves de settings.env

La CLI SHALL realizar un merge no destructivo: al actualizar la clave de toggle,
todas las demás claves de `env` (e.g. `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`, `ANTHROPIC_*`) y
del resto de `settings.json` SHALL conservarse intactas.

#### Scenario: Escritura con claves preexistentes

- **WHEN** `settings.env` contiene `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` y otras claves
- **AND** se ejecuta cualquier subcomando de la CLI
- **THEN** esas claves SHALL seguir presentes en `settings.json` tras la escritura

# provider-env-config Specification

## Purpose

Gestión de variables de entorno de modelos por nivel (`ANTHROPIC_DEFAULT_*_MODEL`) en `configure-provider`, catálogo de providers y propagación al harness headless.

## Requirements

### Requirement: ANTHROPIC_DEFAULT_FABLE_MODEL en variables gestionadas

El sistema SHALL incluir `ANTHROPIC_DEFAULT_FABLE_MODEL` en `MANAGED_ENV_VARS` de `scripting/shared/provider-config.ts`, en el tipo `ProviderConfig`, y en el ciclo de lectura/escritura de `configure-provider.ts` (mostrar estado, aplicar config, verificar, eliminar en `default`).

El orden canónico en `MANAGED_ENV_VARS` SHALL ser: haiku, sonnet, opus, **fable**, `CLAUDE_CODE_SUBAGENT_MODEL`.

#### Scenario: configure-provider anthropic escribe Fable

- **GIVEN** `routing/providers/anthropic/config.json` define `ANTHROPIC_DEFAULT_FABLE_MODEL`
- **WHEN** el usuario ejecuta `configure-provider anthropic`
- **THEN** `~/.claude/settings.json → env` SHALL contener `ANTHROPIC_DEFAULT_FABLE_MODEL` con el valor resuelto del config del provider

#### Scenario: configure-provider default elimina Fable

- **GIVEN** `ANTHROPIC_DEFAULT_FABLE_MODEL` está presente en settings
- **WHEN** el usuario ejecuta `configure-provider default`
- **THEN** `ANTHROPIC_DEFAULT_FABLE_MODEL` SHALL eliminarse junto con las demás variables gestionadas

#### Scenario: show-current lista Fable

- **WHEN** el usuario ejecuta `configure-provider --show-current`
- **THEN** la salida SHALL listar `ANTHROPIC_DEFAULT_FABLE_MODEL` con su valor o indicar que no está configurada

### Requirement: Catálogo anthropic incluye Fable 5

El provider `anthropic` SHALL declarar Fable 5 en su configuración y catálogo de modelos:

- `routing/providers/anthropic/config.json` SHALL incluir `ANTHROPIC_DEFAULT_FABLE_MODEL` apuntando al modelo del catálogo (misma convención de ruta que haiku/sonnet/opus).
- SHALL existir `routing/providers/anthropic/models/claude-fable-5/metadata.json` con `modelId` y `displayName` para resolución de nombre en Tabla 2.

#### Scenario: metadata Fable resuelve display name

- **GIVEN** `ANTHROPIC_DEFAULT_FABLE_MODEL` resuelve a un `modelId` que incluye `claude-fable-5`
- **AND** existe `metadata.json` con `displayName: "Fable 5"`
- **WHEN** el statusline carga el nombre de display para la fila Frontier vacía o agregada
- **THEN** SHALL mostrar `Fable 5` (o el `displayName` del metadata)

#### Scenario: config anthropic paridad con tres niveles previos

- **GIVEN** el archivo `routing/providers/anthropic/config.json` del repositorio
- **WHEN** se inspeccionan las claves `ANTHROPIC_DEFAULT_*_MODEL`
- **THEN** SHALL existir entrada para haiku, sonnet, opus y fable

### Requirement: Headless harness propaga Fable

`buildIsolatedProviderEnv` SHALL propagar `ANTHROPIC_DEFAULT_FABLE_MODEL` desde `loadProviderConfig` al `claudeEnv` del harness headless mediante el mismo loop sobre `MANAGED_ENV_VARS` que las demás variables gestionadas.

#### Scenario: Provider anthropic aislado incluye Fable en claudeEnv

- **GIVEN** un provider `anthropic` con `ANTHROPIC_DEFAULT_FABLE_MODEL` en su `config.json`
- **WHEN** `buildIsolatedProviderEnv('anthropic', port)` se invoca
- **THEN** `claudeEnv.ANTHROPIC_DEFAULT_FABLE_MODEL` SHALL igualar el valor del config del provider

## ADDED Requirements

### Requirement: Escaneo stateless del siguiente identificador

El módulo `scripting/openspec/change-id.ts` SHALL exponer `computeNextChangeId(changesDir)` que:

1. Liste los directorios activos bajo `<changesDir>/` excluyendo `archive/` y `.gitkeep`.
2. Liste los directorios bajo `<changesDir>/archive/`.
3. Para cada nombre de directorio, normalice descontando el prefijo `YYYY-MM-DD--` (regex `^\d{4}-\d{2}-\d{2}--`).
4. Extraiga el entero del prefijo `c` con regex `^c(\d+)` sobre el nombre normalizado.
5. Tome el máximo (0 si ninguno coincide) y devuelva `c` + entero incrementado con relleno de ceros a 5 dígitos.

#### Scenario: Archivo con prefijo de fecha cuenta para el máximo

- **GIVEN** `openspec/changes/archive/2026-06-16--c00069-remove-log-http-level/` existe
- **AND** no hay changes activos con prefijo `c`
- **WHEN** se invoca `computeNextChangeId`
- **THEN** el resultado es `c00070`

#### Scenario: Sin changes con prefijo c devuelve c00001

- **GIVEN** `openspec/changes/` solo contiene `archive/` con deltas sin prefijo `c` (p. ej. `2026-06-01-gateway-migration` sin segmento `c<NNNNN>`)
- **WHEN** se invoca `computeNextChangeId`
- **THEN** el resultado es `c00001`

#### Scenario: Nombres que no empiezan por c se ignoran

- **GIVEN** un directorio activo `add-auth` sin prefijo `c`
- **WHEN** se invoca `computeNextChangeId`
- **THEN** ese directorio no incrementa el máximo numérico

### Requirement: Script npm next-change-id

`npm run openspec:next-change-id` SHALL imprimir en stdout únicamente el siguiente identificador (`c<NNNNN>`, sin slug) y salir con código 0.

#### Scenario: Invocación exitosa

- **WHEN** se ejecuta `npm run openspec:next-change-id` desde la raíz del repo
- **THEN** stdout contiene exactamente una línea con el patrón `^c\d{5}$`
- **AND** el proceso termina con código 0

### Requirement: Verificación de unicidad del identificador numérico

El módulo SHALL exponer `findDuplicateChangeIds(changesDir)` que devuelve grupos de directorios que comparten el mismo entero `c<NNNNN>` (tras normalizar fecha). `npm run openspec:verify-change-id -- --change <name>` SHALL fallar con código 1 si el entero de `<name>` aparece en más de un directorio.

#### Scenario: Colisión detectada

- **GIVEN** existen `archive/2026-06-16--c00001-foo` y `archive/2026-06-16--c00001-bar`
- **WHEN** se ejecuta `npm run openspec:verify-change-id -- --change c00001-foo`
- **THEN** el proceso termina con código 1
- **AND** stderr describe ambos directorios en conflicto

#### Scenario: Sin colisión

- **GIVEN** el entero `c00068` aparece solo en el change archivado `c00068-fix-change-id-increment`
- **WHEN** se ejecuta `npm run openspec:verify-change-id -- --change c00068-fix-change-id-increment`
- **THEN** el proceso termina con código 0

### Requirement: create-specification-delta invoca el script canónico

La skill `create-specification-delta` SHALL derivar el prefijo `c<NNNNN>` ejecutando `npm run openspec:next-change-id` y usando su stdout como única fuente del entero; no SHALL reimplementar el escaneo inline.

#### Scenario: Mint delegado al script

- **WHEN** un agente sigue la skill `create-specification-delta` para un slug `my-feature`
- **THEN** ejecuta `npm run openspec:next-change-id` antes de `openspec new change`
- **AND** compone el nombre `c<NNNNN>-my-feature` con el valor impreso

### Requirement: verify-specification-delta gate de unicidad CRITICAL

La skill `verify-specification-delta` SHALL ejecutar `npm run openspec:verify-change-id -- --change <name>` como parte del gate. Una salida distinta de 0 SHALL reportarse como **CRITICAL** y bloquear el pipeline.

#### Scenario: Gate bloquea colisión

- **GIVEN** dos directorios comparten el mismo entero `c<NNNNN>`
- **WHEN** verify ejecuta el gate de unicidad para cualquiera de ellos
- **THEN** el veredicto del gate es FAIL con severidad CRITICAL

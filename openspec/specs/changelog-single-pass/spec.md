# Spec: changelog-single-pass

## Requirement: single-git-log-invocation
El script `scripting/generate-changelog` lee el historial git en exactamente una invocación de `git log`, independientemente del número de tags de versión y del número de secciones del changelog.

#### Scenario: historial sin tags
- **WHEN** se ejecuta `scripting/generate-changelog` en un repo sin tags de versión
- **THEN** se invoca `git log` exactamente una vez y se produce la sección `[Unreleased]` con todas las entradas clasificadas

#### Scenario: historial con múltiples tags
- **WHEN** se ejecuta `scripting/generate-changelog` en un repo con N tags de versión
- **THEN** se invoca `git log` exactamente una vez; el script detecta los límites de cada release a partir de los refs incluidos en la salida de esa única invocación; la fecha de cada release se obtiene del campo `%as` de esa misma pasada

---

## Requirement: in-memory-classification
La clasificación de commits por sección (Added / Changed / Fixed / Documentation) ocurre en memoria durante el procesamiento de la única pasada de `git log`, sin invocaciones adicionales de subprocesos git por sección o por tag.

#### Scenario: commit con tipo mapeado
- **WHEN** la salida de `git log` incluye un subject con prefijo `feat:`, `feat(<scope>):`, `fix:`, `fix(<scope>):`, `perf:`, `refactor:`, `docs:` (con o sin scope, con o sin `!`)
- **THEN** el commit se clasifica en la sección correspondiente (Added / Fixed / Changed / Documentation) durante la misma pasada

#### Scenario: commit con tipo no mapeado
- **WHEN** la salida de `git log` incluye un subject con prefijo `chore:`, `test:`, `build:`, `ci:`, `style:`, o cualquier prefijo no reconocido
- **THEN** el commit se descarta silenciosamente; no aparece en `CHANGELOG.md`

---

## Requirement: no-legacy-arguments
El script no acepta ni procesa los argumentos `--pending` ni `--case`. Si se pasan, el script termina con error y mensaje descriptivo.

#### Scenario: argumento heredado pasado
- **WHEN** se invoca el script con cualquier flag (`--pending "msg"`, `--case X`, o cualquier otro)
- **THEN** el script imprime `"Error: argumento eliminado: el script no acepta flags"` en stderr y termina con exit code 1

---

## Requirement: no-case-trailer
El script no lee ni emite el trailer `Case:` de los commits. La columna `(Case: X)` no aparece en ninguna entrada del `CHANGELOG.md` generado.

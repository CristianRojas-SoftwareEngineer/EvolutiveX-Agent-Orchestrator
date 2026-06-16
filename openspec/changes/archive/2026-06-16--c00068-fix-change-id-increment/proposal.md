## Why

Dos specification-deltas archivados compartían el identificador `c00001` porque el escaneo stateless del prefijo incremental no descontaba el prefijo de fecha `YYYY-MM-DD--` del archivado. Sin una utilidad canónica ni un gate de verificación, el error puede repetirse silenciosamente.

## What Changes

- Renombrar el archivado duplicado y normalizar el inventario archivado (raíz y fases L2) al formato `YYYY-MM-DD--c<NNNNN>-<slug>` con reenumeración cronológica global.
- Añadir utilidad TypeScript (`scripting/openspec/`) que implemente el algoritmo de escaneo stateless y scripts npm (`openspec:next-change-id`, `openspec:verify-change-id`).
- Actualizar la skill `create-specification-delta` para invocar obligatoriamente el script canónico y documentar el algoritmo con pseudocódigo y contraejemplo.
- Añadir gate CRITICAL en `verify-specification-delta` para colisiones de `c<NNNNN>` entre directorios activos y archivados (normalizando fecha).
- Tests unitarios del escaneo y del gate de unicidad.

## Capabilities

### New Capabilities

- `specification-delta-change-id`: utilidad canónica de derivación del siguiente `c<NNNNN>` y verificación de unicidad del identificador numérico.

### Modified Capabilities

- (ninguna — el cambio es tooling del pipeline, no comportamiento de producto)

## Impact

- `scripting/openspec/` (nuevo módulo)
- `package.json` (scripts npm)
- `tests/scripting/openspec/`
- `.claude/skills/create-specification-delta/SKILL.md`
- `.claude/skills/verify-specification-delta/SKILL.md`
- `docs/specification-delta-workflow.md` (referencia al script canónico)
- `openspec/changes/archive/` (renombrado del delta duplicado)

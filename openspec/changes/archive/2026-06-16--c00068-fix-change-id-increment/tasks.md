## 1. Remediación del archivado duplicado

- [x] 1.1 Confirmar que `openspec/changes/archive/2026-06-16--c00069-remove-log-http-level/` existe y el nombre `c00001-remove-log-http-level` ya no aparece bajo `archive/`

## 2. Módulo canónico change-id

- [x] 2.1 Crear `scripting/openspec/change-id.ts` con normalización de fecha, parseo `c<NNNNN>`, `computeNextChangeId` y `findDuplicateChangeIds`
- [x] 2.2 Crear `scripting/openspec/next-change-id.ts` (CLI stdout)
- [x] 2.3 Crear `scripting/openspec/verify-change-id.ts` (CLI con `--change`)

## 3. Scripts npm

- [x] 3.1 Añadir `openspec:next-change-id` y `openspec:verify-change-id` a `package.json`

## 4. Tests

- [x] 4.1 Crear `tests/scripting/openspec/change-id.test.ts` con escenarios de spec (fecha, ignorar no-c, colisión, siguiente id)

## 5. Skills del pipeline

- [x] 5.1 Actualizar `create-specification-delta/SKILL.md`: invocación obligatoria al script, pseudocódigo y contraejemplo
- [x] 5.2 Actualizar `verify-specification-delta/SKILL.md`: gate CRITICAL de unicidad

## 6. Documentación

- [x] 6.1 Actualizar `docs/specification-delta-workflow.md` para referenciar `npm run openspec:next-change-id` como fuente canónica del incremento

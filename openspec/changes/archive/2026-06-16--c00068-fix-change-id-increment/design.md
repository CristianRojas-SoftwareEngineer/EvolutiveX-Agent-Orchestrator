## Context

El identificador `c<NNNNN>-<slug>` se deriva por escaneo stateless documentado en `docs/specification-delta-workflow.md` y en `create-specification-delta`. El fallo observado: al archivar, el directorio pasa a `YYYY-MM-DD--c<NNNNN>-<slug>`; un escaneo naive con `^c(\d+)` sobre el nombre crudo del directorio no encuentra el prefijo y concluye erróneamente que el máximo es 0.

## Goals / Non-Goals

**Goals:**

- Una implementación canónica, testeada y reutilizable del escaneo.
- Invocación obligatoria desde `create-specification-delta`.
- Gate CRITICAL en `verify-specification-delta`.
- Remediar el archivado duplicado `c00001-remove-log-http-level` → `c00002`.

**Non-Goals:**

- Contador persistente o base de datos.
- Cambiar la convención de nombres de OpenSpec.
- Migrar deltas legacy sin prefijo `c`.

## Decisions

### 1. Módulo `scripting/openspec/change-id.ts`

Funciones puras sobre el filesystem:

- `stripArchiveDatePrefix(dirName)` — quita `YYYY-MM-DD--` si aplica.
- `parseChangeNumericId(dirName)` — devuelve el entero o `null`.
- `collectChangeDirectories(changesDir)` — lista `{ rawName, normalizedName, numericId, relativePath }`.
- `computeNextChangeId(changesDir)` — algoritmo documentado.
- `findDuplicateChangeIds(changesDir)` — agrupa por `numericId` cuando hay >1 entrada.

CLIs delgados: `next-change-id.ts` (stdout del id) y `verify-change-id.ts` (exit 1 si colisión para el change dado).

### 2. Scripts npm

```json
"openspec:next-change-id": "tsx scripting/openspec/next-change-id.ts",
"openspec:verify-change-id": "tsx scripting/openspec/verify-change-id.ts"
```

### 3. Skill create-specification-delta

Reemplazar el algoritmo inline por invocación de `npm run openspec:next-change-id`. Añadir pseudocódigo explícito y contraejemplo: escanear `2026-06-16--c00001-foo` sin normalizar **no** coincide con `^c(\d+)` → máximo erróneo 0 → siguiente `c00001` de nuevo.

### 4. Skill verify-specification-delta

Nueva sección «Change id uniqueness gate» antes del test gate: ejecutar `npm run openspec:verify-change-id -- --change <name>`; exit ≠ 0 → CRITICAL.

### 5. Remediación del archivado

Renombrar archivados al formato `YYYY-MM-DD--c<NNNNN>-<slug>` (incluidas fases bajo `phases/`). Sin referencias externas rotas al nombre antiguo en el repo.

## Risks / Trade-offs

- **[Riesgo]** El script y la skill pueden divergir si alguien edita solo uno → **Mitigación**: la skill prohíbe escaneo inline; tests cubren el algoritmo.
- **[Trade-off]** Deltas legacy sin `c` no participan en el incremento → aceptado (convención nueva).

## Migration Plan

1. Renombrar archivado duplicado.
2. Añadir módulo + tests + scripts.
3. Actualizar skills y documentación.
4. Verificar con `npm test`.

## Legacy Retirement Strategy

No hay legacy de código productivo. El algoritmo inline en la skill `create-specification-delta` queda reemplazado por invocación al script; el escaneo manual del agente queda prohibido por la skill actualizada.

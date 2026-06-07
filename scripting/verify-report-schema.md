# Esquema del reporte JSON de `verify:package-scripts`

Este documento describe la forma del archivo `verify-report.json` que el script
`scripting/verify-package-scripts.ts` escribe tras cada ejecución. El reporte es
el contrato que el comando `/verify-scripts` lee para componer la tabla
markdown en español.

## Versionado

El campo `schemaVersion` (entero positivo) identifica la versión del esquema.
Cualquier cambio incompatible con la forma del JSON requiere incrementar este
valor. Los consumidores deben rechazarlo si su valor esperado no coincide.

**Versión actual: `1`**.

## Forma del documento

```jsonc
{
  "schemaVersion": 1,
  "startedAt": "2026-06-07T12:34:56.789Z",   // ISO-8601 (UTC)
  "finishedAt": "2026-06-07T12:36:11.234Z",  // ISO-8601 (UTC)
  "steps": [
    {
      "id": "help",                            // string — VerifyStep.id
      "script": "help",                        // string — package.json script name (vacío para comandos bare)
      "kind": "blocking",                      // blocking | background | destructive | restore
      "status": "pass",                        // pass | fail | skip
      "durationMs": 1234,                      // integer ≥ 0
      "failureReason": null,                   // string | null
      "skippedReason": null                    // string | null (presente solo si status === "skip")
    }
  ],
  "coverage": {
    "declaredInConfig": ["help", "lint", ...],         // string[] — ids de VERIFY_STEPS
    "declaredInPackageJson": ["help", "lint", ...],    // string[] — nombres de scripts en package.json
    "missingFromConfig": ["statusline:router-details:on", ...],   // scripts en package.json que ningún paso referencia
    "missingFromPackageJson": ["install:statusline", ...]         // scripts referenciados por un paso que no existen en package.json
  },
  "failures": [
    {
      "stepId": "lint",                        // string
      "reason": "Comando salió con código 2."  // string
    }
  ],
  "workspaceState": {
    "nodeModulesRestored": true,               // boolean — true si node_modules/ existe al terminar
    "buildArtifactsPresent": true,             // boolean — true si dist/index.js existe al terminar
    "destructiveStepsRan": ["clean-dist", "clean:modules", ...]  // string[] — ids de pasos kind=destructive que efectivamente ejecutaron
  }
}
```

## Semántica por campo

| Campo | Significado |
|---|---|
| `steps[].status === "pass"` | El comando subyacente salió con código 0 **y** el verificador (si existe) devolvió sin lanzar. |
| `steps[].status === "fail"` | El comando subyacente salió con código ≠ 0 **o** el verificador lanzó. `failureReason` contiene el mensaje. |
| `steps[].status === "skip"` | El paso tiene `skip: true` en la config **o** una dependencia `dependsOn` no se satisfizo. `skippedReason` contiene la razón. |
| `coverage.missingFromConfig` | Scripts declarados en `package.json` que ningún `VerifyStep` referencia. Es drift **legítimo** (scripts que la pipeline no sabe verificar). |
| `coverage.missingFromPackageJson` | Scripts referenciados por un `VerifyStep` que ya no existen en `package.json`. Es drift **crítico** que requiere remediación. |
| `workspaceState.destructiveStepsRan` | Lista de ids de pasos `kind: destructive` que **efectivamente ejecutaron** (no fueron skipped). El comando la usa para decidir si correr `npm install` post-condición. |

## Exit codes del script

| Código | Significado |
|---|---|
| `0` | Todos los pasos no-skip pasaron. Drift de cobertura es informativo, no afecta el código. |
| `1` | Al menos un paso no-skip falló. |
| `2` | Sólo con `--strict-coverage` y `coverage.missingFromPackageJson.length > 0`. Indica drift crítico (paso referencia script inexistente). |

## Compatibilidad con el comando

`.claude/commands/verify-scripts.md` lee este archivo y deriva la tabla markdown
y la línea de resumen. Cambios incompatibles al esquema requieren actualizar
el comando en el mismo change que incremente `schemaVersion`.

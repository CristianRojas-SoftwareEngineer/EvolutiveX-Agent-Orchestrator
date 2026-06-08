---
name: verify-coverage-drift-2026-06
description: missingFromConfig y missingFromPackageJson en verify-report.json son el mecanismo de auditoría de drift en la verify-pipeline; se resuelven editando scripting/verify-config.ts.
metadata:
  type: reference
  component: scripting/verify-config.ts
  defect-class: drift
---

# Lección: Cobertura de drift en verify-pipeline

## Problema

Cuando `scripting/verify-config.ts` se usó como fuente de verdad para la pipeline de verificación, reveló drift bidireccional:

- `missingFromPackageJson`: entradas en `VERIFY_STEPS` referencian scripts que ya no existen en `package.json`.
- `missingFromConfig`: scripts declarados en `package.json` que ningún paso de `VERIFY_STEPS` referencia.

## Mecanismo de auditoría

El script `scripting/verify-package-scripts.ts` calcula la cobertura en cada ejecución:

```typescript
function computeCoverage(steps: VerifyStep[], packageScripts: string[]): CoverageReport {
  const referencedScripts = new Set(steps.filter(s => s.script).map(s => s.script));
  const packageSet = new Set(packageScripts);
  const configSet = new Set(Array.from(referencedScripts));
  return {
    missingFromConfig: packageScripts.filter(s => !configSet.has(s)),       // drift legítimo
    missingFromPackageJson: Array.from(referencedScripts).filter(s => !packageSet.has(s)),  // drift crítico
  };
}
```

`missingFromConfig` = drift **legítimo** (scripts que la pipeline no sabe verificar aún).
`missingFromPackageJson` = drift **crítico** (pasos que referencian scripts ausentes — requieren remediación).

## Resolución

- **Opción A (eliminar)**: borrar entradas con `skip: true` que referencian scripts ausentes de `package.json`. Rápida, limpia.
- **Opción B (restaurar)**: devolver los scripts a `package.json`. Solo si los scripts siguen siendo válidos.
- **Añadir cobertura**: crear nuevas entradas en `VERIFY_STEPS` para los scripts en `missingFromConfig`.

## Scripts verificados en el change 2026-06-07

Los scripts `setup:install`, `setup:uninstall`, `statusline:router-details:on/off/toggle` fueron cubiertos con `kind: 'blocking'` y `verifier: 'expect-stdout'`, todos usando `--dry-run` para evitar efectos secundarios.

## Nota sobre clean:modules en Windows

`clean:modules` falla en este entorno Windows por file lock de rimraf. Eso causa errores de typecheck (`@types/node`, `@types/fastify` ausentes) que son pre-existentes y no se resuelven en el scope de cambios de cobertura.

**How to apply:** Cuando se обнаружи drift en `verify-report.json`, editar `scripting/verify-config.ts`. No dejar entradas `skip: true` residuales; eliminarlas o restaurarlas.
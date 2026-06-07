## Summary

Script dedicado `scripting/clean-modules.ts` que envuelve rimraf con pre-limpieza de procesos en Windows y verificación post-borrado con auto-recuperación. Garantiza que `node_modules/` se elimina completamente o el entorno se restaura automáticamente.

## ADDED Requirements

### Requirement: Pre-cleanup on Windows before rimraf

El script SHALL ejecutar una fase de pre-limpieza en Windows antes de invocar rimraf. Esta fase SHALL matar procesos que típicamente mantienen handles abiertos sobre archivos de `node_modules/`: `node`, `esbuild`, `vitest`.

#### Scenario: Pre-cleanup kills node processes before rimraf

- **WHEN** el script se ejecuta en Windows y existen procesos `node`, `esbuild`, o `vitest` activos
- **THEN** el script SHALL matar esos procesos antes de invocar rimraf
- **AND** el script SHALL esperar 2 segundos tras la limpieza antes de ejecutar rimraf

#### Scenario: Pre-cleanup skips on non-Windows platforms

- **WHEN** el script se ejecuta en Linux o macOS
- **THEN** el script SHALL omitir la fase de pre-limpieza y delegar directamente a rimraf

---

### Requirement: Post-deletion verification

Tras ejecutar rimraf, el script SHALL verificar que `node_modules/` fue eliminado completamente. La verificación SHALL usar `existsSync` para detectar si el directorio persiste.

#### Scenario: Successful deletion leaves no directory

- **WHEN** rimraf elimina `node_modules/` completamente
- **THEN** el script SHALL terminar con exit code 0
- **AND** no SHALL ejecutar `npm install`

#### Scenario: Partial deletion triggers auto-recovery

- **WHEN** rimraf deja `node_modules/` con cualquier contenido (directorio existe con > 0 items)
- **THEN** el script SHALL ejecutar `npm install` para restaurar el entorno
- **AND** el script SHALL terminar con exit code 1
- **AND** el script SHALL reportar el estado corrupto a stderr

---

### Requirement: Auto-recovery restores environment

Cuando el script detecta estado corrupto post-rimraf, SHALL ejecutar `npm install` para restaurar `node_modules/` a un estado completo y funcional.

#### Scenario: npm install restores node_modules after corruption

- **WHEN** `node_modules/` persiste con contenido tras rimraf
- **THEN** el script SHALL invocar `npm install` en el directorio del proyecto
- **AND** si `npm install` succeeds, el script SHALL reportar "Entorno restaurado"
- **AND** si `npm install` fails, el script SHALL terminar con exit code 1 y reportar el error

---

### Requirement: No regression on clean environments

El script SHALL comportarse de forma idéntica a `rimraf node_modules` directo cuando no hay procesos con handles abiertos. No SHALL haber degradación de rendimiento ni comportamiento diferente en entornos limpios.

#### Scenario: Clean environment deletes successfully

- **WHEN** el script se ejecuta con `node_modules/` intacto y sin procesos activos con handles
- **THEN** el script SHALL eliminar `node_modules/` completamente
- **AND** SHALL terminar con exit code 0
- **AND** no SHALL ejecutar `npm install`

#### Scenario: Linux/macOS delegation to rimraf

- **WHEN** el script se ejecuta en Linux o macOS (cualquier estado de node_modules)
- **THEN** el script SHALL delegar directamente a rimraf sin pre-limpieza
- **AND** SHALL propagar el exit code de rimraf sin modificación
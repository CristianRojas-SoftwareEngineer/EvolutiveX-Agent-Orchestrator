## Summary

Script dedicado `scripting/maintenance/clean-modules.ts` que envuelve rimraf con pre-limpieza de procesos en Windows y verificación post-borrado con auto-recuperación. Garantiza que `node_modules/` se elimina completamente o el entorno se restaura automáticamente.

En Linux/macOS delega directamente a rimraf sin pre-limpieza ni verificación.

## Requirements

### Requirement: Pre-cleanup on Windows before rimraf

En Windows, antes de invocar rimraf, el script SHALL matar procesos que típicamente mantienen handles abiertos sobre archivos de `node_modules/`: `esbuild` y `vitest`. No SHALL matar `node` para evitar cascadear a procesos padres (bash, npm, gateway).

Tras la limpieza, SHALL esperar 2 segundos antes de ejecutar rimraf.

#### Scenario: Pre-cleanup kills esbuild and vitest on Windows

- **WHEN** el script se ejecuta en Windows y existen procesos `esbuild` o `vitest` activos
- **THEN** el script SHALL matar esos procesos antes de invocar rimraf
- **AND** SHALL esperar 2 segundos tras la limpieza antes de ejecutar rimraf

#### Scenario: Pre-cleanup skips on non-Windows platforms

- **WHEN** el script se ejecuta en Linux o macOS
- **THEN** el script SHALL omitir la fase de pre-limpieza y delegar directamente a rimraf

---

### Requirement: Post-deletion verification

Tras ejecutar rimraf, el script SHALL verificar que `node_modules/` fue eliminado completamente. La verificación SHALL usar `existsSync` para detectar si el directorio persiste.

#### Scenario: Successful deletion leaves no directory

- **WHEN** rimraf elimina `node_modules/` completamente
- **THEN** el script SHALL terminar con exit code 0
- **AND** SHALL omitir la auto-recuperación

#### Scenario: Partial deletion triggers auto-recovery

- **WHEN** rimraf deja `node_modules/` con cualquier contenido (directorio existe con > 0 items)
- **THEN** el script SHALL lanzar `npm install` en un proceso hijo detached
- **AND** SHALL terminar con exit code 1
- **AND** SHALL reportar el estado corrupto a stderr

---

### Requirement: Auto-recovery runs detached

Cuando el script detecta estado corrupto, SHALL lanzar `npm install` con `spawn` y `detached: true` para restaurar `node_modules/` en segundo plano. El proceso padre SHALL terminar inmediatamente con exit code 1 sin esperar a que `npm install` complete.

#### Scenario: npm install runs detached after corruption

- **WHEN** `node_modules/` persiste con contenido tras rimraf
- **THEN** el script SHALL invocar `npm install` como proceso hijo detached
- **AND** el script SHALL terminar con exit code 1 sin esperar a `npm install`
- **AND** SHALL reportar a stderr que la recuperación se lanzó en segundo plano

---

### Requirement: No regression on clean environments

El script SHALL comportarse de forma idéntica a `rimraf node_modules` directo cuando no hay procesos con handles abiertos. No SHALL haber degradación de rendimiento ni comportamiento diferente en entornos limpios.

#### Scenario: Clean environment deletes successfully

- **WHEN** el script se ejecuta con `node_modules/` intacto y sin procesos activos con handles
- **THEN** el script SHALL eliminar `node_modules/` completamente
- **AND** SHALL terminar con exit code 0
- **AND** SHALL omitir la auto-recuperación

#### Scenario: Linux/macOS delegation to rimraf

- **WHEN** el script se ejecuta en Linux o macOS (cualquier estado de node_modules)
- **THEN** el script SHALL delegar directamente a rimraf sin pre-limpieza
- **AND** SHALL propagar el exit code de rimraf sin modificación

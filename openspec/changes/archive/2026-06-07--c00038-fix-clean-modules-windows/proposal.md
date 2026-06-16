## Why

En Windows 11, `npm run clean:modules` (que ejecuta `rimraf node_modules`) deja `node_modules/` en estado parcial cuando encuentra archivos bloqueados por procesos con handles abiertos. rimraf sale con código 1 pero no revierte el borrado parcial — el directorio corrupto persiste con ~350 de ~1000 items. Esto bloquea la pipeline de verificación (`verify:package-scripts` pasos 36–40) y corrompe el entorno de desarrollo (hooks de Claude Code fallan al importar `@anthropic-ai/sdk`).

El problema se reproduce cada vez que hay procesos activos con handles sobre archivos de `node_modules/` (esbuild, vitest, node watchers). El root cause es que rimraf en Windows no garantiza atomicidad transaccional: si falla a mitad, no hay rollback.

## What Changes

1. **Nuevo script dedicado `scripting/clean-modules.ts`**: en Windows, mata procesos con handles abiertos (`node`, `esbuild`, `vitest`) antes de ejecutar rimraf. En otros entornos, delega directamente a rimraf.
2. **Verificación post-borrado**: después de rimraf, verifica que `node_modules/` fue eliminado completamente. Si persiste con items restantes (estado corrupto), ejecuta `npm install` automáticamente y reporta el fallo.
3. **Actualización de `package.json`**: el script `clean:modules` apunta a `tsx scripting/clean-modules.ts` en lugar de `rimraf node_modules`.
4. **El verificador existente en `verify-config.ts`** (`path-absent-node-modules`) sigue funcionando — el script garantiza que si no logra borrar completamente, falla con exit no-cero y deja el directorio detectable.

## No objetivos

- No modificar el comportamiento de `clean:all` más allá del componente `clean:modules`.
- No reemplazar rimraf ni modificar su implementación interna.
- No crear una estrategia de borrado transaccional completa (rollback-on-failure) — solo resolver el caso Windows con procesos activos.

## Capabilities

### New Capabilities

- `clean-modules-transactional`: script dedicado que garantiza eliminación completa de `node_modules/` en Windows, con auto-recuperación si el borrado falla por locks. Incluye pre-limpieza de procesos y verificación post-borrado.

### Modified Capabilities

- Ninguna. Este es un fix correctivo que no cambia el comportamiento especificado de otras capabilities.

## Impact

| Componente | Efecto |
|---|---|
| `package.json` | `clean:modules` ahora ejecuta `tsx scripting/clean-modules.ts` en lugar de `rimraf node_modules` |
| `scripting/clean-modules.ts` | Nuevo archivo — lógica de cleanup + verificación + auto-recuperación |
| `scripting/verify-config.ts` | El step `clean-modules` sigue usando `verifier: 'path-absent-node-modules'` — sin cambios |
| Linux/macOS | Comportamiento idéntico al actual (rimraf directo) — sin cambios |

El change es isolated y no afecta otras capabilities del sistema.
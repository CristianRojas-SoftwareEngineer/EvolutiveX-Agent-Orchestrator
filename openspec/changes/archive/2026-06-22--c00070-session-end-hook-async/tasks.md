## 1. Plantilla y tipos

- [x] 1.1 En `configs/hooks.json`, añadir `"async": true` en la entrada `SessionEnd` (único evento async).
- [x] 1.2 En `scripting/features/hooks.ts`, añadir `async?: boolean` a `HookEntry`.

## 2. Tests

- [x] 2.1 En `tests/scripting/hooks-canonical-encoding.test.ts`, añadir test: `SessionEnd` tiene `async: true`; ninguna otra clave lo tiene.
- [x] 2.2 En `tests/scripting/features/hooks.test.ts`, verificar que `readCanonicalHooks` preserva `async: true` en `SessionEnd` tras resolver placeholders.

## 3. Verificación

- [x] 3.1 Ejecutar `npm run test:quick`.

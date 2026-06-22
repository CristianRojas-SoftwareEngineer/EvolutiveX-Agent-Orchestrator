## 1. Relay productivo

- [x] 1.1 Crear `scripting/detached-session-end-relay.ts` con spawn detached → `post-hook-event.ts` (sin trazas).
- [x] 1.2 Actualizar `configs/hooks.json`: `SessionEnd` invoca `detached-session-end-relay.ts` con `"async": true`.
- [x] 1.3 Extender `isScpManagedCommand` y `validateScpRoot` en `scripting/features/hooks.ts`.

## 2. Limpieza de instrumentación

- [x] 2.1 Eliminar `scripting/hooks/detached-session-end-probe.ts`.
- [x] 2.2 Eliminar `scripting/hooks/run-detached-session-end-probe.ts`.

## 3. Tests y documentación

- [x] 3.1 Actualizar `tests/scripting/hooks-canonical-encoding.test.ts` (SessionEnd → relay detached).
- [x] 3.2 Añadir test unitario de `spawnDetachedPostHookEvent` en relay productivo.
- [x] 3.3 Actualizar entrada `SessionEnd` en `README.md`.

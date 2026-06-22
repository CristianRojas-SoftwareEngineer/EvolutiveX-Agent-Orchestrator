## Why

El delta c00070 eliminó el error `Hook cancelled` en `SessionEnd` con `"async": true`,
pero el relay directo a `post-hook-event.ts` sigue sin completar el `POST /hooks` antes
de que Claude Code termine el proceso padre. El gateway no recibe `SessionEnd` en
`server/logs.jsonl` y no emite el toast «Sesión finalizada». Una sonda acotada
validó que un relay con `spawn` detached + `unref` entrega el evento de forma fiable
en Windows; la estrategia debe ser productiva, multiplataforma y sin instrumentación
temporal.

## What Changes

- Añadir `scripting/detached-session-end-relay.ts`: lee stdin, lanza
  `post-hook-event.ts` en un proceso hijo detached (node + tsx directo, sin npx) y
  termina de inmediato.
- Cambiar la entrada `SessionEnd` en `configs/hooks.json` para invocar el relay
  detached (manteniendo `"async": true`).
- Extender `isScpManagedCommand` y `validateScpRoot` para reconocer el nuevo script.
- Eliminar la instrumentación temporal (`detached-session-end-probe.ts`,
  `run-detached-session-end-probe.ts` y trazas asociadas).
- Actualizar tests de contrato y README.

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `hooks-lifecycle-correlation`: `SessionEnd` SHALL usar relay detached en lugar de
  invocar `post-hook-event.ts` directamente; requisito normativo del script relay y
  de la plantilla canónica.

## Impact

- `scripting/detached-session-end-relay.ts` (nuevo).
- `configs/hooks.json` — entrada `SessionEnd`.
- `scripting/features/hooks.ts` — detección de comandos SCP gestionados.
- `tests/scripting/hooks-canonical-encoding.test.ts`, `tests/scripting/features/hooks.test.ts`.
- Eliminación de `scripting/hooks/detached-session-end-probe.ts` y
  `scripting/hooks/run-detached-session-end-probe.ts`.
- Usuarios deben re-ejecutar `npm run setup:install -- --hooks` para propagar el
  comando actualizado a `~/.claude/settings.json`.

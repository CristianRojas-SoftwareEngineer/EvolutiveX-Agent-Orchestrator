## Why

Al cerrar una sesión de Claude Code, el hook `SessionEnd` instalado por SCP puede
fallar con `Hook cancelled` aunque la ruta de `post-hook-event.ts` sea correcta. El
runtime cancela hooks síncronos de `SessionEnd` durante el apagado del proceso (en
cualquier SO soportado por Claude Code), de modo que el relay no alcanza a enviar
`POST /hooks` y el gateway no emite el toast «Sesión finalizada».

## What Changes

- Añadir `"async": true` únicamente en la entrada `SessionEnd` de `configs/hooks.json`
  (plantilla canónica).
- Extender el tipo `HookEntry` del instalador para admitir el campo opcional `async`.
- Actualizar la spec de correlación de hooks para exigir `SessionEnd` async; el resto
  de eventos permanece síncrono.
- Añadir test de contrato que verifique `async: true` solo en `SessionEnd`.

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `hooks-lifecycle-correlation`: requisito normativo de que `SessionEnd` declare
  `async: true` en la plantilla e instalación; los demás eventos SCP no usan async.

## Impact

- `configs/hooks.json` — entrada `SessionEnd`.
- `scripting/features/hooks.ts` — tipo `HookEntry`.
- `tests/scripting/hooks-canonical-encoding.test.ts`.
- Usuarios con hooks ya instalados deben re-ejecutar `npm run setup:install -- --hooks`
  para propagar el cambio a `~/.claude/settings.json`.

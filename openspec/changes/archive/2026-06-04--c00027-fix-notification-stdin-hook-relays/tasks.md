# Tasks: fix-notification-stdin-hook-relays

> Estado: implementación ya aplicada en el working tree; checkboxes marcados para trazabilidad pre-commit.

## 1. Relays de stdin único

- [x] 1.1 Crear `scripting/gateway-hook-notify.ts` (`UserPromptSubmit`, `StopFailure`)
- [x] 1.2 Crear `scripting/pre-tool-use-hook-ux.ts` (`PreToolUse`: POST siempre, toast condicional)
- [x] 1.3 Añadir builders en `scripting/shared/gateway-hook-command.ts`

## 2. Plantilla de hooks

- [x] 2.1 Actualizar `configs/hooks.json` (eliminar comandos paralelos que competían por stdin)
- [x] 2.2 Unificar `PreToolUse` en un solo bloque `matcher: "*"`

## 3. CLI y instalador

- [x] 3.1 Alinear `readStdin` en `cli.ts` con `Buffer` + UTF-8
- [x] 3.2 Extender `isScpManagedCommand` y `validateScpRoot` en `scripting/features/hooks.ts`

## 4. Tests

- [x] 4.1 `tests/scripting/gateway-hook-notify.test.ts`
- [x] 4.2 `tests/scripting/pre-tool-use-hook-ux.test.ts`
- [x] 4.3 `tests/scripting/hooks-canonical-encoding.test.ts`
- [x] 4.4 Casos de tildes en `hook-payload-notification-message.test.ts`
- [x] 4.5 Fixtures `proxy-root-fixture.ts` con stubs de nuevos scripts

## 5. OpenSpec y despliegue local

- [x] 5.1 Change `fix-notification-stdin-hook-relays` (proposal, design, specs, tasks)
- [x] 5.2 `openspec sync` → fusionar deltas en `openspec/specs/`
- [x] 5.3 `openspec validate fix-notification-stdin-hook-relays --strict`
- [ ] 5.4 Usuario: `npm run setup:install -- --hooks` en máquinas con settings antiguos
- [ ] 5.5 Commit del working tree (cuando el usuario lo pida)

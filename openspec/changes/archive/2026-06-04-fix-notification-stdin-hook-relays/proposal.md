## Why

En Windows, varios hooks de Claude Code lanzaban **dos procesos en paralelo** que leían el mismo `stdin` (`post-hook-event.ts` + `cli.ts --stdin-json`). Solo el primero recibía el JSON completo; el segundo veía stdin vacío o corrupto. Eso rompía el mensaje dinámico del toast — en especial tildes y eñes en `UserPromptSubmit` y `PreToolUse` (`AskUserQuestion`) — aunque el catálogo estático y el relay de `Stop` ya funcionaran bien.

El problema ya se mitigó en código (relays unificados); falta **documentarlo en OpenSpec**, alinear `configs/hooks.json` con las specs y dejar trazabilidad antes del commit.

## What Changes

- Nuevo relay `scripting/gateway-hook-notify.ts` para `UserPromptSubmit` y `StopFailure`: una lectura de stdin → `POST /hooks` → toast con formatter.
- Nuevo relay `scripting/pre-tool-use-hook-ux.ts` para `PreToolUse` (`matcher: "*"`): `POST /hooks` siempre; toast solo si `tool_input.questions` aplica (`AskUserQuestion`).
- `configs/hooks.json`: elimina pares de comandos paralelos que competían por stdin; `PreToolUse` pasa de dos entradas (gateway + notificación) a una sola.
- `src/2-services/notifications/cli.ts`: lectura de stdin vía `Buffer` + `utf-8` (paridad con `post-hook-event.ts`).
- Instalador (`scripting/features/hooks.ts`, `gateway-hook-command.ts`): reconoce los nuevos scripts como comandos gestionados por SCP.
- Tests: relays, encoding en formatters, plantilla canónica de hooks.

**BREAKING (configuración local):** quien tenga `~/.claude/settings.json` con la plantilla antigua (doble comando en `UserPromptSubmit` / `StopFailure` / doble entrada `PreToolUse`) debe ejecutar `npm run setup:install -- --hooks` para alinear con `configs/hooks.json`.

## Capabilities

### New Capabilities

_(ninguna — el comportamiento encaja en specs existentes)_

### Modified Capabilities

- `hooks-lifecycle-correlation`: relays unificados con stdin único; reduce doble comando a `SubagentStart`/`SubagentStop`; unifica `PreToolUse`; actualiza inventario de entradas y marcadores SCP.
- `desktop-notifications-service`: lectura stdin UTF-8 en CLI; contrato de relays `gateway-hook-notify` y `pre-tool-use-hook-ux`; escenarios de preservación de tildes en mensajes dinámicos.
- `unified-installer`: validación y marcadores de comandos SCP incluyen los nuevos relays.

## Impact

| Área | Archivos / sistemas |
|------|---------------------|
| PKA 2-services | `src/2-services/notifications/cli.ts` |
| Scripting / hooks | `scripting/gateway-hook-notify.ts`, `scripting/pre-tool-use-hook-ux.ts`, `configs/hooks.json`, `scripting/features/hooks.ts`, `scripting/shared/gateway-hook-command.ts` |
| Tests | `tests/scripting/gateway-hook-notify.test.ts`, `pre-tool-use-hook-ux.test.ts`, `hooks-canonical-encoding.test.ts`, ajustes en fixtures |
| Operación | `npm run setup:install -- --hooks`; guía `docs/notifications.md` (actualización recomendada post-sync, fuera de este change si no se pide explícito) |
| OpenSpec | Deltas en este change; tras sync, `openspec/specs/` refleja el contrato |

## No objetivos

- Cambiar copy del catálogo de notificaciones o sonidos por evento.
- Unificar `SubagentStart` / `SubagentStop` (siguen con doble comando; baja frecuencia y sin `--stdin-json`).
- Modificar `PermissionRequest` (ya tenía un solo lector de stdin).
- Sustituir `node-notifier` / SnoreToast por otro backend Windows.

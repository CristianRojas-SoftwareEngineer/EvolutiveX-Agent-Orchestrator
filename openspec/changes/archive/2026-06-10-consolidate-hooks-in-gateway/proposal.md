## Why

El sistema de hooks despacha efectos (toasts, TTS, audit) usando 5 tipos de scripts distintos, con la lógica de decisión de efectos fragmentada entre scripts y gateway. Consolidar toda esa lógica en el gateway elimina la fragmentación publisher/subscriber, resuelve un race condition de Windows causado por múltiples lectores de stdin, y reduce el instalador a reconocer un único script.

## What Changes

- **Eliminados**: `scripting/gateway-hook-notify.ts`, `scripting/pre-tool-use-hook-ux.ts`, `scripting/task-in-progress-hook-ux.ts`, `scripting/shared/gateway-hook-command.ts`
- **Modificado** `configs/hooks.json`: los 14 eventos de hook usan `post-hook-event.ts` como único comando relay; desaparecen las entradas duplicadas (SubagentStart/SubagentStop con cli.ts en paralelo, PostToolUse[TaskUpdate] con script separado)
- **Modificado** `src/1-domain/types/hook.types.ts`: `ClaudeHookEvent` agrega `toolName?`, `toolInput?`, `prompt?`; `HookEventName` incluye los 5 eventos de ciclo de sesión (`SessionStart`, `SessionEnd`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`)
- **Modificado** `src/3-operations/audit-hook-event.handler.ts`: `executeAsync` maneja los 14 eventos; toasts para UserPromptSubmit, StopFailure, SubagentStart, SubagentStop, SessionStart, SessionEnd, TaskCreated, TaskCompleted, PermissionRequest, PreToolUse[AskUserQuestion] y PostToolUse[TaskUpdate+in_progress] se despachan exclusivamente desde el gateway
- **Modificado** `scripting/features/hooks.ts`: `validateScpRoot` e `isScpManagedCommand` simplifican reconociendo solo `post-hook-event`

## No Objetivos

- No se modifica la lógica de TTS ni el comportamiento de voz
- No se agregan efectos nuevos ni eventos fuera de los ya existentes en `configs/hooks.json`
- `src/2-services/notifications/cli.ts` no se elimina; deja de ser comando de hook pero sigue disponible como utilidad CLI standalone para testing manual

## Capabilities

### New Capabilities

(ninguna — la refactorización no introduce comportamiento visible al usuario que no existiera antes)

### Modified Capabilities

- `hooks-lifecycle-correlation`: `ClaudeHookEvent` extendido con `toolName`, `toolInput`, `prompt`; `HookEventName` extendido con los 5 eventos de ciclo de sesión; todos los 14 eventos ahora ciclan por `POST /hooks`
- `unified-installer`: `validateScpRoot` valida solo 2 archivos (`hooks.json` + `post-hook-event.ts`); `isScpManagedCommand` reconoce únicamente la ruta de `post-hook-event`

## Impact

- **Capas PKA afectadas**: capa 1 (`hook.types.ts`), capa 3 (`audit-hook-event.handler.ts`)
- **Configuración**: `configs/hooks.json`
- **Scripting**: 4 archivos eliminados, `scripting/features/hooks.ts` simplificado
- **Sin cambios en API externa**: el endpoint `POST /hooks`, la respuesta 2xx y el comportamiento visible de los toasts al usuario son idénticos al diseño anterior

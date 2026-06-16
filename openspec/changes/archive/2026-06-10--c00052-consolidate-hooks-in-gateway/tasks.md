## 1. Capa de dominio — extender `ClaudeHookEvent`

- [x] 1.1 Añadir `toolName?: string`, `toolInput?: Record<string, unknown>` y `prompt?: string` a la interface `ClaudeHookEvent` en `src/1-domain/types/hook.types.ts`
- [x] 1.2 Extender `HookEventName` con los literales `'SessionStart' | 'SessionEnd' | 'PermissionRequest' | 'TaskCreated' | 'TaskCompleted'`
- [x] 1.3 Actualizar `parseHookEvent` para mapear `tool_name`, `tool_input` y `prompt` del payload wire a los nuevos campos

## 2. Gateway — centralizar despacho de efectos

- [x] 2.1 Agregar imports de `formatUserPromptSubmitMessage`, `formatStopFailureMessage`, `formatPermissionRequestMessage` desde `hook-payload-notification-message.ts` en el handler
- [x] 2.2 Extender `case 'UserPromptSubmit'`: añadir `void this.emitToast(...)` con texto dinámico vía `formatUserPromptSubmitMessage`
- [x] 2.3 Extender `case 'StopFailure'`: añadir `void this.emitToast(...)` con texto dinámico vía `formatStopFailureMessage`
- [x] 2.4 Extender `case 'SubagentStart'`: añadir `void this.emitToast('SubagentStart', 'Subagente iniciado')`
- [x] 2.5 Extender `case 'SubagentStop'`: añadir `void this.emitToast('SubagentStop', 'Subagente terminado')`
- [x] 2.6 Reemplazar `case 'PreToolUse'` (log only) por lógica condicional: si `event.toolName === 'AskUserQuestion'` y `event.toolInput?.questions`, emitir toast vía `formatPreToolUseAskMessage`
- [x] 2.7 Extender `handlePostToolUse` (o el `case 'PostToolUse'`): si `event.toolName === 'TaskUpdate'` y `event.toolInput?.status === 'in_progress'`, emitir toast vía `formatTaskInProgressMessage`
- [x] 2.8 Añadir `case 'SessionStart'` y `case 'SessionEnd'`: `void this.emitToast(...)` con mensajes estáticos
- [x] 2.9 Añadir `case 'TaskCreated'` y `case 'TaskCompleted'`: `void this.emitToast(...)` con mensajes estáticos
- [x] 2.10 Añadir `case 'PermissionRequest'`: `void this.emitToast(...)` con texto dinámico vía `formatPermissionRequestMessage`

## 3. Configuración — unificar `configs/hooks.json`

- [x] 3.1 Reemplazar el comando de `UserPromptSubmit` (actualmente `gateway-hook-notify.ts`) por `post-hook-event.ts`
- [x] 3.2 Reemplazar el comando de `PreToolUse` (actualmente `pre-tool-use-hook-ux.ts`) por `post-hook-event.ts`
- [x] 3.3 Eliminar la segunda entrada de `PostToolUse` (matcher `TaskUpdate` con `task-in-progress-hook-ux.ts`); conservar solo la entrada `matcher: "*"` con `post-hook-event.ts`
- [x] 3.4 Eliminar el segundo comando de `SubagentStart` (el que usa `cli.ts`); conservar solo `post-hook-event.ts`
- [x] 3.5 Eliminar el segundo comando de `SubagentStop` (el que usa `cli.ts`); conservar solo `post-hook-event.ts`
- [x] 3.6 Reemplazar el comando de `StopFailure` (actualmente `gateway-hook-notify.ts`) por `post-hook-event.ts`
- [x] 3.7 Reemplazar el comando de `SessionStart` (actualmente `cli.ts --event-type SessionStart`) por `post-hook-event.ts`
- [x] 3.8 Reemplazar el comando de `SessionEnd` (actualmente `cli.ts --event-type SessionEnd`) por `post-hook-event.ts`
- [x] 3.9 Reemplazar el comando de `PermissionRequest` (actualmente `cli.ts --stdin-json`) por `post-hook-event.ts`
- [x] 3.10 Reemplazar el comando de `TaskCreated` (actualmente `cli.ts --event-type TaskCreated`) por `post-hook-event.ts`
- [x] 3.11 Reemplazar el comando de `TaskCompleted` (actualmente `cli.ts --event-type TaskCompleted`) por `post-hook-event.ts`

## 4. Instalador — simplificar reconocimiento de scripts

- [x] 4.1 Actualizar `validateScpRoot` en `scripting/features/hooks.ts`: eliminar `GATEWAY_HOOK_NOTIFY_SEGMENT`, `PRE_TOOL_USE_HOOK_UX_SEGMENT`, `TASK_IN_PROGRESS_HOOK_UX_SEGMENT` y `NOTIFICATIONS_CLI_SEGMENT` de la lista de archivos requeridos; dejar solo `HOOKS_JSON_SEGMENT` y `POST_HOOK_EVENT_SEGMENT`
- [x] 4.2 Actualizar `isScpManagedCommand`: eliminar las verificaciones de `gateway-hook-notify`, `pre-tool-use-hook-ux`, `task-in-progress-hook-ux` y `cli.ts`; reconocer solo la ruta de `post-hook-event`
- [x] 4.3 Eliminar las constantes de segmento obsoletas (`GATEWAY_HOOK_NOTIFY_SEGMENT`, `PRE_TOOL_USE_HOOK_UX_SEGMENT`, `TASK_IN_PROGRESS_HOOK_UX_SEGMENT`) del módulo

## 5. Eliminar scripts obsoletos

- [x] 5.1 Eliminar `scripting/gateway-hook-notify.ts`
- [x] 5.2 Eliminar `scripting/pre-tool-use-hook-ux.ts`
- [x] 5.3 Eliminar `scripting/task-in-progress-hook-ux.ts`
- [x] 5.4 Eliminar `scripting/shared/gateway-hook-command.ts`

## 6. Verificación

- [x] 6.1 `npm run test:quick` (lint + typecheck + unit) sin errores tras todos los cambios
- [x] 6.2 Reinstalar hooks en la máquina de desarrollo: `npm run setup:install -- --hooks --force`
- [x] 6.3 Verificar con sesión headless (`claude -p "Di hola" --model haiku`): toast de UserPromptSubmit visible, TTS en Stop correcto, sin errores en `server/logs.jsonl`

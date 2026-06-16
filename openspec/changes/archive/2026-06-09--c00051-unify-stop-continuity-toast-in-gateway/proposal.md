## Why

El toast de continuidad del evento `Stop` se genera hoy en el script externo `scripting/stop-work-summary-notification.ts`, que invoca al LLM mediante el SDK `@anthropic-ai/sdk` con `ANTHROPIC_AUTH_TOKEN`. Ese token autentica contra el proxy, no contra el provider activo, y el SDK solo acepta tokens de Anthropic: con Minimax (u otro provider Anthropic-compatible) la llamada falla en silencio y el toast cae al fallback (último mensaje crudo del asistente). Al mismo tiempo, la **voz** del mismo evento `Stop` ya se resolvió en el gateway (`fix-tts-generic-fallback`, commit `bcad16c`) usando `fetch()` al proxy local con el token capturado, que sí funciona con cualquier provider. El resultado es una **inconsistencia observable**: con Minimax la voz dice un resumen contextual y el toast muestra texto crudo distinto.

Este es el único toast del sistema que invoca al LLM (verificado: `gateway-hook-notify.ts` y `notifications/cli.ts` emiten texto estático o derivado del payload, sin SDK). Por tanto es el único afectado por el bug, y unificarlo en el gateway lo resuelve reutilizando el transporte que ya funciona.

## What Changes

- El evento `Stop` deja de ejecutar `stop-hook-ux.ts`; en `configs/hooks.json` pasa a ejecutar el relay genérico `post-hook-event.ts` (POST `/hooks`, fire-and-forget), igual que el resto de eventos auditados.
- `AuditHookEventHandler` (gateway) genera **una sola vez** el texto de continuidad del `Stop` (vía `fetch()` al proxy local con el token capturado, ya existente) y lo emite por **dos canales desde el mismo texto**: voz (TTS, ya existente) y toast de escritorio (nuevo).
- Se inyecta `INotificationService` (`DesktopNotificationAdapter`) en `AuditHookEventHandler` para emitir el toast desde el gateway.
- **BREAKING (interno)**: se eliminan `scripting/stop-work-summary-notification.ts` y `scripting/stop-hook-ux.ts` junto con su lógica (`extractWorkflowContext`, `generateContinuityMessage`, `writeContinuityMessage`, `notifyContinuityMessage`, `runContinuityNotification`, `resolveAnthropicClient`) y sus tests.
- Se elimina la persistencia en `sessions/.last-continuity-message.txt` (punto de integración «Fase 2 TTS» que nunca se consumió).
- El instalador (`scripting/features/hooks.ts`) deja de exigir `scripting/stop-hook-ux.ts` en `validateScpRoot`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `stop-hook-continuity-message`: se **elimina** el contrato del flujo basado en script (extracción, generación con SDK, persistencia en disco y emisión del toast desde `scripting/`). La responsabilidad del toast de continuidad del `Stop` se traslada al gateway. El requisito de persistencia en `.last-continuity-message.txt` se retira por desuso.
- `tts-hooks`: el manejo del evento `Stop` en `AuditHookEventHandler` **añade** un canal de toast de escritorio que reutiliza el mismo texto generado para la voz, emitido con el token del provider activo (cualquier provider) y degradación con gracia.

## Impact

- **Capas PKA**: 3-operations (`AuditHookEventHandler`), 4-api (composition root: inyección de `INotificationService`), más artefactos de `scripting/` y `configs/`.
- **Código eliminado**: `scripting/stop-work-summary-notification.ts`, `scripting/stop-hook-ux.ts` y sus suites en `tests/scripting/`.
- **Código modificado**: `src/3-operations/audit-hook-event.handler.ts`, `configs/hooks.json`, `scripting/features/hooks.ts`, composition root del gateway.
- **Sin dependencias nuevas**: reutiliza `fetch` nativo, `DesktopNotificationAdapter` (node-notifier) y `IContextExtractor` ya existentes.
- **Docs**: `docs/notifications.md` (o equivalente) y referencias a `.last-continuity-message.txt`.
- **No objetivos**: no se migran los demás scripts de notificación (`notifications/cli.ts`, `gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts`); no se centraliza la tabla `EVENT_EFFECTS` ni se extiende el dominio con `toolName`/`toolInput` — eso queda para un change B dependiente. No se añade toast a `SubagentStop`/`StopFailure` (su voz ya funciona y no usan el SDK).

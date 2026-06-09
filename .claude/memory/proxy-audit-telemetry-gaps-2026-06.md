# Telemetría de auditoría: stepCount, tool_result y finalText

**Tags:** `proxy`, `audit`, `telemetry`, `stepCount`, `tool_result`, `corrective`

## Lesson

Un hop HTTP que termina en `tool_use` es un hop **completo**: debe cerrar el `IStep` en correlador (`closedAt` + `closeStep`). `completeToolUse` debe ser **idempotente** porque PostToolUse y el fallback de continuation pueden coexistir. `finalText` pertenece al workflow wire agentic, no al shell `sessionId`.

## Trigger

`stepCount` ≠ directorios `steps/`; ratio `tool_result`:`tool_call` > 1; `finalText` duplicado en wf 00 y 02; `interactionType: main` en shell.

## Fix reference

Caso `20260608-proxy-audit-telemetry-gaps`; change `fix-proxy-audit-telemetry-gaps`.

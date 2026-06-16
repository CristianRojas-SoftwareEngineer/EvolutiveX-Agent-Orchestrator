## Why

Tras el fix de unificación request/response por hop (`align-wire-step-request-response`), la sesión `dcdf0a15` expone brechas residuales de **metadatos y telemetría**: `stepCount` subreportado (1 vs 6 hops), eventos `tool_result` duplicados en `events.ndjson` (12 vs 6 tools), `finalText` replicado entre workflow sesión y wire, e `interactionType: "main"` fuera de la taxonomía documentada.

Caso SM: `20260608-proxy-audit-telemetry-gaps` (perfil correctivo, solución SH-α).

## What Changes

- Cerrar `IStep` en correlador cuando `stopReason === 'tool_use'` (hop HTTP completo).
- Idempotencia en `completeToolUse` (un `tool_result` por tool en EventBus).
- `finalText` canónico solo en workflow wire agentic; shell sesión sin texto duplicado.
- Nuevo valor semántico `session-shell` para el contenedor de sesión (`workflowId === sessionId`).

## Capabilities

### New Capabilities

_(ninguna — solo extensiones de requisitos existentes)_

### Modified Capabilities

- `gateway-audit-projection`: cierre de step en `tool_use` (camino feliz + fallback `registerWireStepInCorrelator`); idempotencia `tool_result`.
- `gateway-closure-services`: `buildWorkflowResult` omite `finalText` en contenedor de sesión.
- `gateway-workflow-lifecycle`: apertura shell con `session-shell` en `UserPromptSubmit`.
- `session-persistence`: taxonomía `interactionType` incluye `session-shell`.

## No objetivos

- Migración de sesiones históricas en disco.
- Enriquecimiento de `server/logs.jsonl` con `sessionId`/`workflowId` (deuda D1).
- Corrección del typecheck preexistente en `audit-sse-response.handler.ts`.

## Impact

| Capa PKA | Archivos |
|----------|----------|
| 1-domain | `build-workflow-result.ts`, tipos `WorkflowRequestKind` si aplica |
| 2-services | `workflow-repository.service.ts` |
| 3-operations | `gateway-wire-step.util.ts`, `audit-hook-event.handler.ts` |
| tests | `gateway-wire-step.util.test.ts`, `workflow-repository.test.ts`, tests `build-workflow-result` |
| docs/specs | deltas en `openspec/specs/` vía sync post-archive |

---
name: proxy-tool-result-continuation-fallback
description: Completar tools client-side desde tool_result en continuation cuando PostToolUse no llega al proxy
tags:
  component: gateway
  defect-class: audit-projection
  profile: corrective
---

La persistencia de `tool_result` depende del hook `PostToolUse` en `~/.claude/settings.json` (matcher `*`, `post-hook-event.ts`). Si la clave falta, `completeToolUse` nunca corre aunque `registerToolUse` sí emitió `tool_call`.

El body de continuación HTTP ya incluye bloques `tool_result` en el último mensaje user. `handleContinuation` debe invocar `completeToolUse` desde `extractToolResultBlocksFromRequestBody` como fallback resiliente.

Además: `finalizeWorkflowMetrics` solo corría en hook Stop del workflow sesión; workflows wire cierran por SSE `forceClose` y requieren finalize explícito en `AuditSseResponseHandler`.

Related case: maintenance-cases/20260608-proxy-audit-residual-gaps/case.md

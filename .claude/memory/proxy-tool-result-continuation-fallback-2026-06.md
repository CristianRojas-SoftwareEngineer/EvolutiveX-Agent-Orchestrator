---
name: proxy-tool-result-continuation-fallback
description: Completar tools client-side desde tool_result en continuation HTTP (vía canónica, no fallback)
tags:
  component: gateway
  defect-class: audit-projection
  profile: corrective
---

Los tools client-side (`registerToolUse`: Bash, Read, …) tienen `completionAuthority: continuation`. Su `tool_result` canónico llega en el body de la siguiente request HTTP; `handleContinuation` → `completeClientToolResultsFromContinuation` es la **única** vía de completación.

`AuditHookEventHandler` ignora `PostToolUse`/`PostToolUseFailure` para autoridad `continuation`. Completar desde el hook con `result: null` o `{ error: 'PostToolUseFailure' }` bloqueaba el backfill real por idempotencia de `completeToolUse`.

Tools `web_search` / `web_fetch` mantienen autoridad `hook` (sin `tool_result` estándar en continuation). Agent (pending) usa `continuation` (resultado del subagente en continuation del padre).

Operador: `PostToolUse` en `~/.claude/settings.json` sigue útil para métricas del harness, pero ya no es requisito para persistir stdout de Bash.

Related case: maintenance-cases/20260608-proxy-audit-residual-gaps/case.md; OpenSpec `fix-client-tool-result-backfill`.

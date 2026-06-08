---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 08-analysis
chain: cause
version: v1.0
timestamp: 2026-06-08T23:41:00Z
status: done
inputs: [07-data-collection.md]
produces: 08-analysis.md
links: { previous: 07-data-collection.md, next: 11-solution-research.md }
---

# Analysis — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** ## Causa confirmada presente o refutación explícita

## Verdict per hypothesis

| ID | Resultado | Evidencia |
|----|-----------|-----------|
| H1 | **Confirmada** | `PostToolUse` ausente en `~/.claude/settings.json`; 0 logs PostToolUse; `tool_call` sí emitido; continuation tiene `tool_result` en body sin `completeToolUse` |
| H2 | **Confirmada** | `finalized_workflow_ids: []`; wire cierra por `forceClose` SSE; `delegateClosure` solo en hook Stop del workflow sesión sin usage |
| H3 | **Confirmada (deuda)** | Workflow `00` sin steps de inferencia por diseño dual-layer; no defecto funcional |
| H4 | **Parcial** | 116 hooks vacíos; emisor no acotado; mitigación: log debug (deuda menor) |

## Causa confirmada

**Causa raíz compuesta:**

1. **Config + código:** ausencia de relay `PostToolUse` en settings del usuario **y** ausencia de fallback en `handleContinuation` para completar tools client-side desde bloques `tool_result` del body HTTP.
2. **Métricas:** `finalizeWorkflowMetrics` no se invoca al cierre terminal SSE de workflows wire.

## Threats to validity

- Validación end-to-end live pendiente tras reinstalar hooks.
- H4 sin emisor identificado.

## Acceptance check

`## Causa confirmada` presente; H1–H2 confirmadas.

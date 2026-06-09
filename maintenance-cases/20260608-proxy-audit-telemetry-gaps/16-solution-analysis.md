---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 16-solution-analysis
chain: solution
version: v1.0
timestamp: 2026-06-08T15:10:00Z
status: done
inputs: [15-solution-data-collection.md]
produces: 16-solution-analysis.md
links: { previous: 15-solution-data-collection.md, next: 17-conclusion.md }
---

# Solution Analysis — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** ganadora con justificación cuantitativa

## Solución ganadora

**SH-α (Bundle α):** S-A + S-D + S-G + S-H

| Componente | Acción |
|------------|--------|
| S-A | `enrichOpenWireStepWithResponse`: en `stopReason === 'tool_use'`, asignar `closedAt` y `repo.closeStep` |
| S-D | `completeToolUse`: no-op si tool ya `completed` o `error` (sin re-emit) |
| S-G | `buildWorkflowResult`: no incluir `finalText` cuando `workflow.id === hook.sessionId` (shell) |
| S-H | `UserPromptSubmit` → `openWorkflow` con `workflowKind: 'session-shell'`; persistir en meta |

**Justificación:** score 19 vs 15; alinea correlador con hops materializados; idempotencia defensiva; una sola fuente de `finalText` (wire agentic); taxonomía explícita.

## Hipótesis descartadas

| ID | Razón |
|----|-------|
| SH-β | Parche numérico sin cerrar hops; deja steps abiertos en memoria |
| S-C | Acoplamiento correlador↔disco |
| S-E | Heurística PostToolUse frágil |
| S-I | No corrige semántica, solo documenta deuda |

## Batch note

Implementación diferida a `openspec-apply`; veredicto de diseño basado en análisis estático y scoring. Verify post-apply debe confirmar métricas de tabla 15.

## Acceptance check

`## Solución ganadora` emitida con justificación cuantitativa y descartadas documentadas.

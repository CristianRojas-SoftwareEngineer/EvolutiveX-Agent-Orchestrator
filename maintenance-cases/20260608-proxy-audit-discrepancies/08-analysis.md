---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 08-analysis
chain: cause
version: v1.0
timestamp: 2026-06-08T18:43:00Z
status: done
inputs: [07-data-collection.md]
produces: 08-analysis.md
links: { previous: 07-data-collection.md, next: 11-solution-research.md }
---

# Analysis — 20260608-proxy-audit-discrepancies

## Applied policy

- **acceptance:** ## Causa confirmada presente o refutación explícita

## Verdict per hypothesis

| ID | Resultado | Evidencia |
|----|-----------|-----------|
| H1 | **Confirmada** | `registerWireStepInCorrelator` no cerraba workflows wire; fix con `closeWireWorkflowOnTerminalStop` + test forceClose success |
| H2 | **Confirmada** | `registerStep` emitía `step_request` con inference vacío + off-by-one en stepIndex; fix eliminando emit duplicado y corrigiendo index |
| H3 | **Confirmada** | `StepAssemblerService` sin handler `text_delta`; fix añadiendo textTracker |
| H4 | **Parcialmente confirmada** | Efecto colateral de H2/H1; `registerToolUse` ya existía; con H2 corregido el camino hook→`tool_result` queda desbloqueado |

## Causa confirmada

**Causa raíz compuesta:** tres defectos independientes en la capa de proyección causal (cierre wire, emisión duplicada/errónea de `step_request`, ensamblaje SSE incompleto) que en conjunto impiden auditar el flujo agentic con tools client-side según el contrato `session-persistence`.

## Threats to validity

- Sesión de reproducción original no re-ejecutada end-to-end contra proxy live (validación vía tests unitarios/integración).
- Métricas de sesión (`total_workflows`) no abordadas en este batch (deuda menor documentada).

## Acceptance check

Sección `## Causa confirmada` presente. Hipótesis H1–H3 confirmadas con evidencia.

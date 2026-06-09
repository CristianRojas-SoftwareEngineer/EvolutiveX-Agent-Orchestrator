---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 12-solution-hypothesis
chain: solution
version: v1.0
timestamp: 2026-06-08T14:50:00Z
status: done
inputs: [11-solution-research.md]
produces: 12-solution-hypothesis.md
links: { previous: 11-solution-research.md, next: 13-solution-experiment-design.md }
---

# Solution Hypothesis — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** ≥1 hipótesis falsable + criterios

## Hypotheses

### SH-α (Bundle α — S-A + S-D + S-G + S-H)

**Hipótesis:** Cerrar steps en `tool_use`, idempotencia en `completeToolUse`, `finalText` solo en wire, y `session-shell` en meta restauran coherencia 02 § success criterion.

**Predicción:** Test multi-hop → `stepCount===N`; spy `tool_result` → 1 emit/tool; shell sin `finalText`; meta `interactionType: session-shell`.

**Refutación:** Cualquier criterio 02 falla tras implementación.

### SH-β (Bundle β — S-B + S-D + S-F)

**Hipótesis:** Contar steps por longitud + idempotencia + omitir finalText en shell es suficiente sin cerrar en tool_use.

**Predicción:** `stepCount === workflow.steps.length` incluso con steps abiertos residuales.

**Refutación:** Steps huérfanos sin `closedAt` inflan count o métricas incoherentes.

## Priority

SH-α > SH-β (alineación modelo causal > parche numérico).

## Status

| ID | Status |
|----|--------|
| SH-α | pending |
| SH-β | pending |

## Acceptance check

Dos hipótesis falsables con predicciones medibles.

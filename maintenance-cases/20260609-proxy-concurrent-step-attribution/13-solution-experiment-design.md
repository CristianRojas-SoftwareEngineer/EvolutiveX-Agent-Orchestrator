---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 13-solution-experiment-design
chain: solution
version: v1.0
timestamp: 2026-06-09T10:55:00Z
status: done
inputs: [12-solution-hypothesis.md]
produces: 13-solution-experiment-design.md
links: { previous: 12-solution-hypothesis.md, next: 14-solution-execution.md }
---

# Solution Experiment Design — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** experimento reproducible

## Comparative experiment (single batch)

**Condiciones iniciales idénticas para S-A, S-B, S-C:**
- Workflow `wf-1` con 2 steps abiertos (índices 1 y 2).
- Respuesta SSE sintética A → `end_turn` con texto JSON título.
- Respuesta SSE sintética B → `tool_use` Bash.

| Hipótesis | Implementación bajo prueba | Métrica primaria |
|-----------|---------------------------|------------------|
| S-A | `enrichWireStepByIndex` + `context.assignedStepIndex` en chunks | `step[N].assistantMessage` correcto |
| S-B | Lock sin cambio de índice | Misma métrica — se espera FAIL en chunks |
| S-C | N/A (no implementable en proxy) | Excluida de ejecución |

**Métricas compartidas:**
1. `step_response.payload.stepIndex` === `assignedStepIndex`
2. Contenido semántico request↔response por índice
3. `npm test` suite completa

**Rollback entre hipótesis:** `git stash` / branch aislado por hipótesis en fase 14.

## Test de regresión obligatorio

Nuevo caso en `audit-sse-response.handler.test.ts`:
- `atribuye response SSE al assignedStepIndex con hops concurrentes abiertos`

## Acceptance check

Experimento único comparativo con métricas normalizadas.

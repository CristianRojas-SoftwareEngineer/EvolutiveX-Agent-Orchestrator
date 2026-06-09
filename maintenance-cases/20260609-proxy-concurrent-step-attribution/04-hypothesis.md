---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 04-hypothesis
chain: cause
version: v1.0
timestamp: 2026-06-09T10:20:00Z
status: done
inputs: [03-research.md]
produces: 04-hypothesis.md
links: { previous: 03-research.md, next: 05-experiment-design.md }
---

# Hypothesis — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** ≥1 hipótesis falsable

## Candidates

| ID | Hipótesis | Predicción | Refutación |
|----|-----------|------------|------------|
| H1 | Egress usa heurística «último step abierto» en lugar de `assignedStepIndex` | Con dos steps abiertos, la respuesta del hop A puede enriquecer step B | Test concurrente: si se fuerza `assignedStepIndex` en egress, emparejamiento correcto |
| H2 | `withSessionLock` en ingress impide abrir dos steps | Solo un step abierto a la vez | Sesión `52f8f157` muestra steps 01 y 02 abiertos concurrentemente → refuta |
| H3 | Error en persistencia (`SessionPersistence`) desordena responses | Eventos `step_response` ya llevan `stepIndex` erróneo en bus | Inspección de correlador antes de persistencia confirma índice erróneo en origen egress |

## Priority

1. **H1** — más barata de probar, alineada con código.
2. H3 — consecuencia de H1 si se confirma.
3. H2 — refutada por evidencia observacional.

## Acceptance check

Tres hipótesis falsables; H1 priorizada.

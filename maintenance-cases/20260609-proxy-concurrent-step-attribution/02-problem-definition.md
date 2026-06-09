---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 02-problem-definition
chain: cause
version: v1.0
timestamp: 2026-06-09T10:10:00Z
status: done
inputs: [01-observation.md]
produces: 02-problem-definition.md
links: { previous: 01-observation.md, next: 03-research.md }
---

# Problem Definition — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** enunciado falsable y medible

## Problem statement

Cuando dos o más hops HTTP del **mismo workflow de turno** están abiertos simultáneamente, el pipeline de egress (handlers SSE y estándar) **no garantiza** que la respuesta upstream se proyecte al step cuyo `request/body.json` la originó. El correlador asigna `assignedStepIndex` en ingress, pero egress enriquece el «último step abierto» heurísticamente, produciendo **cross-wiring** forense en `steps/MM/response/`.

## Scope

- **In:** atribución request↔response en hops concurrentes del mismo `workflowId`; `stream_chunk.stepIndex`; eventos `step_response`.
- **Out:** preflights (excluidos de disco); subagentes anidados salvo que compartan el mismo patrón; métricas `total_workflows` (deuda separada).

## Success criterion (no-regresión)

Para un test con dos hops concurrentes (side-request + agentic fresh) en el mismo workflow:

| Métrica | Umbral |
|---------|--------|
| `steps/01/response` semántica | Coherente con `steps/01/request` (título JSON) |
| `steps/02/response` semántica | Coherente con `steps/02/request` (tool_use Bash o texto agentic) |
| Suite unitaria existente | 100% PASS |
| Hops secuenciales (sin concurrencia) | Sin regresión |

## Falsifiability

Si egress usa `context.assignedStepIndex` fijado en ingress, el cross-wiring desaparece en el escenario de reproducción.

## Acceptance check

Enunciado medible con criterios binarios por step y suite de tests.

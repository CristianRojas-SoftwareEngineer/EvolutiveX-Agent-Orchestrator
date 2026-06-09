---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 01-observation
chain: cause
version: v1.0
timestamp: 2026-06-09T10:05:00Z
status: done
inputs: []
produces: 01-observation.md
links: { previous: , next: 02-problem-definition.md }
---

# Observation — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **focus:** síntomas + pasos de reproducción
- **acceptance:** fallo reproducible o caracterizado con precisión

## Observable state

| Campo | Valor |
|-------|-------|
| Sesión proxy | `52f8f157-f66a-4211-931d-93fe9c2b345d` |
| Harness log | `C:\Users\Cristian\.claude\projects\...\52f8f157-....jsonl` (20 líneas) |
| Layout disco | `sessions/.../workflows/01/` con `steps/01..04` |
| Modelo vigente | `causal-workflows-v1`, un workflow por turno |

## Síntomas

1. `workflows/01/steps/01/meta.json` → `stepKind: side-request` (prompt `ai-title`).
2. `workflows/01/steps/01/request/body.json` → system prompt de generación de título + `<session>` con commit hash.
3. `workflows/01/steps/01/response/body.json` → mensaje assistant con `tool_use` **Bash** (`git show f2bf910...`).
4. `workflows/01/steps/02/meta.json` → `stepKind: agentic`.
5. `workflows/01/steps/02/request/body.json` → prompt usuario real + contexto CLAUDE.md.
6. `workflows/01/steps/02/response/body.json` → JSON `{"title": "Investigar commit específico"}` (salida esperada del hop `ai-title`).

## Pasos de reproducción (caracterización)

1. Arrancar proxy con modelo `unify-turn-workflow` aplicado.
2. Enviar turno agentic cuyo harness dispare en ráfaga `side-request` (`ai-title`) y hop `agentic` fresh concurrentes al inicio.
3. Comparar `steps/MM/request/body.json` con `steps/MM/response/body.json` por hop.
4. **Observado:** emparejamiento request↔response invertido entre steps 01 y 02.

## Acceptance check

Fallo caracterizado con evidencia en disco y harness; reproducción automatizada pendiente en fase 05–06.

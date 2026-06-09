---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 07-data-collection
chain: cause
version: v1.0
timestamp: 2026-06-09T10:35:00Z
status: done
inputs: [06-experiment-execution.md]
produces: 07-data-collection.md
links: { previous: 06-experiment-execution.md, next: 08-analysis.md }
---

# Data Collection — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** datos trazables a la ejecución

## Results

| Exp | Hipótesis | Métrica | Resultado |
|-----|-----------|---------|-----------|
| E1 | H1 | Emparejamiento simulado vs disco real | **MATCH** — cross-wiring 01↔02 |
| E1 | H2 | Steps concurrentes abiertos | **2 abiertos** — H2 refutada |
| E1 | H3 | Origen del índice erróneo | **egress** (`enrichOpenWireStepWithResponse`) |

## Evidencia sesión real

| Archivo | Contenido clave |
|---------|-----------------|
| `steps/01/request` | Prompt `ai-title` |
| `steps/01/response` | `tool_use` Bash |
| `steps/02/request` | Prompt usuario agentic |
| `steps/02/response` | JSON título |

## Acceptance check

Tabla trazable a ejecución E1 y artefactos de sesión.

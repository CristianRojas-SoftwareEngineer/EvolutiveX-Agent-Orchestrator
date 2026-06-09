---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 15-solution-data-collection
chain: solution
version: v1.0
timestamp: 2026-06-09T11:05:00Z
status: done
inputs: [14-solution-execution.md]
produces: 15-solution-data-collection.md
links: { previous: 14-solution-execution.md, next: 16-solution-analysis.md }
---

# Solution Data Collection — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** tabla con ≥1 fila por hipótesis

## Normalized table (análisis estático pre-apply)

| Hipótesis | Emparejamiento request↔response | stream_chunk.stepIndex | Blast radius | Reversibilidad | Suite tests |
|-----------|--------------------------------|------------------------|--------------|----------------|-------------|
| S-A | **PASS** (por diseño) | **PASS** | Bajo (3 archivos) | Alta | Esperado PASS |
| S-B | Parcial | **FAIL** | Medio | Media | PASS (sin fix real) |
| S-C | PASS solo sin concurrencia | N/A | N/A (no proxy) | N/A | N/A |

## Acceptance check

Tabla normalizada con 3 filas.

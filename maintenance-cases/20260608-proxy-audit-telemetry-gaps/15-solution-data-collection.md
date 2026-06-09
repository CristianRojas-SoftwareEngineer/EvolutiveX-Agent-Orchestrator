---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 15-solution-data-collection
chain: solution
version: v1.0
timestamp: 2026-06-08T15:05:00Z
status: done
inputs: [14-solution-execution.md]
produces: 15-solution-data-collection.md
links: { previous: 14-solution-execution.md, next: 16-solution-analysis.md }
---

# Solution Data Collection — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **acceptance:** tabla con ≥1 fila por hipótesis

## Normalized table (pre-implementation / design validation)

| hypothesis_id | stepCount_accuracy | tool_result_emits_per_tool | finalText_sites | interactionType_shell | regression_suite | notes |
|---------------|-------------------|---------------------------|-----------------|----------------------|------------------|-------|
| SH-α (designed) | **expected pass** | **expected 1** | **expected 1** (wire only) | **session-shell** | pending apply | Análisis estático: S-A cierra N hops; S-D corta re-emit |
| SH-β (designed) | expected pass* | expected 1 | expected 1 (wire) | unchanged | pending | *Riesgo steps abiertos |

## Qualitative scoring (pre-apply)

| Criterio | SH-α | SH-β |
|----------|------|------|
| Alineación session-audit-model | 5 | 2 |
| Blast radius | 4 | 5 |
| Robustez futura | 5 | 3 |
| Reversibilidad | 5 | 5 |
| **Total** | **19** | **15** |

## Acceptance check

Tabla normalizada con filas SH-α y SH-β; métricas definidas para verify post-apply.

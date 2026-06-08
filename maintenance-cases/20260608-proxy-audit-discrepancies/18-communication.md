---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 18-communication
chain: closure
version: v1.0
timestamp: 2026-06-08T18:55:00Z
status: done
case_run: 1
inputs: [17-conclusion.md, 16-solution-analysis.md]
produces: 18-communication.md
links: { previous: 17-conclusion.md, next: "" }
---

# Communication — 20260608-proxy-audit-discrepancies

## Resumen

Corregidos tres defectos de observabilidad causal en la auditoría del proxy detectados en la sesión `7dd03f66-5838-474a-b640-409c3e8d49a0`: workflows wire huérfanos, `messages: []` en continuaciones, y `body.json` sin bloques `text`.

## Causa raíz

Emisión duplicada/errónea de `step_request` desde el correlador + ausencia de cierre wire en `end_turn` + assembler SSE incompleto.

## Solución aplicada

Fix quirúrgico S1 (ver `16-solution-analysis.md ## Solución ganadora`): 5 archivos fuente, 594 tests verdes.

## OpenSpec

- Change: `2026-06-08-fix-proxy-audit-causal-gaps` (archivado)
- Specs actualizadas: `session-persistence`, `gateway-audit-projection`

## Evidencia

- `npm run test:unit` — PASS
- Artefactos SM: `maintenance-cases/20260608-proxy-audit-discrepancies/`

## Deuda residual

- Métricas `session-metrics.json` (`total_workflows`) — seguimiento en caso futuro.
- Validación E2E con sesión live post-deploy.

## Acceptance check

Comunicación autocontenida; cita solución ganadora; change OpenSpec archivado.

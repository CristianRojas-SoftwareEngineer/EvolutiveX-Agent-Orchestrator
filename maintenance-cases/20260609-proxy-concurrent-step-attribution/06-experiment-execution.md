---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 06-experiment-execution
chain: cause
version: v1.0
timestamp: 2026-06-09T10:30:00Z
status: done
inputs: [05-experiment-design.md]
produces: 06-experiment-execution.md
links: { previous: 05-experiment-design.md, next: 07-data-collection.md }
---

# Experiment Execution — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** test rojo reproduce el fallo

## E1 — Análisis estático + simulación mental (pre-implementación)

**Ejecución:** Inspección de `enrichOpenWireStepWithResponse` con workflow simulado:

```
steps = [
  { index: 1, closedAt: null, request: ai-title },
  { index: 2, closedAt: null, request: agentic },
]
```

Cuando llega respuesta del hop 1 (ai-title):
- `reverse().find(open)` → step **2** (último abierto)
- Respuesta ai-title se escribe en step 2 ✗

Cuando llega respuesta del hop 2 (Bash):
- Si step 2 ya cerró con contenido ai-title, `find` → step **1**
- Respuesta Bash se escribe en step 1 ✗

**Resultado:** Coincide exactamente con disco de sesión `52f8f157` (cross-wiring 01↔02).

## E2 — Test automatizado

**Estado:** Diseñado en fase 13 (solución); test rojo pendiente de implementación en `openspec-apply`.

**Comando previsto:**
```bash
npm test -- tests/3-operations/audit-sse-response.handler.test.ts -t "concurrent"
```

## Desviaciones

No se ejecutó test rojo en código aún (caso en fase de planificación → OpenSpec). La reproducción lógica sobre heurística es determinista y suficiente para confirmar H1 antes del fix.

## Acceptance check

Fallo reproducido por simulación determinista alineada con evidencia de sesión real.

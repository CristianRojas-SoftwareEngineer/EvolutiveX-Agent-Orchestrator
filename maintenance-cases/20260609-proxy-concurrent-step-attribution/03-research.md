---
case_id: 20260609-proxy-concurrent-step-attribution
profile: corrective
phase: 03-research
chain: cause
version: v1.0
timestamp: 2026-06-09T10:15:00Z
status: done
inputs: [02-problem-definition.md]
produces: 03-research.md
links: { previous: 02-problem-definition.md, next: 04-hypothesis.md }
---

# Research — 20260609-proxy-concurrent-step-attribution

## Applied policy

- **acceptance:** recall ejecutado; fuentes citadas

## Recall (MEMORY.md)

| Lección | Relevancia |
|---------|------------|
| [proxy-wire-step-unify-request-response-2026-06](.claude/memory/proxy-wire-step-unify-request-response-2026-06.md) | Un hop → un `IStep`; egress debe enriquecer el step correcto, no crear otro |
| [proxy-audit-step-request-emit-2026-06](.claude/memory/proxy-audit-step-request-emit-2026-06.md) | Solo ingress posee body HTTP; `stepIndex` debe ser estable request→response |

## Caso SM relacionado (cerrado)

`20260608-proxy-step-request-response-split` resolvió **doble carpeta** por hop (dos `registerStep`). Este caso es **ortogonal**: un solo `IStep` por hop, pero la respuesta se escribe en el step **equivocado** bajo concurrencia.

## Hallazgos en código

### F1 — Campo `assignedStepIndex` ya existe pero egress lo ignora

```388:411:src/1-domain/types/audit.types.ts
export interface AuditWorkflowContext {
  // ...
  /** Índice del step asignado durante request audit, inmutable hasta response audit. */
  assignedStepIndex: number;
```

`proxy.controller.ts:147` propaga `request.auditStepIndex` al contexto de respuesta.

### F2 — SSE captura índice heurístico al inicio del stream

```52:53:src/3-operations/audit-sse-response.handler.ts
const projectedStepIndex = resolveOpenWireStepIndex(workflow);
```

`resolveOpenWireStepIndex` devuelve el último step sin `closedAt` — incorrecto si hay varios abiertos.

### F3 — Enriquecimiento egress usa misma heurística

```79:80:src/3-operations/gateway-wire-step.util.ts
const openStep = [...workflow.steps].reverse().find((s) => s.closedAt == null);
```

### F4 — Ingress serializa mutaciones con `withSessionLock`

`audit-workflow.handler.ts` abre steps bajo lock de sesión, pero **egress corre en paralelo** por stream HTTP independiente; el lock no protege la atribución response→step.

### F5 — Handler estándar repite el patrón

`audit-standard-response.handler.ts` llama `enrichOpenWireStepWithResponse` sin pasar `assignedStepIndex`.

## Acceptance check

Recall citado; fuentes de código y caso previo documentados.

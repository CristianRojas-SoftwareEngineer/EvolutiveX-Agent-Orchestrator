---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 13-solution-experiment-design
chain: solution
version: v1.0
timestamp: 2026-06-08T14:55:00Z
status: done
inputs: [12-solution-hypothesis.md]
produces: 13-solution-experiment-design.md
links: { previous: 12-solution-hypothesis.md, next: 14-solution-execution.md }
---

# Solution Experiment Design — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **risk_controls:** sandbox, feature_flag (N/A), rollback git entre hipótesis

## Comparative experiment (single batch)

**Métricas compartidas (normalizadas):**

| Métrica | Tipo | Fuente |
|---------|------|--------|
| `stepCount_accuracy` | pass/fail | `result.stepCount === expectedHops` |
| `tool_result_emits` | int | spy EventBus por tool |
| `finalText_sites` | int | workflows con `finalText` definido |
| `interactionType_shell` | string | meta wf 00 |
| `regression_suite` | pass/fail | `npm test` gateway-wire + workflow-repo |

**Condiciones iniciales:** HEAD + tests existentes; implementación secuencial con rollback.

### Run 1 — SH-α

1. Patch `enrichOpenWireStepWithResponse`: en `tool_use`, asignar `closedAt` + `closeStep`.
2. Patch `completeToolUse`: return early si `status === 'completed'|'error'`.
3. Patch `buildWorkflowResult`: omitir `finalText` cuando `workflow.id === workflow.sessionId`.
4. Patch `openWorkflow` en UserPromptSubmit: `workflowKind: 'session-shell'`.
5. Añadir test `gateway-wire-step.util.test.ts` multi-hop.
6. Añadir test `completeToolUse` idempotencia.

**Rollback:** `git checkout --` archivos tocados.

### Run 2 — SH-β (solo si SH-α falla regresión)

Sustituir paso 1 por `stepCount: workflow.steps.length` en `forceClose`; paso 3 usa omit shell.

## Acceptance check

Un experimento comparativo con métricas comunes y rollback explícito.

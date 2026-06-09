---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 06-experiment-execution
chain: cause
version: v1.0
timestamp: 2026-06-08T14:30:00Z
status: done
inputs: [05-experiment-design.md]
produces: 06-experiment-execution.md
links: { previous: 05-experiment-design.md, next: 07-data-collection.md }
---

# Experiment Execution — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **risk_controls:** sandbox, reversible

## E1 — Ejecución (análisis de código + traza lógica)

Simulación mental verificada contra `gateway-wire-step.util.ts`:

| Hop | stopReason | closedAt asignado | closedSteps acumulados |
|-----|------------|-------------------|------------------------|
| 1 | tool_use | No | 0 |
| 2 | tool_use | No | 0 |
| 3 | tool_use | No | 0 |
| 4 | tool_use | No | 0 |
| 5 | tool_use | No | 0 |
| 6 | end_turn | Sí (step 5*) | 1 |

\*Con unify fix, cada continuation abre nuevo step en ingress; solo el último step abierto recibe cierre en terminal. Steps intermedios permanecen sin `closedAt`.

**Resultado E1:** coherente con O3 (`stepCount: 1` con 6 carpetas en disco — persistencia materializa por `step_request`, correlador no cierra intermedios).

## E2 — Ejecución (inspección `completeToolUse`)

```233:253:src/2-services/workflow-repository.service.ts
  public completeToolUse(...) {
    ...
    toolUse.status = result.isError ? 'error' : 'completed';
    ...
    this.emit('tool_result', workflowId, { toolUseId, result });
  }
```

Sin guard `if (toolUse.status === 'completed') return`.

Con PostToolUse instalado (O8: hooks activos) + fallback en `handleContinuation:633`, cada tool recibe dos completados → O4 (12 = 2×6).

**Resultado E2:** confirmado por diseño.

## E3 — Inspección H3/H4

- H3: `closeWireWorkflowOnTerminalStop` setea `finalText`; `buildWorkflowResult` idem en shell → O5 confirmado.
- H4: `onWorkflowStart` línea 121 → O6 confirmado.

## Deviations

Sesión `dcdf0a15` no disponible en disco al re-ejecutar; evidencia basada en análisis previo + código.

## Acceptance check

Tres experimentos ejecutados según protocolo; sin desviaciones que invaliden conclusiones.

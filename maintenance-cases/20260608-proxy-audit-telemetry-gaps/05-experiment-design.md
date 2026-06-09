---
case_id: 20260608-proxy-audit-telemetry-gaps
profile: corrective
phase: 05-experiment-design
chain: cause
version: v1.0
timestamp: 2026-06-08T14:25:00Z
status: done
inputs: [04-hypothesis.md]
produces: 05-experiment-design.md
links: { previous: 04-hypothesis.md, next: 06-experiment-execution.md }
---

# Experiment Design — 20260608-proxy-audit-telemetry-gaps

## Applied policy

- **risk_controls:** sandbox (tests unitarios, sin sesión live)

## Protocol

### E1 — H1 stepCount (unit)

**Setup:** `WorkflowRepositoryService` + `registerWireStepInCorrelator` / `enrichOpenWireStepWithResponse` con workflow wire (`id !== sessionId`).

**Steps:**
1. Abrir step 0 vía `registerStep` (simula ingress).
2. Enriquecer con `stopReason: 'tool_use'` (simula egress hop 1).
3. Repetir para hops 2–3 con `tool_use`.
4. Enriquecer hop 4 con `stopReason: 'end_turn'`.
5. Leer `workflow.result.stepCount` tras `forceClose` implícito.

**Expected (pre-fix):** `stepCount === 1`.

**Controls:** workflow sin cierre previo; `forceNew` wire.

**Rollback:** N/A (solo lectura estado).

### E2 — H2 tool_result duplicado (unit)

**Setup:** Repo en memoria + spy en `emit`.

**Steps:**
1. `registerToolUse` para tool T1.
2. `completeToolUse(T1)` — simula PostToolUse.
3. `completeToolUse(T1)` — simula continuation fallback.

**Expected (pre-fix):** 2 emisiones `tool_result`.

### E3 — H3/H4 (inspección estática)

Revisar `closeWireWorkflowOnTerminalStop` vs `buildWorkflowResult` y payload `workflow_start` del shell.

## Acceptance check

Procedimiento ejecutable en `tests/` sin dependencia de sesión en disco.

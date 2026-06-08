---
case_id: 20260608-proxy-audit-residual-gaps
profile: corrective
phase: 06-experiment-execution
chain: cause
version: v1.0
timestamp: 2026-06-08T23:35:00Z
status: done
inputs: [05-experiment-design.md]
produces: 06-experiment-execution.md
links: { previous: 05-experiment-design.md, next: 07-data-collection.md }
---

# Experiment Execution — 20260608-proxy-audit-residual-gaps

## Applied policy

- **acceptance:** test rojo reproduce el fallo

## E1 — Config hooks (pre-fix)

```text
grep PostToolUse ~/.claude/settings.json → solo PostToolUseFailure
grep PostToolUse configs/hooks.json → matcher * presente
```

**Resultado:** H1 config confirmada — relay PostToolUse no instalado en user-level.

## E2 — Logs proxy (sesión c5eb2667)

```text
PreToolUse: 2 | PostToolUse: 0 | hook desconocido (vacío): 116
```

**Resultado:** PostToolUse nunca procesado por `AuditHookEventHandler`.

## E3 — Tests (ejecutados tras implementación solución)

```bash
npm test
```

Ver `07-data-collection.md` para resultados post-fix.

## Deviations

- No se re-ejecutó sesión live end-to-end; validación vía tests unitarios/integración.

## Acceptance check

E1–E2 reproducen síntomas; E3 documentado en fase 07.

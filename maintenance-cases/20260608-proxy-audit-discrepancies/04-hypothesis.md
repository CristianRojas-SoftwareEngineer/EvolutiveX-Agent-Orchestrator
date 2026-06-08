---
case_id: 20260608-proxy-audit-discrepancies
profile: corrective
phase: 04-hypothesis
chain: cause
version: v1.0
timestamp: 2026-06-08T18:38:00Z
status: done
inputs: [03-research.md]
produces: 04-hypothesis.md
links: { previous: 03-research.md, next: 05-experiment-design.md }
---

# Hypothesis — 20260608-proxy-audit-discrepancies

## Applied policy

- **acceptance:** ≥1 hipótesis falsable

## Hypotheses

| ID | Status | Hipótesis | Predicción | Refutación |
|----|--------|-----------|------------|------------|
| H1 | pending | Los workflows wire no reciben `workflow_complete` porque `registerWireStepInCorrelator` solo cierra steps, no workflows, y el hook Stop solo cierra el workflow sesión. | Tras `end_turn` en SSE, el workflow wire sigue `running` en correlador y disco. | Si `workflow_complete` se emite para wire en `end_turn`, meta pasa a `completed`. |
| H2 | pending | `messages: []` en continuaciones se debe a que `registerStep` emite `step_request` con `inferenceRequest` vacío y/o `stepIndex` off-by-one en el segundo emit. | Test que simule continuation escribe `messages: []` al step correcto. | Tras fix, `request/body.json` contiene messages con tool_result. |
| H3 | pending | `body.json` incompleto se debe a que `StepAssemblerService` no procesa bloques `text`. | Feed SSE con `text_delta` produce assistantMessage sin bloque text. | Tras añadir handler text, body incluye bloque text. |
| H4 | pending | `tool_result` no persiste porque `registerStep` response-path emite `step_request` antes de `tool_call`, o el tool no queda en `step.toolUses` cuando llega PostToolUse. | Test integración: stream SSE con Bash → PostToolUse sin `tool_result` event. | Tras orden correcto de eventos, `tool_result` llega a persistence. |

## Active candidate

**H1 + H2 + H3** son causas independientes que explican los síntomas 1-7 del observation. **H4** puede ser efecto colateral de H2 (tool registrado pero step index incorrecto en persistence).

## Acceptance check

4 hipótesis falsables con predicción y criterio de refutación.

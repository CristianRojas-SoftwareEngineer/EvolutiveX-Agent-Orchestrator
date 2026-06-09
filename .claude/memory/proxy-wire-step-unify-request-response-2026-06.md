# Wire step: unificar request/response en un IStep

**Tags:** `proxy`, `audit`, `gateway`, `IStep`, `session-audit-model`, `corrective`

## Lesson

En el pipeline wire, ingress (`registerWireStepRequest`) y egress (`registerWireStepInCorrelator`) no deben llamar `registerStep` independientemente. El diseño canónico (`session-audit-model.md`) exige un `steps/MM/` con `request/` y `response/` por hop. Egress debe enriquecer el último step sin `closedAt` vía `enrichOpenWireStepWithResponse`. Los chunks SSE deben usar `resolveOpenWireStepIndex`, no `workflow.steps.length`.

## Trigger

Carpetas `steps/` alternadas request-only / response-only; `stepCount` ≠ número de directorios.

## Fix reference

Caso `20260608-proxy-step-request-response-split`; change `align-wire-step-request-response`.

## Why

Tras `unify-turn-workflow`, varios hops HTTP del mismo turno (p. ej. `side-request` `ai-title` + hop `agentic` fresh) pueden estar abiertos en paralelo. El ingress asigna `assignedStepIndex` por request, pero el egress enriquece el «último step abierto», produciendo **cross-wiring** en `steps/MM/response/` (evidencia: sesión `52f8f157-f66a-4211-931d-93fe9c2b345d`). Esto rompe la trazabilidad forense del proxy justo cuando el modelo unificado concentra todos los hops en un solo workflow.

## What Changes

- Introducir enriquecimiento de step por **índice explícito** (`assignedStepIndex`) en egress SSE y estándar.
- Emitir `stream_chunk` y `step_response` con el índice fijado en ingress, no con heurística del último step abierto.
- Añadir test de regresión con dos hops concurrentes abiertos en el mismo workflow.
- Documentar en spec la obligación de correlación estable ingress→egress bajo concurrencia.

## Capabilities

### New Capabilities

_(ninguna — corrección sobre capacidad existente)_

### Modified Capabilities

- `gateway-audit-projection`: egress SHALL atribuir respuestas al step cuyo índice fue asignado en ingress, incluso con múltiples steps abiertos concurrentemente.

## Impact

| Área | Detalle |
|------|---------|
| **Capa 3** | `audit-sse-response.handler.ts`, `audit-standard-response.handler.ts`, `gateway-wire-step.util.ts` |
| **Capa 1** | Sin cambios de tipos (`assignedStepIndex` ya existe en `AuditWorkflowContext`) |
| **Tests** | `audit-sse-response.handler.test.ts`, `gateway-wire-step.util.test.ts` |
| **Docs** | Referencia cruzada en `docs/session-audit-model.md` solo si el delta spec lo exige |
| **Sesiones históricas** | Sin migración de disco |

## No objetivos

- Serializar globalmente las respuestas HTTP del harness.
- Corregir drift de `session_totals.total_workflows`.
- Migrar artefactos de sesiones ya grabadas con cross-wiring.

## Why

La implementación actual fragmenta un único turno de usuario en **tres workflows hermanos** (`session-shell`, `side-request`, `agentic`), contradiciendo el modelo documentado en [`docs/session-audit-model.md`](../../../docs/session-audit-model.md) §2 (ciclo E2E `UserPromptSubmit` → `Stop`). Evidencia: sesión `24b95025` — un turno del harness produce tres carpetas `workflows/NN/` y tres entradas en `workflow-sequence.json`. Además, los índices en disco mezclan convenciones base 0 (código) y base 1 (documentación), generando `workflows/00` para el primer turno y drift entre correlador y persistencia.

Este change fusiona el ciclo en **un workflow por turno**, promueve hops HTTP auxiliares a **steps** (`stepKind`), adopta numeración **base 1** coherente y excluye conscientemente los preflights del árbol causal.

## What Changes

- **BREAKING**: Eliminar `session-shell` como `WorkflowRequestKind` e `interactionType`; `UserPromptSubmit` abre workflow de turno con `interactionType: agentic`.
- **BREAKING**: `side-request` y `fresh` agentic dejan de abrir workflows hermanos; se registran como steps bajo el turno activo (`stepKind`).
- **BREAKING**: SSE `end_turn` cierra solo el step, no el workflow de turno; cierre E2E exclusivamente vía hook `Stop` / `SubagentStop`.
- **BREAKING**: Índices de display base 1 en disco, eventos y dominio (`workflows/01/`, `steps/01/`, `tools/01-…`); retirar offset `+1` ad hoc en `workflowDirAbs`.
- Nuevo campo `stepKind` en `IStep` y eventos `step_request` (`agentic` | `side-request`).
- `IWorkflowResult` único por turno: `finalText` solo desde hook (`last_assistant_message`); `stepCount` agrega todos los hops cerrados.
- Preflights (`preflight-quota`, `preflight-warmup`): `AuditWorkflowHandler` retorna `null` (sin auditoría causal); el proxy **sigue reenviando** upstream.
- `withSessionLock` en mutaciones HTTP del handler para serializar side-request + agentic concurrentes.
- Paridad de reglas (fusión, numeración, cierre) entre workflow main y sub-workflow anidado bajo `tools/…/sub-agent/workflow/`.

## Capabilities

### New Capabilities

_(ninguna — extensiones y correcciones de requisitos existentes)_

### Modified Capabilities

- `gateway-workflow-lifecycle`: apertura de turno en `UserPromptSubmit` (`agentic`, no `session-shell`); eliminación de requisitos shell/`finalText` duplicado; cierre E2E por hook.
- `gateway-audit-projection`: side-request/fresh como steps del turno; `end_turn` no cierra workflow; preflights sin auditoría; `withSessionLock`; `stepKind` en ingress.
- `gateway-closure-services`: `buildWorkflowResult` incluye `finalText` del hook en workflow de turno; sin omisión por shell.
- `gateway-domain-types`: `StepKind`; retirar `session-shell` de taxonomía activa; `IStep.stepKind`.
- `session-persistence`: `interactionType` sin `session-shell` ni `client-preflight`; proyección `stepKind`; `workflow-sequence.json` una fila por turno; índices base 1.
- `session-routing`: contrato 1-based en escenarios (`getWorkflowDir(s, 1)` → `workflows/01/`).

## No objetivos

- Migrar sesiones históricas con layout de tres workflows por turno o índices base 0.
- Reescribir `RequestClassifierService` ni la heurística de clasificación HTTP.
- Reincorporar preflights al árbol causal en un change posterior (exclusión permanente documentada).
- Promover sub-workflows al nivel `sessions/<id>/workflows/NN/` (siguen anidados bajo el tool `Agent`).
- Cambiar el contrato wire del proxy hacia Anthropic.

## Impact

| Capa PKA | Archivos / áreas |
|----------|------------------|
| 1-domain | `IStep.ts`, `audit.types.ts`, `build-workflow-result.ts` |
| 2-services | `workflow-repository.service.ts`, `session-persistence.service.ts`, `session-routing.ts` |
| 3-operations | `audit-workflow.handler.ts`, `audit-hook-event.handler.ts`, `gateway-wire-step.util.ts` |
| tests | `session-routing.test.ts`, `audit-workflow.handler.test.ts`, `gateway-wire-step.util.test.ts`, `audit-hook-event.handler.test.ts`, `session-persistence.test.ts` |
| docs/specs | `docs/session-audit-model.md`; deltas en `openspec/specs/` vía sync post-archive |

Referencia de diseño: [`docs/proposals/design.md`](../../../docs/proposals/design.md).

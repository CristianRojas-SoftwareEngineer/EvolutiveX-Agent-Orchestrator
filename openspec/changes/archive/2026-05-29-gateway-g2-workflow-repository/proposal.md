> **Orquestador:** `gateway-migration` | **Fase:** g2 (Refactor gateway)

## Why

Los modelos de dominio del bloque G1 (`Workflow`, `Step`, `ToolUse`, `WorkflowResult`) y los servicios de cierre (`buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`, `aggregateWorkflowUsage`) existen en capa 1 pero no están cableados a ningún correlador ni handler: `IWorkflowRepository` solo expone los tres métodos de correlación wire de C1/C2, y `AuditHookEventHandler` mantiene como stubs los eventos de cierre (`Stop`, `SubagentStop`, `StopFailure`, `UserPromptSubmit`). G2 completa el lifecycle del correlador unificando las costuras de C1/C2/C3 con los modelos de dominio de G1 y habilitando el cierre E2E por hooks.

## What Changes

- **`IWorkflowRepository` (capa 1, port):** se amplía con el lifecycle completo — apertura de workflow main y subagente, registro y cierre de steps y tool_uses, `readyToClose` (predicado §15.4) y `close` (invoca `buildWorkflowResult`).
- **`WorkflowRepositoryService` (capa 2, adapter en memoria):** se amplía para implementar el nuevo lifecycle conservando los métodos wire de C1/C2 y los índices `agentId` / `tool_use_id`. Corre en paralelo al pipeline legacy `ISessionStore`/`ActiveInteraction` (doble estado transitorio hasta G4).
- **`AuditHookEventHandler` (capa 3):** se des-stubea `UserPromptSubmit`, `Stop`, `SubagentStop` y `StopFailure`; cada evento delega en `repo.readyToClose` / `repo.close`.
- **`ActiveInteraction`:** permanece `@deprecated` (ya lo está); retiro efectivo diferido a G4.

## Capabilities

### New Capabilities

- `gateway-workflow-lifecycle`: lifecycle completo del correlador `IWorkflowRepository` — apertura de workflows (main y subagente), registro/cierre de steps y tool_uses, predicado `readyToClose` (§15.4), operación `close` que invoca `buildWorkflowResult` (G1); delegación de eventos de cierre del `AuditHookEventHandler` en el repo; idempotencia ante hooks duplicados (§28).

### Modified Capabilities

- `hooks-lifecycle-correlation`: el requisito "Mapeo de eventos al correlador" cambia — `Stop`, `SubagentStop`, `StopFailure` y `UserPromptSubmit` dejan de ser stubs y pasan a delegar en el repo; la tabla de comportamiento y los escenarios del handler se extienden con el contrato G2.

## Impact

**Capas PKA afectadas:**
- 1-domain: `src/1-domain/repositories/IWorkflowRepository.ts`
- 2-services: `src/2-services/workflow-repository.service.ts`
- 3-operations: `src/3-operations/audit-hook-event.handler.ts`

**No objetivos:**
- Proyección de `WorkflowResult` a disco / `sessions/` (G4).
- Extracción de `StepAssembler` desde `audit-sse-response.handler` (G3).
- Retiro efectivo de `ActiveInteraction` y del cierre wire-only como ruta principal (G4).
- Cálculo de `totalCostUsd` / pricing.
- Implementación del bus de eventos `IEventBus` / `EventBus` (§28b) — la conexión correlador–persistencia es G4.

Ver §15, §28, §40, §41, §43 de [`docs/proposals/gateway-design.md`](../../../docs/proposals/gateway-design.md).

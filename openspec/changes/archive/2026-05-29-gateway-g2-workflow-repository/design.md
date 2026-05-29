## Context

G1 dejó los modelos de dominio (`IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`) y los servicios de cierre (`buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`, `aggregateWorkflowUsage`) en capa 1 sin cablear a ningún correlador. Las fases C1/C2/C3 dejaron costuras de correlación wire y hooks (`openSubagentFromWire`, `getWorkflowByAgentId`, `confirmSubagentFromHook`) con un `IWorkflowRepository` mínimo y un `AuditHookEventHandler` con los eventos de cierre como stubs.

**Estado actual relevante:**
- `IWorkflowRepository` (`src/1-domain/repositories/IWorkflowRepository.ts`): 3 métodos wire, retorna `WireSubagentEntry` (no `IWorkflow`).
- `WorkflowRepositoryService` (`src/2-services/workflow-repository.service.ts`): adapter en memoria, implementa los 3 métodos wire.
- `AuditHookEventHandler` (`src/3-operations/audit-hook-event.handler.ts`): `Stop`/`SubagentStop`/`StopFailure`/`UserPromptSubmit` son stubs con log "diferido a G2/C4".
- `ActiveInteraction` en `ISessionStore`: estado activo del pipeline legacy; `@deprecated` desde G1.

**Restricción central:** G2 no toca `ISessionStore`, `SessionService` ni la proyección a disco (`sessions/`). El lifecycle nuevo corre enteramente en memoria hasta G4.

---

## Goals / Non-Goals

**Goals:**
- Ampliar `IWorkflowRepository` (port capa 1) con el lifecycle completo: apertura de workflows, registro y cierre de steps/tool_uses, `readyToClose` (§15.4) y `close` (invoca `buildWorkflowResult`).
- Ampliar `WorkflowRepositoryService` (adapter capa 2) para implementar el lifecycle, preservando los métodos wire de C1/C2.
- Des-stub `AuditHookEventHandler` (capa 3): `Stop`, `SubagentStop`, `StopFailure` y `UserPromptSubmit` delegan en el repo.
- Mantener `ActiveInteraction` como `@deprecated` con retiro planificado en G4 (no eliminar en G2).

**Non-Goals:**
- Proyección del `WorkflowResult` a disco / `sessions/` (G4).
- Extracción de `StepAssembler` desde `audit-sse-response.handler` (G3).
- Retiro efectivo de `ActiveInteraction`, del cierre wire-only ni de `ISessionStore` (G4).
- Cálculo de `totalCostUsd` / pricing (G4+).
- Implementación del bus de eventos `IEventBus` / `EventBus` (§28b) — G4.
- Des-stub de `PreToolUse`, `PostToolUse`, `PostToolUseFailure` (ToolUse.status tracking → G4).

---

## Decisions

### 1. Ampliar `IWorkflowRepository` en lugar de crear una nueva interface

`IWorkflowRepository` ya es el punto de acoplamiento entre los handlers de capa 3 y el correlador. Añadir el lifecycle como métodos adicionales en el mismo port mantiene un único correlador al que los handlers siempre tienen acceso por DI.

**Alternativa descartada:** crear `IWorkflowLifecycleRepository extends IWorkflowRepository`. Rechazada: añade una capa de indirección sin beneficio hasta G4; los handlers tendrían que depender de dos ports o de una unión, complicando el composition root.

### 2. Los métodos wire existentes se mantienen sin cambios

`openSubagentFromWire` devuelve `WireSubagentEntry` (no `IWorkflow`). En G2, los nuevos métodos de lifecycle devuelven `IWorkflow`. Coexisten en el mismo port y adapter. El adapter unifica el índice `agentId` internamente.

**Tradeoff:** el port queda heterogéneo transitoriamente (mezcla `WireSubagentEntry` e `IWorkflow`). Aceptable porque la unificación completa es G3/G4; documentar con `@deprecated` en los métodos wire no aplicable en G3.

### 3. `readyToClose` recibe el hook completo

§15.4 evalúa `stop_hook_active` y `background_tasks` del hook payload. Pasar el `ClaudeHookEvent` directamente evita extraer campos en el handler y mantiene el predicado expresivo en términos del dominio. Sin I/O.

### 4. `StopFailure` no pasa por `readyToClose`

§15.4 dice explícitamente "Siempre al recibir el hook" para `StopFailure`. El handler invoca `close` directamente. Esto no es una excepción sino el contrato del dominio.

### 5. Lifecycle en paralelo al legacy (`ActiveInteraction`)

El pipeline legacy (`ISessionStore` → `ActiveInteraction` → proyección a disco) sigue operativo sin cambios. El lifecycle nuevo (`IWorkflowRepository` → `IWorkflow` en memoria) corre en paralelo. Los handlers de wire (`AuditInteractionHandler`, `AuditSseResponseHandler`) siguen usando `ISessionStore`; `AuditHookEventHandler` usa el repo para los eventos de cierre.

**Riesgo:** doble estado transitorio hasta G4. Mitigación: `ActiveInteraction` marcado `@deprecated` (ya lo está); task explícita de retiro en el `tasks.md` del orquestador para G4; sin riesgo de divergencia en G2 porque los handlers de wire no leen del repo nuevo y el repo nuevo no escribe a disco.

---

## Risks / Trade-offs

- **`getWorkflowByAgentId` devuelve `WireSubagentEntry` (C1/C2) vs `IWorkflow` (G2):** El handler necesita resolver el `workflowId` para invocar `readyToClose`/`close`. Solución en el adapter: el índice interno por `agentId` apunta a `IWorkflow`; `getWorkflowByAgentId` existente puede sobrecargarse o el handler usa un nuevo método `getWorkflowByAgentId` con retorno `IWorkflow | undefined`. Decisión de implementación: preferir un método getter overloaded o un segundo getter renombrado al diseñar los tests.

- **Carreras hook-antes-wire (§28):** `UserPromptSubmit` puede llegar antes que el primer POST wire del main workflow. El adapter debe manejar esta carrera (similar a `confirmSubagentFromHook`): crear un placeholder en `readyToClose: false` hasta que el wire abra el workflow.

- **Hooks duplicados:** `Stop` puede llegar dos veces (reintento del hook runner de Claude Code). `close` es idempotente: si `workflow.result != null`, devuelve el resultado existente sin mutar.

---

## Archivos concretos a modificar

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/1-domain/repositories/IWorkflowRepository.ts` | Ampliar port con 8 métodos de lifecycle |
| `src/2-services/workflow-repository.service.ts` | Ampliar adapter con implementación en memoria |
| `src/3-operations/audit-hook-event.handler.ts` | Des-stub 4 eventos; delegar en repo |
| `docs/session-audit-model.md` | Actualizar: estado activo = `IWorkflowRepository`; lifecycle de cierre |

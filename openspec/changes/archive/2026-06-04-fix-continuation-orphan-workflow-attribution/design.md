## Context

`AuditSseResponseHandler` (`src/3-operations/audit-sse-response.handler.ts`) y `AuditStandardResponseHandler` reciben un `AuditWorkflowContext` con `auditSessionId` y otros campos. La primera acción del SSE handler es `workflowRepo.getWorkflowBySessionId(context.auditSessionId)` (línea 45), que devuelve el workflow con `id == sessionId` o el primer `kind: 'main'` que coincida por `sessionId`. Este lookup es correcto para inferencias del main workflow abiertas por `UserPromptSubmit`, pero **falla sistemáticamente para continuations y subagentes**: el workflow recién abierto por `AuditWorkflowHandler.handleContinuation` (con id `wire-N`) nunca es el que devuelve este lookup. Consecuencia: `registerPendingToolUse` se invoca contra el workflow incorrecto, `toolUseIdToWorkflowId` queda indexado contra el main equivocado, y la siguiente continuation que llegue no encuentra padre (porque la búsqueda por `toolUseId` da el main, que ya está cerrado).

`AuditHookEventHandler` (`src/3-operations/audit-hook-event.handler.ts:53`) tiene un fallo paralelo: en `SubagentStop` invoca `getWorkflow(agentId)` directamente, tratando el `agentId` (clave del índice `WireSubagentEntry`) como si fuera un `workflowId` (clave del índice `Workflow`). No hay datos activos en logs, pero es un drift latente confirmado por lectura de código.

`forceClose` en `WorkflowRepositoryService` (`src/2-services/workflow-repository.service.ts:300`) fija `closedByEvent: 'StopFailure'` como literal sin importar el outcome; el campo debería reflejar el evento que originó el cierre o ser opcional.

Diagnóstico completo: `docs/issues/CONTINUATION-ORPHAN-DRIFT.md`.

## Goals / Non-Goals

**Goals:**

- Atribuir los chunks SSE, `step_response`, `tool_call` y `registerPendingToolUse` al workflowId específico que abrió el `AuditWorkflowHandler` para la request actual, no al main de la sesión.
- Eliminar la cascada de orphans en `server/logs.jsonl` para sesiones con Agent general-purpose que producen muchas continuations.
- Corregir el lookup de subagentes en `SubagentStop` para usar la indirección correcta `getWorkflowByAgentId(agentId) → getWorkflow(workflowId)`.
- Limpiar el índice `toolUseIdToWorkflowId` en paths de error (`stream.on('error')`, `audit-upstream-error.handler`).
- Corregir el `closedByEvent` de `forceClose` para que refleje el evento real o se omita.
- Preservar la correlación exacta `toolUseId → workflowId` (no heurísticas).
- Mantener compatibilidad del wire protocol y del layout en disco.

**Non-Goals:**

- Cambiar la semántica de `findWorkflowByToolUseId` (mantener exact lookup).
- Introducir heurísticas de fallback como "último workflow running" o "FIFO".
- Migrar workflows huérfanos ya persistidos en sesiones existentes.
- Resolver el drift del layoutIndex (que `workflows/00` sea subagente vs main).
- Resolver el drift #2 de `stop-hook-ux.ts` con `CLAUDE_PROJECT_DIR` (no verificado en logs activos).
- Cambiar copy del catálogo de notificaciones o声响.

## Decisions

### Decisión 1: Propagar `workflowId` en `AuditWorkflowContext` (no derivar por sessionId)

**Por qué:** El `AuditWorkflowContext` ya contiene `auditSessionId` y otros campos derivados de la request. `AuditWorkflowResult.workflowId` ya existe como campo obligatorio. Propagar este `workflowId` al `AuditWorkflowContext` es el cambio más pequeño que garantiza la atribución correcta.

**Alternativas consideradas:**

- (A) Pasar el `workflowId` como parámetro adicional en `execute()` del SSE handler. **Descartada**: rompe la firma pública del handler sin justificación; el `AuditWorkflowContext` ya es el contrato de transporte entre el orquestador y los handlers.
- (B) Resolver el workflow por `layoutIndex` en vez de por `sessionId`. **Descartada**: el `layoutIndex` se asigna en `openWireWorkflow` y no está en el `AuditWorkflowContext` por defecto. Introduce nueva indirección sin simplificar.
- (C) Reutilizar `auditSessionId` como `workflowId` cuando el workflow main tiene `id == sessionId`. **Descartada**: perpetúa la ambigüedad para subagentes y continuations.

**Forma final:** añadir `workflowId: string` como campo obligatorio en `AuditWorkflowContext`. El orquestador que llama a `AuditSseResponseHandler.execute()` y `AuditStandardResponseHandler.execute()` es responsable de poblarlo con el `workflowId` del `AuditWorkflowResult` que devolvió `AuditWorkflowHandler.execute()`. Compatibilidad: si un llamador legacy no lo propaga, el lookup cae al fallback `getWorkflowBySessionId` (defensivo, no recomendado en código nuevo).

### Decisión 2: Cambiar el lookup en el SSE handler a `getWorkflow(context.workflowId)` con fallback

**Por qué:** Es el cambio puntual que cierra la causa raíz. `getWorkflow(workflowId)` devuelve exactamente el workflow recién abierto por `AuditWorkflowHandler` para la request actual.

**Implementación concreta (`audit-sse-response.handler.ts:45`):**

```typescript
const workflow = context.workflowId
  ? this.workflowRepo.getWorkflow(context.workflowId)
  : this.workflowRepo.getWorkflowBySessionId(context.auditSessionId);
if (!workflow) return;
```

**Riesgo residual:** si el `workflowId` ya fue `forceClose`-d antes de que llegue el SSE (escenario orphan genuino por error upstream), `getWorkflow(workflowId)` aún devuelve el workflow (los workflows cerrados siguen en el map del repo). Esto es deseable: queremos que el SSE handler pueda completar la atribución aunque el workflow esté cerrado. Si el workflow no existe (caso patológico), `if (!workflow) return` lo trata como no-op.

### Decisión 3: Corregir el lookup de subagente en `SubagentStop`

**Por qué:** `audit-hook-event.handler.ts:53` invoca `getWorkflow(agentId)` directamente. `agentId` es clave del mapa `index` (que contiene `WireSubagentEntry`), no del mapa `workflows`. El lookup correcto es indirección: `getWorkflowByAgentId(agentId)?.workflowId` y luego `getWorkflow(workflowId)`.

**Cambio concreto:**

```typescript
case 'SubagentStop': {
  const agentId = event.agentId;
  if (!agentId) break;
  const entry = this.workflowRepo.getWorkflowByAgentId(agentId);
  if (!entry) break;
  // entry puede ser WireSubagentEntry; el workflowId es agentId
  // o el workflowId asignado en openSubagentFromWire
  const wf = this.workflowRepo.getWorkflow(entry.workflowId ?? entry.agentId);
  ...
}
```

**Pendiente de verificación:** el tipo `WireSubagentEntry` actualmente no tiene `workflowId` explícito; el mapeo `agentId → workflowId` lo realiza `openSubagentWorkflow` al crear el subagente con `workflow.id = agentCtx.agentId`. Si `agentCtx.agentId` está presente, el `workflowId` ES el `agentId`. Si está ausente, el workflow tiene id `${sessionId}-sub-${layoutIndex}`. Hay que verificar este contrato en `openSubagentWorkflow` antes de cerrar el fix.

### Decisión 4: Corregir `closedByEvent` en `forceClose`

**Por qué:** `forceClose` es el path de cierre para outcomes que no vienen de un hook event (`orphaned`, `upstream-error`, `truncated`). El campo `closedByEvent` no debería ser `'StopFailure'` para todos los casos.

**Cambio concreto (`workflow-repository.service.ts:289-312`):**

```typescript
public forceClose(
  workflowId: string,
  outcome: WorkflowOutcome,
  resultExtras?: Record<string, unknown>,
): void {
  ...
  const result: IWorkflowResult = {
    outcome,
    stepCount: closedSteps.length,
    // Omitir closedByEvent cuando el cierre no viene de un hook event
    sessionId: workflow.sessionId,
    ...(resultExtras ?? {}),
  };
  ...
}
```

**Compatibilidad:** los tests existentes que lean `result.closedByEvent` después de un `forceClose` deben actualizarse. Verificar tests en `tests/2-services/workflow-repository.test.ts` y `tests/3-operations/audit-workflow.handler.test.ts`.

### Decisión 5: Limpieza del índice `toolUseIdToWorkflowId` en error paths

**Por qué:** si un stream SSE se aborta o hay un error upstream entre `content_block_start` y `stream.on('end')`, el `registerPendingToolUse` completo nunca se invoca. La entrada de `toolUseIdToWorkflowId` queda apuntando a un workflow cerrado, lo que confunde a `findWorkflowByToolUseId` en futuras continuations.

**Cambio concreto:** añadir un método al `IWorkflowRepository` para limpiar entradas por workflow:

```typescript
public clearToolUseIndexFor(workflowId: string): void {
  for (const [toolId, wfId] of this.toolUseIdToWorkflowId) {
    if (wfId === workflowId) this.toolUseIdToWorkflowId.delete(toolId);
  }
}
```

Este método ya existe implícitamente dentro de `forceClose` (línea 309-311). Promoverlo a método público permite invocarlo desde `stream.on('error')` y desde `audit-upstream-error.handler`.

### Decisión 6: Actualizar el test que valida orphans como contrato intencional

**Por qué:** el test `'continuation sin tool_use_id registrado crea workflow orphan'` (`tests/3-operations/audit-workflow.handler.test.ts:184`) actualmente valida el comportamiento patológico. Con el fix, este comportamiento solo debe ocurrir cuando el SSE nunca llegó (error upstream genuino), no por identificación incorrecta.

**Cambio en el test:** añadir un comentario que aclare que el caso es "toolUseIds no se encontraron porque el SSE del response anterior falló o nunca llegó". El test sigue pasando porque `forceClose(workflowId, 'orphaned', { continuationOrphan: true })` sigue siendo el comportamiento por defecto cuando `findWorkflowByToolUseId` no encuentra nada.

## Risks / Trade-offs

- **[Riesgo] Cambio de tipo `AuditWorkflowContext`**: añadir `workflowId: string` como campo obligatorio rompe la compilación en todos los llamadores. **Mitigación:** ejecutar `npm run typecheck` y corregir todos los puntos donde se construye el contexto. Si hay muchos sitios, considerar hacerlo opcional con fallback al lookup por sessionId (decisión 2), pero pierde la garantía de atribución correcta.

- **[Riesgo] `getWorkflow(workflowId)` para workflows cerrados**: el repo en memoria mantiene workflows cerrados en el map. Si el SSE handler busca un workflow ya cerrado por `forceClose` (escenario orphan), todavía lo encuentra. **Mitigación:** verificar que `getWorkflow` no filtre por status. Si filtra, hay que cambiar la semántica o capturar el resultado aunque esté cerrado.

- **[Riesgo] `SubagentStop` lookup de agentId → workflowId**: el contrato actual no es explícito sobre si `WireSubagentEntry.workflowId` debe existir. **Mitigación:** verificar el código de `openSubagentWorkflow` y añadir el campo si no existe, o documentar que `workflowId === agentId` cuando `agentCtx.agentId` está presente.

- **[Riesgo] `closedByEvent` change rompe tests existentes**: los tests que esperan `'StopFailure'` en `result.closedByEvent` después de un `forceClose` fallarán. **Mitigación:** actualizar los tests. El cambio es backward-incompatible solo en el sentido de que el campo ahora es opcional.

- **[Riesgo] Limpieza del índice no es atómica con el SSE handler**: si el SSE handler publica un `tool_call` después de que `forceClose` limpió el índice, hay inconsistencia. **Mitigación:** el `forceClose` se invoca solo en `handleContinuation` después de que el SSE del response anterior ya se procesó (es el caso orphan genuino). En el flujo normal, el SSE handler llama `registerPendingToolUse` ANTES de que la siguiente continuation llegue. No hay race condition real.

## Migration Plan

1. **Desarrollo:** implementar los cambios en orden PKA (1-domain → 2-services → 3-operations → 4-api).
2. **Tests unitarios:** actualizar `tests/2-services/workflow-repository.test.ts` (forceClose), `tests/3-operations/audit-sse-response.handler.test.ts` (nuevo escenario de atribución), `tests/3-operations/audit-workflow.handler.test.ts` (test de orphan genuino), `tests/3-operations/audit-hook-event.handler.test.ts` (lookup de SubagentStop).
3. **Verificación local:** `npm run test:quick` (lint + typecheck + unit). `npm run test` si el change afecta build.
4. **Verificación de regresión:** levantar el proxy con la sesión `fe6e7d92-...` (o una equivalente con muchos tool_use) y verificar que:
   - Los wire-N reciben los `stream_chunks`, `step_response`, y `tool_call` esperados.
   - El workflow main con id=sessionId no recibe contenido de otros workflows.
   - El log no contiene warnings `[audit] No se encontró workflow padre para continuation`.
5. **Sync OpenSpec:** ejecutar `openspec sync` para que las modificaciones a `openspec/specs/` se reflejen en el spec vivo tras archivar el change.
6. **Archive:** `openspec archive fix-continuation-orphan-workflow-attribution` tras la implementación.

## Open Questions

- ¿El contrato de `WireSubagentEntry.workflowId` debe ser explícito o se mantiene implícito (workflowId === agentId cuando presente)? Esto afecta a la decisión 3.
- ¿Hay algún path en el composition root donde el `AuditWorkflowContext` se construya sin haber pasado por `AuditWorkflowHandler.execute()` (y por tanto sin `workflowId` disponible)? Si lo hay, el fallback a `getWorkflowBySessionId` se justifica en esos puntos; si no, se puede hacer obligatorio sin excepciones.
- ¿El `audit-upstream-error.handler` debe invocar `clearToolUseIndexFor(workflowId)` para todos los workflows de la sesión o solo para el workflow específico del error? La primera opción es más segura pero borra pendings de otros workflows que aún podrían completarse.

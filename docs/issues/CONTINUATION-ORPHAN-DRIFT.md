# Continuation Orphan Drift — Diagnóstico basado en datos

## Síntoma observable

Warning recurrente en `server/logs.jsonl` (50 ocurrencias en la sesión `fe6e7d92-6ed3-4cb9-9144-79ce74178c48`):

```
[audit] No se encontró workflow padre para continuation — creando workflow standalone
```

8 de las 50 ocurrencias tienen `toolUseIds: []` (el body de la request no contiene `tool_result`).

## Datos verificados (sesión `fe6e7d92-6ed3-4cb9-9144-79ce74178c48`)

### Estructura en disco (tree /F + análisis programático)

| Métrica | Valor |
|---------|-------|
| Total de workflows en `workflows/` | 65 |
| Workflows con `continuationOrphan: true` | 49 |
| Workflows con `status: running` sin cerrar | 15 |
| Workflow con `id = sessionId` (main original) | 1 (sequence index 0) |
| Workflows huérfanos con `stepCount: 0` | 49 |
| Duración promedio de un orphan | ~6 ms |

### `workflow-sequence.json` (fragmento relevante)

```json
{ "workflowIndex": 0, "workflowId": "fe6e7d92-...", "status": "completed" }
{ "workflowIndex": 1, "workflowId": "fe6e7d92-...-wire-1", "status": "running" }
{ "workflowIndex": 2, "workflowId": "fe6e7d92-...-wire-2", "status": "running" }
{ "workflowIndex": 3, "workflowId": "fe6e7d92-...-wire-3", "status": "orphaned" }
...
```

### Distribución de eventos en `events.ndjson` por workflowId

| workflowId | stream_chunks | step_response | tool_call | workflow_start/complete |
|-----------|---------------|---------------|-----------|-------------------------|
| `fe6e7d92-...` (id=sessionId) | **5986** | **201** | **201** | 2 |
| `fe6e7d92-...-wire-1` | 3 | 0 | 0 | 2 |
| `fe6e7d92-...-wire-2` | 0 | 0 | 0 | 2 |
| `fe6e7d92-...-wire-3` | 0 | 0 | 0 | 2 |
| `fe6e7d92-...-wire-N` (resto) | 0 | 0 | 0 | 2-4 |

### Subagente `workflows/00` (el único con respuesta completa)

```json
{
  "workflowId": "fe6e7d92-...-sub-32",
  "workflowKind": "subagent",
  "parentWorkflowId": "fe6e7d92-...",
  "parentWorkflowDir": "C:\\...\\workflows\\01",
  "parentStepIndex": 25,
  "triggeringToolUseId": "call_function_8jxdfvoopyqx_1",
  "subagentType": "general-purpose"
}
```

Tiene 58 steps persistidos, todos los `tool_use_id` correctamente enlazados.

### Workflows orphan representativos (workflows/03, /05, /06, ...)

```json
// workflows/03/meta.json
{
  "workflowId": "fe6e7d92-...-wire-3",
  "sessionId": "fe6e7d92-...",
  "workflowKind": "main",
  "status": "orphaned",
  "startedAt": "2026-06-05T01:22:44.512Z",
  "completedAt": "2026-06-05T01:22:44.518Z",
  "outcome": "orphaned",
  "continuationOrphan": true
}

// workflows/03/output/result.json
{
  "outcome": "orphaned",
  "stepCount": 0,
  "closedByEvent": "StopFailure",
  "sessionId": "fe6e7d92-...",
  "continuationOrphan": true
}
```

`stepCount: 0` — nunca se ejecutó ningún step. El `closedByEvent: "StopFailure"` es un valor fijo incorrecto en `forceClose` (línea 300 de `workflow-repository.service.ts`), no es la causa del cierre.

### Logs del cliente (raw events)

Los `toolUseIds` que se buscan en el repo SÍ existen en los responses del modelo:

```
// events.ndjson: stream_chunk del subagente workflows/00 step 02
data: {"type":"content_block_start","index":1,
       "content_block":{"type":"tool_use",
                        "id":"call_function_qpb6vq17ztfp_1",
                        "name":"Read","input":{}}}

// logs.jsonl: warning orphan
"toolUseIds":["call_function_qpb6vq17ztfp_2",
              "call_function_qpb6vq17ztfp_1",
              "call_function_qpb6vq17ztfp_3"],
"msg":"[audit] No se encontró workflow padre para continuation"
```

Los IDs son correctos en el log; la falla está en la búsqueda, no en la extracción.

## Causa raíz real (NO es la inversión temporal SSE)

### Hipótesis inicial descartada

La primera hipótesis era que el `stream.on('end')` de `audit-sse-response.handler.ts` se ejecutaba después de que el cliente ya había enviado la siguiente continuation, dejando `toolUseIdToWorkflowId` vacío.

**Descartada por datos**: los `toolUseIds` problemáticos en los logs SÍ aparecen en `events.ndjson` con `workflowId: fe6e7d92-...-wire-N` (los orphans). Esos chunks se publicaron al `EventBus` con el `workflowId` del wire-N, pero el log del warning no los encuentra. Esto significa que el SSE handler está publicando chunks contra los wire-N, pero el repo de workflows no tiene esos wire-N cuando llega la continuation siguiente.

### Causa raíz real: identificación incorrecta del workflow en el SSE handler

**`src/3-operations/audit-sse-response.handler.ts:45`**:

```typescript
public execute(
  stream: NodeJS.ReadableStream,
  context: AuditWorkflowContext,
  ...
): void {
  const workflow = this.workflowRepo.getWorkflowBySessionId(context.auditSessionId);
  if (!workflow) return;
  ...
```

`getWorkflowBySessionId` (líneas 316-323 de `workflow-repository.service.ts`) busca:

```typescript
public getWorkflowBySessionId(sessionId: string): IWorkflow | undefined {
  const direct = this.workflows.get(sessionId);  // busca id == sessionId
  if (direct && direct.kind === 'main') return direct;
  for (const wf of this.workflows.values()) {
    if (wf.kind === 'main' && wf.sessionId === sessionId) return wf;
  }
  return undefined;
}
```

**Esto siempre devuelve el mismo workflow**: el que tiene `id = sessionId` o el primer `main` que coincida por `sessionId`.

**Pero el `AuditWorkflowContext.auditSessionId` que llega al SSE handler es la cabecera de la request HTTP**, no el `workflowId` específico que abrió el `AuditWorkflowHandler` para esta request.

### Por qué produce orphans

```
PASO 1: Cliente envía POST /v1/messages con tool_result.
         Cabecera: x-cc-audit-session: fe6e7d92-...

PASO 2: AuditWorkflowHandler.execute()
         - classifyRequestBody: type=continuation
         - extractToolUseIdsFromBody: ['call_function_...']
         - findWorkflowByToolUseId(sessionId, toolUseId)
         - toolUseId NO está en toolUseIdToWorkflowId
         - log warning
         - openWireWorkflow(sessionId, 'agentic', ...)
           → crea wire-3, layoutIndex=3
         - forceClose(wire-3, 'orphaned', {continuationOrphan: true})
         - retorna resultado al caller
         (workflow wire-3 YA está cerrado en el repo, en 6ms)

PASO 3: SSE handler.execute() para el response de esa misma request
         - getWorkflowBySessionId('fe6e7d92-...')
           → devuelve el workflow con id=sessionId (el original main, completed)
         - publica stream_chunks con workflowId=sessionId
         - en stream.on('end'): assembler reconstruye los tool_use
         - llama registerPendingToolUse(workflowId=sessionId, ...)
           → escribe en toolUseIdToWorkflowId el mapping a sessionId-workflow
         - pero ese workflow ya está CLOSED y es el main original

PASO 4: Cliente envía la SIGUIENTE continuation POST /v1/messages
         - toolUseIds: ahora SÍ están en toolUseIdToWorkflowId
         - findWorkflowByToolUseId devuelve el workflow main con id=sessionId
         - pero ese workflow ya está completed y NO es el correcto
         - los nuevos steps se registran en el main equivocado
```

**El bug**: el SSE handler resuelve el workflow por `sessionId`, lo que siempre devuelve el main "estable". El workflow que se acaba de crear (`wire-N`) y al que se deberían atribuir los chunks nunca recibe los `stream_chunks`, `step_response`, ni `tool_call`. Sus `registerPendingToolUse` se llaman contra el `workflowId=sessionId` (incorrecto).

El cliente continúa y las siguientes continuations encuentran los toolUseIds registrados contra el main equivocado. El main acumula steps, pero el wire-N quedó orphan. **El layout causal queda completamente desenfocado**.

### Por qué el caso de `toolUseIds: []`

8 de 50 warnings tienen `toolUseIds: []`. Esto significa que la continuation se clasifica como continuation por alguna otra heurística (probablemente por el patrón de `messages` y la ausencia de `tool_use` en el body actual) pero el body no contiene bloques `tool_result`. En estos casos, `findWorkflowByToolUseId` se llama con un string vacío. La función `findWorkflowByToolUseId(sessionId, '')` puede devolver un workflow arbitrario o `undefined`. Si devuelve `undefined`, también crea un orphan — pero por una razón distinta: la clasificación es continuation sin payload continuation válido.

## Impacto en el layout `causal-workflows-v1`

| Aspecto | Estado |
|---------|--------|
| Directorios `workflows/NN/` | Se crean (65 en esta sesión) |
| `meta.json` por workflow | Se escribe para orphans, pero con `stepCount: 0` |
| `output/result.json` | Existe para orphans, pero sin `body.json` real |
| `steps/MM/request/body.json` | Se persiste el request |
| `steps/MM/response/body.json` | **No se persiste** para wire-N (los chunks van al main equivocado) |
| `tools/KK-Agent/sub-agent/workflow/` | Se persiste correctamente para subagentes |
| `events.ndjson` | Registra eventos pero contra workflowId incorrecto |

**El layout se genera estructuralmente**, pero los wire-N orphans no tienen contenido de respuesta ni herramientas registradas. El workflow main con id=sessionId recibe los chunks, los tools, los resultados, etc. — es decir, **toda la auditoría real está mal atribuida al main workflow**.

## Solución estructural propuesta (no parche)

### Principio: la respuesta SSE debe atribuirse al workflow específico que abrió el request handler, no al main de la sesión

#### Cambio 1: pasar el `workflowId` específico en el `AuditWorkflowContext`

`AuditWorkflowResult` ya incluye `workflowId`. El contexto que llega al SSE handler debe contener ese `workflowId` explícitamente, no derivarlo por `sessionId`.

**Archivo**: `src/3-operations/audit-workflow.handler.ts` (la función que construye el `AuditWorkflowContext`)

**Cambio concreto**: añadir `workflowId: string` al tipo `AuditWorkflowContext` y propagarlo. En `audit-sse-response.handler.ts:45` cambiar a:

```typescript
const workflow = context.workflowId
  ? this.workflowRepo.getWorkflow(context.workflowId)
  : this.workflowRepo.getWorkflowBySessionId(context.auditSessionId);
if (!workflow) return;
```

#### Cambio 2: en el `audit-sse-response.handler`, usar `getWorkflow(workflowId)` no `getWorkflowBySessionId`

Esto resuelve la ambigüedad: el workflow al que se atribuyen los chunks es el mismo que el `AuditWorkflowHandler` acaba de crear.

#### Cambio 3: eliminar el fallback orphan cuando el `workflowId` está disponible

En `handleContinuation`, si el `toolUseId` se acaba de registrar (porque el SSE handler lo hizo correctamente con el workflowId correcto), `findWorkflowByToolUseId` lo encontrará. **Solo se creará un orphan genuino cuando el stream SSE realmente no llegó** (ej. error upstream, timeout), no por identificación incorrecta del workflow.

#### Cambio 4: limpieza del índice `toolUseIdToWorkflowId` en error paths

`forceClose` ya limpia el índice (línea 309-311). Pero `stream.on('error')` y el path de `audit-upstream-error.handler` también deben limpiar entradas que no llegaron a un SSE completo. Esto evita acumulaciones si el stream se aborta.

## Por qué NO es un parche heurístico

- Es un cambio **mínimo y puntual** (un campo en un type, una línea de lookup, una propagación en el constructor del context).
- **No introduce heurísticas** de "último workflow" o "FIFO". Mantiene la correlación exacta `toolUseId → workflowId`.
- **No relaja invariantes**: el contrato `findWorkflowByToolUseId` sigue siendo exacto.
- **Cierra la causa raíz** (identificación incorrecta del workflow en SSE handler), no el síntoma (warnings orphan).
- **El test existente `'debería clasificar continuation: routear al workflow padre por tool_use_id'`** sigue siendo válido: el escenario que cubre (parent con `registerPendingToolUse` ya invocado) no cambia.
- **El test `'continuation sin tool_use_id registrado crea workflow orphan'`** pasa a representar un caso real: el response SSE nunca llegó (ej. error upstream), no un fallo de identificación.

## Drift #1 (SubagentStop con getWorkflow(agentId)) — ¿es el mismo problema?

`audit-hook-event.handler.ts:50-64` usa `getWorkflow(agentId)` directamente para resolver el workflow del subagente cuando llega `SubagentStop`. Esto es problemático porque:

1. `SubagentStart` registra la entrada en `index` (mapa `agentId → WireSubagentEntry`), no en `workflows` (mapa `workflowId → Workflow`).
2. Cuando `SubagentStop` llega, el handler hace `this.workflowRepo.getWorkflow(agentId)` en vez de `getWorkflowByAgentId(agentId)?.workflowId` y luego `getWorkflow(workflowId)`.

**No es el mismo problema** que el drift de continuation orphan, pero comparte la causa raíz: **mapeos confusos entre `agentId`, `workflowId`, y `sessionId`**. Una vez corregida la identificación del workflow en el SSE handler, conviene revisar también este caso para usar `getWorkflowByAgentId` consistentemente.

**No hay datos de este drift en `server/logs.jsonl`**: la sesión activa no tuvo subagentes que llegaran a `SubagentStop` (todos los subagentes están `running`, no se cerraron). El drift es latente, no activo.

## Drift #2 (stop-hook-ux.ts con CLAUDE_PROJECT_DIR)

No verificado en esta sesión porque el hook `Stop` no se disparó durante el log capturado. Sigue siendo un drift potencial.

## Archivos afectados

| Archivo | Línea | Problema |
|---------|-------|----------|
| `src/3-operations/audit-sse-response.handler.ts` | 45 | `getWorkflowBySessionId` en vez de `getWorkflow(context.workflowId)` |
| `src/1-domain/types/audit.types.ts` | (AuditWorkflowContext) | No contiene `workflowId` explícito |
| `src/3-operations/audit-workflow.handler.ts` | (varios) | No propaga `workflowId` al construir el context |
| `src/2-services/workflow-repository.service.ts` | 300 | `forceClose` fija `closedByEvent: "StopFailure"` siempre — incorrecto |
| `src/3-operations/audit-hook-event.handler.ts` | 53 | `getWorkflow(agentId)` no resuelve por agentId → workflowId |
| `src/3-operations/audit-sse-response.handler.ts` | (stream.on('error')) | No limpia índice `toolUseIdToWorkflowId` en errores |

## Verificación recomendada antes de implementar

1. Confirmar que `AuditWorkflowContext` se construye en un punto donde se conoce el `workflowId` específico del workflow abierto.
2. Confirmar que el flujo `AuditWorkflowHandler.execute()` → `AuditSseResponseHandler.execute()` propaga ese `workflowId`.
3. Verificar que `getWorkflow(workflowId)` devuelve el workflow correcto **incluso cuando ya está cerrado** (o cambiar el lookup para que sea válido sobre `forceClose`-d workflows durante la ventana de tiempo del SSE).
4. Medir con la sesión `fe6e7d92-...` antes y después: 0 orphans esperados (o solamente los que vienen de errores upstream reales, no de identificación).

---

## Resolución

**Implementado** como parte del change `fix-continuation-orphan-workflow-attribution`.

**Commit de implementación**: (commit pendiente — ver git log a partir de `3fe32c8`)

**Change archivado en**: `openspec/changes/archive/2026-06-05-fix-continuation-orphan-workflow-attribution/`

### Cambios realizados

| Archivo | Cambio |
|---------|--------|
| `src/1-domain/types/audit.types.ts` | `workflowId: string` añadido como campo obligatorio a `AuditWorkflowContext` |
| `src/1-domain/repositories/IWorkflowRepository.ts` | Firma `clearToolUseIndexFor(workflowId: string): void` añadida |
| `src/1-domain/interfaces/gateway/IWorkflowResult.ts` | `closedByEvent` cambiado a opcional (`closedByEvent?: WorkflowClosedByEvent`) |
| `src/2-services/workflow-repository.service.ts` | Implementado `clearToolUseIndexFor`; `forceClose` usa el nuevo método y omite `closedByEvent` |
| `src/3-operations/audit-sse-response.handler.ts` | Lookup cambiado a `getWorkflow(context.workflowId)`; `stream.on('error')` invoca `clearToolUseIndexFor` |
| `src/3-operations/audit-standard-response.handler.ts` | Mismo lookup que SSE handler |
| `src/3-operations/audit-hook-event.handler.ts` | `SubagentStop` usa `getWorkflowByAgentId` → `getWorkflow` |
| `src/3-operations/audit-upstream-error.handler.ts` | Invoca `clearToolUseIndexFor` antes de `forceClose` |
| `src/5-user-interfaces/http/fastify.augments.d.ts` | Campo `auditWorkflowId?: string` añadido a `FastifyRequest` |
| `src/5-user-interfaces/http/proxy.controller.ts` | Propagación de `workflowId` al context |

### Resultado esperado

- Los wire-N de continuations reciben su atribución correcta: `stream_chunks`, `step_response`, `tool_call` y `registerPendingToolUse` se ejecutan contra el workflowId específico.
- El warning `[audit] No se encontró workflow padre para continuation` debería aparecer únicamente en casos genuinos de error upstream (el SSE del response anterior no llegó), no por identificación incorrecta del workflow.
- `output/result.json` de los orphans ya no incluye `closedByEvent: "StopFailure"` incorrecto.

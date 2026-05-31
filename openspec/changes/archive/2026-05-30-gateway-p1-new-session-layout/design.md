## Context

El gateway proyecta datos de auditoría a disco mediante `AuditWriterService` (escritura directa desde handlers de capa 3), `SessionStoreService` (registry en memoria) y `WorkflowResultProjector` (mapeo a `InteractionMetadata`). El layout en disco es flat (interacciones, pasos, sub-agentes anidados) con archivos como `meta.json`, `state.json`, `sse.jsonl` y `body.json`.

La fase G4 ya proyecta `WorkflowResult` a disco, pero lo hace a través del layout flat heredado, usando `AuditWorkflowClosureHandler` + `AuditProjectionFs`. El correlador (`WorkflowRepositoryService`) no emite eventos; los handlers de capa 3 orquestan la persistencia directamente.

El layout objetivo (`causal-workflows-v1`, §30) reemplaza esto por un árbol causal (`workflows/NN/steps/MM/tools/KK/`) proyectado por `SessionPersistence` como suscriptor de un `EventBus` interno. Las decisiones D1/D2/D3 del orquestador fijan: `output/result.json` (no `response.json` ni `body.json`), fusión de `state.json` en `meta.json`, y separación estricta entre `meta.json` (identidad+estado) y `output/result.json` (resultado+contenido).

La Opción A (`EventBus` + `SessionPersistence`) está ratificada (§28b/§40). El spike P0 confirmó las ubicaciones concretas de código, puntos de emisión, ownership del timer y estrategia de composition root.

Adicionalmente, 6 handlers de capa 3 dependen de los tipos legacy (`ActiveInteraction`, `InteractionMetadata`) y los puertos legacy (`ISessionStore`, `IAuditWriter`). P1 migra estos handlers a los tipos gateway y al patrón EventBus, permitiendo la eliminación completa del modelo `Interaction`.

## Goals / Non-Goals

**Goals:**

1. Crear la pila `IEventBus` → `EventBus` → `SessionPersistence` según §28b.1 y §40.
2. Conectar el correlador al bus: cada mutación de estado emite el evento §28b.3 correspondiente.
3. Crear `completeToolUse()` en el correlador (no existe actualmente; P0 lo confirmó).
4. Que `SessionPersistence` proyecte el árbol `causal-workflows-v1` para sesiones nuevas: `meta.json` (estado fusionado), `output/result.json`, `steps/MM/`, `tools/KK/`.
5. Cablear `EventBus` en `composition-root.ts` (capa 4, §42).
6. Implementar corte limpio de sesiones anteriores.
7. Migrar los 6 handlers L3 a tipos gateway (`IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`) + `IWorkflowRepository` + EventBus.
8. Retirar completamente el modelo legacy: `ISessionStore`, `IAuditWriter`, `ActiveInteraction`, `InteractionMetadata` y servicios asociados.

**Non-Goals:**

- Artefactos nuevos (`events.ndjson`, streaming chunks, `workflow-sequence.json`) — P2.
- Escritura de `sse.jsonl` — se retira en P2.
- Transformación de sesiones anteriores al nuevo layout.
- `SessionPersistence` NO implementa timer propio de timeout (permanece en el correlador, §24.1/G19).

## Decisions

### D-1: Diseño del EventBus

**Opción elegida:** Async in-process pub/sub con pattern matching.

**Alternativas consideradas:**
- *EventEmitter nativo de Node.js:* descartado por no soportar async fire-and-forget ni pattern matching con wildcards.
- *Cola externa (Redis, etc.):* descartado por añadir dependencia infraestructural innecesaria; las sesiones son volátiles.

**Diseño:**

| Componente | Capa PKA | Archivo | Responsabilidad |
|---|---|---|---|
| `IEventBus` | 1 | `src/1-domain/repositories/IEventBus.ts` | Port abstracto: `publish(event)`, `subscribe(pattern, callback)`, `unsubscribe(ref)` |
| `TelemetryEvent` | 1 | `src/1-domain/types/telemetry.types.ts` | Tipo del evento: `{ type: string, sessionId: string, workflowId?: string, timestamp: string, payload: unknown }` |
| `EventCallback` | 1 | `src/1-domain/types/telemetry.types.ts` | `(event: TelemetryEvent) => void \| Promise<void>` |
| `SubscriptionRef` | 1 | `src/1-domain/types/telemetry.types.ts` | Handle opaco para desuscripción |
| Pattern matcher | 1 | `src/1-domain/services/event-pattern-match.service.ts` | Lógica pura: `matches(pattern, eventType)` — soporta `*`, `prefix_*`, `*_suffix` |
| `EventBus` | 2 | `src/2-services/event-bus.service.ts` | Adapter: almacena suscriptores en `Map<pattern, Set<callback>>`; `publish()` itera matches y ejecuta callbacks con `fireAndForget` |

**Contratos clave:**
- `publish()` es fire-and-forget: no espera a que los suscriptores terminen. Errores en callbacks se registran en log, no se propagan.
- `subscribe()` devuelve un `SubscriptionRef` para desuscripción.
- Pattern matching: `*` = wildcard que coincide con cualquier tipo; `prefix_*` = coincide con tipos que empiezan por `prefix_`; `*_suffix` = coincide con tipos que terminan por `_suffix`.
- Una sola instancia de `EventBus` por arranque del proxy (no por sesión).

### D-2: Diseño de SessionPersistence

**Opción elegida:** Suscriptor del bus que proyecta a disco.

**Archivo:** `src/2-services/session-persistence.service.ts`

**Catálogo completo de eventos y suscripciones P1:**

| Evento | Emisor | Payload clave | Acción de persistencia |
|---|---|---|---|
| `workflow_start` | Correlador | `{ sessionId, workflowId, kind, request? }` | Crear `workflows/NN/`; escribir `meta.json` inicial (status: `running`). Si `request` presente, escribir `request/body.json`. |
| `workflow_spawn` | Correlador | `{ sessionId, workflowId, parentWorkflowId, parentToolUseId }` | Crear `workflows/NN/tools/KK-sub-agent/sub-agent/workflow/`; escribir `meta.json` del sub-workflow |
| `step_request` | Correlador | `{ workflowId, stepIndex, step, request? }` | Crear `steps/MM/`; si `request` presente, escribir `request/body.json` |
| `step_response` | Handler L3 | `{ workflowId, stepIndex, response?, headers?, markdown? }` | Escribir `response/body.json`, `response/headers.json`, `response/parsed.md` según campos presentes |
| `tool_call` | Correlador | `{ workflowId, toolUseId, toolName, input }` | Crear `tools/KK-slug/`; escribir `input.json` y `meta.json` |
| `tool_result` | Correlador | `{ workflowId, toolUseId, result }` | Escribir `result.json` en `tools/KK-slug/`; actualizar `meta.json` del tool |
| `workflow_complete` | Correlador | `{ workflowId, result }` | Actualizar `meta.json` (status: `completed`); escribir `output/result.json` + `output/result.parsed.md` |
| `workflow_cancel` | Correlador | `{ workflowId, cancellationReason }` | Actualizar `meta.json` (status: `cancelled`, `cancellationReason`) |

**Reglas de escritura:**
- `meta.json` se escribe atómicamente (write temp + rename) en cada transición de estado. Máximo 3 escrituras por workflow (D2: sin `state.json` separado).
- `output/result.json` se escribe una sola vez, en `workflow_complete`.
- Directorios se crean lazy (§31): solo cuando hay contenido real.
- `SessionPersistence` NO conoce el correlador; solo consume eventos del bus.
- `SessionPersistence` NO implementa timer de timeout (permanece en el correlador).

**Archivo de rutas de sesión:** `src/2-services/session-routing.ts`
- `getWorkflowDir(sessionId, workflowIndex)` → `sessions/<id>/workflows/NN/`
- `getStepDir(sessionId, workflowIndex, stepIndex)` → `sessions/<id>/workflows/NN/steps/MM/`
- `getToolsDir(sessionId, workflowIndex, stepIndex)` → `sessions/<id>/workflows/NN/steps/MM/tools/`

**Utilidades async:** `src/2-services/utils/async.utils.ts`
- `fireAndForget(fn)`: ejecuta fn sin await, registra errores en log.
- `withTimeout(fn, ms)`: ejecuta fn con timeout; lanza si expira.

### D-3: Emisión de eventos desde el correlador

**Archivo modificado:** `src/2-services/workflow-repository.service.ts`

El correlador recibe `IEventBus` como dependencia del constructor. En cada método de mutación, tras actualizar el estado en memoria, emite el evento correspondiente:

| Método existente | Evento a emitir | Payload clave |
|---|---|---|
| `openWorkflow()` | `workflow_start` | `{ sessionId, workflowId, kind: 'main', request? }` |
| `openSubagentWorkflow()` | `workflow_spawn` | `{ sessionId, workflowId, parentWorkflowId, parentToolUseId }` |
| `registerStep()` | `step_request` | `{ workflowId, stepIndex, step, request? }` |
| `registerToolUse()` | `tool_call` | `{ workflowId, toolUseId, toolName, input }` |
| `close()` | `workflow_complete` o `workflow_cancel` | `{ workflowId, result, outcome }` |

**Nuevo método — `completeToolUse()`:**

```typescript
completeToolUse(workflowId: string, toolUseId: string, result: { isError: boolean; result: unknown }): void
```

- Completa un `ToolUse` existente (por timeout §24.1 o por hook `PostToolUse`/`PostToolUseFailure`).
- Actualiza `toolUse.result` y `toolUse.status` en el correlador.
- Emite `tool_result` al bus.
- Si `toolUseId` no existe en el workflow, es no-op (defensivo).

**Nuevos métodos de lookup (D-8):**

El correlador se amplía con métodos de consulta que los handlers L3 necesitan para migrar de `ISessionStore`:

```typescript
getWorkflowBySessionId(sessionId: string): IWorkflow | undefined
findWorkflowWithPendingToolUse(sessionId: string, toolUseId: string): { workflow: IWorkflow; toolUse: IToolUse } | undefined
registerPendingToolUse(workflowId: string, stepId: string, toolUse: IToolUse): void
consumePendingToolUse(workflowId: string, toolUseId: string): IToolUse | undefined
findStaleWorkflows(sessionId: string, maxAgeMs: number): IWorkflow[]
```

**Resolución de `sessionId`:** El correlador construye cada `TelemetryEvent` con `sessionId` obtenido del `Workflow` almacenado en `this.workflows.get(workflowId).sessionId`. Los métodos que reciben `workflowId` (registerStep, registerToolUse, completeToolUse, close) resuelven el `sessionId` internamente antes de publicar al bus.

**Nota sobre `delegateClosure()`:** Tras P1, `delegateClosure()` en `AuditHookEventHandler` se simplifica: ya no resuelve `sessionDir`/`interactionDir` ni invoca `closureHandler.execute()` para escribir disco. Solo invoca `sessionMetrics.updateFromWorkflow()` para workflows main. La escritura de `meta.json` y `output/result.json` la realiza `SessionPersistence` al recibir `workflow_complete` del bus.

### D-4: Cableado en composition root

**Archivo:** `src/4-api/composition-root.ts` — función `createProxyDependencies()`

**Secuencia de cableado:**

1. Crear `EventBus` (adapter de `IEventBus`) al inicio de `createProxyDependencies()`.
2. Crear `SessionPersistence` con `eventBus` como dependencia. `SessionPersistence` se auto-suscribe a los eventos del bus en su constructor (o en un método `init()`).
3. Pasar `eventBus` como dependencia a `WorkflowRepositoryService`. El correlador hace `eventBus.publish()` en cada mutación.
4. `EventBus` se pasa como dependencia explícita (no se accede globalmente). Correlador y `SessionPersistence` no se conocen entre sí; solo comparten el bus.

**Punto de corte:** Una sola instancia de `EventBus` por arranque del proxy. No hay `EventBus` por sesión.

### D-5: Corte limpio de sesiones anteriores

**Regla:** Las sesiones anteriores al layout `causal-workflows-v1` se eliminan antes del corte. No hay migración de datos en reposo.

**Estrategia:**

1. **Punto de invocación:** Al arranque del proxy, en `createProxyDependencies()`, antes de registrar rutas.
2. **Detección:** Si existe `sessions/` con layout anterior (detectado por la presencia de `main-agent/` o `interaction-sequence.json`), se considera layout legacy.
3. **Eliminación:** Se elimina recursivamente todo el contenido de `sessions/` y se recrea `.gitkeep`.
4. **Idempotencia:** Si el layout ya es `causal-workflows-v1` (o `sessions/` está vacío), no hace nada.
5. **Sesiones en curso:** Se pierden (son volátiles por diseño).

### D-6: Retiro de legacy

| Componente retirado | Archivo | Reemplazado por |
|---|---|---|
| Puerto `IAuditWriter` (escritura causal completa) | `src/2-services/ports/audit-writer.port.ts` (eliminado) | `SessionPersistence` (vía EventBus) |
| `AuditWriterService` (solo SSE) | `src/2-services/audit-writer.service.ts` | Shim `ISseAuditWriter` (`@deprecated-p2`; retiro en P2) |
| `SessionStoreService` | `src/2-services/session-store.service.ts` | `WorkflowRepositoryService` (métodos de lookup) + `EventBus` |
| `WorkflowResultProjector` | `src/2-services/workflow-result-projector.service.ts` | `SessionPersistence` (proyecta `output/result.json`) |
| Puerto `ISessionStore` | `src/2-services/ports/session-store.port.ts` | `IWorkflowRepository` ampliado |
| Constantes flat | `src/1-domain/constants/audit-paths.ts` | Constantes del layout `causal-workflows-v1` en `session-routing.ts` |
| Tipos `ActiveInteraction`, `InteractionMetadata`, `StepMeta`, `InteractionType`, `InteractionState`, `InteractionOutcome`, `ParentContext`, `SideRequestKind`, `PendingAgentToolUse`, `PendingWebSearchToolUse`, `PendingWebFetchToolUse`, `ResolvedInternalTool` | `src/1-domain/types/audit.types.ts` | Tipos gateway (`IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`, `WorkflowKind`, `WorkflowStatus`, `WorkflowOutcome`) |
| `AuditWorkflowClosureHandler` (escritura a disco) | `src/3-operations/audit-workflow-closure.handler.ts` | `SessionPersistence` (proyecta vía bus). Handler se conserva como coordinador de métricas de sesión. |
| Llamadas directas a disco en handlers L3 | `src/3-operations/*.handler.ts` | Delegación en `SessionPersistence` vía bus |

**Criterio de retiro:** `npm run lint` + `npm run typecheck` pasan sin referencias huérfanas a los artefactos retirados.

### D-7: Decisiones D1/D2/D3 del orquestador aplicadas

- **D1:** `output/response.json` → `output/result.json` (naming de resultado de workflow).
- **D2:** `state.json` se fusiona en `meta.json`. No existe `state.json` en el layout `causal-workflows-v1`.
- **D3:** Separación estricta: `meta.json` = identidad+estado; `output/result.json` = IWorkflowResult + steps[].

### D-8: Migración de handlers L3 a tipos gateway

**Problema:** Los 6 handlers de capa 3 dependen de `ActiveInteraction` (18 campos), `InteractionMetadata` (22 campos), `ISessionStore` (29 métodos) e `IAuditWriter` (21 métodos). Esta dependencia impide la eliminación del modelo legacy.

**Estrategia:** Migración incremental de menor a mayor complejidad.

**Orden de migración:**

1. **`gateway-wire-step.util.ts`** (baja complejidad) — Cambiar firmas de `ActiveInteraction` a `IWorkflow`. Las funciones ya producen `IStep` como output. Solo cambian los tipos de parámetro.

2. **`audit-upstream-error.handler.ts`** (baja complejidad) — 2 llamadas a `ISessionStore` + 2 a `IAuditWriter`. Reemplazar por: buscar workflow en `IWorkflowRepository`, emitir `workflow_complete` al bus con `outcome: 'upstream-error'`.

3. **`audit-workflow-closure.handler.ts`** (baja complejidad) — Ya usa `IWorkflow`/`IWorkflowResult`. Eliminar `turn: ActiveInteraction` del contexto; extraer campos necesarios de `IWorkflow` directamente. Eliminar `writeInteractionMeta()` / `removeInteractionState()` — `SessionPersistence` lo hace vía bus.

4. **`audit-standard-response.handler.ts`** (media complejidad) — 4 métodos `ISessionStore` + 6 `IAuditWriter`. Reemplazar `getInteractionByDir()` por `IWorkflowRepository.getWorkflow()`. Reemplazar `pushStepMetaByDir()` por `IWorkflowRepository.registerStep()`. Reemplazar `closeInteraction()` por transición de `IWorkflow.status`. Reemplazar `writeInteractionMeta()` por emisión de `workflow_complete` al bus. Contenido de respuesta → evento `step_response`.

5. **`audit-sse-response.handler.ts`** (alta complejidad) — 7 métodos `ISessionStore` + 9 `IAuditWriter`. Migración similar a `audit-standard-response` más: `registerToolUseId()` → `IToolUse` en `IStep.toolUses[]`; `registerPendingAgentToolUse()` → `IWorkflowRepository.registerPendingToolUse()`; SSE lines → evento `stream_chunk` (P2, mantener `appendSseLine`/`appendSseRawChunk` como escritura directa temporal hasta P2).

6. **`audit-interaction.handler.ts`** (alta complejidad) — 18 métodos `ISessionStore` + 7 `IAuditWriter`. Este es el punto de entrada que crea todas las `ActiveInteraction`. Migración: crear `IWorkflow` vía `IWorkflowRepository.openWorkflow()` en lugar de `registerInteraction()`; pending tools → `IWorkflowRepository.registerPendingToolUse()`; secuencias → `IWorkflowRepository` o `SessionPersistence`; `withSessionLock()` → serialización en `IWorkflowRepository`.

**Notas sobre `IAuditWriter` y SSE:**

Los métodos `appendSseLine()` y `appendSseRawChunk()` de `IAuditWriter` son usados por `audit-sse-response.handler.ts` para escritura en tiempo real de SSE. En P1, estos métodos se mantienen como escritura directa a disco (sin pasar por EventBus) ya que `stream_chunk` se consume en P2. Para P1, `audit-sse-response.handler.ts` puede retener una dependencia reducida a un writer de SSE inline (no el `IAuditWriter` completo) hasta que P2 implemente la suscripción a `stream_chunk`.

**Mapeo de `ISessionStore` → `IWorkflowRepository`:**

| Método `ISessionStore` | Reemplazo en `IWorkflowRepository` |
|---|---|
| `registerInteraction()` | `openWorkflow()` / `openSubagentWorkflow()` |
| `getInteractionByDir()` / `getInteractionByDirSync()` | `getWorkflow()` (por workflowId) |
| `getInteractionByToolUseId()` | `findWorkflowWithPendingToolUse()` |
| `pushStepMetaByDir()` | `registerStep()` |
| `closeInteraction()` | Transición `IWorkflow.status` + `close()` |
| `incrementStepCountByDir()` | `IWorkflow.steps.length` |
| `registerToolUseId()` | `registerToolUse()` |
| `registerPendingAgentToolUse()` | `registerPendingToolUse()` |
| `consumePendingAgentToolUse()` | `consumePendingToolUse()` |
| `findInteractionWithPendingAgents()` | `findWorkflowWithPendingToolUse()` (genérico) |
| `registerPendingWebSearchToolUse()` | `registerPendingToolUse()` |
| `registerPendingWebFetchToolUse()` | `registerPendingToolUse()` |
| `consumeWebSearchPending()` / `consumeWebFetchPending()` | `consumePendingToolUse()` |
| `registerResolvedInternalTool()` | `registerToolUse()` con `toolName` interno |
| `findStaleInteractionsAwaitingContinuation()` | `findStaleWorkflows()` |
| `withSessionLock()` | `IWorkflowRepository` implementa lock interno por sessionId |
| `nextMainAgentSequence()` / `nextSideInteractionSequence()` | `IWorkflowRepository.nextSequence(sessionId)` |
| `getBaseDir()` | Configuración global, no dependencia del store |

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| `workflow-repository.service.ts` crece con emisiones + métodos de lookup | Las llamadas `eventBus.publish()` son una línea cada una; los métodos de lookup son queries simples sobre los maps existentes. |
| `EventBus` in-memory pierde eventos si el proxy se reinicia | Acceptable: las sesiones son volátiles por diseño. El corte limpio ya asume esto. |
| Migración de `audit-interaction.handler.ts` es de alta complejidad (18 métodos ISessionStore) | Orden incremental: migrar los 5 handlers más simples primero, dejar `audit-interaction` al final cuando el patrón está consolidado. |
| SSE writes (`appendSseLine`/`appendSseRawChunk`) no van por EventBus en P1 | Acceptable: P2 implementa `stream_chunk`. En P1, `audit-sse-response` retiene un writer SSE inline temporal. |
| `audit-sse-response.handler.ts` mantiene escritura SSE directa hasta P2 | Documentado como `@deprecated-p2`; no es legacy del modelo anterior sino un paso intermedio. |
| Timer de timeout requiere `setTimeout` nuevo en el correlador | Implementación estándar de Node.js; variable de entorno `SCP_TOOL_TIMEOUT_MS` (default 30s). |
| Escrituras concurrentes a `meta.json` si múltiples eventos llegan rápido | Escritura atómica (temp + rename) serializada con `writeQueue` por archivo. |

## Migration Plan

1. Crear componentes L1: `IEventBus`, tipos de telemetría, pattern matcher.
2. Crear componentes L2: `EventBus`, `SessionPersistence`, `session-routing`, `async.utils`.
3. Modificar correlador: inyectar `IEventBus`, añadir emisiones + `completeToolUse()` + métodos de lookup (D-8).
4. Cablear en composition root.
5. Migrar handlers L3 (orden D-8): `gateway-wire-step` → `audit-upstream-error` → `audit-workflow-closure` → `audit-standard-response` → `audit-sse-response` → `audit-interaction`.
6. Actualizar `AuditHookEventHandler`: invocar `completeToolUse()` en hooks, simplificar `delegateClosure()`.
7. Implementar corte limpio.
8. Retirar legacy P1: `ISessionStore`, `SessionStoreService`, `IAuditWriter`, `WorkflowResultProjector`, `ActiveInteraction`, constantes flat; conservar `AuditWriterService` como `ISseAuditWriter` hasta P2.
9. Verificar: `npm run test` + subset §37b (casos 3–7, 16, 19).
10. Actualizar documentación.

## Open Questions

- ¿`SessionPersistence` se auto-suscribe en constructor o requiere `init()` explícito? → Decisión: constructor (más simple; la suscripción es side-effect controlado).
- ¿Dónde vive la lógica de `parsed.md`? → `SessionPersistence` genera `result.parsed.md` en `workflow_complete` usando un formateador simple (JSON.stringify con formato legible). El formateador avanzado de `StepAssembler` se mantiene para P2.
- ¿`audit-sse-response` retiene writer SSE inline o usa `IAuditWriter` reducido? → Decisión: writer SSE inline con interfaz mínima (`appendSseLine`, `appendSseRawChunk`), documentado como `@deprecated-p2`.

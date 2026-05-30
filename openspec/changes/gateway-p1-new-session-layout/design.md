## Context

El gateway proyecta datos de auditoría a disco mediante `AuditWriterService` (escritura directa desde handlers de capa 3), `SessionStoreService` (registry en memoria) y `WorkflowResultProjector` (mapeo a `InteractionMetadata`). El layout en disco es flat (interacciones, pasos, sub-agentes anidados) con archivos como `meta.json`, `state.json`, `sse.jsonl` y `body.json`.

La fase G4 ya proyecta `WorkflowResult` a disco, pero lo hace a través del layout flat heredado, usando `AuditWorkflowClosureHandler` + `AuditProjectionFs`. El correlador (`WorkflowRepositoryService`) no emite eventos; los handlers de capa 3 orquestan la persistencia directamente.

El layout objetivo (`causal-workflows-v1`, §30) reemplaza esto por un árbol causal (`workflows/NN/steps/MM/tools/KK/`) proyectado por `SessionPersistence` como suscriptor de un `EventBus` interno. Las decisiones D1/D2/D3 del orquestador fijan: `output/result.json` (no `response.json` ni `body.json`), fusión de `state.json` en `meta.json`, y separación estricta entre `meta.json` (identidad+estado) y `output/result.json` (resultado+contenido).

La Opción A (`EventBus` + `SessionPersistence`) está ratificada (§28b/§40). El spike P0 confirmó las ubicaciones concretas de código, puntos de emisión, ownership del timer y estrategia de composition root.

## Goals / Non-Goals

**Goals:**

1. Crear la pila `IEventBus` → `EventBus` → `SessionPersistence` según §28b.1 y §40.
2. Conectar el correlador al bus: cada mutación de estado emite el evento §28b.3 correspondiente.
3. Crear `completeToolUse()` en el correlador (no existe actualmente; P0 lo confirmó).
4. Que `SessionPersistence` proyecte el árbol `causal-workflows-v1` para sesiones nuevas: `meta.json` (estado fusionado), `output/result.json`, `steps/MM/`, `tools/KK/`.
5. Cablear `EventBus` en `composition-root.ts` (capa 4, §42).
6. Implementar corte limpio de sesiones anteriores.
7. Retirar el layout flat completo (legacy).

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

**Suscripciones P1 (eventos → acciones):**

| Evento | Acción de persistencia |
|---|---|
| `workflow_start` | Crear directorio `workflows/NN/`; escribir `meta.json` inicial (status: `running`) |
| `workflow_spawn` | Crear directorio `workflows/NN/tools/KK-sub-agent/sub-agent/workflow/`; escribir `meta.json` del sub-workflow |
| `step_request` | Crear directorio `steps/MM/`; escribir `request/body.json` |
| `tool_call` | Crear directorio `tools/KK-slug/`; escribir `input.json` y `meta.json` |
| `tool_result` | Escribir `result.json` en `tools/KK-slug/`; actualizar `meta.json` del tool |
| `workflow_complete` | Actualizar `meta.json` (status: `completed`); escribir `output/result.json` + `output/result.parsed.md` |
| `workflow_cancel` | Actualizar `meta.json` (status: `cancelled`, `cancellationReason`) |

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
| `openWorkflow()` | `workflow_start` | `{ sessionId, workflowId, kind: 'main' }` |
| `openSubagentWorkflow()` | `workflow_spawn` | `{ sessionId, workflowId, parentWorkflowId, parentToolUseId }` |
| `registerStep()` | `step_request` | `{ workflowId, stepIndex, step }` |
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

**Nota sobre `AuditSseResponseHandler`:** El handler de capa 3 emite `stream_chunk` al bus directamente (no a través del correlador). Esto es consistente con §28b.4: el handler no escribe disco, pero sí publica al bus. `SessionPersistence` consume `stream_chunk` solo en P2.

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
| `AuditWriterService` | `src/2-services/audit-writer.service.ts` | `SessionPersistence` |
| `SessionStoreService` | `src/2-services/session-store.service.ts` | `WorkflowRepositoryService` + `EventBus` |
| `WorkflowResultProjector` | `src/2-services/workflow-result-projector.service.ts` | `SessionPersistence` (proyecta `output/result.json`) |
| Constantes flat | `src/1-domain/constants/audit-paths.ts` (`DIR_MAIN_AGENT`, `DIR_INTERACTIONS`, `PREFIX_SUB_AGENT`) | Constantes del layout `causal-workflows-v1` en `session-routing.ts` |
| Tipos `ActiveInteraction` / `InteractionMetadata` | `src/1-domain/types/audit.types.ts` | Tipos gateway (`Workflow`, `Step`, `ToolUse`, `IWorkflowResult`) |
| Llamadas directas a disco en handlers L3 | `src/3-operations/*.handler.ts` | Delegación en `SessionPersistence` vía bus |

**Criterio de retiro:** `npm run lint` + `npm run typecheck` pasan sin referencias huérfanas a los artefactos retirados.

### D-7: Decisiones D1/D2/D3 del orquestador aplicadas

- **D1:** `output/response.json` → `output/result.json` (naming de resultado de workflow).
- **D2:** `state.json` se fusiona en `meta.json`. No existe `state.json` en el layout `causal-workflows-v1`.
- **D3:** Separación estricta: `meta.json` = identidad+estado; `output/result.json` = IWorkflowResult + steps[].

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| `workflow-repository.service.ts` crece con la emisión de eventos | Las llamadas `eventBus.publish()` son una línea cada una; la lógica compleja vive en `SessionPersistence`. |
| `EventBus` in-memory pierde eventos si el proxy se reinicia | Acceptable: las sesiones son volátiles por diseño. El corte limpio ya asume esto. |
| `AuditSseResponseHandler` (L3) emite `stream_chunk` al bus, acoplando L3 al bus | Consistente con §28b.4: el handler no escribe disco, solo publica al bus. El bus es abstracto (`IEventBus`), no un servicio concreto. |
| Timer de timeout requiere `setTimeout` nuevo en el correlador | Implementación estándar de Node.js; variable de entorno `SCP_TOOL_TIMEOUT_MS` (default 30s). |
| Retiro de legacy puede romper consumidores transitorios | `InteractionMetadata` se mantiene como `@deprecated` hasta que el último consumidor migre (anotado en G1). |
| Escrituras concurrentes a `meta.json` si múltiples eventos llegan rápido | Escritura atómica (temp + rename) serializada con `writeQueue` por archivo. |

## Migration Plan

1. Crear componentes L1: `IEventBus`, tipos de telemetría, pattern matcher.
2. Crear componentes L2: `EventBus`, `SessionPersistence`, `session-routing`, `async.utils`.
3. Modificar correlador: inyectar `IEventBus`, añadir emisiones + `completeToolUse()`.
4. Cablear en composition root.
5. Implementar corte limpio.
6. Retirar legacy flat.
7. Verificar: `npm run test` + subset §37b (casos 3–7, 16, 19).
8. Actualizar documentación.

## Open Questions

- ¿`SessionPersistence` se auto-suscribe en constructor o requiere `init()` explícito? → Decisión: constructor (más simple; la suscripción es side-effect controlado).
- ¿Dónde vive la lógica de `parsed.md`? → `SessionPersistence` genera `result.parsed.md` en `workflow_complete` usando un formateador simple (JSON.stringify con formato legible). El formateador avanzado de `StepAssembler` se mantiene para P2.

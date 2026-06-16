## Context

El gateway actual proyecta datos de auditoría a disco mediante `AuditWriterService` (escritura directa desde capa 3), `SessionStoreService` (registry en memoria) y `WorkflowResultProjector` (mapeo a `InteractionMetadata`). El layout en disco es flat (interacciones, pasos, sub-agentes anidados) con archivos como `meta.json`, `state.json`, `sse.jsonl` y `body.json`.

El layout objetivo (`causal-workflows-v1`, §29–§31) reemplaza esto por un árbol causal (`workflows/NN/steps/MM/tools/KK/`) proyectado por `SessionPersistence` como suscriptor de un `EventBus` interno. Las decisiones D1/D2/D3 del orquestador ya fijan: `output/result.json` (no `response.json` ni `body.json`), fusión de `state.json` en `meta.json`, y separación estricta entre `meta.json` (identidad+estado) y `output/result.json` (resultado+contenido).

La Opción A (`EventBus` + `SessionPersistence`) está ratificada (§28b/§40). Este spike confirma las ubicaciones concretas de código, no decide entre opciones.

## Goals / Non-Goals

**Goals:**

1. Mapear cada componente de §28b/§40 a su archivo destino en `src/`, indicando fase (P1 o P2).
2. Documentar los puntos de emisión del correlador: para cada método de mutación, el evento de §28b.3 que emite.
3. Confirmar que el timer de timeout de `ToolUse` permanece en el correlador (§24.1/G19).
4. Documentar la estrategia de cableado en `composition-root.ts` (capa 4, §42).
5. Documentar la estrategia de corte limpio (eliminación de `sessions/` anterior).

**Non-Goals:**

- No decide entre Opción A y B (ya ratificada).
- No implementa la pila `EventBus` + `SessionPersistence` (trabajo de P1).
- No redefine el layout objetivo, schemas, ni naming de archivos (fijado por D1/D2/D3).
- No escribe código fuente; es un spike documental.

## Decisions

### D-S1: Inventario de componentes §28b/§40 → `src/`

Tabla de mapeo de cada componente del diseño objetivo a su ubicación propuesta en `src/`:

| Componente | Capa PKA | Archivo destino propuesto | Fase | Archivo actual (si existe) | Notas |
|---|---|---|---|---|---|
| `IEventBus` (port) | 1 | `src/1-domain/repositories/IEventBus.ts` | P1 | — | Nuevo. Patrón similar a `IWorkflowRepository.ts` |
| Tipos de telemetría (`TelemetryEvent`, `EventCallback`, `SubscriptionRef`) | 1 | `src/1-domain/types/telemetry.types.ts` | P1 | — | Nuevo. Dominio puro, sin I/O |
| Pattern matcher de eventos (`*`, `prefix_*`, `*_suffix`) | 1 | `src/1-domain/services/event-pattern-match.service.ts` | P1 | — | Nuevo. Lógica pura de matching |
| `EventBus` (adapter async in-process) | 2 | `src/2-services/event-bus.service.ts` | P1 | — | Nuevo. Implementa `IEventBus`; pub/sub en memoria |
| Funciones de routing de sesión (`getWorkflowDir`, `getStepDir`, `getToolsDir`) | 2 | `src/2-services/session-routing.ts` | P1 | — | Nuevo. Mapeo de eventos a rutas de directorio |
| Async isolation (`fireAndForget`, `withTimeout`) | 2 | `src/2-services/utils/async.utils.ts` | P1 | — | Nuevo. Utilidades para aislamiento async |
| `SessionPersistence` (structure: `meta.json`, `output/result.json`, `steps/MM/`, `tools/KK/`) | 2 | `src/2-services/session-persistence.service.ts` | P1 | — | Nuevo. Suscriptor del bus; proyecta a disco |
| `SessionPersistence` — artifacts adicionales (`events.ndjson`, streaming chunks) | 2 | `src/2-services/session-persistence.service.ts` | P2 | — | Extensión del mismo archivo; suscripciones adicionales |
| Emisión de bus desde correlador | 2 | `src/2-services/workflow-repository.service.ts` | P1 | `src/2-services/workflow-repository.service.ts` | Agregar `eventBus.publish()` en cada mutación |
| Cableado bus + suscriptor en composition root | 4 | `src/4-api/composition-root.ts` | P1 | `src/4-api/composition-root.ts` | Crear `EventBus`, inyectar en correlador y `SessionPersistence` |
| `AuditProjectionFs` (traduce agregados a `sessions/...`) | 2 | `src/2-services/audit-projection-fs.service.ts` | P1 | — | Nuevo. Traduce `WorkflowResult` + `Workflow` a estructura de directorio |

**Componentes que P1 retira** (legacy flat):

| Componente | Archivo actual | Razón de retiro |
|---|---|---|
| `AuditWriterService` | `src/2-services/audit-writer.service.ts` | Reemplazado por `SessionPersistence` |
| `SessionStoreService` | `src/2-services/session-store.service.ts` | Reemplazado por `WorkflowRepositoryService` + `EventBus` |
| `WorkflowResultProjector` | `src/2-services/workflow-result-projector.service.ts` | Reemplazado por `SessionPersistence` proyectando `output/result.json` |
| Constantes flat (`DIR_MAIN_AGENT`, `DIR_INTERACTIONS`, `PREFIX_SUB_AGENT`, etc.) | `src/1-domain/constants/audit-paths.ts` | El layout causal no usa estas constantes |
| Tipos `ActiveInteraction` / `InteractionMetadata` | `src/1-domain/types/audit.types.ts` | Reemplazados por tipos gateway (`Workflow`, `Step`, `ToolUse`, `IWorkflowResult`) |

### D-S2: Puntos de emisión del correlador

Tabla de emisión: método de mutación en `WorkflowRepositoryService` → evento del catálogo §28b.3 → archivo fuente.

| Método de mutación (actual) | Evento §28b.3 a emitir | Emisor | Notas |
|---|---|---|---|
| `openWorkflow()` | `workflow_start` | Correlador (`workflow-repository.service.ts`) | Ya existe; se agrega `eventBus.publish()` |
| `openSubagentWorkflow()` | `workflow_spawn` | Correlador (`workflow-repository.service.ts`) | Ya existe; se agrega `eventBus.publish()` |
| `registerStep()` | `step_request` | Correlador (`workflow-repository.service.ts`) | Nombre actual: `registerStep` (no `openStep`); se agrega emisión |
| `registerToolUse()` | `tool_call` | Correlador (`workflow-repository.service.ts`) | Ya existe; se agrega `eventBus.publish()` |
| `completeToolUse()` | `tool_result` | Correlador (`workflow-repository.service.ts`) | **No existe aún.** P1 crea este método para completar `ToolUse` (timeout o hook) y emitir `tool_result` al bus |
| `close()` | `workflow_complete` \| `workflow_cancel` | Correlador (`workflow-repository.service.ts`) | Nombre actual: `close(workflowId, hook)`; se decide `workflow_complete` vs `workflow_cancel` según `result.outcome` |
| Cada chunk SSE | `stream_chunk` | `AuditSseResponseHandler` (capa 3, `audit-sse-response.handler.ts`) | Handler L3 publica al bus directamente |

**Notas de verificación contra el código actual:**

- `stream_chunk` NO lo emite el correlador. Lo emite directamente `AuditSseResponseHandler` (L3) en cada chunk SSE, publicándolo al bus. Consistente con §28b.4 regla 1: el handler no escribe disco, pero sí publica al bus. `SessionPersistence` consume `stream_chunk` solo en P2 (no P1).
- `completeToolUse()` no existe como método en `WorkflowRepositoryService`. P1 debe crearlo para completar `ToolUse` (por timeout §24.1 o por hook `PostToolUse`/`PostToolUseFailure`) y emitir `tool_result` al bus.
- Los nombres actuales del correlador difieren de los del catálogo §28b.3: `registerStep()` (no `openStep()`), `close()` (no `closeWorkflow()`), `closeStep()`. P1 alinea los nombres o añade wrappers según convenga.

**Eventos no implementados en P1** (diferidos a P2 o posteriores):

| Evento | Razón de diferimiento |
|---|---|
| `session_start` | Requiere `ISession` en correlador; puede diferirse |
| `step_inference_complete` | Consumido por `StepAssembler`; no proyecta a disco |
| `step_closed` | Requiere cierre de step en correlador |
| `token_usage` | Consumido por `SessionMetricsService` (ya implementado en G4) |
| `session_complete` | Requiere cierre de sesión; similar a `session_start` |

### D-S3: Ownership del timer

**Confirmación:** El timer de timeout de `ToolUse` permanece en el correlador (`workflow-repository.service.ts`), no en `SessionPersistence`.

Razones:
- El correlador decide si un tool expiró porque esa decisión afecta el estado de `ToolUse`, el cierre de `Step` y potencialmente el cierre de `Workflow` (§24.1/G19).
- Colocar el timer en `SessionPersistence` crearía una fuente de verdad paralela no reconciliada con el correlador.
- `SessionPersistence` consume el evento `tool_result` (con `is_error: true` si timeout) emitido por el correlador al bus.

**Mecanismo existente:** Actualmente no hay `setTimeout` en el código (la detección de orphans es lazy, en el siguiente request). El timer de §24.1 será una nueva función en el correlador, no hereda del mecanismo actual de orphans.

**Variable de entorno reservada:** `SCP_TOOL_TIMEOUT_MS` (default 30s).

### D-S4: Estrategia de composition root

**Archivo:** `src/4-api/composition-root.ts` — función `createProxyDependencies()`.

**Cableado propuesto:**

1. **Crear `EventBus`:** Instanciar `EventBus` (adapter de `IEventBus`) al inicio de `createProxyDependencies()`, antes de los handlers.
2. **Inyectar en correlador:** Pasar `eventBus` como dependencia a `WorkflowRepositoryService` (o al constructor/carga que lo configure). El correlador hace `eventBus.publish()` en cada mutación de §28b.3.
3. **Inyectar en `SessionPersistence`:** Crear `SessionPersistence` con `eventBus` como dependencia. `SessionPersistence` llama `eventBus.subscribe(pattern, callback)` para registrar sus handlers de persistencia.
4. **Patrón de inyección:** `EventBus` se pasa como dependencia explícita (no se accede globalmente). Correlador y `SessionPersistence` no se conocen entre sí; solo comparten el bus.

**Punto de corte:** Se crea una sola instancia de `EventBus` porarranque del proxy. No hay `EventBus` por sesión.

### D-S5: Estrategia de corte limpio

**Regla:** Las sesiones anteriores al layout `causal-workflows-v1` se eliminan antes del corte. No hay migración de datos en reposo.

**Estrategia:**

1. **Punto de invocación:** Al arranque del proxy (en `createProxyDependencies()` o en `index.ts`), antes de registrar rutas.
2. **Lógica:** Si existe `sessions/` con layout anterior (detectado por la presencia de `main-agent/` o `interaction-sequence.json`), eliminar recursivamente todo el contenido de `sessions/` y recrear `.gitkeep`.
3. **No hay migración:** No se convierten archivos antiguos al nuevo layout. Las sesiones en curso se pierden (son volátiles por diseño).
4. **Sesiones nuevas:** Desde el corte en adelante, todas las sesiones usan `causal-workflows-v1` (`workflows/NN/steps/MM/tools/KK/`).
5. **Idempotencia:** La detección y eliminación es idempotente; si el layout ya es `causal-workflows-v1`, no hace nada.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| `workflow-repository.service.ts` crece significativamente con la emisión de eventos | Las llamadas `eventBus.publish()` son una línea cada una; la lógica de publicación es trivial. La lógica compleja vive en `SessionPersistence`. |
| `EventBus` in-memory se pierde eventos si el proxy se reinicia durante una sesión | Acceptable: las sesiones son volátiles por diseño. El corte limpio ya asume esto. |
| `AuditSseResponseHandler` (L3) emite `stream_chunk` al bus, lo que acopla L3 al bus | Consistente con §28b.4: el handler no escribe disco, solo publica al bus. El bus es abstracto (`IEventBus`), no un servicio concreto. |
| Timer de timeout en el correlador requiere `setTimeout` que no existe actualmente | Implementación estándar de Node.js; el correlador ya maneja estados de `ToolUse`, incluyendo `timeout`. |
| Eliminación de `sessions/` anterior puede causar pérdida de datos de debugging | Las sesiones son volátiles; no hay garantía de persistencia entre reinicios. Documentar en README. |

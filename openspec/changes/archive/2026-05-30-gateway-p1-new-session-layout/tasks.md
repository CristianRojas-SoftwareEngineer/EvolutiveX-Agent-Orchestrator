## 1. Tipos y puertos de dominio (capa 1)

- [x] 1.1 Crear tipos de telemetría en `src/1-domain/types/telemetry.types.ts`: `TelemetryEvent`, `EventCallback`, `SubscriptionRef`
  - _Criterio: `npm run typecheck` pasa; tipos exportados correctamente_
- [x] 1.2 Crear port `IEventBus` en `src/1-domain/repositories/IEventBus.ts` con métodos `publish`, `subscribe`, `unsubscribe`
  - _Criterio: `npm run typecheck` pasa; interface cumple spec `event-bus`_
- [x] 1.3 Crear pattern matcher en `src/1-domain/services/event-pattern-match.service.ts`: función `matches(pattern, eventType)` con soporte `*`, `prefix_*`, `*_suffix`, coincidencia exacta
  - _Criterio: `npm run test:quick` pasa; 6 escenarios del spec `event-bus` cubiertos_

## 2. Adaptadores de infraestructura (capa 2)

- [x] 2.1 Crear `EventBus` adapter en `src/2-services/event-bus.service.ts`: pub/sub async in-process, fire-and-forget, pattern matching, `SubscriptionRef` para desuscripción
  - _Criterio: `npm run test:quick` pasa; escenarios de publish/subscribe/unsubscribe/error-handling cubiertos_
- [x] 2.2 Crear utilidades async en `src/2-services/utils/async.utils.ts`: `fireAndForget(fn)`, `withTimeout(fn, ms)`
  - _Criterio: `npm run typecheck` pasa; funciones exportadas_
- [x] 2.3 Crear funciones de routing en `src/2-services/session-routing.ts`: `getWorkflowDir`, `getStepDir`, `getToolsDir`, `getToolDir` con normalización de slug
  - _Criterio: `npm run test:quick` pasa; escenarios de routing y slug del spec `session-routing` cubiertos_
- [x] 2.4 Crear `SessionPersistence` en `src/2-services/session-persistence.service.ts`:
  - Suscribirse a eventos del bus en constructor: `workflow_start`, `workflow_spawn`, `step_request`, `step_response`, `tool_call`, `tool_result`, `workflow_complete`, `workflow_cancel`
  - Proyectar a disco: `meta.json` (atómico, write temp + rename, serializado con `writeQueue`), `output/result.json` + `result.parsed.md`, `request/body.json`, `response/body.json`, `response/headers.json`, `response/parsed.md`, `tools/KK-slug/{input,result,meta}.json`
  - Directorios lazy (§31): solo crear cuando hay contenido
  - Layout `causal-workflows-v1`: `workflows/NN/steps/MM/tools/KK-slug/`
  - _Criterio: `npm run test:quick` pasa; 9 escenarios de persistencia del spec `session-persistence` cubiertos_

## 3. Correlador: emisión al bus + completeToolUse + lookup (capa 2)

- [x] 3.1 Modificar `WorkflowRepositoryService` para recibir `IEventBus` en constructor
  - _Criterio: `npm run typecheck` pasa; constructor acepta `eventBus: IEventBus`_
- [x] 3.2 Añadir emisiones de eventos en cada método de mutación: `openWorkflow → workflow_start`, `openSubagentWorkflow → workflow_spawn`, `registerStep → step_request`, `registerToolUse → tool_call`, `close → workflow_complete|workflow_cancel`
  - _Criterio: `npm run test:quick` pasa; 5 emisiones verificadas en tests_
- [x] 3.3 Crear método `completeToolUse(workflowId, toolUseId, result)` en correlador: actualizar `toolUse.result` y `toolUse.status`, emitir `tool_result` al bus. Si `toolUseId` no existe, no-op
  - _Criterio: `npm run test:quick` pasa; escenarios de completeToolUse exitoso, error y no-op cubiertos_
- [x] 3.4 Añadir métodos de lookup al correlador: `getWorkflowBySessionId`, `findWorkflowWithPendingToolUse`, `registerPendingToolUse`, `consumePendingToolUse`, `findStaleWorkflows`, `nextSequence`, `withSessionLock`
  - _Criterio: `npm run test:quick` pasa; 7 escenarios de lookup del spec `gateway-workflow-lifecycle` cubiertos_

## 4. Composition root (capa 4)

- [x] 4.1 Modificar `composition-root.ts`: crear `EventBus` en `createProxyDependencies()`, inyectar en correlador y crear `SessionPersistence` con `eventBus`
  - _Criterio: `npm run typecheck` pasa; `EventBus` creado una vez, inyectado en ambos_
- [x] 4.2 Implementar corte limpio de sesiones anteriores en `createProxyDependencies()`: detectar layout legacy (`main-agent/` o `interaction-sequence.json`), eliminar `sessions/`, recrear `.gitkeep`
  - _Criterio: `npm run test:quick` pasa; detección idempotente verificada_

## 5. Migración de handlers L3 a tipos gateway

- [x] 5.1 Migrar `gateway-wire-step.util.ts`: cambiar firmas de `ActiveInteraction` a `IWorkflow` en `resolveWorkflowIdForInteraction`, `buildInferenceRequestSnapshot`, `BuildWireStepParams.interaction`
  - _Criterio: `npm run typecheck` pasa; no hay referencias a `ActiveInteraction` en el archivo_
- [x] 5.2 Migrar `audit-upstream-error.handler.ts`: reemplazar `ISessionStore.getInteractionByDir()` por `IWorkflowRepository.getWorkflow()`, `closeInteraction()` por transición de status, `writeInteractionMeta()` por emisión de `workflow_complete` al bus
  - _Criterio: `npm run test:quick` pasa; no hay referencias a `ISessionStore` ni `IAuditWriter` en el archivo_
- [x] 5.3 Migrar `audit-workflow-closure.handler.ts`: eliminar `turn: ActiveInteraction` del `AuditWorkflowClosureContext`, extraer campos necesarios de `IWorkflow` directamente. Eliminar `writeInteractionMeta()` y `removeInteractionState()` — `SessionPersistence` lo hace vía bus. Actualizar `projectWorkflowResultToInteractionMetadata()` para no depender de `InteractionMetadata` como output type.
  - _Criterio: `npm run test:quick` pasa; no hay referencias a `ActiveInteraction` ni `InteractionMetadata` en el archivo_
- [x] 5.4 Migrar `audit-standard-response.handler.ts`: reemplazar `getInteractionByDir()`/`getInteractionByDirSync()` por `IWorkflowRepository.getWorkflow()`, `pushStepMetaByDir()` por `registerStep()`, `closeInteraction()` por transición de status, `writeInteractionMeta()` por emisión de `workflow_complete` al bus. Contenido de respuesta → evento `step_response`.
  - _Criterio: `npm run test:quick` pasa; no hay referencias a `ISessionStore` ni `IAuditWriter` en el archivo_
- [x] 5.5 Migrar `audit-sse-response.handler.ts`: reemplazar `ISessionStore` por `IWorkflowRepository` (mismos patrones que 5.4). `registerToolUseId()` → `registerToolUse()`. `registerPendingAgentToolUse()` → `registerPendingToolUse()`. SSE writes → writer inline temporal (`@deprecated-p2`). `writeInteractionMeta()` → emisión de `workflow_complete` al bus.
  - _Criterio: `npm run test:quick` pasa; no hay referencias a `ISessionStore` en el archivo; writer SSE inline documentado como `@deprecated-p2`_
- [x] 5.6 Migrar `audit-interaction.handler.ts`: reemplazar `registerInteraction()` por `IWorkflowRepository.openWorkflow()`, pending tools por `registerPendingToolUse()`/`consumePendingToolUse()`, secuencias por `nextSequence()`, `withSessionLock()` por implementación en `IWorkflowRepository`, `closeInteraction()` por transición de status, `writeInteractionState()`/`writeInteractionMeta()` por EventBus.
  - _Criterio: `npm run test:quick` pasa; no hay referencias a `ISessionStore` ni `IAuditWriter` en el archivo_
- [x] 5.7 Actualizar `AuditHookEventHandler` para invocar `completeToolUse` en hooks `PostToolUse` y `PostToolUseFailure`
  - _Criterio: `npm run test:quick` pasa; escenarios de PostToolUse/PostToolUseFailure del spec `gateway-workflow-lifecycle` cubiertos_
- [x] 5.8 Refactorizar `delegateClosure()` en `AuditHookEventHandler`: eliminar invocación a `closureHandler.execute()`, resolver `sessionDir` e invocar solo `sessionMetrics.updateFromWorkflow()` para workflows main. Eliminar dependencia a `AuditWorkflowClosureHandler` del constructor del handler si ya no se usa directamente.
  - _Criterio: `npm run test:quick` pasa; `delegateClosure()` no escribe disco; métricas de sesión siguen actualizándose para workflows main_

## 6. Retiro de legacy

- [x] 6.0 Extraer `writeJsonAtomic` a `src/2-services/utils/file-write.utils.ts`; `SessionMetricsService` sin `IAuditWriter`
- [x] 6.1 Sustituir puerto `IAuditWriter` por `ISseAuditWriter`; `AuditWriterService` queda como implementación SSE `@deprecated-p2` (no eliminado hasta P2)
  - _Criterio: `npm run lint` y `npm run typecheck` pasan; handlers L3 usan `ISseAuditWriter` o EventBus_
- [x] 6.2 Eliminar `session-store.service.ts`, puerto `ISessionStore` y todas sus referencias
  - _Criterio: `npm run lint` y `npm run typecheck` pasan; no hay imports huérfanos_
- [x] 6.3 Eliminar `workflow-result-projector.service.ts` y todas sus referencias
  - _Criterio: `npm run lint` y `npm run typecheck` pasan; no hay imports huérfanos_
- [x] 6.4 Podar constantes flat no usadas en `audit-paths.ts` (`DIR_MAIN_AGENT`, `DIR_INTERACTIONS`, etc.); eliminar `ActiveInteraction`. Conservar `InteractionMetadata`/`PREFIX_SUB_AGENT` mientras el writer SSE `@deprecated-p2` los use; tipos de correlación (`InteractionType`, `ParentContext`, pendings) siguen en handlers hasta P2.
  - _Criterio: `npm run lint` y `npm run typecheck` pasan_
- [x] 6.5 Handlers L3 sin `fs.write*` directos salvo vía `ISseAuditWriter` en `audit-sse-response` (`@deprecated-p2`)
  - _Criterio: `npm run lint` pasa_

## 7. Gate técnico y documentación

- [x] 7.1 Ejecutar `npm run test` completo — suite verde sin errores
  - _Criterio: todos los tests pasan_
- [x] 7.2 Verificar subconjunto estructural del checklist §37b (casos 3–7, 16, 19): nuevas sesiones en tests adoptan `workflows/NN/`, `steps/MM/`, `tools/KK/`
  - _Criterio: 7 casos del checklist verificados con el layout `causal-workflows-v1`_
- [x] 7.3 Actualizar `docs/session-audit-model.md`: describir layout `causal-workflows-v1`, `meta.json` (estado fusionado), `output/result.json`, ausencia de `state.json`, migración de handlers a tipos gateway
  - _Criterio: documento refleja el layout vigente para sesiones nuevas_
- [x] 7.4 Actualizar `README.md`: describir EventBus + SessionPersistence, layout `causal-workflows-v1`
  - _Criterio: README describe la nueva arquitectura de persistencia_
- [x] 7.5 Actualizar `docs/proposals/gateway-design.md` §29, §30, §33, §37b, §40, §46.4: marcar como implementado
  - _Criterio: secciones referenciadas reflejan el estado implementado_
- [x] 7.6 Ejecutar `openspec-sync` si los specs cambiaron comportamiento acordado
  - _Criterio: sync ejecutado — specs promovidos a `openspec/specs/{event-bus,session-persistence,session-routing}/` y `gateway-audit-projection` actualizado_

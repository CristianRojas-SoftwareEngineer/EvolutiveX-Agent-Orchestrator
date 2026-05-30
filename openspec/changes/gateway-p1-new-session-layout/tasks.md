## 1. Tipos y puertos de dominio (capa 1)

- [ ] 1.1 Crear tipos de telemetría en `src/1-domain/types/telemetry.types.ts`: `TelemetryEvent`, `EventCallback`, `SubscriptionRef`
  - _Criterio: `npm run typecheck` pasa; tipos exportados correctamente_
- [ ] 1.2 Crear port `IEventBus` en `src/1-domain/repositories/IEventBus.ts` con métodos `publish`, `subscribe`, `unsubscribe`
  - _Criterio: `npm run typecheck` pasa; interface cumple spec `event-bus`_
- [ ] 1.3 Crear pattern matcher en `src/1-domain/services/event-pattern-match.service.ts`: función `matches(pattern, eventType)` con soporte `*`, `prefix_*`, `*_suffix`, coincidencia exacta
  - _Criterio: `npm run test:quick` pasa; 6 escenarios del spec `event-bus` cubiertos_

## 2. Adaptadores de infraestructura (capa 2)

- [ ] 2.1 Crear `EventBus` adapter en `src/2-services/event-bus.service.ts`: pub/sub async in-process, fire-and-forget, pattern matching, `SubscriptionRef` para desuscripción
  - _Criterio: `npm run test:quick` pasa; escenarios de publish/subscribe/unsubscribe/error-handling cubiertos_
- [ ] 2.2 Crear utilidades async en `src/2-services/utils/async.utils.ts`: `fireAndForget(fn)`, `withTimeout(fn, ms)`
  - _Criterio: `npm run typecheck` pasa; funciones exportadas_
- [ ] 2.3 Crear funciones de routing en `src/2-services/session-routing.ts`: `getWorkflowDir`, `getStepDir`, `getToolsDir`, `getToolDir` con normalización de slug
  - _Criterio: `npm run test:quick` pasa; escenarios de routing y slug del spec `session-routing` cubiertos_
- [ ] 2.4 Crear `SessionPersistence` en `src/2-services/session-persistence.service.ts`:
  - Suscribirse a eventos del bus en constructor: `workflow_start`, `workflow_spawn`, `step_request`, `tool_call`, `tool_result`, `workflow_complete`, `workflow_cancel`
  - Proyectar a disco: `meta.json` (atómico, write temp + rename, serializado con `writeQueue`), `output/result.json` + `result.parsed.md`, `request/body.json`, `tools/KK-slug/{input,result,meta}.json`
  - Directorios lazy (§31): solo crear cuando hay contenido
  - Layout `causal-workflows-v1`: `workflows/NN/steps/MM/tools/KK-slug/`
  - _Criterio: `npm run test:quick` pasa; 7 escenarios de persistencia del spec `session-persistence` cubiertos_

## 3. Correlador: emisión al bus + completeToolUse (capa 2)

- [ ] 3.1 Modificar `WorkflowRepositoryService` para recibir `IEventBus` en constructor
  - _Criterio: `npm run typecheck` pasa; constructor acepta `eventBus: IEventBus`_
- [ ] 3.2 Añadir emisiones de eventos en cada método de mutación: `openWorkflow → workflow_start`, `openSubagentWorkflow → workflow_spawn`, `registerStep → step_request`, `registerToolUse → tool_call`, `close → workflow_complete|workflow_cancel`
  - _Criterio: `npm run test:quick` pasa; 5 emisiones verificadas en tests_
- [ ] 3.3 Crear método `completeToolUse(workflowId, toolUseId, result)` en correlador: actualizar `toolUse.result` y `toolUse.status`, emitir `tool_result` al bus. Si `toolUseId` no existe, no-op
  - _Criterio: `npm run test:quick` pasa; escenarios de completeToolUse exitoso, error y no-op cubiertos_
- [ ] 3.4 Actualizar `AuditHookEventHandler` para invocar `completeToolUse` en hooks `PostToolUse` y `PostToolUseFailure`
  - _Criterio: `npm run test:quick` pasa; escenarios de PostToolUse/PostToolUseFailure del spec `gateway-workflow-lifecycle` cubiertos_

## 4. Composition root (capa 4)

- [ ] 4.1 Modificar `composition-root.ts`: crear `EventBus` en `createProxyDependencies()`, inyectar en correlador y crear `SessionPersistence` con `eventBus`
  - _Criterio: `npm run typecheck` pasa; `EventBus` creado una vez, inyectado en ambos_
- [ ] 4.2 Implementar corte limpio de sesiones anteriores en `createProxyDependencies()`: detectar layout legacy (`main-agent/` o `interaction-sequence.json`), eliminar `sessions/`, recrear `.gitkeep`
  - _Criterio: `npm run test:quick` pasa; detección idempotente verificada_

## 5. Retiro de legacy

- [ ] 5.1 Eliminar `audit-writer.service.ts` y todas sus referencias
  - _Criterio: `npm run lint` y `npm run typecheck` pasan; no hay imports huérfanos_
- [ ] 5.2 Eliminar `session-store.service.ts` y todas sus referencias
  - _Criterio: `npm run lint` y `npm run typecheck` pasan; no hay imports huérfanos_
- [ ] 5.3 Eliminar `workflow-result-projector.service.ts` y todas sus referencias
  - _Criterio: `npm run lint` y `npm run typecheck` pasan; no hay imports huérfanos_
- [ ] 5.4 Eliminar constantes flat de `audit-paths.ts` (`DIR_MAIN_AGENT`, `DIR_INTERACTIONS`, `PREFIX_SUB_AGENT`) y tipos `ActiveInteraction`/`InteractionMetadata` de `audit.types.ts`
  - _Criterio: `npm run lint` y `npm run typecheck` pasan; no hay referencias a constantes ni tipos eliminados_
- [ ] 5.5 Eliminar llamadas directas a disco en handlers de capa 3 (si quedan residuos tras 5.1–5.4)
  - _Criterio: `npm run lint` pasa; handlers de capa 3 no escriben disco directamente_

## 6. Gate técnico y documentación

- [ ] 6.1 Ejecutar `npm run test` completo — suite verde sin errores
  - _Criterio: todos los tests pasan_
- [ ] 6.2 Verificar subconjunto estructural del checklist §37b (casos 3–7, 16, 19): nuevas sesiones en tests adoptan `workflows/NN/`, `steps/MM/`, `tools/KK/`
  - _Criterio: 7 casos del checklist verificados con el layout `causal-workflows-v1`_
- [ ] 6.3 Actualizar `docs/session-audit-model.md`: describir layout `causal-workflows-v1`, `meta.json` (estado fusionado), `output/result.json`, ausencia de `state.json`
  - _Criterio: documento refleja el layout vigente para sesiones nuevas_
- [ ] 6.4 Actualizar `README.md`: describir EventBus + SessionPersistence, layout `causal-workflows-v1`
  - _Criterio: README describe la nueva arquitectura de persistencia_
- [ ] 6.5 Actualizar `docs/proposals/gateway-design.md` §29, §30, §33, §37b, §40, §46.4: marcar como implementado
  - _Criterio: secciones referenciadas reflejan el estado implementado_
- [ ] 6.6 Ejecutar `openspec-sync` si los specs cambiaron comportamiento acordado
  - _Criterio: sync ejecutado o justificado como no necesario_

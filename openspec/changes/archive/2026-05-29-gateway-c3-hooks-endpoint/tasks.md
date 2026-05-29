## 1. Dominio — tipos, parsing y port

- [x] 1.1 Crear `src/1-domain/types/hook.types.ts` con el tipo `HookEventName` (unión de los 10 nombres de evento §24), el tipo `ClaudeHookEvent` con los campos `eventName`, `sessionId`, `toolUseId?`, `agentId?`, `stopHookActive?`, `backgroundTasks?`, `lastAssistantMessage?`, y la función pura `parseHookEvent(payload: unknown): ClaudeHookEvent`. Sin I/O; sin imports de capas 2–5. Criterio: el archivo compila sin errores de typecheck (`npm run test:quick`).
- [x] 1.2 Crear `tests/1-domain/hook.types.test.ts` con los escenarios de la spec: (a) payload `PostToolUse` válido → campos mapeados; (b) payload sin `eventName` reconocido → no lanza, resultado seguro. Criterio: `npm run test:quick` verde con los 2 tests pasando.
- [x] 1.3 Añadir `confirmSubagentFromHook(agentId: string, toolUseId?: string): void` a la interfaz `IWorkflowRepository` en `src/1-domain/repositories/`. Criterio: `npm run test:quick` verde (typecheck sin errores sobre implementaciones existentes).

## 2. Servicios — `confirmSubagentFromHook`

- [x] 2.1 Implementar `confirmSubagentFromHook` en `WorkflowRepositoryService` (`src/2-services/workflow-repository.service.ts`): extender `WireSubagentEntry` con `confirmed: boolean` y `triggeringToolUseId?: string`; (a) si el sub-workflow ya fue abierto por wire, marcarlo `confirmed: true` y registrar `triggeringToolUseId`; (b) si aún no llegó el wire, registrar la confirmación pendiente de enlace. Criterio: `npm run test:quick` verde.
  > **Diferido a G1/G2:** campo `readyToClose` y lifecycle de workflow — requieren el modelo `Workflow/Step/ToolUse` que G2 introduce; no implementar en C3.

## 3. Operations — `AuditHookEventHandler`

- [x] 3.1 Crear `src/3-operations/audit-hook-event.handler.ts` con la clase `AuditHookEventHandler(workflowRepo: IWorkflowRepository, logger?: Logger)` y método `execute(event: ClaudeHookEvent): void` que despache los 10 eventos §24: **solo `SubagentStart`** ejecuta una mutación real (`confirmSubagentFromHook(agentId, toolUseId?)`); los demás eventos (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStop`, `Stop`, `StopFailure`) son stubs que registran en log "recibido — mutación diferida a G2/C4" sin tocar el correlador. Sin I/O; sin imports de capas 4–5. Criterio: el archivo compila sin errores de typecheck.
- [x] 3.2 Crear `tests/3-operations/audit-hook-event.handler.test.ts` con los escenarios de la spec: (a) `SubagentStart` → `confirmSubagentFromHook` invocado con `agentId` y `toolUseId`; (b) `PreToolUse` → handler completa sin excepción, `workflowRepo` no recibe llamadas; (c) `Stop` con `stopHookActive: true` → handler completa sin excepción, sin mutación; (d) `Stop` con `stopHookActive: false` → handler completa sin excepción, sin mutación (cierre diferido). Criterio: `npm run test:quick` verde con los 4 escenarios pasando.

## 4. API/Composition — cableado en `composition-root.ts`

- [x] 4.1 Instanciar `AuditHookEventHandler` en `src/4-api/composition-root.ts`, inyectando `workflowRepo` y `logger`. Exportar en `ProxyDependencies` como `hookEventHandler`. Criterio: `npm run test:quick` verde sin errores de typecheck ni de linting.

## 5. Delivery — `HooksController` y ruta `POST /hooks`

- [x] 5.1 Crear `src/5-user-interfaces/http/hooks.controller.ts` con un `HooksController` delgado: parsea el body con `parseHookEvent`, llama `hookEventHandler.execute(event)`, responde HTTP 202 (o 200) antes de que el procesamiento pueda lanzar. Sin lógica de negocio en el controller. Criterio: el archivo compila sin errores de typecheck.
- [x] 5.2 Registrar la ruta `POST /hooks` en `src/app.ts` **antes** de `app.register(proxyRoutes, { deps })`, siguiendo el patrón inline de `app.get('/health', ...)` en `app.ts:36`. Criterio: `npm run test:quick` verde.

## 6. E2E — test Fastify `POST /hooks`

- [x] 6.1 Crear `tests/5-user-interfaces/hooks.e2e.test.ts` con al menos dos escenarios: (a) evento `SubagentStart` → respuesta 2xx + `confirmSubagentFromHook` llamado en el repo (verificar con spy/mock); (b) `POST /hooks` no llega a upstream (verificar que el servidor mock upstream no recibe la request). Criterio: `npm run test:quick` verde (gate DoD bloque C: "Pruebas de endpoint `POST /hooks` + `AuditHookEventHandler` E2E").

## 7. Gate de validación incremental

- [x] 7.1 Ejecutar `npm run test:quick` (lint + typecheck + Vitest completo, incluidos E2E Fastify) y confirmar resultado verde. Criterio: salida sin errores ni tests en rojo.

## 8. Documentación

- [x] 8.1 Actualizar `README.md`: añadir mención al endpoint `POST /hooks` como borde activo y describir brevemente el mecanismo de hooks lifecycle. No reescribir secciones no afectadas. Criterio: revisión manual — el README refleja que `POST /hooks` está activo desde C3.
- [x] 8.2 Actualizar `docs/proposals/gateway-design.md`: marcar C3 como implementada en el registro/diagrama de fases §43 o en la sección correspondiente. No reescribir secciones no afectadas. Criterio: revisión manual — el documento refleja el estado actual.

## 9. Legacy

- [x] 9.1 Confirmar que C3 no introduce código zombie: verificar que no quedan imports huérfanos generados por este change, que `parseHookEvent` y `AuditHookEventHandler` son los únicos puntos de entrada del borde hooks, y que no existe ningún código provisional de hooks fuera de los archivos listados. El registro del orquestador marca C3 con "—" en la columna "Legacy a retirar". Criterio: `npm run lint` sin errores; revisión manual confirma cero zombie.

## 10. Gobernanza OpenSpec

- [x] 10.1 Ejecutar `openspec validate --changes gateway-c3-hooks-endpoint` y confirmar que pasa sin errores.
- [x] 10.2 Ejecutar `migration-phase-gate` para la fase C3: verificar trazabilidad, DoD del orquestador y dependencia C1 satisfecha (archivada).
- [x] 10.3 Actualizar el estado de la fase C3 a `validada` en la tabla de `openspec/changes/gateway-migration/design.md`.
- [x] 10.4 Ejecutar `openspec-sync` para sincronizar los deltas de `specs/hooks-lifecycle-correlation/spec.md` sobre la spec maestra en `openspec/specs/hooks-lifecycle-correlation/spec.md`.
- [ ] 10.5 Ejecutar `openspec-archive` para archivar el change `gateway-c3-hooks-endpoint`.

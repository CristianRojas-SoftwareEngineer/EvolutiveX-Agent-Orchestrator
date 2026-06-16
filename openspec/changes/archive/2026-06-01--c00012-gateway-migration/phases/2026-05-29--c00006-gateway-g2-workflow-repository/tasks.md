## 1. Dominio — ampliar port IWorkflowRepository

- [x] 1.1 Añadir los 8 métodos de lifecycle a `IWorkflowRepository` en `src/1-domain/repositories/IWorkflowRepository.ts` (`openWorkflow`, `openSubagentWorkflow`, `getWorkflow`, `registerStep`, `closeStep`, `registerToolUse`, `readyToClose`, `close`); retornos tipados con `IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult` de G1
- [x] 1.2 Verificar que el typecheck pasa sin errores: `npm run test:quick`

## 2. Servicios — ampliar adapter WorkflowRepositoryService

- [x] 2.1 Implementar los 8 métodos de lifecycle en `src/2-services/workflow-repository.service.ts`; mantener los 3 métodos wire existentes y los índices por `agentId` y `parentToolUseId`
- [x] 2.2 Implementar `readyToClose` según condiciones §15.4: devuelve `false` si `hook.stopHookActive === true` o `hook.backgroundTasks > 0`
- [x] 2.3 Implementar `close` invocando `buildWorkflowResult(workflow, closedSteps, childResults, hook)` de G1; adjuntar `result` al workflow y marcar `completedAt`; garantizar idempotencia (devolver resultado existente si ya cerrado)
- [x] 2.4 Verificar: `npm run test:quick`

## 3. Operations — des-stub AuditHookEventHandler

- [x] 3.1 En `src/3-operations/audit-hook-event.handler.ts`, des-stub `Stop`: resolver workflow por `agentId`/`sessionId`, llamar `readyToClose`; si `true`, llamar `close`
- [x] 3.2 Des-stub `SubagentStop`: misma lógica que `Stop` para el sub-workflow del agente
- [x] 3.3 Des-stub `StopFailure`: llamar `close` directamente (sin `readyToClose`; §15.4)
- [x] 3.4 Des-stub `UserPromptSubmit`: abrir o confirmar el workflow main en el repo (idempotente)
- [x] 3.5 Verificar: `npm run test:quick`

## 4. Tests unitarios del lifecycle

- [x] 4.1 Escribir tests de `readyToClose`: escenario `stop_hook_active: true` → `false`; escenario `backgroundTasks: 1` → `false`; escenario sin bloqueos → `true`
- [x] 4.2 Escribir tests de `close`: hook `Stop` → `outcome: 'success'`; hook `StopFailure` → `outcome: 'api_error'`; segundo hook ignorado (idempotencia §28)
- [x] 4.3 Escribir tests del handler des-stubado: hook `Stop` cerrable → `close` invocado; hook `Stop` con `stopHookActive: true` → `close` no invocado; hook `StopFailure` → `close` directo
- [x] 4.4 Verificar todos los tests: `npm run test:quick`

## 5. Gate de calidad

- [x] 5.1 `npm run test:quick` verde (lint + typecheck + unit tests)

## 6. Documentación

- [x] 6.1 Actualizar `docs/session-audit-model.md`: estado activo del correlador = `IWorkflowRepository`; describir lifecycle de cierre (apertura → steps → `readyToClose` → `close` → `WorkflowResult`); revisión manual

## 7. Legacy y gobernanza del orquestador

- [x] 7.1 Confirmar que `ActiveInteraction` sigue marcado `@deprecated` en el puerto `ISessionStore`; verificar que no hay imports huérfanos creados por este change
- [x] 7.2 Registrar en `openspec/changes/gateway-migration/tasks.md` la tarea de retiro efectivo de `ActiveInteraction` como ítem de G4 (si no existe aún)

## 8. Gobernanza OpenSpec (ejecutar al finalizar implementación)

- [ ] 8.1 `openspec validate --changes gateway-g2-workflow-repository` pasa sin errores
- [ ] 8.2 Ejecutar `migration-phase-gate` para verificar Definition of Done antes de archivar
- [ ] 8.3 Actualizar estado del change a `validada` y ejecutar sync + archive

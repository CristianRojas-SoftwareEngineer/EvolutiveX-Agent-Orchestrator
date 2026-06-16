## 1. PKA 1-domain: añadir workflowId a AuditWorkflowContext

- [x] 1.1 Leer `src/1-domain/types/audit.types.ts` y añadir el campo obligatorio `workflowId: string` al tipo `AuditWorkflowContext`. Documentar con un comentario que cuando el llamador no pueda propagarlo (código legacy), el campo puede ser `undefined` en la fase de transición, pero el contrato normativo es obligatorio.
- [x] 1.2 Buscar todos los sitios en `src/` donde se construye `AuditWorkflowContext` (grep `AuditWorkflowContext` en `src/`) y verificar que cada uno tiene acceso al `workflowId` del `AuditWorkflowResult` correspondiente. Anotar los puntos de propagación.

## 2. PKA 2-services: clearToolUseIndexFor y corrección de forceClose

- [x] 2.1 Añadir a `IWorkflowRepository` (`src/1-domain/repositories/IWorkflowRepository.ts`) la firma del método `clearToolUseIndexFor(workflowId: string): void` con comentario JSDoc que explique que elimina todas las entradas de `toolUseIdToWorkflowId` cuyo valor sea `workflowId`.
- [x] 2.2 Implementar `clearToolUseIndexFor` en `WorkflowRepositoryService` (`src/2-services/workflow-repository.service.ts`): iterar `toolUseIdToWorkflowId`, eliminar entradas cuyo `wfId === workflowId`. No-op si no hay entradas o el workflow no existe.
- [x] 2.3 Modificar `forceClose` en `WorkflowRepositoryService` (línea 289-312): eliminar el literal `closedByEvent: 'StopFailure'` del `IWorkflowResult` construido. Reemplazar el bucle inline de limpieza (líneas 309-311) por una llamada a `this.clearToolUseIndexFor(workflowId)`.
- [x] 2.4 Verificar que el `IWorkflowResult` producido por `forceClose` ya no contiene la clave `closedByEvent` para outcomes `orphaned`, `upstream-error`, `truncated`.

## 3. PKA 3-operations: propagación de workflowId y lookup corregido

- [x] 3.1 En `AuditSseResponseHandler.execute()` (`src/3-operations/audit-sse-response.handler.ts:45`), cambiar la línea de lookup a `getWorkflow(context.workflowId)` (sin fallback — workflowId es obligatorio).
- [x] 3.2 En el mismo handler, añadir en el handler de `stream.on('error')` una llamada a `this.workflowRepo.clearToolUseIndexFor(workflow.id)` antes de marcar `streamError = true`.
- [x] 3.3 En `AuditStandardResponseHandler` (capa 3), aplicar el mismo cambio de lookup (usar `getWorkflow(context.workflowId)`).
- [x] 3.4 En `proxy.controller.ts`, poblar `context.workflowId` con el `workflowId` del `AuditWorkflowResult` devuelto por `AuditWorkflowHandler.execute()`. Campo `auditWorkflowId` añadido a `FastifyRequest`.
- [x] 3.5 En `audit-hook-event.handler.ts:50-64` (caso `SubagentStop`), cambiar `getWorkflow(agentId)` a `getWorkflowByAgentId(agentId)` seguido de `getWorkflow(entry.agentId)`.
- [x] 3.6 En `audit-upstream-error.handler`, añadir llamada a `this.workflowRepo.clearToolUseIndexFor(workflow.id)` antes de `forceClose`.

## 4. Tests: reproducir el bug y validar el fix

- [x] 4.1 En `tests/3-operations/audit-sse-response.handler.test.ts`, añadir test `'atribuye stream_chunks al workflowId del AuditWorkflowContext'` y `'registra registerPendingToolUse contra el workflowId del context'`.
- [x] 4.2 En el mismo archivo, añadir test `'stream.on("error") invoca clearToolUseIndexFor con el workflowId correcto'`.
- [x] 4.3 En `tests/2-services/workflow-repository.test.ts`, añadir tests para `clearToolUseIndexFor` (elimina entradas del workflow, no-op).
- [x] 4.4 En `tests/2-services/workflow-repository.test.ts`, añadir tests de `forceClose` que verifican que `IWorkflowResult` NO contiene `closedByEvent`.
- [x] 4.5 En `tests/3-operations/audit-workflow.handler.test.ts`, actualizar el test orphan con comentario que aclara el caso genuino.
- [x] 4.6 En `tests/3-operations/audit-hook-event.handler.test.ts`, añadir test que verifica `SubagentStop` con agentId conocido usa `getWorkflowByAgentId`.
- [x] 4.7 En el mismo archivo, añadir test que verifica `SubagentStop` con agentId desconocido no falla.

## 5. Verificación de tipos, lint y suite completa

- [x] 5.1 Ejecutar `npm run typecheck` — sin errores.
- [x] 5.2 Ejecutar `npm run lint` — sin issues.
- [x] 5.3 Ejecutar `npm run test:quick` — 574 tests passing.
- [x] 5.4 Ejecutar `npm run test` (suite completa) — sin regresiones, build exitoso.

## 6. Verificación manual con la sesión de referencia

- [ ] 6.1 Levantar el proxy con los cambios (`npm run dev` o equivalente) y reproducir la sesión `fe6e7d92-6ed3-4cb9-9144-79ce74178c48` o una equivalente con muchos tool_use del Agent general-purpose.
- [ ] 6.2 Verificar con `tree /F` sobre `sessions/<new-session-id>/` que:
  - Los wire-N (no orphans) tienen `stepCount > 0` y `meta.json` con `status` final coherente.
  - El workflow main con `id == sessionId` no recibe `stream_chunks`, `step_response`, ni `tool_call` de otros workflows.
  - El `events.ndjson` distribuye los eventos por `workflowId` correcto.
- [ ] 6.3 Verificar en `server/logs.jsonl` que el conteo de warnings `[audit] No se encontró workflow padre para continuation` es 0 (o se reduce a los casos genuinos de error upstream).
- [ ] 6.4 Comparar el layout resultante con la sesión `fe6e7d92-...` original: el nuevo debe tener muchos menos directorios `workflows/NN/` huérfanos.

## 7. Sync OpenSpec y archivado

- [x] 7.1 Ejecutar `openspec validate fix-continuation-orphan-workflow-attribution` — completado (4/4 artefactos done).
- [x] 7.2 Ejecutar `openspec sync` — deltas aplicados a `openspec/specs/`.
- [x] 7.3 Verificar que `openspec/specs/gateway-audit-projection/spec.md`, `openspec/specs/gateway-workflow-lifecycle/spec.md`, y `openspec/specs/wire-agent-correlation/spec.md` reflejan los requisitos modificados.
- [x] 7.4 Ejecutar `openspec archive fix-continuation-orphan-workflow-attribution` — en curso.

## 1. Cierre de step en tool_use

- [x] 1.1 Modificar `enrichOpenWireStepWithResponse` en `gateway-wire-step.util.ts`: asignar `closedAt` y llamar `closeStep` cuando `stopReason === 'tool_use'`
- [x] 1.2 Modificar rama fallback de `registerWireStepInCorrelator` (sin step abierto): misma lógica de cierre en `tool_use` (paridad con 1.1)

## 2. Idempotencia tool_result

- [x] 2.1 Añadir guard en `WorkflowRepositoryService.completeToolUse` (return early si `status` es `completed` o `error`)
- [x] 2.2 Test en `workflow-repository.test.ts`: doble `completeToolUse` → un solo emit `tool_result`

## 3. finalText y session-shell

- [x] 3.1 `buildWorkflowResult`: omitir `finalText` cuando `workflow.id === hook.sessionId`
- [x] 3.2 Test en `build-workflow-result` (o equivalente): shell sin `finalText`; wire/subagent con `finalText`
- [x] 3.3 `AuditHookEventHandler` `UserPromptSubmit`: pasar `{ workflowKind: 'session-shell' }` como **tercer argumento** de `openWorkflow` (options, no agentCtx)
- [x] 3.4 Extender `WorkflowRequestKind` en `audit.types.ts` con `'session-shell'`

## 4. Tests de regresión (gateway-wire-step)

- [x] 4.1 **Reemplazar** el test `tool_use: enriquece sin cerrar el step` por `tool_use: cierra el step al completar el hop` (esperar `closedAt` definido)
- [x] 4.2 Extender `registerWireStepInCorrelator: 3 hops → 3 steps`: afirmar `closedAt` en **todos** los hops y `result.stepCount === 3` tras el hop terminal
- [x] 4.3 Añadir test multi-hop explícito: 3× `tool_use` + 1× `end_turn` → `stepCount === 4`
- [x] 4.4 Test fallback `registerWireStepInCorrelator` sin step previo + `tool_use` → step cerrado
- [x] 4.5 Test meta `interactionType: session-shell` en `session-persistence.test.ts`
- [x] 4.6 `npm run test:unit` verde

## 5. Documentación

- [x] 5.1 Actualizar `docs/session-audit-model.md`: taxonomía `interactionType` incluye `session-shell`
- [x] 5.2 Alinear mención de `WorkflowRequestKind` en `docs/` o specs si referencia los cuatro valores semánticos

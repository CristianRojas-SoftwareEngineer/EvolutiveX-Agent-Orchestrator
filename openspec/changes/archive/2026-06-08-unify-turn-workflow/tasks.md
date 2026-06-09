## 1. Dominio y tipos (PKA 1-domain)

- [x] 1.1 Añadir `StepKind` (`agentic` | `side-request`) en `audit.types.ts`; retirar `session-shell` del union activo de `WorkflowRequestKind`
- [x] 1.2 Extender `IStep` con `stepKind?: StepKind`; documentar `index` base 1 en JSDoc
- [x] 1.3 Actualizar `build-workflow-result.ts`: `finalText` siempre vía `deriveFinalText(hook)`; quitar omisión por shell; `stepCount` incluye todos los steps cerrados

## 2. Numeración base 1 (PKA 2-services)

- [x] 2.1 Cambiar `allocLayoutIndex` para emitir primer valor `1`; unificar con persistencia (retirar o sincronizar `nextWorkflowIndex` en `session-persistence.service.ts`)
- [x] 2.2 Actualizar `registerWireStepRequest`: `index = workflow.steps.length + 1` (helper `nextStepIndex`); alinear `resolveOpenWireStepIndex` y `stepIndexForToolUse`
- [x] 2.3 Reemplazar `workflowDirAbs` por `getWorkflowDir` sin offset `+1`; actualizar contrato y tests de `session-routing.ts` (índices base 1)

## 3. Fusión de turno — hooks (PKA 3-operations)

- [x] 3.1 `audit-hook-event.handler.ts`: `UserPromptSubmit` abre turno con `workflowKind: 'agentic'` (no `session-shell`); `Stop`/`StopFailure` cierran turno activo
- [x] 3.2 Verificar idempotencia lazy-open: `UserPromptSubmit` reutiliza turno abierto por side-request/fresh previo

## 4. Fusión de turno — ingress HTTP (PKA 3-operations)

- [x] 4.1 Refactorizar `handleSideRequest`: registrar step con `stepKind: side-request` bajo turno activo; sin `openWireWorkflow(..., forceNew: true)`
- [x] 4.2 Refactorizar `handleFresh`: adjuntar step agentic al turno; materializar `request/body.json` en primer hop agentic; lazy open si no hay turno
- [x] 4.3 Envolver ramas mutantes de `AuditWorkflowHandler.execute` en `withSessionLock(sessionId)` (D11)
- [x] 4.4 Eliminar `handlePreflightQuota` / `handlePreflightWarmup`; preflights retornan `null` sin proyección causal (R9)

## 5. Cierre step vs workflow — egress SSE (PKA 3-operations)

- [x] 5.1 Modificar `closeWireWorkflowOnTerminalStop`: `end_turn` cierra solo step; NO `forceClose` en turno main (`id === sessionId`) ni sub-workflow (`kind: subagent`)
- [x] 5.2 Aplicar misma regla de paridad a subagentes bajo `tools/…/sub-agent/workflow/`; cierre E2E en `SubagentStop`

## 6. Persistencia y métricas (PKA 2-services)

- [x] 6.1 Proyectar `stepKind` en meta del step desde evento `step_request`
- [x] 6.2 Asegurar `workflow-sequence.json`: una fila por turno; `workflowIndex` base 1
- [x] 6.3 Revisar `is-step-billable-for-session-metrics.ts` y `session-metrics.service.ts` ante side-request como step

## 7. Tests unitarios

- [x] 7.1 `session-routing.test.ts`: `getWorkflowDir(s, 1)` → `workflows/01/`; `getStepDir(s, 1, 1)` → `steps/01/`
- [x] 7.2 `audit-workflow.handler.test.ts`: turno con side-request + fresh + continuation = 1 workflow, steps `01`…`03`; preflight sin auditoría
- [x] 7.3 `gateway-wire-step.util.test.ts`: `end_turn` no emite `workflow_complete` en turno; step sí cierra
- [x] 7.4 `audit-hook-event.handler.test.ts`: `UserPromptSubmit` → `agentic`; `Stop` cierra turno con `finalText` del hook
- [x] 7.5 `session-persistence.test.ts`: proyección base 1 y `stepKind`; eliminar expectativas de `session-shell` y preflight en disco
- [x] 7.6 `workflow-repository.test.ts` / `build-workflow-result`: `finalText` en turno unificado; sin omisión por shell

## 8. Documentación y cierre

- [x] 8.1 Actualizar `docs/session-audit-model.md` §3.1, §4, §5: modelo fusionado, base 1, preflights excluidos, `stepKind`
- [x] 8.2 Ejecutar `npm run test:quick` — lint, typecheck y unit deben pasar
- [x] 8.3 Regresión manual: repetir análisis de sesión tipo `24b95025`; verificar ausencia de `workflows/00` en sesiones nuevas y una entrada en `workflow-sequence.json` por turno

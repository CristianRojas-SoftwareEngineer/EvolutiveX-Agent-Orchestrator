## 1. Correlador y cierre wire

- [x] 1.1 Añadir `closeWireWorkflowOnTerminalStop` en `gateway-wire-step.util.ts`
- [x] 1.2 `forceClose` con `outcome: success` marca `status: completed`

## 2. Proyección step_request

- [x] 2.1 Eliminar emit `step_request` desde `registerStep`
- [x] 2.2 Corregir `stepIndex: step.index` en `registerWireStepRequest`

## 3. Ensamblaje SSE

- [x] 3.1 Añadir handler `text`/`text_delta` en `StepAssemblerService`
- [x] 3.2 Test `ensambla bloque text`

## 4. Meta interactionType

- [x] 4.1 Persistir `interactionType` desde `workflowKind` en `onWorkflowStart`

## 5. Verificación

- [x] 5.1 `npm run test:unit` — 594 tests verdes

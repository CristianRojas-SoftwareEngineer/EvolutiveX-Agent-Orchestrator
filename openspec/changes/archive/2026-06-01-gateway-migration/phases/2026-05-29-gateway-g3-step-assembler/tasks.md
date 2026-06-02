## 1. Dominio — propagación de modelo en el port

- [x] 1.1 Añadir `setWorkflowModel(workflowId: string, modelId: string): void` a `IWorkflowRepository` en `src/1-domain/repositories/IWorkflowRepository.ts`, con doc del contrato (primer modelo observado, idempotente, no-op si ausente). Aceptación: typecheck `npm run test:quick`
- [x] 1.2 Verificar typecheck sin errores: `npm run test:quick`

## 2. Servicios — port y adapter del StepAssembler

- [x] 2.1 Crear `src/2-services/ports/step-assembler.port.ts` con `IStepAssembler` y los tipos `AssembledInference` y `AssembledToolUseBlock` (firmas del design.md). Aceptación: compila y exporta los tipos
- [x] 2.2 Crear `src/2-services/step-assembler.service.ts` implementando `IStepAssembler`: trasladar el estado de ensamblaje del handler (acumuladores de `usage` con fallback `message_delta`, `stopReason`, `model`, `anthropicMessageId`, bloques `thinking` y `tool_use` con input JSON acumulado y extracción `subagent_type`/`description`/`prompt`). Aceptación: `result()` devuelve `AssembledInference` consistente
- [x] 2.3 Implementar `setWorkflowModel` en `src/2-services/workflow-repository.service.ts`: fija `languageModelId` solo si está `undefined`; no-op si el `workflowId` no existe. Aceptación: idempotencia y no-op verificados por test
- [x] 2.4 Verificar: `npm run test:quick`

## 3. Operations — delegar ensamblaje y propagar modelo

- [x] 3.1 En `src/3-operations/audit-sse-response.handler.ts`, inyectar `IStepAssembler` (factory por inferencia) e `IWorkflowRepository` en el constructor
- [x] 3.2 Reemplazar las variables locales de ensamblaje por llamadas a `assembler.onEvent(evt)` dentro del bucle `stream.on('data')`; conservar intactas la captura `sse.txt`/`sse.jsonl` y los side-effects de `ISessionStore`
- [x] 3.3 En `stream.on('end')`, construir `StepMeta` y la metadata desde `assembler.result()` en lugar de las variables locales retiradas. Aceptación: salida de auditoría equivalente a la previa
- [x] 3.4 Al cierre de inferencia, resolver el workflow en el correlador (`sessionId` main / `agentId` subagente) y propagar el modelo del request vía `setWorkflowModel` (defensivo). Aceptación: no-op sin error cuando el workflow no existe
- [x] 3.5 Verificar: `npm run test:quick`

## 4. Composition root — cableado

- [x] 4.1 En el composition root (`src/4-api/**`), inyectar la factory de `StepAssembler` y el `IWorkflowRepository` existente en `AuditSseResponseHandler`. Aceptación: arranque sin errores de DI
- [x] 4.2 Verificar: `npm run test:quick`

## 5. Tests unitarios

- [x] 5.1 Tests del `StepAssembler`: usage desde `message_start`+`message_delta`; fallback de `input_tokens`/cache en `message_delta`; `stopReason`; `model`/`anthropicMessageId`; bloque `tool_use` con input acumulado; bloque `thinking`
- [x] 5.2 Tests de `setWorkflowModel`: primer modelo fija `languageModelId`; segundo modelo no sobrescribe; `workflowId` inexistente es no-op
- [x] 5.3 Test de no-regresión del handler SSE: `StepMeta`/metadata equivalentes y pending de `Agent`/WebSearch/WebFetch registrados igual; propagación de modelo invocada al cierre
- [x] 5.4 Verificar todos los tests: `npm run test:quick`

## 6. Gate de calidad

- [x] 6.1 `npm run test:quick` verde (lint + typecheck + unit)

## 7. Documentación

- [x] 7.1 Actualizar `docs/session-audit-model.md`: describir el `StepAssembler` (ensamblaje en RAM, §26) y la propagación de `languageModelId` al correlador; revisión manual

## 8. Legacy y gobernanza del orquestador

- [x] 8.1 Confirmar que la lógica de ensamblaje incrustada fue retirada de `audit-sse-response.handler.ts` y que no quedan imports/variables huérfanos creados por este change
- [x] 8.2 Verificar en `openspec/changes/gateway-migration/design.md` que el registro de G4 ya incluye el cableado wire→correlador de Steps diferido desde G3

## 9. Gobernanza OpenSpec (ejecutar al finalizar implementación)

- [x] 9.1 `openspec validate --changes gateway-g3-step-assembler` pasa sin errores
- [x] 9.2 Ejecutar `migration-phase-gate` para verificar la Definition of Done antes de archivar
- [x] 9.3 Actualizar el estado del change a `validada` y ejecutar sync + archive; marcar G3 → "archivada" en el registro del orquestador

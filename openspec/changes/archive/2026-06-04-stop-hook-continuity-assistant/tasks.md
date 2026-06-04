## 1. Extracción del contexto del workflow desde el transcript

- [x] 1.1 Añadir tipo `WorkflowContext` en `scripting/stop-work-summary-notification.ts`: `{ previous?: { userPrompt: string; lastAssistantText: string }; current: { userPrompt: string; messages: string[] } }`
- [x] 1.2 Implementar `extractWorkflowContext(transcriptPath: string): Promise<WorkflowContext | undefined>`: lectura línea por línea con `createInterface`, localización de los dos últimos mensajes `user`, compresión del turno previo (prompt + último texto assistant), retención completa del turno actual
- [x] 1.3 Añadir tests en `tests/scripting/stop-work-summary-notification.test.ts` para `extractWorkflowContext`: transcript con 2 workflows, transcript con 1 workflow, archivo no legible

## 2. Generación del mensaje de continuidad

- [x] 2.1 Reemplazar la constante `STOP_SUMMARY_PROMPT_PREFIX` por la nueva constante `CONTINUITY_PROMPT_PREFIX` con el prompt de tres dimensiones (qué se completó, qué está abierto, dirección del siguiente paso)
- [x] 2.2 Implementar `buildContinuityUserMessage(context: WorkflowContext): string`: ensambla el contexto del workflow previo (si existe) + workflow actual y aplica el tope `MAX_INPUT_CHARS` (actualizar a ≥ 15 000)
- [x] 2.3 Renombrar `summarizeWorkWithModel` → `generateContinuityMessage(context: WorkflowContext): Promise<string | undefined>` y actualizar `max_tokens` de 300 a 600; eliminar el truncado interno de la respuesta del modelo
- [x] 2.4 Añadir tests para `buildContinuityUserMessage`: incluye contexto previo cuando existe, solo contexto actual cuando no hay turno previo, trunca el input a `MAX_INPUT_CHARS`
- [x] 2.5 Añadir test para `generateContinuityMessage`: sin credenciales → `undefined`, error de API → `undefined` + stderr

## 3. Persistencia del mensaje en disco

- [x] 3.1 Implementar `writeContinuityMessage(text: string, projectDir: string): Promise<void>`: escribe en `<projectDir>/sessions/.last-continuity-message.txt`; captura errores y escribe en stderr sin lanzar
- [x] 3.2 Añadir tests para `writeContinuityMessage`: escritura exitosa verifica contenido del archivo, fallo de escritura no lanza y registra en stderr

## 4. Refactorización del orquestador de notificación

- [x] 4.1 Eliminar `notifyStopTurnFinished()` de `scripting/stop-work-summary-notification.ts`
- [x] 4.2 Renombrar `notifyWorkSummary` → `notifyContinuityMessage` y actualizar su firma para recibir el texto del mensaje de continuidad; el título sigue siendo `"Stop"` (no `"Resumen del trabajo"`)
- [x] 4.3 Renombrar `runStopWorkSummaryNotification` → `runContinuityNotification` y actualizar su firma para aceptar `(rawStdin: string, projectDir: string, deps?: {...})`: invocar en orden `extractWorkflowContext` → `generateContinuityMessage` → `writeContinuityMessage` → `notifyContinuityMessage` con la jerarquía de fallback definida en spec
- [x] 4.4 Actualizar el fallback de ausencia de texto fuente: si no hay `last_assistant_message` ni transcript, emitir toast con copy del catálogo (`getProfileForEvent('Stop')?.message`) en lugar de omitir el toast
- [x] 4.5 Actualizar tests de `runContinuityNotification`: flujo completo con contexto + API key, sin API key (fallback a texto truncado), sin texto fuente (copy del catálogo)

## 5. Actualización del orquestador principal

- [x] 5.1 En `scripting/stop-hook-ux.ts`: eliminar la llamada a `notifyStopTurnFinished()` y la importación correspondiente
- [x] 5.2 Pasar `process.env.CLAUDE_PROJECT_DIR ?? ''` como segundo argumento a `runContinuityNotification`
- [x] 5.3 Actualizar el mock en `tests/scripting/stop-hook-ux.test.ts`: eliminar mock de `notifyStopTurnFinished`, actualizar mock de `runContinuityNotification` con la nueva firma
- [x] 5.4 Actualizar tests de `runStopHookUx`: verificar que `notifyStopTurnFinished` ya no se llama, verificar que `runContinuityNotification` recibe `(raw, projectDir)`

## 6. Verificación

- [x] 6.1 Ejecutar `npm run test:quick` (lint + typecheck + unit); corregir cualquier error antes de continuar
- [x] 6.2 Prueba manual: `echo '{"hook_event_name":"Stop","transcript_path":"<ruta>","last_assistant_message":"Tests pasando."}' | CLAUDE_PROJECT_DIR=. npx tsx scripting/stop-hook-ux.ts` y verificar: un solo toast con título "Stop", archivo `sessions/.last-continuity-message.txt` creado
- [x] 6.3 Verificar fallback sin API key: ejecutar sin `ANTHROPIC_API_KEY`; el toast debe emitirse con el texto truncado del `last_assistant_message`
- [x] 6.4 Verificar fallback sin texto fuente: `echo '{}' | CLAUDE_PROJECT_DIR=. npx tsx scripting/stop-hook-ux.ts`; el toast debe emitirse con el copy del catálogo

## 7. Documentación

- [x] 7.1 Actualizar `docs/notifications.md` § Hook Stop: reemplazar la tabla de 5 pasos (doble toast) por el nuevo flujo de un solo toast con mensaje de continuidad; actualizar el fragmento JSON del `.claude/settings.json` (ajustar `timeout` a 120 s); actualizar el ejemplo de prueba manual
- [x] 7.2 Actualizar `README.md` § Configuración de hooks: actualizar la fila `Stop` de la tabla (eliminar referencia al doble toast, reflejar toast único con mensaje de continuidad)

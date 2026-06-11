## 1. Puerto de dominio (capa 1)

- [x] 1.1 Añadir la interfaz `UserPromptContext` y el método `extractUserPromptSubmitContext` al archivo `src/1-domain/ports/IContextExtractor.ts`. Verificar: `npm run typecheck`.

## 2. Adapter de extracción (capa 2)

- [x] 2.1 Implementar `extractUserPromptSubmitContext` en `src/2-services/tts/transcript-extractor.service.ts`: reutilizar `extractLastNMessages(path, 10)` y filtrar por rol (`user` y `assistant`) para producir `{ previousUserMessage, lastAssistantResponse, currentPrompt }`. Verificar: `npm run typecheck`.
- [x] 2.2 Añadir tests unitarios en `tests/2-services/tts/transcript-extractor.test.ts` que cubran: (a) transcript con un turno previo, (b) transcript vacío, (c) transcript con tres turnos previos, (d) transcript con bloques `system` intercalados. Verificar: `npm run test:quick -- transcript-extractor`.

## 3. Handler TTS (capa 3)

- [x] 3.1 En `src/3-operations/audit-hook-event.handler.ts`, añadir el helper privado `extractUserPromptContext(event)` que llama al nuevo método del extractor y mapea el resultado a `SessionMessage[]` (0-3 elementos: penúltimo user, último assistant, prompt actual). Verificar: `npm run typecheck`.
- [x] 3.2 En el mismo archivo, modificar `speakAsync` para enrutar a `extractUserPromptContext` cuando `mode === 'prompt'` y mantener `extractContext` para `mode === 'summary'`. Verificar: `npm run test:quick -- audit-hook-event`.
- [x] 3.3 Reformular la constante `VOICE_ASSISTANT_SYSTEM_PROMPT` para instruir al LLM a responder SOLO al tercer mensaje de la tríada. Verificar: `npm run test:quick`.
- [x] 3.4 Añadir tests unitarios en `tests/3-operations/audit-hook-event.handler.test.ts` que mockeen `ITTSService` y `IContextExtractor` y verifiquen: (a) `chatHistory` enviado a fetch contiene exactamente la tríada `user/assistant/user` cuando hay transcript, (b) `chatHistory` contiene solo el prompt actual cuando el transcript está vacío, (c) el `system` prompt usado es el reformulado. Verificar: `npm run test:quick -- audit-hook-event`.

## 4. Verificación final

- [x] 4.1 Ejecutar `npm run test:quick` (lint + typecheck + unit) y comprobar 0 errores.
- [x] 4.2 Si algún test de integración en `tests/scripting/headless-tts-*.test.ts` cubre `UserPromptSubmit`, verificar que sigue pasando con el nuevo contexto; en caso contrario, no es bloqueante para este change.
- [x] 4.3 Ejecutar `git status` para confirmar que solo se han tocado los archivos previstos (IContextExtractor, TranscriptContextExtractor, AuditHookEventHandler, sus tests). Commit con mensaje descriptivo en español y trailer `Case: <case-id>` si aplica.

## Why

Cuando el handler TTS procesa un evento `UserPromptSubmit`, hoy envía al LLM los últimos N mensajes del transcript de la sesión y le pide "responder al último mensaje del usuario". Pero el prompt que el usuario acaba de enviar **no está en el transcript** en ese momento — Claude Code documenta que `UserPromptSubmit` se dispara "before Claude processes it" — y el "último mensaje del usuario" que ve el LLM es el del **turno anterior**. El resultado: el audio que se reproduce responde a la petición previa, no a la actual.

## What Changes

- El handler, en la rama `UserPromptSubmit` con `mode='prompt'`, construirá un contexto curado a mano compuesto por **3 mensajes**:
  1. El penúltimo mensaje del usuario (seleccionado por rol `user`).
  2. La última respuesta del asistente en el turno anterior (seleccionada por rol `assistant`).
  3. El prompt actual que el usuario acaba de enviar (`event.prompt`).
- El system prompt de "asistente de voz" se reescribirá para guiar al LLM a responder al tercer mensaje (el actual), no al primero.
- La selección de los mensajes 1 y 2 vivirá en el extractor (`IContextExtractor` / `TranscriptContextExtractor`), no en el handler, para mantener la separación entre orquestación (PKA capa 3) y lectura de I/O (capa 2).
- Si el transcript no contiene los dos primeros mensajes (sesión nueva), el sistema seguirá reproduciendo el fallback `FALLBACK_SPEECH.UserPromptSubmit` y emitirá `[TTS-FALLBACK]` con `reason: no-messages`.
- Los eventos `Stop`, `SubagentStop` y `StopFailure` (modo `summary`) **no se ven afectados**: siguen usando el comportamiento actual (`extractLastNMessages`).

## Capabilities

### New Capabilities

Ninguna. La modificación vive completamente dentro de la capability `tts-hooks`.

### Modified Capabilities

- `tts-hooks`: el contexto que se envía al LLM en `UserPromptSubmit` deja de ser "últimos N del transcript" y pasa a ser la tríada curada (penúltimo user, último assistant, prompt actual). El system prompt de voz asistente se reformula para apuntar al tercer mensaje.

## Impact

- **Código afectado (PKA):**
  - Capa 1 (`src/1-domain/ports/IContextExtractor.ts`): se añade un método nuevo al puerto para extraer el contexto curado de `UserPromptSubmit`.
  - Capa 2 (`src/2-services/tts/transcript-extractor.service.ts`): implementación del nuevo método.
  - Capa 3 (`src/3-operations/audit-hook-event.handler.ts`): nuevo helper `extractUserPromptContext`; reformulación de `VOICE_ASSISTANT_SYSTEM_PROMPT`; `speakAsync` discrimina `mode='prompt'` para usar la tríada en lugar de los últimos N.
  - Capa 4 (`src/4-api/composition-root.ts`): sin cambios (las inyecciones existentes cubren el método nuevo del extractor).
- **APIs externas:** sin cambios. La llamada a OpenRouter mantiene `model`, `max_tokens: 512`, `reasoning: { effort: 'none' }` y los headers. Solo cambia la forma del array `messages`.
- **Tests:** se añaden/ajustan tests en `tests/2-services/tts/` y `tests/3-operations/` para cubrir la selección por rol, el caso de sesión nueva (transcript vacío) y la rama "modo prompt" del handler.
- **Documentación:** no requiere actualización de `docs/`. La spec `tts-hooks` es la fuente de verdad.
- **Comportamiento del usuario:** la voz reproducida en `UserPromptSubmit` ahora confirma la **petición actual** en lugar de la anterior. El toast, los demás eventos TTS y el audio por SAPI no cambian.

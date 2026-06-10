## REMOVED Requirements

### Requirement: Extracción del contexto del workflow desde el transcript

**Reason**: La extracción de contexto del transcript para el evento `Stop` se unifica en el extractor del gateway (`IContextExtractor` / `TranscriptContextExtractor`), que ya alimenta la voz. Mantener `extractWorkflowContext` en `scripting/stop-work-summary-notification.ts` duplica esa responsabilidad fuera del proceso del proxy.

**Migration**: El gateway extrae el contexto vía `IContextExtractor.extractLastNMessages(transcriptPath, N)` dentro de `AuditHookEventHandler` al procesar el evento `Stop`. El script `stop-work-summary-notification.ts` se elimina.

### Requirement: Generación del mensaje de continuidad con modelo

**Reason**: La generación con `@anthropic-ai/sdk` y `ANTHROPIC_AUTH_TOKEN` solo funciona con tokens de Anthropic; con cualquier otro provider Anthropic-compatible (Minimax, etc.) falla en silencio. El gateway ya genera el texto de continuidad del `Stop` vía `fetch()` al proxy local con el token capturado del request, que funciona con cualquier provider.

**Migration**: El texto de continuidad se obtiene en `AuditHookEventHandler.generateSpeechText(eventName, messages, 'summary')` (gateway), reutilizando el transporte introducido en `fix-tts-generic-fallback`. `generateContinuityMessage` y `resolveAnthropicClient` se eliminan.

### Requirement: Persistencia del mensaje de continuidad en disco

**Reason**: El archivo `sessions/.last-continuity-message.txt` fue concebido como punto de integración para una «Fase 2 TTS» que nunca lo consumió. La voz y el toast se generan ahora en memoria dentro del gateway a partir del mismo texto; no existe lector del archivo.

**Migration**: Ninguna lectura depende de este archivo. `writeContinuityMessage` se elimina y el archivo deja de escribirse.

### Requirement: Toast único del hook Stop con mensaje de continuidad

**Reason**: El toast del `Stop` se traslada al gateway para emitirse desde el mismo texto que la voz, eliminando la inconsistencia voz↔toast y el bug de provider. El orquestador `runContinuityNotification` y el script `stop-hook-ux.ts` que lo invocaba dejan de existir.

**Migration**: El toast del `Stop` queda cubierto por el nuevo requisito «Toast de continuidad del Stop emitido por el gateway» en la capability `tts-hooks`. En `configs/hooks.json`, el evento `Stop` pasa a ejecutar `scripting/post-hook-event.ts` (POST `/hooks`), y el gateway emite voz + toast.

## Why

El handler `AuditHookEventHandler` realiza un `fetch` inline a Gemini Flash para generar el texto de locución TTS. Cuando Gemini devuelve 429, un 5xx o la red cae, el turno queda en silencio total: no hay audio alternativo. Se necesita una cadena de fallback que intente OpenRouter antes de recurrir al texto estático genérico.

## What Changes

- Se introduce el puerto de dominio `ITtsTextProvider` en `src/1-domain/ports/` con un único método `generateText(eventName, messages, mode)` que siempre devuelve un `string` no vacío.
- Se implementa `GeminiTtsTextProvider` en `src/2-services/tts/` usando el modelo `gemini-3.1-flash-lite` (mayor cuota libre que el anterior `gemini-2.5-flash`).
- Se implementa `OpenRouterTtsTextProvider` en `src/2-services/tts/` usando `poolside/laguna-xs.2:free` con la API Anthropic-compatible de OpenRouter (`https://openrouter.ai/api`, bearer `ANTHROPIC_AUTH_TOKEN`).
- Se implementa `TtsTextProviderChain` en `src/2-services/tts/`: intenta Gemini y, ante cualquier fallo (429, 5xx, red, respuesta vacía), cae a OpenRouter; si ambos fallan, devuelve el texto de fallback estático según el tipo de evento.
- El constructor de `AuditHookEventHandler` reemplaza el parámetro `ttsApiKey?: string` por `ttsTextProvider?: ITtsTextProvider`. La lógica de `fetch` inline desaparece del handler.
- `composition-root.ts` instancia los dos providers y la cadena, y resuelve las credenciales de Gemini (`routing/providers/gemini/secrets.json`) y OpenRouter (`routing/providers/openrouter/secrets.json`).

## Capabilities

### Modified Capabilities
- `tts-hooks`: el requisito "Provider dedicado de inferencia TTS" cambia de un `fetch` inline a Gemini `gemini-2.5-flash` inyectado vía `ttsApiKey`, a un puerto `ITtsTextProvider` que encapsula la cadena Gemini `gemini-3.1-flash-lite` → OpenRouter `poolside/laguna-xs.2:free`, con fallback estático ante fallo de ambos providers.

## Impact

- **Modificados**: `src/3-operations/audit-hook-event.handler.ts` (constructor + `generateSpeechText`), `src/4-api/composition-root.ts` (cableado de providers y resolución de credenciales).
- **Nuevos**: `src/1-domain/ports/ITtsTextProvider.ts`, `src/2-services/tts/gemini-tts-text-provider.ts`, `src/2-services/tts/openrouter-tts-text-provider.ts`, `src/2-services/tts/tts-text-provider-chain.ts`.
- **Sin cambios**: `features/voice.ts`, scripting, instaladores, sidecar Piper, puerto `ITTSService`, `IContextExtractor`.
- **Credenciales**: la clave Gemini ya existe en disco; el bearer de OpenRouter ya existe en `routing/providers/openrouter/secrets.json`.

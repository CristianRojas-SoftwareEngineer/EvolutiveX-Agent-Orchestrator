## ADDED Requirements

### Requirement: Puerto de dominio ITtsTextProvider
El sistema SHALL exponer el puerto `ITtsTextProvider` en `src/1-domain/ports/ITtsTextProvider.ts` con un único método `generateText(eventName: string, messages: SessionMessage[], mode: 'prompt' | 'summary'): Promise<string>`. El método SHALL siempre devolver un string no vacío: si los providers fallan, devuelve el texto de fallback estático correspondiente al `eventName`. El handler `AuditHookEventHandler` SHALL recibir este puerto por constructor como `ttsTextProvider?: ITtsTextProvider` en lugar del parámetro `ttsApiKey?: string`.

#### Scenario: Provider disponible genera texto dinámico
- **WHEN** `AuditHookEventHandler` invoca `generateText` con mensajes no vacíos
- **THEN** SHALL devolver el texto generado por el primer provider de la cadena que responda con éxito
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false`

#### Scenario: Provider ausente devuelve texto de fallback
- **WHEN** no se inyecta `ITtsTextProvider` en el constructor del handler
- **THEN** SHALL devolver el texto de fallback estático de `composeFallbackText(eventName)` sin lanzar excepción

## MODIFIED Requirements

### Requirement: Provider dedicado de inferencia TTS (OpenRouter → Gemini)
La generación del texto de intención/resumen TTS SHALL usar el puerto `ITtsTextProvider` inyectado por el composition root. La implementación por defecto SHALL seguir una cadena de dos providers: primero `GeminiTtsTextProvider` con el modelo `gemini-3.1-flash-lite`, y si Gemini falla (429, 5xx, error de red o respuesta vacía), SHALL caer a `OpenRouterTtsTextProvider` con el modelo `poolside/laguna-xs.2:free` usando la API Anthropic-compatible de OpenRouter (`https://openrouter.ai/api`, bearer `ANTHROPIC_AUTH_TOKEN` leído de `routing/providers/openrouter/secrets.json`). Si ambos providers fallan, SHALL devolver el texto de fallback estático según el tipo de evento. La credencial de Gemini SHALL seguir leyéndose de `routing/providers/gemini/secrets.json`. El campo `ttsApiKey` inyectado directamente en el handler SHALL ser eliminado; las implementaciones de los providers gestionan sus propias credenciales. La **síntesis de voz** continúa en el sidecar local (sin cambio). El provider de la sesión activa NO SHALL recibir ninguna petición de inferencia TTS.

#### Scenario: Gemini responde con éxito en el primer intento
- **GIVEN** que `GeminiTtsTextProvider` está configurado con una clave Gemini válida
- **AND** el modelo `gemini-3.1-flash-lite` responde HTTP 200 con texto no vacío
- **WHEN** el handler invoca `generateText`
- **THEN** SHALL devolver el texto de Gemini sin intentar OpenRouter
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false`

#### Scenario: Gemini falla con 429 activa el fallback a OpenRouter
- **GIVEN** que `GeminiTtsTextProvider` recibe un HTTP 429 de Gemini
- **WHEN** el handler invoca `generateText`
- **THEN** SHALL intentar la generación con `OpenRouterTtsTextProvider` (modelo `poolside/laguna-xs.2:free`)
- **AND** si OpenRouter responde con éxito SHALL devolver ese texto
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false`

#### Scenario: Ambos providers fallan activa el fallback estático
- **GIVEN** que `GeminiTtsTextProvider` falla con error de red
- **AND** `OpenRouterTtsTextProvider` también falla
- **WHEN** el handler invoca `generateText`
- **THEN** SHALL devolver el texto de `composeFallbackText(eventName)` sin lanzar excepción
- **AND** SHALL emitir `[TTS-FALLBACK]` con `reason` que identifica el fallo

#### Scenario: Sin clave Gemini el primer provider cae a OpenRouter
- **GIVEN** que `routing/providers/gemini/secrets.json` no existe o no contiene `GEMINI_API_KEY`
- **WHEN** el handler invoca `generateText`
- **THEN** `GeminiTtsTextProvider` SHALL fallar inmediatamente sin llamada HTTP
- **AND** `OpenRouterTtsTextProvider` SHALL ser intentado como fallback

#### Scenario: Sesión con cualquier provider genera texto vía la cadena ITtsTextProvider
- **GIVEN** que la sesión activa usa MiniMax (o Anthropic, u Ollama) como provider
- **AND** el handler tiene un `ITtsTextProvider` inyectado
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL invocar `generateText` en el puerto inyectado
- **AND** el provider de la sesión NO SHALL recibir ninguna petición de inferencia TTS

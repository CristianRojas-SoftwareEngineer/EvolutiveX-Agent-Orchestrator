## 1. Puerto de dominio ITtsTextProvider

- [x] 1.1 Crear `src/1-domain/ports/ITtsTextProvider.ts` con la interfaz `ITtsTextProvider` y el método `generateText(eventName: string, messages: SessionMessage[], mode: 'prompt' | 'summary'): Promise<string>` ~doing

## 2. Implementación GeminiTtsTextProvider

- [x] 2.1 Crear `src/2-services/tts/gemini-tts-text-provider.ts` con la clase `GeminiTtsTextProvider` que recibe `apiKey: string | undefined` por constructor e implementa `ITtsTextProvider` ~doing
- [x] 2.2 Extraer la lógica de payload Gemini (`contents`, `systemInstruction`, `generationConfig` con `thinkingBudget: 0`) de `audit-hook-event.handler.ts` a `GeminiTtsTextProvider.generateText()` ~doing
- [x] 2.3 Usar el endpoint `gemini-3.1-flash-lite` en lugar de `gemini-2.5-flash`; lanzar error ante ausencia de clave, respuesta HTTP no-ok o texto vacío ~doing

## 3. Implementación OpenRouterTtsTextProvider

- [x] 3.1 Crear `src/2-services/tts/openrouter-tts-text-provider.ts` con la clase `OpenRouterTtsTextProvider` que recibe `bearerToken: string | undefined` por constructor e implementa `ITtsTextProvider` ~doing
- [x] 3.2 Implementar `generateText()` llamando a `https://openrouter.ai/api/v1/messages` con payload Anthropic-compatible (`model: "poolside/laguna-xs.2:free"`, `max_tokens: 512`, `system`, `messages`), header `Authorization: Bearer <bearerToken>`, `content-type: application/json` ~doing
- [x] 3.3 Lanzar error ante ausencia de bearer, respuesta HTTP no-ok o texto vacío en la respuesta ~doing

## 4. Orquestador TtsTextProviderChain

- [x] 4.1 Crear `src/2-services/tts/tts-text-provider-chain.ts` con la clase `TtsTextProviderChain` que recibe `primary: ITtsTextProvider` y `fallback: ITtsTextProvider` por constructor e implementa `ITtsTextProvider`
- [x] 4.2 Implementar `generateText()`: intentar `primary.generateText()`, capturar cualquier error y llamar a `fallback.generateText()`; si el fallback también lanza, propagar el error hacia arriba

## 5. Modificar AuditHookEventHandler

- [x] 5.1 Reemplazar el parámetro `ttsApiKey?: string` por `ttsTextProvider?: ITtsTextProvider` en el constructor de `AuditHookEventHandler`
- [x] 5.2 Simplificar `generateSpeechText()`: si `ttsTextProvider` no está inyectado o `messages` está vacío, devolver `composeFallbackText(eventName)`; de lo contrario, delegar a `ttsTextProvider.generateText(eventName, messages, mode)` y devolver el resultado
- [x] 5.3 Eliminar la constante `GEMINI_FLASH_URL`, el bloque `try/catch` con `fetch` y la guard `if (!this.ttsApiKey)` de `generateSpeechText()`

## 6. Modificar composition-root.ts

- [x] 6.1 Añadir la función `resolveOpenRouterApiKey()` que lee `routing/providers/openrouter/secrets.json` y devuelve el campo `ANTHROPIC_AUTH_TOKEN` o `undefined` si el archivo no existe
- [x] 6.2 Instanciar `GeminiTtsTextProvider(ttsApiKey)`, `OpenRouterTtsTextProvider(openRouterKey)` y `TtsTextProviderChain(geminiProvider, openRouterProvider)` antes de construir `AuditHookEventHandler`
- [x] 6.3 Pasar `ttsTextProvider: ttsEnabled ? chain : undefined` al constructor de `AuditHookEventHandler` y eliminar el argumento `ttsApiKey`

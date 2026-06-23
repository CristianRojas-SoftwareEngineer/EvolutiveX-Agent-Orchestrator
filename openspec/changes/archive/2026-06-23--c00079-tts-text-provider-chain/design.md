## Context

`AuditHookEventHandler.generateSpeechText()` contiene un `fetch` inline a la API REST de Gemini (`gemini-2.5-flash`) directamente en la capa 3-operations. Cuando Gemini devuelve 429 u otro error, el método devuelve el texto de fallback estático sin intentar ningún provider alternativo: el turno queda en silencio total. El handler recibe la API key (`ttsApiKey?: string`) como parámetro de constructor y gestiona el payload de Gemini de forma acoplada.

La arquitectura del proyecto sigue clean architecture con inversión de dependencias: las capas 3-operations y superiores dependen de puertos (interfaces) definidos en `src/1-domain/ports/`; las implementaciones concretas viven en `src/2-services/`. El fetch inline viola esta separación.

## Goals / Non-Goals

**Goals:**
- Introducir `ITtsTextProvider` como puerto de dominio que abstrae la generación de texto TTS.
- Implementar la cadena `GeminiTtsTextProvider → OpenRouterTtsTextProvider` con fallback automático ante cualquier fallo del provider primario.
- Eliminar el `fetch` inline de `AuditHookEventHandler` y el parámetro `ttsApiKey` del constructor.
- Cablear los dos providers y la cadena en `composition-root.ts`.

**Non-Goals:**
- Cambiar la síntesis de voz (sidecar Piper, `ITTSService`, `PiperSidecarService`).
- Modificar `features/voice.ts`, scripting o instaladores.
- Añadir reintentos con back-off dentro de cada provider (la cadena ya ofrece resiliencia suficiente con un solo intento por provider).

## Decisions

### D1 — Placement del puerto en capa 1-domain
`ITtsTextProvider` vive en `src/1-domain/ports/ITtsTextProvider.ts`, siguiendo el mismo patrón de `ITTSService` e `IContextExtractor`. El handler solo importa el puerto; nunca importa implementaciones concretas.

### D2 — Placement de las implementaciones en src/2-services/tts/
`GeminiTtsTextProvider`, `OpenRouterTtsTextProvider` y `TtsTextProviderChain` se crean en `src/2-services/tts/`, junto a `PiperSidecarService` y `TranscriptContextExtractor`. Evita crear un subdirectorio nuevo; la cohesión ya está en el nombre de archivo.

### D3 — Contrato del puerto: siempre devuelve string no vacío
`generateText(eventName, messages, mode): Promise<string>` nunca lanza ni devuelve string vacío. Esto simplifica el caller: el handler llama al puerto y usa el resultado directamente, sin gestionar promesas rechazadas.

### D4 — composeFallbackText permanece en el handler
La lógica de texto de fallback estático (por evento) no pertenece al puerto ni a la cadena. Permanece como método privado del handler y se invoca cuando `ttsTextProvider` no está inyectado o `messages` está vacío. La cadena lanza internamente; el handler captura y llama `composeFallbackText`.

### D5 — Credentials: cada provider resuelve las suyas en construcción
`GeminiTtsTextProvider` recibe `apiKey: string | undefined` por constructor (la composition root lo lee de `routing/providers/gemini/secrets.json`). `OpenRouterTtsTextProvider` recibe `bearerToken: string | undefined` (leído de `routing/providers/openrouter/secrets.json`, campo `ANTHROPIC_AUTH_TOKEN`). Si la credencial falta, el provider falla en el primer intento; el orquestador cae al siguiente.

### D6 — OpenRouter usa la API Anthropic-compatible
`OpenRouterTtsTextProvider` llama a `https://openrouter.ai/api/v1/messages` con el payload de la API de Anthropic (campo `model: "poolside/laguna-xs.2:free"`, `max_tokens: 512`, `system`, `messages`). El bearer se envía en el header `Authorization: Bearer <ANTHROPIC_AUTH_TOKEN>`.

### D7 — Eliminación del legacy en el handler
Se eliminan: la constante `GEMINI_FLASH_URL`, el bloque `try/catch` con `fetch` en `generateSpeechText()`, y el parámetro `ttsApiKey?: string` del constructor. `generateSpeechText()` queda como:
```
if (!ttsTextProvider || messages.length === 0) return composeFallbackText(eventName)
return ttsTextProvider.generateText(eventName, messages, mode)
```

## Risks / Trade-offs

- **Latencia adicional en la cadena**: si Gemini falla, el turno espera a que OpenRouter responda antes de hablar. Mitigación: ambas llamadas tienen `max_tokens: 512` y usan modelos ligeros; la latencia añadida es acceptable para audio de fondo.
- **ANTHROPIC_AUTH_TOKEN expuesto en logs si se loguea la configuración**: Mitigación: `composition-root.ts` no loguea credenciales; el provider no loguea el bearer.
- **poolside/laguna-xs.2:free puede estar indisponible**: la calidad de la respuesta de fallback depende de la disponibilidad de OpenRouter. Si también falla, el texto estático de `composeFallbackText` es la red de seguridad final.

## Migration Plan

1. Crear `src/1-domain/ports/ITtsTextProvider.ts`.
2. Crear `src/2-services/tts/gemini-tts-text-provider.ts` con la lógica extraída de `generateSpeechText()`.
3. Crear `src/2-services/tts/openrouter-tts-text-provider.ts` con la llamada Anthropic-compatible a OpenRouter.
4. Crear `src/2-services/tts/tts-text-provider-chain.ts` que orqueste la cadena.
5. Modificar `AuditHookEventHandler`: eliminar `ttsApiKey`, añadir `ttsTextProvider?: ITtsTextProvider`, simplificar `generateSpeechText`.
6. Modificar `composition-root.ts`: añadir `resolveOpenRouterApiKey()`, instanciar la cadena, pasar `ttsTextProvider` al handler en lugar de `ttsApiKey`.
7. Rollback: `git revert` del commit de freeze o eliminar `openspec/changes/c00079-tts-text-provider-chain/` si la corrida no satisface.

## Open Questions

Ninguna — todas las decisiones de diseño fueron resueltas durante la exploración.

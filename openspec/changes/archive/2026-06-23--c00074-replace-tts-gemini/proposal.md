## Why

El sistema TTS actual está acoplado a Windows: usa SAPI (PowerShell) para la síntesis de audio y OpenRouter para la generación del texto de intención, creando un gap multiplataforma documentado en `sapi-tts.service.ts` y un segundo proveedor externo de pago. Reemplazar ambos con Gemini (gemini-2.5-flash para generación de intención y gemini-2.5-flash-preview-tts para síntesis de voz, con reproducción vía WAV temporal + players built-in por OS) elimina la dependencia de Windows, consolida en un único proveedor ya disponible en el proyecto, y cierra la deuda técnica de la implementación multiplataforma pendiente.

## What Changes

- **DELETE** `src/2-services/tts/sapi-tts.service.ts` — adaptador SAPI/PowerShell eliminado sin fallback
- **CREATE** `src/2-services/tts/gemini-tts.service.ts` — nuevo `GeminiTTSService` que implementa `ITTSService`: llama a `gemini-2.5-flash-preview-tts`, convierte PCM 24kHz/16-bit mono a WAV temporal y lo reproduce vía wrapper per-OS (PowerShell Media.SoundPlayer en Windows, `afplay` en macOS, `aplay`/`paplay` en Linux)
- **MODIFY** `src/3-operations/audit-hook-event.handler.ts` — sustituir las constantes `TTS_OPENROUTER_URL`/`TTS_MODEL` y el método `generateSpeechText()` por una llamada a `gemini-2.5-flash`; mantener prompts `VOICE_ASSISTANT_SYSTEM_PROMPT` y `CONTINUITY_SYSTEM_PROMPT` adaptados a la API de Gemini
- **MODIFY** `src/4-api/composition-root.ts` — importar `GeminiTTSService` en lugar de `SapiTTSService`; adaptar `resolveTtsApiKey()` para leer `GEMINI_API_KEY` de `routing/providers/gemini/secrets.json`
- **REPLACE** `scripting/headless/modules/local-announce.ts` — eliminar anuncio SAPI; reemplazar `speakLocal()` por implementación multiplataforma coherente con el nuevo wrapper per-OS
- **ADAPT** `scripting/headless/gateway-test.ts` y módulos `wait-for-tts.ts` — actualizar para el flujo Gemini (referencias a SAPI eliminadas; `wait-for-tts.ts` ya drena sobre `[TTS-SPEECH]`/`[TTS-FALLBACK]` sin cambio de contrato)

## Capabilities

### Modified Capabilities

- `tts-hooks`: Tres requisitos modificados — (1) **Provider dedicado de inferencia TTS**: OpenRouter (`poolside/laguna-xs-2.1:free`) → Gemini (`gemini-2.5-flash`), credencial de `routing/providers/openrouter/secrets.json#ANTHROPIC_AUTH_TOKEN` → `routing/providers/gemini/secrets.json#GEMINI_API_KEY`; (2) **Motor de síntesis de audio**: SAPI/PowerShell → `gemini-2.5-flash-preview-tts` + decodificación PCM→WAV temporal + reproductor built-in per-OS; (3) **Motivos de fallback en logging**: `no-openrouter-key` → `no-gemini-key` en los tags `[TTS-FALLBACK]`. Los requisitos de extracción de contexto (tríada transcript), alcance de hooks (UserPromptSubmit/Stop/SubagentStop/StopFailure), robustez asíncrona, toast de Stop, logging `[TTS-SPEECH]`/`[TTS-FALLBACK]`, y el puerto `IContextExtractor` permanecen sin cambio de contrato.

## Impact

- `src/2-services/tts/` — `sapi-tts.service.ts` eliminado; `gemini-tts.service.ts` creado; `fallback-speech.constants.ts`, `transcript-extractor.service.ts` y `normalize-speech-text.ts` sin cambios
- `src/3-operations/audit-hook-event.handler.ts` — lógica de inferencia TTS reemplazada; estructura y orquestación mantenidas
- `src/4-api/composition-root.ts` — wiring del servicio TTS y resolución de credencial actualizados
- `src/1-domain/ports/ITTSService.ts`, `src/1-domain/ports/IContextExtractor.ts` — sin cambios
- `routing/providers/gemini/secrets.json` — ya creado como precondición; llave `GEMINI_API_KEY`
- `routing/providers/openrouter/secrets.json` — conservado (sigue siendo el provider de inferencia principal de la sesión)
- `scripting/headless/` — `local-announce.ts` reemplazado; `gateway-test.ts` y `wait-for-tts.ts` adaptados; contrato de logs `[TTS-SPEECH]`/`[TTS-FALLBACK]` sin cambio
- `scripting/install/features/voice.ts` — **sin cambios** (feature de dictado por micrófono, independiente del TTS de salida)

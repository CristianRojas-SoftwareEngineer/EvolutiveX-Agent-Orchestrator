## 1. Nuevo adaptador GeminiTTSService

- [x] 1.1 Crear `src/2-services/tts/gemini-tts.service.ts` ~doing que implemente `ITTSService`: constantes WAV (SAMPLE_RATE=24000, BIT_DEPTH=16, CHANNELS=1), método `buildWavBuffer(pcm: Buffer): Buffer` que antepone el encabezado RIFF/WAVE de 44 bytes al PCM, y método privado `playWav(wavPath: string): void` que despacha al player del SO según `process.platform` (PowerShell `Media.SoundPlayer` en `win32`, `afplay` en `darwin`, `aplay`/`paplay` en `linux`) mediante `spawnSync`, lanzando si el código de salida es distinto de cero.
- [x] 1.2 Implementar `GeminiTTSService.initialize()` como no-op (Gemini no requiere inicialización asíncrona).
- [x] 1.3 Implementar `GeminiTTSService.speak(text: string)`: normalizar con `normalizeSpeechText`, llamar a `gemini-2.5-flash-preview-tts` (`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=<apiKey>`) con `responseModalities: ["AUDIO"]` y `voiceName: "Aoede"`, decodificar `candidates[0].content.parts[0].inlineData.data` de base64 a Buffer, construir el WAV, escribirlo en `os.tmpdir()/tts-<Date.now()>-<random>.wav`, reproducir con `playWav`, y eliminar el archivo temporal en `finally`.
- [x] 1.4 Añadir manejo de errores en `speak`: cualquier excepción (HTTP no-2xx, ENOENT del player, error de playback) es absorbida y registrada en `process.stderr` sin propagarse (el handler ya gestiona el fallback a nivel de `generateSpeechText`).

## 2. Reemplazo de la inferencia OpenRouter en AuditHookEventHandler

- [x] 2.1 Eliminar las constantes `TTS_OPENROUTER_URL` (línea 22) y `TTS_MODEL` (línea 23) ~doing de `src/3-operations/audit-hook-event.handler.ts`.
- [x] 2.2 En `generateSpeechText()` (línea 326), reemplazar el `if (!this.ttsApiKey)` + razón `'no-openrouter-key'` por `'no-gemini-key'` para alinear con la spec.
- [x] 2.3 Reemplazar el bloque `fetch(TTS_OPENROUTER_URL, ...)` (líneas 355–370) por una llamada a `gemini-2.5-flash` vía la API de Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=<apiKey>` con `{ contents: [{ role: "user", parts: [{ text: <prompt> }] }], systemInstruction: { parts: [{ text: systemPrompt }] } }`.
- [x] 2.4 Adaptar la extracción de texto de la respuesta: de `data.content` (formato Anthropic/OpenRouter) a `data.candidates[0].content.parts` (formato Gemini), extrayendo el `text` del primer part de tipo texto; si está vacío, emitir `[TTS-FALLBACK]` con `reason: 'empty-response'`.

## 3. Cableado en composition-root.ts

- [x] 3.1 En `src/4-api/composition-root.ts` ~doing, reemplazar el import de `SapiTTSService` (línea 22) por `GeminiTTSService` desde `'../2-services/tts/gemini-tts.service.js'`.
- [x] 3.2 En `composition-root.ts`, reemplazar la instanciación `new SapiTTSService()` (línea 104) por `new GeminiTTSService(ttsApiKey)`, pasando la clave resuelta.
- [x] 3.3 Reescribir `resolveTtsApiKey()` (líneas 157–170): cambiar la ruta de `routing/providers/openrouter/secrets.json` a `routing/providers/gemini/secrets.json`, la variable de entorno de override de `OPENROUTER_SECRETS_PATH` a `GEMINI_SECRETS_PATH`, y la clave leída de `ANTHROPIC_AUTH_TOKEN` a `GEMINI_API_KEY`.

## 4. Reemplazo del anuncio headless local-announce.ts

- [x] 4.1 Reemplazar `scripting/headless/modules/local-announce.ts` ~doing: eliminar la síntesis SAPI (`System.Speech.Synthesis` vía PowerShell) de `speakLocal()`; reimplementar `speakLocal(text)` para despachar al player del SO según `process.platform` (misma lógica per-OS de D2: PowerShell `Media.SoundPlayer` en `win32`, `afplay` en `darwin`, `aplay` en `linux`), pero construyendo el WAV a partir del texto con `spawnSync` de `edge-tts` o, dado que el entorno headless no tiene servicio Gemini activo, simplemente logueando el texto como no-op audible en cualquier plataforma y delegando la síntesis de voz real al gateway; mantener las firmas `speakLocal`, `announceProviderStart` y `announceProviderEnd` sin cambio para no romper la importación en `gateway-test.ts`.
- [x] 4.2 Actualizar el comentario JSDOC de `speakLocal` para eliminar la referencia a SAPI/Windows-only y describir el comportamiento nuevo.

## 5. Retirada de SapiTTSService

- [x] 5.1 Eliminar el archivo `src/2-services/tts/sapi-tts.service.ts` ~doing una vez que `composition-root.ts` ya no lo importe (verificar con grep que no queda ninguna otra referencia antes de borrar).

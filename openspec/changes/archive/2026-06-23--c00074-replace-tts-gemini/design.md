## Context

El gateway proxy implementa TTS de salida (lectura en voz alta de continuidad/intención) mediante dos mecanismos que actualmente están acoplados a Windows y a OpenRouter:

1. **Motor de síntesis**: `SapiTTSService` invoca PowerShell con `System.Speech.Synthesis`, que solo existe en Windows.
2. **Generación de intención**: `AuditHookEventHandler` llama a `poolside/laguna-xs.2:free` vía OpenRouter para generar el texto que sintetiza la voz.

Ambos mecanismos viven dentro de la arquitectura PKA del gateway: el adaptador `SapiTTSService` implementa el puerto `ITTSService` (capa 1-domain), es usado por `AuditHookEventHandler` (capa 3-operations) que recibe los eventos de hook, y está cableado en `composition-root.ts` (capa 4-api).

El reemplazo es un cambio de adaptadores contenido en las capas 2 y 3: la interfaz `ITTSService`, el puerto `IContextExtractor`, los mensajes de fallback `FALLBACK_SPEECH`, el normalizador `normalize-speech-text.ts`, y el mecanismo de toasts y logging `[TTS-SPEECH]`/`[TTS-FALLBACK]` permanecen sin cambio de contrato.

---

## Goals / Non-Goals

**Goals:**

- Crear `GeminiTTSService` que implemente `ITTSService` usando `gemini-2.5-flash-preview-tts`, convirtiendo la respuesta PCM a WAV y reproduciéndola con el player built-in del SO.
- Reemplazar la llamada de inferencia OpenRouter en `AuditHookEventHandler` por una llamada a `gemini-2.5-flash` para la generación de intención/continuidad.
- Eliminar `SapiTTSService` y todas las referencias a OpenRouter en el flujo TTS.
- Reemplazar `local-announce.ts` (SAPI headless) por un anuncio multiplataforma coherente con el nuevo mecanismo.
- Dejar el sistema funcional en Windows, macOS y Linux sin dependencias nativas (no node-gyp).

**Non-Goals:**

- Modificar `ITTSService`, `IContextExtractor`, `FALLBACK_SPEECH`, `normalize-speech-text.ts` o los contratos de logging `[TTS-SPEECH]`/`[TTS-FALLBACK]`.
- Modificar el alcance de hooks (UserPromptSubmit, Stop, SubagentStop, StopFailure).
- Modificar `scripting/install/features/voice.ts` (feature de dictado por micrófono, independiente del TTS de salida).
- Agregar reintentos, circuit breaker, ni caché de texto en la llamada a Gemini.
- Soportar streaming de audio; la reproducción es completa una vez recibida la respuesta.

---

## Decisions

### D1 — Mantener la arquitectura Gateway-PKA, sustituir solo los adaptadores

**Decisión:** conservar el flujo existente (hook relay → gateway → `AuditHookEventHandler` → `ITTSService`) y reemplazar únicamente los adaptadores concretos (`SapiTTSService` → `GeminiTTSService`) y la lógica de inferencia OpenRouter → Gemini.

**Alternativa descartada:** migrar a un hook standalone (`hooks/user-prompt-submit.ts` que hace intent→TTS→playback inline, fuera del gateway). Descartado porque perdería: (a) el contexto de transcript (tríada) ya disponible en el handler, (b) los toasts de escritorio vía `INotificationService`, (c) la observabilidad headless (`[TTS-SPEECH]`/`[TTS-FALLBACK]`), y (d) la consistencia entre eventos (Stop, SubagentStop, StopFailure, UserPromptSubmit).

---

### D2 — PCM→WAV temporal + player built-in del SO (sin node-gyp)

**Decisión:** Gemini TTS devuelve PCM 24kHz/16-bit mono en base64. El servicio:
1. Decodifica el base64 a `Buffer`.
2. Construye un encabezado WAV estándar (RIFF/WAVE, 44 bytes) para ese PCM.
3. Escribe el buffer WAV en un archivo temporal (`os.tmpdir()` + nombre único por `Date.now()`).
4. Lanza el player del SO con `spawnSync`/`execSync`, bloqueando hasta que termina.
5. Elimina el archivo temporal tras la reproducción (o en `finally` para limpieza garantizada).

**Selección del player por plataforma (`process.platform`):**
| `process.platform` | Comando |
|---|---|
| `win32` | `powershell -c (New-Object Media.SoundPlayer '<path>').PlaySync()` |
| `darwin` | `afplay '<path>'` |
| `linux` | `aplay '<path>'` (fallback: `paplay '<path>'` si `aplay` no está disponible) |

**Alternativa descartada:** paquete `speaker` (consume PCM crudo, sin conversión WAV). Descartado por ser un módulo nativo node-gyp que requiere toolchain C++ — frágil en cross-platform, problemático en entornos sin compilador.

**Construcción del encabezado WAV** (valores fijos para PCM 24kHz/16-bit/mono):
```
ChunkID   : "RIFF"
ChunkSize : 36 + dataSize
Format    : "WAVE"
Subchunk1ID   : "fmt "
Subchunk1Size : 16
AudioFormat   : 1 (PCM)
NumChannels   : 1
SampleRate    : 24000
ByteRate      : 48000
BlockAlign    : 2
BitsPerSample : 16
Subchunk2ID   : "data"
Subchunk2Size : dataSize
```

---

### D3 — Mantener el contexto rico (tríada transcript + resumen)

**Decisión:** la generación de intención/continuidad en `AuditHookEventHandler` conserva el mecanismo actual: para `UserPromptSubmit` se compone la tríada (último user + último assistant del transcript + prompt actual), y para `Stop`/`SubagentStop`/`StopFailure` se usa el resumen de contexto. Solo cambia el endpoint: de OpenRouter a la API de Gemini (`gemini-2.5-flash`).

**Alternativa descartada:** minimalista prompt-only (solo el prompt del usuario, ≤15 palabras). Descartado porque eliminaría la continuidad conversacional que el sistema ya entrega.

---

### D4 — Conservar FALLBACK_SPEECH con mensajes genéricos mínimos

**Decisión:** mantener `fallback-speech.constants.ts` sin cambio. Cuando Gemini no está disponible (sin clave, HTTP error, timeout), el handler emite `[TTS-FALLBACK]` con el `reason` correspondiente y reproduce el mensaje genérico de fallback definido para el evento. No hay silencio total.

**Alternativa descartada:** silencio total (eliminar FALLBACK_SPEECH). Descartado porque el silencio es indistinguible de un fallo: el usuario no sabe si el sistema está funcionando.

---

### D5 — Credencial en `routing/providers/gemini/secrets.json` → clave `GEMINI_API_KEY`

**Decisión:** seguir el patrón de OpenRouter (`routing/providers/openrouter/secrets.json` → `ANTHROPIC_AUTH_TOKEN`). El composition root lee `routing/providers/gemini/secrets.json`, extrae `GEMINI_API_KEY` e inyecta la clave en `GeminiTTSService` e `AuditHookEventHandler`.

El archivo ya existe como precondición (`routing/providers/gemini/secrets.json` creado antes de la corrida).

**Alternativa descartada:** variable de entorno `GEMINI_API_KEY`. Descartado para mantener coherencia con la estrategia de secrets del proyecto (archivos por provider, gitignored) y evitar colisiones de nombre con otras herramientas que puedan leer esa variable.

---

### D6 — Mantener el alcance de hooks actual

**Decisión:** no modificar el conjunto de eventos que disparan TTS: `UserPromptSubmit`, `Stop`, `SubagentStop`, `StopFailure`.

---

### D7 — Modelo de síntesis: `gemini-2.5-flash-preview-tts`

**Decisión:** usar el modelo de preview disponible en la API de Gemini. La llamada usa la configuración mínima necesaria: `model`, `contents`, `generationConfig.responseModalities: ["AUDIO"]`, `generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`. El nombre de voz por defecto es `"Aoede"` (voz femenina natural).

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=<GEMINI_API_KEY>`

**Respuesta:** `candidates[0].content.parts[0].inlineData.data` → base64 de PCM 24kHz/16-bit mono.

---

### D8 — Dos llamadas Gemini separadas: Flash para intención, TTS para síntesis

**Decisión:** la generación de texto (intención/continuidad) y la síntesis de audio son dos llamadas HTTP distintas:
1. `gemini-2.5-flash` → genera el texto en lenguaje natural (mismo API key).
2. `gemini-2.5-flash-preview-tts` → sintetiza el audio a partir de ese texto.

**Alternativa descartada:** una sola llamada TTS con el prompt directo. Descartado porque el modelo TTS no tiene la capacidad de generación de intención contextual que tiene Flash; el texto de continuidad requiere razonamiento sobre el transcript.

---

## Risks / Trade-offs

**[Disponibilidad del player built-in en Linux]** → En distribuciones minimalistas, `aplay` puede no estar instalado. Mitigación: intentar `aplay` primero; si falla (código de salida no-cero o excepción `ENOENT`), intentar `paplay`; si ambos fallan, emitir `[TTS-FALLBACK]` con `reason: "exception"`.

**[Latencia acumulada de dos llamadas HTTP]** → La tríada Flash→TTS introduce latencia adicional respecto a una sola llamada. Mitigación: ninguna (aceptada); el TTS es asíncrono respecto al ciclo de respuesta del usuario y no bloquea el proxy.

**[Formato PCM devuelto por Gemini TTS]** → Si Google cambia los parámetros de codificación (sample rate, bit depth) sin aviso, el encabezado WAV hardcodeado producirá audio distorsionado. Mitigación: las constantes WAV (`SAMPLE_RATE`, `BIT_DEPTH`, `CHANNELS`) se centralizan en `GeminiTTSService` para facilitar el cambio. La guía oficial de Gemini TTS documenta PCM 24kHz/16-bit/mono como valores fijos del modelo.

**[Archivo temporal no eliminado ante crash del proceso]** → Si el proceso muere entre escritura y reproducción, el archivo WAV queda en `os.tmpdir()`. Mitigación: usar un nombre único (`tts-<timestamp>-<random>.wav`) y confiar en la limpieza del SO de `tmp` en el siguiente arranque. El riesgo de acumulación es despreciable dado que el proceso es un servidor de larga vida.

**[Rate limiting de Gemini en corridas headless]** → Los tests headless hacen múltiples ciclos TTS. Si se alcanza el rate limit (429), el fallback genérico se activa automáticamente y los tests drenan vía `[TTS-FALLBACK]`. El contrato del test harness no requiere audio real.

---

## Migration Plan

### Retirada de `SapiTTSService`

1. Crear `src/2-services/tts/gemini-tts.service.ts` con `GeminiTTSService`.
2. Actualizar `composition-root.ts`: importar `GeminiTTSService`; adaptar `resolveTtsApiKey()` para leer `GEMINI_API_KEY` de `routing/providers/gemini/secrets.json`.
3. Eliminar `src/2-services/tts/sapi-tts.service.ts` sin ningún import remanente que lo referencie.

### Reemplazo de la inferencia OpenRouter en el handler

4. En `audit-hook-event.handler.ts`: eliminar las constantes `TTS_OPENROUTER_URL` y `TTS_MODEL`; reemplazar el método `generateSpeechText()` por una llamada a `gemini-2.5-flash` con la misma estructura de contexto (tríada/resumen).
5. Mantener el método `speakAsync()` y `announceStop()` sin cambio de estructura; solo cambia la obtención del texto.

### Reemplazo de `local-announce.ts`

6. Reemplazar `scripting/headless/modules/local-announce.ts`: eliminar `System.Speech.Synthesis` (SAPI); implementar `speakLocal()` invocando el mismo wrapper per-OS que `GeminiTTSService` (dado que el entorno headless es del mismo SO, puede reutilizar la lógica de playback).
7. Adaptar `scripting/headless/gateway-test.ts` si hay referencias a la API de SAPI en el anuncio local; `wait-for-tts.ts` no requiere cambios (ya drena sobre `[TTS-SPEECH]`/`[TTS-FALLBACK]`).

### Rollback

Si el reemplazo produce regresión antes del archive:
- `git restore src/2-services/tts/sapi-tts.service.ts` (si ya se eliminó, recuperar del último commit).
- `git restore src/4-api/composition-root.ts src/3-operations/audit-hook-event.handler.ts`.
- `git restore scripting/headless/modules/local-announce.ts`.

Una vez archivado y commiteado, el rollback es `git revert <commit-hash>`.

---

## Open Questions

Ninguna. Todas las decisiones de diseño (D1–D9) fueron resueltas antes de esta etapa.

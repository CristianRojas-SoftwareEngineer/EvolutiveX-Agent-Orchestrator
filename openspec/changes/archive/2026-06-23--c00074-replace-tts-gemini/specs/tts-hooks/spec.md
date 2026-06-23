## MODIFIED Requirements

### Requirement: Provider dedicado de inferencia TTS (OpenRouter)
La generación del texto de intención/resumen TTS SHALL usar siempre un provider dedicado, independiente del provider activo de la sesión: Gemini Flash (`gemini-2.5-flash`) para la generación del texto de intención o resumen, y Gemini TTS (`gemini-2.5-flash-preview-tts`) para la síntesis de voz. La credencial SHALL ser el `GEMINI_API_KEY` de `routing/providers/gemini/secrets.json`, resuelta en el arranque e inyectada por el composition root. La llamada SHALL ir directa a la API de Gemini (no a través del proxy local).

La síntesis SHALL usar `gemini-2.5-flash-preview-tts`, que devuelve PCM 24kHz/16-bit mono codificado en base64; el sistema SHALL añadir un encabezado WAV estándar al PCM y escribir el resultado en un archivo temporal, reproduciéndolo con el player built-in del SO según `process.platform`: PowerShell `Media.SoundPlayer` en Windows, `afplay` en macOS, `aplay`/`paplay` en Linux.

Si la credencial no está disponible, el sistema SHALL emitir `[TTS-FALLBACK]` con `reason: no-gemini-key` y usar el mensaje genérico de fallback sin intentar ninguna llamada. No SHALL haber validación proactiva de la clave ni fallback al provider de la sesión: cualquier fallo de la llamada (HTTP no-2xx, timeout, respuesta vacía) SHALL caer al fallback genérico con su `reason` correspondiente.

#### Scenario: Sesión con cualquier provider genera texto vía Gemini Flash
- **GIVEN** que la sesión activa usa MiniMax (o Anthropic, u Ollama) como provider
- **AND** `routing/providers/gemini/secrets.json` contiene una API key
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL llamar a `gemini-2.5-flash` para generar el texto de continuidad
- **AND** el provider de la sesión NO SHALL recibir ninguna petición de inferencia TTS

#### Scenario: Sin clave de Gemini usa fallback genérico
- **GIVEN** que `routing/providers/gemini/secrets.json` no existe o no contiene clave
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL emitir `[TTS-FALLBACK]` con `reason: "no-gemini-key"`
- **AND** SHALL reproducir el mensaje de fallback definido para `Stop` sin hacer ninguna petición HTTP

#### Scenario: Fallo de Gemini cae al fallback sin reintentos hacia el provider de sesión
- **GIVEN** que la API de Gemini responde con error (ej. 429) o la petición agota el timeout
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL emitir `[TTS-FALLBACK]` con el `reason` correspondiente (`http-429`, `exception`, etc.)
- **AND** NO SHALL intentar la inferencia contra el provider de la sesión

#### Scenario: Síntesis con Gemini TTS produce audio WAV reproducible por player del SO
- **GIVEN** que `gemini-2.5-flash-preview-tts` devuelve PCM 24kHz/16-bit mono en base64
- **WHEN** el servicio TTS procesa la respuesta
- **THEN** SHALL envolver el PCM en un encabezado WAV estándar y escribirlo en un archivo temporal
- **AND** SHALL reproducirlo con el player built-in del SO según `process.platform`
- **AND** SHALL eliminar el archivo temporal tras la reproducción

---

### Requirement: Robustez en la Inferencia y Reproducción de Audio
Cualquier fallo al leer el transcript, al invocar a Gemini para el resumen/respuesta, o al reproducir el audio NO SHALL afectar el ciclo de vida normal de Claude Code ni bloquear las respuestas del proxy. Cada fallo SHALL ser registrado como `[TTS-FALLBACK]` con `reason` identificando la causa (`no-gemini-key`, `no-messages`, `http-NNN`, `empty-response`, `exception`), de forma que sea detectable sin afectar el flujo principal. La reproducción de audio SHALL completarse antes de que el handler retorne; el servicio TTS SHALL esperar al cierre del proceso de síntesis.

#### Scenario: Falla de la API de resumen
- **GIVEN** un fallo de conexión a Gemini o falta de API Key de Gemini
- **WHEN** se procesa un hook `Stop`
- **THEN** el sistema SHALL usar una locución de fallback predefinida (ej. "El asistente terminó el trabajo.") y reproducirla.
- **AND** SHALL emitir `[TTS-FALLBACK]` con `reason` identificando la causa del fallo
- **AND** la petición HTTP de hook SHALL finalizar con éxito (código 2xx).

#### Scenario: Síntesis de audio completa antes de retornar
- **GIVEN** que el servicio TTS local genera audio correctamente
- **WHEN** el handler invoca `speak(text)`
- **THEN** SHALL esperar a que el proceso de síntesis cierre completamente antes de continuar
- **AND** el handler SHALL retornar solo después de que el audio haya terminado de reproducirse

---

### Requirement: Toast de continuidad del Stop emitido por el gateway

Al recibir el evento `Stop`, `AuditHookEventHandler` SHALL generar el texto de continuidad **una sola vez** (vía el provider TTS dedicado de Gemini) y emitirlo por **dos canales independientes a partir del mismo texto**:

1. Voz, mediante el servicio TTS local (comportamiento ya existente).
2. Un toast de escritorio, mediante `INotificationService` inyectado en el handler.

El toast SHALL tener título `"Stop"` y cuerpo igual al texto de continuidad truncado a un máximo de 250 caracteres. La generación del texto es independiente del provider de la sesión, por lo que el resultado SHALL ser consistente con cualquier provider Anthropic-compatible activo (Anthropic, Minimax, Ollama, etc.).

Si no hay servicio de notificación inyectado, o si la emisión del toast falla, el handler SHALL continuar sin propagar el error; el fallo del toast NO SHALL afectar la voz, la auditoría ni la respuesta HTTP del hook. Si el texto generado no está disponible (sin clave de Gemini, sin contexto o error de LLM), el handler SHALL usar el mismo texto de fallback que la voz para el cuerpo del toast.

#### Scenario: Stop con provider no-Anthropic genera voz y toast consistentes

- **GIVEN** el provider activo es Minimax y el evento `Stop` llega al gateway con un `transcriptPath` legible
- **WHEN** `AuditHookEventHandler` procesa el evento
- **THEN** SHALL generar el texto de continuidad una sola vez vía el provider TTS dedicado de Gemini
- **AND** SHALL reproducir ese texto por voz mediante el servicio TTS
- **AND** SHALL emitir un toast con título `"Stop"` y cuerpo = ese mismo texto truncado a ≤ 250 caracteres

#### Scenario: Fallo del toast no afecta a la voz ni al hook

- **GIVEN** el servicio de notificación lanza un error al emitir el toast
- **WHEN** `AuditHookEventHandler` procesa el evento `Stop`
- **THEN** la voz SHALL reproducirse normalmente
- **AND** el procesamiento del hook SHALL completarse sin propagar el error
- **AND** la respuesta HTTP del endpoint `/hooks` SHALL haber finalizado con éxito (2xx)

#### Scenario: Sin texto generado usa fallback en ambos canales

- **GIVEN** el evento `Stop` llega sin clave de Gemini disponible o sin contexto extraíble
- **WHEN** `AuditHookEventHandler` procesa el evento
- **THEN** SHALL usar el texto de fallback definido para `Stop`
- **AND** SHALL reproducir ese fallback por voz
- **AND** SHALL emitir el toast con ese mismo fallback como cuerpo

---

### Requirement: Logging estructurado de fallback y mensaje dinámico
Cada vez que el sistema active un fallback TTS, SHALL emitir una entrada de log con tag `[TTS-FALLBACK]` incluyendo: `eventName`, `usedFallback: true`, `reason` (uno de: `no-gemini-key`, `no-messages`, `http-NNN`, `empty-response`, `exception`) y `fallbackText`. Cada vez que se genere un mensaje dinámico, SHALL emitir `[TTS-SPEECH]` con `eventName`, `usedFallback: false` y una vista previa del texto (`textPreview`, máximo 120 caracteres).

#### Scenario: Fallback por error HTTP emite log con código
- **GIVEN** que la llamada de inferencia TTS recibe un status HTTP distinto de 200 (ej. 429)
- **WHEN** el handler procesa la respuesta
- **THEN** SHALL emitir `[TTS-FALLBACK]` con `reason: "http-429"` (o el código correspondiente)
- **AND** el log SHALL estar escrito en `server/logs.jsonl` antes de retornar la respuesta del hook

#### Scenario: Mensaje dinámico emite log TTS-SPEECH
- **GIVEN** que la inferencia TTS produce texto dinámico correctamente
- **WHEN** el handler finaliza la extracción
- **THEN** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false`
- **AND** el campo `textPreview` SHALL contener los primeros 120 caracteres del texto generado

---

### Requirement: Respuesta de Asistente de Voz en `UserPromptSubmit`
Al recibir un evento `UserPromptSubmit`, el sistema SHALL componer un contexto curado de tres mensajes para el LLM — el último mensaje del usuario en el transcript (correspondiente al turno anterior), la última respuesta del asistente en el transcript, y el prompt actual recibido en el payload del hook — y SHALL enviar ese contexto junto con un system prompt que instruya al LLM a responder SOLO al prompt actual (el tercer mensaje) en una sola oración breve y natural en español, confirmando que procederá a investigar o ejecutar la acción solicitada. El sistema SHALL reproducir el resultado por voz de forma asíncrona.

#### Scenario: UserPromptSubmit con sesión existente genera locución sobre la petición actual
- **GIVEN** el hook `UserPromptSubmit` es recibido con un `transcript_path` válido
- **AND** el transcript contiene al menos un turno previo cerrado
- **WHEN** el backend construye el contexto para el LLM
- **THEN** SHALL enviar un `messages` con tres elementos en este orden: `{role: "user", content: <último prompt del usuario en el transcript>}`, `{role: "assistant", content: <última respuesta assistant del transcript>}`, `{role: "user", content: <event.prompt>}`
- **AND** SHALL usar el system prompt `VOICE_ASSISTANT_SYSTEM_PROMPT` reformulado que apunte al tercer mensaje
- **AND** SHALL reproducir por voz la respuesta del LLM

#### Scenario: UserPromptSubmit con sesión nueva usa solo el prompt actual
- **GIVEN** el hook `UserPromptSubmit` es recibido
- **AND** el `transcript_path` apunta a un archivo vacío o inexistente
- **WHEN** el backend construye el contexto para el LLM
- **THEN** SHALL enviar un `messages` con un único elemento: `{role: "user", content: <event.prompt>}`
- **AND** SHALL usar el system prompt `VOICE_ASSISTANT_SYSTEM_PROMPT` reformulado
- **AND** si la llamada a Gemini falla o no hay clave, SHALL reproducir `FALLBACK_SPEECH.UserPromptSubmit`

#### Scenario: El contexto no incluye el prompt anterior como objetivo
- **GIVEN** el hook `UserPromptSubmit` es recibido con un `transcript_path` válido
- **AND** el transcript contiene el prompt del turno anterior
- **WHEN** el backend construye el contexto para el LLM
- **THEN** el `system` prompt SHALL instruir explícitamente a responder al tercer mensaje (prompt actual) y no al primero
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false` cuando el LLM responda con texto dinámico

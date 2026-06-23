# Especificación: tts-hooks

## Propósito
Definir los requisitos de comportamiento y los escenarios para la síntesis de voz (TTS) contextual local ante los eventos de ciclo de vida interceptados en el endpoint `/hooks` y procesados por `AuditHookEventHandler`.

---
## Requirements
### Requirement: Extracción de Memoria Contextual
El sistema SHALL ser capaz de leer el transcript de la sesión activa de Claude Code y extraer las últimas $N$ interacciones, incluyendo mensajes de usuario, respuestas del asistente y mensajes de sistema. El extractor SHALL manejar el campo `content` tanto en formato string (mensajes de usuario) como en formato array de bloques `{type, text}` (mensajes de asistente).

#### Scenario: Lectura del transcript con éxito
- **GIVEN** que se recibe un hook con un `transcript_path` válido
- **WHEN** el backend lee el archivo
- **THEN** SHALL retornar una estructura con los últimos $N$ mensajes ordenados cronológicamente detallando el rol (usuario, asistente, sistema).

#### Scenario: Mensaje de usuario con content string
- **GIVEN** una línea del transcript donde `message.content` es un string plano
- **WHEN** el extractor procesa esa línea
- **THEN** SHALL incluir el mensaje en el resultado usando el string directamente como texto.

#### Scenario: Mensaje de asistente con content array
- **GIVEN** una línea del transcript donde `message.content` es un array de bloques `{type, text}`
- **WHEN** el extractor procesa esa línea
- **THEN** SHALL extraer los bloques con `type === 'text'` y unirlos como texto del mensaje.

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

---

### Requirement: Resumen conversacional en eventos de parada (`Stop`, `SubagentStop`, `StopFailure`)
Al recibir `Stop`, `SubagentStop` o `StopFailure`, el sistema SHALL extraer los últimos $N$ mensajes de la sesión para generar y reproducir por voz un resumen conciso en español del proceso ejecutado (logros, tareas abiertas, y estado final).

#### Scenario: Stop exitoso genera resumen por voz
- **GIVEN** el hook `Stop` es recibido con éxito
- **WHEN** el backend lee los últimos turnos del transcript
- **THEN** SHALL solicitar al LLM un resumen corto (3-5 frases en prosa) sobre lo que se ha completado y lo que queda pendiente
- **AND** reproducir dicho resumen en voz a través del motor local.

#### Scenario: StopFailure genera locución de alerta por voz
- **GIVEN** el hook `StopFailure` es recibido
- **WHEN** el backend procesa el evento
- **THEN** SHALL generar y reproducir una advertencia hablada explicando de forma contextual el error ocurrido o informando sobre el fallo del agente.

---

### Requirement: Provider dedicado de inferencia TTS (OpenRouter → Gemini)
La generación del texto de intención/resumen TTS SHALL seguir usando el provider dedicado (Gemini Flash `gemini-2.5-flash` para la generación del texto de intención o resumen) inyectado por el composition root vía `ttsApiKey`. La **síntesis de voz**, en cambio, SHALL migrar a un sidecar local multiplataforma (`tts-sidecar`, binario único que embebe Piper + CPAL, distribuido por plataforma vía postinstall con verificación SHA256). El campo `GEMINI_API_KEY` deja de leerse para fines de síntesis (puede seguir usándose para generación de texto).

La síntesis SHALL invocar el binario `tts-sidecar` con un contrato JSON por STDIN/STDOUT: `{"cmd":"speak","text":"...","voice":"es_MX"}` → `{"status":"ok"}` o `{"status":"error","message":"..."}`. La voz inicial SHALL ser `es_MX` (México, español latino neutro). El gateway SHALL **NO** depender de ninguna API de audio del SO (no usa PowerShell `Media.SoundPlayer`, ni `afplay`, ni `aplay`/`paplay`); toda la reproducción queda encapsulada en el sidecar.

Si el binario del sidecar no está presente en `vendor/tts-sidecar/<platform>-<arch>/`, el sistema SHALL emitir `[TTS-SIDE]` con `reason: "sidecar-missing"` y SHALL **NO** intentar ninguna síntesis. Si el binario está presente pero el proceso falla (exit code no-cero, timeout, JSON malformado), el sistema SHALL emitir `[TTS-SIDE]` con el `reason` correspondiente (`spawn-failed`, `timeout`, `invalid-json`, `non-zero-exit`) y SHALL **NO** intentar ningún fallback a otro motor. La llamada al sidecar SHALL ser bloqueante desde el punto de vista del handler de hook: el handler SHALL esperar `{"status":"ok"}` por stdout antes de retornar, garantizando que la voz se reproduzca completamente antes de que el hook responda al cliente.

#### Scenario: Sesión con cualquier provider genera texto vía Gemini Flash
- **GIVEN** que la sesión activa usa MiniMax (o Anthropic, u Ollama) como provider
- **AND** el handler tiene una API key de Gemini inyectada para generación de texto
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL llamar a `gemini-2.5-flash` para generar el texto de continuidad
- **AND** el provider de la sesión NO SHALL recibir ninguna petición de inferencia TTS

#### Scenario: Síntesis exitosa con sidecar instalado
- **GIVEN** que el binario `tts-sidecar` está presente en `vendor/tts-sidecar/<platform>-<arch>/`
- **AND** el modelo `es_MX` está presente en `vendor/tts-sidecar/voices/es_MX/`
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL enviar `{"cmd":"speak","text":"<resumen>","voice":"es_MX"}` por stdin al sidecar
- **AND** SHALL esperar `{"status":"ok"}` por stdout antes de continuar
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false` y `textPreview` del texto reproducido

#### Scenario: Sidecar ausente omite audio sin romper el hook
- **GIVEN** que el binario `tts-sidecar` **NO** está presente en disco
- **WHEN** el handler procesa un evento `Stop` o `UserPromptSubmit`
- **THEN** SHALL emitir `[TTS-SIDE]` con `reason: "sidecar-missing"`
- **AND** SHALL continuar el procesamiento del hook sin intentar síntesis
- **AND** SHALL retornar una respuesta HTTP 2xx al cliente

#### Scenario: Fallo del sidecar se reporta sin caer a otro motor
- **GIVEN** que el sidecar está presente pero el proceso termina con exit code no-cero
- **WHEN** el handler procesa un evento
- **THEN** SHALL emitir `[TTS-SIDE]` con `reason: "non-zero-exit"` (o `spawn-failed`, `timeout`, `invalid-json` según el caso)
- **AND** SHALL **NO** intentar llamar a Gemini, OpenRouter ni SAPI como fallback
- **AND** SHALL continuar el procesamiento del hook

#### Scenario: Sin dependencia de claves de API externas para la síntesis
- **GIVEN** que `routing/providers/gemini/secrets.json` no existe o no contiene clave
- **WHEN** el handler procesa un evento
- **THEN** SHALL invocar el sidecar local normalmente (el sidecar no requiere credenciales para sintetizar)
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false` si el sidecar responde ok

---

### Requirement: Robustez en la Inferencia y Reproducción de Audio
Cualquier fallo al leer el transcript, al invocar al LLM para el resumen/respuesta, o al sintetizar audio con el sidecar NO SHALL afectar el ciclo de vida normal de Claude Code ni bloquear las respuestas del proxy. Cada fallo SHALL ser registrado como `[TTS-SIDE]` con `reason` identificando la causa (`sidecar-missing`, `spawn-failed`, `timeout`, `invalid-json`, `non-zero-exit`, `exception`), de forma que sea detectable sin afectar el flujo principal. La reproducción de audio SHALL completarse antes de que el handler retorne; el sidecar SHALL ser invocado de forma bloqueante, con un timeout configurable (default 30s, env `TTS_SIDECAR_TIMEOUT_MS`) tras el cual el handler termina la espera con `reason: "timeout"` y continúa.

#### Scenario: Sidecar ausente no afecta el hook
- **GIVEN** que el binario del sidecar no está presente en disco
- **WHEN** se procesa un hook `Stop`
- **THEN** SHALL emitir `[TTS-SIDE]` con `reason: "sidecar-missing"` o `spawn-failed`
- **AND** SHALL continuar el procesamiento del hook retornando HTTP 2xx

#### Scenario: Timeout del sidecar libera al handler
- **GIVEN** que el sidecar no responde dentro del timeout configurado (por defecto 30s)
- **WHEN** se procesa un hook `Stop`
- **THEN** SHALL matar el proceso del sidecar
- **AND** SHALL emitir `[TTS-SIDE]` con `reason: "timeout"`
- **AND** SHALL continuar el procesamiento del hook sin propagar el error

#### Scenario: Síntesis de audio completa antes de retornar
- **GIVEN** que el sidecar está presente y responde `{"status":"ok"}`
- **WHEN** el handler invoca `speak(text)`
- **THEN** SHALL esperar a que el sidecar confirme antes de continuar
- **AND** el handler SHALL retornar solo después de que la voz haya terminado de reproducirse

### Requirement: Toast de continuidad del Stop emitido por el gateway

Al recibir el evento `Stop`, `AuditHookEventHandler` SHALL generar el texto de continuidad **una sola vez** (vía el provider TTS dedicado de Gemini) y emitirlo por **dos canales independientes a partir del mismo texto**:

1. Voz, mediante el servicio TTS local (comportamiento ya existente).
2. Un toast de escritorio, mediante `INotificationService` inyectado en el handler.

El toast SHALL tener título `"Stop"` y cuerpo igual al texto de continuidad truncado a un máximo de 250 caracteres. La generación del texto es independiente del provider de la sesión, por lo que el resultado SHALL ser consistente con cualquier provider Anthropic-compatible activo (Anthropic, Minimax, Ollama, etc.).

Si no hay servicio de notificación inyectado, o si la emisión del toast falla, el handler SHALL continuar sin propagar el error; el fallo del toast NO SHALL afectar la voz, la auditoría ni la respuesta HTTP del hook. Si el texto generado no está disponible (sin clave de Gemini, sin contexto o error de LLM), el handler SHALL usar el mismo texto de fallback que la voz para el cuerpo del toast.

#### Scenario: Stop con provider no-Anthropic genera voz y toast consistentes

- **GIVEN** el provider activo es Minimax y el evento `Stop` llega al gateway con un `transcriptPath` legible
- **WHEN** `AuditHookEventHandler` procesa el evento
- **THEN** SHALL generar el texto de continuidad una sola vez vía el provider TTS dedicado
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

### Requirement: Solo bloques `type === "text"` son válidos como salida hablable
El sistema SHALL extraer únicamente los bloques con `type === "text"` de la respuesta del LLM para generar el texto a sintetizar. Los bloques `type === "thinking"` o de cualquier otro tipo SHALL ser ignorados. Si la respuesta HTTP es 200 pero no contiene ningún bloque `text`, el sistema SHALL tratar el resultado como `empty-response` y activar el fallback honesto.

#### Scenario: Respuesta con bloques thinking-only activa empty-response
- **GIVEN** que el LLM responde HTTP 200 con `content` que solo contiene bloques `type: "thinking"`
- **WHEN** el handler extrae el texto hablable
- **THEN** SHALL emitir `[TTS-FALLBACK]` con `reason: "empty-response"`
- **AND** SHALL retornar el mensaje de fallback del evento sin sintetizar el contenido del `thinking`

#### Scenario: Respuesta con bloque text retorna texto dinámico
- **GIVEN** que el LLM responde HTTP 200 con al menos un bloque `type: "text"` no vacío
- **WHEN** el handler extrae el texto hablable
- **THEN** SHALL retornar el contenido de ese bloque como texto a sintetizar
- **AND** SHALL emitir `[TTS-SPEECH]` con una vista previa del texto

---

### Requirement: Logging estructurado de fallback y mensaje dinámico
Cada vez que el sistema active un fallback por fallo del sidecar, SHALL emitir una entrada de log con tag `[TTS-SIDE]` incluyendo: `eventName`, `usedFallback: true`, `reason` (uno de: `sidecar-missing`, `spawn-failed`, `timeout`, `invalid-json`, `non-zero-exit`, `exception`) y `fallbackText` (texto que se habría sintetizado, conservado para diagnóstico). Cada vez que se genere un mensaje dinámico sintetizado por el sidecar, SHALL emitir `[TTS-SPEECH]` con `eventName`, `usedFallback: false` y una vista previa del texto (`textPreview`, máximo 120 caracteres). La etiqueta `[TTS-FALLBACK]` queda retirada del código y del log.

#### Scenario: Fallo del sidecar emite log tipificado
- **GIVEN** que el sidecar falla (binario ausente, timeout, JSON malformado, exit code no-cero, etc.)
- **WHEN** el handler procesa el evento
- **THEN** SHALL emitir `[TTS-SIDE]` con el `reason` correspondiente
- **AND** el log SHALL estar escrito en `server/logs.jsonl` antes de retornar la respuesta del hook

#### Scenario: Mensaje dinámico sintetizado emite log TTS-SPEECH
- **GIVEN** que el sidecar responde `{"status":"ok"}` al comando `speak`
- **WHEN** el handler finaliza la síntesis
- **THEN** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false`
- **AND** el campo `textPreview` SHALL contener los primeros 120 caracteres del texto reproducido

---

### Requirement: Selección de mensajes curada en el extractor de transcript
El extractor de contexto SHALL exponer un método que lea el transcript JSONL de Claude Code y devuelva un `UserPromptContext` con tres campos: el último mensaje del usuario en el transcript (petición anterior), la última respuesta del asistente, y el prompt actual. El extractor SHALL filtrar por `role` (no por posición absoluta) sobre una ventana de los últimos 10 mensajes, y SHALL ser agnóstico del handler que lo invoca.

#### Scenario: Transcript con un turno previo cerrado devuelve la tríada completa
- **GIVEN** un transcript JSONL con un turno previo que contiene un mensaje `user` y un mensaje `assistant`
- **WHEN** el handler invoca el método de extracción de contexto de `UserPromptSubmit` con el `transcript_path` y el prompt actual
- **THEN** SHALL devolver `UserPromptContext` con `previousUserMessage` igual al contenido del mensaje `user`, `lastAssistantResponse` igual al contenido del mensaje `assistant`, y `currentPrompt` igual al prompt del hook

#### Scenario: Transcript vacío devuelve contexto con solo el prompt actual
- **GIVEN** un transcript JSONL vacío o inexistente
- **WHEN** el handler invoca el método de extracción de contexto de `UserPromptSubmit`
- **THEN** SHALL devolver `UserPromptContext` con `previousUserMessage: undefined`, `lastAssistantResponse: undefined`, y `currentPrompt` igual al prompt del hook

#### Scenario: Transcript con varios turnos selecciona el último user y el último assistant
- **GIVEN** un transcript JSONL con tres turnos previos (cada uno con un `user` y un `assistant`)
- **WHEN** el handler invoca el método de extracción
- **THEN** SHALL devolver el mensaje `user` del último turno como `previousUserMessage` y el mensaje `assistant` del último turno como `lastAssistantResponse`

#### Scenario: Bloques system intercalados no afectan la selección por rol
- **GIVEN** un transcript JSONL con entradas `system` intercaladas entre los mensajes `user` y `assistant`
- **WHEN** el handler invoca el método de extracción
- **THEN** SHALL ignorar los mensajes `system` y devolver los últimos `user` y `assistant` por rol

---

### Requirement: System prompt `VOICE_ASSISTANT_SYSTEM_PROMPT` apuntando al tercer mensaje
El system prompt del modo `prompt` SHALL instruir explícitamente al LLM a responder SOLO al tercer mensaje del array (el prompt actual), describiendo el array como "petición anterior del usuario, tu última respuesta, y la nueva petición del usuario".

#### Scenario: System prompt declarativo del orden de los mensajes
- **WHEN** el handler construye la llamada a Gemini en `mode='prompt'`
- **THEN** SHALL usar el `system` field cuyo texto mencione explícitamente "la nueva petición del usuario" como objetivo de la respuesta

---

### Requirement: Puerto de dominio con método de extracción para `UserPromptSubmit`
El puerto `IContextExtractor` SHALL exponer un método `extractUserPromptSubmitContext(transcriptPath, currentPrompt)` que devuelva un `UserPromptContext` con los tres campos: `previousUserMessage`, `lastAssistantResponse` y `currentPrompt`. La interfaz `UserPromptContext` SHALL ser exportada desde el mismo archivo del puerto.

#### Scenario: Implementación de adapter existente satisface el nuevo método del puerto
- **GIVEN** `TranscriptContextExtractor` implementa `IContextExtractor`
- **WHEN** se invoca `extractUserPromptSubmitContext` con un `transcript_path` válido y un `currentPrompt` no vacío
- **THEN** SHALL devolver un objeto `UserPromptContext` poblado correctamente

#### Scenario: Método no rompe implementaciones alternativas
- **GIVEN** un adapter alternativo de `IContextExtractor`
- **WHEN** se añade el nuevo método al puerto
- **THEN** el adapter alternativo SHALL seguir compilando siempre que extienda `IContextExtractor` con el nuevo método

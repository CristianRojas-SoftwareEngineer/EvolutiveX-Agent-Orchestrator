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
Al recibir un evento `UserPromptSubmit`, el sistema SHALL leer el último mensaje del usuario y los $N-1$ anteriores, generar una respuesta introductoria asumiendo el rol de asistente de voz (ej. "Entendido, estoy trabajando en..."), y reproducirla inmediatamente de forma asíncrona.

#### Scenario: UserPromptSubmit genera locución interactiva de asistente
- **GIVEN** el hook `UserPromptSubmit` es recibido en el backend
- **AND** el último prompt del usuario contiene una petición de refactorización
- **WHEN** el backend procesa el evento
- **THEN** SHALL generar una breve locución usando el LLM (ej. "Entendido, voy a analizar el código para realizar la refactorización.")
- **AND** reproducirla por voz mediante el servicio TTS local de forma asíncrona.

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

### Requirement: Robustez en la Inferencia y Reproducción de Audio
Cualquier fallo al leer el transcript, al invocar al LLM para el resumen/respuesta, o al reproducir el audio NO SHALL afectar el ciclo de vida normal de Claude Code ni bloquear las respuestas del proxy. Cada fallo SHALL ser registrado como `[TTS-FALLBACK]` con `reason` identificando la causa (`no-token`, `no-messages`, `http-NNN`, `empty-response`, `exception`), de forma que sea detectable sin afectar el flujo principal. La reproducción de audio SHALL completarse antes de que el handler retorne; el servicio TTS SHALL esperar al cierre del proceso de síntesis.

#### Scenario: Falla de la API de resumen
- **GIVEN** un fallo de conexión al LLM o falta de API Key
- **WHEN** se procesa un hook `Stop`
- **THEN** el sistema SHALL usar una locución de fallback predefinida (ej. "El asistente terminó el trabajo.") y reproducirla.
- **AND** SHALL emitir `[TTS-FALLBACK]` con `reason` identificando la causa del fallo
- **AND** la petición HTTP de hook SHALL finalizar con éxito (código 2xx).

#### Scenario: Síntesis de audio completa antes de retornar
- **GIVEN** que el servicio TTS local genera audio correctamente
- **WHEN** el handler invoca `speak(text)`
- **THEN** SHALL esperar a que el proceso de síntesis cierre completamente antes de continuar
- **AND** el handler SHALL retornar solo después de que el audio haya terminado de reproducirse

### Requirement: Toast de continuidad del Stop emitido por el gateway

Al recibir el evento `Stop`, `AuditHookEventHandler` SHALL generar el texto de continuidad **una sola vez** (vía `fetch()` al proxy local con el token capturado del provider activo) y emitirlo por **dos canales independientes a partir del mismo texto**:

1. Voz, mediante el servicio TTS local (comportamiento ya existente).
2. Un toast de escritorio, mediante `INotificationService` inyectado en el handler.

El toast SHALL tener título `"Stop"` y cuerpo igual al texto de continuidad truncado a un máximo de 250 caracteres. El handler SHALL usar el token del provider activo, por lo que el texto SHALL ser contextual con cualquier provider Anthropic-compatible (Anthropic, Minimax, Ollama, etc.), no solo Anthropic.

Si no hay servicio de notificación inyectado, o si la emisión del toast falla, el handler SHALL continuar sin propagar el error; el fallo del toast NO SHALL afectar la voz, la auditoría ni la respuesta HTTP del hook. Si el texto generado no está disponible (sin token, sin contexto o error de LLM), el handler SHALL usar el mismo texto de fallback que la voz para el cuerpo del toast.

#### Scenario: Stop con provider no-Anthropic genera voz y toast consistentes

- **GIVEN** el provider activo es Minimax y el evento `Stop` llega al gateway con un `transcriptPath` legible
- **WHEN** `AuditHookEventHandler` procesa el evento
- **THEN** SHALL generar el texto de continuidad una sola vez con el token capturado
- **AND** SHALL reproducir ese texto por voz mediante el servicio TTS
- **AND** SHALL emitir un toast con título `"Stop"` y cuerpo = ese mismo texto truncado a ≤ 250 caracteres

#### Scenario: Fallo del toast no afecta a la voz ni al hook

- **GIVEN** el servicio de notificación lanza un error al emitir el toast
- **WHEN** `AuditHookEventHandler` procesa el evento `Stop`
- **THEN** la voz SHALL reproducirse normalmente
- **AND** el procesamiento del hook SHALL completarse sin propagar el error
- **AND** la respuesta HTTP del endpoint `/hooks` SHALL haber finalizado con éxito (2xx)

#### Scenario: Sin texto generado usa fallback en ambos canales

- **GIVEN** el evento `Stop` llega sin token capturado o sin contexto extraíble
- **WHEN** `AuditHookEventHandler` procesa el evento
- **THEN** SHALL usar el texto de fallback definido para `Stop`
- **AND** SHALL reproducir ese fallback por voz
- **AND** SHALL emitir el toast con ese mismo fallback como cuerpo

### Requirement: Selección de token y headers según el tipo de provider activo
Al construir la llamada de inferencia TTS, el sistema SHALL seleccionar el token de autenticación y los headers HTTP en función del provider activo (`upstreamOrigin`):

- Si `upstreamOrigin` corresponde a Anthropic (`api.anthropic.com`):
  - Token: `capturedToken` (OAuth interceptado) o, si no está disponible, `ANTHROPIC_API_KEY`.
  - Header adicional: `anthropic-version: 2023-06-01`.
- Para cualquier otro provider (bearer auth: OpenRouter, Ollama, MiniMax, Xiaomi, etc.):
  - Token: `ANTHROPIC_AUTH_TOKEN` (clave bearer del usuario) o, como fallback, `capturedToken`.
  - Headers adicionales: `HTTP-Referer` + `X-Title` (compatibles con OpenRouter; neutros para el resto).

Si no hay token disponible tras aplicar la prioridad, el sistema SHALL emitir `[TTS-FALLBACK]` con `reason: no-token` y retornar el mensaje de fallback sin intentar la llamada.

#### Scenario: Provider no-Anthropic usa token bearer y headers correctos
- **GIVEN** que el provider activo es OpenRouter (`upstreamOrigin` contiene `openrouter.ai`)
- **AND** `ANTHROPIC_AUTH_TOKEN` tiene el valor de la API key de OpenRouter
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL construir la llamada TTS con `Authorization: Bearer <ANTHROPIC_AUTH_TOKEN>`
- **AND** SHALL incluir los headers `HTTP-Referer` y `X-Title`
- **AND** SHALL omitir el header `anthropic-version`

#### Scenario: Provider Anthropic usa token OAuth y versión header
- **GIVEN** que el provider activo es Anthropic (`upstreamOrigin` contiene `api.anthropic.com`)
- **AND** `capturedToken` contiene el OAuth token interceptado
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL construir la llamada TTS con `Authorization: Bearer <capturedToken>`
- **AND** SHALL incluir el header `anthropic-version: 2023-06-01`

#### Scenario: Sin token disponible activa fallback con reason no-token
- **GIVEN** que el provider activo es OpenRouter
- **AND** `ANTHROPIC_AUTH_TOKEN` no está definido y `capturedToken` es `undefined`
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL emitir una entrada de log `[TTS-FALLBACK]` con `reason: "no-token"`
- **AND** SHALL retornar el mensaje de fallback definido para `Stop` sin hacer ninguna petición HTTP

---

### Requirement: Presupuesto de tokens de inferencia TTS según el provider activo
Al construir la llamada de inferencia TTS, el sistema SHALL fijar `max_tokens` según el provider activo: `150` para Anthropic (`api.anthropic.com`), `150` para Ollama local (`localhost:11434`, cuyo backend cloud rechaza valores mayores), y `512` para cualquier otro provider, de modo que los modelos thinking dispongan de presupuesto para emitir el bloque `text` tras el razonamiento. En la rama no-Anthropic, el sistema SHALL incluir `reasoning: { effort: 'none' }` en el cuerpo de la petición.

#### Scenario: Provider con modelo thinking recibe presupuesto suficiente
- **GIVEN** que el provider activo es OpenRouter o MiniMax (no-Anthropic, no-Ollama)
- **WHEN** el handler construye la llamada de inferencia TTS
- **THEN** SHALL enviar `max_tokens: 512`
- **AND** SHALL incluir `reasoning: { effort: 'none' }` en el cuerpo

#### Scenario: Ollama local conserva el cap de 150 tokens
- **GIVEN** que el provider activo es Ollama (`upstreamOrigin` contiene `localhost:11434`)
- **WHEN** el handler construye la llamada de inferencia TTS
- **THEN** SHALL enviar `max_tokens: 150`

---

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
Cada vez que el sistema active un fallback TTS, SHALL emitir una entrada de log con tag `[TTS-FALLBACK]` incluyendo: `eventName`, `usedFallback: true`, `reason` (uno de: `no-token`, `no-messages`, `http-NNN`, `empty-response`, `exception`) y `fallbackText`. Cada vez que se genere un mensaje dinámico, SHALL emitir `[TTS-SPEECH]` con `eventName`, `usedFallback: false` y una vista previa del texto (`textPreview`, máximo 120 caracteres).

#### Scenario: Fallback por error HTTP emite log con código
- **GIVEN** que la llamada de inferencia TTS recibe un status HTTP distinto de 200 (ej. 402)
- **WHEN** el handler procesa la respuesta
- **THEN** SHALL emitir `[TTS-FALLBACK]` con `reason: "http-402"` (o el código correspondiente)
- **AND** el log SHALL estar escrito en `server/logs.jsonl` antes de retornar la respuesta del hook

#### Scenario: Mensaje dinámico emite log TTS-SPEECH
- **GIVEN** que la inferencia TTS produce texto dinámico correctamente
- **WHEN** el handler finaliza la extracción
- **THEN** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false`
- **AND** el campo `textPreview` SHALL contener los primeros 120 caracteres del texto generado

---


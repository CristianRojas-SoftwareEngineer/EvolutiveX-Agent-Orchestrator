# Delta: tts-hooks — simplify-tts-dedicated-openrouter

## ADDED Requirements

### Requirement: Provider dedicado de inferencia TTS (OpenRouter)
La generación del texto de resumen TTS SHALL usar siempre un provider dedicado, independiente del provider activo de la sesión: OpenRouter (`https://openrouter.ai/api/v1/messages`) con el modelo fijo `poolside/laguna-xs.2:free`, `max_tokens: 512` y `reasoning: { effort: 'none' }`. La credencial SHALL ser el `ANTHROPIC_AUTH_TOKEN` de `routing/providers/openrouter/secrets.json`, resuelta en el arranque e inyectada por el composition root. La llamada SHALL ir directa al upstream de OpenRouter (no a través del proxy local) con headers `Authorization: Bearer <key>`, `HTTP-Referer` y `X-Title`.

Si la credencial no está disponible, el sistema SHALL emitir `[TTS-FALLBACK]` con `reason: no-openrouter-key` y usar el mensaje genérico de fallback sin intentar ninguna llamada. No SHALL haber validación proactiva de la clave ni fallback al provider de la sesión: cualquier fallo de la llamada (HTTP no-2xx, timeout, respuesta sin bloques `text`) SHALL caer al fallback genérico con su `reason` correspondiente.

#### Scenario: Sesión con cualquier provider genera resumen vía OpenRouter
- **GIVEN** que la sesión activa usa MiniMax (o Anthropic, u Ollama) como provider
- **AND** `routing/providers/openrouter/secrets.json` contiene una API key
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL llamar a `https://openrouter.ai/api/v1/messages` con el modelo `poolside/laguna-xs.2:free` y bearer de OpenRouter
- **AND** el provider de la sesión NO SHALL recibir ninguna petición de inferencia TTS

#### Scenario: Sin clave de OpenRouter usa fallback genérico
- **GIVEN** que `routing/providers/openrouter/secrets.json` no existe o no contiene clave
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL emitir `[TTS-FALLBACK]` con `reason: "no-openrouter-key"`
- **AND** SHALL reproducir el mensaje de fallback definido para `Stop` sin hacer ninguna petición HTTP

#### Scenario: Fallo de OpenRouter cae al fallback sin reintentos hacia el provider de sesión
- **GIVEN** que OpenRouter responde con error (ej. 429) o la petición agota el timeout
- **WHEN** el handler procesa un evento `Stop`
- **THEN** SHALL emitir `[TTS-FALLBACK]` con el `reason` correspondiente (`http-429`, `exception`, etc.)
- **AND** NO SHALL intentar la inferencia contra el provider de la sesión

## MODIFIED Requirements

### Requirement: Robustez en la Inferencia y Reproducción de Audio
Cualquier fallo al leer el transcript, al invocar al LLM para el resumen/respuesta, o al reproducir el audio NO SHALL afectar el ciclo de vida normal de Claude Code ni bloquear las respuestas del proxy. Cada fallo SHALL ser registrado como `[TTS-FALLBACK]` con `reason` identificando la causa (`no-openrouter-key`, `no-messages`, `http-NNN`, `empty-response`, `exception`), de forma que sea detectable sin afectar el flujo principal. La reproducción de audio SHALL completarse antes de que el handler retorne; el servicio TTS SHALL esperar al cierre del proceso de síntesis.

#### Scenario: Falla de la API de resumen
- **GIVEN** un fallo de conexión al LLM o falta de API Key de OpenRouter
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

Al recibir el evento `Stop`, `AuditHookEventHandler` SHALL generar el texto de continuidad **una sola vez** (vía el provider TTS dedicado de OpenRouter) y emitirlo por **dos canales independientes a partir del mismo texto**:

1. Voz, mediante el servicio TTS local (comportamiento ya existente).
2. Un toast de escritorio, mediante `INotificationService` inyectado en el handler.

El toast SHALL tener título `"Stop"` y cuerpo igual al texto de continuidad truncado a un máximo de 250 caracteres. La generación del texto es independiente del provider de la sesión, por lo que el resultado SHALL ser consistente con cualquier provider Anthropic-compatible activo (Anthropic, Minimax, Ollama, etc.).

Si no hay servicio de notificación inyectado, o si la emisión del toast falla, el handler SHALL continuar sin propagar el error; el fallo del toast NO SHALL afectar la voz, la auditoría ni la respuesta HTTP del hook. Si el texto generado no está disponible (sin clave de OpenRouter, sin contexto o error de LLM), el handler SHALL usar el mismo texto de fallback que la voz para el cuerpo del toast.

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

- **GIVEN** el evento `Stop` llega sin clave de OpenRouter disponible o sin contexto extraíble
- **WHEN** `AuditHookEventHandler` procesa el evento
- **THEN** SHALL usar el texto de fallback definido para `Stop`
- **AND** SHALL reproducir ese fallback por voz
- **AND** SHALL emitir el toast con ese mismo fallback como cuerpo

### Requirement: Logging estructurado de fallback y mensaje dinámico
Cada vez que el sistema active un fallback TTS, SHALL emitir una entrada de log con tag `[TTS-FALLBACK]` incluyendo: `eventName`, `usedFallback: true`, `reason` (uno de: `no-openrouter-key`, `no-messages`, `http-NNN`, `empty-response`, `exception`) y `fallbackText`. Cada vez que se genere un mensaje dinámico, SHALL emitir `[TTS-SPEECH]` con `eventName`, `usedFallback: false` y una vista previa del texto (`textPreview`, máximo 120 caracteres).

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

## REMOVED Requirements

### Requirement: Selección de token y headers según el tipo de provider activo
**Reason**: La inferencia TTS ya no usa el provider de la sesión; el provider dedicado de OpenRouter tiene token y headers fijos, por lo que la selección condicional desaparece íntegramente.
**Migration**: Cubierta por el requisito nuevo "Provider dedicado de inferencia TTS (OpenRouter)". Eliminar `isAnthropic`, la selección `capturedToken`/env y los headers condicionales del handler.

### Requirement: Presupuesto de tokens de inferencia TTS según el provider activo
**Reason**: Con un único modelo fijo (`poolside/laguna-xs.2:free`, thinking) el presupuesto es constante (`512`); ya no existe la rama Anthropic (150) ni el cap de Ollama local.
**Migration**: Cubierta por el requisito nuevo "Provider dedicado de inferencia TTS (OpenRouter)". Eliminar `isOllama` y el `max_tokens` condicional del handler.

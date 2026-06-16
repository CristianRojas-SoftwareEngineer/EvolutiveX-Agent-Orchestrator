## ADDED Requirements

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

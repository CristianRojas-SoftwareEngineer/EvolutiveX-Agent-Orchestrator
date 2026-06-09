# Especificación: tts-hooks

## Propósito
Definir los requisitos de comportamiento y los escenarios para la síntesis de voz (TTS) contextual local ante los eventos de ciclo de vida interceptados en el endpoint `/hooks` y procesados por `AuditHookEventHandler`.

---

## Requirements

### Requirement: Extracción de Memoria Contextual
El sistema SHALL ser capaz de leer el transcript de la sesión activa de Claude Code y extraer las últimas $N$ interacciones, incluyendo los campos del rol de usuario, respuestas del asistente (incluyendo su razonamiento interno) y sistema.

#### Scenario: Lectura del transcript con éxito
- **GIVEN** que se recibe un hook con un `transcript_path` válido
- **WHEN** el backend lee el archivo
- **THEN** SHALL retornar una estructura con los últimos $N$ mensajes ordenados cronológicamente detallando el rol (usuario, asistente, sistema).

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
Cualquier fallo al leer el transcript, al invocar al LLM para el resumen/respuesta, o al reproducir el audio NO SHALL afectar el ciclo de vida normal de Claude Code ni bloquear las respuestas del proxy.

#### Scenario: Falla de la API de resumen
- **GIVEN** un fallo de conexión al LLM o falta de API Key
- **WHEN** se procesa un hook `Stop`
- **THEN** el sistema SHALL usar una locución de fallback predefinida (ej. "El asistente terminó el trabajo.") y reproducirla.
- **AND** la petición HTTP de hook SHALL finalizar con éxito (código 2xx).

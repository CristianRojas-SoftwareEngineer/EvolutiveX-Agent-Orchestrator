## MODIFIED Requirements

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

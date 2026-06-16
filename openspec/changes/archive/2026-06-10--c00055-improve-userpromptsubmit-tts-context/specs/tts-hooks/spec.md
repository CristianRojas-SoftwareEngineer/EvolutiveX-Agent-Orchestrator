## MODIFIED Requirements

### Requirement: Respuesta de Asistente de Voz en `UserPromptSubmit`
Al recibir un evento `UserPromptSubmit`, el sistema SHALL componer un contexto curado de tres mensajes para el LLM — el penúltimo mensaje del usuario, la última respuesta del asistente en el turno anterior, y el prompt actual recibido en el payload del hook — y SHALL enviar ese contexto junto con un system prompt que instruya al LLM a responder SOLO al prompt actual (el tercer mensaje) en una sola oración breve y natural en español, confirmando que procederá a investigar o ejecutar la acción solicitada. El sistema SHALL reproducir el resultado por voz de forma asíncrona.

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
- **AND** si la llamada a OpenRouter falla o no hay clave, SHALL reproducir `FALLBACK_SPEECH.UserPromptSubmit`

#### Scenario: El contexto no incluye el prompt anterior como objetivo
- **GIVEN** el hook `UserPromptSubmit` es recibido con un `transcript_path` válido
- **AND** el transcript contiene el prompt del turno anterior
- **WHEN** el backend construye el contexto para el LLM
- **THEN** el `system` prompt SHALL instruir explícitamente a responder al tercer mensaje (prompt actual) y no al primero
- **AND** SHALL emitir `[TTS-SPEECH]` con `usedFallback: false` cuando el LLM responda con texto dinámico

### Requirement: Selección de mensajes curada en el extractor de transcript
El extractor de contexto SHALL exponer un método que lea el transcript JSONL de Claude Code y devuelva un `UserPromptContext` con tres campos: el penúltimo mensaje del usuario, la última respuesta del asistente, y el prompt actual. El extractor SHALL filtrar por `role` (no por posición absoluta) y SHALL ser agnóstico del handler que lo invoca.

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

### Requirement: System prompt `VOICE_ASSISTANT_SYSTEM_PROMPT` apuntando al tercer mensaje
El system prompt del modo `prompt` SHALL instruir explícitamente al LLM a responder SOLO al tercer mensaje del array (el prompt actual), describiendo el array como "petición anterior del usuario, tu última respuesta, y la nueva petición del usuario".

#### Scenario: System prompt declarativo del orden de los mensajes
- **WHEN** el handler construye la llamada a OpenRouter en `mode='prompt'`
- **THEN** SHALL usar el `system` field cuyo texto mencione explícitamente "la nueva petición del usuario" como objetivo de la respuesta

## ADDED Requirements

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

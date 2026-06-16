# Spec: stop-hook-continuity-message

## ADDED Requirements

### Requirement: Extracción del contexto del workflow desde el transcript

El sistema SHALL implementar `extractWorkflowContext(transcriptPath: string): Promise<WorkflowContext | undefined>` en `scripting/stop-work-summary-notification.ts`. La función SHALL:

1. Leer el JSONL de `transcriptPath` línea por línea.
2. Localizar todos los mensajes con `role: 'user'` para identificar los inicios de workflow.
3. Delimitar el **workflow actual** como el segmento desde el **último** mensaje `user` hasta el fin del archivo.
4. Delimitar el **workflow previo** como el segmento desde el **penúltimo** mensaje `user` hasta el inicio del workflow actual (exclusive); si solo existe un workflow, el campo `previous` SHALL ser `undefined`.
5. Para el workflow previo, retener únicamente: el mensaje `user` de apertura y el **último** mensaje `assistant` con bloque `text` (compresión del historial previo).
6. Para el workflow actual, retener todos los mensajes en orden.

El tipo `WorkflowContext` SHALL tener la forma:
```
WorkflowContext {
  previous?: { userPrompt: string; lastAssistantText: string };
  current: { userPrompt: string; messages: string[] };
}
```

donde `messages` recoge los textos de todos los bloques `type: 'text'` de los mensajes `assistant` del workflow actual, en orden de aparición.

La función SHALL tolerar líneas JSONL malformadas (no SHALL lanzar; SHALL omitir esas líneas). Si `transcriptPath` no existe o no es legible, SHALL devolver `undefined` y registrar el error en `stderr`.

#### Scenario: Transcript con dos o más workflows

- **GIVEN** un JSONL con al menos dos mensajes `user` separados por mensajes `assistant`
- **WHEN** se invoca `extractWorkflowContext(transcriptPath)`
- **THEN** el resultado SHALL incluir `previous.userPrompt` igual al prompt del penúltimo mensaje `user`
- **AND** SHALL incluir `current.userPrompt` igual al prompt del último mensaje `user`
- **AND** `current.messages` SHALL contener los textos assistant del workflow actual en orden

#### Scenario: Transcript con un solo workflow

- **GIVEN** un JSONL con un único mensaje `user` seguido de mensajes `assistant`
- **WHEN** se invoca `extractWorkflowContext(transcriptPath)`
- **THEN** el resultado SHALL tener `previous: undefined`
- **AND** `current` SHALL contener el único workflow completo

#### Scenario: transcript_path no legible

- **GIVEN** que `transcriptPath` no existe en disco
- **WHEN** se invoca `extractWorkflowContext(transcriptPath)`
- **THEN** la función SHALL devolver `undefined`
- **AND** SHALL escribir un mensaje diagnóstico en `stderr`

---

### Requirement: Generación del mensaje de continuidad con modelo

El sistema SHALL implementar `generateContinuityMessage(context: WorkflowContext, assistantTextFallback?: string): Promise<string | undefined>` en `scripting/stop-work-summary-notification.ts`. Esta función reemplaza `summarizeWorkWithModel` para el hook `Stop`.

El prompt SHALL cubrir **tres dimensiones** en una respuesta en prosa, en español, sin markdown ni listas:
1. Qué se completó en el turno actual.
2. Qué está abierto, ambiguo o sin resolver.
3. La dirección sugerida para el siguiente prompt o trabajo.

El prompt SHOULD incluir el contexto del workflow previo (si existe) para que el modelo pueda razonar sobre la continuidad entre turnos.

Parámetros del modelo:
- `model`: `ANTHROPIC_DEFAULT_HAIKU_MODEL` o `claude-haiku-4-5-20251001` como fallback.
- `max_tokens`: 600 (incrementado desde 300; la respuesta debe ser suficientemente rica para TTS).
- Input al modelo: texto ensamblado a partir de `WorkflowContext`, acotado a `MAX_INPUT_CHARS` (≥ 15 000) para controlar el coste.

La función NO SHALL truncar el texto generado por el modelo. El truncado para display es responsabilidad del llamante. Si no hay credenciales disponibles o la llamada falla, la función SHALL devolver `undefined`; el llamante usará el fallback.

#### Scenario: Llamada exitosa con contexto de dos workflows

- **GIVEN** un `WorkflowContext` con `previous` y `current` no vacíos
- **AND** `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN` presentes en el entorno
- **WHEN** se invoca `generateContinuityMessage(context)`
- **THEN** la función SHALL llamar a la API con el modelo Haiku
- **AND** el texto retornado SHALL ser el generado por el modelo, sin truncar
- **AND** SHALL cubrir las tres dimensiones (qué se hizo, qué está abierto, qué sigue)

#### Scenario: Sin credenciales → devuelve undefined

- **GIVEN** que `ANTHROPIC_API_KEY` y `ANTHROPIC_AUTH_TOKEN` están ausentes o vacíos en el entorno
- **WHEN** se invoca `generateContinuityMessage(context)`
- **THEN** la función SHALL devolver `undefined` sin lanzar excepción

#### Scenario: Error de API → devuelve undefined y registra en stderr

- **GIVEN** que la llamada a la API lanza un error de red o HTTP
- **WHEN** se invoca `generateContinuityMessage(context)`
- **THEN** la función SHALL devolver `undefined`
- **AND** SHALL escribir el mensaje de error en `stderr`

---

### Requirement: Persistencia del mensaje de continuidad en disco

El sistema SHALL implementar `writeContinuityMessage(text: string, projectDir: string): Promise<void>` en `scripting/stop-work-summary-notification.ts`. La función SHALL escribir el texto completo (sin truncar) en `<projectDir>/sessions/.last-continuity-message.txt`, creando el archivo si no existe y sobreescribiéndolo si existe.

Este archivo actúa como punto de integración para el sistema TTS (Fase 2, fuera del scope de este cambio): TTS leerá el texto completo desde esta ruta fija sin necesidad de parámetros adicionales.

Si la escritura falla (directorio inexistente, permisos), la función SHALL registrar el error en `stderr` y retornar sin lanzar excepción. El orquestador NO SHALL abortar el toast por este fallo.

#### Scenario: Escritura exitosa

- **GIVEN** `projectDir` apunta a un directorio con subdirectorio `sessions/` accesible
- **AND** `text` es un string no vacío
- **WHEN** se invoca `writeContinuityMessage(text, projectDir)`
- **THEN** SHALL existir el archivo `sessions/.last-continuity-message.txt` con el contenido de `text`

#### Scenario: Fallo de escritura no aborta el toast

- **GIVEN** que `sessions/` no existe o el proceso no tiene permisos de escritura
- **WHEN** se invoca `writeContinuityMessage(text, projectDir)`
- **THEN** la función SHALL retornar sin lanzar
- **AND** SHALL escribir un mensaje de diagnóstico en `stderr`
- **AND** el llamante SHALL continuar y emitir el toast normalmente

---

### Requirement: Toast único del hook Stop con mensaje de continuidad

El sistema SHALL emitir **un único toast** cuando Claude Code dispare el evento `Stop`. Este toast reemplaza el doble toast anterior (señal de fin de turno + resumen).

El toast SHALL tener las siguientes propiedades:
- **Título**: `"Stop"` (eventKey, sin override).
- **Cuerpo**: preview del mensaje de continuidad, truncado a ≤ 250 caracteres.
- **Branding**: `appId` y `icon` del perfil del catálogo para `Stop` (sin cambios respecto al comportamiento actual).
- **Sonido**: según el catálogo para `Stop`.

Jerarquía del cuerpo del toast:
1. Si `generateContinuityMessage` devuelve texto → `truncate(text, 250)`.
2. Si no hay texto generado pero hay texto fuente (`last_assistant_message` o transcript) → `fallbackSummary(assistantText)` (truncado normalizado existente, ≤ 320 chars).
3. Si no hay ningún texto fuente disponible → copy del catálogo para `Stop` («Tu turno — El asistente terminó. Escribe tu siguiente mensaje.»).

El orquestador `runContinuityNotification` (renombre de `runStopWorkSummaryNotification`) SHALL invocar los pasos en este orden:
1. `postHookEvent(body)` — POST al gateway.
2. `extractWorkflowContext(transcript_path)` — extrae el contexto del workflow.
3. `generateContinuityMessage(context)` — genera el mensaje de continuidad.
4. `writeContinuityMessage(text, projectDir)` — persiste en disco (no bloquea si falla).
5. Emitir el único toast con el cuerpo resuelto según la jerarquía anterior.

La función `notifyStopTurnFinished()` SHALL ser eliminada; no existe comportamiento de señal de estado separada del toast de continuidad.

#### Scenario: Flujo completo con transcript disponible y API key presente

- **GIVEN** el payload de `Stop` incluye `transcript_path` apuntando a un JSONL legible con al menos un workflow
- **AND** `ANTHROPIC_API_KEY` presente en el entorno
- **WHEN** se ejecuta `runContinuityNotification`
- **THEN** SHALL emitirse exactamente **un** toast con título `"Stop"`
- **AND** el cuerpo SHALL ser un preview truncado del mensaje generado por Haiku
- **AND** SHALL existir el archivo `sessions/.last-continuity-message.txt` con el texto completo

#### Scenario: Sin API key → fallback a texto truncado

- **GIVEN** `ANTHROPIC_API_KEY` y `ANTHROPIC_AUTH_TOKEN` ausentes
- **AND** el payload incluye `last_assistant_message` no vacío
- **WHEN** se ejecuta `runContinuityNotification`
- **THEN** SHALL emitirse **un** toast con título `"Stop"`
- **AND** el cuerpo SHALL ser el `fallbackSummary` del `last_assistant_message`
- **AND** SHALL escribirse `sessions/.last-continuity-message.txt` con el fallback

#### Scenario: Sin texto fuente disponible → copy del catálogo

- **GIVEN** stdin vacío o payload sin `last_assistant_message` ni `transcript_path` legible
- **WHEN** se ejecuta `runContinuityNotification`
- **THEN** SHALL emitirse **un** toast con título `"Stop"` y cuerpo = copy del catálogo
- **AND** NO SHALL escribirse `sessions/.last-continuity-message.txt` (sin texto que persistir)

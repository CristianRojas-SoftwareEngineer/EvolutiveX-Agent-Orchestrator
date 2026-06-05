## MODIFIED Requirements

### Requirement: Formatters de mensaje desde payload de hook

El sistema SHALL exponer en `src/2-services/notifications/hook-payload-notification-message.ts`:

- Constantes `MAX_ASSISTANT_MESSAGE_LEN` (140) y `MAX_TOOL_INPUT_PREVIEW_LEN` (120).
- Función `resolveHookNotificationMessage(eventKey: string, payload: Record<string, unknown>): string | null`.
- Función `repairMojibake(text: string): string` que repara texto «UTF-8 mal decodificado como Latin-1/CP1252».
- Registro interno o exportado de formatters por `eventKey` para exactamente estos cinco casos:

| `eventKey` | Campos del payload consumidos | Comportamiento mínimo |
|------------|------------------------------|------------------------|
| `StopFailure` | `error`, `last_assistant_message` | Mapa de códigos de error API a texto en español; segunda línea opcional con último mensaje del asistente truncado |
| `PermissionRequest` | `tool_name`, `tool_input` | «Permiso para: {tool}»; preview de input (`command`, `file_path`, o JSON compacto) truncado |
| `PreToolUse` | `tool_input.questions[]` | Conteo de preguntas; preview de `question` o `header` de la primera |
| `UserPromptSubmit` | `prompt` | Preview del prompt truncado y whitespace normalizado |
| `Stop` | `last_assistant_message` | Texto truncado; `null` si ausente → fallback catálogo |

Los formatters SHALL ser funciones puras sin I/O. SHALL aplicar normalización de espacios en previews y sufijo `…` al truncar.

**Reparación de mojibake del payload.** Algunos clientes de hooks (p. ej. Cursor) envían el payload doblemente codificado: los bytes UTF-8 del texto se reinterpretan como Latin-1/CP1252 y se reserializan como UTF-8, produciendo secuencias como `Â¿quÃ©` para «¿qué». `resolveHookNotificationMessage` SHALL aplicar `repairMojibake` al string que devuelve cualquier formatter antes de retornarlo.

`repairMojibake` SHALL:

- Detectar la firma de mojibake (byte líder UTF-8 `C2`–`DF` o `E0`–`EF` seguido de bytes de continuación `80`–`BF`, tal como aparecen al decodificar UTF-8 como Latin-1).
- Si hay firma, reinterpretar el string con `Buffer.from(text, 'latin1').toString('utf8')`.
- Devolver el texto **original sin cambios** si no hay firma de mojibake (caso Claude Code y ASCII puro) o si la reparación introduce el carácter de reemplazo `U+FFFD` (señal de que el origen no era mojibake recuperable).

#### Scenario: StopFailure con error desconocido

- **GIVEN** payload `{ "error": "custom_code" }`
- **WHEN** se invoca `resolveHookNotificationMessage('StopFailure', payload)`
- **THEN** SHALL devolver string que mencione el código de error

#### Scenario: PermissionRequest sin tool_input

- **GIVEN** payload `{ "tool_name": "Read" }`
- **WHEN** se invoca el formatter
- **THEN** SHALL devolver string con «Permiso para: Read» sin segunda línea

#### Scenario: PreToolUse sin questions

- **GIVEN** payload `{ "tool_input": {} }`
- **WHEN** se invoca el formatter
- **THEN** SHALL devolver `null`

#### Scenario: eventKey sin formatter registrado

- **GIVEN** `eventKey` `SessionStart`
- **WHEN** se invoca `resolveHookNotificationMessage`
- **THEN** SHALL devolver `null`

#### Scenario: UserPromptSubmit con prompt doblemente codificado (Cursor) → mensaje reparado

- **GIVEN** payload `{ "prompt": "Hola, Â¿quÃ© hace?" }` (mojibake emitido por Cursor)
- **WHEN** se invoca `resolveHookNotificationMessage('UserPromptSubmit', payload)`
- **THEN** SHALL devolver «Hola, ¿qué hace?» sin secuencias `Â`/`Ã`

#### Scenario: Prompt UTF-8 correcto (Claude Code) se mantiene intacto

- **GIVEN** payload `{ "prompt": "Hola, ¿qué hace? niño, sesión" }`
- **WHEN** se invoca `resolveHookNotificationMessage('UserPromptSubmit', payload)`
- **THEN** SHALL devolver el mismo texto sin alteraciones

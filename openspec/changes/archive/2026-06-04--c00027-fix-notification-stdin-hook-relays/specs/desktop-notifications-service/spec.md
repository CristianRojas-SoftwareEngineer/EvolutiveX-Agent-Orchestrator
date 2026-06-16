## ADDED Requirements

### Requirement: Lectura de stdin UTF-8 en el CLI de notificaciones

Cuando el entry point `src/2-services/notifications/cli.ts` lee el payload del hook con `--stdin-json`, SHALL acumular stdin como `Buffer` y decodificarlo con `toString('utf-8')` antes de `JSON.parse` y `normalizeStdinJsonText`.

El CLI SHALL NOT depender exclusivamente de `process.stdin.setEncoding('utf8')` como único mecanismo de lectura.

#### Scenario: Payload con tildes en `prompt` se parsea correctamente

- **GIVEN** stdin contiene JSON UTF-8 válido con `prompt: "configuración y sesión"`
- **WHEN** se invoca `cli.ts --event-type UserPromptSubmit --stdin-json`
- **THEN** `resolveNotificationMessage` SHALL devolver un string que contenga «configuración» y «sesión» sin secuencias de mojibake (`Ã`, `â€`)

#### Scenario: BOM UTF-8 al inicio del stdin

- **GIVEN** stdin comienza con U+FEFF seguido de JSON
- **WHEN** se normaliza con `normalizeStdinJsonText`
- **THEN** `JSON.parse` SHALL tener éxito

---

### Requirement: Relays scripting que delegan en el mismo contrato que el CLI

El repositorio SHALL exponer relays en `scripting/` que reutilicen `buildEvent` y `DesktopNotificationAdapter` sin duplicar formatters:

| Módulo | Eventos | Secuencia |
|--------|---------|-----------|
| `gateway-hook-notify.ts` | `UserPromptSubmit`, `StopFailure` | stdin → `POST /hooks` → toast |
| `pre-tool-use-hook-ux.ts` | `PreToolUse` | stdin → `POST /hooks` → toast condicional |

Estos relays SHALL leer stdin con el mismo criterio UTF-8 que `post-hook-event.ts` (`readStdinBuffer` + `utf-8`).

#### Scenario: Relay y CLI producen el mismo mensaje para el mismo payload

- **GIVEN** un payload `UserPromptSubmit` con `prompt` fijo
- **WHEN** se construye el evento vía `buildEvent` en el relay y vía `cli.ts` con el mismo JSON en memoria
- **THEN** ambos SHALL producir el mismo `message` en el `NotificationEvent`

#### Scenario: Caracteres españoles en formatter PreToolUse

- **GIVEN** payload con `tool_input.questions[0].question` = «¿Usamos configuración regional?»
- **WHEN** `resolveHookNotificationMessage('PreToolUse', payload)` se invoca
- **THEN** el resultado SHALL contener «configuración» y «¿» correctamente

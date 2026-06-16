## MODIFIED Requirements

### Requirement: Parsing puro del evento de hook

`ClaudeHookEvent` SHALL tener la siguiente forma extendida:

```
ClaudeHookEvent {
  eventName: HookEventName;
  sessionId: string;
  toolUseId?: string;
  agentId?: string;
  stopHookActive?: boolean;
  backgroundTasks?: number;
  lastAssistantMessage?: string;
  transcriptPath?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  prompt?: string;
}
```

`HookEventName` SHALL ser la unión de los 13 nombres de evento conocidos:

```
'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'
| 'SubagentStart' | 'SubagentStop' | 'Stop' | 'StopFailure'
| 'SessionStart' | 'SessionEnd' | 'PermissionRequest'
| 'TaskCreated' | 'TaskCompleted'
| (string & {})
```

`parseHookEvent` SHALL mapear los campos wire adicionales:
- `tool_name` (string) → `toolName`
- `tool_input` (object) → `toolInput`
- `prompt` (string) → `prompt`

#### Scenario: Payload `PreToolUse` con `tool_name` y `tool_input` mapeados correctamente

- **GIVEN** un payload JSON `{ "hook_event_name": "PreToolUse", "session_id": "s1", "tool_name": "AskUserQuestion", "tool_input": { "questions": ["¿Continuar?"] } }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver `{ eventName: 'PreToolUse', sessionId: 's1', toolName: 'AskUserQuestion', toolInput: { questions: ['¿Continuar?'] } }`

#### Scenario: Payload `PostToolUse` con `tool_name` `TaskUpdate` mapeado

- **GIVEN** un payload JSON `{ "hook_event_name": "PostToolUse", "session_id": "s1", "tool_use_id": "tu-1", "tool_name": "TaskUpdate", "tool_input": { "status": "in_progress", "subject": "Refactor parser" } }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver un `ClaudeHookEvent` con `toolName: 'TaskUpdate'` y `toolInput.status: 'in_progress'`

#### Scenario: Payload `PermissionRequest` con `tool_name` mapeado

- **GIVEN** un payload JSON `{ "hook_event_name": "PermissionRequest", "session_id": "s1", "tool_name": "Bash", "tool_input": { "command": "rm -rf /tmp/test" } }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver `{ eventName: 'PermissionRequest', sessionId: 's1', toolName: 'Bash', toolInput: { command: 'rm -rf /tmp/test' } }`

#### Scenario: Payload `SessionStart` reconocido en HookEventName

- **GIVEN** un payload JSON `{ "hook_event_name": "SessionStart", "session_id": "s1" }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** SHALL devolver `{ eventName: 'SessionStart', sessionId: 's1' }` sin lanzar error

#### Scenario: Payload sin `tool_name` no incluye `toolName` en el resultado

- **GIVEN** un payload JSON `{ "hook_event_name": "Stop", "session_id": "s1" }`
- **WHEN** se invoca `parseHookEvent(payload)`
- **THEN** el resultado NO SHALL tener propiedad `toolName`

---

### Requirement: Todos los eventos de hook ciclan por `POST /hooks`

Todos los 14 eventos de Claude Code gestionados por SCP SHALL usar `post-hook-event.ts` como único comando relay en `configs/hooks.json`. Ningún evento SHALL usar `notifications/cli.ts` ni ningún otro script como comando de hook directo.

Los eventos que previamente usaban scripts con efectos locales (`gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts`, `notifications/cli.ts`) ahora siguen el mismo flujo: `post-hook-event.ts` → `POST /hooks` → gateway.

#### Scenario: Todos los eventos en hooks.json usan post-hook-event como comando

- **GIVEN** `configs/hooks.json` instalado por SCP
- **WHEN** se inspeccionan todos los comandos de hook de todos los eventos
- **THEN** cada comando SHALL referenciar únicamente `scripting/post-hook-event.ts`
- **AND** SHALL no existir ningún comando que referencie `gateway-hook-notify.ts`, `pre-tool-use-hook-ux.ts`, `task-in-progress-hook-ux.ts`, ni `notifications/cli.ts`

#### Scenario: PostToolUse tiene una sola entrada de hook (sin duplicado TaskUpdate)

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspeccionan las entradas bajo la clave `PostToolUse`
- **THEN** SHALL existir exactamente una entrada con `matcher: "*"` y comando `post-hook-event.ts`
- **AND** SHALL no existir una segunda entrada separada para el matcher `TaskUpdate`

#### Scenario: SubagentStart tiene una sola entrada de hook (sin cli.ts en paralelo)

- **GIVEN** `configs/hooks.json`
- **WHEN** se inspeccionan las entradas bajo la clave `SubagentStart`
- **THEN** SHALL existir exactamente un comando por bloque de hook
- **AND** el comando SHALL referenciar `post-hook-event.ts`

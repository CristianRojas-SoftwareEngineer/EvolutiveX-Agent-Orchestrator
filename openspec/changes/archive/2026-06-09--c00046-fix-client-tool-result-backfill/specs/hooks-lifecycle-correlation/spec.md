## MODIFIED Requirements

### Requirement: AuditHookEventHandler — tabla de acciones por evento (G2)

`AuditHookEventHandler` SHALL correlacionar hooks del harness con mutaciones del `IWorkflowRepository` según la tabla:

| Evento | Acción |
|--------|--------|
| `UserPromptSubmit` | **Abre o confirma el workflow main en el repo** (idempotente; ver `gateway-workflow-lifecycle`) |
| `SubagentStart` | **`confirmSubagentFromHook(agentId, toolUseId?)`** (sin cambio respecto a C3) |
| `Stop` | **`readyToClose` → si true: `close`** (§15.4) |
| `SubagentStop` | **`readyToClose` para sub-workflow → si true: `close`** (§15.4) |
| `StopFailure` | **`close` directamente** (§15.4: siempre cierra en error) |
| `PreToolUse` | Log informativo; no muta `IToolUse` |
| `PostToolUse` | **`completeToolUse` solo si `completionAuthority === 'hook'`**; ignorar para tools `continuation` |
| `PostToolUseFailure` | **`completeToolUse` con `isError: true` solo si `completionAuthority === 'hook'`**; ignorar para tools `continuation` |

Los hooks `PostToolUse` / `PostToolUseFailure` siguen recibiéndose en `POST /hooks` (relay activo); la restricción es sobre **mutación de estado**, no sobre recepción del evento.

#### Scenario: `SubagentStart` → `confirmSubagentFromHook` invocado (sin cambio)

- **GIVEN** un `ClaudeHookEvent` con `eventName: 'SubagentStart'`, `agentId: 'agent-child'`, `toolUseId: 'tu-abc'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** SHALL llamarse `workflowRepo.confirmSubagentFromHook('agent-child', 'tu-abc')`

#### Scenario: `Stop` con repo activo → delegado a readyToClose/close

- **GIVEN** un workflow activo identificado por `agentId` en el repo
- **AND** un `ClaudeHookEvent` con `eventName: 'Stop'`, `stopHookActive: false`, `backgroundTasks: 0`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL invocar `readyToClose` sobre el workflow
- **AND** SHALL invocar `close` ya que `readyToClose` devolvió `true`
- **AND** el workflow SHALL quedar cerrado con `outcome: 'success'`

#### Scenario: `StopFailure` → close directo

- **GIVEN** un workflow activo en el repo
- **AND** un `ClaudeHookEvent` con `eventName: 'StopFailure'`
- **WHEN** `AuditHookEventHandler.execute(event)` se invoca
- **THEN** el handler SHALL invocar `close` directamente sin `readyToClose`

#### Scenario: PostToolUse para Bash client-side no muta el tool

- **GIVEN** un tool `Bash` con `completionAuthority: continuation` y `status: running`
- **WHEN** `AuditHookEventHandler` procesa `PostToolUse` para ese `tool_use_id`
- **THEN** `completeToolUse` NO SHALL invocarse
- **AND** el tool SHALL permanecer `running`

#### Scenario: PostToolUse para WebFetch con autoridad hook completa el tool

- **GIVEN** un tool `WebFetch` con `completionAuthority: hook` y `status: running`
- **WHEN** `AuditHookEventHandler` procesa `PostToolUse` con `lastAssistantMessage: 'summary'`
- **THEN** `completeToolUse` SHALL invocarse con `isError: false` y `result: 'summary'`

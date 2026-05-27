## ADDED Requirements

### Event Schemas

#### tool_call schema
The tool_call event SHALL extend BaseEvent and include the following fields:

```json
{
  "type": "object",
  "properties": {
    "event_type": { "type": "string", "const": "tool_call" },
    "timestamp": { "type": "string", "format": "date-time" },
    "request_id": { "type": "string", "format": "uuid" },
    "workflow_id": { "type": "string", "format": "uuid" },
    "session_id": { "type": "string" },
    "schema_version": { "type": "string", "const": "1.0.0" },
    "tool_use_id": { "type": "string" },
    "tool_name": { "type": "string" },
    "tool_input": { "type": "object" },
    "provider_format": { "type": "string", "enum": ["anthropic", "openai", "gemini", "ollama"] },
    "agent_role": { "type": "string" },
    "input_size_bytes": { "type": "integer" },
    "agent_id": { "type": "string" },
    "parent_agent_id": { "type": ["string", "null"] }
  },
  "required": ["event_type", "timestamp", "request_id", "workflow_id", "session_id", "schema_version", "tool_use_id", "tool_name", "tool_input", "provider_format", "agent_role", "input_size_bytes", "agent_id", "parent_agent_id"]
}
```

#### tool_result schema
The tool_result event SHALL extend BaseEvent and include the following fields:

```json
{
  "type": "object",
  "properties": {
    "event_type": { "type": "string", "const": "tool_result" },
    "timestamp": { "type": "string", "format": "date-time" },
    "request_id": { "type": "string", "format": "uuid" },
    "workflow_id": { "type": "string", "format": "uuid" },
    "session_id": { "type": "string" },
    "schema_version": { "type": "string", "const": "1.0.0" },
    "tool_use_id": { "type": "string" },
    "tool_name": { "type": "string" },
    "tool_output": { "type": ["string", "object", "array"] },
    "is_error": { "type": "boolean" },
    "execution_duration_ms": { "type": "integer" },
    "provider_format": { "type": "string", "enum": ["anthropic", "openai", "gemini", "ollama"] },
    "agent_role": { "type": "string" },
    "output_size_bytes": { "type": "integer" },
    "agent_id": { "type": "string" },
    "parent_agent_id": { "type": ["string", "null"] }
  },
  "required": ["event_type", "timestamp", "request_id", "workflow_id", "session_id", "schema_version", "tool_use_id", "tool_name", "tool_output", "is_error", "execution_duration_ms", "provider_format", "agent_role", "output_size_bytes", "agent_id", "parent_agent_id"]
}
```

#### tool_error schema
The tool_error event SHALL extend BaseEvent and include the following fields:

```json
{
  "type": "object",
  "properties": {
    "event_type": { "type": "string", "const": "tool_error" },
    "timestamp": { "type": "string", "format": "date-time" },
    "request_id": { "type": "string", "format": "uuid" },
    "workflow_id": { "type": "string", "format": "uuid" },
    "session_id": { "type": "string" },
    "schema_version": { "type": "string", "const": "1.0.0" },
    "tool_name": { "type": "string" },
    "error_type": { "type": "string" },
    "error_message": { "type": "string" },
    "agent_id": { "type": "string" },
    "parent_agent_id": { "type": ["string", "null"] }
  },
  "required": ["event_type", "timestamp", "request_id", "workflow_id", "session_id", "schema_version", "tool_name", "error_type", "error_message", "agent_id", "parent_agent_id"]
}
```

### Requirement: Track tool calls
The system SHALL capture tool call events when tools are invoked by the LLM, normalizing native provider tool formats (OpenAI tool_calls, Gemini functionCall, Anthropic tool_use, Ollama tool) into a unified event schema. Raw native events are captured separately when CLAUDISH_TELEMETRY_CAPTURE_RAW is enabled.

#### Scenario: Tool call initiated
- **WHEN** LLM requests a tool call (regardless of upstream format: Anthropic content_block_start.type="tool_use", OpenAI tool_calls[], Gemini functionCall, Ollama tool)
- **THEN** system logs tool_call event with tool_name, tool_input, request_id, and provider_format
- **AND** the normalized event uses Anthropic-compatible field names (tool_use_id, tool_name, tool_input)
- **AND** if raw capture is enabled, emits raw_tool_call with the native event structure

#### Scenario: Tool call completed
- **WHEN** tool execution completes
- **THEN** system logs tool_result event with tool_name, tool_output, execution_duration_ms, and provider_format
- **AND** tool_output type may be string, object, or array depending on provider
- **AND** if raw capture is enabled, emits raw_tool_result with the native event structure

### Requirement: Track tool calls per agent
The system SHALL associate tool calls with the agent/session that initiated them.

#### Scenario: Agent tool call
- **WHEN** an agent (opus, sonnet, haiku, subagent) invokes a tool
- **THEN** system logs tool_call event with agent_role and session_id

#### Scenario: Multiple agents
- **WHEN** multiple agents invoke tools in the same session
- **THEN** system logs each tool call with its associated agent_role

### Requirement: Track tool execution duration
The system SHALL measure and log the duration of each tool execution.

#### Scenario: Tool execution timing
- **WHEN** a tool is executed
- **THEN** system records start_time and end_time
- **AND** logs execution_duration_ms in the tool_result event

### Requirement: Track tool errors
The system SHALL capture tool execution errors for debugging.

#### Scenario: Tool execution error
- **WHEN** tool execution fails
- **THEN** system logs tool_error event with tool_name, error_type, and error_message

#### Scenario: Tool timeout
- **WHEN** tool execution times out
- **THEN** system logs tool_error event with error_type="timeout"

### Requirement: Track tool input/output sizes
The system SHALL log the size of tool inputs and outputs for capacity planning.

#### Scenario: Tool input size
- **WHEN** a tool is called
- **THEN** system logs input_size_bytes in tool_call event

#### Scenario: Tool output size
- **WHEN** a tool result is returned
- **THEN** system logs output_size_bytes in tool_result event

### Requirement: Aggregate tool usage statistics
Tool usage statistics per session and per agent are computable on-demand by consumers from the primitive `tool_call` and `tool_result` events. Consumers (GUI, historical API) can derive:
- `total_tool_calls` (integer) — count of tool_call events per session/workflow
- `tools_by_name` (object mapping tool_name to count) — group tool_call events by tool_name
- `total_tool_duration_ms` (integer) — sum of execution_duration_ms from tool_result events

## Dependencies

- **Hard dependencies on Phase 0**:
  - `migration-framework`: Feature flag to enable/disable tool execution tracking
  - `error-handling-policy`: Fire-and-forget error handling for emission failures
  - `lifecycle-hooks`: Hooks for tool event emission
  - `session-management`: Session ID and agent_role for correlation
  - `event-schema-validation`: Schema validation before emission

- **Hard dependencies on Phase 1**:
  - `event-bus`: Async emission and subscriber delivery
  - `stream-event-emitter`: Dual emission interface for tool events
  - `telemetry-export`: File backend for tool event persistence

- **Soft dependencies on Phase 2**:
  - `workflow-tracking`: Reads workflow_id from request context as an opaque value for correlation (no structural dependency on workflow-tracking internals)

## Explicit Exclusions

None. All tool execution tracking functionality is in Phase 2.

## References

- Baseline spec: `docs/migration/smart-work-gateway-migration/specs/tool-execution-tracking/spec.md`
- Phase 0 specs: `migration-framework`, `error-handling-policy`, `lifecycle-hooks`, `session-management`, `event-schema-validation`
- Phase 1 specs: `event-bus`, `stream-event-emitter`, `telemetry-export`
- Phase 2 spec: `workflow-tracking`

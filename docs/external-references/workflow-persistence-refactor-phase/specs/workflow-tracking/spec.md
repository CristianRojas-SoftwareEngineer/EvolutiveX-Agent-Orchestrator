## ADDED Requirements

### Requirement: Define workflow and request relationship
The system SHALL define the relationship between workflow_id and request_id as a parent-child hierarchy where one workflow spans multiple request iterations.

#### Scenario: Workflow spans multiple requests
- **WHEN** an agentic loop iterates (stop_reason="tool_use" after tool execution)
- **THEN** the system generates a new request_id for the iteration
- **AND** the new request_id is associated with the parent workflow_id
- **AND** all events for that iteration use the new request_id
- **AND** the workflow_id remains constant across all iterations

#### Scenario: Root workflow start
- **WHEN** a session receives its first request (no parent workflow)
- **THEN** the system generates a new workflow_id (UUID v4)
- **AND** emits a workflow_start event with the workflow_id and the first request_id
- **AND** parent_workflow_id is null for the root workflow

#### Scenario: Root agent agent_id
- **WHEN** a root workflow starts and no `x-claude-code-agent-id` header is present
- **THEN** the system generates an `agent_id` as a UUID v4
- **AND** stores it in the request context for the duration of the session
- **AND** includes it in the `workflow_start` event

### Requirement: Define workflow and request generation
The system SHALL generate workflow_id for the root agent and request_id for each agentic loop iteration.

#### Scenario: Workflow ID generation
- **WHEN** a workflow starts (root agent or sub-agent)
- **THEN** the system generates a unique workflow_id (UUID v4)
- **AND** workflow_id is associated with the agent executing the workflow
- **AND** workflow_id remains constant for the lifetime of the workflow

#### Scenario: Request ID generation for iterations
- **WHEN** an agentic loop iteration starts (stop_reason="tool_use")
- **THEN** Phase 1 request-observability generates a new request_id (UUID v4) for the iteration (ownership defined in request-observability spec)
- **AND** workflow-tracking reads the new request_id from the request context
- **AND** associates it with the current workflow_id
- **AND** all events for that iteration use this request_id

### Requirement: Detect sub-agent identity from request context
The system SHALL detect sub-agent identity at `request_received` time by reading `agent_id` and `parent_agent_id` from the request context populated by Phase 1 request-observability (which extracts `x-claude-code-agent-id` and `x-claude-code-parent-agent-id` headers at the request boundary).

#### Scenario: Sub-agent identified from request context
- **WHEN** a request arrives with `x-claude-code-agent-id` header
- **AND** the `agent_id` differs from the root agent for the session
- **THEN** Phase 1 `request-observability` emits `subagent_detected` event at `request_received` time (see `1-telemetry-event-streaming-phase/specs/request-observability/spec.md`)
- **AND** the WorkflowTracker subscriber (this spec) consumes the `subagent_detected` event and registers the sub-agent workflow immediately using `agent_id` as correlation key
- **AND** execution mode inference from the parent stream occurs separately (see execution mode inference requirements)

#### Scenario: Direct sub-agent completion observation
- **WHEN** a sub-agent's own last request completes through the proxy (identified via `x-claude-code-agent-id` header) with stop_reason != "tool_use"
- **THEN** system emits workflow_complete for the sub-agent based on direct observation (ground-truth)
- **AND** generates a workflow_complete event with the sub-agent's actual duration and outcome
- **AND** updates parent workflow's pending continuations if applicable

### Requirement: Infer execution mode from parent stream
The system SHALL infer execution mode (foreground/background, parallel/sequential) from the parent stream at `message_stop` by analyzing `tool_use` blocks matching known sub-agent tool names.

#### Scenario: Execution mode inference deferred to message_stop
- **WHEN** the parent stream reaches `message_stop`
- **THEN** the system analyzes `tool_use` blocks in the response
- **AND** identifies sub-agent tool_use blocks by name matching against internal constant ["Agent", "Explore", "Plan"]
- **AND** determines execution mode:
  - **Parallel**: multiple sub-agent tool_use blocks in same response
  - **Sequential**: single sub-agent tool_use block
  - **Foreground**: no `subagent_config.background=true` in tool input
  - **Background**: `subagent_config.background=true` in tool input
- **AND** emits `workflow_spawn` event with execution mode metadata after mode is determined
- **AND** when concurrency="parallel", generates parallel_group_id as UUID v5 from parent_workflow_id + parent_step_index

#### Scenario: Parallel group ID generation
- **WHEN** multiple sub-agents are spawned in parallel
- **THEN** the system generates a parallel_group_id as UUID v5 from parent_workflow_id + parent_step_index
- **AND** all sub-agents in the parallel group share the same parallel_group_id
- **AND** this enables grouping parallel sub-agents in the workflow tree

### Requirement: Define workflow event schemas
The system SHALL define JSON schemas for workflow-related telemetry events.

#### Scenario: workflow_start schema
- **WHEN** a workflow starts
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "workflow_start": {
      "type": "object",
      "properties": {
        "event_type": { "type": "string", "const": "workflow_start" },
        "timestamp": { "type": "string", "format": "date-time" },
        "workflow_id": { "type": "string", "format": "uuid" },
        "parent_workflow_id": { "type": ["string", "null"], "format": "uuid" },
        "request_id": { "type": "string", "format": "uuid" },
        "session_id": { "type": "string" },
        "schema_version": { "type": "string", "const": "1.0.0" },
        "agent_role": { "type": "string" },
        "invocation_method": { "type": "string", "enum": ["natural_language", "mention", "agent_flag", "ctrl_b"] },
        "concurrency": { "type": "string", "enum": ["sequential", "parallel"] },
        "blocking": { "type": "string", "enum": ["foreground", "background"] },
        "subagent_config": {
          "type": "object",
          "properties": {
            "tools": { "type": "array" },
            "disallowedTools": { "type": "array" },
            "model": { "type": "string" },
            "permissionMode": { "type": "string" },
            "background": { "type": "boolean" },
            "isolationMode": { "type": "string" }
          }
        },
        "agent_id": { "type": "string", "description": "From x-claude-code-agent-id header" },
        "parent_agent_id": { "type": ["string", "null"], "description": "From x-claude-code-parent-agent-id header; null for root agent" }
      },
      "required": ["event_type", "timestamp", "schema_version", "workflow_id", "request_id", "session_id", "agent_role", "invocation_method", "concurrency", "blocking", "agent_id", "parent_agent_id"]
    }
  }
  ```

#### Scenario: workflow_spawn schema
- **WHEN** a sub-agent workflow is spawned
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "workflow_spawn": {
      "type": "object",
      "properties": {
        "event_type": { "type": "string", "const": "workflow_spawn" },
        "timestamp": { "type": "string", "format": "date-time" },
        "workflow_id": { "type": "string", "format": "uuid" },
        "parent_workflow_id": { "type": "string", "format": "uuid" },
        "request_id": { "type": "string", "format": "uuid" },
        "session_id": { "type": "string" },
        "schema_version": { "type": "string", "const": "1.0.0" },
        "agent_role": { "type": "string" },
        "invocation_method": { "type": "string", "enum": ["natural_language", "mention", "agent_flag", "ctrl_b"] },
        "concurrency": { "type": "string", "enum": ["sequential", "parallel"] },
        "blocking": { "type": "string", "enum": ["foreground", "background"] },
        "parallel_group_id": { "type": ["string", "null"] },
        "agent_id": { "type": "string", "description": "From x-claude-code-agent-id header" },
        "parent_agent_id": { "type": "string", "description": "From x-claude-code-parent-agent-id header" }
      },
      "required": ["event_type", "timestamp", "schema_version", "workflow_id", "parent_workflow_id", "request_id", "session_id", "agent_role", "invocation_method", "concurrency", "blocking", "agent_id", "parent_agent_id"]
    }
  }
  ```

#### Scenario: workflow_complete schema
- **WHEN** a workflow completes
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "workflow_complete": {
      "type": "object",
      "properties": {
        "event_type": { "type": "string", "const": "workflow_complete" },
        "timestamp": { "type": "string", "format": "date-time" },
        "workflow_id": { "type": "string", "format": "uuid" },
        "request_id": { "type": "string", "format": "uuid" },
        "session_id": { "type": "string" },
        "schema_version": { "type": "string", "const": "1.0.0" },
        "duration_ms": { "type": "number" },
        "tool_count": { "type": "number" },
        "stop_reason": { "type": "string" },
        "usage": {
          "type": "object",
          "properties": {
            "input_tokens": { "type": "integer" },
            "output_tokens": { "type": "integer" },
            "cache_creation_input_tokens": { "type": "integer" },
            "cache_read_input_tokens": { "type": "integer" }
          }
        },
        "agent_id": { "type": "string", "description": "From x-claude-code-agent-id header" },
        "parent_agent_id": { "type": ["string", "null"], "description": "From x-claude-code-parent-agent-id header" }
      },
      "required": ["event_type", "timestamp", "schema_version", "workflow_id", "request_id", "session_id", "duration_ms", "stop_reason", "agent_id", "parent_agent_id"]
    }
  }
  ```

### Requirement: Correlate tool events with workflow_id
The system SHALL correlate tool execution events with the workflow_id.

#### Scenario: Tool events include workflow_id
- **WHEN** a tool_call or tool_result event is emitted
- **THEN** the event includes the workflow_id from the request context
- **AND** this enables correlation of tool execution with the workflow that initiated the tool

### Requirement: Track workflow timing
The system SHALL measure and log the duration of workflows.

#### Scenario: Workflow duration measurement
- **WHEN** a workflow starts
- **THEN** the system records the start timestamp
- **AND** when the workflow completes, calculates duration_ms
- **AND** logs duration_ms in the workflow_complete event

### Requirement: Track workflow errors
The system SHALL capture workflow errors for debugging.

#### Scenario: Workflow error
- **WHEN** a workflow fails
- **THEN** the system logs a workflow_error event with error details
- **AND** includes error_type and error_message

### Requirement: Track workflow tool summary
The system SHALL emit a workflow_tool_summary event per workflow with aggregated tool statistics.

#### Scenario: Workflow tool summary
- **WHEN** a workflow completes
- **THEN** the system emits a workflow_tool_summary event with:
  - total_tool_calls (integer)
  - tools_by_name (object mapping tool_name to count)
  - total_tool_duration_ms (integer)
- **AND** these statistics are computed from the primitive tool_call and tool_result events

#### workflow_tool_summary schema
```json
{
  "type": "object",
  "properties": {
    "event_type": { "type": "string", "const": "workflow_tool_summary" },
    "timestamp": { "type": "string", "format": "date-time" },
    "request_id": { "type": "string", "format": "uuid" },
    "workflow_id": { "type": "string", "format": "uuid" },
    "session_id": { "type": "string" },
    "schema_version": { "type": "string", "const": "1.0.0" },
    "total_tool_calls": { "type": "integer" },
    "tools_by_name": { "type": "object" },
    "total_tool_duration_ms": { "type": "integer" },
    "agent_id": { "type": "string" },
    "parent_agent_id": { "type": ["string", "null"] }
  },
  "required": ["event_type", "timestamp", "request_id", "workflow_id", "session_id", "schema_version", "total_tool_calls", "tools_by_name", "total_tool_duration_ms", "agent_id", "parent_agent_id"]
}
```

#### workflow_error schema
```json
{
  "type": "object",
  "properties": {
    "event_type": { "type": "string", "const": "workflow_error" },
    "timestamp": { "type": "string", "format": "date-time" },
    "request_id": { "type": "string", "format": "uuid" },
    "workflow_id": { "type": "string", "format": "uuid" },
    "session_id": { "type": "string" },
    "schema_version": { "type": "string", "const": "1.0.0" },
    "error_type": { "type": "string" },
    "error_message": { "type": "string" },
    "agent_id": { "type": "string" },
    "parent_agent_id": { "type": ["string", "null"] }
  },
  "required": ["event_type", "timestamp", "request_id", "workflow_id", "session_id", "schema_version", "error_type", "error_message", "agent_id", "parent_agent_id"]
}
```

### Requirement: Exclude side interactions from workflow tracking
The system SHALL NOT create workflow events for side interactions that occur outside the main agentic loop.

#### Scenario: Side interaction outside agentic loop
- **WHEN** an HTTP request arrives that is not part of the main `/v1/messages` agentic loop
- **THEN** the request is stored in `side-interactions/` by session persistence
- **AND** no `workflow_start`, `workflow_spawn`, or `workflow_complete` event is emitted
- **AND** the request does not count toward workflow aggregation totals

#### Scenario: Side interaction caused by a workflow
- **WHEN** a side interaction is triggered by a workflow
- **THEN** the side interaction may be correlated via `parent_workflow_id` and `request_id` in event context
- **AND** it is still stored in `side-interactions/` without generating its own workflow events
- **AND** it does not count toward `session_workflow_summary.total_workflows`

### Requirement: Define known sub-agent tool names
The system SHALL use an internal constant for known sub-agent tool names used exclusively for execution mode inference from the parent stream.

#### Scenario: Known sub-agent tool names
- **WHEN** the system analyzes the parent stream for execution mode inference
- **THEN** tool_use blocks whose `name` matches `["Agent", "Explore", "Plan"]` case-insensitively are treated as sub-agent invocations for mode inference purposes
- **AND** this list is an internal constant, not user-configurable
- **AND** sub-agent identity is NOT determined by tool name matching
- **AND** sub-agent identity is established from `x-claude-code-agent-id` headers at request time

#### Scenario: Proxy generates workflow_id as source of truth
- **WHEN** a workflow starts (root or sub-agent)
- **THEN** the proxy generates `workflow_id` as a UUID v4 locally
- **AND** the proxy is the sole authority for `workflow_id` generation
- **AND** `agent_id` from headers is stored alongside `workflow_id` for correlation
- **AND** all internal systems use `workflow_id` as the canonical workflow identifier and `agent_id` as the canonical agent identifier

### Requirement: Define coalesced body.json schema
The system SHALL define the JSON schema contract for the consolidated `body.json` written by the session persistence layer for steps that spawned sub-agents, covering all execution modes.

#### Scenario: Coalesced body.json schema
- **WHEN** the session persistence layer writes `body.json` for a step that spawned sub-agents
- **THEN** the output includes a `coalesced_body` object with the following schema:
  ```json
  {
    "coalesced_body": {
      "type": "object",
      "properties": {
        "execution_mode": {
          "type": "object",
          "properties": {
            "blocking": { "type": "string", "enum": ["foreground", "background"] },
            "concurrency": { "type": "string", "enum": ["sequential", "parallel"] }
          },
          "required": ["blocking", "concurrency"]
        },
        "parallel_group_id": { "type": ["string", "null"], "format": "uuid" },
        "phases": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "phase_type": { "type": "string", "enum": ["initial", "continuation", "subagent_response", "deferred_continuation"] },
              "workflow_id": { "type": "string", "format": "uuid" },
              "agent_role": { "type": "string" },
              "blocks": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "block_type": { "type": "string", "enum": ["text", "thinking", "tool_use", "tool_result", "redacted_thinking"] },
                    "index": { "type": "number" },
                    "content": { "type": ["string", "object", "array"] },
                    "tool_use_id": { "type": "string" },
                    "tool_name": { "type": "string" },
                    "is_error": { "type": "boolean" }
                  }
                }
              }
            }
          }
        }
      },
      "required": ["execution_mode", "phases"]
    }
  }
  ```
- **AND** Phase 2 owns this schema contract for consumers such as Historical API and Observability GUI
- **AND** Phase 4 `session-coalescing` owns advanced physical coalescing and deferred continuation updates that write data conforming to this schema

## Dependencies

- **Hard dependencies on Phase 0**:
  - `migration-framework`: Feature flag to enable/disable workflow tracking
  - `error-handling-policy`: Fire-and-forget error handling for emission failures
  - `lifecycle-hooks`: Hooks for workflow event emission
  - `session-management`: Session ID for correlation, sub-agent identification
  - `event-schema-validation`: Schema validation before emission

- **Hard dependencies on Phase 1**:
  - `event-bus`: Async emission and subscriber delivery
  - `request-observability`: Request ID, sub-agent detection, streaming events
  - `telemetry-export`: File backend for workflow event persistence

- **Soft dependencies on Phase 2**:
  - `tool-execution-tracking`: Consumes tool_call/tool_result events from event bus for workflow_tool_summary computation

## Explicit Exclusions

The following feature is **not** in Phase 2 and is deferred to Phase 4:

- **Advanced Agent coalescing**: Foreground/background/parallel/sequential coalescing with deferred continuations → See `4-advanced-features-phase/specs/session-coalescing/spec.md`

Phase 2 defines workflow hierarchy and execution mode inference. Advanced physical coalescing of sub-agent responses is deferred to Phase 4.

## References

- Baseline spec: `docs/migration/smart-work-gateway-migration/specs/workflow-tracking/spec.md`
- Phase 0 specs: `migration-framework`, `error-handling-policy`, `lifecycle-hooks`, `session-management`, `event-schema-validation`
- Phase 1 specs: `event-bus`, `request-observability`, `telemetry-export`
- Phase 2 spec: `tool-execution-tracking`
- Phase 4 spec: `session-coalescing`

# Phase 2 Design

## Context

Phase 0 established foundational contracts (feature flags, error handling, lifecycle hooks, session management, schema validation). Phase 1 implemented core telemetry infrastructure (event bus, stream emitter, file backend, request observability). Phase 2 builds on this foundation to add core observability capabilities:

- **Tool execution tracking**: Normalized tool events across all providers
- **Routing traceability**: Visibility into routing decisions and fallback chains
- **Token usage tracking**: Token metrics with cache efficiency
- **Workflow tracking**: Sub-agent hierarchies and execution modes
- **Session persistence**: Hybrid event + file storage for forensics

This phase delivers complete local forensics. A developer can debug a session entirely from local files without requiring GUI or APIs.

## Goals / Non-Goals

**Goals:**

- Track tool execution with normalized provider formats
- Log routing decisions with fallback chain visibility
- Track token usage with cache efficiency metrics
- Track sub-agent workflows with execution mode inference
- Implement session persistence with SSE reconstruction
- Aggregate session metrics for analysis

**Non-Goals:**

- WebSocket endpoint (Phase 3)
- Historical API (Phase 3)
- Observability GUI (Phase 3)
- GUI-specific token usage charts (Phase 3)
- Advanced Agent coalescing (Phase 4)
- Session file retention policy (Phase 4)

## Decisions

### 1. Tool Execution Tracking: Normalized Provider Formats

**Decision**: Tool events are normalized to Anthropic-compatible format across all providers (Anthropic, OpenAI, Gemini, Ollama). Raw events are captured separately when CLAUDISH_TELEMETRY_CAPTURE_RAW is enabled.

**Rationale**:

- Consumers (workflow tracking, GUI) need consistent format
- Normalization enables cross-provider analysis
- Raw events preserved for adapter debugging

**Alternatives considered**:

- Provider-native format only: Requires consumers to understand all formats (rejected)
- Multiple format variants: Adds complexity to consumers (rejected)

**Normalization mapping**:

- Anthropic: `tool_use` → `tool_call`, `tool_result`
- OpenAI: `tool_calls[]` → `tool_call`, `tool_result`
- Gemini: `functionCall` → `tool_call`, `tool_result`
- Ollama: `tool` → `tool_call`, `tool_result`

**Statistics computation**:

- Tool usage statistics are computed on-demand by consumers from primitive `tool_call` and `tool_result` events
- No summary events emitted at Phase 2 level
- Consumers can derive: `total_tool_calls`, `tools_by_name`, `total_tool_duration_ms`

### 2. Routing Traceability: Event-Based Logging

**Decision**: Routing decisions are logged as discrete events (routing_decision, fallback_attempt, fallback_success, fallback_exhausted, provider_selection, catalog_resolution).

**Rationale**:

- Event-based approach fits telemetry architecture
- Enables post-mortem analysis of routing decisions
- Provides visibility into fallback chains

**Alternatives considered**:

- Single routing event with embedded chain: Loses detail on individual attempts (rejected)
- No routing visibility: Makes debugging impossible (rejected)

**Provider chain inclusion**:

- The provider chain is included as a field in the `routing_decision` event
- Fallback events provide detailed per-attempt information
- This balances detail with event granularity

### 3. Token Usage Tracking: Per-Model Aggregation

**Decision**: Token usage is emitted per request with model_id. Session-persistence consumes these events to aggregate per-model metrics in `session-metrics.json`.

**Rationale**:

- Per-request events enable granular analysis
- Per-model aggregation enables cost analysis
- Separation of concerns: emission vs aggregation

**Alternatives considered**:

- Emit aggregated metrics only: Loses per-request granularity (rejected)
- No aggregation: Requires consumers to compute on every read (rejected)

**Cache efficiency formula**:

- `cache_efficiency` = `cache_read_input_tokens / (cache_read_input_tokens + input_tokens)`
- When denominator is 0, `cache_efficiency` is `null` (not 0)
- Computed by session-persistence, not in token_usage event

### 4. Workflow Tracking: Header-Based Identity + Stream-Based Mode

**Decision**: Sub-agent identity is established at `request_received` time via headers (`x-claude-code-agent-id`, `x-claude-code-parent-agent-id`). Execution mode is inferred from the parent stream at `message_stop` by analyzing `tool_use` blocks matching known sub-agent tool names.

**Rationale**:

- Headers provide ground-truth identity (v2.1.139+)
- Stream analysis provides execution mode context
- Two-step approach balances reliability and completeness

**Alternatives considered**:

- Stream-only identity: Less reliable, dependent on tool names (rejected)
- Header-only mode: Cannot determine execution mode (rejected)

**Execution mode inference**:

- **Parallel**: Multiple sub-agent tool_use blocks in same response
- **Sequential**: Single sub-agent tool_use block
- **Foreground**: No `subagent_config.background=true` in tool input
- **Background**: `subagent_config.background=true` in tool input

**Direct sub-agent completion**:

- Sub-agent's own last request completion is observed via `x-claude-code-agent-id` header
- `workflow_complete` for sub-agent is based on direct observation (ground-truth)
- Not inferred from parent's `tool_result`

### 5. Session Persistence: Hybrid Event + File Storage

**Decision**: Session persistence uses a hybrid model: async event bus for real-time delivery (Phase 1) and file-based storage for forensics (Phase 2). SSE reconstruction uses append-only async log with monotonic sequence numbers.

**Rationale**:

- Event bus enables real-time GUI (Phase 3)
- File backend provides immutable forensics
- SSE reconstruction enables deterministic ordering without sync blocking

**Alternatives considered**:

- Events only: No forensics, volatile data (rejected)
- Files only: Synchronous writes impact latency (rejected)
- Database: Overhead, requires external dependency (rejected)

**File structure**:

```
sessions/<session-id>/
  events.ndjson
  session-metrics.json
  main-agent/
    interactions/
      NN/
        meta.json
        state.json
        input/body.json
        output/body.json
        steps/
          NN/
            request/
              body.json
            response/
              normalized/sse.ndjson
              raw/sse.ndjson (when CAPTURE_RAW=true)
              body.json
            sub-agent-NN/
              meta.json
              input/, output/, steps/
  side-interactions/
    NN/
      meta.json
      steps/
```

**SSE reconstruction**:

- Append-only async log with monotonic sequence numbers
- Deterministic ordering without filesystem sync
- Written by session-persistence subscriber

**Session metrics aggregation**:

- `session-metrics.json` aggregated by session-persistence subscriber
- Consumes `token_usage` events from event bus
- Updates models[] and session_totals
- Sole writer to session-metrics.json (atomic writes)

## Data Contracts

### Tool Event Schemas

Tool events extend `BaseEvent` and include normalized fields:

- `tool_call`: tool_use_id, tool_name, tool_input, provider_format
- `tool_result`: tool_use_id, tool_name, tool_output, is_error, execution_duration_ms, provider_format

### Routing Event Schemas

Routing events extend `BaseEvent`:

- `routing_decision`: routing_type, provider, model, provider_chain, rule_matched
- `fallback_attempt`: attempt_index, provider, reason, retry_count, backoff_ms
- `fallback_success`: successful_provider, attempt_index
- `fallback_exhausted`: all_errors
- `provider_selection`: selection_reason, provider
- `catalog_resolution`: input_model, provider, status, resolved_model_id, context_window

### Token Usage Schema

```json
{
  "event_type": "token_usage",
  "model_id": string,
  "input_tokens": integer,
  "output_tokens": integer,
  "cache_creation_input_tokens": integer,
  "cache_read_input_tokens": integer
}
```

### Workflow Event Schemas

Workflow events extend `BaseEvent`:

- `workflow_start`: workflow_id, parent_workflow_id, agent_role, invocation_method, concurrency, blocking, agent_id, parent_agent_id
- `workflow_spawn`: workflow_id, parent_workflow_id, agent_role, invocation_method, concurrency, blocking, parallel_group_id, agent_id, parent_agent_id
- `workflow_complete`: workflow_id, duration_ms, tool_count, stop_reason, usage, agent_id

### Session Metrics Schema

```json
{
  "models": {
    "<model_id>": {
      "count": integer,
      "input_tokens": integer,
      "output_tokens": integer,
      "cache_creation_input_tokens": integer,
      "cache_read_input_tokens": integer,
      "cache_efficiency": number | null
    }
  },
  "session_totals": {
    "input_tokens": integer,
    "output_tokens": integer,
    "cache_creation_input_tokens": integer,
    "cache_read_input_tokens": integer,
    "total_steps": integer
  }
}
```

## Risks and Mitigations

| Risk                                       | Mitigation                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Tool normalization fails                   | Raw events always captured; normalization_failure event with snapshot |
| Routing events flood event bus             | Events are low-volume (one per request)                               |
| Token usage missing from provider          | Normalize missing fields to 0; log warning                            |
| Workflow tracking misidentifies sub-agents | Header-based identity is ground-truth (v2.1.139+)                     |
| Session persistence file errors            | Fire-and-forget error handling; buffer overflow handling              |
| SSE reconstruction ordering errors         | Monotonic sequence numbers guarantee deterministic ordering           |

## References

- Baseline specs: `docs/migration/smart-work-gateway-migration/specs/tool-execution-tracking/spec.md`
- Baseline specs: `docs/migration/smart-work-gateway-migration/specs/routing-traceability/spec.md`
- Baseline specs: `docs/migration/smart-work-gateway-migration/specs/token-usage-tracking/spec.md`
- Baseline specs: `docs/migration/smart-work-gateway-migration/specs/workflow-tracking/spec.md`
- Baseline specs: `docs/migration/smart-work-gateway-migration/specs/session-persistence/spec.md`
- Phase 0 specs: `migration-framework`, `error-handling-policy`, `lifecycle-hooks`, `session-management`, `event-schema-validation`
- Phase 1 specs: `event-bus`, `stream-event-emitter`, `telemetry-export`, `request-observability`

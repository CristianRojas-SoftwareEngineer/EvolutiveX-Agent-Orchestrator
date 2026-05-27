## ADDED Requirements

### Requirement: Capture token usage per request
The system SHALL capture token usage data for every request step and emit it as a structured `token_usage` event to the event bus.

#### Scenario: Token usage event emission
- **WHEN** a streaming response completes (message_stop received)
- **THEN** system emits a `token_usage` event extending BaseEvent with the following fields:
  - `model_id`: string — the exact model identifier as reported by the upstream provider
  - `input_tokens`: integer — regular input tokens for this step
  - `output_tokens`: integer — output tokens generated for this step
  - `cache_creation_input_tokens`: integer — tokens written to the prompt cache for this step (0 if none)
  - `cache_read_input_tokens`: integer — tokens read from the prompt cache for this step (0 if none)
- **AND** conforms to the following schema:
  ```json
  {
    "type": "object",
    "properties": {
      "event_type": { "type": "string", "const": "token_usage" },
      "timestamp": { "type": "string", "format": "date-time" },
      "request_id": { "type": "string", "format": "uuid" },
      "workflow_id": { "type": "string", "format": "uuid" },
      "session_id": { "type": "string" },
      "schema_version": { "type": "string", "const": "1.0.0" },
      "model_id": { "type": "string" },
      "input_tokens": { "type": "integer" },
      "output_tokens": { "type": "integer" },
      "cache_creation_input_tokens": { "type": "integer" },
      "cache_read_input_tokens": { "type": "integer" }
    },
    "required": ["event_type", "timestamp", "request_id", "workflow_id", "session_id", "schema_version", "model_id", "input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
  }
  ```
- **AND** all four token fields are required; missing values from the provider are normalized to 0
- **AND** `model_id` uses the exact string returned by the provider (e.g., `claude-opus-4-5-20251101`), not a normalized alias

#### Scenario: Token usage for non-streaming responses
- **WHEN** a non-streaming (batch) response is received
- **THEN** system emits a `token_usage` event with the same fields extracted from the response body's `usage` object
- **AND** the event is emitted after the response body is fully parsed

#### Scenario: Token usage when provider omits usage fields
- **WHEN** an upstream provider returns a response without token usage data
- **THEN** system emits a `token_usage` event with all token fields set to 0
- **AND** system logs a `token_usage_missing` warning with `model_id` and `request_id` for diagnostic purposes
- **AND** the missing data does not block request processing or session persistence

---

### Requirement: Define per-model token aggregation schema
The system SHALL define the per-model token aggregation schema that `session-persistence` consumes from `token_usage` events to update `session-metrics.json`.

#### Scenario: token_usage event consumed by session-persistence
- **WHEN** a `token_usage` event is emitted to the event bus
- **THEN** the `session-persistence` subscriber consumes the event
- **AND** reads the current `sessions/<session-id>/session-metrics.json`
- **AND** looks up `session-metrics.json.models[model_id]` (the exact `model_id` from the event)
- **AND** if the entry does not exist, initializes it with all counters at 0
- **AND** increments the following fields in the entry:
  - `count` += 1
  - `input_tokens` += `input_tokens`
  - `output_tokens` += `output_tokens`
  - `cache_creation_input_tokens` += `cache_creation_input_tokens`
  - `cache_read_input_tokens` += `cache_read_input_tokens`
- **AND** writes the updated `session-metrics.json` atomically (write to temp file, then rename)
- **AND** `session-persistence` is the sole component authorized to write `session-metrics.json`

#### Scenario: Per-model entry schema
- **WHEN** `session-metrics.json.models[model_id]` is written
- **THEN** each entry conforms to the following schema:
  ```json
  {
    "count": { "type": "integer", "description": "Number of steps that contributed tokens for this model" },
    "input_tokens": { "type": "integer" },
    "output_tokens": { "type": "integer" },
    "cache_creation_input_tokens": { "type": "integer" },
    "cache_read_input_tokens": { "type": "integer" },
    "cache_efficiency": {
      "anyOf": [
        { "type": "number", "minimum": 0.0, "maximum": 1.0 },
        { "type": "null" }
      ],
      "description": "cache_read_input_tokens / (cache_read_input_tokens + input_tokens); null when denominator is 0"
    }
  }
  ```
- **AND** `count` represents the number of steps (not requests) that contributed token data for that model ID
- **AND** `model_id` is used as the key without normalization so that different API versions of the same model (e.g., `claude-sonnet-4-6` vs `claude-sonnet-4-6-20260901`) are tracked separately

#### Scenario: token_usage event emission failure
- **WHEN** the `token_usage` event fails to be emitted to the event bus (e.g., subscriber error, event bus disabled)
- **THEN** system logs `token_usage_emission_error` with `session_id` and error details
- **AND** request processing continues without interruption
- **AND** the missing token data for that step is not recoverable; the step is skipped in aggregation

---

### Requirement: Define cache efficiency calculation
The system SHALL define the cache efficiency formula that `session-persistence` applies when updating `session-metrics.json`.

#### Scenario: Cache efficiency calculation
- **WHEN** `session-persistence` updates `session-metrics.json` after consuming a `token_usage` event
- **THEN** for each model entry in `session-metrics.json.models`, it calculates:
  - `cache_efficiency` = `cache_read_input_tokens / (cache_read_input_tokens + input_tokens)`
  - When `(cache_read_input_tokens + input_tokens)` equals 0, `cache_efficiency` is set to `null` (not 0) to indicate insufficient data
- **AND** `cache_efficiency` is stored as a float in `[0.0, 1.0]` or `null`
- **AND** `session-persistence` updates this field on every write, not only at session end

#### Scenario: Cache efficiency schema
- **WHEN** `session-metrics.json.models[model_id]` is written
- **THEN** the entry includes a `cache_efficiency` field:
  ```json
  {
    "cache_efficiency": {
      "anyOf": [
        { "type": "number", "minimum": 0.0, "maximum": 1.0 },
        { "type": "null" }
      ],
      "description": "cache_read_input_tokens / (cache_read_input_tokens + input_tokens); null when denominator is 0"
    }
  }
  ```

#### Scenario: Cache efficiency across sub-agents
- **WHEN** multiple workflows (root agent and sub-agents) use the same model ID within a session
- **THEN** the cache efficiency is calculated over the combined token totals for that model across all workflows
- **AND** per-workflow breakdown is available via individual step `token_usage` events in `events.ndjson`

---

### Requirement: Define session-level token totals schema
The system SHALL define the `session_totals` schema that `session-persistence` computes and writes to `session-metrics.json` by summing across all model entries.

#### Scenario: Session totals calculation
- **WHEN** `session-persistence` updates `session-metrics.json`
- **THEN** it computes `session_totals` by summing all model entries:
  - `session_totals.input_tokens` = sum of `models[*].input_tokens`
  - `session_totals.output_tokens` = sum of `models[*].output_tokens`
  - `session_totals.cache_creation_input_tokens` = sum of `models[*].cache_creation_input_tokens`
  - `session_totals.cache_read_input_tokens` = sum of `models[*].cache_read_input_tokens`
  - `session_totals.total_steps` = sum of `models[*].count`
- **AND** `session_totals` is always recomputed from the model entries on each write (never accumulated separately)

#### Scenario: Session totals schema
- **WHEN** `session-metrics.json` is written
- **THEN** the top-level structure includes a `session_totals` field:
  ```json
  {
    "session_totals": {
      "type": "object",
      "properties": {
        "input_tokens": { "type": "integer" },
        "output_tokens": { "type": "integer" },
        "cache_creation_input_tokens": { "type": "integer" },
        "cache_read_input_tokens": { "type": "integer" },
        "total_steps": { "type": "integer" }
      },
      "required": ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "total_steps"]
    },
    "duration_ms": { "type": "integer", "description": "Time from session_start to session_complete" },
    "outcome": { "type": "string", "enum": ["success", "failure", "timeout"] }
  }
  ```
- **AND** `session_totals` is derived from `models` and is never stored independently; readers SHOULD treat `models` as the source of truth

#### Scenario: Empty session totals
- **WHEN** a session has no completed steps with token data
- **THEN** `session_totals` contains all fields set to 0
- **AND** `models` is an empty object `{}`

#### Complete session-metrics.json schema

The following JSON Schema defines the complete top-level structure of `session-metrics.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "models": {
      "type": "object",
      "patternProperties": {
        "^[\\s\\S]+$": {
          "type": "object",
          "properties": {
            "count": { "type": "integer" },
            "input_tokens": { "type": "integer" },
            "output_tokens": { "type": "integer" },
            "cache_creation_input_tokens": { "type": "integer" },
            "cache_read_input_tokens": { "type": "integer" },
            "cache_efficiency": {
              "anyOf": [
                { "type": "number", "minimum": 0.0, "maximum": 1.0 },
                { "type": "null" }
              ]
            }
          },
          "required": ["count", "input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "cache_efficiency"]
        }
      }
    },
    "session_totals": {
      "type": "object",
      "properties": {
        "input_tokens": { "type": "integer" },
        "output_tokens": { "type": "integer" },
        "cache_creation_input_tokens": { "type": "integer" },
        "cache_read_input_tokens": { "type": "integer" },
        "total_steps": { "type": "integer" }
      },
      "required": ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "total_steps"]
    },
    "duration_ms": { "type": "integer" },
    "outcome": { "type": "string", "enum": ["success", "failure", "timeout"] }
  },
  "required": ["models", "session_totals", "duration_ms", "outcome"]
}
```

---

### Requirement: Define token fields for session-metrics.json consumption
The `token_usage` event SHALL include all fields required for `session-persistence` to update `session-metrics.json`.

#### Scenario: token_usage event schema for downstream aggregation
- **WHEN** a `token_usage` event is emitted
- **THEN** it includes the following fields consumed by `session-persistence`:
  - `session_id`: string — identifies the session to update
  - `request_id`: string — identifies the step (for deduplication if needed)
  - `model_id`: string — key for `models[model_id]` entry
  - `input_tokens`: integer
  - `output_tokens`: integer
  - `cache_creation_input_tokens`: integer
  - `cache_read_input_tokens`: integer
- **AND** missing values are normalized to 0 before emission
- **AND** the event is emitted after the response is fully parsed but before request processing completes

## Dependencies

- **Hard dependencies on Phase 0**:
  - `migration-framework`: Feature flag to enable/disable token usage tracking
  - `error-handling-policy`: Fire-and-forget error handling for emission failures
  - `lifecycle-hooks`: Hooks for token event emission
  - `session-management`: Session ID for correlation
  - `event-schema-validation`: Schema validation before emission

- **Hard dependencies on Phase 1**:
  - `event-bus`: Async emission and subscriber delivery

- **Soft dependencies on Phase 1**:
  - `request-observability`: Reads model_id from request context populated by request-observability
  - `telemetry-export`: File backend for token event persistence (producer-consumer pattern via event bus)

- **Soft dependencies on Phase 2**:
  - `session-persistence`: Consumes token_usage events to update session-metrics.json (producer-consumer pattern via event bus; no structural import dependency)

## Explicit Exclusions

The following features are **not** in Phase 2 and are deferred to Phase 3:

- **GUI token usage charts and filters**: Grouped bar chart for model/slot token breakdown, filtering by session_id and date range → See `3-observability-interface-phase/specs/observability-gui/spec.md`

Phase 2 defines the token usage event schema and aggregation logic. GUI-specific visualization features are deferred to Phase 3.

## References

- Baseline spec: `docs/migration/smart-work-gateway-migration/specs/token-usage-tracking/spec.md`
- Phase 0 specs: `migration-framework`, `error-handling-policy`, `lifecycle-hooks`, `session-management`, `event-schema-validation`
- Phase 1 specs: `event-bus`, `request-observability`, `telemetry-export`
- Phase 2 spec: `session-persistence`
- Phase 3 spec: `observability-gui`

## ADDED Requirements

### Requirement: Log routing decisions

The system SHALL log routing decisions including provider selection and model resolution.

#### Scenario: Explicit provider routing

- **WHEN** user specifies explicit provider (e.g., google@model)
- **THEN** system logs routing_decision event with routing_type="explicit", provider, and model

#### Scenario: Auto-routing

- **WHEN** system auto-routes based on model name
- **THEN** system logs routing_decision event with routing_type="auto", original_model, and resolved_provider

#### Scenario: Model mapping routing

- **WHEN** model is routed via role mapping (opus/sonnet/haiku)
- **THEN** system logs routing_decision event with routing_type="mapped", agent_role, and target_model

### Requirement: Log fallback chains

The system SHALL log the complete fallback chain when routing uses multiple providers. The provider chain is included as a field in the routing_decision event rather than emitted as a separate event.

#### Scenario: Fallback attempt

- **WHEN** a provider in the fallback chain is attempted
- **THEN** system logs fallback_attempt event with attempt_index, provider, and reason

#### Scenario: Fallback success

- **WHEN** a provider in the fallback chain succeeds
- **THEN** system logs fallback_success event with successful_provider and attempt_index

#### Scenario: Fallback exhausted

- **WHEN** all providers in fallback chain fail
- **THEN** system logs fallback_exhausted event with all_errors

### Requirement: Log provider selection criteria

The system SHALL log the criteria used for provider selection.

#### Scenario: Provider selected by API key

- **WHEN** provider is selected based on available API key
- **THEN** system logs provider_selection event with selection_reason="api_key_available"

#### Scenario: Provider selected by routing rules

- **WHEN** provider is selected by routing rules
- **THEN** system logs provider_selection event with selection_reason="routing_rule"

#### Scenario: Provider selected by default

- **WHEN** provider is selected as default fallback
- **THEN** system logs provider_selection event with selection_reason="default"

### Requirement: Log catalog resolution

The system SHALL log model catalog resolution events for vendor prefix resolution as a single consolidated event.

#### Scenario: Catalog resolution

- **WHEN** the proxy maps a user-typed model name to a provider's catalog (e.g., OpenRouter vendor prefix resolution)
- **THEN** system logs catalog_resolution event with input_model, provider, and status ("started" | "resolved" | "failed")
- **AND** when status is "resolved", includes resolved_model_id and context_window
- **AND** when status is "failed", includes error_reason

### Requirement: Define routing event schemas

The system SHALL define JSON schemas for all routing-related telemetry events. Each schema extends BaseEvent.

#### Scenario: routing_decision schema

- **WHEN** a routing_decision event is emitted
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "type": "object",
    "properties": {
      "event_type": { "type": "string", "const": "routing_decision" },
      "request_id": { "type": "string", "format": "uuid" },
      "session_id": { "type": "string" },
      "workflow_id": { "type": "string", "format": "uuid" },
      "routing_type": { "type": "string", "enum": ["explicit", "auto", "mapped"] },
      "provider": { "type": "string" },
      "model": { "type": "string" },
      "original_model": { "type": "string" },
      "resolved_provider": { "type": "string" },
      "agent_role": { "type": "string" },
      "target_model": { "type": "string" },
      "provider_chain": { "type": "array", "items": { "type": "string" } },
      "rule_matched": { "type": "boolean" },
      "rule_pattern": { "type": "string" },
      "rule_priority": { "type": "number" }
    },
    "required": [
      "event_type",
      "timestamp",
      "request_id",
      "workflow_id",
      "session_id",
      "schema_version",
      "routing_type"
    ]
  }
  ```

#### Scenario: fallback_attempt schema

- **WHEN** a fallback_attempt event is emitted
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "type": "object",
    "properties": {
      "event_type": { "type": "string", "const": "fallback_attempt" },
      "timestamp": { "type": "string", "format": "date-time" },
      "request_id": { "type": "string", "format": "uuid" },
      "session_id": { "type": "string" },
      "workflow_id": { "type": "string", "format": "uuid" },
      "schema_version": { "type": "string", "const": "1.0.0" },
      "attempt_index": { "type": "number" },
      "provider": { "type": "string" },
      "reason": { "type": "string" },
      "retry_count": { "type": "number" },
      "backoff_ms": { "type": "number" }
    },
    "required": [
      "event_type",
      "timestamp",
      "request_id",
      "workflow_id",
      "session_id",
      "schema_version",
      "attempt_index",
      "provider"
    ]
  }
  ```

#### Scenario: fallback_success schema

- **WHEN** a fallback_success event is emitted
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "type": "object",
    "properties": {
      "event_type": { "type": "string", "const": "fallback_success" },
      "timestamp": { "type": "string", "format": "date-time" },
      "request_id": { "type": "string", "format": "uuid" },
      "session_id": { "type": "string" },
      "workflow_id": { "type": "string", "format": "uuid" },
      "schema_version": { "type": "string", "const": "1.0.0" },
      "successful_provider": { "type": "string" },
      "attempt_index": { "type": "number" }
    },
    "required": [
      "event_type",
      "timestamp",
      "request_id",
      "workflow_id",
      "session_id",
      "schema_version",
      "successful_provider",
      "attempt_index"
    ]
  }
  ```

#### Scenario: fallback_exhausted schema

- **WHEN** a fallback_exhausted event is emitted
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "type": "object",
    "properties": {
      "event_type": { "type": "string", "const": "fallback_exhausted" },
      "timestamp": { "type": "string", "format": "date-time" },
      "request_id": { "type": "string", "format": "uuid" },
      "session_id": { "type": "string" },
      "workflow_id": { "type": "string", "format": "uuid" },
      "schema_version": { "type": "string", "const": "1.0.0" },
      "all_errors": { "type": "array", "items": { "type": "string" } }
    },
    "required": [
      "event_type",
      "timestamp",
      "request_id",
      "workflow_id",
      "session_id",
      "schema_version",
      "all_errors"
    ]
  }
  ```

#### Scenario: provider_selection schema

- **WHEN** a provider_selection event is emitted
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "type": "object",
    "properties": {
      "event_type": { "type": "string", "const": "provider_selection" },
      "timestamp": { "type": "string", "format": "date-time" },
      "request_id": { "type": "string", "format": "uuid" },
      "session_id": { "type": "string" },
      "workflow_id": { "type": "string", "format": "uuid" },
      "schema_version": { "type": "string", "const": "1.0.0" },
      "selection_reason": {
        "type": "string",
        "enum": ["api_key_available", "routing_rule", "default"]
      },
      "provider": { "type": "string" }
    },
    "required": [
      "event_type",
      "timestamp",
      "request_id",
      "workflow_id",
      "session_id",
      "schema_version",
      "selection_reason"
    ]
  }
  ```

#### Scenario: catalog_resolution schema

- **WHEN** a catalog_resolution event is emitted
- **THEN** the event conforms to the following schema (extends BaseEvent):
  ```json
  {
    "type": "object",
    "properties": {
      "event_type": { "type": "string", "const": "catalog_resolution" },
      "timestamp": { "type": "string", "format": "date-time" },
      "request_id": { "type": "string", "format": "uuid" },
      "session_id": { "type": "string" },
      "workflow_id": { "type": "string", "format": "uuid" },
      "schema_version": { "type": "string", "const": "1.0.0" },
      "input_model": { "type": "string" },
      "provider": { "type": "string" },
      "status": { "type": "string", "enum": ["started", "resolved", "failed"] },
      "resolved_model_id": { "type": "string" },
      "context_window": { "type": "number" },
      "error_reason": { "type": "string" }
    },
    "required": [
      "event_type",
      "timestamp",
      "request_id",
      "workflow_id",
      "session_id",
      "schema_version",
      "input_model",
      "provider",
      "status"
    ]
  }
  ```
- **AND** `resolved_model_id` and `context_window` are populated only when `status` is "resolved"
- **AND** `error_reason` is populated only when `status` is "failed"

## Dependencies

- **Hard dependencies on Phase 0**:
  - `migration-framework`: Feature flag to enable/disable routing traceability
  - `error-handling-policy`: Fire-and-forget error handling for emission failures
  - `lifecycle-hooks`: Hooks for routing event emission
  - `event-schema-validation`: Schema validation before emission

- **Hard dependencies on Phase 1**:
  - `event-bus`: Async emission and subscriber delivery
  - `telemetry-export`: File backend for routing event persistence

- **Soft dependencies**: None

## Explicit Exclusions

None. All routing traceability functionality is in Phase 2.

## References

- Baseline spec: `docs/migration/smart-work-gateway-migration/specs/routing-traceability/spec.md`
- Phase 0 specs: `migration-framework`, `error-handling-policy`, `lifecycle-hooks`, `event-schema-validation`
- Phase 1 specs: `event-bus`, `telemetry-export`

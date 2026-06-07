# Phase 2: Core Observability

## Why

Phase 1 established the foundational telemetry infrastructure (event bus, stream emitter, file backend, request observability). Phase 2 adds the core observability capabilities that make the telemetry useful for debugging complex workflows and understanding system behavior:

- Tool execution tracking per agent/session
- Routing decision visibility with fallback chains
- Token usage tracking with cache efficiency metrics
- Workflow tracking for sub-agent hierarchies and execution modes
- Session persistence with hybrid event + file storage

These capabilities provide complete forensics for debugging without requiring GUI or APIs. A developer can debug a session entirely from local files and telemetry events.

## What Changes

- Implement tool execution tracking with normalized provider formats
- Add routing traceability with fallback chain visibility
- Implement token usage tracking with per-model aggregation
- Add workflow tracking with sub-agent execution mode inference
- Implement session persistence with hybrid event + file storage
- Add SSE reconstruction service for deterministic event ordering
- Implement session metrics aggregation

## Capabilities

### New Capabilities

- `tool-execution-tracking`: Track tool calls/results/errors per agent/session with normalized provider formats (Anthropic, OpenAI, Gemini, Ollama)
- `routing-traceability`: Log routing decisions, provider selections, fallback chains, retry attempts, and catalog resolution
- `token-usage-tracking`: Track token usage per request with cache efficiency metrics and per-model aggregation
- `workflow-tracking`: Track sub-agent workflows with parent-child relationships, execution modes (foreground/background, parallel/sequential), and direct sub-agent completion observation
- `session-persistence`: Hybrid persistence model combining async event bus (real-time) with file-based storage (forensics), SSE reconstruction, and session metrics aggregation

### Dependencies on Phase 0

- `migration-framework`: Feature flags enable/disable Phase 2 capabilities
- `error-handling-policy`: All Phase 2 errors are fire-and-forget
- `lifecycle-hooks`: Hooks for Phase 2 emission points
- `session-management`: Session ID and sub-agent identification for correlation
- `event-schema-validation`: Schema validation before emission

### Dependencies on Phase 1

- `event-bus`: Async emission and subscriber delivery for all Phase 2 events
- `stream-event-emitter`: Dual emission interface for tool and streaming events
- `telemetry-export`: File backend for session persistence
- `request-observability`: Request ID, sub-agent detection, streaming events for Phase 2 correlation

### Explicit Exclusions

The following features are **not** in Phase 2 and are deferred to later phases:

- WebSocket endpoint → Phase 3
- Historical API → Phase 3
- Observability GUI → Phase 3
- GUI-specific token usage charts and filters → Phase 3
- Advanced Agent coalescing (foreground/background/parallel/sequential) → Phase 4
- Session file retention policy → Phase 4

## Dependencies

### Hard Dependencies on Phase 0

- `migration-framework`: Feature flags required to enable/disable Phase 2 capabilities
- `error-handling-policy`: Fire-and-forget error handling required for zero latency impact
- `lifecycle-hooks`: Hooks required for Phase 2 emission points
- `session-management`: Session ID required for event correlation, sub-agent identification
- `event-schema-validation`: Schema validation required before emission

### Hard Dependencies on Phase 1

- `event-bus`: Async emission required for all Phase 2 events
- `stream-event-emitter`: Dual emission required for tool events
- `telemetry-export`: File backend required for session persistence
- `request-observability`: Request ID and sub-agent detection required for Phase 2 correlation

### Soft Dependencies

None. Phase 2 has no soft dependencies on other phases.

### Dependency Contract

Phase 2 provides the following contracts to subsequent phases:

- **Tool execution tracking**: Tool call/result/error events with normalized formats
- **Routing traceability**: Routing decision, fallback, and catalog resolution events
- **Token usage tracking**: Token usage events with cache efficiency metrics
- **Workflow tracking**: Workflow hierarchy, execution modes, and sub-agent events
- **Session persistence**: File-based forensics with SSE reconstruction and session metrics

## Impact

- **Code**: New modules for tool tracking, routing tracing, token tracking, workflow tracking, session persistence
- **Configuration**: CLAUDISH*TELEMETRY*\* environment variables for Phase 2 capabilities, CLAUDISH_TELEMETRY_SESSION_DIR
- **Performance**: Minimal overhead when disabled; async emission ensures zero latency impact when enabled
- **Compatibility**: Fully backward compatible when all features disabled
- **Dependencies**: No new external dependencies
- **Deployment**: Can be deployed independently; produces complete local forensics without GUI/API

## Exit Criteria

- Tool execution tracking captures tool calls/results/errors with normalized formats
- Routing traceability logs routing decisions and fallback chains
- Token usage tracking captures token usage with cache efficiency
- Workflow tracking tracks sub-agent hierarchies and execution modes
- Session persistence writes events and SSE reconstructions to local files
- Session metrics aggregation produces session-metrics.json
- All Phase 2 specs implemented with unit tests
- Backward compatibility verified with all flags disabled
- A developer can debug a session entirely from local files without GUI/API

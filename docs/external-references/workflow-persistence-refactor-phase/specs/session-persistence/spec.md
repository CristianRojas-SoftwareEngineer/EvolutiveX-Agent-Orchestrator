## ADDED Requirements

### Requirement: Define persistence responsibilities for session_id lifecycle
The system SHALL use the canonical session_id produced by Phase 0 session-management as the storage identifier for session persistence, while applying filesystem-safe sanitization as a defense-in-depth control.

#### Scenario: Session_id resolution for persistence
- **WHEN** a request reaches session persistence
- **THEN** system uses the canonical `session_id` resolved by Phase 0 session-management from the `x-claude-session-id` header or generated fallback
- **AND** if the header was absent, the fallback UUID session_id is used for the session directory
- **AND** the fallback path logs `session_id_generated_fallback` with the generated session_id and request path
- **AND** the corresponding `session_start` metadata includes `source="generated_fallback"`
- **AND** session_id groups all interactions within the Claude Code session and remains constant for that session

#### Scenario: Session_id filesystem sanitization
- **WHEN** session_id reaches session-persistence after boundary validation in session-management
- **THEN** system sanitizes the value for safe filesystem use as a defense-in-depth control
- **AND** removes invalid characters: `< > : " / \ | ? *` and control characters
- **AND** replaces invalid characters with underscore (`_`)
- **AND** limits the sanitized value to 128 characters
- **AND** uses the sanitized value for all filesystem paths under `sessions/<session-id>/`
- **AND** logs `sanitizer_applied` warning if the value was changed by sanitization
- **AND** this sanitization does not replace Phase 0 boundary validation; IDs that fail boundary validation are rejected before reaching session-persistence

#### Scenario: Session header stripping before upstream
- **WHEN** session_id is resolved from the `x-claude-session-id` header
- **THEN** system relies on Phase 0 `session-management` to strip the `x-claude-session-id` header before forwarding the request upstream (see `0-foundation-phase/specs/session-management/spec.md`)
- **AND** Phase 2 session-persistence does not re-implement header stripping

### Requirement: Implement hybrid persistence model
The system SHALL implement a hybrid persistence model combining async event bus (real-time) with file-based storage (forensics) to support both interactive debugging and post-mortem analysis.

#### Scenario: Subscribe to event bus and implement independent file writer
- **WHEN** session persistence initializes
- **THEN** it registers as a subscriber to the event bus (Phase 1)
- **AND** implements its own filesystem writer for the `sessions/` directory independently of Phase 1 telemetry-export
- **AND** session-persistence consumes events from the event bus and writes session files directly rather than re-implementing event bus core logic

### Requirement: Define session directory structure
The system SHALL define a structured directory layout for session persistence.

#### Scenario: Session directory layout
- **WHEN** a session is created
- **THEN** the system creates the following directory structure:
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
              request/body.json
              response/
                normalized/sse.ndjson
                raw/sse.ndjson (when CAPTURE_RAW=true)
                body.json
    side-interactions/
      NN/
        meta.json
        steps/
  ```
- **AND** NN is a zero-padded sequential number (00, 01, 02, etc.)

### Requirement: Define interaction and step concepts
The system SHALL define the concepts of interaction, step, and side interaction.

#### Scenario: Interaction definition
- **WHEN** the system processes a request
- **THEN** an interaction represents a complete request-response cycle from the main agent
- **AND** each interaction has a unique sequential number
- **AND** interactions contain one or more steps (agentic loop iterations)

#### Scenario: Step definition
- **WHEN** an agentic loop iteration occurs (stop_reason="tool_use")
- **THEN** a step represents one iteration of the loop
- **AND** each step has a unique sequential number within the interaction
- **AND** steps contain the request and response for that iteration

#### Scenario: Side interaction definition
- **WHEN** a request arrives with a URL path other than `/v1/messages`
- **THEN** a side interaction is created in the side-interactions/ directory
- **AND** excludes proxy-native endpoints from classification: `/hooks/*`, `/observability*`, `/ws/*`, `/api/*`, `/migration/*`
- **AND** side interactions have their own metadata and steps
- **AND** side interactions do not create main-agent input/output body.json for non-request side interactions
- **AND** requests to `/v1/messages` are always classified as main-agent interactions

### Requirement: Implement SSE reconstruction service
The system SHALL implement SSE reconstruction service that writes SSE events to sse.ndjson with monotonic sequence numbers for deterministic ordering.

#### Scenario: SSE reconstruction
- **WHEN** a streaming response completes
- **THEN** the SSE reconstruction service writes all SSE events to response/normalized/sse.ndjson
- **AND** each line is a JSON object with sequence number and event data
- **AND** sequence numbers are monotonic (0, 1, 2, ...)
- **AND** this enables deterministic event ordering without filesystem sync

#### Scenario: Raw SSE reconstruction
- **WHEN** CLAUDISH_TELEMETRY_CAPTURE_RAW is true (configuration owned by Phase 1 telemetry-export; session-persistence reads this from the global config object without redefining the flag)
- **THEN** the SSE reconstruction service also writes raw upstream events to response/raw/sse.ndjson
- **AND** raw events preserve provider-native structure

> **Scope note:** The `response/raw/sse.ndjson` and `response/normalized/sse.ndjson` files written here are per-session, per-step SSE reconstruction files for session replay and GUI display. They are distinct from the global forensic files (`raw/`, `normalized/`) managed by Phase 1 telemetry-export for system-wide event storage.

### Requirement: Implement session metrics aggregation
The system SHALL implement session metrics aggregation that consumes token_usage events and updates session-metrics.json.

#### Scenario: Session metrics aggregation
- **WHEN** a token_usage event is emitted to the event bus
- **THEN** the session-persistence subscriber consumes the event
- **AND** reads sessions/<session-id>/session-metrics.json
- **AND** looks up models[model_id] entry
- **AND** increments count, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens
- **AND** recalculates cache_efficiency
- **AND** recalculates session_totals by summing all model entries
- **AND** writes the updated session-metrics.json atomically (write to temp file, then rename)

#### Scenario: Session metrics schema
- **WHEN** session-metrics.json is written
- **THEN** it conforms to the schema defined in token-usage-tracking spec
- **AND** includes models[] object with per-model entries
- **AND** includes session_totals object with summed totals
- **AND** includes session-level `duration_ms` (integer, time from session_start to session_complete) and `outcome` (string, enum: ["success", "failure", "timeout"])
- **AND** session-persistence is the sole writer to session-metrics.json

#### Scenario: session_complete enrichment by workflow tracking
- **WHEN** a session completes and Phase 2 workflow-tracking is active
- **THEN** the session-persistence subscriber consumes the `session_complete` event from the event bus
- **AND** if `total_workflows` is absent or null, enriches it with the count of workflows tracked for that session
- **AND** the enriched `session_complete` event is persisted to `events.ndjson`
- **AND** if workflow-tracking is disabled, `total_workflows` remains optional/null

### Requirement: Implement graceful shutdown with orphan cleanup
The system SHALL implement graceful shutdown that flushes pending file backend buffers and cleans up orphan interactions on startup. Phase 2 owns signal receipt, file buffer flush, and exit codes. Phase 4 owns HTTP request drain and WebSocket close coordination.

#### Scenario: Graceful shutdown
- **WHEN** the system receives SIGTERM or SIGINT
- **THEN** delegates to Phase 4 graceful-shutdown to stop accepting new HTTP requests and wait for in-flight requests to complete
- **AND** after HTTP drain completes, the file backend flushes all pending buffers to disk
- **AND** waits up to configured flush_timeout_ms
- **AND** if flush timeout expires, logs which files were not fully written
- **AND** exits with code 0 if all buffers flushed successfully, code 1 otherwise
- **AND** Phase 4 closes all WebSocket connections with a close frame indicating shutdown

#### Scenario: Orphan interaction detection on startup
- **WHEN** the system starts
- **THEN** the system scans the sessions/ directory for orphan interactions
- **THEN** identifies orphan interactions by the presence of an open state.json marker file
- **AND** logs orphan interactions for manual inspection
- **AND** does not delete orphan data automatically

> **Ownership boundary:** Phase 2 owns SIGTERM/SIGINT signal handling, `flush_timeout_ms`, exit codes 0/1, and orphan interaction detection on startup. Phase 4 (`graceful-shutdown`) owns system-wide shutdown coordination (stopping new HTTP requests, draining in-flight requests, WebSocket connection close with code 1001, and session file retention policy). Phase 2 performs the final file backend buffer flush after Phase 4's HTTP drain completes. These scopes are complementary and non-overlapping.

### Requirement: Implement body.json generation
The system SHALL generate body.json files containing semantic response body for each step.

#### Scenario: Simple step body.json
- **WHEN** a step does not spawn sub-agents
- **THEN** body.json contains the plain reconstructed Anthropic message
- **AND** includes content blocks, stop_reason, and usage

#### Scenario: Sub-agent step body.json
- **WHEN** a step spawns sub-agents
- **THEN** body.json contains a `coalesced_body` object conforming to the schema defined in `2-workflow-persistence-phase/specs/workflow-tracking/spec.md`
- **AND** includes execution_mode, phases[], workflow_id, agent_role, and blocks[] data required by the `coalesced_body` schema
- **AND** this structure enables GUI and Historical API consumers to display a unified sub-agent view

#### Scenario: MarkdownRendererService
- **WHEN** body.json is written
- **THEN** the MarkdownRendererService generates body.parsed.md as a read-only Markdown view
- **AND** formats content blocks with type-specific rendering
- **AND** provides forensic debugging without running the GUI

> **Sub-component note:** `MarkdownRendererService` is a sub-component of session-persistence, not a separate spec. It is implemented as part of this spec's body.json generation requirement and does not require its own coverage entry.

### Requirement: Implement anthropicMessageId correlation
The system SHALL capture the Anthropic message.id from the first SSE message_start event to enable correlation with Claude Code logs.

#### Scenario: Anthropic message ID capture
- **WHEN** a streaming response from Anthropic begins
- **THEN** the system extracts message.id from the first message_start SSE event
- **AND** stores it as anthropicMessageId in the request context
- **AND** includes anthropicMessageId in meta.json for the step
- **AND** if the provider is not Anthropic, anthropicMessageId is omitted
- **AND** this ID is used to correlate proxy session data with Claude Code internal logs

### Requirement: Implement sub-agent response coalescing
The system SHALL coalesce sub-agent responses directly into the parent step's response directory rather than creating redundant physical subdirectories.

#### Scenario: Sub-agent physical storage elimination
- **WHEN** a step spawns sub-agents
- **THEN** the system coalesces sub-agent interactions directly into the parent step's `body.json` output
- **AND** does NOT create `sub-agent-NN/` subdirectories
- **AND** eliminates redundant "Step 2" folders to ensure a logically cohesive and human-readable audit trail
- **AND** this prevents filesystem depth limit issues inherently by flattening the directory structure

#### Scenario: Sub-agent overflow handling (Deprecated)
- **WHEN** a sub-agent executes
- **THEN** due to the coalescing architecture, nesting depth limitations (e.g., Windows `MAX_PATH` failures) are structurally prevented
- **AND** the system no longer needs a separate `overflow/` directory for sub-agents at depth > 5

### Requirement: Define session directory base path
The system SHALL define the base path for the `sessions/` directory via configuration.

#### Scenario: Session directory path
- **WHEN** `CLAUDISH_TELEMETRY_SESSION_DIR` is set
- **THEN** system uses the configured path as the base directory
- **AND** the default path is `~/.claudish/sessions/`
- **AND** the system creates the directory if it does not exist

### Requirement: Support per-backend feature toggles within validated dependency chains
The system SHALL allow independent configuration of event bus, file backend, and WebSocket backends, within the constraints of the Phase 0 compatibility matrix.

#### Scenario: Independent backend enable/disable
- **WHEN** backends are configured
- **THEN** each backend can be independently toggled via its own feature flag
- **AND** the Phase 0 compatibility matrix constraints still apply (e.g., file_backend requires telemetry enabled; websocket requires event_bus enabled)
- **AND** "independently toggled" means each backend has its own on/off switch, not that backends can operate without their declared Phase 0 dependencies
- **AND** event bus can be enabled while WebSocket is disabled
- **AND** file backend can be disabled while event bus is enabled
- **AND** this enables flexible deployment scenarios

## Dependencies

- **Hard dependencies on Phase 0**:
  - `migration-framework`: Feature flag to enable/disable session persistence
  - `error-handling-policy`: Fire-and-forget error handling for write failures
  - `lifecycle-hooks`: Hooks for session persistence initialization
  - `session-management`: Session ID and directory structure
  - `event-schema-validation`: Schema validation before writing

- **Hard dependencies on Phase 1**:
  - `event-bus`: Subscription to receive events for file backend

- **Soft dependencies on Phase 1**:
  - `request-observability`: Request ID, streaming events, anthropicMessageId (received via event bus and request context)

- **Hard dependencies on Phase 2**:
  - `workflow-tracking`: Workflow ID for sub-agent directory nesting

- **Soft dependencies on Phase 2**:
  - `token-usage-tracking`: Token usage events for session-metrics.json aggregation (producer-consumer pattern via event bus; no structural import dependency)

## Explicit Exclusions

The following features are **not** in Phase 2 and are deferred to Phase 4:

- **Advanced Agent coalescing**: Foreground/background/parallel/sequential coalescing with deferred continuations, pending_background_continuations map, deferred_continuations.ndjson → See `4-advanced-features-phase/specs/session-coalescing/spec.md`
- **Session file retention policy**: CLAUDISH_TELEMETRY_SESSION_RETENTION_DAYS configuration and background cleanup job → See `4-advanced-features-phase/specs/graceful-shutdown/spec.md`

Phase 2 implements the core session persistence structure and SSE reconstruction. Advanced coalescing and retention policy are deferred to Phase 4.

## References

- Baseline spec: `docs/migration/smart-work-gateway-migration/specs/session-persistence/spec.md`
- Phase 0 specs: `migration-framework`, `error-handling-policy`, `lifecycle-hooks`, `session-management`, `event-schema-validation`
- Phase 1 specs: `event-bus`, `telemetry-export`, `request-observability`
- Phase 2 specs: `workflow-tracking`, `token-usage-tracking`
- Phase 4 specs: `session-coalescing`, `graceful-shutdown`

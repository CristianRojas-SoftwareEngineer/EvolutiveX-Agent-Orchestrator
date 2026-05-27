# Phase 2 Tasks

## 1. Tool Execution Tracking

- [x] 1.1 Add tool_call event emission in stream parsers
- [x] 1.2 Add tool_result event emission in stream parsers
- [x] 1.3 Implement agent role tracking (opus/sonnet/haiku/subagent)
- [x] 1.4 Add session ID to tool events
- [x] 1.5 Implement tool execution duration measurement
- [x] 1.6 Add tool_error event emission
- [x] 1.7 Add tool timeout detection
- [x] 1.8 Implement tool input/output size tracking
- [x] 1.9 Ensure tool stats are computable from tool_call/tool_result events by consumers
- [x] 1.10 Write unit tests for tool tracking

## 2. Routing Traceability

- [x] 2.1 Add routing_decision event in getHandlerForRequest
- [x] 2.2 Add fallback_attempt event emission per routing-traceability spec schema
- [x] 2.3 Add fallback_success event in FallbackHandler
- [x] 2.4 Add fallback_exhausted event in FallbackHandler
- [x] 2.5 Add rule_matched, rule_pattern, rule_priority fields to routing_decision event
- [x] 2.6 Add provider_chain field to routing_decision event
- [x] 2.7 Add provider_selection event in provider resolver
- [x] 2.8 Implement consolidated catalog_resolution event with status field
- [x] 2.9 Write unit tests for routing traceability

## 3. Token Usage Tracking

- [x] 3.1 Implement token_usage event emission with input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens
- [x] 3.2 Add model/slot metadata to token_usage events (opus, sonnet, haiku)
- [x] 3.3 Add session_id to token_usage events for session-level aggregation
- [x] 3.4 Implement token usage capture on stream_complete event
- [x] 3.5 Implement cache creation breakdown (ephemeral_5m vs ephemeral_1h) tracking
- [x] 3.6 Define token_usage event schema with all fields required for session-level aggregation
- [x] 3.7 Define cache efficiency calculation formula
- [x] 3.8 Implement cache efficiency calculation per model/slot
- [x] 3.9 Write token usage tracking unit tests
- [x] 3.10 Write model/slot aggregation integration tests

## 4. Workflow Tracking

- [x] 4.1 Define workflow event schemas (workflow_start, workflow_spawn, workflow_complete)
- [x] 4.2 Implement WorkflowTracker subscriber (src/telemetry/workflow-tracker.ts)
- [x] 4.3 Implement workflow ID generation (UUID v4) with parent-child tracking
- [x] 4.4 Add workflow_start event emission in proxy-server.ts for root agent
- [x] 4.5 Implement WorkflowTracker consumption of header-based subagent_detected events
- [x] 4.6 Implement execution mode inference from parent stream deferred to message_stop
- [x] 4.7 Add workflow_complete event emission when workflow finishes
- [x] 4.8 Correlate tool events with workflow_id
- [x] 4.9 Implement workflow timing measurement (duration, background latency)
- [x] 4.10 Add workflow_error event emission for workflow failures
- [x] 4.11 Add agent_id and parent_agent_id fields to all workflow event schemas
- [x] 4.12 Write unit tests for workflow tracking
- [x] 4.13 Write integration tests for parallel workflows
- [x] 4.14 Write integration tests for background workflows
- [x] 4.15 Implement direct sub-agent workflow_complete observation
- [x] 4.16 Write integration tests for header-based sub-agent detection and direct workflow_complete observation

## 5. Session Persistence

- [x] 5.1 Implement dual pipeline emitter (event bus + file backend)
- [x] 5.2 Create session directory structure service (sessions/<session-id>/)
- [x] 5.3 Implement event bus async emitter with fire-and-forget semantics
- [x] 5.4 Implement file backend async writer with non-blocking writes
- [x] 5.5 Create SSE reconstruction service for deterministic event ordering
- [x] 5.6 Implement sse.ndjson async write with monotonic sequence numbers
- [x] 5.7 Implement dual stream persistence: response/raw/sse.ndjson and response/normalized/sse.ndjson
- [x] 5.8 Add CLAUDISH_TELEMETRY_CAPTURE_RAW configuration with default false
- [x] 5.9 Implement MarkdownRendererService to generate body.parsed.md from body.json
- [x] 5.10 Implement sub-agent response coalescing into parent step (eliminating sub-agent-NN/)
- [x] 5.11 Implement anthropicMessageId correlation with Claude Code logs
- [x] 5.12 Create session metrics aggregation service (session-metrics.json)
- [x] 5.13 Implement file backend buffer flush and orphan interaction cleanup on startup
- [x] 5.14 Add orphan interaction detection on startup
- [x] 5.15 Implement independent backend configuration (event bus, file, WebSocket)
- [x] 5.16 Add CLAUDISH_TELEMETRY_SESSION_DIR configuration
- [x] 5.17 Write file backend unit tests
- [x] 5.18 Write SSE reconstruction service tests
- [x] 5.19 Write session persistence E2E tests

## 6. Configuration

- [x] 6.1 Add session persistence configuration to config schema
- [x] 6.2 Add workflow tracking configuration to config schema
- [x] 6.3 Update CLAUDE.md with new configuration options
- [x] 6.4 Add configuration validation tests
- [x] 6.5 Create example config files with new options

## 7. Testing

- [x] 7.1 Add end-to-end test with Phase 2 capabilities enabled
- [x] 7.2 Add end-to-end test with all feature flags enabled
- [x] 7.3 Test tool tracking with multiple agents
- [x] 7.4 Test routing traceability with fallbacks
- [x] 7.5 Test workflow tracking with parallel sub-agents
- [x] 7.6 Test workflow tracking with background sub-agents
- [x] 7.7 Test workflow tracking with sequential sub-agents
- [x] 7.8 Test session persistence E2E
- [x] 7.9 Test session metrics aggregation
- [x] 7.10 Test backward compatibility (all flags disabled)

## 8. Cleanup and Polish

- [x] 8.1 Review and refactor tool execution tracking
- [x] 8.2 Review and refactor routing traceability
- [x] 8.3 Review and refactor token usage tracking
- [x] 8.4 Review and refactor workflow tracking
- [x] 8.5 Review and refactor session persistence
- [x] 8.6 Add TypeScript type safety improvements
- [x] 8.7 Add JSDoc comments to public APIs
- [x] 8.8 Run linter and fix issues
- [x] 8.9 Run type checker and fix issues
- [x] 8.10 Update CHANGELOG.md

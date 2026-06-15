---
description: Gap taxonomy for analyze-session — distinguishes intentional design differences from inconsistencies/bugs. Read before Step 5 and Step 6.
---

# Gap classification — design differences vs inconsistencies

During analysis, classify every gap into one of two categories.

## Intentional design differences (not bugs)

- Smart Code Proxy logs preflights (`client-preflight`) and side-requests as separate workflows (the harness groups them inline in the JSONL log)
- Causal layout `causal-workflows-v1`: all workflow kinds live under a flat `workflows/NN/` tree; `workflowKind` in `meta.json` distinguishes agentic vs preflight vs side-request (no `main-agent/` or `side-interactions/` directories)
- Subagents hang off `tools/KK-Agent/sub-agent/workflow/` under the step that launched the Agent tool; the harness uses a different file structure
- Additional proxy metadata (latencies, tokens per step, `anthropicMessageId`)
- Explicit `interactionType` vs. inferred from harness context
- Built-in tool subagents as nested sub-interactions

## Inconsistencies/bugs (require investigation/fix)

- Subagents the harness logs but the proxy does not capture
- tool_use IDs that do not correlate between harness and proxy
- Orphan workflows (no `output/result.json` and no `status: cancelled/complete` in `meta.json`)
- Level 2+ subagents without a corresponding `tools/KK-Agent/sub-agent/workflow/` directory
- Orphan interactions (`continuationOrphan: true`, `stepCount: 0`) with matching `[audit]` warnings in `server/logs.jsonl`
- Events in `events.ndjson` attributed to a `workflowId` absent or empty under `sessions/{session-id}/workflows/NN/`
- Level 2+ subagents without correct `parentContext`

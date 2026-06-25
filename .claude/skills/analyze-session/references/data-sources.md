---
description: Exact paths and harness-vs-proxy source distinction for analyze-session. Read during Step 1 and Step 3 to locate files on disk.
---

# Data sources

## 1. Claude Code session store (harness)

Base location: `C:\Users\user\.claude\projects\C--Users-user-Desktop-Proyectos-Smart-Code-Proxy\{session-id}`

Relevant files:
- `C:\Users\user\.claude\projects\C--Users-user-Desktop-Proyectos-Smart-Code-Proxy\{session-id}.jsonl`: Main session log recorded by the harness
- `C:\Users\user\.claude\projects\C--Users-user-Desktop-Proyectos-Smart-Code-Proxy\{session-id}\`: Directory with subagent files created during the session

## 2. Smart Code Proxy audit trail (layout `causal-workflows-v1`)

Location: `sessions/{session-id}` (relative to project CWD)

Structure (single `workflows/` tree, all kinds share the same root):
- `session-metrics.json`: Aggregated token metrics per model across closed workflows
- `events.ndjson`: Append-only telemetry event log (raw EventBus stream) — **mandatory review in Step 3 and Step 5**
- `workflows/workflow-sequence.json`: Ordered list of main workflows opened/closed
- `workflows/NN/meta.json`: Fused identity+state for each workflow (`workflowKind`: `agentic` | `client-preflight` | `side-request`); no `state.json` separate file
- `workflows/NN/output/result.json`: `IWorkflowResult` written when the workflow closes
- `workflows/NN/steps/MM/request/body.json`: Step request body
- `workflows/NN/steps/MM/response/body.json`, `headers.json`, `parsed.md`: Step response
- `workflows/NN/steps/MM/response/streaming/NNNN-chunk.ndjson`: Per-chunk SSE audit (P2)
- `workflows/NN/steps/MM/tools/KK-<slug>/meta.json`, `input.json`, `result.json`: Tool invocation
- `workflows/NN/steps/MM/tools/KK-Agent/sub-agent/workflow/`: Nested subagent (same structure, recursively)

## 3. Smart Code Proxy runtime log

Location: `server/logs.jsonl` (relative to project CWD; shared across sessions)

Relevant usage:
- Filter by `{session-id}` or by session time window before reading
- Inventory `level: warn` / `level: error` and messages prefixed `[audit]`
- Correlate warnings with orphan workflows and `workflowId` distribution in `sessions/{session-id}/events.ndjson`

---
name: headless-cli-testing
description: Run Claude Code non-interactively (claude -p / --print) to validate changes end-to-end: proxy routing, hooks, TTS, toasts, and log output. Trigger when the user wants to test a proxy + hook + gateway change programmatically, run a headless E2E session, observe gateway logs, or reproduce the OAuth/bearer Stop-fallback scenario. También activar cuando el usuario quiera ejecutar pruebas headless, sesión no interactiva, validar hooks del gateway, o diagnosticar el fallback del Stop.
---

# Headless CLI Testing

<overview>
Execute Claude Code in non-interactive (print) mode to drive a full request-hook-gateway cycle and observe the results in `server/logs.jsonl` and the `sessions/` audit directory. Useful for E2E validation of proxy behavior without a live user session.

This skill's instructions are in **English** (token efficiency). User explanations are in **Spanish** — see `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md).
</overview>

<user_communication>
Ask, confirm, and respond to the user in **Spanish**. Keep this artifact's instructions in **English** for token efficiency.
</user_communication>

---

## Prerequisites

1. **Proxy running** — `npm run dev` (append-mode logs to `server/logs.jsonl`).
2. **Provider fixed** — `npm run configure:provider <provider>` writes `ANTHROPIC_BASE_URL` to `~/.claude/settings.json`, which Claude Code reads automatically.
3. **Verification** — confirm `configs/.env` has the expected `UPSTREAM_ORIGIN` for the chosen provider.

---

## Base command

```bash
claude -p "<prompt>" --model <model-alias>
```

**Verified flags** (from `claude --help`):

| Flag | Description |
|---|---|
| `-p` / `--print` | Non-interactive mode: print response and exit. Required for headless use. |
| `--model <model>` | Model alias or full model ID (e.g. `haiku`, `sonnet`, `claude-haiku-4-5-20251001`). Use `haiku` to minimize cost. |
| `--output-format <fmt>` | `text` (default), `json` (single result object), `stream-json` (realtime chunks). Use `json` to parse exit status and token counts. |
| `--max-turns <n>` | Cap the number of agentic turns. Use `--max-turns 1` for single-turn diagnostic sessions. |
| `--allowedTools <tools>` | Comma- or space-separated tool allowlist (e.g. `"Bash(echo *)"` to limit blast radius). |
| `--permission-mode <mode>` | `default`, `acceptEdits`, `auto`, `bypassPermissions`. Use `auto` for fully non-interactive runs. |
| `--bare` | Minimal mode: skips hooks, LSP, auto-memory, CLAUDE.md discovery. **Do not use** when the goal is to trigger hooks (Stop, UserPromptSubmit, etc.). |
| `--dangerously-skip-permissions` | Bypass all permission checks. Use only in sandboxes with no internet. |

---

## Minimal diagnostic command

```bash
claude -p "Di hola en una palabra" --model haiku --max-turns 1
```

This triggers the full cycle:
1. `UserPromptSubmit` hook → `POST /hooks` → proxy processes → optional TTS.
2. LLM turn executes (one turn via `haiku`).
3. `Stop` hook → `POST /hooks` → `announceStop` → `generateSpeechText` → TTS + toast.

---

## Observing results

### Gateway logs

```bash
# All [STOP-DIAG] entries (requires instrumented build)
grep '\[STOP-DIAG\]' server/logs.jsonl

# Last N lines of the full log
tail -n 50 server/logs.jsonl
```

Entries are JSONL (one JSON object per line). The gateway logs via pino; fields of interest:

| Field | Meaning |
|---|---|
| `tag` | `[STOP-DIAG]` for diagnostic entries |
| `status` | HTTP status from the upstream on `!res.ok` (e.g. 401, 403) |
| `statusText` | HTTP reason phrase |
| `body` | First 500 chars of the upstream error body |
| `reason` | `no-token` or `no-messages` for early-return in `generateSpeechText` |
| `usedFallback` | `true` when `announceStop` used the hardcoded fallback string |

### Session audit

Each turn writes artifacts under `sessions/<sessionId>/` (configured by `AUDIT_BASE_DIR`). Check for workflow closure files to confirm the hook cycle completed.

---

## Assertion pattern

```bash
# Exit code: 0 = success, non-zero = error
claude -p "Di hola" --model haiku; echo "exit: $?"

# Grep for the key diagnostic entry
grep '"tag":"\[STOP-DIAG\]"' server/logs.jsonl | grep '"status"' | tail -3

# Parse JSON output (--output-format json)
claude -p "Di hola" --model haiku --output-format json | jq '.result'
```

---

## Provider matrix

| Provider | configure command | Expected `UPSTREAM_ORIGIN` | Auth header |
|---|---|---|---|
| Anthropic OAuth (`default`) | `npm run configure:provider default` | `https://api.anthropic.com` | `Bearer <oauth-token>` |
| Minimax (`bearer`) | `npm run configure:provider minimax` | Minimax endpoint | `Bearer <api-key>` |

To reproduce the OAuth fallback scenario:
1. `npm run configure:provider default`
2. `npm run dev` (background)
3. `claude -p "Di hola en una palabra" --model haiku --max-turns 1`
4. `grep '\[STOP-DIAG\]' server/logs.jsonl`

---

## Cleanup

```bash
# Stop the proxy (kill the background npm run dev process or use TaskStop)
# Revert instrumentation if it was added temporarily
git restore src/3-operations/audit-hook-event.handler.ts
# Verify clean state
git status
```

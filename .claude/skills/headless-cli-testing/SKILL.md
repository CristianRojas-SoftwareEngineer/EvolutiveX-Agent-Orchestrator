---
name: headless-cli-testing
description: Run Claude Code non-interactively (claude -p / --print) to validate changes end-to-end: proxy routing, hooks, TTS, toasts, and log output. Trigger when the user wants to test a proxy + hook + gateway change programmatically, run a headless E2E session, observe gateway logs, or reproduce the no-openrouter-key Stop-fallback scenario. También activar cuando el usuario quiera ejecutar pruebas headless, sesión no interactiva, validar hooks del gateway, o diagnosticar el fallback del Stop.
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

## Isolated mode (REQUIRED when running from a live Claude Code session)

If the session invoking the test is itself routed through the main proxy (port 8787),
**never kill or restart that proxy, and never mutate `~/.claude/settings.json` or
`configs/.env`** — doing so breaks the parent session.

Use the isolated harness instead:

```bash
npm run test:headless-tts
```

Isolation guarantees (see `scripting/headless-tts-gateway-test/`):

| Resource | Main session | Isolated harness |
|---|---|---|
| Proxy port | 8787 (`configs/.env`) | **8788** (`--port` to override; guard aborts if equal to main) |
| Provider config | `~/.claude/settings.json` | In-memory env injection per subprocess (`provider-env.ts`) |
| `configs/.env` | Read at proxy startup | Never written; overridden via subprocess env (env wins over `--env-file`) |
| Gateway logs | `server/logs.jsonl` | `server/logs-headless-tts.jsonl` (`LOG_FILE` env var) |
| Session audit | `sessions/` | `server/headless-tts/sessions/` (`AUDIT_BASE_DIR` env var) |

How it works: the harness resolves the provider config (config.json + secrets.json +
model metadata) in memory and injects it as environment variables into both subprocesses —
the test proxy gets `UPSTREAM_ORIGIN`/`LOG_FILE`/`AUDIT_BASE_DIR`/credentials, and
`claude -p` gets `ANTHROPIC_BASE_URL=http://127.0.0.1:8788` plus provider models/token.
Env vars take precedence over `settings.json` in Claude Code, and the hook relay
(`post-hook-event.ts`) resolves its target from `ANTHROPIC_BASE_URL`, so hooks fire into
the test proxy automatically.

---

## Prerequisites (manual / standalone mode only)

Only when NO live session depends on the main proxy:

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

## TTS cycle (Stop event)

**`generateSpeechText` always uses the dedicated OpenRouter TTS provider** — independent
of the session provider. The session provider (Anthropic, Minimax, Ollama, etc.) is
only used for the main agentik flow; the TTS summary call goes directly to OpenRouter:

```
Stop hook → POST /hooks → AuditHookEventHandler
  → generateSpeechText → fetch('https://openrouter.ai/api/v1/messages')
       model: poolside/laguna-xs.2:free
       auth:  routing/providers/openrouter/secrets.json ANTHROPIC_AUTH_TOKEN
       (NEVER through the local proxy)
  → [TTS-SPEECH] log entry (success) OR [TTS-FALLBACK] log entry (any error)
  → speak(text) via SAPI (local TTS engine)
```

**Two-state TTS output:**

| Log tag | Meaning | `reason` field |
|---|---|---|
| `[TTS-SPEECH]` | Dynamic summary generated successfully | — (only `textPreview`) |
| `[TTS-FALLBACK]` | Fallback to generic message | `no-openrouter-key`, `no-messages`, `http-NNN`, `empty-response`, `exception` |

**Important:** because the TTS call bypasses the proxy, **no HTTP status code for TTS
appears in `server/logs.jsonl`**. Detection of TTS completion relies entirely on
`[TTS-SPEECH]` and `[TTS-FALLBACK]` log entries — not on proxy HTTP statuses.

The harness drain loop (`waitForGatewayTtsDrain`) polls
`ttsSpeeches.length + ttsFallbacks.length` from the log; this count rises as soon as
the handler emits its log entry, regardless of which TTS path was taken.

---

## Observing results

### Gateway logs

```bash
# All [TTS-SPEECH] entries (dynamic TTS success)
grep '\[TTS-SPEECH\]' server/logs-headless-tts.jsonl

# All [TTS-FALLBACK] entries (fallback + reason)
grep '\[TTS-FALLBACK\]' server/logs-headless-tts.jsonl

# Last N lines of the full log
tail -n 50 server/logs-headless-tts.jsonl
```

Entries are JSONL (one JSON object per line). The gateway logs via pino; fields of interest:

| Field | Meaning |
|---|---|
| `tag` | `[TTS-SPEECH]` for successful dynamic TTS; `[TTS-FALLBACK]` for fallbacks |
| `textPreview` | First 120 chars of the generated TTS text (only in `[TTS-SPEECH]`) |
| `reason` | Fallback reason: `no-openrouter-key`, `no-messages`, `http-NNN`, `empty-response`, `exception` |
| `usedFallback` | `true` when the generic fallback message was used |
| `fallbackText` | The actual fallback text spoken (only in `[TTS-FALLBACK]`) |
| `eventName` | Hook event that triggered the TTS (`Stop`, `UserPromptSubmit`, etc.) |

### Session audit

Each turn writes artifacts under `sessions/<sessionId>/` (configured by `AUDIT_BASE_DIR`). Check for workflow closure files to confirm the hook cycle completed.

---

## Assertion pattern

```bash
# Exit code: 0 = success, non-zero = error
claude -p "Di hola" --model haiku; echo "exit: $?"

# Grep for dynamic TTS success
grep '"tag":"\[TTS-SPEECH\]"' server/logs.jsonl | grep '"eventName":"Stop"' | tail -3

# Grep for fallback + reason
grep '"tag":"\[TTS-FALLBACK\]"' server/logs.jsonl | tail -3

# Parse JSON output (--output-format json)
claude -p "Di hola" --model haiku --output-format json | jq '.result'
```

---

## Provider matrix

The session provider only affects the main agentik flow. TTS always uses OpenRouter
(dedicated provider). The harness tests 5 session providers to verify all paths work
end-to-end with the dedicated TTS provider:

| Provider | Session flow | TTS flow |
|---|---|---|
| `anthropic` (default) | `https://api.anthropic.com` with Bearer OAuth | OpenRouter dedicated (`poolside/laguna-xs.2:free`) |
| `minimax` | Minimax endpoint with Bearer API key | OpenRouter dedicated |
| `openrouter` | OpenRouter endpoint | OpenRouter dedicated |
| `ollama` | Local Ollama endpoint | OpenRouter dedicated |
| `default` | `https://api.anthropic.com` with Bearer OAuth | OpenRouter dedicated |

**Prerequisite for TTS tests:** `routing/providers/openrouter/secrets.json` must contain
a valid `ANTHROPIC_AUTH_TOKEN`. Without it, all providers fall back to the generic message
(`[TTS-FALLBACK] reason: no-openrouter-key`) — valid behavior, but the harness considers
it a failure for the dynamic TTS assertion.

---

## Reproducing the no-openrouter-key fallback scenario

The harness includes a dedicated fallback scenario (always runs after the provider loop)
that starts the test proxy with `OPENROUTER_SECRETS_PATH` pointing to a nonexistent file:

```bash
# Automatically run as part of the full suite:
npm run test:headless-tts -- --no-voice-announce

# Or trigger it in isolation by reading the harness source and running directly
```

Expected outcome: `[TTS-FALLBACK] reason: no-openrouter-key` appears in
`server/logs-headless-tts.jsonl` for the `Stop` event.

---

## Cleanup

```bash
# Stop the proxy (kill the background npm run dev process or use TaskStop)
# Revert instrumentation if it was added temporarily
git restore src/3-operations/audit-hook-event.handler.ts
# Verify clean state
git status
```

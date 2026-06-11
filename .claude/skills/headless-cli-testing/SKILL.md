---
name: headless-cli-testing
description: Run Claude Code non-interactively (claude -p / --print) against an isolated Smart Code Proxy instance to validate changes end-to-end: proxy routing, hooks, gateway logs, and audit sessions. Trigger when the user wants to test a proxy + hook + gateway change programmatically, run a headless E2E session, observe gateway logs, or launch an agent programmatically without interrupting the main Claude Code session. También activar cuando el usuario quiera ejecutar pruebas headless, sesión no interactiva, validar hooks del gateway, lanzar agentes de forma programática, o diagnosticar comportamiento del proxy de forma aislada.
---

# Headless CLI Testing

## Contents

1. [Overview](#overview)
2. [Isolation model](#isolation-model-required-when-running-from-a-live-claude-code-session)
3. [Running a headless session](#running-a-headless-session)
   - [From the terminal](#from-the-terminal)
   - [From code — `runHeadlessSession`](#from-code--runheadlesssession)
4. [Module architecture](#module-architecture)
5. [TTS testing reference](#tts-testing-reference)

---

<overview>
The **headless execution mechanism** runs Smart Code Proxy + Claude Code (`claude -p`) in
a fully isolated environment: a dedicated test proxy port, in-memory provider configuration,
and separate log/audit paths. No global state is mutated — `~/.claude/settings.json` and
`configs/.env` remain untouched, and the main proxy session is never interrupted.

Use cases:
- **CI agents**: run an agent that processes something and returns output programmatically
- **Routing tests**: verify the proxy routes correctly to a given provider
- **Hook smoke tests**: fire `UserPromptSubmit` / `Stop` and observe hook relay behavior
- **Multi-session**: launch parallel isolated sessions for load or regression tests
- **TTS testing**: validate the TTS cycle across providers (see [references/tts-testing.md](./references/tts-testing.md))

This skill's instructions are in **English** (token efficiency). User explanations are in **Spanish** — see `<constraints>` below.
</overview>

---

<isolation_guard>
## Isolation model (REQUIRED when running from a live Claude Code session)

If the session invoking the test is itself routed through the main proxy (port 8787),
**never kill or restart that proxy, and never mutate `~/.claude/settings.json` or
`configs/.env`** — doing so breaks the parent session.

The isolation mechanism injects all provider configuration as environment variables
into both subprocesses — env vars take precedence over `settings.json` in Claude Code
and over `--env-file` in Node. The test proxy and `claude -p` never read or write
global config.

**Isolation table:**

| Resource | Main session | Isolated harness |
|---|---|---|
| Proxy port | 8787 (`configs/.env`) | **8788** (default; configurable; guard aborts if equal to main) |
| Provider config | `~/.claude/settings.json` | In-memory env injection (`provider-env.ts`) |
| `configs/.env` | Read at proxy startup | Never written; overridden via subprocess env |
| Gateway logs | `server/logs.jsonl` | `server/logs-headless.jsonl` (default) |
| Session audit | `sessions/` | `server/headless/sessions/` (default) |

The guard in `runHeadlessSession` (and in the TTS test harness) aborts with an error
if the test port equals the main proxy port.
</isolation_guard>

---

## Running a headless session

Two entry points — choose based on context:

| | From the terminal | From code |
|---|---|---|
| **When** | Exploratory, one-off diagnostic | Automated, repeatable, integrated in a test |
| **How** | `claude -p` directly in bash | `runHeadlessSession()` in TypeScript |
| **Setup** | Proxy must be running separately | `runHeadlessSession` handles the full lifecycle |

---

### From the terminal

One-off sessions from bash — no code required. The proxy must already be running and
a provider must be configured before invoking `claude -p`.

#### Prerequisites

1. **Proxy running** — `npm run dev` (append-mode logs to `server/logs.jsonl`).
2. **Provider configured** — `npm run configure:provider <provider>` writes
   `ANTHROPIC_BASE_URL` to `~/.claude/settings.json`.
3. **Verification** — confirm `configs/.env` has the expected `UPSTREAM_ORIGIN`.

#### Base command

```bash
claude -p "<prompt>" --model <model-alias>
```

**Verified flags:**

| Flag | Description |
|---|---|
| `-p` / `--print` | Non-interactive mode: print response and exit. Required for headless use. |
| `--model <model>` | Model alias or full model ID (e.g. `haiku`, `sonnet`). Use `haiku` to minimize cost. |
| `--output-format <fmt>` | `text` (default), `json` (single result object), `stream-json` (realtime chunks). |
| `--max-turns <n>` | Cap agentic turns. Use `--max-turns 1` for single-turn diagnostic sessions. |
| `--allowedTools <tools>` | Tool allowlist to limit blast radius. |
| `--permission-mode <mode>` | `default`, `acceptEdits`, `auto`, `bypassPermissions`. Use `auto` for fully non-interactive runs. |
| `--bare` | Minimal mode: skips hooks, LSP, auto-memory, CLAUDE.md. **Do not use** when the goal is to trigger hooks. |

#### Minimal diagnostic prompt

```bash
claude -p "Di hola en una palabra" --model haiku --max-turns 1
```

This triggers the full cycle:
1. `UserPromptSubmit` hook → `POST /hooks` → proxy processes.
2. LLM turn executes (one turn via haiku).
3. `Stop` hook → `POST /hooks` → gateway handlers run.

#### Observing results

```bash
# Last N lines of the headless log
tail -n 50 server/logs-headless.jsonl

# All hook events
grep '"POST /hooks"' server/logs-headless.jsonl

# Exit code: 0 = success, non-zero = error
claude -p "Di hola" --model haiku; echo "exit: $?"

# Parse JSON output
claude -p "Di hola" --model haiku --output-format json | jq '.result'
```

Entries are JSONL (one JSON object per line), written by pino. Each turn writes
artifacts under `server/headless/sessions/<sessionId>/` — check for workflow closure
files to confirm the hook cycle completed.

---

### From code — `runHeadlessSession`

Handles the full lifecycle (kill-port → start proxy → health check → run claude →
stop proxy) in a single call. Suitable for automated tests and repeatable scenarios.

#### API

```typescript
import { runHeadlessSession } from './scripting/headless-session/index.js';

const result = await runHeadlessSession({
  provider: 'anthropic',   // 'anthropic' | 'minimax' | 'openrouter' | 'ollama' | 'default'
  prompt: 'Describe este archivo',
  port: 8788,              // optional; default 8788
  maxTurns: 1,             // optional; default 1
  claudeTimeoutMs: 180_000,
  healthTimeoutMs: 30_000,
  logFile: 'logs-headless.jsonl',      // relative to server/; optional
  auditDir: 'server/headless/sessions', // optional
  extraProxyEnv: {},       // optional: extra env vars injected into the test proxy
});
// result: { output, exitCode, isError, logPath, sessionDir, claudeStartedAt }
```

Log paths are available directly in the result — no need to locate them manually:

```typescript
console.log(result.logPath);    // absolute path, e.g. …/server/logs-headless.jsonl
console.log(result.sessionDir); // absolute path, e.g. …/server/headless/sessions/

// Read the last log entries from code:
import { readFileSync } from 'node:fs';
const lines = readFileSync(result.logPath, 'utf-8').trim().split('\n').slice(-20);
```

#### `extraProxyEnv`

Use this escape hatch to simulate controlled proxy conditions without touching
global config. Example: test what happens when a secrets file is missing:

```typescript
await runHeadlessSession({
  provider: 'default',
  prompt: 'Di hola',
  extraProxyEnv: { OPENROUTER_SECRETS_PATH: '/nonexistent/path' },
});
```

#### Using the primitives directly

For finer lifecycle control (e.g., reusing a proxy across multiple claude runs),
import from the sub-modules directly:

```typescript
import { startProxy, stopProxy, waitHealth } from './scripting/headless-session/proxy-lifecycle.js';
import { runClaudeHeadless } from './scripting/headless-session/run-claude.js';
import { buildIsolatedProviderEnv } from './scripting/headless-session/provider-env.js';
```

---

## Module architecture

Internal layout for contributors and consumers that need fine-grained lifecycle control.
Most use cases only need `runHeadlessSession` from `index.ts`.

```
scripting/headless-session/
├── index.ts            ← runHeadlessSession() — high-level API
├── proxy-lifecycle.ts  ← startProxy, stopProxy, waitHealth, killProcessOnPort, sleep, getLogPath
├── run-claude.ts       ← runClaudeHeadless, buildClaudeHeadlessArgs, resolveClaudeExecutable
├── provider-env.ts     ← buildIsolatedProviderEnv (resolves provider config in memory)
└── env-utils.ts        ← getProxyPort (reads configs/.env), getLogByteOffset
```

The TTS test suite (`scripting/headless-tts-gateway-test.ts`) is one consumer of
these primitives — it imports the sub-modules directly and adds TTS-specific assertions
on top of the same lifecycle.

---

## TTS testing reference

Use this reference when you want to validate the **TTS** cycle specifically
(Stop hook → OpenRouter → SAPI), not just the generic proxy/claude cycle.

See [references/tts-testing.md](./references/tts-testing.md) for:
- The TTS cycle (Stop hook → OpenRouter dedicated provider → SAPI)
- `[TTS-SPEECH]` / `[TTS-FALLBACK]` log tags and their fields
- Provider matrix (session flow vs. dedicated TTS flow)
- The drain loop and how to observe TTS completion
- The `no-openrouter-key` fallback scenario
- `npm run test:headless-tts` suite reference

<constraints>
All user-facing output, explanations, questions, and summaries MUST be in Spanish.
Technical identifiers, flag names, and code snippets remain in their original form.
</constraints>

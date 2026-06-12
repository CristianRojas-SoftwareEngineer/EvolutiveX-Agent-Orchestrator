---
name: claude-code-model-config
description: >
  Knowledge reference for Claude Code model configuration and routing: model aliases,
  settings precedence, opusplan, fallback chains, effort levels, extended context,
  enterprise allowlists, third-party pinning, modelOverrides, and ANTHROPIC_DEFAULT_*
  environment variables (haiku, sonnet, opus, fable). Use when the user asks how to
  configure or route models in Claude Code, which model alias to pick, how /model works,
  availableModels, configure-provider, fallbackModel, effort or thinking settings, 1M
  context, Fable 5, Frontier tier, Bedrock/Vertex/Foundry pinning, or LLM gateway model
  selection. Also trigger for configuración de modelo, enrutamiento de modelos, alias
  de modelo, opusplan, cadena de fallback, nivel de esfuerzo, contexto extendido,
  restringir modelos, pin model third-party, ANTHROPIC_DEFAULT_FABLE_MODEL, or tier
  Frontier.
---

# Claude Code — Model Configuration

<!-- <overview> -->
Canonical **knowledge** skill for how Claude Code selects, routes, and configures models.
Source: [Model configuration](https://code.claude.com/docs/en/model-configuration) (official docs).
Full doc index: https://code.claude.com/docs/llms.txt

**Key distinction:** `ANTHROPIC_BASE_URL` changes *where* requests are sent, not *which* model answers.
For gateway routing see [LLM gateway configuration](https://code.claude.com/docs/en/llm-gateway).

**Iterative maintenance:** when Claude Code docs or Smart Code Proxy provider/statusline behavior
change materially (new alias, new `ANTHROPIC_DEFAULT_*` var, tier mapping), update the matching
section here. Prefer official docs + `scripting/shared/provider-config.ts` over stale prose.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience).
Keep this artifact's instructions in **English** for token efficiency.
Canonical policy: `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md).
User-facing rules: [AGENTS.md](../../AGENTS.md) §0.
Keep standard technical terms in English when clarity benefits (e.g. alias, fallback, effort, settings).
<!-- </user_communication> -->

<!-- <routing> -->
## When to use which section

| User question | Section |
|---------------|---------|
| Which alias or model to use | `<model_aliases>` |
| Capability / cost tier order | `<model_tiers>` |
| How to set or change the active model | `<setting_model>` |
| Plan mode + execution hybrid | `<opusplan>` |
| Model overloaded / unavailable | `<fallback_chains>` |
| Fable 5 flagged content | `<automatic_fallback>` |
| `/effort`, ultracode, thinking | `<effort_and_thinking>` |
| 1M context, `opus[1m]` | `<extended_context>` |
| Enterprise restrict models | `<restrict_selection>` |
| Bedrock / Vertex / Foundry pinning | `<third_party>` |
| Map versions to provider IDs | `<model_overrides>` |
| Env var lookup | `<env_vars>` |
| Custom picker entry / gateway | `<custom_model>` |
| Prompt caching toggles | `<prompt_caching>` |
| Smart Code Proxy `configure-provider` / statusline Frontier | `<proxy_integration>` |
<!-- </routing> -->

<!-- <model_tiers> -->
## Reasoning tiers (capability / cost)

From lowest to highest capability and typical cost:

| Tier (product) | Claude alias | `ANTHROPIC_DEFAULT_*` variable |
|----------------|--------------|--------------------------------|
| Lite | `haiku` | `ANTHROPIC_DEFAULT_HAIKU_MODEL` |
| Standard | `sonnet` | `ANTHROPIC_DEFAULT_SONNET_MODEL` |
| Reasoning | `opus` | `ANTHROPIC_DEFAULT_OPUS_MODEL` |
| Frontier | `fable` | `ANTHROPIC_DEFAULT_FABLE_MODEL` |

`best` resolves to Fable 5 when the org has access, else latest Opus.
`opusplan` uses Opus in plan mode and Sonnet in execution mode (not a fourth persistent tier).

**Mythos 5:** not covered in public Claude Code docs at time of writing; may share the Frontier
product tier later. Do not invent `ANTHROPIC_DEFAULT_MYTHOS_MODEL` unless documented upstream.
<!-- </model_tiers> -->

<!-- <model_aliases> -->
## Model aliases and names

The `model` setting accepts either a **model alias** or a **model name**:

| Provider | Model name format |
|----------|-------------------|
| Anthropic API | Full [model name](https://platform.claude.com/docs/en/about-claude/models/overview) |
| Bedrock | Inference profile ARN |
| Foundry | Deployment name |
| Vertex | Version name |

### Alias table

| Alias | Behavior |
|-------|----------|
| `default` | Clears override; reverts to recommended model for account type (not itself an alias) |
| `best` | Fable 5 if org has access, else latest Opus |
| `fable` | Claude Fable 5 for hardest, longest-running tasks |
| `sonnet` | Latest Sonnet for daily coding |
| `opus` | Latest Opus for complex reasoning |
| `haiku` | Fast, efficient Haiku for simple tasks |
| `sonnet[1m]` | Sonnet with 1M token context window |
| `opus[1m]` | Opus with 1M token context window |
| `opusplan` | Opus in plan mode, Sonnet in execution mode |

### Alias resolution by provider

| Provider | `opus` resolves to | `sonnet` resolves to |
|----------|--------------------|-----------------------|
| Anthropic API | Opus 4.8 | Sonnet 4.6 |
| Claude Platform on AWS | Opus 4.7 | Sonnet 4.6 |
| Bedrock, Vertex, Foundry | Opus 4.6 | Sonnet 4.5 |

Aliases point to the recommended version for your provider and update over time.
**Pin a version:** use the full model name (e.g. `claude-opus-4-8`) or set the matching `ANTHROPIC_DEFAULT_*_MODEL` env var.

**Version requirements:** Opus 4.8 needs Claude Code v2.1.154+; Fable 5 needs v2.1.170+.
Run `claude update` to upgrade.
<!-- </model_aliases> -->

<!-- <fable_5> -->
## Fable 5 notes

Fable 5 is the most capable model for tasks larger than a single sitting — long autonomous sessions, investigation before action, frequent self-verification.

- **Not the default** on any account type. Select with `/model fable` or the `fable` / `best` alias.
- **Best practices:** describe outcomes not steps; hand ambiguous problems; skip verification reminders; size up larger tasks.
- **Safety classifiers** on cybersecurity/biology content trigger [automatic fallback](#automatic_fallback) to Opus.
- **Unavailable** under [zero data retention](https://code.claude.com/docs/en/zero-data-retention).
- **Thinking cannot be disabled** on Fable 5.
<!-- </fable_5> -->

<!-- <setting_model> -->
## Setting your model — precedence (highest first)

1. **During session** — `/model <alias|name>` or `/model` for picker
2. **At startup** — `claude --model <alias|name>`
3. **Environment** — `ANTHROPIC_MODEL=<alias|name>`
4. **Settings** — `"model"` field in settings file

### `/model` picker behavior (v2.1.153+)

- `Enter`: switch model **and save as default** (writes `model` to user settings)
- `s`: switch for **this session only**
- Typing `/model <name>` directly behaves like `Enter`
- Project and managed settings still take precedence on next launch

**v2.1.144–v2.1.152:** `/model` was session-only; `d` in picker saved default.

**Parallel terminals:** use separate `--model` flags per launch; `/model` does not isolate across terminals.

**Resumed sessions** (`--resume`, `--continue`, `/resume`): keep the model from when the transcript was saved.
If that model is retired, normal precedence applies.

**Project/managed override:** startup header shows which settings file set the model. `/model` overrides until next launch.

```bash
claude --model opus
/model sonnet
```

```json
{
  "model": "opus"
}
```
<!-- </setting_model> -->

<!-- <default_model> -->
## `default` alias behavior by account type

| Account type | Default resolves to |
|--------------|---------------------|
| Max, Team Premium, Enterprise pay-as-you-go, Anthropic API | Opus 4.8 |
| Claude Platform on AWS | Opus 4.7 |
| Pro, Team Standard, Enterprise subscription seats | Sonnet 4.6 |
| Bedrock, Vertex, Foundry | Sonnet 4.5 |

Fable 5 is never the system default. Choosing `/model fable` saves it in user settings for later sessions.
<!-- </default_model> -->

<!-- <opusplan> -->
## `opusplan` hybrid mode

| Mode | Model used |
|------|------------|
| Plan mode | `opus` (complex reasoning, architecture) |
| Execution mode | `sonnet` (code generation, implementation) |

Plan-mode Opus uses standard **200K** context. The automatic 1M upgrade does **not** extend to `opusplan`.

For mid-task consultation of a second model (not at plan boundary), see the [advisor tool](https://code.claude.com/docs/en/advisor).
<!-- </opusplan> -->

<!-- <fallback_chains> -->
## Fallback model chains (availability-based)

When the primary model is overloaded, unavailable, or returns a non-retryable server error, Claude Code tries fallback models in order.
**Never triggers** on auth, billing, rate-limit, request-size, or transport errors.

- Switch lasts for the **current turn only**; next message retries primary first.
- Chain capped at **3 models** after deduplication.

**Session:** `claude --fallback-model sonnet,haiku`

**Persistent:** settings `fallbackModel` array (flag takes precedence):

```json
{
  "fallbackModel": ["claude-sonnet-4-6", "claude-haiku-4-5"]
}
```

Each element accepts alias or name; `"default"` expands to the default model.

**Skipped elements:** unavailable (retired) models; entries outside `availableModels` allowlist.
<!-- </fallback_chains> -->

<!-- <automatic_fallback> -->
## Automatic model fallback (Fable 5 content-based)

When Fable 5 safety classifiers flag a request (cybersecurity, biology), Claude Code re-runs on default Opus and shows a notice:
Opus 4.8 (Anthropic API / LLM gateway) or Opus 4.7 (Claude Platform on AWS).
Session continues on Opus until `/model fable`.

**First-request triggers:** workspace context (CLAUDE.md, git status) can flag before user sends unusual content.
Diagnose with `claude --safe-mode` (disables CLAUDE.md, skills, MCP, hooks).

**Ask before switching:** `/config` → disable "switch models when a message is flagged" → pause with switch or retry options.

**Bedrock / Vertex / Foundry:** automatic fallback only when Claude Code identifies both Fable 5 and Opus targets.
Set `ANTHROPIC_DEFAULT_FABLE_MODEL` and `ANTHROPIC_DEFAULT_OPUS_MODEL` to enable.

**Security/biology workloads:** expect frequent fallback; this is expected routing, not an account flag.
<!-- </automatic_fallback> -->

<!-- <effort_and_thinking> -->
## Effort levels

Adaptive reasoning: model decides how much to think per step.

| Model | Supported levels |
|-------|------------------|
| Fable 5 | `low`, `medium`, `high`, `xhigh`, `max` |
| Opus 4.8, Opus 4.7 | `low`, `medium`, `high`, `xhigh`, `max` |
| Opus 4.6, Sonnet 4.6 | `low`, `medium`, `high`, `max` |

Unsupported level → falls back to highest supported at or below requested (e.g. `xhigh` → `high` on Opus 4.6).

**Defaults:** `high` on Fable 5, Opus 4.8, Opus 4.6, Sonnet 4.6; `xhigh` on Opus 4.7.
First run of Fable 5 / Opus 4.8 / Opus 4.7 applies model default even if another level was set before.

`low`–`xhigh` persist across sessions. `max` is session-only (except via `CLAUDE_CODE_EFFORT_LEVEL`).

**`ultracode`:** Claude Code setting (not API effort) — sends `xhigh` + orchestrates [dynamic workflows](https://code.claude.com/docs/en/workflows). Session-only via `/effort`, `"ultracode": true` in `--settings`, or Agent SDK.

**`ultrathink` in prompt:** one-off deeper reasoning for that turn; effort level unchanged.

### Set effort

| Method | Notes |
|--------|-------|
| `/effort` | Interactive slider, `/effort <level>`, or `/effort auto` |
| `/model` picker | Arrow keys adjust effort slider |
| `--effort` flag | Session launch |
| `CLAUDE_CODE_EFFORT_LEVEL` | Highest precedence |
| `effortLevel` in settings | `low`–`xhigh` only (not `max` / `ultracode`) |
| Skill/subagent frontmatter `effort` | Overrides session (not env var) |

### Extended thinking

On adaptive-reasoning models, effort is the primary thinking control.

| Control | How |
|---------|-----|
| Session toggle | `Option+T` (macOS) / `Alt+T` (Windows/Linux) |
| Global default | `/config` → `alwaysThinkingEnabled` in settings |
| Disable (API) | `MAX_THINKING_TOKENS=0` (no effect on Fable 5) |

Thinking collapsed by default; `Ctrl+O` toggles verbose. Set `showThinkingSummaries: true` for full summaries on Anthropic API.

**Adaptive vs fixed:** Opus 4.7+, Fable 5 always use adaptive reasoning.
Opus 4.6 / Sonnet 4.6: `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` reverts to fixed budget via `MAX_THINKING_TOKENS`.
<!-- </effort_and_thinking> -->

<!-- <extended_context> -->
## Extended context (1M window)

Fable 5, Opus 4.6+, Sonnet 4.6 support [1M token context](https://platform.claude.com/docs/en/about-claude/context-windows#1m-token-context-window).

| Plan | Opus 1M | Sonnet 1M |
|------|---------|-----------|
| Max, Team, Enterprise | Included | Requires usage credits |
| Pro | Requires usage credits | Requires usage credits |
| API / pay-as-you-go | Full access | Full access |

Disable entirely: `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`.

Use aliases `opus[1m]` / `sonnet[1m]` or append `[1m]` to full model names:

```bash
/model opus[1m]
/model claude-opus-4-8[1m]
```

On Max/Team/Enterprise, Opus auto-upgrades to 1M with no extra config.
1M uses standard pricing beyond 200K (no premium surcharge).
<!-- </extended_context> -->

<!-- <restrict_selection> -->
## Restrict model selection (enterprise)

`availableModels` in managed or policy settings restricts picker, `--model`, and `ANTHROPIC_MODEL`.

```json
{
  "availableModels": ["sonnet", "haiku"]
}
```

- **Default option** in picker is **not** affected — always available.
- Even `availableModels: []` allows Default for the user's tier.
- `model` setting is initial selection, **not enforcement** — users can pick Default.
- **Full control:** combine `availableModels` + `model` + `ANTHROPIC_DEFAULT_*_MODEL` env vars.

Example — start on Sonnet 4.5, limit picker, pin Default to Sonnet 4.5:

```json
{
  "model": "claude-sonnet-4-5",
  "availableModels": ["claude-sonnet-4-5", "haiku"],
  "env": {
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5"
  }
}
```

Without the `env` block, Default would resolve to latest Sonnet, bypassing the pin.

**Merge:** `availableModels` arrays merge and deduplicate across settings levels.
Strict allowlist → set in managed/policy settings (highest priority).

**Mantle (Bedrock):** entries starting with `anthropic.` appear in picker and route to Mantle endpoint.
Include standard aliases alongside Mantle IDs.
<!-- </restrict_selection> -->

<!-- <env_vars> -->
## Environment variables — alias resolution

Must be full **model names** (or provider equivalent):

| Variable | Maps to |
|----------|---------|
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `haiku`; background functionality |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `sonnet`; `opusplan` in execution mode |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `opus`; `opusplan` in plan mode |
| `ANTHROPIC_DEFAULT_FABLE_MODEL` | `fable`; Fable 5 ID for automatic fallback on third-party |
| `CLAUDE_CODE_SUBAGENT_MODEL` | All subagents and agent teams (overrides per-invocation and frontmatter `model`). Use `inherit` for normal resolution |

`ANTHROPIC_SMALL_FAST_MODEL` is deprecated → use `ANTHROPIC_DEFAULT_HAIKU_MODEL`.

Canonical order in Smart Code Proxy `MANAGED_ENV_VARS`: haiku → sonnet → opus → fable → subagent.
<!-- </env_vars> -->

<!-- <third_party> -->
## Pin models for third-party deployments

**Always pin** on Bedrock, Vertex, Foundry, Claude Platform on AWS before rollout.
Without pinning, aliases resolve to built-in defaults that may lag or be unavailable.

```bash
# Bedrock
export ANTHROPIC_DEFAULT_OPUS_MODEL='us.anthropic.claude-opus-4-8'
export ANTHROPIC_DEFAULT_FABLE_MODEL='us.anthropic.claude-fable-5'
# Vertex / Foundry
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-8'
export ANTHROPIC_DEFAULT_FABLE_MODEL='claude-fable-5'
```

Apply same pattern for HAIKU and SONNET variables.
For 1M on pinned models: append `[1m]` to the env var value:

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL='claude-opus-4-8[1m]'
```

- Suffix stripped before sending to provider.
- `[1m]` on `opusplan` plan-mode Opus remains capped at 200K.
- `availableModels` filters on **alias**, not provider-specific ID.

### Display and capabilities overrides

On third-party providers (and `_NAME`/`_DESCRIPTION` when `ANTHROPIC_BASE_URL` points to LLM gateway):

| Suffix | Purpose |
|--------|---------|
| `_NAME` | Picker display name |
| `_DESCRIPTION` | Picker description |
| `_SUPPORTED_CAPABILITIES` | Comma-separated feature list |

Available for OPUS, SONNET, HAIKU, FABLE, and `ANTHROPIC_CUSTOM_MODEL_OPTION`.

| Capability | Enables |
|------------|---------|
| `effort` | Effort levels, `/effort` |
| `xhigh_effort` | `xhigh` level |
| `max_effort` | `max` level |
| `thinking` | Extended thinking |
| `adaptive_thinking` | Adaptive reasoning |
| `interleaved_thinking` | Thinking between tool calls |

When set, listed capabilities enabled; unlisted disabled. Unset → built-in ID pattern detection.
<!-- </third_party> -->

<!-- <model_overrides> -->
## `modelOverrides` setting

Maps individual Anthropic model IDs to provider-specific strings (ARNs, deployment names).
Keys must match [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) exactly.

```json
{
  "modelOverrides": {
    "claude-opus-4-7": "arn:aws:bedrock:us-east-2:123456789012:application-inference-profile/opus-prod",
    "claude-sonnet-4-6": "arn:aws:bedrock:us-east-2:123456789012:application-inference-profile/sonnet-prod"
  }
}
```

- Overrides replace built-in picker IDs; on Bedrock take precedence over auto-discovered profiles.
- Values from `ANTHROPIC_MODEL`, `--model`, or `ANTHROPIC_DEFAULT_*_MODEL` pass through **without** transformation.
- `availableModels` evaluates against Anthropic model ID, not override value.
<!-- </model_overrides> -->

<!-- <custom_model> -->
## Custom model picker entry

`ANTHROPIC_CUSTOM_MODEL_OPTION` adds one custom entry to `/model` picker.

```bash
export ANTHROPIC_CUSTOM_MODEL_OPTION="my-gateway/claude-opus-4-7"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="Opus via Gateway"
export ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION="Custom deployment routed through internal LLM gateway"
```

For LLM gateway deployments with discovery: set `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`
(populates picker from `/v1/models`). Custom option needed when discovery is off or incomplete.

Claude Code skips validation for custom model IDs.
<!-- </custom_model> -->

<!-- <proxy_integration> -->
## Smart Code Proxy — provider config and statusline

This repo maps Claude Code model env vars to provider catalogs and statusline Tabla 2 tiers.

| Concern | Location |
|---------|----------|
| Write `ANTHROPIC_DEFAULT_*` to settings | `scripting/configure-provider.ts` + `npm run configure:provider -- <name>` |
| Managed var list | `scripting/shared/provider-config.ts` → `MANAGED_ENV_VARS` |
| Anthropic catalog (incl. Fable 5) | `routing/providers/anthropic/config.json`, `models/claude-fable-5/metadata.json` |
| Tabla 2 tier classification | `scripting/router-status.ts` → `classifyModelWithEnv` |
| Normative Frontier behavior | `openspec/specs/statusline-runtime/spec.md`, `openspec/specs/provider-env-config/spec.md` |

**After upgrading** or if Fable metrics are missing in Tabla 2, re-run:

```bash
npm run configure:provider -- anthropic
```

**Classification order** in statusline: haiku → fable → opus → sonnet.
Without `ANTHROPIC_DEFAULT_FABLE_MODEL` in settings, OAuth users still get Frontier via substring `"fable"` in `modelId`.

**Do not conflate:** Claude Code alias resolution (this skill) vs proxy upstream routing (`ANTHROPIC_BASE_URL` → local proxy).
For statusline slots, metrics, and cache see [statusline-system](../statusline-system/SKILL.md).
<!-- </proxy_integration> -->

<!-- <checking_model> -->
## Checking current model

1. [Status line](https://code.claude.com/docs/en/statusline) (if configured)
2. `/status` (includes account info)
3. In this repo: Tabla 1 «Modelo activo» when Smart Code Proxy statusline is installed
<!-- </checking_model> -->

<!-- <prompt_caching> -->
## Prompt caching

Claude Code uses [prompt caching](https://code.claude.com/docs/en/prompt-caching) automatically.

| Variable | Effect |
|----------|--------|
| `DISABLE_PROMPT_CACHING=1` | Disable all (takes precedence) |
| `DISABLE_PROMPT_CACHING_HAIKU=1` | Haiku only |
| `DISABLE_PROMPT_CACHING_SONNET=1` | Sonnet only |
| `DISABLE_PROMPT_CACHING_OPUS=1` | Opus only |
| `DISABLE_PROMPT_CACHING_FABLE=1` | Fable only |

Cache TTL and miss triggers: [How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching).
<!-- </prompt_caching> -->

<!-- <related_skills> -->
| Skill | Relationship |
|-------|--------------|
| [statusline-system](../statusline-system/SKILL.md) | Tabla 2 Frontier slot, aggregation, ANSI palette |
| [anthropic-api-protocol](../anthropic-api-protocol/SKILL.md) | API protocol behind model requests and metrics |
<!-- </related_skills> -->

<!-- <constraints> -->
When answering the user:
- Respond in **Spanish** with clear precedence tables when explaining configuration conflicts.
- Distinguish **alias resolution** (what model runs) from **routing** (`ANTHROPIC_BASE_URL` / LLM gateway).
- Cite the relevant setting level (session, env, user, project, managed) when precedence matters.
- Warn about version-specific requirements (Opus 4.8, Fable 5) when recommending models.
- For proxy-specific wiring, point to `<proxy_integration>` and `statusline-system`, not only upstream Claude docs.
<!-- </constraints> -->

<!-- <iteration> -->
## Evolving this skill

1. **Verify upstream** — [Model configuration](https://code.claude.com/docs/en/model-configuration) when aliases or env vars change.
2. **Verify proxy** — `provider-config.ts`, `anthropic/config.json`, `router-status.ts` when tier mapping changes.
3. **Sync sibling** — update `statusline-system` Frontier sections if this skill's tier table changes.
4. **Description** — add new Spanish/English trigger phrases when users report undertriggering.
<!-- </iteration> -->

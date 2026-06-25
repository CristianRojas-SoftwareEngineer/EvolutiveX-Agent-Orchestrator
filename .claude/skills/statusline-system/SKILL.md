---
name: statusline-system
description: >
  Knowledge reference for the Smart Code Proxy Claude Code statusline: architecture,
  installation in settings.json, runtime pipeline (router-status.ts), three-table layout,
  reasoning-level slots (Lite/Standard/Reasoning/Frontier), Tabla 2 aggregation from
  session-metrics.json, cache, and file map. Use when asking how the statusline works,
  where slot or Tabla 2 logic lives, how metrics are composed per level, statusline
  installation, EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT, router-details toggle, or improving/extending
  the statusline. Also trigger for statusline, barra de estado, slots de razonamiento,
  tabla 2, session-metrics en statusline, install statusline, router-status.
---

# Smart Code Proxy — Statusline System

<!-- <overview> -->
Canonical **knowledge** skill for the Claude Code statusline shipped by Smart Code Proxy.
This skill summarizes design and implementation; for normative requirements see
`openspec/specs/statusline-runtime/spec.md` and `openspec/specs/statusline-installer/spec.md`.
For human-facing visual spec see `docs/router-statusline.md`.

**Iterative maintenance:** when `docs/router-statusline.md`, `docs/session-metrics-system.md`,
or `scripting/provider/router-status.ts` change materially, update the matching section here.
Prefer verifying against code over stale prose in older OpenSpec archives.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience).
Keep this artifact's instructions in **English** for token efficiency.
Canonical policy: `<language_policy>` in [artifact-structuring](../artifact-structuring/SKILL.md).
User-facing rules: [AGENTS.md](../../../AGENTS.md) §0.
Use ASCII diagrams and file-path tables when explaining architecture.
<!-- </user_communication> -->

<!-- <architecture> -->
## High-level architecture

The statusline is an **external command** Claude Code invokes on each status-bar refresh.
Smart Code Proxy registers a subprocess in `~/.claude/settings.json` that runs
`scripting/provider/router-status.ts` via `npx` + `tsx`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Claude Code (active session)                       │
│  stdin JSON ($ctx): session_id, model, context_window, rate_limits  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ invokes statusLine.command
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│              scripting/provider/router-status.ts (Node.js)                    │
│  Reads: settings.json → env, configs/.env, sessions/, routing/       │
│  Writes: stdout (Unicode tables + ANSI colors)                       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ reads metrics
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  sessions/<sessionId>*/session-metrics.json   (proxy writes)         │
│  sessions/<sessionId>*/.statusline-state.json (statusline cache)     │
│  sessions/<sessionId>*/subscription-quota.json (optional, Tabla 3)   │
└─────────────────────────────────────────────────────────────────────┘
```

**Output layout:**

| Row | Content | Condition |
|-----|---------|-----------|
| 1 | Tabla 1 (session/provider) ± Tabla 3 (subscription quotas) side-by-side | Tabla 3 when `resolveQuotaSource()` returns data |
| 2 | Tabla 2 («Trabajo por niveles de razonamiento») | Only when `EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` = `on` (opt-in; hidden by default) |

**Contract:** Claude Code injects `settings.json → env` into the subprocess — **not** the user's shell `process.env`. `router-status.ts` reads auth, model slots, `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`, and the Tabla 2 toggle from that block.
<!-- </architecture> -->

<!-- <installation> -->
## Loading into Claude Code

### Install path

| Layer | File | Role |
|-------|------|------|
| CLI entry | `scripting/install/setup.ts` | Universal installer (`npm run setup:install`) |
| Feature logic | `scripting/install/features/statusline.ts` | Builds `statusLine` block + `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` |
| Settings I/O | `scripting/shared/claude-settings.ts` | Read/write `~/.claude/settings.json` |
| Formal spec | `openspec/specs/statusline-installer/spec.md` | Installer requirements |

`applyStatuslineInstall()` writes:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx --prefix \"<ROOT>\" tsx \"<ROOT>/scripting/provider/router-status.ts\"",
    "padding": 0
  },
  "env": {
    "EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT": "<absolute proxy repo path>"
  }
}
```

**Installer note:** `docs/router-statusline.md` references `scripting/install/setup.ts` + `scripting/install/features/statusline.ts` — the unified installer replaced the old standalone `install-statusline.ts`.

**Refresh interval:** this project does **not** write `statusLine.refreshInterval` on install;
cadence follows Claude Code native triggers (assistant message, `/compact`, permissions, vim).
See archived change `remove-statusline-refresh-interval` if investigating live-refresh history.

### Runtime entry (`router-status.ts` → `main()`)

1. Read JSON from **stdin** (`ctx`)
2. Read `settings.json → env`
3. Call `buildStatuslineOutput(ctx, settingsEnv)`
4. `console.log` result to stdout

### Tabla 2 visibility toggle

| Key | Value | Effect |
|-----|-------|--------|
| `EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS` | `on` | Tabla 2 rendered |
| absent / `off` / other | — | Tabla 2 omitted entirely |

CLI helpers (`package.json`):

- `npm run statusline:router-details:on`
- `npm run statusline:router-details:off`
- `npm run statusline:router-details:toggle`

Implementation: `scripting/provider/statusline-router-details.ts`.
Spec: `openspec/specs/statusline-router-details-toggle/spec.md`.
<!-- </installation> -->

<!-- <data_sources> -->
## Data sources per table

`router-status.ts` combines these sources (see `docs/router-statusline.md` §2 for full table):

| Data | Source | Field / path |
|------|--------|--------------|
| Session ID | stdin `$ctx` | `ctx.session_id` |
| Active model, context % | stdin | `ctx.model`, `ctx.context_window` |
| OAuth rate limits | stdin | `ctx.rate_limits` (Tabla 3, Anthropic OAuth) |
| Upstream provider | `configs/.env` + `routing/providers/*/config.json` | `UPSTREAM_ORIGIN` cross-match |
| Auth method | `settings.env` | `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` |
| Model per slot | `settings.env` | `ANTHROPIC_DEFAULT_HAIKU/SONNET/OPUS/FABLE_MODEL` |
| Display names | `routing/providers/*/models/*/metadata.json` | `displayName` |
| Session metrics | `sessions/<dir>/session-metrics.json` | per `modelId` counters |
| Subscription quota (bearer) | `sessions/<dir>/subscription-quota.json` | Tabla 3 fallback |

**Session folder resolution:** prefix match — `sessions/<dir>` where `dir.startsWith(ctx.session_id)` (proxy may suffix folder names).
<!-- </data_sources> -->

<!-- <slots> -->
## Reasoning-level slots

In this project **slot** means one of the **four fixed reasoning levels** mapped to Anthropic API model tiers. Tabla 2 always renders **exactly four data rows** (plus a totals row), even when counters are zero.

| Slot (UI label) | `settings.env` variable | API slot | Tabla 2 row |
|-----------------|-------------------------|----------|-------------|
| **Lite** | `ANTHROPIC_DEFAULT_HAIKU_MODEL` | haiku | row 1 |
| **Standard** | `ANTHROPIC_DEFAULT_SONNET_MODEL` | sonnet | row 2 |
| **Reasoning** | `ANTHROPIC_DEFAULT_OPUS_MODEL` | opus | row 3 |
| **Frontier** | `ANTHROPIC_DEFAULT_FABLE_MODEL` | fable | row 4 |

Configured by `configure-provider.ts` into `settings.env`. The statusline **reads** these variables; it does not write them.

### Classification (`classifyModelWithEnv`)

Location: `scripting/provider/router-status.ts` (exported for tests).

Evaluation order: **haiku → fable → opus → sonnet** (substring match of `modelId` against configured variable).

| Condition | Result |
|-----------|--------|
| `modelId` includes configured haiku model | `lite` |
| `modelId` includes configured fable model | `frontier` |
| `modelId` includes configured opus model | `reasoning` |
| `modelId` includes configured sonnet model | `standard` |
| Variable empty/absent for a level | Fallback keyword in `modelId`: `haiku` / `fable` / `opus` / `sonnet` |
| No match | `null` — entry **excluded** from all slot rows |

Partial configuration is supported: configured levels use variable match; unconfigured levels use keyword fallback.

### Tabla 2 ANSI palette (level rows)

| Level | Color | ANSI |
|-------|-------|------|
| Lite | Gray | `\x1B[90m` |
| Standard | Gray | `\x1B[90m` |
| Reasoning | White | `\x1B[37m` |
| Frontier | White bold | `\x1B[1;37m` |

### Where to read about slots

| Kind | Path | Focus |
|------|------|-------|
| Visual + mapping | `docs/router-statusline.md` §3.2, §5 | Columns, slot ↔ env ↔ API |
| Metrics semantics | `docs/session-metrics-system.md` | Slot/model aggregation, `finalized_runs` attribution |
| Implementation | `scripting/provider/router-status.ts` | `classifyModelWithEnv`, `aggregateSessionMetrics`, `renderTokenTable` |
| Domain types | `src/1-domain/types/gateway/session-metrics.types.ts` | `ISessionMetrics`, `IModelSessionMetrics` |
| Attribution | `src/1-domain/services/gateway/resolve-attributed-model-id.ts` | Which `modelId` receives `finalized_runs` |
| Formal scenarios | `openspec/specs/statusline-runtime/spec.md` | e.g. «Un prompt con dos subagentes distribuye trabajo por slot» |
<!-- </slots> -->

<!-- <table2_composition> -->
## How slots compose Tabla 2

### Pipeline

```
session-metrics.json
  models: { "<modelId>": { billable_hops, finalized_runs, input_tokens, ... }, ... }
  session_totals: { billable_hops, finalized_runs, input_tokens, ... }
         │
         ▼
aggregateSessionMetrics(sessionPath, settingsEnv, routingPath)
  for each modelId in models:
    level = classifyModelWithEnv(modelId, settingsEnv)  → lite | standard | reasoning | frontier | null
    if null → skip
    metrics[level] += entry counters
    metrics[level].modelName = loadDisplayName(modelId, routingPath)
  sessionTotals.billableHops ← session_totals.billable_hops
  sessionTotals.* tokens ← session_totals.*
  sessionTotals.finalizedRuns ← sum(lite + standard + reasoning + frontier finalizedRuns)  [internal consistency]
         │
         ▼
renderTokenTable(metrics, previousSnapshot, targetWidth)
  4 fixed rows (Lite, Standard, Reasoning, Frontier) + manual «Totales de sesión» row
```

### Column mapping per slot row

| Tabla 2 column | Per-row source (Lite / Standard / Reasoning / Frontier) |
|----------------|-----------------------------------------------|
| Nivel | Fixed slot label |
| Modelo | `displayName` from `metadata.json` for aggregated `modelId`(s); empty slot shows configured default model display name |
| # Workflows | Σ `models[modelId].finalized_runs` for all `modelId` classified into that slot |
| # Steps | Σ `models[modelId].billable_hops` for that slot |
| Input / Caché Write / Caché Read / Output | Σ token fields for that slot |

`0` displays as `-`. Numbers use thousands separators.

### Totals row semantics

| Column | Source in current code (`aggregateSessionMetrics` + `renderTokenTable`) |
|--------|------------------------------------------------------------------------|
| # Steps | `session_totals.billable_hops` (structural session count, not sum of visible rows) |
| # Workflows | Sum of `finalized_runs` across the four rendered slot rows |
| Tokens | `session_totals.*` |

**Doc/spec tension:** `docs/router-statusline.md` §3.2 mentions `session_totals.finalized_runs` for totals `# Workflows`; `openspec/specs/statusline-runtime/spec.md` requires totals `# Workflows` ← `session_totals.finalized_runs` (hallazgo 2). Current `router-status.ts` derives totals workflows from the **sum of slot rows** for internal table consistency. When answering users, cite **code behavior** and flag the spec/doc delta if relevant.

### Who writes `session-metrics.json` (proxy, not statusline)

| Event | Handler | Effect |
|-------|---------|--------|
| Billable hop with `usage` (main or subagent) | `SessionMetricsService.updateFromStep` | +`billable_hops`, tokens for that `modelId` |
| E2E workflow close (`Stop` / `SubagentStop`) | `finalizeWorkflowMetrics` | +1 `finalized_runs` on **first agentic hop with usage** model |

Invariant **G16′:** main and subagent workflows count; standalone preflights do not finalize runs (side-requests with `usage` still add `# Steps`).

**Example (from spec):** one main on Reasoning + two subagents on Standard, all closed → Reasoning `# Workflows`=1, Standard `# Workflows`=2, totals `# Workflows`=3 (if all attributed).

### Tabla 2 width and position

- Always **below** Tabla 1 (± Tabla 3) block.
- Width anchored to `table1.width + table3.width + 2` (or deterministic Tabla 3 reference width when Tabla 3 absent).
- **Modelo** column is elastic (pad or truncate with `...`).

### Cache (`.statusline-state.json`)

Per session under `sessions/<dir>/`. Does **not** replace `session-metrics.json`.

| Field | Role |
|-------|------|
| `contextUsagePercentage` | Tabla 1 fallback when stdin `used_percentage` missing or `0` |
| `metricsSnapshot` | Previous per-slot counters for dim/highlight diff |
| `lastRenderedMtimeMs`, `lastRenderedMetricsSize` | Early-exit detection |
| `lastRenderedTable2Output` | Re-print cached Tabla 2 text when metrics file unchanged |

Early exit: if `session-metrics.json` mtime/size unchanged, skip re-aggregation and re-print `lastRenderedTable2Output`.
<!-- </table2_composition> -->

<!-- <tables_summary> -->
## All three tables (quick reference)

### Tabla 1 — Session and provider

Four centered columns: Proveedor, Modelo activo, Contexto (tks), Porcentaje de uso (8-block bar, color by %).

### Tabla 2 — Work by reasoning level

Eight columns; conditional visibility (see `<installation>`). Title: «Trabajo por niveles de razonamiento».

### Tabla 3 — Subscription limits

When `resolveQuotaSource()` succeeds: OAuth stdin or `subscription-quota.json` on disk.
Four columns: quota label, bar+%, «Reinicio en», time remaining.
<!-- </tables_summary> -->

<!-- <file_map> -->
## File and document map

### Implementation

| File | Responsibility |
|------|----------------|
| `scripting/provider/router-status.ts` | Full render pipeline, slot classification, aggregation, cache |
| `scripting/install/features/statusline.ts` | Install/uninstall statusLine + `EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` |
| `scripting/install/setup.ts` | `npm run setup:install` orchestration |
| `scripting/shared/claude-settings.ts` | Settings keys (`EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT`, router-details toggle) |
| `scripting/provider/statusline-router-details.ts` | Toggle Tabla 2 in settings |

### Human documentation

| Document | Best for |
|----------|----------|
| `docs/router-statusline.md` | Visual layout, colors, dispatch diagram, slot mapping §5 |
| `docs/session-metrics-system.md` | `session-metrics.json` schema, write path, Tabla 2 field mapping |
| `docs/how-to-start.md` | Getting started / install pointers |

### OpenSpec (normative)

| Spec | Best for |
|------|----------|
| `openspec/specs/statusline-runtime/spec.md` | Runtime requirements, Tabla 2 scenarios |
| `openspec/specs/statusline-installer/spec.md` | Installer contract |
| `openspec/specs/statusline-router-details-toggle/spec.md` | Tabla 2 visibility CLI |

### Tests

| File | Coverage |
|------|----------|
| `tests/scripting/router-status-output.test.ts` | Output / layout |
| `tests/scripting/install/features/statusline.test.ts` | Installer feature |
| `tests/scripting/statusline-router-details.test.ts` | Toggle CLI |

### Related skills

| Skill | Relationship |
|-------|--------------|
| `anthropic-api-protocol` | Token fields, API concepts behind metrics |
| `openspec-specialist` | OpenSpec workflow for statusline changes |
<!-- </file_map> -->

<!-- <dispatch> -->
## Provider dispatch (simplified)

```
resolveActiveProvider()     → UPSTREAM_ORIGIN vs routing/providers/*/config.json
resolveAuthMethodFromEnv()  → api_key | bearer | oauth
resolveQuotaSource()        → stdin OAuth | subscription-quota.json | null
buildStatuslineOutput()
  ├── row 1: Tabla 1 + Tabla 3 side-by-side (or Tabla 1 alone)
  └── row 2: Tabla 2 if EVOLUTIVEX_AGENT_ORCHESTRATOR__STATUSLINE_ROUTER_DETAILS=on
```

`projectRoot` resolution: `settings.env.EVOLUTIVEX_AGENT_ORCHESTRATOR_ROOT` → fallback `process.cwd()` if invalid.
<!-- </dispatch> -->

<!-- <constraints> -->
## Agent constraints when using this skill

- Respond to the user in **Spanish**; keep path and identifier literals as in the repo.
- This is a **reference** skill — do not implement statusline changes unless the user exits explore/plan mode and requests implementation.
- Prefer reading `scripting/provider/router-status.ts` and `docs/router-statusline.md` when facts may have drifted since this skill was last updated.
- Distinguish **slot** (reasoning level: Lite/Standard/Reasoning/Frontier) from unrelated «slot» terms in other domains (e.g. artifact-structuring slot assignment).
<!-- </constraints> -->

<!-- <iteration> -->
## Evolving this skill

When extending the statusline or answering deep questions:

1. **Verify in code** — `scripting/provider/router-status.ts` is source of truth for behavior.
2. **Sync docs** — update `docs/router-statusline.md` / `docs/session-metrics-system.md` in the same change when behavior changes.
3. **Sync this skill** — update the matching XML section (`<slots>`, `<table2_composition>`, etc.).
4. **OpenSpec** — new requirements go to delta specs under `openspec/changes/` then merge to `openspec/specs/statusline-runtime/spec.md`.

Suggested triggers to revisit this skill: new Tabla 2 columns, slot count change, new cache fields, installer path changes, refresh-interval policy changes.
<!-- </iteration> -->

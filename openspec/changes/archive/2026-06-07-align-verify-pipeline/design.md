# Design — Align verify pipeline

## Context

`scripting/verify-package-scripts.ts` is a programmatic gate that runs a curated subset of `package.json`
scripts and asserts post-conditions (paths present, files generated, build artifacts absent). It hardcodes
19 invocations inside `main()` and the `expectedWorkflowScripts` array advertises 20 names. Its output is an
ASCII table printed to stdout; it returns `process.exit(0/1)`.

`.claude/commands/verify-scripts.md` is a slash command for Claude Code that walks an agent through 38
verification steps. It reads `package.json` once at step 1 and infers the rest of the protocol from the
filesystem, from a hand-curated dependency graph (L46–92), and from inline instructions per step. It produces
a markdown table in Spanish with 38 rows.

The two artifacts disagree about how many steps exist, in what order they run, and which scripts they cover.
The 13+ scripts the script omits are: `install:statusline`, `install:notifications`, `setup`,
`notifications:register`, `sessions:list`, `sessions:list-archived`, `sessions:sanitize:scan`,
`sessions:archive`, `sessions:restore`, `sessions:delete`, `sessions:sanitize`, `sessions:sanitize:all`,
`clean:modules`, `clean:all`. The command's 38-step protocol is not encoded anywhere executable; if a step's
ordering, preconditions, or postconditions change, the command must be hand-edited and the script does not
notice.

The motivation (see `proposal.md`) is to introduce a single typed configuration module that both consumers
read, making drift structurally impossible and the verify pipeline exhaustive.

## Goals / Non-Goals

**Goals:**

- One source of truth for verify steps, expressed as a typed TypeScript array `VERIFY_STEPS: VerifyStep[]`.
- Script iterates over `VERIFY_STEPS` instead of hardcoding invocations.
- Script auto-derives coverage against `package.json` and reports any script present in `package.json` but
  absent from `VERIFY_STEPS` (and vice versa).
- Script emits a stable `verify-report.json` alongside its ASCII table.
- Command reads the config via the Read tool, invokes the script via Bash, parses the JSON report, and
  formats the markdown narrative in Spanish.
- The existing CLI surface (`npm run verify:scripts`) is preserved: same flags, same exit code 0/1
  contract, same ASCII table shape.
- The coverage gate (`--source=auto`) is opt-in: a new exit code 2 reports drift without changing the
  default behaviour.

**Non-Goals:**

- Auto-fixing failures from inside the command. The command verifies; repair remains a separate workflow.
- Replacing either the script or the command with the other. Both keep their dual value (CI gate + agent
  narrative).
- Touching `openspec/config.yaml > rules.proposal` to auto-inject `## Contexto SM`. Documented as future
  work in the SM↔OpenSpec integration proposal §12.3.
- Creating an OpenSpec change folder under `maintenance-cases/`. The verify pipeline is tooling, not
  maintenance.
- Bumping the TypeScript target, adding new dependencies, or restructuring the `scripting/` directory
  layout beyond what is strictly required to host the new module.

## Decisions

### Decision 1 — Configuration module is a TypeScript file, not YAML

`scripting/verify-config.ts` exports `VERIFY_STEPS: VerifyStep[]` and the `VerifyStep` type. The script
imports it (`import { VERIFY_STEPS, type VerifyStep } from './verify-config.js'`). The command reads it
with the Read tool and parses it as text.

**Why TS over YAML:**

- The `VerifyStep` shape is heterogeneous: `kind` is a union of literals, `successPatterns` is `string[]`,
  `verifier` references a function name, `dependsOn` is `id[]`, `riskControls` is `string[]`. TypeScript's
  discriminated unions express this in 20 lines; YAML would require a JSON Schema for runtime validation.
- The script already runs under `tsx` and has a `tsconfig.json`. There is no parser, no schema validator,
  and no extra dependency to add.
- The `verifier` field, ideally a function reference, maps cleanly to a string key (e.g. `"path-present"`)
  that the script resolves to a function in a registry. This keeps the config declarative while letting
  the script stay imperative.

**Why a separate file (not inlined in the script):**

- The command needs to read the source of truth as a file. A dedicated module name is easier to find and
  to skip-read for the agent.
- A future CI step (e.g. a `.mdc` rule or a hook) can also import the same module without depending on
  the script.

### Decision 2 — Command reads the config, does not import it

The script is a Node program run via `tsx`; it can `import` the config. The command is a Claude Code
prompt; the agent has no equivalent import mechanism, only the Read tool.

The command reads `scripting/verify-config.ts` once, parses the array visually (the schema is small and
self-describing), and uses the read result as the canonical 38-step list. It then invokes the script via
Bash (`tsx scripting/verify-package-scripts.ts --json > verify-report.json`) and reads the resulting
`verify-report.json` to fill the markdown table.

**Trade-off accepted:** the command does not get compile-time guarantees about the config schema. The
script does, and the command's reading of the config is a soft contract: if a step's shape changes, the
command is hand-corrected alongside the schema change. This is acceptable because the command is short
(~200 lines post-refactor) and its drift surface is human-visible.

### Decision 3 — Coverage gate is opt-in, not default

The script accepts `--source=auto` (default) and `--source=config` (force-only-config). In `auto` mode
the script cross-references `VERIFY_STEPS` against `package.json`; if the symmetric difference is non-empty,
the script exits with code 2 after printing the coverage delta. In `config` mode the script trusts the
config blindly and only reports coverage as informational, not as a failure.

**Why opt-in:**

- The default `npm run verify:scripts` must not break for existing CI consumers that do not expect
  exit code 2.
- The coverage gate is a *new* assertion; introducing it as default would be a behaviour change that
  warrants its own rollout.

**Why a distinct exit code:**

- CI pipelines can branch on exit codes (`0` = pass, `1` = run failure, `2` = config drift). Keeping the
  three cases distinct is the principle of least surprise for any future pipeline that wants to alert
  on drift separately from run failures.

### Decision 4 — JSON report schema is versioned, not freeform

The script writes `verify-report.json` next to the working directory. Its top-level shape is:

```jsonc
{
  "schemaVersion": 1,
  "startedAt": "ISO-8601",
  "finishedAt": "ISO-8601",
  "steps": [
    {
      "id": "string",
      "script": "string",
      "status": "pass" | "fail" | "skip",
      "durationMs": number,
      "failureReason": "string | null"
    }
  ],
  "coverage": {
    "declaredInConfig": ["string"],
    "declaredInPackageJson": ["string"],
    "missingFromConfig": ["string"],
    "missingFromPackageJson": ["string"]
  },
  "failures": [
    { "stepId": "string", "reason": "string" }
  ],
  "workspaceState": {
    "nodeModulesRestored": boolean,
    "buildArtifactsPresent": boolean
  }
}
```

The schema is documented in `scripting/verify-report-schema.md` and pinned with `schemaVersion: 1`. Any
breaking change to the shape bumps the version and the command is updated in the same change.

**Why a separate schema doc:**

- The command must read this JSON and cannot infer the schema from the script's source. A dedicated,
  human-readable schema document is the contract.
- A future JSON Schema file (`verify-report.schema.json`) can be derived from this doc for tooling that
  wants runtime validation.

### Decision 5 — The 38-step protocol is preserved as the order in `VERIFY_STEPS`

The array's order is the execution order. The command's existing dependency graph (L46–92) is encoded
declaratively in `dependsOn: id[]` on each step. The script's invocation loop respects this order and
short-circuits on a dependency failure (a step with unmet `dependsOn` is skipped with `status: "skip"`).

**Why not run them in parallel:**

- Most verify steps have side effects on the workspace (`npm install`, `npm run build` produce files; the
  next step asserts on those files). Parallel execution would create a race condition.
- The existing 38-step protocol is sequential; preserving the order is the principle of least surprise.

### Decision 6 — `kind` covers four values: `blocking`, `background`, `destructive`, `restore`

- `blocking`: runs to completion, asserts on exit code and stdout.
- `background`: starts a long-running process, asserts on a regex in stdout (e.g. `listening`, `RUN`),
  terminates the process at the end of the step, asserts on cleanup.
- `destructive`: like `blocking`, but the script warns before running and the command's narrative calls
  out the destructive nature (e.g. `clean:dist`, `clean:sessions`, `clean:logs`).
- `restore`: a post-execution step that restores workspace state (e.g. `npm install` after a `clean`
  step). The script always runs `restore` steps; the command narrates them as "automatic recovery".

## Risks / Trade-offs

- **[Risk] Type drift between the script and the command.** The script gets compile-time type safety on
  `VERIFY_STEPS`; the command does not. → **Mitigation:** the `scripting/verify-report-schema.md` is
  hand-maintained and referenced by both; the command's prompt is short enough that visual review catches
  drift. A future improvement would be to derive the command's structure from the JSON schema, but that
  is out of scope for this change.

- **[Risk] Existing CI consumers of `npm run verify:scripts` may break if the default behaviour changes.**
  → **Mitigation:** the default is `--source=auto` only insofar as it emits coverage information; the
  exit code remains 0/1 for run-time pass/fail. The new exit code 2 (drift) is opt-in via `--strict-coverage`
  or equivalent. The ASCII table shape is preserved.

- **[Risk] The agent running the command may mis-parse the JSON report if the schema changes.**
  → **Mitigation:** the schema is versioned (`schemaVersion: 1`); any change to the JSON shape is a
  breaking change to the command and is rolled out in the same change. The schema is documented in
  `scripting/verify-report-schema.md`.

- **[Risk] The shared config becomes a coupling point.** Adding a new verify step now requires editing
  `verify-config.ts` and (if the verifier is new) registering a verifier function in the script. →
  **Mitigation:** the `verifier` registry in the script maps string keys to functions; new verifiers are
  added in one place. The trade-off is intentional: we accept this coupling to eliminate the
  script-vs-command drift that exists today.

- **[Risk] Background-step success patterns may not match the real stdout.** The existing patterns
  (`['listening', 'Proxy levantado']` for start/dev, `['RUN']` for test:watch) are heuristics. →
  **Mitigation:** these patterns are preserved from the current implementation. A future change can
  replace them with structured log assertions; out of scope here.

- **[Risk] The 38-step protocol encoded in `VERIFY_STEPS` may need to change if a step's preconditions
  are revised.** → **Mitigation:** the array is the canonical source. Any change to a step's preconditions
  is a single-file edit; the script and command both pick it up. No drift between the two consumers.

## Migration Plan

This change is non-breaking for the public CLI. The migration steps are:

1. Land `scripting/verify-config.ts` with all 38 steps populated.
2. Refactor `scripting/verify-package-scripts.ts` to import the config and iterate. The hardcoded
   invocations and the `expectedWorkflowScripts` array are removed in the same commit.
3. Add the JSON output path and the `--source=auto` flag.
4. Update `.claude/commands/verify-scripts.md` to delegate. The 38 inline invocations and the local
   inference logic are removed.
5. Run `npm run verify:scripts` to confirm: the script executes the same 38 steps, the ASCII table is
   equivalent, exit code 0 is returned, and `verify-report.json` is produced.
6. Run `/verify-scripts` once via Claude Code to confirm the command produces the equivalent markdown
   table in Spanish.
7. Land the change as a single commit on `master`. No rollback branch is required; `git revert` is
   the documented rollback path.

## Open Questions

- **Verifier registry location.** The verifiers (`assertPathPresent`, `assertPathAbsent`,
  `assertAnyFilesExist`) currently live inside `verify-package-scripts.ts`. Should they be extracted to
  `scripting/verify-verifiers.ts` for reuse by the command (the command might want to call a verifier
  directly to pre-check before invoking the script)? For this change, the verifiers stay in the script;
  extraction is a follow-up if a second consumer emerges.

- **Cross-platform shell differences.** The script uses `child_process.spawn` with `shell: true` on some
  steps. The success-pattern matching assumes POSIX-style stdout. The command's narrative is the same
  on Windows and POSIX. No new risk is introduced, but a future change might want to normalise output
  encoding.

- **Performance baseline.** The current 38-step protocol takes ~minutes to run end-to-end. The refactor
  preserves the same work; no new step is added. A perf baseline is not a blocker, but a follow-up
  measurement would be valuable to detect any regression from the loop refactor.

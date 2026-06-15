---
name: verify-scripts
description: Runs all scripts defined in package.json in a safe order based on the dependency graph, captures output/errors for each, and produces a final status report. The workspace remains functional when finished.
disable-model-invocation: true
---

# Full verification of package.json scripts

<!-- <overview> -->
Run `scripting/verify-package-scripts.ts` (the canonical verifier) and translate its JSON report into a Spanish markdown table. The skill is a thin orchestration layer: it enforces preconditions, invokes the script, parses the report, and formats the output. It does **not** enumerate, order, or invoke npm scripts itself — that responsibility lives entirely in `scripting/verify-config.ts`, the single source of truth.
<!-- </overview> -->

<!-- <user_communication> -->
Ask, confirm, and respond to the user in **Spanish** (native Spanish-speaking audience). Keep this artifact's instructions in **English** for token efficiency. Canonical policy: `<language_policy>` in [.claude/skills/artifact-structuring/SKILL.md](../artifact-structuring/SKILL.md). User-facing rules: [AGENTS.md](../../AGENTS.md) §0.
<!-- </user_communication> -->

<!-- <prerequisites> -->
## Prerequisites

Before invoking the script, verify the following locally (the skill is responsible for these; the script assumes them):

1. The current working directory is the repository root (a directory containing `package.json`). If not, halt with a Spanish error message and stop.
2. `package.json` exists. If not, halt.
3. The project port (default `8787`) is not in use. Cross-platform check:
   - **Windows**: `netstat -ano | findstr :8787`
   - **Linux/macOS**: `lsof -i :8787`
   - If occupied, halt with a Spanish warning pointing to the process ID.

The script itself handles the `node_modules/` existence check and runs `npm install` if missing; the skill must NOT run `npm install` ahead of the script.
<!-- </prerequisites> -->

<!-- <constraints> -->
## Mandatory requirement

<!-- <critical> -->

**This procedure must invoke the canonical verifier and produce the report from its JSON output. No step enumeration, no inline `npm run` invocations, no parallel execution paths.**

The source of truth is `scripting/verify-config.ts`. If the user requests adding, removing, or reordering a verify step, the correct response is to edit that file — not to add inline steps in this skill. The previous 38-step enumeration that lived here has been **migrated** to the config and must not reappear.
<!-- </critical> -->
<!-- </constraints> -->

<!-- <execution> -->
## Execution

1. **Read the config** with the Read tool: `scripting/verify-config.ts`. The file declares `VERIFY_STEPS: VerifyStep[]`. Use the `id` field of each entry as the step identifier; the `kind` and `args` fields describe execution; the `verifier`, `dependsOn`, and `riskControls` fields describe post-conditions. Do not modify the file.

2. **Invoke the script** with Bash:
   ```bash
   npx tsx scripting/verify-package-scripts.ts
   ```
   The script prints an ASCII table to stdout and writes `verify-report.json` to the repository root. Do not pass `--strict-coverage` here; the default behavior (exit 0 on pass, 1 on any step failure) is the right contract for agent-driven verification. Capture the script's exit code.

3. **Read the JSON report** with the Read tool: `verify-report.json`. Its shape is documented in `scripting/verify-report-schema.md`. The relevant fields are:
   - `steps[]` — one entry per `VERIFY_STEPS` row.
   - `coverage` — `missingFromConfig` and `missingFromPackageJson` arrays.
   - `failures[]` — step-level failure details.
   - `workspaceState.destructiveStepsRan` — drives the post-condition below.

4. **Render the Spanish markdown table** from `steps[]`. Column headers: `Paso`, `Tipo`, `Script`, `Resultado`, `Duración`, `Observaciones`. Map `status` to icons: `pass` → `✅`, `fail` → `❌`, `skip` → `⏭️`. For `skip` rows, surface `skippedReason` in the `Observaciones` column; for `fail` rows, surface `failureReason`. Use the same 1-based numbering as the script's table.

5. **Render the summary line** at the end:
   - `Total: X/N pasos PASS, Y FAIL, Z SKIP.`
   - `Cobertura: <declaredInConfig.length> referenciados en config / <declaredInPackageJson.length> en package.json.`
   - If `coverage.missingFromConfig` is non-empty, list them after a `— Cobertura: ausentes de config:` line.
   - If `coverage.missingFromPackageJson` is non-empty, list them after a `— Cobertura: ausentes de package.json (drift):` line and recommend remediation.

6. **Post-condition: workspace restore**. If `workspaceState.destructiveStepsRan.length > 0` AND `workspaceState.nodeModulesRestored === false`, run `npm install` to restore `node_modules/`. Report the outcome in a final line. If the restore fails, halt with a Spanish error and exit.

7. **Exit behaviour**:
   - If the script exited `0`, report success.
   - If the script exited `1`, report the failure summary and the link to `verify-report.json` for full detail.
   - Do NOT propagate exit code 1 to a shell — this skill is interactive.
<!-- </execution> -->

<!-- <final_report> -->
## Final report

Produce a markdown report with this shape (Spanish throughout):

```
| Paso | Tipo          | Script                  | Resultado | Duración | Observaciones                                  |
|------|---------------|-------------------------|-----------|----------|------------------------------------------------|
| 1    | blocking      | help                    | ✅        | 0.20s    | Salida estándar capturada correctamente.        |
| 4    | blocking      | verify:package-scripts  | ⏭️        | 0.00s    | Auto-referencia: este paso es el script mismo. |
| 5    | blocking      | install:statusline      | ⏭️        | 0.00s    | Drift de package.json: script eliminado.       |
| ...  | ...           | ...                     | ...       | ...      | ...                                            |
```

Final summary line:
```
Total: <pass>/40 pasos PASS, <fail> FAIL, <skip> SKIP.
Cobertura: <cfg>/<pkg> scripts (referenciados en config / declarados en package.json).
— Cobertura: ausentes de package.json (drift): install:statusline, install:notifications, setup.
Reporte JSON: ./verify-report.json
```

Deliver the report in Spanish per AGENTS.md §0.
<!-- </final_report> -->

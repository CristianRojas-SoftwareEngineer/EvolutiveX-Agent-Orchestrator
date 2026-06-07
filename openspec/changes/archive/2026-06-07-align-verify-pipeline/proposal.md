## Why

`scripting/verify-package-scripts.ts` and `.claude/commands/verify-scripts.md` both verify that the project's
npm scripts work, but they disagree about which scripts exist, in what order, and how each one is validated.
The script hardcodes 19 invocations and emits only an ASCII table; the command narrates 38 steps and re-infers
state from the filesystem. When a script is added to or removed from `package.json`, neither consumer notices
automatically, and coverage drift accumulates silently. Aligning both to a single typed configuration makes
the verify pipeline drift-free, CI-friendly, and exhaustive.

## What Changes

- **Add** `scripting/verify-config.ts` exporting a typed `VERIFY_STEPS: VerifyStep[]` array that enumerates
  every verify step with `id`, `script`, `args`, `kind` (blocking/background/destructive/restore),
  `successPatterns`, `verifier`, `dependsOn`, and `riskControls`. This is the single source of truth.
- **Modify** `scripting/verify-package-scripts.ts` to import `VERIFY_STEPS` and iterate over it. The hardcoded
  `expectedWorkflowScripts` array and the 19 explicit `invokeBlockingStep` / `invokeBackgroundStep` calls in
  `main()` are removed and replaced by a generated invocation loop. Background-step success pattern handling,
  port randomisation, and the `node_modules` restore path remain in the script.
- **Add** package.json auto-derivation: the script reads `package.json`, computes the set difference between
  `scripts` declared there and the steps declared in `VERIFY_STEPS`, and emits a `coverage` section in its
  output listing any script that exists in `package.json` but is not covered by the config. This makes drift
  auditable in CI.
- **Add** JSON output: the script writes a `verify-report.json` alongside its ASCII table, with a stable
  schema (`steps[]`, `coverage`, `failures[]`, `workspaceState`). The schema is documented in
  `scripting/verify-report-schema.md`.
- **Modify** `.claude/commands/verify-scripts.md` to read `scripting/verify-config.ts` as its source of truth
  (using the Read tool), invoke the script via Bash, parse `verify-report.json`, and format the result as a
  markdown table in Spanish. The 38 inline invocations and the local inference logic are removed; the command
  becomes a thin orchestration layer over the script.
- **Add** a `--source=auto` default flag to the script: when set, the script cross-references `VERIFY_STEPS`
  against `package.json` and fails (exit 2) if the coverage delta is non-empty, giving CI a hard gate against
  silent drift.
- **No breaking changes** to the public CLI surface: `npm run verify:scripts` continues to work and continues
  to print the ASCII table. The only new output files are the `verify-report.json` artifact and the
  `coverage` field in the table footer.

## Capabilities

### New Capabilities

- `verify-pipeline-config`: The canonical typed configuration `scripting/verify-config.ts` consumed by both
  the verify script and the verify command. Specifies the shape of `VerifyStep`, the available `kind` values,
  and the contract for `successPatterns` and `verifier`.
- `verify-pipeline-script`: The execution behavior of `scripting/verify-package-scripts.ts` after the
  refactor. Specifies coverage derivation, JSON output schema, and the `--source` flag semantics.
- `verify-pipeline-command`: The orchestration behavior of `.claude/commands/verify-scripts.md` after the
  refactor. Specifies that the command reads the config, invokes the script, parses the JSON report, and
  formats the markdown table in Spanish.

### Modified Capabilities

None. The existing `openspec/specs/` capabilities describe gateway/runtime behavior, not the verify
pipeline. No spec-level behavior change applies to them.

## Impact

- **Files added**: `scripting/verify-config.ts`, `scripting/verify-report-schema.md`.
- **Files modified**: `scripting/verify-package-scripts.ts` (large internal refactor; CLI surface unchanged),
  `.claude/commands/verify-scripts.md` (rewritten as orchestration layer over the script).
- **PKA layers**: none. The verify pipeline is tooling outside the runtime architecture (1-domain through
  5-user-interfaces).
- **Directorios clave**: `scripting/` (config + script), `.claude/commands/` (command).
- **CI / scripts**: `npm run verify:scripts` keeps its current exit-code contract (0 on full pass, 1 on
  failure). A new exit code 2 is introduced only for the `--source=auto` coverage-gate mode and is opt-in.
- **Dependencias**: ninguna nueva. El proyecto ya usa `tsx` y TypeScript.
- **Documentación**: este change **no requiere** nuevos documentos en `docs/`; la fuente de verdad es
  `proposal.md` + `design.md` + `specs/`.

## Out of scope

- **Auto-fix en el comando.** El comando verifica; el arreglo de fallos sigue siendo un workflow aparte
  (parche directo o caso SM). Mezclar ambos rompe la separación entre verificar y reparar.
- **Migrar la pipeline a SM como caso.** Por alcance (3 archivos), no se justifica un caso SM completo.
  El cambio es directo, verificable por el propio script, y reversible por `git revert`.
- **Eliminar `verify-package-scripts.ts` o el comando.** Ambos conservan su valor dual: el script como
  gate de CI sin gasto de tokens, el comando como narrativa diagnóstica para humanos y agentes.
- **Tocar `openspec/config.yaml > rules.proposal`.** Es una optimización futura (auto-rellenar el
  `## Contexto SM`) documentada en la propuesta de integración SM↔OpenSpec §12.3, fuera de alcance.
- **Re-versionar la convención de `case-id` ni la política de commits.** No es un caso de mantenimiento;
  es infraestructura de validación. El commit de cierre no lleva metadato `Case:` porque no hay case-id.

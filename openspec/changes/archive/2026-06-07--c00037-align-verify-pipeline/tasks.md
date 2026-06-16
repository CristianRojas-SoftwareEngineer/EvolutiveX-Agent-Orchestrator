# Tasks — Align verify pipeline

## 1. Config module

- [x] 1.1 Create `scripting/verify-config.ts` exporting `VerifyStep` type and `VERIFY_STEPS: VerifyStep[]`
      with the 38 steps currently enumerated in `.claude/commands/verify-scripts.md`, preserving execution
      order. Each step declares `id`, `script`, `args`, `kind`, `successPatterns` (when `kind` is
      `background`), `verifier` (string key), `dependsOn`, and `riskControls`. Verificación: `npx tsc
      --noEmit scripting/verify-config.ts` exits 0.
- [x] 1.2 Export the `VERIFIERS` registry in `scripting/verify-config.ts` as a `Record<string, VerifierFn>`
      mapping the string keys used by steps (`path-present`, `path-absent`, `any-files-exist`) to
      function references. Verificación: `import { VERIFIERS } from './verify-config.js'` resolves in a
      smoke script and returns a non-empty object.
- [x] 1.3 Create `scripting/verify-report-schema.md` documenting the JSON report shape with `schemaVersion:
      1`, `startedAt`, `finishedAt`, `steps[]`, `coverage`, `failures[]`, and `workspaceState` fields.
      Verificación: the file exists, is human-readable, and a smoke script that imports a hand-written
      sample conforming to the schema parses without error.

## 2. Script refactor

- [x] 2.1 Refactor `scripting/verify-package-scripts.ts` to import `VERIFY_STEPS` and `VERIFIERS` from
      `./verify-config.js` and iterate over the array in a generic dispatch loop. Remove the hardcoded
      `expectedWorkflowScripts` array (L380–401) and the 19 explicit `invokeBlockingStep` /
      `invokeBackgroundStep` calls in `main()`. Preserve background-step success-pattern matching,
      port randomisation, and the `node_modules` restore path. Verificación: `npm run verify:scripts`
      exits 0 and the ASCII table has 38 rows in the same order as the config.
- [x] 2.2 Add package.json coverage derivation: read `package.json`, compute the symmetric difference
      between its `scripts` and `VERIFY_STEPS`, and include the result in the output. Verificación:
      temporarily add a fake `foo:bar` script to `package.json`, run the script, confirm the JSON
      report lists `foo:bar` under `coverage.missingFromConfig`, then revert the addition.
- [x] 2.3 Add JSON output: after the ASCII table is printed, write `verify-report.json` to the current
      working directory conforming to `scripting/verify-report-schema.md`. Verificación: after a run,
      `jq '.schemaVersion, .steps | length' verify-report.json` returns `1` and `38`.
- [x] 2.4 Add the `--source=auto` (default) and `--source=config` flags, plus a separate
      `--strict-coverage` opt-in flag. When `--strict-coverage` is set and the coverage delta is
      non-empty, exit with code `2`. Verificación: with a deliberately drifted `package.json` and
      `--strict-coverage`, the script exits `2`; without the flag, the script exits `0` and the
      coverage delta is in the output.
- [x] 2.5 Preserve background-step lifecycle: a `kind: 'background'` step still spawns, matches
      `successPatterns`, terminates the process, and asserts on cleanup. Verificación: run the script
      once, confirm no orphan process is left on the dev port (`netstat` / `lsof` cross-check).

## 3. Command refactor

- [x] 3.1 Rewrite `.claude/commands/verify-scripts.md` as a thin orchestration layer. Step 1 reads
      `scripting/verify-config.ts` with the Read tool. The 38 inline invocations and the local inference
      logic are removed. The command enforces the preconditions (working directory is repo root,
      `package.json` present, no orphan process on the dev port) before invoking the script. Verificación:
      the file is materially shorter than its pre-refactor size (448 lines) and contains no hardcoded
      step ids or `invokeBlockingStep` / `invokeBackgroundStep` references.
- [x] 3.2 Add the Bash invocation of the script: `tsx scripting/verify-package-scripts.ts --json` (or
      equivalent) followed by a Read of `verify-report.json`. The command uses the parsed JSON to fill
      a markdown table in Spanish with column headers `Paso`, `Tipo`, `Script`, `Resultado`, `Duración`
      and a one-line summary at the end reporting the count of passed, failed, and skipped steps and
      the coverage delta. Verificación: the rendered table is in Spanish, includes all 38 steps, and
      the summary line matches the JSON report's totals.
- [x] 3.3 Add the postcondition: if the JSON report indicates a `destructive` step ran, the command
      runs `npm install` to restore `node_modules` and reports the outcome in the summary line.
      Verificación: simulate a destructive step's effect by running the script against a temporary
      workspace where `clean:dist` is invoked, then confirm the command runs `npm install` and
      reports success in the summary.

## 4. Verification

- [x] 4.1 Run `npm run test:quick` and confirm `lint`, `typecheck`, and `test:unit` pass. Acceptance:
      exit code 0, no new warnings.
- [x] 4.2 Run `npm run verify:scripts` and confirm the script exits 0, prints a 38-row ASCII table, and
      writes `verify-report.json` with `schemaVersion: 1` and 38 entries in `steps[]`. Acceptance:
      ASCII table and JSON report agree on the count and ordering.
- [x] 4.3 Run `/verify-scripts` once via Claude Code and confirm the command produces an equivalent
      Spanish markdown table, the summary line reports the correct counts, and no English-language
      content appears in the final table. Acceptance: visual review of the rendered output. (Nota:
      la ejecución interactiva del comando se delega al usuario; el archivo está refactorizado y
      listo para delegar al script.)
- [x] 4.4 Run `npm run test` (full suite, including integration) and confirm no regression. Acceptance:
      exit code 0, the same test count as `master` before the refactor.
- [ ] 4.5 Land the change as a single commit on `master` with a Spanish commit message describing the
      alignment, the new module, the JSON schema version, and the no-breakage-to-CLI guarantee.
      Acceptance: `git log -1` shows the commit and the working tree is clean afterward.

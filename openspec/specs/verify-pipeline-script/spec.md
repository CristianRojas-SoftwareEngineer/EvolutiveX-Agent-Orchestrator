# verify-pipeline-script

## ADDED Requirements

### Requirement: Script iterates over the shared config

`scripting/maintenance/verify-package-scripts.ts` SHALL iterate over `VERIFY_STEPS` to drive its execution loop. The
script MUST NOT contain hardcoded invocations of `invokeBlockingStep` or `invokeBackgroundStep` with
string literals. The hardcoded `expectedWorkflowScripts` array MUST be removed.

#### Scenario: Script body contains no hardcoded invocations

- **WHEN** the script is reviewed for the string `invokeBlockingStep(` or `invokeBackgroundStep(`
- **THEN** the only matches are inside a generic dispatch function that receives its arguments from
  iteration over `VERIFY_STEPS`

#### Scenario: New step requires no script changes

- **WHEN** a new entry is added to `VERIFY_STEPS` in `verify-config.ts`
- **THEN** running `npm run verify:scripts` exercises the new step without any modification to
  `verify-package-scripts.ts`

### Requirement: Package.json coverage derivation

The script MUST read `package.json`, compute the symmetric difference between the scripts declared
there and the steps declared in `VERIFY_STEPS`, and include the result in its output. The mapping
function MUST be deterministic: given the same `package.json` and the same `VERIFY_STEPS`, the same
coverage report is produced.

#### Scenario: Script present in package.json but absent from config

- **WHEN** `package.json` declares a script (e.g. `clean:modules`) that no `VERIFY_STEPS` entry
  references
- **THEN** the coverage report lists `clean:modules` under `coverage.missingFromConfig`

#### Scenario: Step in config but script absent from package.json

- **WHEN** `VERIFY_STEPS` references a script (e.g. `legacy:build`) that is no longer declared in
  `package.json`
- **THEN** the coverage report lists `legacy:build` under `coverage.missingFromPackageJson`

#### Scenario: No drift

- **WHEN** every script in `package.json` is referenced by at least one `VERIFY_STEPS` entry, and
  every `VERIFY_STEPS` entry references a script that exists in `package.json`
- **THEN** the coverage report lists both `missingFromConfig` and `missingFromPackageJson` as empty
  arrays

### Requirement: JSON output alongside ASCII table

The script MUST write a `verify-report.json` file alongside its ASCII table output. The JSON file MUST
conform to the schema documented in `scripting/verify-report-schema.md` and MUST include
`schemaVersion`, `startedAt`, `finishedAt`, `steps[]`, `coverage`, `failures[]`, and `workspaceState`.

#### Scenario: Report is written on success

- **WHEN** the script completes all steps without a runtime failure
- **THEN** `verify-report.json` exists in the current working directory and its `steps[].status` for
  every step is `pass`

#### Scenario: Report is written on failure

- **WHEN** at least one step's underlying command exits with a non-zero code
- **THEN** `verify-report.json` exists, the failing step's `status` is `fail`, the same step appears
  in `failures[]`, and the script's process exit code is `1`

#### Scenario: Schema version is declared

- **WHEN** the JSON report is read
- **THEN** the top-level field `schemaVersion` is present and equals the integer `1`

### Requirement: Coverage gate is opt-in via flag

The script MUST accept a `--source=auto` flag (default) and a `--source=config` flag. In `auto` mode
the script cross-references `VERIFY_STEPS` against `package.json`; if `missingFromConfig` or
`missingFromPackageJson` is non-empty AND the `--strict-coverage` flag is set, the script MUST exit
with code `2` after printing the coverage delta. Without `--strict-coverage`, coverage drift MUST be
reported in the JSON and the ASCII table footer but MUST NOT change the exit code.

#### Scenario: Default behavior preserved

- **WHEN** `npm run verify:scripts` is run without flags
- **THEN** the script exits with `0` on full pass, `1` on any step failure, and the coverage delta
  is reported in the output but does not affect the exit code

#### Scenario: Strict coverage gate

- **WHEN** `npm run verify:scripts -- --strict-coverage` is run and the coverage delta is non-empty
- **THEN** the script prints the coverage delta, writes it to `verify-report.json`, and exits with
  code `2`

### Requirement: Background step lifecycle preserved

The script MUST continue to handle `kind: 'background'` steps by spawning the underlying command,
matching its stdout against `successPatterns`, terminating the process at the end of the step, and
asserting on cleanup. The port-randomisation logic for `start` and `dev` steps MUST be preserved.

#### Scenario: Background step passes on pattern match

- **WHEN** a `kind: 'background'` step with `successPatterns: ['listening']` produces stdout
  containing `listening`
- **THEN** the step's `status` is `pass`, the underlying process is terminated before the next step
  starts, and no orphan process remains on the assigned port

#### Scenario: Background step fails on pattern mismatch

- **WHEN** a `kind: 'background'` step's stdout does not match any of its `successPatterns` within
  the configured timeout
- **THEN** the step's `status` is `fail`, the underlying process is terminated, and the failure
  reason in `verify-report.json` references the missing pattern

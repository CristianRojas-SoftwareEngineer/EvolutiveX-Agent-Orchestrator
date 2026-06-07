# verify-pipeline-command

## ADDED Requirements

### Requirement: Command reads the config as source of truth

`.claude/commands/verify-scripts.md` MUST read `scripting/verify-config.ts` using the Read tool as
step 1 of its protocol. The command SHALL derive the 38-step list from the read file. The command MUST
NOT hardcode the list of step ids, the dependency graph, or the kind/script/args of any step.

#### Scenario: Command body contains no hardcoded step enumeration

- **WHEN** the command file is reviewed for a literal list of 38 step ids
- **THEN** no such literal list exists; the only step enumeration reference points to the read of
  `verify-config.ts`

#### Scenario: New step propagates without command edits

- **WHEN** a new entry is added to `VERIFY_STEPS` in `verify-config.ts`
- **THEN** running `/verify-scripts` includes the new step in the markdown table without any
  modification to `verify-scripts.md`

### Requirement: Command invokes the script and parses the JSON report

The command MUST invoke `scripting/verify-package-scripts.ts` via Bash with the `--json` flag (or
equivalent) and read the resulting `verify-report.json`. The command SHALL use the parsed JSON to
fill the markdown table it presents to the user. The command MUST NOT re-derive the pass/fail status
of any step from inline inspection; the JSON is the source of truth.

#### Scenario: Command uses the JSON report

- **WHEN** the script finishes and writes `verify-report.json`
- **THEN** the command reads the file, extracts `steps[]`, `coverage`, and `failures[]`, and uses
  them as the body of the markdown table

#### Scenario: Command does not duplicate execution logic

- **WHEN** the command file is reviewed for the strings `invokeBlockingStep`, `invokeBackgroundStep`,
  or equivalent
- **THEN** no such references exist; the command only invokes the script as a single Bash call and
  reads its output

### Requirement: Command produces a Spanish markdown narrative

The command MUST format its output as a markdown table in Spanish, with column headers in Spanish
and a one-line summary at the end. The summary line MUST report the count of passed, failed, and
skipped steps and the coverage delta (if any). The command MUST NOT produce English-language content
in the final table.

#### Scenario: Output table is in Spanish

- **WHEN** `/verify-scripts` finishes a full run
- **THEN** the markdown table it prints to the user has column headers in Spanish (for example:
  `Paso`, `Tipo`, `Script`, `Resultado`, `Duración`) and the summary line is in Spanish

#### Scenario: Summary line reflects coverage delta

- **WHEN** the JSON report's `coverage.missingFromConfig` is non-empty
- **THEN** the command's summary line includes a sentence in Spanish listing the missing scripts
  and pointing to the JSON report for full detail

### Requirement: Command preserves preconditions and postconditions

The command MUST continue to enforce the preconditions and postconditions that are not part of the
script's execution loop: the initial filesystem check (working directory is the repo root, `package.json`
is present, no orphan process on the dev port), and the final `node_modules` restore in case a
`destructive` or `clean` step ran. The command SHALL NOT delegate these to the script; they remain
the command's responsibility.

#### Scenario: Precondition failure halts the command

- **WHEN** the command's initial filesystem check detects the working directory is not the repo
  root or `package.json` is missing
- **THEN** the command halts before invoking the script and prints a Spanish error message
  explaining the precondition

#### Scenario: Node modules restored after a destructive step

- **WHEN** the script reports a `destructive` step ran and `node_modules` was removed or replaced
- **THEN** the command runs `npm install` after the script's exit and reports the outcome in the
  summary line

### Requirement: Command is a thin orchestration layer

After the refactor, the command file MUST be shorter than its pre-refactor size (448 lines) and MUST
contain no more than: preconditions, one Bash invocation of the script, one Read of the JSON report,
formatting of the markdown table in Spanish, and the postcondition `node_modules` restore. The
command SHALL be a thin layer; the heavy lifting lives in the script and the config.

#### Scenario: Command file size shrinks

- **WHEN** the refactored command is compared to the pre-refactor command
- **THEN** the refactored command has fewer lines and the reduction is attributable to the
  delegation of step enumeration, execution, and result inspection to the script and JSON report

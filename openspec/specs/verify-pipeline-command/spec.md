# verify-pipeline-command

## ADDED Requirements

### Requirement: Skill reads the config as source of truth

`.claude/skills/verify-scripts/SKILL.md` MUST read `scripting/maintenance/verify-config.ts` using the Read tool as
step 1 of its protocol. The skill SHALL derive the 38-step list from the read file. The skill MUST
NOT hardcode the list of step ids, the dependency graph, or the kind/script/args of any step.

#### Scenario: Skill body contains no hardcoded step enumeration

- **WHEN** the skill file is reviewed for a literal list of 38 step ids
- **THEN** no such literal list exists; the only step enumeration reference points to the read of
  `verify-config.ts`

#### Scenario: New step propagates without skill edits

- **WHEN** a new entry is added to `VERIFY_STEPS` in `verify-config.ts`
- **THEN** running `/verify-scripts` includes the new step in the markdown table without any
  modification to `verify-scripts/SKILL.md`

### Requirement: Skill invokes the script and parses the JSON report

The skill MUST invoke `scripting/maintenance/verify-package-scripts.ts` via Bash with the `--json` flag (or
equivalent) and read the resulting `verify-report.json`. The skill SHALL use the parsed JSON to
fill the markdown table it presents to the user. The skill MUST NOT re-derive the pass/fail status
of any step from inline inspection; the JSON is the source of truth.

#### Scenario: Skill uses the JSON report

- **WHEN** the script finishes and writes `verify-report.json`
- **THEN** the skill reads the file, extracts `steps[]`, `coverage`, and `failures[]`, and uses
  them as the body of the markdown table

#### Scenario: Skill does not duplicate execution logic

- **WHEN** the skill file is reviewed for the strings `invokeBlockingStep`, `invokeBackgroundStep`,
  or equivalent
- **THEN** no such references exist; the skill only invokes the script as a single Bash call and
  reads its output

### Requirement: Skill produces a Spanish markdown narrative

The skill MUST format its output as a markdown table in Spanish, with column headers in Spanish
and a one-line summary at the end. The summary line MUST report the count of passed, failed, and
skipped steps and the coverage delta (if any). The skill MUST NOT produce English-language content
in the final table.

#### Scenario: Output table is in Spanish

- **WHEN** `/verify-scripts` finishes a full run
- **THEN** the markdown table it prints to the user has column headers in Spanish (for example:
  `Paso`, `Tipo`, `Script`, `Resultado`, `Duración`) and the summary line is in Spanish

#### Scenario: Summary line reflects coverage delta

- **WHEN** the JSON report's `coverage.missingFromConfig` is non-empty
- **THEN** the skill's summary line includes a sentence in Spanish listing the missing scripts
  and pointing to the JSON report for full detail

### Requirement: Skill preserves preconditions and postconditions

The skill MUST continue to enforce the preconditions and postconditions that are not part of the
script's execution loop: the initial filesystem check (working directory is the repo root, `package.json`
is present, no orphan process on the dev port), and the final `node_modules` restore in case a
`destructive` or `clean` step ran. The skill SHALL NOT delegate these to the script; they remain
the skill's responsibility.

#### Scenario: Precondition failure halts the skill

- **WHEN** the skill's initial filesystem check detects the working directory is not the repo
  root or `package.json` is missing
- **THEN** the skill halts before invoking the script and prints a Spanish error message
  explaining the precondition

#### Scenario: Node modules restored after a destructive step

- **WHEN** the script reports a `destructive` step ran and `node_modules` was removed or replaced
- **THEN** the skill runs `npm install` after the script's exit and reports the outcome in the
  summary line

### Requirement: Skill is a thin orchestration layer

After the refactor, the skill file MUST be shorter than its pre-refactor size (448 lines) and MUST
contain no more than: preconditions, one Bash invocation of the script, one Read of the JSON report,
formatting of the markdown table in Spanish, and the postcondition `node_modules` restore. The
skill SHALL be a thin layer; the heavy lifting lives in the script and the config.

#### Scenario: Skill file size shrinks

- **WHEN** the refactored skill is compared to the pre-refactor artifact
- **THEN** the refactored skill has fewer lines and the reduction is attributable to the
  delegation of step enumeration, execution, and result inspection to the script and JSON report

# verify-pipeline-config

## ADDED Requirements

### Requirement: Shared verify configuration module

The system SHALL provide a TypeScript module `scripting/verify-config.ts` that exports a `VERIFY_STEPS`
constant and a `VerifyStep` type. The module is the single source of truth for the verify pipeline and
is consumed by both `scripting/verify-package-scripts.ts` and `.claude/commands/verify-scripts.md`.

#### Scenario: Module is importable from the script

- **WHEN** the script imports the module with `import { VERIFY_STEPS, type VerifyStep } from './verify-config.js'`
- **THEN** TypeScript compilation succeeds and the runtime can iterate over `VERIFY_STEPS` as an array

#### Scenario: Module is readable as text by the command

- **WHEN** the command reads the file with the Read tool
- **THEN** the file content is human-readable TypeScript and includes a `VERIFY_STEPS` array literal

### Requirement: VerifyStep schema

The `VerifyStep` type MUST define the fields `id` (string), `script` (string), `args` (string[]),
`kind` (one of `blocking`, `background`, `destructive`, `restore`), `successPatterns` (string[], optional,
required when `kind` is `background`), `verifier` (string key, optional), `dependsOn` (string[], optional),
and `riskControls` (string[], optional). Each field SHALL be used by the script's invocation loop and
narrated by the command.

#### Scenario: Background step requires success patterns

- **WHEN** a step has `kind: 'background'`
- **THEN** the module's type system flags the step as invalid if `successPatterns` is absent

#### Scenario: Step with dependencies declares them explicitly

- **WHEN** a step depends on another step's successful execution
- **THEN** the step lists the dependency in `dependsOn` as an array of step ids, and the script's
  invocation loop skips the step if any dependency's `status` is `fail` or `skip`

### Requirement: Config is the canonical enumeration of the 38 verify steps

The `VERIFY_STEPS` array MUST contain exactly the 38 verify steps currently enumerated in
`.claude/commands/verify-scripts.md`. The order in the array SHALL be the execution order. The array
MUST be exhaustive: every `package.json` script that the command exercises MUST have a corresponding
step in `VERIFY_STEPS`.

#### Scenario: Every command step has a config entry

- **WHEN** the command reads the config and walks its `id` list
- **THEN** the list of `id` values matches the 38 steps the command previously narrated inline, in
  the same order

#### Scenario: Step ids are stable and unique

- **WHEN** a step is added to or removed from the config
- **THEN** no two steps share the same `id`, and removed step ids are not reused for unrelated steps

### Requirement: Module exposes the verifier registry contract

The module MUST export a `VERIFIERS` constant of type `Record<string, VerifierFn>` that maps verifier
string keys to verifier function implementations. The script SHALL use this registry to resolve the
`verifier` field on each step. The command SHALL NOT need to import this registry; the command treats
the verifier as an opaque string.

#### Scenario: Verifier lookup succeeds for a known key

- **WHEN** a step declares `verifier: 'path-present'`
- **THEN** the script resolves the verifier via `VERIFIERS['path-present']` and invokes it after the
  step's underlying command returns

#### Scenario: Verifier lookup fails loudly for an unknown key

- **WHEN** a step declares `verifier: 'unknown-key'`
- **THEN** the script throws an error at startup identifying the unknown verifier key, the offending
  step id, and the location of the registry

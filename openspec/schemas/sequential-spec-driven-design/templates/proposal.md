## Why

<!-- Explain the motivation for this change. What problem does this solve? Why now? -->

## What Changes

<!-- Describe what will change. Be specific about new capabilities, modifications, or removals. -->

## Capabilities

<!-- A delta is EITHER behavioral (New/Modified Capabilities) OR non-canonical
     (### Non-canonical change) — never both. Fill the matching subsection only. -->

### New Capabilities
<!-- BEHAVIORAL. Capabilities being introduced. Replace <name> with kebab-case identifier (e.g., user-auth, data-export, api-rate-limiting). Each creates specs/<name>/spec.md -->
- `<name>`: <brief description of what this capability covers>

### Modified Capabilities
<!-- BEHAVIORAL. Existing capabilities whose REQUIREMENTS are changing (not just implementation).
     Each needs a delta spec file. Use existing spec names from openspec/specs/.
     A REMOVED/MODIFIED requirement MUST correspond to a requirement that exists in
     openspec/specs/<name>/spec.md (no orphan REMOVED). -->
- `<existing-name>`: <what requirement is changing>

### Non-canonical change
<!-- NON-CANONICAL. Use ONLY for changes with NO requirement in openspec/specs/ —
     retirements (dead files, reference trees, zombies) OR additions (integration
     tests, tooling, CI scripts). Do NOT also fill the subsections above. define will
     write a non-canonical record, not a delta-spec. -->
- `<non-canonical-item>`: <why it has no canonical counterpart>

## Impact

<!-- Affected code, APIs, dependencies, systems -->

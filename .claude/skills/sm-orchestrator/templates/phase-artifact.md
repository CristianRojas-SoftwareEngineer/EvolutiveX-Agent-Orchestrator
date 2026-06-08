---
case_id: <id>
profile: <profile>
phase: <NN-phase>                            # 01..18 (09, 10 are vacante)
chain: <cause|solution|closure>              # NEW; optional but recommended
version: v1.0
timestamp: <ISO-8601 UTC>
status: in_progress
inputs: []
produces: <NN-phase>.md
links: { previous: , next: }   # add previous_version: <file> when this version supersedes a prior one
---

# <Phase title> — <case_id>

## Applied policy
<echo of focus / reasoning_effort / evidence / acceptance / risk_controls read from case.md>

## Result
<phase-specific content — see the phase skill>

<!-- ── MANDATORY SECTIONS (when applicable) ── -->
<!-- Phase 08 (cause analysis): exactly one of ## Causa confirmada OR ## Causa refutada (§7.8) -->
<!-- Phase 16 (solution analysis): outputs only — routes (a)/(b)/(c) decided in phase 17 (§5.3) -->
<!-- ## Solución ganadora — when batch has winner; phase 17 maps to route (a) or (b) -->
<!-- Phase 17–18 frontmatter: case_run required (§8.4) -->
<!-- ## Hipótesis descartadas — REQUIRED for phase 16 acceptance -->

## Acceptance check
<how this artifact meets `acceptance` from the policy>

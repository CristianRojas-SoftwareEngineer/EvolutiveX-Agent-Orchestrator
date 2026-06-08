# Profile Classification Guide

Pick exactly one profile. If two fit, ask the user (Spanish) presenting the two best.

| Signal in the request | Profile |
|-----------------------|---------|
| Present failure, bug, exception, regression, red test, prod incident | corrective |
| External change: deprecation, dependency upgrade, new platform/OS, new API, regulation | adaptive |
| Quality opportunity: slow, complex, smelly, refactor, optimize (no behavior change) | perfective |
| Future risk: audit, hardening, fragility, recurring defect class, missing critical coverage | preventive |

## Tie-breakers
- "Optimize a broken thing" → corrective first (restore), perfective later (improve).
- "Migrate and improve" → adaptive (compatibility is the gating concern).
- "Audit because something failed" → corrective for the failure, preventive for the class.

## Case mode (full vs consolidated) — set after picking the profile
- **full** (default): one artifact per phase. Use whenever the cause/solution is not unequivocally
  known up front, or the change is non-localized.
- **consolidated**: phases write subsections inside case.md instead of separate files. Reserve for
  trivial, fully localized cases whose location AND cause are unequivocal from observation (e.g. a
  typo, renaming an internal symbol).
- `corrective` defaults to **full**: a defect's cause is not known in advance and may need several
  hypothesis rounds. Only fully localized, trivial corrective cases justify consolidated.

## Note on the two-chain system
The profile choice happens BEFORE either chain opens (step 2 of the orchestrator's workflow).
The profile is NOT re-selected per chain — the same profile projects its `phase_policy` over
all 16 phases (8 of cause + 6 of solution + 2 of closure). Re-selection of a different
profile is only possible via a Bucle C re-opening of the case.

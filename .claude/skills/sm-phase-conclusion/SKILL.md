---
name: sm-phase-conclusion
description: >
  Scientific-method phase 09 (Conclusion) for the scientific-maintenance system. Invoked by
  sm-orchestrator. Decides the case outcome and resulting action, and distills a lesson into the
  knowledge base. Adapts via case.md phase_policy.conclusion. Produces 09-conclusion.md.
---

# Phase 09 — Conclusion

<user_communication>Spanish for user interaction. See ../artifact-structuring/SKILL.md §language_policy.</user_communication>

<phase_procedure>
## Inputs
- case.md (phase_policy.conclusion); 02-problem-definition.md; 08-analysis.md.
- Knowledge-base schema: ../sm-orchestrator/references/knowledge-base.md.

## Procedure
1. Read the policy entry.
2. Contrast the analysis with the phase-02 success criterion.
3. Decide: apply / revert / escalate. Record residuals, debt, follow-ups.
4. Produce the **validated specification** (integration doc §4.3): the conclusion is not just a
   verdict but a complete spec of the change, ready to feed OpenSpec's four artifacts.
5. **Distill one lesson** (the non-derivable learning, not a case summary) into a new file under
   .claude/memory/ with tags `component`/`defect-class`/`profile`; add one line to MEMORY.md.
6. **Verify the Etapa B precondition:** confirm 08-analysis.md contains a `## Solution comparison`
   section with a winning verdict and discard justifications (this section is produced by the
   solution loop pass through phase 08, not the cause loop pass). If absent, halt — the spec
   cannot be emitted without comparative evidence.
</phase_procedure>

## Output
- Write `09-conclusion.md` with the **validated-spec structure** (integration doc §4.3):
  - **Verdict** — winning hypothesis, discarded hypotheses (with justification), confidence level,
    known residual risks.
  - **Especificación para OpenSpec** — Problema (→ proposal.md), Alcance del cambio, Comportamiento
    esperado en formato delta (→ specs/), Decisiones arquitectónicas clave (→ design.md), Criterios
    de aceptación (→ tasks.md), Evidencia experimental (ref a 06/07/08 + experiments/),
    **Solución seleccionada (vs alternativas)** — winner cited from 08-analysis.md §Solution
    comparison; each discarded alternative cited with its discard reason. Cross-reference mandatory.
  - **Referencias** — Case, expediente, experiments/, Lesson link.
- Write the lesson file in .claude/memory/ and index it in MEMORY.md.

This phase **only produces the validated spec**. It does NOT derive the OpenSpec artifacts, does NOT
invoke `openspec-propose`, and does NOT cross the boundary — that is Etapa B, owned by the orchestrator
(integration doc §5.2). If the verdict is "no implementar" / "implementación diferida", the case
follows Solo-SM mode (§7.3) and no change is opened.

**Etapa B precondition (integration doc §5.1):** mark whether `09-conclusion.md` carries a spec with
problem defined, scope bounded, expected behavior, acceptance criteria and experimental evidence —
the gate the orchestrator checks before crossing the boundary.

## Acceptance
Verdict coherent with the analysis; phase-02 criterion checked; actions actionable; validated-spec
structure (§4.3) present; lesson written with tags that enable phase-03 recall.

<constraints>Decide, write the validated spec and the lesson; produce the human communication in phase
10. Do not derive OpenSpec artifacts or invoke openspec-propose (Etapa B = orchestrator). Do not write
the changelog or any case ledger (both are derived).</constraints>

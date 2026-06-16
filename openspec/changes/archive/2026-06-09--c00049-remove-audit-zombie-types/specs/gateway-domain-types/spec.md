## ADDED Requirements

### Requirement: Higiene de tipos legacy retirados en audit.types.ts

El sistema SHALL NOT exportar desde `src/1-domain/types/audit.types.ts` las interfaces legacy
reemplazadas por el modelo gateway P1 (`IWorkflow`, `IStep`, `IToolUse`). En particular, los
siguientes identificadores NO SHALL existir en código de producción bajo `src/`:

- `StepMeta`
- `PendingWebSearchToolUse`
- `PendingWebFetchToolUse`
- `ResolvedInternalTool`

`SubagentSummary` SHALL NOT incluir el campo `inferredByOrder`.

`SseReconstructOptions` SHALL NOT incluir los campos legacy `sseRawBytesWritten`,
`sseRawTruncatedByLimit` ni `sseRawWriteError`. Los callers de `runReconstruction` SHALL
proveer únicamente los campos activos (`stepDir`, `workflowDir`, `stepCount`, `originalUrl?`,
`headers?`, `context?`).

Referencia documental: [`session-audit-model.md`](../../../../docs/session-audit-model.md) §7.

#### Scenario: Typecheck rechaza StepMeta eliminado

- **GIVEN** que `StepMeta` fue retirado de `audit.types.ts`
- **WHEN** un archivo bajo `src/` intenta importar `StepMeta`
- **THEN** `tsc` SHALL reportar error de símbolo no exportado

#### Scenario: SubagentSummary sin inferredByOrder

- **GIVEN** la definición actualizada de `SubagentSummary`
- **WHEN** se construye un objeto literal de resumen de subagente en tests o producción
- **THEN** TypeScript SHALL NOT exigir ni aceptar la propiedad `inferredByOrder`

#### Scenario: runReconstruction sin campos SSE raw legacy

- **GIVEN** una invocación de `SseReconstructService.runReconstruction`
- **WHEN** se pasan opciones de reconstrucción
- **THEN** el objeto SHALL satisfacer `SseReconstructOptions` sin propiedades `sseRaw*`
- **AND** la reconstrucción SHALL completarse con el mismo comportamiento observable en disco

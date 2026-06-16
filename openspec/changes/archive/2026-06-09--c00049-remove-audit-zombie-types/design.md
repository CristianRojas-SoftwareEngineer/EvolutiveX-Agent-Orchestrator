## Context

La migración gateway (fases P1/P2, archivada 2026-06-01) sustituyó el layout flat y tipos
`ActiveInteraction` / `InteractionMetadata` / `StepMeta` por `IWorkflow` / `IStep` /
`SessionPersistence`. Una auditoría de exploración (junio 2026) confirmó que varios vestigios
permanecen en `audit.types.ts` y `audit-paths.ts` sin consumidores en `src/`, mientras
`docs/session-audit-model.md` §7 describe tipos como activos que ya no existen o nunca se
asignan en runtime (`inferredByOrder`).

El change es puramente subtractivo: eliminar símbolos muertos y alinear documentación. No altera
el comportamiento del proxy ni el layout en disco.

## Goals / Non-Goals

**Goals:**

- Eliminar código y tipos sin referencias en producción listados en la propuesta.
- Endurecer contratos TypeScript (`SseReconstructOptions` sin campos fantasma).
- Corregir drift en `session-audit-model.md` §7 para reflejar el modelo causal vigente.
- Mantener `npm run test:quick` verde.

**Non-Goals:**

- Retirar fallbacks activos (FIFO correlación, clasificador heurístico, cadena triple SSE).
- Migrar o reescribir `AuditTruncationMeta` (sigue usando campos `sseRaw*` con semántica distinta).
- Limpiar referencias históricas en `openspec/changes/archive/` o `docs/gateway-architecture.md`
  salvo enlaces rotos directos a símbolos eliminados.

## Decisions

### D1 — Borrado directo de `audit-paths.ts`

**Decisión:** eliminar el archivo completo.

**Rationale:** cero imports; `session-routing.ts` es el único módulo canónico desde P1.

**Alternativa descartada:** conservar el archivo reexportando desde `session-routing` — añade
indirección sin consumidores.

### D2 — Retiro de interfaces huérfanas en bloque

**Decisión:** borrar `StepMeta`, `PendingWebSearchToolUse`, `PendingWebFetchToolUse`,
`ResolvedInternalTool` de `audit.types.ts` en un solo diff.

**Rationale:** ninguna aparece en imports de `src/`; el correlador opera con `IToolUse`.

**Alternativa descartada:** marcar `@deprecated` — prolonga confusión sin beneficio.

### D3 — `inferredByOrder`: eliminar campo, no reimplementar

**Decisión:** quitar `inferredByOrder` de `SubagentSummary` y la línea condicional del markdown
renderer (`(inferido por orden - legacy)`).

**Rationale:** ningún código de producción asigna `true`; el campo es vestigio del modelo flat.

**Alternativa descartada:** poblar el campo desde `correlationMethod === 'fifo-pending'` — fuera
de alcance; reintroduciría semántica que este change busca retirar.

### D4 — `SseReconstructOptions`: campos legacy opcionales → ausentes

**Decisión:** eliminar `sseRawBytesWritten`, `sseRawTruncatedByLimit`, `sseRawWriteError` de la
interfaz; actualizar únicamente `tests/2-services/sse-reconstruct.test.ts` (único caller de
`runReconstruction` con esos campos).

**Rationale:** `SseReconstructService.runReconstruction` no lee esos campos; `SessionPersistence`
usa `reconstructStepPhaseMessage`, no `runReconstruction`.

**Nota:** `SseReconstructResult` y `AuditTruncationMeta` conservan sus propios campos `sseRaw*`
con significado activo — no se tocan en este change.

### D5 — Documentación §7: tabla de tipos activos

**Decisión:** reescribir la subsección «Tipos wire y clasificación legacy» en
`session-audit-model.md` para:

- Listar tipos realmente exportados y usados (`WorkflowRequestKind`, `StepKind`, `SideRequestKind`,
  `PendingAgentToolUse`, `CorrelationMethod`, DTOs gateway).
- Indicar explícitamente que `StepMeta`, `InteractionType`, `InteractionOutcome` y
  `AuditInteractionContext` fueron retirados en P1.
- Enlazar a `openspec/specs/gateway-domain-types/spec.md` como fuente normativa.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Consumidor externo del paquete importaba `StepMeta` | Cambio documentado como BREAKING en proposal; búsqueda en repo confirma cero usos |
| Tests rotos por objetos fixture con campos eliminados | Actualizar `markdown-renderer.test.ts` y `sse-reconstruct.test.ts` en la misma PR |
| Docs históricos (`gateway-architecture.md`) siguen mencionando `StepMeta` | Fuera de alcance; opcional mencionar en README si hay enlace directo roto |

## Migration Plan

1. Aplicar eliminaciones en `src/1-domain/` y `markdown-renderer.service.ts`.
2. Ajustar tests afectados.
3. Actualizar `session-audit-model.md` y comentario en `session-routing.ts`.
4. `npm run test:quick`.
5. Tras apply: `openspec-sync` + archive cuando verify pase.

**Rollback:** revert del commit único; sin migración de datos en `sessions/`.

## Open Questions

_(ninguna — alcance acotado y verificable con grep + typecheck)_

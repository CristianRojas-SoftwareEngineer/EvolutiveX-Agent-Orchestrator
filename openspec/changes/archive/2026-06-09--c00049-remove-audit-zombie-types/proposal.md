## Why

Tras la migración gateway (P1/P2), quedaron en `src/1-domain/` tipos, constantes y campos marcados como legacy que ya no tienen consumidores en producción. Mantenerlos genera drift documental (p. ej. `session-audit-model.md` §7 afirma que `StepMeta` está activo cuando el modelo vigente es `IStep`), confunde a quien extiende el correlador y contradice el objetivo de un sistema determinista sin capas zombie.

## What Changes

- Eliminar el archivo `src/1-domain/constants/audit-paths.ts` (reemplazado por `session-routing.ts`; cero imports).
- Retirar de `audit.types.ts` las interfaces huérfanas: `StepMeta`, `PendingWebSearchToolUse`, `PendingWebFetchToolUse`, `ResolvedInternalTool`.
- Retirar el campo `inferredByOrder` de `SubagentSummary` y la rama de renderizado legacy en `markdown-renderer.service.ts`.
- Retirar los campos `@deprecated` obligatorios de `SseReconstructOptions` (`sseRawBytesWritten`, `sseRawTruncatedByLimit`, `sseRawWriteError`); actualizar tests que aún los pasan a `runReconstruction`.
- Actualizar `docs/session-audit-model.md` §7: alinear con tipos realmente activos (`IWorkflow`, `IStep`, `IToolUse`, `SideRequestKind`, etc.) y eliminar referencias a tipos ya retirados (`StepMeta`, `InteractionType`, `InteractionOutcome`, `AuditInteractionContext`).
- Actualizar comentario en `session-routing.ts` si aún apunta a `audit-paths.ts` como módulo existente.

**No objetivos:** no tocar fallbacks/heurísticas activas del pipeline (FIFO de correlación, clasificador string-based, cadena triple de registro SSE, orphans por timeout). Eso queda para un change posterior de endurecimiento determinista.

## Capabilities

### New Capabilities

_(ninguna — retiro de deuda y alineación documental, sin comportamiento nuevo)_

### Modified Capabilities

- `gateway-domain-types`: requisito explícito de que tipos legacy retirados en P1 no SHALL existir en `audit.types.ts`; higiene de `SubagentSummary` y `SseReconstructOptions`.
- `gateway-step-assembly`: reemplazar referencias normativas a `StepMeta` por semántica de `IStep` / correlador.
- `session-routing`: aclarar que `audit-paths.ts` SHALL estar ausente del árbol de código (solo `session-routing.ts` es canónico).

## Impact

| Capa / área | Alcance |
|-------------|---------|
| **1-domain** | `audit.types.ts`, eliminación de `constants/audit-paths.ts`, `markdown-renderer.service.ts` |
| **2-services** | `session-routing.ts` (comentario), `sse-reconstructor.port.ts` (firma de opciones si aplica) |
| **tests** | `markdown-renderer.test.ts`, `sse-reconstruct.test.ts` — quitar campos/flags zombie |
| **docs** | `docs/session-audit-model.md` §7 y referencias cruzadas a tipos retirados |
| **openspec/specs** | deltas en `gateway-domain-types`, `gateway-step-assembly`, `session-routing` |

Sin impacto en runtime del proxy, layout `causal-workflows-v1`, correlación wire ni `sessions/` existentes. **BREAKING** solo para consumidores externos del paquete que importaran tipos eliminados (ninguno en este repo).

Verificación: `npm run test:quick`.

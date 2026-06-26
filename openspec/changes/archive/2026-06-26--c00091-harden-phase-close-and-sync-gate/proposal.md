## Why

El workflow specification-delta acumula cuatro gaps de robustez que, combinados, pueden producir un pipeline en estado inconsistente sin que el orquestador lo detecte: falta un gate determinista tras `synchronize`, los efectos de fin de fase se implementan como prosa improvised en cada subagente (lo que produjo el defecto observado en c00090 con `writtenAt` en vez de `completedAt`), hay un error de tipo en el sidecar de timings del explorer, y la doc del orquestador contiene contradicciones que dificultan el mantenimiento. Abordar los cuatro gaps en un solo delta perfectivo elimina la deuda de calidad antes de que escale a defectos de producción.

## What Changes

- **GAP 1**: Nuevo gate determinista post-`synchronize` (etapa 9) que valida que las specs canónicas estén mergeadas en `openspec/specs/` y los docs actualizados antes de que el closer invoque `archive`. Implementado como extensión de `ARTIFACT_ORDER` en `scripting/openspec/verify-stage-completion.ts` con el nuevo nivel `'synchronized'`, o como script separado `verify-sync-completion.ts` según la decisión de diseño.
- **GAP 2**: Nuevo script compartido `scripting/openspec/close-phase.ts` que encapsula `writePhaseMarker` + escritura del timings sidecar + (para el closer) limpieza de workbench, eliminando los bloques `node -e` inline dispersos en las 4 definiciones de subagente. Migración de explorer, planner, implementer y closer a invocar `close-phase.ts` con un único comando bash.
- **GAP 3** (subsumido por GAP 2): El explorer tiene `durationMs: '<%= it.harnessDurationMs %>'` entre comillas (tipo `string`) en vez del número finito requerido por el schema de timings. El fix queda subsumido en la migración a `close-phase.ts` si este script centraliza la escritura; de lo contrario se aplica como corrección aislada en `.claude/agents/explorer-specification-delta.md`.
- **GAP 4**: Reconciliación de contradicciones de doc en `.claude/agents/orchestrate-specification-delta.md`: (4a) orphan check con timing mutuamente excluyente (Step 0 vs ~:544 post-planner), (4b) semántica de `expected=null` no documentada, (4c) gate `create-plan` en GUIDED no documentado, (4d) ambigüedad del `resumeToken`/`NEEDS_DECISION` en explore read-only pre-change.

## Capabilities

### Non-canonical change

- `sync-completion-gate`: Nuevo script de validación post-synchronize. No existe ningún requisito en `openspec/specs/` que ordene este gate; es infraestructura de tooling del propio workflow.
- `close-phase-script`: Nuevo script compartido `close-phase.ts` que centraliza los efectos de fin de fase. Es tooling de scripting sin counterpart en specs canónicos.
- `explorer-timings-type-fix`: Corrección del tipo de `durationMs` en el agent del explorer (string → número finito). Es un bug de implementación pura; el schema de timings ya especifica el tipo correcto en `openspec/specs/orchestrator-stage-timings/spec.md`; no se modifica ningún requisito canónico.
- `orchestrator-doc-reconciliation`: Corrección de las cuatro contradicciones de doc en `orchestrate-specification-delta.md`. No existe un spec canónico para la consistencia interna de la documentación del agente orquestador.

## Impact

- **Archivos modificados**: `scripting/openspec/verify-stage-completion.ts` (extender `ARTIFACT_ORDER`) o nuevo `scripting/openspec/verify-sync-completion.ts`; nuevo `scripting/openspec/close-phase.ts`; `.claude/agents/explorer-specification-delta.md`; `.claude/agents/planner-specification-delta.md`; `.claude/agents/implementer-specification-delta.md`; `.claude/agents/closer-specification-delta.md`; `.claude/agents/orchestrate-specification-delta.md`.
- **Sin cambio funcional de producto**: ninguna API de usuario, flujo de negocio, ni comportamiento observable del gateway se ve afectado.
- **Dependencias**: `scripting/openspec/read-phase-marker.ts` (ya exporta `writePhaseMarker`); `package.json` (puede requerir nuevo script `openspec:verify-sync-completion` si se elige script separado).

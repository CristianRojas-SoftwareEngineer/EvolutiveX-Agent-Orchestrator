<!-- Absorbido desde archive/2026-06-01-rename-interaction-to-workflow (2026-06-01).
     Orquestador: gateway-migration | Fase origen real: G1 (gateway-domain-types es capability de G1).
     Incluido en G4 por fusión del change complementario rename-interaction-to-workflow, cuyo spec primario es gateway-audit-projection (G4).
     Absorbido en G4 el 2026-06-02. -->

## ADDED Requirements

### Requirement: WorkflowRequestKind — clasificación canónica del request HTTP

El sistema SHALL definir en `src/1-domain/types/audit.types.ts` el tipo
`WorkflowRequestKind` como unión de literales que clasifica el tipo de request HTTP
procesado por el proxy:

```
WorkflowRequestKind = 'client-preflight' | 'agentic' | 'side-request'
```

Este tipo NO SHALL ser marcado `@deprecated`. Es el nombre canónico permanente para la
clasificación de request. Los consumidores que actualmente usan `InteractionType` SHALL
migrar a `WorkflowRequestKind`.

#### Scenario: Asignación de valores canónicos

- **WHEN** se asigna `'agentic'`, `'client-preflight'` o `'side-request'` a un campo
  de tipo `WorkflowRequestKind`
- **THEN** TypeScript SHALL aceptar la asignación sin error de typecheck

#### Scenario: Rechazo de valores fuera del conjunto

- **WHEN** se intenta asignar un string fuera del conjunto (`'interaction'`, `'main'`, etc.)
  a un campo `WorkflowRequestKind`
- **THEN** `tsc` SHALL reportar error de tipo en compilación

---

## REMOVED Requirements

### Requirement: InteractionType (deprecated, retirado)

**Reason:** `InteractionType` (`'client-preflight' | 'agentic' | 'side-request'`) es el nombre
legacy del mismo concepto ahora canonicalizado como `WorkflowRequestKind`. Fue marcado
`@deprecated` en G1 (2026-05-29); todos sus consumidores migran a `WorkflowRequestKind`
en este change.

**Migration:** Reemplazar toda referencia a `InteractionType` por `WorkflowRequestKind`. Los
valores del tipo son idénticos; el cambio es exclusivamente de nombre.

---

### Requirement: InteractionOutcome (deprecated, retirado)

**Reason:** `InteractionOutcome` (`'completed' | 'client-error' | 'upstream-error' | 'truncated' | 'orphaned'`)
fue el enum de resultados del modelo legacy. Fue marcado `@deprecated` en G1. Su único consumidor
activo (`SubagentSummary.outcome`) migra a `WorkflowOutcome` (ya definido en gateway types).

**Migration:** El campo `SubagentSummary.outcome` pasa de `InteractionOutcome | 'unknown'` a
`WorkflowOutcome`. Tabla de mapeo de valores (ver `design.md §D-2`):
`'completed'` → `'success'`, `'client-error'` → `'api_error'`, `'upstream-error'` → `'api_error'`,
`'truncated'` → `'aborted'`, `'orphaned'` → `'unknown'`.

---

## MODIFIED Requirements

### Requirement: Tipos primitivos del dominio gateway

El sistema SHALL definir en `src/1-domain/types/gateway/` las siguientes uniones de literales
de string, sin comportamiento ni I/O:
- `ProviderKind` — identificador del proveedor del LLM (`'anthropic' | 'vertex' | 'bedrock' | 'custom'`).
- `WorkflowKind` — clasificación del workflow (`'main' | 'subagent'`).
- `WorkflowStatus` — estado del lifecycle del workflow (`'pending' | 'running' | 'completed' | 'failed' | 'aborted'`).
- `WorkflowOutcome` — resultado de cierre (`'success' | 'api_error' | 'aborted' | 'unknown'`).
- `WorkflowClosedByEvent` — evento que disparó el cierre (`'Stop' | 'SubagentStop' | 'StopFailure'`).
- `ToolUseStatus` — estado de resolución de un tool_use (`'pending' | 'running' | 'completed' | 'rejected' | 'error'`).

`WorkflowRequestKind` SHALL definirse en `src/1-domain/types/audit.types.ts` (no en `types/gateway/`)
porque clasifica el request HTTP entrante, no la topología del workflow.

Referencia técnica: [§19 gateway-design.md](../../docs/proposals/gateway-design.md#tipos-primitivos-y-estructura-de-archivos).

#### Scenario: Tipos sin comportamiento

- **GIVEN** que el módulo `types/gateway/` está importado en un test unitario
- **WHEN** se asigna un valor literal válido a cada tipo primitivo
- **THEN** TypeScript SHALL aceptar la asignación sin error de typecheck
- **AND** ningún tipo SHALL exponer métodos ni efectos secundarios

#### Scenario: Rechazo de literales inválidos

- **GIVEN** que el módulo `types/gateway/` está importado
- **WHEN** se intenta asignar un string fuera del conjunto de literales definidos
- **THEN** `tsc` SHALL reportar error de tipo en tiempo de compilación

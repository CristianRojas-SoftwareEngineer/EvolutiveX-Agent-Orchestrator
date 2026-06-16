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
porque clasifica el request HTTP entrante, no la topología del workflow. Sus valores activos son
`'agentic' | 'side-request'`. El valor `'client-preflight'` SHALL permanecer solo para clasificación HTTP interna sin proyección causal. `'session-shell'` SHALL retirarse del union activo.

`StepKind` SHALL definirse en `src/1-domain/types/audit.types.ts` con valores `'agentic' | 'side-request'`.

Referencia técnica: [§13 gateway-architecture.md](../../../../docs/gateway-architecture.md#13-tipos-primitivos-y-estructura-de-archivos).

#### Scenario: Tipos sin comportamiento

- **GIVEN** que el módulo `types/gateway/` está importado en un test unitario
- **WHEN** se asigna un valor literal válido a cada tipo primitivo
- **THEN** TypeScript SHALL aceptar la asignación sin error de typecheck
- **AND** ningún tipo SHALL exponer métodos ni efectos secundarios

#### Scenario: Rechazo de literales inválidos

- **GIVEN** que el módulo `types/gateway/` está importado
- **WHEN** se intenta asignar un string fuera del conjunto de literales definidos
- **THEN** `tsc` SHALL reportar error de tipo en tiempo de compilación

#### Scenario: StepKind acepta agentic y side-request

- **WHEN** se asigna `'agentic'` o `'side-request'` a un campo de tipo `StepKind`
- **THEN** TypeScript SHALL aceptar la asignación

## ADDED Requirements

### Requirement: IStep incluye stepKind

`IStep` en `src/1-domain/interfaces/gateway/IStep.ts` SHALL incluir el campo opcional `stepKind?: StepKind` para distinguir hops auxiliares (`side-request`) de hops de inferencia agentic dentro del mismo workflow de turno.

`IStep.index` SHALL usar convención **base 1**, alineada con el segmento `MM` del directorio `steps/MM/`.

#### Scenario: Step side-request con stepKind

- **GIVEN** un step registrado por `handleSideRequest` bajo un turno activo
- **WHEN** se persiste el step en el correlador
- **THEN** `IStep.stepKind` SHALL ser `'side-request'`
- **AND** `IStep.index` SHALL ser ≥ 1

#### Scenario: Step agentic fresh con stepKind

- **GIVEN** un step registrado por `handleFresh` bajo un turno activo
- **WHEN** se persiste el step
- **THEN** `IStep.stepKind` SHALL ser `'agentic'`

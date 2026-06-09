## Purpose

Tipos primitivos, interfaces DTO y modelos anémicos del dominio gateway en `src/1-domain/`.
Contratos de datos sin lógica con efectos. Implementado en fase G1 (2026-05-29).

## Requirements

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

Referencia técnica: [§13 gateway-architecture.md](../../../docs/gateway-architecture.md#13-tipos-primitivos-y-estructura-de-archivos).

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

---

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

---

### Requirement: Interfaces DTO del dominio gateway

El sistema SHALL definir en `src/1-domain/interfaces/gateway/` las interfaces de contrato de
datos del dominio gateway:
- `IProvider`, `ILanguageModel`, `ISession`, `IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`.

Reglas de import de capa 1 (SHALL cumplirse siempre):
- `interfaces/gateway` puede importar desde `types/anthropic.types.ts` y `types/gateway/*`.
- `IToolUse` e `IStep` SHALL referenciar `AnthropicContentBlock`, `AnthropicMessage`,
  `AnthropicRequest`, `AnthropicUsage` (sin prefijo `I` — los tipos reales en `types/anthropic.types.ts`)
  sin duplicar su estructura.
- Las interfaces de `interfaces/gateway` NO SHALL importar desde capas 2-6 (`services/`,
  `operations/`, `api/`, `user-interfaces/`).

Referencia técnica: [§13 gateway-architecture.md](../../../docs/gateway-architecture.md#13-tipos-primitivos-y-estructura-de-archivos).

#### Scenario: Interfaces tipadas correctamente

- **GIVEN** que un test importa `IWorkflow`, `IStep`, `IToolUse` y `IWorkflowResult`
- **WHEN** se construyen objetos literales con todos los campos requeridos
- **THEN** TypeScript SHALL validar que los objetos satisfacen las interfaces sin error

#### Scenario: Sin duplicación de tipos Anthropic

- **GIVEN** que `IToolUse` o `IStep` hacen referencia a tipos Anthropic
- **WHEN** se importa el tipo Anthropic correspondiente
- **THEN** `IToolUse`/`IStep` SHALL usar la referencia importada en lugar de redefinir la estructura
- **AND** `tsc` SHALL pasar sin errores de tipo redundante

#### Scenario: Aislamiento de imports (capa 1)

- **GIVEN** que existe `tsconfig.json` con `paths` o que se ejecuta `npm run typecheck`
- **WHEN** algún archivo bajo `src/1-domain/interfaces/gateway/` importa desde capas 2-6
- **THEN** `tsc` SHALL reportar error (violación de capa)

---

### Requirement: Modelos anémicos del dominio gateway

El sistema SHALL definir en `src/1-domain/models/gateway/` clases o estructuras de datos
anémicas para `Provider`, `LanguageModel`, `Session`, `Workflow`, `Step`, `ToolUse`.

Los modelos SHALL cumplir:
- No contienen lógica de cierre con efectos secundarios (esa lógica vive en domain services puros).
- Pueden exponer helpers de clasificación o acceso simples (sin I/O).
- NO SHALL importar desde capas 2-6.

Referencia técnica: [§13 gateway-architecture.md](../../../docs/gateway-architecture.md#13-tipos-primitivos-y-estructura-de-archivos)
y perfil anémico en [§36 gateway-architecture.md](../../../docs/gateway-architecture.md#36-capa-1--domain).

#### Scenario: Modelos instanciables sin infraestructura

- **GIVEN** un test unitario que importa `Workflow` de `src/1-domain/models/gateway/`
- **WHEN** se instancia el modelo con datos de prueba
- **THEN** la instanciación SHALL completarse sin dependencias de `fs`, `fetch` ni Fastify
- **AND** `npm run test:quick` SHALL pasar sin errores

---

### Requirement: Aislamiento de capa 1 (sin I/O ni imports de capas superiores)

La capa 1 del dominio gateway SHALL estar completamente aislada de I/O e importaciones de capas
superiores. Ningún archivo bajo `src/1-domain/types/gateway/`, `src/1-domain/interfaces/gateway/`,
`src/1-domain/models/gateway/` ni `src/1-domain/services/gateway/` SHALL importar módulos Node.js
con I/O (`fs`, `net`, `http`), módulos de streaming SSE ni Fastify, ni código de las capas
2-6 (`src/2-services/`, `src/3-operations/`, `src/4-api/`, `src/5-user-interfaces/`).

Referencia técnica: [§36 gateway-architecture.md](../../../docs/gateway-architecture.md#36-capa-1--domain)
— "Sin I/O: Ningún `fs`, `fetch`, ni parseo SSE aquí."

#### Scenario: Test unitario sin infraestructura

- **GIVEN** un test Vitest que importa únicamente desde `src/1-domain/`
- **WHEN** se ejecuta `npm run test:unit`
- **THEN** el test SHALL ejecutarse sin instanciar ningún adaptador de infraestructura
- **AND** el tiempo de ejecución del test SHALL ser inferior a 100 ms por archivo

---

### Requirement: WorkflowRequestKind — clasificación canónica del request HTTP

El sistema SHALL definir en `src/1-domain/types/audit.types.ts` el tipo `WorkflowRequestKind`
como unión de literales que clasifica el tipo de request HTTP procesado por el proxy:

```
WorkflowRequestKind = 'client-preflight' | 'agentic' | 'side-request'
```

Este tipo NO SHALL ser marcado `@deprecated`. Es el nombre canónico permanente para la
clasificación de request en la capa 1 del dominio.

`WorkflowRequestKind` se diferencia de `WorkflowKind` (que clasifica la estructura del workflow:
`'main' | 'subagent'`); el primero clasifica el request HTTP, el segundo la topología del workflow.

Referencia técnica: [§13 gateway-architecture.md](../../../docs/gateway-architecture.md#13-tipos-primitivos-y-estructura-de-archivos).

#### Scenario: Asignación de valores canónicos

- **GIVEN** que el módulo `audit.types.ts` exporta `WorkflowRequestKind`
- **WHEN** se asigna `'agentic'`, `'client-preflight'` o `'side-request'` a un campo de tipo `WorkflowRequestKind`
- **THEN** TypeScript SHALL aceptar la asignación sin error de typecheck

#### Scenario: Rechazo de valores fuera del conjunto

- **GIVEN** que existe un campo de tipo `WorkflowRequestKind`
- **WHEN** se intenta asignar un string fuera del conjunto (`'main'`, `'subagent'`, etc.)
- **THEN** `tsc` SHALL reportar error de tipo en compilación

---

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

Referencia documental: [`session-audit-model.md`](../../../docs/session-audit-model.md) §7.

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

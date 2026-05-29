> **Orquestador:** `gateway-migration` | **Fase:** g1 (Refactor gateway)

## Why

El gateway carece de un vocabulario de dominio propio: tipos, interfaces y servicios de cierre del
workflow están mezclados con los tipos de auditoría de `Interaction*` o simplemente no existen.
Sin la Capa 1 (Domain) de la PKA en su forma objetivo, las fases posteriores del bloque G
(lifecycle de cierre en G2, `StepAssembler` en G3, handlers y proyección en G4) no tienen
contratos de dominio sobre los que apoyarse.

G1 establece esa base: tipos primitivos, interfaces DTO, modelos anémicos y domain services puros
de cierre del workflow, todos en `src/1-domain/`, sin I/O ni dependencias hacia capas superiores.
El alcance completo se describe en [§19](../../../docs/proposals/gateway-design.md#tipos-primitivos-y-estructura-de-archivos),
[§39](../../../docs/proposals/gateway-design.md#capa-1-objetivo) y
[§43](../../../docs/proposals/gateway-design.md#fases-de-implementación)
de `docs/proposals/gateway-design.md`.

## What Changes

- **Tipos primitivos** (`src/1-domain/types/gateway/`): uniones literales sin comportamiento —
  `ProviderKind`, `WorkflowKind`, `WorkflowStatus`, `WorkflowOutcome`, `WorkflowClosedByEvent`,
  `ToolUseStatus`. Ver [§19](../../../docs/proposals/gateway-design.md#tipos-primitivos-y-estructura-de-archivos).
- **Interfaces DTO** (`src/1-domain/interfaces/gateway/`): `IProvider`, `ILanguageModel`,
  `ISession`, `IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`. Reglas de import de capa 1:
  `interfaces/gateway` puede importar `interfaces/anthropic` y `types/*`; `IToolUse`/`IStep`
  referencian (sin duplicar) `IAnthropicContentBlock`. Ver [§19](../../../docs/proposals/gateway-design.md#tipos-primitivos-y-estructura-de-archivos).
- **Modelos anémicos** (`src/1-domain/models/gateway/`): `Provider`, `LanguageModel`, `Session`,
  `Workflow`, `Step`, `ToolUse`. Sin efectos con I/O; comportamiento sugerido en [§19](../../../docs/proposals/gateway-design.md#tipos-primitivos-y-estructura-de-archivos)
  (p. ej. `Workflow.addStep()`), pero la lógica de cierre vive en domain services, no en métodos.
- **Domain services puros** (`src/1-domain/services/gateway/`): `aggregateWorkflowUsage`,
  `buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`, `validate-workflow-invariants`.
  Funciones puras (sin I/O, sin `fs`/`fetch`/SSE). Ver [§39](../../../docs/proposals/gateway-design.md#capa-1-objetivo)
  y semántica en §15.6–§15.8.
- **Deprecación de tipos `Interaction*` en capa 1**: `InteractionType`, `InteractionOutcome`,
  `InteractionMetadata`, `ActiveInteraction`, `InteractionState`, `AuditInteractionContext`
  (en `src/1-domain/types/audit.types.ts`) se marcan deprecados con fecha de retirada diferida
  a la fase que elimine el último consumidor (G4/P). Se registra tarea de retirada en el
  orquestador.

## Capabilities

### New Capabilities

- `gateway-domain-types`: Tipos primitivos, interfaces DTO y modelos anémicos del dominio gateway
  en `src/1-domain/`. Contratos de datos sin lógica con efectos.
- `gateway-closure-services`: Domain services puros de cierre del workflow (`aggregateWorkflowUsage`,
  `buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`, `validate-workflow-invariants`) en
  `src/1-domain/services/gateway/`. Todos sin I/O.

### Modified Capabilities

*(ninguna — G1 no modifica requisitos de capabilities existentes)*

## No Objetivos

- **`IWorkflowRepository` completo y adapter de memoria** → diferido a G2 (lifecycle de cierre:
  `readyToClose`, open/close). El archivo `src/1-domain/repositories/IWorkflowRepository.ts`
  actual (que solo cubre correlación de subagentes wire) no se modifica en G1.
- **`StepAssembler` (capa 2)** → diferido a G3.
- **Handler `AuditWorkflowClosureHandler` y proyección `WorkflowResult` (capa 3/2)** → diferido
  a G4.
- **Cableado a la pipeline viva**: los tipos y servicios creados en G1 aún no tienen consumidores
  en capas 2-5; el ensamblaje ocurre en G2-G4.
- **Migración del layout `sessions/`** → diferido a fases P.
- **Eliminación efectiva de los tipos `Interaction*`**: se marcan deprecados en G1, se eliminan
  en la fase que retire el último consumidor (G4 o P, pendiente de análisis en ese momento).

## Impact

- **Capa 1 — dominio (`src/1-domain/`)**: nuevos directorios `types/gateway/`, `interfaces/gateway/`,
  `models/gateway/`, `services/gateway/`; modificación de `types/audit.types.ts` (comentarios de
  deprecación en tipos `Interaction*`).
- **Tests unitarios**: nuevos tests para los domain services puros en `src/1-domain/services/gateway/`
  (Vitest). Los tests existentes no se modifican.
- **Documentación**: `docs/proposals/gateway-design.md` §39 deberá actualizarse para reflejar
  los tipos y servicios como implementados al completar la fase.
- **No toca**: capas 2-5 (`src/2-services/`, `src/3-operations/`, `src/4-api/`,
  `src/5-user-interfaces/`), `src/1-domain/repositories/IWorkflowRepository.ts`, layout
  `sessions/`, ni ningún otro archivo existente más allá del comentario de deprecación en
  `audit.types.ts`.

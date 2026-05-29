## 1. Dominio — Tipos primitivos

- [x] 1.1 Crear `src/1-domain/types/gateway/workflow.types.ts` con las uniones de literales
  `WorkflowKind`, `WorkflowStatus`, `WorkflowOutcome` y `WorkflowClosedByEvent`. Criterio:
  `npm run typecheck` sin errores; ningún import de capas 2-6.
- [x] 1.2 Crear `src/1-domain/types/gateway/provider.types.ts` con `ProviderKind`. Criterio:
  `npm run typecheck` sin errores.
- [x] 1.3 Crear `src/1-domain/types/gateway/tool-use.types.ts` con `ToolUseStatus`. Criterio:
  `npm run typecheck` sin errores.

## 2. Dominio — Interfaces DTO

- [x] 2.1 Crear `src/1-domain/interfaces/gateway/IProvider.ts` e `ILanguageModel.ts`. Criterio:
  `npm run typecheck` sin errores; solo importan desde `types/*`.
- [x] 2.2 Crear `src/1-domain/interfaces/gateway/ISession.ts`. Criterio: `npm run typecheck`
  sin errores.
- [x] 2.3 Crear `src/1-domain/interfaces/gateway/IStep.ts` e `IToolUse.ts`. Criterio: deben
  referenciar (no duplicar) tipos Anthropic de `types/anthropic.types.ts`; `npm run typecheck` sin
  errores.
- [x] 2.4 Crear `src/1-domain/interfaces/gateway/IWorkflow.ts`. Criterio: puede importar desde
  `types/gateway/`; `npm run typecheck` sin errores.
- [x] 2.5 Crear `src/1-domain/interfaces/gateway/IWorkflowResult.ts` incluyendo `finalText?`,
  `usage?` (referencia §19 y §15.7–§15.8). Criterio: `npm run typecheck` sin errores.

## 3. Dominio — Modelos anémicos

- [x] 3.1 Crear `src/1-domain/models/gateway/Provider.ts` y `LanguageModel.ts`. Criterio:
  sin imports de capas 2-6; `npm run typecheck` sin errores.
- [x] 3.2 Crear `src/1-domain/models/gateway/Session.ts`. Criterio: `npm run typecheck` sin errores.
- [x] 3.3 Crear `src/1-domain/models/gateway/Workflow.ts`. Criterio: sin método `complete()` con
  efectos secundarios; lógica de cierre delegada a domain services; `npm run typecheck` sin errores.
- [x] 3.4 Crear `src/1-domain/models/gateway/Step.ts` y `ToolUse.ts`. Criterio: `npm run typecheck`
  sin errores; sin I/O.

## 4. Dominio — Domain services puros

- [x] 4.1 Crear `src/1-domain/services/gateway/aggregate-workflow-usage.ts` con la función pura
  `aggregateWorkflowUsage(steps, childWorkflows)`. Criterio: retorna `AnthropicUsage | undefined`;
  sin I/O; `npm run typecheck` sin errores.
- [x] 4.2 Crear `src/1-domain/services/gateway/derive-outcome.ts` con la función pura
  `deriveOutcome(hook)`. Criterio: retorna `WorkflowOutcome`; sin I/O; `npm run typecheck` sin errores.
- [x] 4.3 Crear `src/1-domain/services/gateway/derive-final-text.ts` con la función pura
  `deriveFinalText(hook)`. Criterio: retorna `string | undefined`; sin I/O; `npm run typecheck` sin errores.
- [x] 4.4 Crear `src/1-domain/services/gateway/build-workflow-result.ts` con la función pura
  `buildWorkflowResult(workflow, steps, childWorkflows, hook)`. Criterio: construye `IWorkflowResult`
  completo usando `aggregateWorkflowUsage`, `deriveOutcome`, `deriveFinalText`; sin I/O;
  `npm run typecheck` sin errores.
- [x] 4.5 Crear `src/1-domain/services/gateway/validate-workflow-invariants.ts` con las funciones
  de validación de invariantes de dominio (sub-workflow requiere `parentWorkflowId` +
  `parentToolUseId`). Criterio: sin I/O; `npm run typecheck` sin errores.

## 5. Tests unitarios

- [x] 5.1 Crear tests Vitest para `aggregateWorkflowUsage`: arrays vacíos → undefined, suma con
  steps, suma con child results, cache fields, omisión de service_tier/inference_geo. Criterio: `npm run test:unit` con todos los casos pasando.
- [x] 5.2 Crear tests Vitest para `deriveOutcome`: Stop→success, SubagentStop→success,
  StopFailure→api_error, otros eventos→unknown. Criterio: `npm run test:unit` pasando.
- [x] 5.3 Crear tests Vitest para `deriveFinalText`: texto presente, ausente, vacío, solo espacios. Criterio: `npm run test:unit` pasando.
- [x] 5.4 Crear tests Vitest para `buildWorkflowResult`: caso básico, StopFailure, con child results,
  usage undefined, finalText undefined, fallback conservador. Criterio: `npm run test:unit` pasando.
- [x] 5.5 Crear tests Vitest para `validate-workflow-invariants`: sub-workflow válido, sub-workflow
  sin `parentWorkflowId`, workflow raíz válido, assert lanza Error. Criterio: `npm run test:unit` pasando.

## 6. Gate de validación

- [x] 6.1 Ejecutar `npm run test:quick` (lint + typecheck + unit) sin errores. Criterio: salida
  `0` en todos los subcomandos. Este es el gate técnico de la fase G1.

## 7. Documentación

- [x] 7.1 Actualizar `docs/proposals/gateway-design.md` §39 para reflejar los tipos
  `Workflow/Step/ToolUse/WorkflowResult` y los servicios de cierre como implementados.
  Criterio: §39 describe el estado real del sistema tras G1 (no como "objetivo" sino como
  "implementado"), sin afirmar como implementado lo que aún no lo está.

## 8. Legacy

- [x] 8.1 Añadir comentarios `@deprecated` a los tipos `Interaction*` en
  `src/1-domain/types/audit.types.ts`: `InteractionType`, `InteractionOutcome`,
  `InteractionMetadata`, `ActiveInteraction`, `InteractionState`, `AuditInteractionContext`.
  Cada comentario incluye: razón (reemplazado por tipos gateway de G1), fase de retirada
  planificada (G4 o P, a confirmar al implementar G4) y fecha (2026-05-29). Criterio:
  `npm run lint` sin errores ni warnings adicionales introducidos por G1.
- [x] 8.2 Registrar en `openspec/changes/gateway-migration/tasks.md` la tarea de retirada
  efectiva de los tipos `Interaction*` como tarea diferida a la fase correspondiente. Criterio:
  la tarea de retirada existe en el orquestador y referencia la fase y el motivo del diferimiento.

## 9. Gobernanza OpenSpec

- [ ] 9.1 Ejecutar `npx openspec validate --changes gateway-g1-domain-types-services` y resolver
  cualquier advertencia. Criterio: validación pasa sin errores.
- [ ] 9.2 Ejecutar la skill `migration-phase-gate` para verificar trazabilidad 1:1 a G1/§43,
  back-reference al orquestador, dependencias satisfechas y DoD cubierta. Criterio: sin hallazgos
  CRITICAL.
- [ ] 9.3 Actualizar el estado de G1 en la tabla del orquestador
  (`openspec/changes/gateway-migration/design.md`) de `pendiente` a `validada`. Criterio: la fila
  G1 del registro muestra estado `validada`.
- [ ] 9.4 Ejecutar `openspec-sync` si hay specs de esta fase que deban promoverse a
  `openspec/specs/`. Criterio: `openspec/specs/gateway-domain-types/` y
  `openspec/specs/gateway-closure-services/` reflejan el estado final de la fase.
- [ ] 9.5 Archivar el change con `openspec-archive`. Criterio: el change se mueve a
  `openspec/changes/archive/` con prefijo de fecha; estado del registro actualizado a `archivada`.

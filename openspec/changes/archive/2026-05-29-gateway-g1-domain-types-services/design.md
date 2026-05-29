## Context

La Capa 1 (Domain) de la PKA de Smart Code Proxy concentra actualmente dos grupos de tipos:

1. **Tipos de auditoría `Interaction*`** (`src/1-domain/types/audit.types.ts`): vocabulario del
   turno de auditoría actual (`InteractionType`, `InteractionOutcome`, `ActiveInteraction`, etc.).
   Consumidos por todas las capas (2-5).

2. **Tipos de correlación** (`src/1-domain/repositories/IWorkflowRepository.ts`, `audit.types.ts`):
   infraestructura de correlación de subagentes wire implementada en las fases C1-C3.

La fase G1 añade el tercer grupo: **tipos y servicios del dominio gateway** — el vocabulario del
workflow de cierre E2E que las fases G2-G4 necesitarán para construir el lifecycle completo.
G1 no tiene consumidores en capas 2-5 todavía; eso ocurre a partir de G2.

Referencia: registro de fases en `openspec/changes/gateway-migration/design.md:33`,
especificación técnica en [§19](../../../docs/proposals/gateway-design.md#tipos-primitivos-y-estructura-de-archivos)
y [§39](../../../docs/proposals/gateway-design.md#capa-1-objetivo) de `docs/proposals/gateway-design.md`.

## Goals / Non-Goals

**Goals:**
- Crear `src/1-domain/types/gateway/` con los tipos primitivos del dominio gateway.
- Crear `src/1-domain/interfaces/gateway/` con las interfaces DTO respetando las reglas de import de capa 1.
- Crear `src/1-domain/models/gateway/` con los modelos anémicos (sin lógica de cierre con efectos).
- Crear `src/1-domain/services/gateway/` con las cuatro funciones puras de cierre
  (`aggregateWorkflowUsage`, `buildWorkflowResult`, `deriveOutcome`, `deriveFinalText`) y las
  validaciones de invariantes.
- Cubrir los domain services con tests unitarios Vitest.
- Marcar deprecados los tipos `Interaction*` en `audit.types.ts` y registrar la tarea de retirada
  diferida en el orquestador `gateway-migration`.

**Non-Goals:**
- `IWorkflowRepository` completo (lifecycle: `readyToClose`, open/close) → G2.
- `StepAssembler` (capa 2) → G3.
- Handler `AuditWorkflowClosureHandler` y proyección `WorkflowResult` → G4.
- Migración del layout `sessions/` → fases P.
- Eliminar efectivamente los tipos `Interaction*` (tienen consumidores activos en capas 2-5).
- Modificar `src/1-domain/repositories/IWorkflowRepository.ts` (correlación wire, competencia
  de las fases C).

## Decisions

### Decisión 1: Dos capabilities — `gateway-domain-types` y `gateway-closure-services`

**Rationale:** El entregable de G1 tiene dos concerns con comportamiento verificable por separado:
(a) los contratos de datos (tipos, interfaces, modelos) que no tienen lógica; (b) las funciones
puras de cierre que sí tienen comportamiento testeable con scenarios Given/When/Then. Separarlos
permite specs más precisas y tests unitarios más focalizados.

**Alternativa rechazada:** Una única capability `gateway-domain-layer`. Descartada porque mezcla
contratos estáticos (tipos/interfaces) con comportamiento observable (services), lo que dificulta
la trazabilidad de requisitos en specs y la verificación con `migration-phase-gate`.

---

### Decisión 2: Perfil de dominio anémico — `buildWorkflowResult` como función pura

**Rationale:** [§39](../../../docs/proposals/gateway-design.md#capa-1-objetivo) establece
explícitamente: "en lugar de `Workflow.complete()` como método con efectos secundarios, SCP
implementa `buildWorkflowResult(...)` — función pura invocada desde el handler de capa 3.
Esto permite testear la lógica de cierre sin dependencias de infraestructura."
El perfil anémico es la convención arquitectural del repositorio (§2 PKA).

**Alternativa rechazada:** Lógica de cierre como método `Workflow.complete()`. Descartada porque
introduce efectos secundarios en capa 1, dificulta el testing unitario y viola el perfil anémico
definido en la PKA de este repositorio.

---

### Decisión 3: Deprecar (no eliminar) los tipos `Interaction*` en G1

**Rationale:** `InteractionType`, `InteractionOutcome`, `InteractionMetadata`, `ActiveInteraction`,
`InteractionState` y `AuditInteractionContext` están en `src/1-domain/types/audit.types.ts` y
son consumidos por capas 2-5 (handlers, ports, controller). Eliminarlos en G1 rompería la
compilación del sistema hasta que esas capas migren en G2-G4. La Definición de Hecho del
orquestador (`specs/gateway-migration-governance/spec.md:118-134`, política `design.md:104-110`)
permite marcar deprecado con razón + fase de retirada + fecha planificada.

**Cómo se hace:** Comentario de deprecación en cada tipo afectado (`@deprecated — reemplazado por
tipos gateway de G1; retirar cuando el último consumidor migre a tipos IWorkflow/WorkflowOutcome,
planificado en G4/P. Fecha: 2026-05-29`). Se registra tarea de retirada diferida en
`openspec/changes/gateway-migration/tasks.md` para la fase G4 o P (a determinar al implementar G4).

**Alternativa rechazada:** Eliminar los tipos en G1 y crear stubs de compatibilidad. Descartada
porque añade complejidad especulativa y el impacto real de los consumidores se evalúa mejor en
las fases que los reemplazan.

---

### Decisión 4: No modificar `IWorkflowRepository` en G1

**Rationale:** El `src/1-domain/repositories/IWorkflowRepository.ts` actual cubre exclusivamente
la correlación de subagentes wire (fases C1-C3). El repositorio de workflow completo con lifecycle
de cierre (`readyToClose`, `openWorkflow`, `closeWorkflow`) es responsabilidad de G2, según §43
y el registro del orquestador. Modificarlo en G1 adelantaría dependencias de G2 sin tener aún
los contratos de dominio necesarios (tipos y servicios de G1).

**Alternativa rechazada:** Crear `IWorkflowRepository` completo en G1 junto con los tipos. Descartada
porque el lifecycle de cierre depende de los domain services (G1) y del adapter de memoria (G2);
crear el repositorio sin el adapter crea contratos huérfanos.

## Archivos afectados

| Archivo | Operación | Notas |
|---|---|---|
| `src/1-domain/types/gateway/workflow.types.ts` | Crear | `WorkflowKind`, `WorkflowStatus`, `WorkflowOutcome`, `WorkflowClosedByEvent` |
| `src/1-domain/types/gateway/provider.types.ts` | Crear | `ProviderKind` |
| `src/1-domain/types/gateway/tool-use.types.ts` | Crear | `ToolUseStatus` |
| `src/1-domain/interfaces/gateway/IWorkflow.ts` | Crear | Interfaz DTO del workflow |
| `src/1-domain/interfaces/gateway/IStep.ts` | Crear | Referencia a `AnthropicContentBlock`, `AnthropicMessage`, `AnthropicRequest`, `AnthropicUsage` sin duplicar |
| `src/1-domain/interfaces/gateway/IToolUse.ts` | Crear | Referencia a `AnthropicContentBlock` (sin prefijo `I`) |
| `src/1-domain/interfaces/gateway/IWorkflowResult.ts` | Crear | Incluye `finalText?`, `usage?` (§19) |
| `src/1-domain/interfaces/gateway/IProvider.ts` | Crear | |
| `src/1-domain/interfaces/gateway/ILanguageModel.ts` | Crear | |
| `src/1-domain/interfaces/gateway/ISession.ts` | Crear | |
| `src/1-domain/models/gateway/Workflow.ts` | Crear | Modelo anémico; sin `complete()` con efectos |
| `src/1-domain/models/gateway/Step.ts` | Crear | |
| `src/1-domain/models/gateway/ToolUse.ts` | Crear | |
| `src/1-domain/models/gateway/Provider.ts` | Crear | |
| `src/1-domain/models/gateway/LanguageModel.ts` | Crear | |
| `src/1-domain/models/gateway/Session.ts` | Crear | |
| `src/1-domain/services/gateway/aggregate-workflow-usage.ts` | Crear | Función pura; sin I/O |
| `src/1-domain/services/gateway/build-workflow-result.ts` | Crear | Función pura; sin I/O |
| `src/1-domain/services/gateway/derive-outcome.ts` | Crear | Función pura |
| `src/1-domain/services/gateway/derive-final-text.ts` | Crear | Función pura |
| `src/1-domain/services/gateway/validate-workflow-invariants.ts` | Crear | Sub-workflow requiere `parentWorkflowId` + `parentToolUseId` |
| `src/1-domain/types/audit.types.ts` | Modificar | Añadir comentarios `@deprecated` a tipos `Interaction*` |
| `openspec/changes/gateway-migration/tasks.md` | Modificar | Registrar tarea de retirada diferida de `Interaction*` |

**No tocar en G1:** `src/1-domain/repositories/IWorkflowRepository.ts`, cualquier archivo de
capas 2-5, `sessions/`, tests existentes.

## Risks / Trade-offs

- **Riesgo: interfaces incompletas respecto a §19.** El diseño de §19 puede tener campos que
  no están aún completamente especificados (p. ej. relación `IWorkflowResult.usage` con §15.7.1).
  Mitigación: durante `openspec-apply`, leer §15.6-§15.8 antes de implementar los services;
  si un campo es ambiguo, añadirlo como opcional con comentario de referencia a la sección.

- **Riesgo: tipos `Interaction*` deprecados pero aún consumidos.** Si una fase posterior no
  elimina los tipos en el momento acordado, quedarán deprecados sine die.
  Mitigación: la tarea de retirada registrada en el orquestador es obligatoria para el DoD de
  la fase que retira el último consumidor (verificado por `migration-phase-gate`).

- **Riesgo: colisión de nomenclatura G1–G19.** El documento `gateway-design.md` usa "G1–G19"
  tanto para la fase de migración como para los invariantes de dominio (§39).
  Mitigación: en el código, los invariantes se implementan en `validate-workflow-invariants.ts`
  sin usar el prefijo "G"; la fase de migración se referencia siempre por su nombre completo
  `gateway-g1-domain-types-services`.

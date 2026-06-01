## Context

La migración gateway C0–P2 (cerrada el 2026-06-01) completó la implementación del modelo
`IWorkflow`/`IStep`/`IToolUse` y el layout `causal-workflows-v1`. Los nombres de código —
clases, interfaces, métodos, campos y augments de Fastify — conservan el vocabulario
"Interaction" del modelo retirado. Ninguno de estos componentes contiene lógica legacy activa;
el rename es puramente de nomenclatura.

Dos particularidades exigen decisión antes de implementar:

1. **`InteractionType` ≠ `WorkflowKind`**: Los valores de `InteractionType`
   (`'client-preflight' | 'agentic' | 'side-request'`) clasifican el *tipo de request HTTP*,
   mientras que `WorkflowKind` (`'main' | 'subagent'`) clasifica la *estructura del workflow*.
   No son lo mismo; no se puede simplemente alias uno al otro.

2. **`InteractionOutcome` ≠ `WorkflowOutcome`**: `InteractionOutcome` tiene valores
   (`'completed' | 'client-error' | 'upstream-error' | 'truncated' | 'orphaned'`) distintos a
   `WorkflowOutcome` (`'success' | 'api_error' | 'aborted' | 'unknown'`). El único consumidor
   activo de `InteractionOutcome` es `SubagentSummary.outcome` (un campo de resumen informativo).

## Goals / Non-Goals

**Goals:**
- Que el vocabulario de código refleje el modelo de dominio: `AuditWorkflowHandler`,
  `AuditWorkflowContext`, `WorkflowRequestKind`, `auditWorkflowDir`, etc.
- Eliminar los tipos `@deprecated` `InteractionType` e `InteractionOutcome` de `audit.types.ts`
  una vez migrados todos sus consumidores.
- Mantener tests en verde y typecheck limpio al finalizar cada sub-tarea.

**Non-Goals:**
- Cambiar la lógica de persistencia, EventBus, paths en `sessions/` ni API HTTP.
- Renombrar documentos históricos archivados bajo `openspec/changes/archive/`.
- Introducir nuevos tipos gateway que no existiesen ya (el dominio está completo).

## Decisions

### D-1 — `InteractionType` → `WorkflowRequestKind` como nuevo tipo en `audit.types.ts`

`InteractionType` no tiene equivalente directo en `types/gateway/` porque clasifica el request
HTTP, no la topología del workflow. Se define `WorkflowRequestKind` como alias permanente (no
deprecated) con los mismos tres literales: `'client-preflight' | 'agentic' | 'side-request'`.

**Alternativa descartada:** Reutilizar `WorkflowKind` — tiene semántica diferente y cambiaría
contratos del correlador.

### D-2 — `InteractionOutcome` → retirar; `SubagentSummary.outcome` migra a `WorkflowOutcome`

`InteractionOutcome` solo tiene un consumidor activo (`SubagentSummary.outcome`). Los valores
del legacy que no existen en `WorkflowOutcome` (`'completed'`, `'truncated'`, `'client-error'`,
`'upstream-error'`) deben mapearse:

| InteractionOutcome (legacy)  | WorkflowOutcome (gateway)   |
|------------------------------|-----------------------------|
| `'completed'`                | `'success'`                 |
| `'client-error'`             | `'api_error'`               |
| `'upstream-error'`           | `'api_error'`               |
| `'truncated'`                | `'aborted'`                 |
| `'orphaned'`                 | `'unknown'`                 |

El campo `SubagentSummary.outcome` cambia de `InteractionOutcome | 'unknown'` a `WorkflowOutcome`.
El código que asigna este campo debe actualizarse para usar los valores `WorkflowOutcome`.

**Alternativa descartada:** Mantener `InteractionOutcome` como alias — perpetúa la deuda sin
reducirla y los valores no son equivalentes semánticamente.

### D-3 — `AuditInteractionContext` → `AuditWorkflowContext`

Rename directo de la interfaz y todos sus consumidores (3 handlers L3 + controller + augments).
El campo `auditInteractionDir` → `auditWorkflowDir`; `interactionType` → `workflowKind` (usando
el nuevo `WorkflowRequestKind`).

### D-4 — `AuditInteractionHandler` → `AuditWorkflowHandler` (con rename de archivo)

El archivo `audit-interaction.handler.ts` pasa a `audit-workflow.handler.ts`. El composition
root (`composition-root.ts`) actualiza el import. Los tests del handler se mueven en paralelo
(`tests/3-operations/audit-workflow.handler.test.ts`).

### D-5 — Orden de ejecución: types-first

Para evitar errores de compilación intermedios, el orden SHALL ser:
1. Definir `WorkflowRequestKind` y migrar `SubagentSummary.outcome` (capa 1 — no tiene dependencias).
2. Renombrar `AuditWorkflowContext` y sus campos (capa 1 — se desbloquean handlers).
3. Renombrar handlers y métodos en capa 3.
4. Actualizar augments y controller en capa 5.
5. Actualizar `scripting/router-status.ts`.
6. Renombrar archivo del handler y actualizar todos los imports.
7. Eliminar `InteractionType` e `InteractionOutcome` de `audit.types.ts`.
8. Verificar `npm run test` en verde.

## Risks / Trade-offs

- **[Rename de archivo de handler]** → El rename de `audit-interaction.handler.ts` puede
  afectar referencias absolutas en imports. Mitigación: hacerlo como último paso (D-5), cuando
  ya no haya consumidores del nombre viejo.

- **[Mapeo de outcomes]** → La tabla D-2 es una aproximación semántica; `'truncated'` →
  `'aborted'` puede perder matiz. Mitigación: el campo `SubagentSummary.outcome` es informativo
  (no controla flujo); la pérdida de precisión es aceptable.

- **[Blast radius en tests]** → La clase `AuditInteractionHandler` está cubierta por el test
  más extenso del repo. Mitigación: renombrar el archivo de test en el mismo commit que el
  handler; correr `npm run test` como gate intermedio en D-5 paso 6.

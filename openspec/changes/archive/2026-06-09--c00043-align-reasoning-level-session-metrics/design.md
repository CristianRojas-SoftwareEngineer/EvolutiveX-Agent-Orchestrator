## Context

**Propósito de la Tabla 2**

Distribuir trabajo y tokens facturados por slot de razonamiento, atribuyendo cada hop y cada ejecución agéntica al `modelId` correcto — **incluidos subagentes**.

**Estado actual (deuda)**

| Componente | Problema |
|------------|----------|
| `finalizeWorkflowMetrics` | `workflow_count += 1` por cada modelo en hops (hallazgo 2) |
| G16 | Excluye subagentes de métricas |
| `router-status.ts` | Lee nombres G4 (`count`, `workflow_count`); totales `# Workflows` suman columnas |
| `setWorkflowModel` / `languageModelId` | Spec G3 exige cableado; **cero llamadas** en producción |
| `audit.types.ts` | Alias `@deprecated` sin consumidores |
| `buildInferenceRequestSnapshot` | Fallback a `languageModelId` siempre `undefined` → `'unknown'` |

**Principio de este change**

Un solo camino estructural por concern: schema canónico, atribución explícita, sin lectura dual ni campos zombie. Las sesiones con JSON antiguo no se migran; el statusline trata schema inválido como métricas vacías (comportamiento ya existente ante parse/estructura incompatible).

### Renombre G4 → schema canónico (misma función, mejor semántica)

Los contadores de la Tabla 2 **no desaparecen**; se **renombran** porque hoy mezclan nombres ambiguos con reglas de cálculo incorrectas:

| Campo G4 (retirado) | Campo canónico | Columna Tabla 2 | Quién lo incrementa |
|---------------------|----------------|-----------------|---------------------|
| `models[*].count` | `models[*].billable_hops` | `# Steps` por fila de nivel | `updateFromStep` — cada hop con `usage` |
| `models[*].workflow_count` | `models[*].finalized_runs` | `# Workflows` por fila de nivel | `finalizeWorkflowMetrics` — +1 por ejecución atribuida |
| `session_totals.total_steps` | `session_totals.billable_hops` | `# Steps` fila **Totales** | `recalcSessionTotals` (= Σ `billable_hops` por modelo) |
| `session_totals.total_workflows` | `session_totals.finalized_runs` | `# Workflows` fila **Totales** | `finalized_workflow_ids.length` (conteo estructural) |

«Retirar» un nombre G4 significa **dejar de escribirlo y leerlo**, no eliminar la métrica de producto.

### Tabla 2 — de `session-metrics.json` a columnas

```
Por fila (Lite / Standard / Reasoning):
  # Steps     ← Σ models[modelId].billable_hops   (modelId clasificado en ese nivel)
  # Workflows ← Σ models[modelId].finalized_runs  (idem)
  tokens      ← Σ campos snake_case por nivel

Fila Totales (no sumar columnas de nivel para workflows):
  # Steps     ← session_totals.billable_hops
  # Workflows ← session_totals.finalized_runs
  tokens      ← session_totals.*
```

## Goals / Non-Goals

**Goals:**

- Tabla 2 correcta (subagentes + hallazgo 2 + side-request vs agentic).
- Schema único `billable_hops` / `finalized_runs`.
- Retirar `languageModelId`, `setWorkflowModel`, alias deprecated, dual-read statusline.
- `buildInferenceRequestSnapshot` robusto sin agregado zombie en workflow.

**Non-Goals:**

- Migrador de sesiones históricas.
- Fallbacks de lectura para nombres G4/camelCase.
- Mantener `languageModelId` “por si acaso”.

## Decisions

### D1 — Schema único en `session-metrics.json`

Escritura y lectura **solo** con nombres canónicos (véase tabla de renombre arriba). Tokens siempre en snake_case (`input_tokens`, …).

`recalcSessionTotals` SHALL mantener `session_totals.billable_hops` = suma de `models[*].billable_hops` en cada escritura.

**NO** escribir ni leer `count`, `workflow_count`, `total_steps`, `total_workflows`, ni tokens camelCase.

### D2 — G16′

Métricas para `kind: 'main'` y `kind: 'subagent'`; excluidos preflights no proyectados.

### D3 — Atribución de ejecución

Primer step cerrado con `stepKind === 'agentic'` y `usage`, orden `index` ascendente. Sin `languageModelId` ni otros fallbacks. Sin hop agéntico con `usage` → sin `finalized_runs` (D5).

**f33cf423:** M2.5 side-request → 0 runs; M2.7 agentic → +1; total 1.

### D4 — Ritmo per-step vs finalize

Sin cambio arquitectónico: hops/tokens al cerrar step; runs al cierre E2E.

### D5 — Sin hop agéntico atribuible

No incrementar `finalized_runs`; side-requests con `usage` siguen en `billable_hops`.

### D6 — Fila Totales de la Tabla 2

| Columna UI | Fuente en JSON | NO usar |
|------------|----------------|---------|
| `# Steps` | `session_totals.billable_hops` | Σ columnas Lite+Standard+Reasoning (puede coincidir, pero la fuente es el total del archivo) |
| `# Workflows` | `session_totals.finalized_runs` | Σ `finalized_runs` por nivel — corregía hallazgo 2 cuando un main multi-modelo inflaba la suma |

Las filas por nivel siguen agregando `billable_hops` y `finalized_runs` **por modelo** vía `classifyModelWithEnv`.

### D7 — Retiro `languageModelId` / `setWorkflowModel`

- Eliminar campo de `IWorkflow`, modelo `Workflow`, y método del port/implementación.
- Eliminar tests dedicados a `setWorkflowModel`.
- Delta spec `gateway-workflow-lifecycle`: REMOVED requisitos de propagación G3.
- **No** sustituir por otro agregado en workflow; el modelo por hop vive en `IStep.inferenceRequest.model`.

### D8 — `buildInferenceRequestSnapshot` sin zombie

Reemplazar `workflow.languageModelId ?? 'unknown'` por, en orden:

1. `assembled.model` (SSE);
2. `step.inferenceRequest.model` del step abierto en `assignedStepIndex` (si existe en correlador);
3. extracción del body de request del hop actual cuando el handler la tenga disponible;
4. si ninguno aplica en un fallback extremo: `'unknown'` (último recurso, no `languageModelId`).

Handlers que construyen fallback SHALL pasar el step o el modelo del request, no depender de un campo de workflow eliminado.

### D9 — Retiro alias deprecated en tipos

Eliminar reexports `SessionMetrics` / `SessionModelMetrics` de `audit.types.ts`. Consumidores usan `ISessionMetrics` / `IModelSessionMetrics` desde `session-metrics.types.ts` (hoy solo documentación y tipos locales en statusline).

### D10 — Sesiones con `session-metrics.json` en schema G4 (nombres retirados)

Sin migrador. Si el archivo solo tiene `count` / `workflow_count` / `total_steps` / `total_workflows` (schema G4) y carece de `billable_hops` / `finalized_runs`, `aggregateSessionMetrics` retorna métricas vacías. El primer hop o cierre post-deploy reescribe el archivo en schema canónico y la Tabla 2 vuelve a mostrar datos.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Tabla 2 en cero en sesiones viejas hasta nuevo hop | Aceptado; sin migrador por decisión de producto |
| Fallback `buildWireStep` sin modelo | D8: priorizar step en correlador |
| Spec principal `gateway-workflow-lifecycle` pierde G3 | Delta REMOVED + sync al archivar |

## Migration Plan

1. Dominio: tipos métricas + `resolveAttributedModelId`; retiro `languageModelId` / port.
2. Servicios: `SessionMetricsService` schema nuevo; `WorkflowRepository` sin `setWorkflowModel`.
3. Operations: G16′, D8 en wire util y handlers.
4. Statusline: schema único + totales estructurales.
5. Tests y docs; actualizar fixtures al schema canónico.
6. `npm run test:quick`.

**Rollback:** revert del change completo.

## Open Questions

_(ninguna)_

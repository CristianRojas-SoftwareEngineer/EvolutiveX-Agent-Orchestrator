## Why

La Tabla 2 del statusline («Trabajo por niveles de razonamiento») debe distribuir **trabajo y consumo facturado** entre Lite / Standard / Reasoning, incluyendo subagentes que pueden usar modelos distintos al agente principal. Hoy el sistema (invariante G16) ignora sub-workflows en `session-metrics.json`, y al cerrar un workflow main incrementa `workflow_count` **una vez por cada modelo** que participó en hops — produciendo drift (hallazgo 2: `total_workflows: 2` con un solo turno en disco cuando dos modelos intervinieron en el main).

La documentación previa equiparaba `# Workflows` con turnos de usuario; el propósito de producto correcto para la Tabla 2 es contar **ejecuciones agénticas finalizadas** (main + subagentes), atribuidas al modelo del primer hop agéntico con `usage`, mientras `# Steps` y tokens siguen siendo per-hop en tiempo real.

Además, el codebase acumula piezas **zombie o drift** respecto a specs previas (`setWorkflowModel` / `languageModelId` sin cableado, alias `@deprecated` sin consumidores, lectura dual camelCase/snake_case y nombres G4 obsoletos en statusline). Este change implementa el modelo nuevo **y retira** lo reemplazado en el mismo diff — sin fallbacks de compatibilidad ni parches acumulativos.

## What Changes

- Redefinir semántica de métricas de sesión para la Tabla 2: hops facturables en tiempo real (main **y** subagent) + ejecuciones agénticas al cierre (main **y** subagent).
- **BREAKING (renombre de schema JSON):** sustituir nombres G4 por canónicos — la Tabla 2 **sigue** mostrando `# Steps` y `# Workflows`; cambian el campo en disco y las reglas de cálculo:

  | G4 (retirado) | Canónico | Tabla 2 |
  |---------------|----------|---------|
  | `count` | `billable_hops` | `# Steps` por nivel |
  | `workflow_count` | `finalized_runs` | `# Workflows` por nivel |
  | `total_steps` | `session_totals.billable_hops` | `# Steps` totales |
  | `total_workflows` | `session_totals.finalized_runs` | `# Workflows` totales |

  Dejar de escribir y leer los nombres G4 y tokens en camelCase.
- Sustituir invariante G16 por **G16′**: escriben métricas los workflows agénticos `kind: main` y `kind: subagent`.
- Corregir hallazgo 2: `finalized_runs` +1 por ejecución al `modelId` del **primer hop `stepKind: agentic` con `usage`** (orden por `index`).
- Totales Tabla 2 desde `session_totals`: `billable_hops` → `# Steps`, `finalized_runs` → `# Workflows` (este último = `finalized_workflow_ids.length`, no suma por nivel).
- **Retiro estructural (mismo change):**
  - Eliminar `setWorkflowModel`, `languageModelId` en `IWorkflow` / `Workflow` / port del correlador.
  - Eliminar alias `@deprecated` `SessionMetrics` / `SessionModelMetrics` en `audit.types.ts`.
  - Reemplazar fallback `languageModelId` en `buildInferenceRequestSnapshot` por modelo del step en correlador o del request HTTP.
  - Statusline: leer solo schema canónico; sin lectura de nombres G4 ni camelCase.
  - Revocar requisitos de spec de propagación G3 (`setWorkflowModel` en handler SSE).

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `gateway-session-metrics`: renombre G4 → canónico, G16′, atribución por primer hop agéntico, retiro de alias `@deprecated` en tipos.
- `gateway-audit-projection`: `delegateClosure` y per-step alineados con G16′.
- `gateway-workflow-lifecycle`: REMOVED `setWorkflowModel`, `languageModelId` y propagación SSE G3.
- `statusline-runtime`: Tabla 2 solo schema canónico; totales estructurales.

## Impact

| Área | Detalle |
|------|---------|
| **1-domain** | `session-metrics.types.ts`; `resolveAttributedModelId`; retiro `languageModelId` + `setWorkflowModel` del port |
| **2-services** | `session-metrics.service.ts`; `workflow-repository.service.ts` (sin `setWorkflowModel`) |
| **3-operations** | `persist-billable-step-metrics`, `delegateClosure`, `gateway-wire-step.util.ts` |
| **scripting** | `router-status.ts` — schema único, sin dual-read |
| **Tests** | session-metrics, router-status-*, hook handler, workflow-repository (eliminar tests de `setWorkflowModel`) |
| **Docs** | `session-metrics-system.md`, `router-statusline.md`, `gateway-architecture.md` (campo workflow) |
| **Specs** | Deltas en cuatro capabilities; sync a `openspec/specs/` al cerrar |
| **Sesiones en disco** | JSON solo con nombres G4 → Tabla 2 en cero hasta el primer hop/cierre post-deploy que reescriba el archivo (sin migrador) |

## No objetivos

- Cambiar layout causal en disco ni `workflow-sequence.json`.
- Renombrar columnas UI del statusline (`# Workflows`, `# Steps`).
- Script de migración de `session-metrics.json` históricos.
- Renombrar método `finalizeWorkflowMetrics` (solo semántica interna; nombre de método fuera de scope).
- Sintetizar `usage` en hops sin campo `usage` del proveedor.

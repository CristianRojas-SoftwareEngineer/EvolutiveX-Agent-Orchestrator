## Context

Hoy `SessionMetricsService.updateFromWorkflow()` se invoca solo desde `AuditHookEventHandler.delegateClosure()` al hook `Stop` (workflows `main`). Agrupa todos los steps cerrados del workflow y escribe `session-metrics.json` de una vez. El statusline (`scripting/router-status.ts`) lee ese archivo en cada invocación de Claude Code; no tiene acceso al correlador en RAM.

El correlador ya registra cada hop vía `registerWireStepInCorrelator` y cierra steps terminales con `closeStep`; los hops `tool_use` registran step pero no llaman `closeStep` hasta reglas posteriores.

Referencias: [`docs/session-metrics-system.md`](../../../docs/session-metrics-system.md), [`docs/router-statusline.md`](../../../docs/router-statusline.md).

## Goals / Non-Goals

**Goals:**

- Persistir `count` y tokens en `session-metrics.json` tras cada step main contable, para que la Tabla 2 pueda avanzar intra-workflow.
- Mantener G16: sub-workflows no escriben métricas de sesión.
- Mantener `workflow_count` / `total_workflows` solo al cierre del workflow main.
- Evitar doble conteo entre wire (per-step) y hook (cierre).

**Non-Goals:**

- Cambiar frecuencia de refresh del host Claude Code.
- Escanear `workflows/*/steps` desde el statusline.
- Nuevo endpoint HTTP de métricas.
- Métricas de `client-preflight`.

## Decisions

### D1: Dos operaciones en `SessionMetricsService`

| Método (nombre orientativo) | Cuándo | Qué actualiza |
|----------------------------|--------|----------------|
| `updateFromStep(sessionDir, step)` | Tras step main contable con `usage` | `count`, tokens, `cache_efficiency`, `session_totals`; **no** `workflow_count` |
| `finalizeWorkflowMetrics(sessionDir, workflow)` o `updateFromWorkflow` refactor | Hook `delegateClosure` (main) | `workflow_count` (+1 por modelo del workflow); **no** re-sumar steps ya contabilizados |

**Rationale:** Separa responsabilidades alineadas con columnas del statusline (# Steps vs # Workflows). Alternativa descartada: solo ampliar `updateFromWorkflow` en wire — mezclaría cierre de workflow con cada hop y complicaría `workflow_count`.

### D2: Idempotencia por `step.id`

Mantener en el archivo (o sidecar ligero bajo la sesión, p. ej. conjunto en memoria + persistencia opcional) los IDs de steps ya volcados, o derivar idempotencia de un campo en `session-metrics.json` si el diseño lo permite sin inflar el schema §28.2.

**Rationale:** Reintentos wire, cola serializada y races proxy/statusline. Alternativa descartada: confiar solo en `closedAt` sin registro — frágil ante re-entradas.

**Preferencia:** sidecar `session-metrics-applied-steps.json` o lista acotada en diseño de implementación; si se rechaza sidecar, documentar límite de retención en Open Questions.

### D3: Punto de enganche wire

Invocar `updateFromStep` desde la capa 3 tras `registerWireStepInCorrelator` cuando:

- el workflow resuelto es `kind: 'main'`,
- el step tiene `usage`,
- el step es contable (ver D4).

Inyectar `SessionMetricsService` + resolución de `sessionDir` desde `sessionId` del workflow (mismo criterio que `delegateClosure`).

**Alternativa descartada:** suscribir el bus `step_response` en un handler nuevo — más acoplamiento a telemetría; el wire ya tiene el step ensamblado.

### D4: Steps con `stop_reason === 'tool_use'`

**Decisión propuesta (MVP):** contabilizar per-step solo cuando `closeStep` se ejecutó (stops terminales). Los hops `tool_use` se acumulan cuando el step correspondiente quede cerrado con `usage` en el correlador (puede ser en un hop posterior).

**Alternativa:** contar en el primer registro con `usage` aunque no haya `closeStep` — más granular en UI pero diverge de “steps cerrados” usados hoy en `aggregateWorkflowUsageByModel`.

Documentar la elección final en implementación y en `docs/session-metrics-system.md`.

### D5: Sin cambios obligatorios en `router-status.ts`

La lectura O(1) existente es suficiente si el proxy escribe a tiempo. Opcional: una línea en `docs/router-statusline.md` sobre cadencia host vs persistencia proxy.

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Más escrituras a disco por sesión activa | Cola `writeQueue` existente; escritura atómica; batches solo si perfil lo exige (fuera de MVP) |
| Race statusline lee antes del write | Mismo patrón que G4; idempotencia; documentar que la UI depende del refresh de Claude |
| Doble conteo cierre + per-step | Tests explícitos; path de cierre solo `workflow_count` |
| Sidecar de ids crece en sesiones largas | Podar por workflow cerrado o TTL en diseño de implementación |

## Migration Plan

- **Deploy:** cambio de comportamiento en proxy; sesiones en curso: `session-metrics.json` existente sigue válido; steps nuevos usan per-step; workflows abiertos antes del deploy pueden tener un último cierre que solo suma `workflow_count` si los hops previos no tenían per-step (aceptable en brownfield).
- **Rollback:** revertir proxy; statusline sigue leyendo el archivo (posible subconteo temporal hasta próximo cierre full — documentar).

## Resolved decisions

1. **Sidecar:** `sessions/<sessionDir>/session-metrics-applied.json` con `applied_step_ids` y `finalized_workflow_ids` (snake_case). No se modifica el schema §28.2 de `session-metrics.json`.
2. **Steps contables:** solo `stopReason` terminal (misma condición que `closeStep` en wire: `end_turn`, `max_tokens`, `null`, `''`). Hops `tool_use` no cuentan hasta un hop terminal posterior.
3. **Fallback cierre:** `finalizeWorkflowMetrics` hace merge completo de tokens/count solo para steps en `closedSteps` cuyo `id` no está en `applied_step_ids` (p. ej. `StopFailure` o brownfield).

## As-built

- **API:** `SessionMetricsService.updateFromStep`, `finalizeWorkflowMetrics`; retirado `updateFromWorkflow`.
- **Sidecar:** `session-metrics-applied.json` (`applied_step_ids`, `finalized_workflow_ids`).
- **Wire:** `persistBillableStepMetricsIfNeeded` en `AuditSseResponseHandler` y `AuditStandardResponseHandler` tras `registerWireStepInCorrelator`.
- **Hooks:** `AuditHookEventHandler.delegateClosure` → `finalizeWorkflowMetrics(sessionDir, workflowId, closedSteps)`.
- **Dominio:** `isStepBillableForSessionMetrics` alineado con terminal de `gateway-wire-step.util.ts`.

## Sistema de métricas por Slot/Modelo y Sesión (`session-metrics.json`)

### Motivación

Antes de este sistema, el statusline calculaba las métricas de la Tabla 2 ("Trabajo por niveles de razonamiento") mediante un escaneo completo de todos los `meta.json` + `body.json` de la sesión en cada invocación. Esto producía race conditions, rescan O(N) y acoplamiento innecesario con artefactos del proxy.

### Diseño actual (schema canónico)

#### Archivo `session-metrics.json`

Se escribe a nivel de sesión (`sessions/<session-id>/session-metrics.json`):

```json
{
  "models": {
    "claude-opus-4-5": {
      "billable_hops": 3,
      "finalized_runs": 1,
      "input_tokens": 12400,
      "output_tokens": 950,
      "cache_creation_input_tokens": 3100,
      "cache_read_input_tokens": 8200,
      "cache_efficiency": 0.67
    }
  },
  "session_totals": {
    "input_tokens": 12400,
    "output_tokens": 950,
    "cache_creation_input_tokens": 3100,
    "cache_read_input_tokens": 8200,
    "billable_hops": 3,
    "finalized_runs": 1
  }
}
```

| Campo canónico | Columna Tabla 2 | Semántica |
|----------------|-----------------|-----------|
| `models[*].billable_hops` | `# Steps` por nivel | Hops cerrados con `usage` (main y subagent) |
| `models[*].finalized_runs` | `# Workflows` por nivel | Ejecuciones agénticas finalizadas atribuidas a ese `modelId` |
| `session_totals.billable_hops` | `# Steps` fila Totales | Σ `billable_hops` por modelo |
| `session_totals.finalized_runs` | `# Workflows` fila Totales | `finalized_workflow_ids.length` (conteo estructural) |

> **`finalized_runs`:** +1 por ejecución agéntica (`kind: 'main'` o `kind: 'subagent'`) al cierre E2E, atribuida al modelo del **primer hop `stepKind: 'agentic'` con `usage`** (orden por `index`). Un main multi-modelo cuenta **una** ejecución en el slot del hop agéntico primario, no +1 por cada modelo que participó en hops.

Cada clave en `models` es el `modelId` (`step.inferenceRequest.model`). Los nombres G4 (`count`, `workflow_count`, `total_steps`, `total_workflows`) están retirados; sesiones con JSON antiguo no se migran — el statusline trata schema inválido como métricas vacías hasta el primer hop/cierre post-deploy.

#### Tipos de dominio

`ISessionMetrics` e `IModelSessionMetrics` en `src/1-domain/types/gateway/session-metrics.types.ts`. `resolveAttributedModelId` en `src/1-domain/services/gateway/resolve-attributed-model-id.ts`.

#### Escritura (`SessionMetricsService`)

| Método | Cuándo | Qué actualiza |
|--------|--------|---------------|
| `updateFromStep(sessionDir, step)` | Tras hop agéntico (main o subagent) con `usage` disponible, independientemente de `stop_reason` | `billable_hops`, tokens, `cache_efficiency`, `session_totals.billable_hops`; **no** `finalized_runs` |
| `finalizeWorkflowMetrics(sessionDir, workflowId, closedSteps)` | Hook `Stop` / `StopFailure` / `SubagentStop` en workflow agéntico (G16′) | `finalized_runs` (+1 al modelo atribuido); `billable_hops`/tokens solo para steps no volcados per-step. Registra el `workflowId` en `finalized_workflow_ids` **incondicionalmente** (incluso sin usage o sin modelo atribuido), garantizando idempotencia entre sus tres callers |

**Invariante G16′:** escriben métricas los workflows `kind: 'main'` y `kind: 'subagent'`. Preflights y side-requests standalone no cierran ejecución agéntica (aunque un side-request con `usage` sí suma en `billable_hops` vía `updateFromStep`).

**Idempotencia:** sidecar `session-metrics-applied.json` con `applied_step_ids` y `finalized_workflow_ids`.

| Componente | Rol |
|------------|-----|
| `AuditHookEventHandler` | `close()` + `finalizeWorkflowMetrics` (main y subagent) |
| `AuditSseResponseHandler` / `AuditStandardResponseHandler` | `persistBillableStepMetricsIfNeeded` → `updateFromStep` + refresh de cuota |
| `persist-billable-step-metrics.util.ts` | G16′ + `usage`; opcionalmente `SubscriptionQuotaService.refreshIfNeeded` |
| `SubscriptionQuotaService` | Tras hop facturable: fetch TTL a API del proveedor → `subscription-quota.json` |

#### Archivo `subscription-quota.json`

Se escribe en la raíz de la sesión (`sessions/<session-id>/subscription-quota.json`), al mismo nivel que `session-metrics.json`. El proxy lo actualiza tras cada hop facturable cuando el proveedor activo declara `SUBSCRIPTION_QUOTA.enabled` en `routing/providers/<name>/config.json`.

- **Escritura:** `SubscriptionQuotaService.refreshIfNeeded` (invocado desde `persistBillableStepMetricsIfNeeded`), con TTL `refresh_interval_seconds` (default 60s).
- **Lectura:** `router-status.ts` → `resolveQuotaSource()` (sin HTTP en el statusline).
- **Schema:** `fetched_at`, `provider`, `adapter`, ventanas opcionales `five_hour` / `seven_day` con `used_percentage` y `resets_at` (epoch segundos).

Errores de red en el fetch no abortan el hop; se preserva el archivo previo si existía.

#### Lectura en el statusline (`scripting/router-status.ts`)

`aggregateSessionMetrics` lee **solo** el schema canónico (`billable_hops`, `finalized_runs`, tokens en snake_case). La fila **Totales** toma `# Steps` y tokens desde `session_totals`; `# Workflows` se deriva de la **suma de los niveles renderizados** (lite + standard + reasoning) para que la tabla sea internamente consistente (en `session_totals.finalized_runs` cuentan también workflows sin modelo atribuido, que no tienen fila por nivel).

#### Mapeo Tabla 2

```
Por fila (Lite / Standard / Reasoning):
  # Steps     ← Σ models[modelId].billable_hops   (modelId clasificado en ese nivel)
  # Workflows ← Σ models[modelId].finalized_runs

Fila Totales:
  # Steps     ← session_totals.billable_hops
  # Workflows ← Σ finalized_runs de los niveles lite/standard/reasoning
```

#### Semántica de los totales

`session-metrics.json` acumula consumo **facturado por hop** al cerrar steps con `usage` en el correlador. No representa el tamaño de contexto de un único request.

#### Validez multi-proveedor

El sistema depende del campo `"model"` del request body. La clasificación lite/standard/reasoning usa `ANTHROPIC_DEFAULT_*_MODEL`; registros sin coincidencia no se suman (véase [`router-statusline.md`](./router-statusline.md)).

---

## Sistema de métricas por Slot/Modelo y Sesión (`session-metrics.json`)

### Motivación

Antes de este sistema, el statusline calculaba las métricas de la Tabla 2 ("Interacciones por nivel de razonamiento") mediante un escaneo completo de todos los `meta.json` + `body.json` de la sesión en cada invocación (`aggregateSessionMetrics`). Esto producía tres problemas:

1. **Race condition proxy/statusline**: El proxy escribe `meta.json` en un callback `stream.on('end')` posterior al último chunk SSE. Claude Code puede re-invocar el statusline antes de que `meta.json` exista — el turno recién completado era invisible.
2. **Rescan O(N)**: La función crecía linealmente con el número de interacciones de la sesión.
3. **Acoplamiento innecesario**: El statusline duplicaba lógica de lectura de artefactos del proxy (meta.json, body.json) cuando el proxy ya tenía toda la información al cerrar cada turno.

### Diseño actual (post-G4)

#### Archivo `session-metrics.json`

Se escribe a nivel de sesión (`sessions/<session-id>/session-metrics.json`). El esquema canónico sigue [§28.2 de `gateway-architecture.md`](./gateway-architecture.md#282-session-metricsjson-raíz-de-sesión):

```json
{
  "models": {
    "claude-opus-4-5": {
      "count": 3,
      "workflow_count": 2,
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
    "total_steps": 3,
    "total_workflows": 2
  }
}
```

> **`workflow_count`:** número de workflows main cerrados (`kind: 'main'`) que usaron ese `modelId` en la sesión. Se incrementa en 1 por cada cierre de workflow main que incluya ese modelo (invariante G16). Los sub-workflows no contribuyen a este contador. Siempre se cumple `count ≥ workflow_count` (cada workflow tiene ≥ 1 step).

Cada clave en `models` es el `modelId` (`step.inferenceRequest.model` en el correlador). Los valores son contadores acumulados desde el inicio de la sesión. Los campos `duration_ms` y `outcome` a nivel de archivo están diferidos (no se escriben en G4).

Sesiones creadas antes de G4 pueden conservar entradas en **camelCase** (`inputTokens`, etc.) sin `session_totals`; el statusline acepta ambos formatos al leer.

#### Tipos de dominio

- **Canónico (G4):** `ISessionMetrics` e `IModelSessionMetrics` en `src/1-domain/types/gateway/session-metrics.types.ts`.
- **Legacy:** `SessionMetrics` / `SessionModelMetrics` en `audit.types.ts` son alias `@deprecated` hacia los tipos gateway.

`InteractionMetadata` (y tipos `@deprecated` en `audit.types.ts`) conservan `modelId?: string` solo para proyección offline / shim SSE; **no** hay `ActiveInteraction` en memoria tras P1 (`IWorkflow` en `IWorkflowRepository`).

#### Escritura (`SessionMetricsService`, G4 + per-step)

`updateSessionMetrics()` en `AuditWriterService` fue **retirado** en G4. La actualización la realiza `SessionMetricsService` (`src/2-services/session-metrics.service.ts`) con dos operaciones:

| Método | Cuándo | Qué actualiza |
| ------ | ------ | ------------- |
| `updateFromStep(sessionDir, step)` | Tras hop main **contable** en wire (stop terminal + `usage`) | `count`, tokens, `cache_efficiency`, `session_totals`; **no** `workflow_count` |
| `finalizeWorkflowMetrics(sessionDir, workflowId, closedSteps)` | Hook `Stop` / `StopFailure` en workflow **`kind: 'main'`** (G16) | `workflow_count` (+1 por modelo del workflow); tokens/count solo para steps no volcados per-step |

Los sub-workflows **nunca** escriben `session-metrics.json`.

**Idempotencia:** sidecar `sessions/<session-id>/session-metrics-applied.json` con `applied_step_ids` y `finalized_workflow_ids` (snake_case). No modifica el schema §28.2 de `session-metrics.json`.

**Steps contables:** misma condición que `closeStep` en wire (`end_turn`, `max_tokens`, `null`, `''`). Hops `tool_use` no cuentan hasta un hop terminal posterior.

**Fallback en cierre:** si un workflow main cierra con steps con `usage` que no pasaron por `updateFromStep` (p. ej. brownfield o `StopFailure`), `finalizeWorkflowMetrics` hace merge de tokens/count solo para esos steps no listados en `applied_step_ids`.

Ambos métodos usan cola `writeQueue`, `writeJsonAtomic` y escriben métricas + sidecar en la misma operación encolada.

| Componente | Rol |
| ---------- | --- |
| `AuditHookEventHandler` | `close()` + `finalizeWorkflowMetrics` (solo main) |
| `AuditSseResponseHandler` / `AuditStandardResponseHandler` | `registerStep` / `closeStep` + `persistBillableStepMetricsIfNeeded` → `updateFromStep` |
| `persist-billable-step-metrics.util.ts` | G16 + `isStepBillableForSessionMetrics` antes de `updateFromStep` |

Los `client-preflight` no actualizan métricas de sesión.

#### Lectura en el statusline (`scripting/router-status.ts`)

`aggregateSessionMetrics` lee `session-metrics.json` en O(1):

```
session-metrics.json → classifyModelWithEnv(modelId, settingsEnv) → acumular en lite / standard / reasoning
```

Acepta contadores en **snake_case** (G4) o **camelCase** (sesiones antiguas). Si el archivo no existe, retorna métricas en cero. No hay fallback a escaneo de `interactions/*/meta.json`. Al leer, normaliza `null` o no numéricos a `0` (véase §10 de [`router-statusline.md`](./router-statusline.md)).

Para el layout de sesión e interacciones, véase [`session-audit-model.md`](./session-audit-model.md) (§5, §6.1 y §8.3 G4).

#### Contabilización de subagentes

Solo el workflow **main** escribe en `session-metrics.json` al cierre (G16). Los sub-workflows consumen API en sus propios turnos, pero su uso agregado entra en el `WorkflowResult` del padre vía `aggregateWorkflowUsage`; no se duplica en el archivo de sesión al cerrar un subagente.

Cada turno sigue teniendo su propio `meta.json` y `stepsMeta`; la agregación de sesión refleja los cierres de workflows main con steps registrados en el correlador.

#### Semántica de los totales

`session-metrics.json` acumula consumo **facturado por hop** al cerrar workflows main (steps cerrados en el correlador), alineado con [§9.6.1 del gateway](./gateway-architecture.md#961-semántica-facturado-por-hop-vs-cardinalidad-de-contexto). No representa el tamaño de contexto de un único request.

#### Validez multi-proveedor

El sistema depende del campo `"model"` del request body, no de APIs propietarias. La clasificación lite/standard/reasoning en el statusline (`classifyModelWithEnv`) usa las variables `ANTHROPIC_DEFAULT_*_MODEL` del entorno de Claude Code; registros sin coincidencia no se suman (véase [`router-statusline.md`](./router-statusline.md)).

---

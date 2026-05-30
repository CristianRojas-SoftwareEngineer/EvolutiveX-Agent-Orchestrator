## Sistema de métricas por Slot/Modelo y Sesión (`session-metrics.json`)

### Motivación

Antes de este sistema, el statusline calculaba las métricas de la Tabla 2 ("Interacciones por nivel de razonamiento") mediante un escaneo completo de todos los `meta.json` + `body.json` de la sesión en cada invocación (`aggregateInteractionMetrics`). Esto producía tres problemas:

1. **Race condition proxy/statusline**: El proxy escribe `meta.json` en un callback `stream.on('end')` posterior al último chunk SSE. Claude Code puede re-invocar el statusline antes de que `meta.json` exista — el turno recién completado era invisible.
2. **Rescan O(N)**: La función crecía linealmente con el número de interacciones de la sesión.
3. **Acoplamiento innecesario**: El statusline duplicaba lógica de lectura de artefactos del proxy (meta.json, body.json) cuando el proxy ya tenía toda la información al cerrar cada turno.

### Diseño actual (post-G4)

#### Archivo `session-metrics.json`

Se escribe a nivel de sesión (`sessions/<session-id>/session-metrics.json`). Desde la fase **G4** del gateway el esquema canónico sigue [§33.2 de `gateway-design.md`](./proposals/gateway-design.md#332-session-metricsjson-raíz-de-sesión):

```json
{
  "models": {
    "claude-opus-4-5": {
      "count": 3,
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
    "total_steps": 3
  }
}
```

Cada clave en `models` es el `modelId` (`step.inferenceRequest.model` en el correlador). Los valores son contadores acumulados desde el inicio de la sesión. Los campos `duration_ms` y `outcome` a nivel de archivo están diferidos (no se escriben en G4).

Sesiones creadas antes de G4 pueden conservar entradas en **camelCase** (`inputTokens`, etc.) sin `session_totals`; el statusline acepta ambos formatos al leer.

#### Tipos de dominio

- **Canónico (G4):** `ISessionMetrics` e `IModelSessionMetrics` en `src/1-domain/types/gateway/session-metrics.types.ts`.
- **Legacy:** `SessionMetrics` / `SessionModelMetrics` en `audit.types.ts` son alias `@deprecated` hacia los tipos gateway.

`ActiveInteraction` y `InteractionMetadata` siguen llevando `modelId?: string` para inspección offline por turno.

#### Escritura (`SessionMetricsService`, G4)

`updateSessionMetrics()` en `AuditWriterService` fue **retirado** en G4. La actualización la realiza `SessionMetricsService` (`src/2-services/session-metrics.service.ts`):

1. Se invoca desde `AuditWorkflowClosureHandler` al cerrar un workflow **`kind: 'main'`** (invariante G16). Los sub-workflows no escriben `session-metrics.json` (su consumo ya está en el rollup del padre).
2. Agrupa steps cerrados con `aggregateWorkflowUsageByModel` (L1).
3. Hace merge incremental en `session-metrics.json`, recalcula `session_totals` y `cache_efficiency` por modelo.
4. Escribe con `writeJsonAtomic` del `IAuditWriter` y serializa actualizaciones con cola interna (`writeQueue`) para evitar races.

Ya **no** hay actualización per-step en los handlers wire; el cierre nominal del turno vía hooks (`Stop` / `SubagentStop` / `StopFailure`) dispara la proyección y, para workflows main, la métrica de sesión.

| Componente | Rol |
| ---------- | --- |
| `AuditHookEventHandler` | `close()` en el correlador |
| `AuditWorkflowClosureHandler` | `meta.json` + `SessionMetricsService` (solo main) |
| Handlers wire | `registerStep` / `closeStep` en correlador; sin `updateSessionMetrics` |

Los `client-preflight` no actualizan métricas de sesión.

#### Lectura en el statusline (`scripting/router-status.ts`)

`aggregateInteractionMetrics` lee `session-metrics.json` en O(1):

```
session-metrics.json → classifyModelWithEnv(modelId, settingsEnv) → acumular en lite / standard / reasoning
```

Acepta contadores en **snake_case** (G4) o **camelCase** (sesiones antiguas). Si el archivo no existe, retorna métricas en cero. No hay fallback a escaneo de `interactions/*/meta.json`. Al leer, normaliza `null` o no numéricos a `0` (véase §10 de [`router-statusline.md`](./router-statusline.md)).

Para el layout de sesión e interacciones, véase [`session-audit-model.md`](./session-audit-model.md) (§5, §6.1 y §8.3 G4).

#### Contabilización de subagentes

Solo el workflow **main** escribe en `session-metrics.json` al cierre (G16). Los sub-workflows consumen API en sus propios turnos, pero su uso agregado entra en el `WorkflowResult` del padre vía `aggregateWorkflowUsage`; no se duplica en el archivo de sesión al cerrar un subagente.

Cada turno sigue teniendo su propio `meta.json` y `stepsMeta`; la agregación de sesión refleja los cierres de workflows main con steps registrados en el correlador.

#### Semántica de los totales

`session-metrics.json` acumula consumo **facturado por hop** al cerrar workflows main (steps cerrados en el correlador), alineado con [§15.7.1 del gateway](./proposals/gateway-design.md#1571-agregación-a-nivel-session). No representa el tamaño de contexto de un único request.

#### Validez multi-proveedor

El sistema depende del campo `"model"` del request body, no de APIs propietarias. La clasificación lite/standard/reasoning en el statusline (`classifyModelWithEnv`) usa las variables `ANTHROPIC_DEFAULT_*_MODEL` del entorno de Claude Code; registros sin coincidencia no se suman (véase [`router-statusline.md`](./router-statusline.md)).

---

## Sistema de métricas por Slot/Modelo y Sesión (`session-metrics.json`)

### Motivación

Antes de este sistema, el statusline calculaba las métricas de la Tabla 2 ("Interacciones por nivel de razonamiento") mediante un escaneo completo de todos los `meta.json` + `body.json` de la sesión en cada invocación (`aggregateInteractionMetrics`). Esto producía tres problemas:

1. **Race condition proxy/statusline**: El proxy escribe `meta.json` en un callback `stream.on('end')` posterior al último chunk SSE. Claude Code puede re-invocar el statusline antes de que `meta.json` exista — el turno recién completado era invisible.
2. **Rescan O(N)**: La función crecía linealmente con el número de interacciones de la sesión.
3. **Acoplamiento innecesario**: El statusline duplicaba lógica de lectura de artefactos del proxy (meta.json, body.json) cuando el proxy ya tenía toda la información al cerrar cada turno.

### Diseño actual

#### Archivo `session-metrics.json`

Se escribe a nivel de sesión (`sessions/<session-id>/session-metrics.json`) con el siguiente esquema:

```json
{
  "models": {
    "claude-opus-4-5": {
      "count": 3,
      "inputTokens": 12400,
      "cacheReadInputTokens": 8200,
      "cacheCreationInputTokens": 3100,
      "outputTokens": 950
    },
    "claude-haiku-4-5-20251001": {
      "count": 1,
      "inputTokens": 400,
      "cacheReadInputTokens": 0,
      "cacheCreationInputTokens": 0,
      "outputTokens": 120
    }
  }
}
```

Cada clave en `models` es el `modelId` exacto extraído del request body (`"model"` field). Los valores son contadores acumulados desde el inicio de la sesión.

#### Tipos de dominio (`src/1-domain/types/audit.types.ts`)

```typescript
export interface SessionModelMetrics {
  count: number;
  inputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
}

export interface SessionMetrics {
  models: Record<string, SessionModelMetrics>;
}
```

Adicionalmente, `ActiveInteraction` y `InteractionMetadata` fueron extendidos con `modelId?: string` para que el modelo quede disponible al momento del cierre de turno y persista en cada `meta.json` individual para inspección offline.

#### Escritura atómica (`src/2-services/audit-writer.service.ts`)

`updateSessionMetrics` implementa read-modify-write atómico:

1. Lee `session-metrics.json` (`ENOENT` o parse error → `{ models: {} }`).
2. Suma los `totals` del step al bucket `models[modelId]` e incrementa `count` en `stepCount` (normalmente `1` por invocación per-step; `turn.stepsMeta.length` para turns huérfanos).
3. Escribe mediante `writeJsonAtomic` (escribe a `.tmp` + `rename`), garantizando que lectores concurrentes nunca ven un archivo parcialmente escrito.

#### Puntos de invocación (per-step + 2 callers legacy)

La invocación principal ocurre per-step, justo después de `pushStepMetaByDir`, sujeta a una guarda dual:

```
currentTurn?.modelId
```

| Punto de invocación                      | Archivo                                               | `stepCount`             |
| ---------------------------------------- | ----------------------------------------------------- | ----------------------- |
| Después de `pushStepMetaByDir` (SSE)     | `src/3-operations/audit-sse-response.handler.ts`      | `1`                     |
| Después de `pushStepMetaByDir` (non-SSE) | `src/3-operations/audit-standard-response.handler.ts` | `1`                     |
| `execute` (error upstream)               | `src/3-operations/audit-upstream-error.handler.ts`    | `stepsMeta.length`      |
| `closeOrphanTurn`                        | `src/3-operations/audit-interaction.handler.ts`       | `turn.stepsMeta.length` |

Los `client-preflight` están explícitamente excluidos porque no generan tokens de usuario.

#### Lectura en el statusline (`scripting/router-status.ts`)

`aggregateInteractionMetrics` fue reescrita de O(N) a O(1):

```
session-metrics.json → classifyModelWithEnv(modelId, settingsEnv) → acumular en lite / standard / reasoning
```

Si el archivo no existe (sesión anterior a la feature, o sesión vacía), retorna métricas en cero. No hay fallback a escaneo de `interactions/*/meta.json`: las sesiones anteriores simplemente no muestran métricas de Tabla 2. Al leer `session-metrics.json`, el agregador del statusline normaliza valores `null` o no numéricos a `0` antes de sumar (véase §10 de [`router-statusline.md`](./router-statusline.md), incluidas reglas de `used_percentage` y caché de contexto).

Para el layout de sesión e interacciones, véase [`session-audit-model.md`](./session-audit-model.md) (§5 y §6.1).

#### Contabilización de subagentes

Cada turno (padre y subagente) contribuye a `session-metrics.json` exclusivamente con su propio consumo de API. `computeTokenTotals` opera sobre `turn.stepsMeta`, que se puebla mediante `pushStepMetaByDir(context.auditInteractionDir, ...)` — donde `auditInteractionDir` es el directorio propio del turno. Los steps del subagente nunca se registran en el `stepsMeta` del padre, y viceversa.

El resultado es agregación correcta del costo real de API de la sesión:

```
step1 padre (fresh)          → inputTokens: X
step1 subagente              → inputTokens: Y   (llamada HTTP independiente)
step1 padre (Agent continuation coalesced) → inputTokens: Z
─────────────────────────────────────────────
session-metrics.json total                  → X + Y + Z
```

No existe doble conteo. Sumar todos los turnos da el costo total efectivo de la sesión.

#### Semántica de los totales

`session-metrics.json` acumula contadores `usage` **por step/llamada HTTP** (cada invocación que actualiza métricas suma su propio `totals` al bucket del modelo). Es **consumo facturado acumulado** en la sesión, equivalente en intención a `WorkflowResult.usage` en el [diseño unificado del gateway](./proposals/gateway-design.md#1571-semántica-facturado-por-hop-vs-cardinalidad-de-contexto) (§15.7.1).

No uses los totales de sesión como «tamaño del contexto en un solo request»: para eso conviene el último step del turno o su `usage` individual, no la suma de toda la sesión.

#### Validez multi-proveedor

El sistema funciona para cualquier proveedor configurado en Smart Code Proxy (Anthropic, OpenRouter, etc.) porque depende únicamente del campo `"model"` del request body JSON, no de APIs ni formatos de respuesta propietarios. La clasificación lite/standard/reasoning en el statusline (`classifyModelWithEnv` en `scripting/router-status.ts`) compara el `modelId` de cada entrada de `session-metrics.json` solo con las variables `ANTHROPIC_DEFAULT_*_MODEL` del entorno de **Claude Code** (`~/.claude/settings.json`); si no hay coincidencia, el registro no se suma a ningún nivel (véase §5 de [`router-statusline.md`](./router-statusline.md)). El resaltado entre invocaciones usa la caché `.statusline-state.json` (§4.4 del statusline).

---

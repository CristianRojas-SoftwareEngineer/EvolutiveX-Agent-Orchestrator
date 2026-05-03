# Problemas activos y diseño de sistemas en evolución

Este documento describe el diseño de sistemas recientemente introducidos y los problemas conocidos que aún no han sido abordados. Su propósito es preservar el razonamiento técnico para facilitar decisiones de diseño futuras.

---

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

Adicionalmente, `ActiveTurn` y `TurnMetadata` fueron extendidos con `modelId?: string` para que el modelo quede disponible al momento del cierre de turno y persista en cada `meta.json` individual para inspección offline.

#### Escritura atómica (`src/2-services/audit-writer.service.ts`)

`updateSessionMetrics` implementa read-modify-write atómico:

1. Lee `session-metrics.json` (`ENOENT` o parse error → `{ models: {} }`).
2. Suma los `totals` del turno al bucket `models[modelId]`.
3. Escribe mediante `writeJsonAtomic` (escribe a `.tmp` + `rename`), garantizando que lectores concurrentes nunca ven un archivo parcialmente escrito.

#### Puntos de invocación (4 handlers)

La invocación ocurre al cerrar un turno, sujeta a una guarda triple:

```
turn.interactionType !== 'client-preflight' && turn.modelId && totals
```

| Handler | Archivo |
|---------|---------|
| `writeTurnMeta` (SSE) | `src/3-operations/audit-sse-response.handler.ts` |
| `writeTurnMeta` (non-SSE) | `src/3-operations/audit-standard-response.handler.ts` |
| `execute` (error upstream) | `src/3-operations/audit-upstream-error.handler.ts` |
| `closeOrphanTurn` | `src/3-operations/audit-interaction.handler.ts` |

Los `client-preflight` están explícitamente excluidos porque no generan tokens de usuario.

#### Lectura en el statusline (`scripting/router-status.ts`)

`aggregateInteractionMetrics` fue reescrita de O(N) a O(1):

```
session-metrics.json → classifyModel(modelId) → acumular en lite / standard / reasoning
```

Si el archivo no existe (sesión anterior a la feature, o sesión vacía), retorna métricas en cero. No hay fallback a escaneo legacy: las sesiones anteriores simplemente no muestran métricas de Tabla 2.

#### Contabilización de subagentes

Cada turno (padre y subagente) contribuye a `session-metrics.json` exclusivamente con su propio consumo de API. `computeTokenTotals` opera sobre `turn.stepsMeta`, que se puebla mediante `pushStepMetaByDir(context.auditInteractionDir, ...)` — donde `auditInteractionDir` es el directorio propio del turno. Los steps del subagente nunca se registran en el `stepsMeta` del padre, y viceversa.

El resultado es agregación correcta del costo real de API de la sesión:

```
step1 padre (fresh)          → inputTokens: X
step1 subagente              → inputTokens: Y   (llamada HTTP independiente)
step2 padre (continuation)   → inputTokens: Z
─────────────────────────────────────────────
session-metrics.json total   → X + Y + Z
```

No existe doble conteo. Sumar todos los turnos da el costo total efectivo de la sesión.

#### Validez multi-proveedor

El sistema funciona para cualquier proveedor configurado en Smart Code Proxy (Anthropic, OpenRouter, etc.) porque depende únicamente del campo `"model"` del request body JSON, no de APIs ni formatos de respuesta propietarios. `classifyModel` clasifica el `modelId` usando las variables de entorno de configuración de modelos del proxy.

---

### Problemas conocidos

#### P1 — Race condition formal entre side-request y agentic-turn (misma sesión) [RESUELTO]

**Escenario:** Un side-request (`count_tokens`, `context-sync`) y el cierre de un agentic-turn ocurren concurrentemente en la misma sesión. Ambos ejecutan `updateSessionMetrics` sobre el mismo `session-metrics.json`.

**Mecanismo de fallo (original):** El ciclo read-modify-write no estaba protegido por ningún lock a nivel de archivo. Si el agentic-turn lee el archivo, luego el side-request lee el mismo estado, luego el agentic-turn escribe, luego el side-request escribe — la escritura del side-request sobreescribe la del agentic-turn. Se pierde una actualización.

**Resolución:** Las llamadas a `updateSessionMetrics` en los 4 handlers de cierre de turno ahora se envuelven en `withSessionLock(sessionId, ...)`. Esto serializa las escrituras a `session-metrics.json` por sesión, garantizando que cada incremento de contador y suma de tokens se aplique correctamente sobre el estado previo.

**Handlers modificados:**
- `src/3-operations/audit-sse-response.handler.ts` — `writeTurnMeta`
- `src/3-operations/audit-standard-response.handler.ts` — `writeTurnMeta`
- `src/3-operations/audit-upstream-error.handler.ts` — `execute`
- `src/3-operations/audit-interaction.handler.ts` — `closeOrphanTurn`

---
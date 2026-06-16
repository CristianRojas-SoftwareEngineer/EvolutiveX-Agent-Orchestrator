## Context

**Estado actual**

`AuditStandardResponseHandler` acumula el body de respuestas HTTP no-SSE, parsea JSON y extrae `usage`, `stop_reason` y `content`. Si `json.usage` no existe, el handler hace `return` inmediato (línea 89) y **no**:

- enriquece el step del correlador;
- publica `step_response`;
- permite que `SessionPersistence` escriba `steps/MM/response/`.

**Evidencia**

| Fuente | Hallazgo |
|--------|----------|
| Sesión `f33cf423` / step 05 | `step_request` índice 5; **sin** `step_response` índice 5 |
| `events.ndjson` | 6 `step_request`, 5 `step_response` |
| `server/logs.jsonl` | `POST /v1/messages/count_tokens` → HTTP 200 |
| Disco | `steps/05/request/body.json` sin `response/` |

**Forma de respuesta `count_tokens`**

```json
{ "input_tokens": 42444 }
```

Sin `usage`, sin `content`, sin `stop_reason`. Endpoint auxiliar (actualmente sin facturación directa en protocolo Anthropic).

**Restricciones**

- `WireStepResponsePatch.usage` ya es opcional en `gateway-wire-step.util.ts`.
- `applyWireStepResponseToStep` trata `stopReason == null` como cierre terminal.
- `persistBillableStepMetricsIfNeeded` ya retorna si `step.usage == null`.
- `assignedStepIndex` en egress ya está corregido (`fix-concurrent-step-attribution`); este change es ortogonal.

## Goals / Non-Goals

**Goals:**

- Toda respuesta HTTP estándar con body JSON **válido** SHALL proyectarse al step de `context.assignedStepIndex`.
- `side-request` `count_tokens` SHALL cerrar con `step_response` + `response/body.json`.
- Métricas per-step SHALL permanecer condicionadas a `usage` en el step enriquecido.
- Tests unitarios alineados con la spec (invertir test que codifica el bug).

**Non-Goals:**

- Rama exclusiva `/v1/messages/count_tokens`.
- Sintetizar `usage` desde `input_tokens` raíz.
- Omitir `count_tokens` en ingress.
- Proyectar bodies no parseables (truncados, no-JSON).
- Cambiar `AuditSseResponseHandler`.

## Decisions

### D1 — Separar umbral de proyección del umbral de métricas

**Decisión:** Sustituir `if (!bodyUsage) return` por dos caminos:

1. **Proyección (siempre que JSON válido):** construir `responsePatch`, enriquecer por `assignedStepIndex`, publicar `step_response` con `parsedBody` íntegro.
2. **Métricas (condicional):** invocar `persistBillableStepMetricsIfNeeded` solo si `bodyUsage` está definido y el step resultante tiene `usage`.

**Alternativas descartadas:**

| Alternativa | Motivo de descarte |
|-------------|-------------------|
| Rama solo `count_tokens` | Deuda por endpoint; no generaliza |
| Normalizar a `usage` sintético | Semántica confusa; riesgo de filtrar a métricas |
| No auditar en ingress | Pierde trazabilidad; no cierra steps ya abiertos |

### D2 — Condición de entrada: JSON parseable, no presencia de `usage`

**Decisión:** El handler continúa solo si `JSON.parse` del buffer acumulado tiene éxito. Si el parse falla (p. ej. buffer truncado por `MAX_RESPONSE_BUFFER_BYTES`), **no** se emite `step_response` (comportamiento actual del test de truncado se mantiene).

**Rationale:** Sin JSON válido no hay body forense útil que persistir; emitir evento vacío o corrupto empeora el árbol causal.

### D3 — Construcción del patch sin `usage`

**Decisión:** Cuando no hay `bodyUsage`:

```typescript
const responsePatch = {
  assistantMessage,           // content[] si existe; si no, { role: 'assistant', content: [] }
  ...(bodyUsage ? { usage } : {}),
  stopReason,                 // undefined para count_tokens — cierre terminal por D4
  closedAt: now,
};
```

No asignar `usage` en el patch ni en el step cuando el upstream no lo provee.

### D4 — Cierre terminal de `side-request` sin `stop_reason`

**Decisión:** Confiar en `applyWireStepResponseToStep`: `stopReason == null` ya dispara cierre (`isTerminal` incluye `null` y `''`). No inventar `stop_reason` sintético para `count_tokens`.

**Rationale:** El body persistido en `response/body.json` conserva la forma upstream; el correlador marca `closedAt`.

### D5 — Sin cambios en registro de `tool_use`

**Decisión:** El bucle `tool_use` en `assistantMessage.content` se ejecuta igual; para `count_tokens` el content suele estar vacío → sin `tool_call` adicional.

### D6 — Tests: reemplazo explícito del test regresivo invertido

**Decisión:**

| Test actual | Acción |
|-------------|--------|
| `no emite step_response si el body no tiene usage` | **Eliminar** o reescribir como caso positivo |
| _(nuevo)_ | `emite step_response sin usage (count_tokens)` con step abierto por índice |
| _(nuevo)_ | `no invoca updateFromStep cuando no hay usage` |
| `trunca el buffer...` | **Mantener** — parse inválido → sin emit |

## Risks / Trade-offs

| Riesgo | Mitigación |
|--------|------------|
| Respuestas de error HTTP con JSON sin `usage` pasan a proyectarse | Deseable para forense; métricas siguen sin incrementar |
| Body grande de `count_tokens` en `response/body.json` | Ya limitado por `MAX_RESPONSE_BUFFER_BYTES`; mismo límite que hoy |
| `workflow_complete.stepCount` podría incluir steps sin usage | Verificar que contadores usen steps con `usage` o cerrados; fuera de scope si ya excluye huérfanos |
| Sesiones históricas con step 05 huérfano | Sin migración; solo sesiones nuevas post-deploy |

## Migration Plan

1. Implementar cambio en `audit-standard-response.handler.ts`.
2. Actualizar tests en `audit-standard-response.handler.test.ts`.
3. `npm run test:quick`.
4. Validación manual opcional: sesión con `count_tokens` → verificar par `step_request`/`step_response` por índice y `response/body.json` en disco.

**Rollback:** revert del change; sin migración de datos.

## Open Questions

_(ninguna — estrategia acordada en exploración previa)_

# Referencia Estructural: sessions/

Documentación campo por campo de los archivos de auditoría generados por el Smart Code Proxy.

---

## Jerarquía completa

```
sessions/
  .gitkeep                             # Marcador de directorio en git (no borrar)
  <session-id>/
    session-metrics.json               # Métricas agregadas por modelo (actualizado per-step)
    main-agent/                        # Turnos agénticos (fresh + continuations)
      interaction-sequence.json        # Contador exclusivo del árbol main-agent
      interactions/
        NN/                            # 2 dígitos, 1-based (01, 02, …); interactionType: "agentic"
          meta.json                    # Siempre presente al cerrar el turno (InteractionMetadata)
          state.json                   # Marcador "in-progress" mientras el turno está abierto
          input/                       # Prompt inicial del usuario (top-level)
            headers.json
            body.bin                   # Condicional: si el step 1 tenía cuerpo
            body.json                  # Condicional: si body es JSON válido y dentro del límite
            body.parsed.md             # Condicional: vista Markdown (opcional si falla el render)
            body.omitted.txt           # Condicional: si body supera MAX_AUDIT_REQUEST_BODY_BYTES
          output/                      # En agentic SSE completados (reconstrucción OK)
            body.json                  # Mensaje asistente reensamblado (pretty print)
            body.parsed.md             # Condicional: vista Markdown
            headers.json               # Solo si body reconstruido
          steps/
            NN/                        # 2 dígitos, 1-based (01, 02, …)
              request/                 # Siempre presente (simetría estructural)
                headers.json
                body.bin
                body.json
                body.parsed.md
                body.omitted.txt
              response/
                sse.jsonl              # Solo step SSE. FUENTE DE VERDAD para reconstrucción.
                sse.txt                # Raw dump debug (acotado por MAX_AUDIT_SSE_RAW_BYTES)
                headers.json           # Solo step SSE
                body.json              # Step no-SSE (pretty print) o step SSE reconstruido
                body.omitted.txt       # No-SSE truncado o error de stream
                continuation.request.* # Solo continuations de Agent coalesced
                continuation.response.*# SSE terminal de continuation de Agent coalesced
              thought/                 # Solo si el step contiene extended thinking
                content.md             # Texto completo del thinking (sin truncar)
              sub-agent-NN/            # Solo si el step emitió tool_use Agent
                meta.json              # InteractionMetadata con parentContext
                state.json
                input/ ...             # Misma estructura que interacción raíz
                output/ ...
                steps/ ...
    side-interactions/                 # Preflights y side-requests
      interaction-sequence.json        # Contador exclusivo del árbol side-interactions
      NN/                              # 2 dígitos, 1-based; interactionType: "client-preflight" | "side-request"
        meta.json
        state.json
        input/                         # Solo en side-request (no en client-preflight)
          headers.json, body.bin, body.json, body.parsed.md, body.omitted.txt
        steps/
          NN/
            request/
              headers.json, body.bin, body.json, body.parsed.md
            response/
              sse.jsonl / body.json / headers.json
```

**Notas estructurales:**

- Los preflights (`client-preflight`) NO tienen `input/` ni `output/` en el nivel raíz; sus archivos están únicamente dentro de `steps/`.
- **Todos los tipos de interacción** escriben `steps/NN/request/` para mantener simetría estructural.
- `output/` top-level de un turno SSE (`agentic` o `side-request`) se crea siempre que la reconstrucción con SDK complete correctamente. La reconstrucción lee `steps/NN/response/sse.jsonl` (fuente de verdad); el estado de `sse.txt` (truncado, error de escritura) **no** la afecta. Si la reconstrucción falla, solo queda `body.reconstruct-error.txt` y no se escribe `headers.json` top-level.
- Las continuations de `Agent`/subagentes se coalescen en el step padre: no incrementan `stepCount`; guardan artefactos técnicos como archivos sibling `continuation.request.*` y `continuation.response.*` dentro de `steps/NN/response/`; y reescriben `response/body.json` como `type: "coalesced-agent-step-response"`.
- `state.json` es un marcador de vida: su presencia indica una interacción huérfana (proceso que crasheó entre la apertura del turno y su cierre).

---

## Matriz de presencia de archivos

### Nivel top-level (raíz de la interacción)

| Archivo | agentic | side-request | client-preflight |
|---------|:------------:|:------------:|:----------------:|
| `meta.json` | Siempre (al cerrar) | Siempre (al cerrar) | Siempre (al cerrar) |
| `state.json` | Mientras abierto | Mientras abierto | Mientras abierto |
| `input/headers.json` | Siempre | Siempre | No |
| `input/body.bin` | Sí (si había body) | Sí (si había body) | No |
| `input/body.json` | Sí* | Sí* | No |
| `input/body.parsed.md` | Sí† | Sí† | No |
| `input/body.omitted.txt` | Si supera límite | Si supera límite | No |
| `output/body.json` | Si reconstr. OK (1) | Si SSE y reconstr. OK (1) | No |
| `output/body.parsed.md` | Si reconstr. OK (1)† | Si SSE y reconstr. OK (1)† | No |
| `output/headers.json` | Si body reconstruido | Si body reconstruido | No |

### Nivel step (`steps/NN/`)

Presente en todos los tipos de interacción. **El step 01 siempre incluye `request/`** (igual que los steps 2+) por simetría estructural.

| Archivo | SSE step | No-SSE step | Aplica a |
|---------|:--------:|:-----------:|:--------:|
| `request/headers.json` | Sí | Sí | Todos los steps (01+) |
| `request/body.bin` | Sí (si había body) | Sí (si había body) | Todos los steps (01+) |
| `request/body.json` | Sí* | Sí* | Todos los steps (01+) |
| `request/body.parsed.md` | Sí† | Sí† | Todos los steps (01+) |
| `request/body.omitted.txt` | Si supera límite | Si supera límite | Todos los steps (01+) |
| `response/sse.jsonl` | Sí (fuente de verdad para reconstrucción) | No | — |
| `response/sse.txt` | Siempre (acotado por MAX_AUDIT_SSE_RAW_BYTES; raw dump debug, no afecta reconstrucción) | No | — |
| `response/headers.json` | Sí | **No** | Headers del step son idénticos a top-level para no-SSE |
| `response/body.json` | Sí (reconstruido) | Sí* | — |
| `response/body.omitted.txt` | No | Si truncado/error | — |
| `response/continuation.request.*` | Si continuation de Agent coalesced | No | Agent/subagentes |
| `response/continuation.response.*` | Si continuation de Agent coalesced | No | Agent/subagentes |
| `thought/content.md` | Si extended thinking | No | Solo steps con thinking blocks |

*Solo si el contenido es JSON válido y dentro de los límites de tamaño.

†Vista Markdown conversacional generada por `MarkdownRendererService` con soporte de `MarkdownRenderContext` (contexto posicional opcional):
  - **Requests (`body.parsed.md`):** Extrae el **último bloque `text`** del mensaje user. Estructura: encabezado contextual (`# Prompt del Usuario` / `# Prompt del Subagente` / `# Prompt del Side-request` / `# Prompt del Preflight`), bloque blockquote con metadata (modelo, step N de M), contenido Skill detectado en bloque colapsable `<details>`, texto del prompt, `**Adjuntos:**`, `**Contexto:**` con tool_results (para continuaciones), y footer `<!-- model: XXX, max_tokens: N -->`.
  - **Responses (`body.parsed.md`):** Estructura: encabezado contextual (`# Respuesta del Asistente` / subagente / side-request / preflight), bloque blockquote con metadata, secciones segmentadas por tipo de bloque en orden temporal: `## Razonamiento interno` (blockquote con thinking; múltiples bloques thinking separados por `---`; truncado a 5KB con referencia a `thought/content_path` si `thoughtContentPath` está presente), `## Respuesta` (texto), `## Acciones solicitadas` (tool_use), y metadata `_(stop_reason: XXX)_`. Para multi-step: TOC estilo GitHub con anclajes. Para `coalesced-agent-step-response`: secciones `Delegación a subagentes`, `Resultados recibidos de subagentes` y `Respuesta final combinada`.

(1) `output/` top-level (incluidos `body.json` y `headers.json`) se crea siempre que la reconstrucción con SDK termine con éxito. La reconstrucción lee **`steps/NN/response/sse.jsonl`** (orden determinista, escritura síncrona): el estado de `sse.txt` (truncado por `MAX_AUDIT_SSE_RAW_BYTES` o error de escritura) **no** la bloquea. Si la reconstrucción falla no se escribe `headers.json` top-level. Detalle técnico en `docs/how-sse-reconstruction-works.md` del proyecto.

---

## Catálogo de archivos

### `interaction-sequence.json`

Existen **dos** contadores independientes por sesión, uno por árbol de interacciones:

| Ubicación | Árbol que controla |
|-----------|-------------------|
| `sessions/<session-id>/main-agent/interactions/interaction-sequence.json` | Interacciones agénticas (`fresh` + `continuation`) bajo `main-agent/interactions/` |
| `sessions/<session-id>/side-interactions/interaction-sequence.json` | Preflights y side-requests bajo `side-interactions/` |

```json
{
  "last": 27
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `last` | integer | Último número de secuencia asignado al árbol correspondiente. Puede retrasarse respecto al número real de directorios en disco. Al iniciar sin historial previo, `SessionStoreService` recupera el máximo prefijo existente escaneando los directorios del árbol (regex `^\d{2}$`) para evitar colisiones. |

---

### `session-metrics.json`

**Ubicación:** `sessions/<session-id>/session-metrics.json` (nivel de sesión)

Archivo de resumen de métricas agregadas por modelo para toda la sesión. Actualizado atómicamente por el proxy al cerrar cada turno no-preflight (`agentic` y `side-request`). Permite al statusline (`scripting/router-status.ts`) leer métricas en O(1) sin escanear todos los `meta.json`.

```json
{
  "models": {
    "claude-sonnet-4-5-20251022": {
      "count": 12,
      "inputTokens": 45230,
      "cacheReadInputTokens": 198430,
      "cacheCreationInputTokens": 22150,
      "outputTokens": 8940
    },
    "claude-haiku-4-5-20251001": {
      "count": 3,
      "inputTokens": 1200,
      "cacheReadInputTokens": 4500,
      "cacheCreationInputTokens": 0,
      "outputTokens": 320
    }
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `models` | Record<string, SessionModelMetrics> | Mapa de modelId → métricas acumuladas |
| `models[id].count` | integer | Número de steps (llamadas API) ejecutados con ese modelo |
| `models[id].inputTokens` | integer | Suma de input tokens de todos los turnos con ese modelo |
| `models[id].cacheReadInputTokens` | integer | Suma de tokens leídos de caché |
| `models[id].cacheCreationInputTokens` | integer | Suma de tokens escritos en caché |
| `models[id].outputTokens` | integer | Suma de output tokens |

**Notas:**
- Se actualiza per-step tras cada step completado, para steps con `modelId` conocido.
- No existe para sesiones que no han completado ningún step no-preflight.
- No tiene fallback legacy: sesiones anteriores a esta feature no tienen el archivo y el statusline mostrará ceros.

---

### `meta.json`

**Siempre presente.** Describe el turno completo. Tipado por la interface `InteractionMetadata` en `src/1-domain/types/audit.types.ts`.

#### Campos core de InteractionMetadata

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `interactionType` | `"agentic"` \| `"client-preflight"` \| `"side-request"` | Tipo de turno lógico |
| `modelId` | string? | **Opcional.** Modelo usado en este turno, extraído del request body. Presente en `agentic` y `side-request`; ausente en `client-preflight` cuando el body no contiene modelo |
| `outcome` | `"completed"` \| `"client-error"` \| `"upstream-error"` \| `"truncated"` \| `"orphaned"` | **Requerido.** Resultado del turno: `completed` (2xx éxito), `client-error` (4xx error del cliente), `upstream-error` (5xx o fallo de conexión), `truncated` (truncado por max_tokens), `orphaned` (turno cerrado por cleanup/continuation faltante) |
| `stepCount` | integer | Número total de steps en el turno |
| `startedAt` | string (ISO 8601) | Timestamp de inicio del turno |
| `endedAt` | string (ISO 8601) | Timestamp de fin del turno |
| `durationMs` | integer | Duración total en milisegundos |
| `statusCode` | integer \| null | **Requerido.** Código HTTP del último step; `null` si no hubo respuesta |
| `sse` | boolean | **Requerido.** `true` si el último step fue SSE |
| `steps` | StepMeta[] | Array de metadatos por step (ver tabla siguiente) |
| `totals` | object \| null | **Requerido.** Tokens agregados del turno; objeto con totales o `null` para preflights |
| `truncation` | AuditTruncationMeta | Límites aplicados (ver §Objeto truncation) |
| `sseResponseBodyAttempted` | boolean | **Requerido.** Si se intentó la reconstrucción SSE |
| `sseResponseBodyWritten` | boolean | **Requerido.** Si se escribió exitosamente `response/body.json` reconstruido |
| `sseResponseBodyError` | string \| null | **Requerido.** Mensaje de error si la reconstrucción falló; `null` si no hubo error |
| `sseResponseBodySource` | string \| null | **Requerido.** Fuente de bytes SSE para reconstrucción. Valor actual: `"file"` (se refiere a `steps/NNN/response/sse.jsonl`); `null` si no aplica |
| `errorMessage` | string \| null | **Requerido.** Mensaje de error cuando `outcome` es `"upstream-error"`; `null` si no aplica |
| `errorCode` | string \| null | **Requerido.** Código de error cuando `outcome` es `"upstream-error"`; `null` si no aplica |
| `parentContext` | ParentContext? | **Opcional.** Presente solo en interacciones de subagentes anidadas bajo el step padre. Ver tabla ParentContext abajo |
| `lostPendingAgents` | PendingAgentToolUse[]? | **Opcional.** Presente cuando el turno se cierra habiendo registrado Agent tool_uses que no se consumieron (error upstream, orphan timeout, graceful shutdown). Información forense para correlación offline |
| `lostPendingWebSearch` | PendingWebSearchToolUse[]? | **Opcional.** Presente cuando el turno se cierra habiendo registrado WebSearch tool_uses que no se consumieron. Información forense para correlación offline |

#### Campos de ParentContext (solo subagentes)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `parentInteractionDir` | string | Directorio absoluto del turno padre |
| `parentStepIndex` | integer | Índice del step del padre (1-indexado) donde se emitió el tool_use `Agent` |
| `triggeringToolUseId` | string \| null | `tool_use_id` específico que originó este subagente. `null` cuando hubo varios `Agent` paralelos en el mismo step y la correlación no fue unívoca |
| `subagentType` | string? | Tipo de subagente declarado por el cliente (`general-purpose`, `Explore`, `Plan`, etc.). Opcional |

#### Campos de StepMeta (cada elemento de `steps[]`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `stepIndex` | integer | Número 1-based del step |
| `label` | string? | Etiqueta para preflights: `"quota-check"`, `"cache-warmup"` |
| `sse` | boolean | **Requerido.** `true` si el step fue SSE |
| `statusCode` | integer \| null | **Requerido.** Código HTTP del step; `null` si no hubo respuesta |
| `sseLineCount` | integer? | Líneas SSE capturadas en `steps/NNN/response/sse.jsonl` |
| `stopReason` | string? | `"end_turn"`, `"tool_use"`, `"max_tokens"` |
| `toolCalls` | string[]? | Nombres de herramientas invocadas en este step |
| `toolUseIds` | string[]? | IDs de tool_use emitidos en este step; usados para correlacionar continuaciones con su turno padre |
| `cacheCreationInputTokens` | integer? | Tokens de escritura en caché |
| `cacheReadInputTokens` | integer? | Tokens leídos de caché |
| `inputTokens` | integer? | Tokens de entrada |
| `outputTokens` | integer? | Tokens generados |
| `sseRawBytesWritten` | integer? | Bytes crudos SSE escritos en `steps/NNN/response/sse.txt` en este step (raw dump debug; informativo) |
| `sseRawTruncatedByLimit` | boolean? | `true` si el raw dump `sse.txt` de este step se cortó al alcanzar `MAX_AUDIT_SSE_RAW_BYTES`. **No afecta** a la reconstrucción: ésta se basa en `sse.jsonl`. |
| `anthropicMessageId` | string? | ID del mensaje de Anthropic (`message.id` de la API). Permite correlacionar con logs de Claude Code que incluyen este mismo ID en `message.id`. Ejemplo: `"msg_01SweCL7ReWWANWSRsPc8mfn"` |

#### Campos de `totals` (solo agentic SSE)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `cacheCreationInputTokens` | integer | Suma de cache creation de todos los steps |
| `cacheReadInputTokens` | integer | Suma de cache reads de todos los steps |
| `inputTokens` | integer | Suma de input tokens de todos los steps |
| `outputTokens` | integer | Suma de output tokens de todos los steps |

#### Objeto `truncation`

Tipado por la interface `AuditTruncationMeta` en `src/1-domain/types/audit.types.ts`. Reporta qué límites se aplicaron.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `requestBodyOmitted` | boolean | El body de petición no se guardó entero (supera `MAX_AUDIT_REQUEST_BODY_BYTES`) |
| `responseBodyBytesTotal` | integer \| null | Bytes totales del cuerpo/stream de respuesta del último step; `null` si no hubo respuesta |
| `responseBodyBytesAudited` | integer \| null | Bytes escritos en `response/body.*`; `null` en SSE |
| `responseTruncatedByProxyBuffer` | boolean \| null | La respuesta superó `MAX_RESPONSE_BUFFER_BYTES` (no-SSE); `null` en SSE |
| `responseTruncatedByAuditLimit` | boolean \| null | El prefijo guardado se cortó por `MAX_AUDIT_RESPONSE_BODY_BYTES`; `null` en SSE |
| `sseRawBytesAudited` | integer \| null | Suma de bytes SSE crudos escritos en `steps/NNN/response/sse.txt` de todos los steps del turno (`null` si no hay volcado) |
| `sseRawBytesLimit` | integer \| null | Tope efectivo del volcado crudo (`null` si ilimitado, `MAX_AUDIT_SSE_RAW_BYTES=0`) |
| `sseRawTruncatedByLimit` | boolean | El volcado crudo SSE alcanzó el límite |
| `sseRawWriteError` | boolean | Error de escritura en disco del volcado crudo |

**Ejemplos:**

Agentic Turn — 2 steps SSE (petición 000001):
```json
{
  "interactionType": "agentic",
  "outcome": "completed",
  "stepCount": 2,
  "startedAt": "2026-04-17T22:21:51.736Z",
  "endedAt": "2026-04-17T22:22:06.559Z",
  "durationMs": 14823,
  "statusCode": 200,
  "sse": true,
  "steps": [
    { "stepIndex": 1, "stopReason": "tool_use", "toolCalls": ["Read", "Glob"], "sse": true, "statusCode": 200, "sseLineCount": 24, "anthropicMessageId": "msg_01ABC..." },
    { "stepIndex": 2, "stopReason": "end_turn", "sse": true, "statusCode": 200, "sseLineCount": 18, "anthropicMessageId": "msg_01DEF..." }
  ],
  "totals": {
    "cacheCreationInputTokens": 16438,
    "cacheReadInputTokens": 49898,
    "inputTokens": 18,
    "outputTokens": 1192
  },
  "truncation": {
    "requestBodyOmitted": false,
    "responseBodyBytesTotal": 1347,
    "responseBodyBytesAudited": null,
    "responseTruncatedByProxyBuffer": false,
    "responseTruncatedByAuditLimit": false,
    "sseRawBytesAudited": null,
    "sseRawBytesLimit": 52428800,
    "sseRawTruncatedByLimit": false,
    "sseRawWriteError": false
  }
}
```

Client Preflight — 2 steps (petición 000002, cierre inmediato):
```json
{
  "interactionType": "client-preflight",
  "outcome": "completed",
  "stepCount": 2,
  "startedAt": "2026-04-17T22:21:28.636Z",
  "endedAt": "2026-04-17T22:21:30.130Z",
  "durationMs": 1494,
  "steps": [
    { "stepIndex": 1, "label": "quota-check", "sse": false, "statusCode": 200 },
    { "stepIndex": 2, "label": "cache-warmup", "sse": true, "statusCode": 200, "sseLineCount": 16 }
  ],
  "truncation": {
    "requestBodyOmitted": false,
    "responseBodyBytesTotal": 500,
    "responseBodyBytesAudited": null,
    "responseTruncatedByProxyBuffer": false,
    "responseTruncatedByAuditLimit": false,
    "sseRawBytesAudited": null,
    "sseRawBytesLimit": 52428800,
    "sseRawTruncatedByLimit": false,
    "sseRawWriteError": false
  }
}
```

> **Marcador `state.json`:** Estructura `{ state: "in-progress", startedAt, interactionType, continuationOrphan?, parentContext? }` que se escribe al iniciar cualquier interacción (`agentic`, `client-preflight`, `side-request`). Para subagentes incluye `parentContext`. `continuationOrphan` (opcional) indica que la continuation no encontró su turno padre vía `tool_use_id` (degradación). Se elimina al escribir `meta.json`. Su presencia junto con un `meta.json` ausente indica que el proceso del proxy terminó abruptamente durante ese turno — útil para auditar procesos huérfanos.

> **Todos los `meta.json` en disco son `InteractionMetadata`:** el tipo único; no hay formatos alternativos.

---

### `MarkdownRenderContext` (tipo de contexto posicional)

Tipado por la interface `MarkdownRenderContext` en `src/1-domain/types/audit.types.ts`. Contexto posicional que los handlers de Capa 3 proporcionan al `MarkdownRendererService` para enriquecer los `body.parsed.md` generados con información de ubicación en el flujo global. Se propaga a través de `IAuditWriter` (`writeFormattedAndMarkdown`, `writeStepResponseMarkdown`, `writeTopLevelMultiStepResponse`).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `interactionType` | `InteractionType?` | Tipo de interacción (`agentic`, `side-request`, `client-preflight`); determina el encabezado raíz del markdown |
| `stepIndex` | `number?` | Índice del step actual (1-indexado) |
| `stepCount` | `number?` | Total de steps en la interacción |
| `subagentType` | `string?` | Tipo de subagente (`general-purpose`, `Explore`, `Plan`, etc.) |
| `modelId` | `string?` | Modelo usado en este step |
| `thoughtContentPath` | `string?` | Path relativo a `thought/content.md` para referencia cruzada cuando el thinking está truncado |

**Efecto en `body.parsed.md`:**
- `buildRootHeading`: genera encabezado raíz contextual (main-agent, subagente, side-request, preflight)
- `renderContextHeader`: genera bloque blockquote metadata (modelo, step N de M, tipo de interacción)
- `detectAndRenderSkillContent`: detecta contenido Skill y lo renderiza en bloque `<details>` colapsable
- `renderStepSections`: separa múltiples bloques thinking con `---`; referencia `thoughtContentPath` al truncar
- `buildMultiStepToc`: genera TOC estilo GitHub con anclajes para multi-step

---

### `request/headers.json`

**Siempre presente.** Objeto plano con claves HTTP en minúscula. Las cabeceras se guardan **tal como llegan** del cliente, sin redacción en disco (la sanitización vía `RedactService` aplica solo a los logs de consola cuando `CONSOLE_REDACT=1`).

```json
{
  "accept": "application/json",
  "authorization": "Bearer <ANTHROPIC_KEY_REDACTED>...",
  "content-type": "application/json",
  "content-length": "323",
  "host": "127.0.0.1:8787",
  "user-agent": "claude-cli/2.1.96 (external, cli)",
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "oauth-2025-04-20,...",
  "x-claude-code-session-id": "707182ae-...",
  "x-cc-audit-session": "claude-code-workflow-example",
  "x-stainless-arch": "x64",
  "x-stainless-os": "Windows",
  "x-stainless-runtime": "node",
  "x-stainless-runtime-version": "v24.3.0",
  "x-stainless-package-version": "0.81.0",
  "connection": "keep-alive",
  "accept-encoding": "gzip, deflate, br, zstd"
}
```

**Notas:**
- `authorization` contiene el bearer token completo en texto claro.
- La cabecera que aportó el `sessionId` puede estar presente aquí aunque el proxy la haya eliminado hacia el upstream (se captura **antes** del strip cuando `STRIP_AUDIT_SESSION_HEADER=1`).
- Las cabeceras son exactamente las que envió el cliente; no hay garantía de qué campos estarán presentes.

---

### `request/body.bin`

**Presente cuando:** `requestBodyBytes > 0` y el cuerpo está dentro de `MAX_AUDIT_REQUEST_BODY_BYTES`.

Contenido: bytes crudos del cuerpo de la petición tal como llegaron. En la API de Anthropic suele ser JSON; se guarda como binario (`.bin`) para preservar el wire exacto. Es semánticamente equivalente al objeto reflejado en `request/body.json` (puede diferir en espacios o escapes respecto al pretty-print).

---

### `request/body.json`

**Presente cuando:** `request/body.bin` existe y el contenido es JSON válido (parseado por `RedactService.tryParseJson`, Capa 1: `src/1-domain/services/redact.service.ts`).

JSON pretty-printed del payload de la petición. Para peticiones a la API de Mensajes de Anthropic:

```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 1024,
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": "..."
    },
    {
      "role": "assistant",
      "content": [
        { "type": "text", "text": "..." },
        { "type": "tool_use", "id": "...", "name": "...", "input": {} }
      ]
    }
  ],
  "system": [
    { "type": "text", "text": "...", "cache_control": { "type": "ephemeral" } }
  ],
  "tools": [
    {
      "name": "tool_name",
      "description": "...",
      "input_schema": { "type": "object", "properties": {}, "required": [] }
    }
  ],
  "metadata": {
    "user_id": "..."
  }
}
```

Campos opcionales: `system`, `tools`, `metadata`, `max_tokens`. `stream: true` presente en peticiones SSE.

---

### `request/body.parsed.md`

**Presente cuando:** junto a `request/body.json` si el render Markdown por `MarkdownRendererService` (Capa 1: `src/1-domain/services/markdown-renderer.service.ts`) tuvo éxito con contexto opcional `MarkdownRenderContext`. Extrae el **último bloque `text`** del mensaje user (el prompt real del usuario; los bloques inyectados por el harness se descartan). Genera encabezado contextual (subagente, side-request, preflight o main-agent), bloque blockquote con metadata (modelo, step N de M), detecta y renderiza contenido Skill en bloque colapsable `<details>`, incluye contexto de tool_results para continuaciones, adjuntos (imágenes/documentos) y metadata del request.

---

### `request/body.omitted.txt`

**Presente cuando:** el cuerpo supera `MAX_AUDIT_REQUEST_BODY_BYTES` (default 50 MB).

Contenido: texto plano explicando el truncamiento (tamaño del cuerpo, límite configurado).

---

### `response/body.json`

**Respuestas no-SSE con JSON parseable, o SSE reconstruido.** JSON formateado (pretty print) del cuerpo de respuesta.

Para respuestas de la API de Mensajes de Anthropic:

```json
{
  "model": "claude-haiku-4-5-20251001",
  "id": "msg_01ABC...",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "..." }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 342,
    "output_tokens": 13,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 0
    },
    "service_tier": "standard"
  },
  "context_management": {
    "applied_edits": []
  }
}
```

Para `/v1/messages/count_tokens`:
```json
{
  "input_tokens": 8881
}
```

---

### `response/body.parsed.md`

**Presente cuando:** junto a `response/body.json` si el render Markdown por `MarkdownRendererService` tuvo éxito con contexto opcional `MarkdownRenderContext`. Vista legible del mensaje con encabezado contextual (subagente, side-request, preflight o main-agent), bloque blockquote metadata (modelo, step N de M), secciones segmentadas en orden temporal: thinking (con separador `---` entre múltiples bloques), texto, tool_use. Para multi-step: TOC estilo GitHub con anclajes. Cuando el thinking está truncado, se referencia `thought/content_path`.

---

### `response/body.omitted.txt`

**Solo respuestas no-SSE.** Presente cuando:
- El cuerpo supera `MAX_RESPONSE_BUFFER_BYTES` (la respuesta al cliente va completa, pero el proxy no retuvo suficiente para auditoría).
- El prefijo guardado se cortó por `MAX_AUDIT_RESPONSE_BODY_BYTES`.
- Hubo un error de stream a mitad del cuerpo (el prefijo del mensaje empieza con `Stream error:`).

---

### `response/headers.json`

**Solo respuestas SSE.** Objeto plano con cabeceras de respuesta del upstream.

```json
{
  "content-type": "text/event-stream; charset=utf-8",
  "transfer-encoding": "chunked",
  "cache-control": "no-cache",
  "request-id": "req_011CZsWn...",
  "anthropic-ratelimit-unified-status": "allowed",
  "anthropic-ratelimit-unified-5h-utilization": "0.02",
  "anthropic-ratelimit-unified-7d-utilization": "0.25",
  "anthropic-ratelimit-unified-reset": "1775707200",
  "anthropic-ratelimit-unified-overage-status": "rejected",
  "anthropic-organization-id": "186c308b-...",
  "server": "cloudflare",
  "cf-ray": "9e9689e7...",
  "date": "Thu, 09 Apr 2026 03:48:53 GMT",
  "set-cookie": ["_cfuvid=...; HttpOnly"]
}
```

**Nota:** Las cabeceras no-SSE no generan este archivo; sus cabeceras aparecen solo en los logs de consola del servidor Fastify.

---

### `response/sse.jsonl`

**Solo respuestas SSE.** Una línea JSON por evento SSE del stream.

Esquema por línea:
```json
{"i": 1, "ts": "2026-04-09T03:48:54.356Z", "line": "event: message_start"}
{"i": 2, "ts": "2026-04-09T03:48:54.357Z", "line": "data: {\"type\":\"message_start\",...}"}
{"i": 3, "ts": "2026-04-09T03:48:54.358Z", "line": ""}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `i` | integer | Índice 1-based de la línea dentro del stream |
| `ts` | string (ISO 8601) | Timestamp de recepción de esa línea SSE |
| `line` | string | Línea SSE cruda (`event: ...`, `data: ...`, o línea vacía como separador) |

El total de líneas coincide con `meta.json` → `sseLineCount`. Tipado por la interface `SseLine` en `src/1-domain/types/audit.types.ts`.

Los eventos SSE de la API de Anthropic siguen este patrón típico:
- `event: message_start` / `data: {"type":"message_start","message":{...}}`
- `event: content_block_start` / `data: {...}`
- `event: content_block_delta` / `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}`
- `event: content_block_stop` / `data: {...}`
- `event: message_delta` / `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{...}}`
- `event: message_stop` / `data: {"type":"message_stop"}`

---

### `response/sse.txt`

**Siempre en steps SSE.** Raw dump binario de los chunks del stream SSE hasta `MAX_AUDIT_SSE_RAW_BYTES`, destinado a **depuración de paridad de protocolo** (inspeccionar bytes exactos emitidos por upstream).

**Importante:** `sse.txt` **NO** es la fuente de la reconstrucción del mensaje final. La reconstrucción lee `sse.jsonl` (orden garantizado, escritura síncrona). `sse.txt` puede estar truncado o ausente sin afectar a `response/body.json` top-level. Detalle en `docs/how-sse-reconstruction-works.md`.

Excepción de semántica: `MAX_AUDIT_SSE_RAW_BYTES=0` significa **ilimitado** (no cero bytes). Esta es la única variable con esa semántica especial; la función `parseBytesLimit` en `src/4-api/config/env.config.ts` resuelve `0 → Infinity`.

---

### `response/sse.txt.omitted.txt`

**Solo si el stream SSE alcanza `MAX_AUDIT_SSE_RAW_BYTES`.** Explica el truncamiento del volcado crudo.

---

## Escenarios de error en `meta.json`

### 1. Fallo upstream sin respuesta HTTP (con turno registrado)

El proxy no pudo conectar al upstream durante un turno. Gestionado por `AuditUpstreamErrorHandler` (Capa 3), que cierra el turno vía `closeInteraction(interactionDir, sessionId)` con `outcome: "upstream-error"`:

```json
{
  "interactionType": "agentic",
  "outcome": "upstream-error",
  "stepCount": 1,
  "startedAt": "2026-04-17T22:21:51.736Z",
  "endedAt": "2026-04-17T22:21:51.800Z",
  "durationMs": 64,
  "statusCode": null,
  "sse": false,
  "steps": [
    { "stepIndex": 1, "statusCode": null }
  ]
}
```

No se generan archivos de respuesta en el step afectado (`steps/001/response/` vacío o ausente).

### 2. Fallo upstream sin turno registrado

Si por cualquier razón llega un error upstream sin turno registrado en el `interactionRegistry` (p. ej. el proxy reinició a mitad de un turno), `AuditUpstreamErrorHandler` escribe igualmente un `InteractionMetadata` sintético con `interactionType: "agentic"`, `outcome: "upstream-error"`, `stepCount: 0`, `steps: []` y los campos `errorMessage`/`errorCode` del error capturado.

### 3. Error de stream tras cabeceras HTTP

El upstream respondió pero el stream falló a mitad. Gestionado por `AuditStandardResponseHandler` (Capa 3). El turno se cierra vía `closeInteraction(interactionDir, sessionId)` con `outcome: "truncated"`. Pueden existir archivos de respuesta parciales en el step; `steps/NNN/response/body.omitted.txt` empezará con `Stream error:`.

### 4. Completado normal

```json
{
  "outcome": "completed",
  "steps": [{ "stepIndex": 1, "stopReason": "end_turn" }]
}
```

---

## Variables de entorno relevantes para la auditoría

Configuración completa del Smart Code Proxy. Tipada por la interface `ProxyEnvironmentConfig` en `src/1-domain/types/config.types.ts`; resuelta en `src/4-api/config/env.config.ts`.

### Core y Servidor

| Variable | Default | Efecto |
|----------|---------|--------|
| `PORT` | `8787` | Puerto de escucha del proxy Fastify |
| `UPSTREAM_ORIGIN` | `https://api.anthropic.com` | URL base del upstream al que se reenvían las peticiones |
| `UPSTREAM_ACCEPT_ENCODING` | `identity` | Control de compresión hacia el upstream: `identity` (sin gzip, auditoría legible), `pass` (reenvía la cabecera original del cliente), `remove` (elimina accept-encoding) |
| `MAX_REQUEST_BODY` | `50mb` | Tamaño máximo del cuerpo de petición que Fastify acepta en memoria |

### Auditoría en disco

La auditoría es **incondicional**: el proxy siempre escribe en `./sessions` (relativo al CWD del proceso). Para SSE: `response/sse.jsonl` es la fuente de verdad de la reconstrucción (escritura síncrona, orden determinista); `response/sse.txt` es un raw dump de depuración acotado por `MAX_AUDIT_SSE_RAW_BYTES` que **no** afecta a la reconstrucción. Ver detalle en `docs/how-sse-reconstruction-works.md` del proyecto.

| Variable | Default | Efecto en archivos de sesión |
|----------|---------|------------------------------|
| `MAX_AUDIT_REQUEST_BODY_BYTES` | 52428800 (50 MB) | Máximo body de petición guardado; si supera → `request/body.omitted.txt` |
| `MAX_AUDIT_RESPONSE_BODY_BYTES` | 52428800 (50 MB) | Máximo body de respuesta no-SSE guardado |
| `MAX_RESPONSE_BUFFER_BYTES` | 104857600 (100 MB) | Buffer en memoria del proxy para no-SSE; si supera → `response/body.omitted.txt` con nota de truncamiento por buffer |
| `MAX_AUDIT_SSE_RAW_BYTES` | 52428800 (50 MB) | Tope para `response/sse.txt` (raw dump debug); `0` = ilimitado (semántica especial: `parseBytesLimit` resuelve `0 → Infinity`). **No afecta** a la reconstrucción, que lee `sse.jsonl`. |

### Correlación de sesión

| Variable | Default | Efecto |
|----------|---------|--------|
| `AUDIT_SESSION_OVERRIDE_HEADER` | `x-cc-audit-session` | Cabecera primaria (override): gana sobre la secundaria si está presente en la petición |
| `AUDIT_SESSION_FALLBACK_HEADER` | `x-claude-code-session-id` | Cabecera secundaria (fallback): la que Claude Code envía por defecto |
| `STRIP_AUDIT_SESSION_HEADER` | `1` | `0` reenvía al upstream la cabecera que aportó el sessionId |
| `AUDIT_SESSION_HASH_SUFFIX` | `0` | `1` añade sufijo `-<hash8>` (SHA-256, 8 chars) al nombre de carpeta de sesión para evitar colisiones |

### Compatibilidad y Logs

| Variable | Default | Efecto |
|----------|---------|--------|
| `CONSOLE_REDACT` | `1` | `0` desactiva la sanitización de datos sensibles (API keys, tokens, cookies) en los logs de consola; no afecta a los archivos de auditoría en disco |
| `LOG_SSE` | `0` | `1` imprime cada línea de datos SSE del upstream directamente a la consola |
| `MAX_BODY_LOG_BYTES` | `2048` | Límite de bytes para truncar la visualización de cuerpos de petición/respuesta en los logs de Fastify |

### Thinking Content (opt-in)

| Variable | Default | Efecto |
|----------|---------|--------|
| `PROXY_UNREDACT_THINKING` | `false` | `true` remueve el flag `redact-thinking-2026-02-12` del header `anthropic-beta` enviado a la API de Anthropic, permitiendo capturar el contenido thinking en texto plano en los archivos de auditoría (`body.parsed.md`). Por defecto el thinking llega vacío (solo signature). **Nota:** Modificar headers de la API puede tener implicaciones de TOS. |

### Filtrado de Tools

| Variable | Default | Efecto |
|----------|---------|--------|
| `FILTERED_TOOLS` | `ScheduleWakeup,NotebookEdit,ExitWorktree,EnterWorktree,CronList,CronDelete,CronCreate` | Lista de tool names a excluir del request antes de enviar a la API (coma-separado). Reduce consumo de tokens innecesarios y elimina ruido en los archivos de auditoría. Las tools filtradas se eliminan del array `tools` en el body del request. Si todas las tools son filtradas, la propiedad `tools` se elimina completamente del body. **Para desactivar completamente el filtrado**, establecer como string vacío (`FILTERED_TOOLS=""`). |

**Fuente de verdad:** `src/1-domain/types/config.types.ts`, `src/4-api/config/env.config.ts` y `README.md` del proyecto Smart Code Proxy.

---

## Directorio `_unknown` y Filtrado de Health Checks

### ¿Qué es `_unknown`?

El directorio `sessions/_unknown/` es el **fallback final** del `SessionResolverService` (Capa 1) cuando ninguna de estas condiciones aporta un session ID válido:

1. `AUDIT_SESSION_OVERRIDE_HEADER` (`x-cc-audit-session`) → ausente o vacía
2. `AUDIT_SESSION_FALLBACK_HEADER` (`x-claude-code-session-id`) → ausente o vacía

### Contenido típico de `_unknown`

Antes del filtrado de health checks, `_unknown/` contenía interacciones de health checks de Bun con estas características:

- `meta.json` con `interactionType: "agentic"`, `outcome: "upstream-error"`, `statusCode: 404`
- `request/headers.json` con `user-agent: "Bun/1.3.13"` (sin `claude-cli`)
- Sin `request/body.bin` (body vacío)
- Sin `authorization` header
- Sin headers de sesión

### Filtrado automático de health checks

Desde la versión con filtrado implementado, el `AuditInteractionHandler` detecta y **ignora silenciosamente** estos requests antes de crear cualquier directorio. Un request se considera health check (no se audita) si cumple **TODAS** estas condiciones:

| Criterio | Valor que activa el filtrado |
|----------|------------------------------|
| `sessionId` resuelto | `_unknown` |
| `rawBody.length` | `0` (body vacío) |
| `user-agent` | Contiene `"Bun"` pero **NO** `"claude-cli"` |
| `authorization` | Ausente |
| `x-claude-code-session-id` | Ausente |
| `x-cc-audit-session` | Ausente |

**Resultado:** El handler retorna `null` y **no se crea ningún archivo**.

### ¿Cuándo aparece legítimamente `_unknown`?

Si llega un request con el header correspondiente, el directorio usará ese nombre en lugar de `_unknown`.

`_unknown` aparecerá (con interacciones válidas) si:
- Un cliente real de la API Anthropic (no Claude Code) envía requests sin los headers de sesión de Claude Code
- Estos requests tienen body no vacío o authorization header (por lo que **no** son filtrados)
- El cliente resuelve a `_unknown` porque no tiene sesión configurada

**Ejemplo legítimo en `_unknown`:**

```json
// meta.json
{
  "interactionType": "agentic",
  "outcome": "completed",
  "stepCount": 1,
  "statusCode": 200,
  ...
}
```

Este caso indica que un cliente real (no Bun health check) usó el proxy sin configurar sesión, pero su request fue válido y completado.

### Headers de sesión en `request/headers.json`

Los headers escritos en `request/headers.json` incluyen las cabeceras de sesión (`x-claude-code-session-id`, `x-cc-audit-session`) porque se capturan **antes** de que el `STRIP_AUDIT_SESSION_HEADER` las elimine para el upstream.

---


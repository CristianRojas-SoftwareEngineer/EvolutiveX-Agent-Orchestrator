---
name: smart-code-proxy
description: >-
  Referencia canónica del proyecto Smart Code Proxy: un proxy de observabilidad
  (Fastify + TypeScript) que intercepta el tráfico entre Claude Code y la API de
  Anthropic vía ANTHROPIC_BASE_URL y lo audita en disco bajo sessions/. Cubre la
  arquitectura PKA de 6 capas, el clasificador de turnos (agentic,
  client-preflight, side-request, continuation),
  la reconstrucción SSE con el
  SDK de Anthropic, la jerarquía de archivos de auditoría (meta.json /
  InteractionMetadata, state.json, input/, output/, steps/NN/, thought/,
  sub-agent-NN/, main-agent/, side-interactions/, interaction-sequence.json,
  session-metrics.json), subagentes anidados
  (herramienta Agent / Task, parentContext, pendingAgentToolUses),
  extended thinking (thought/content.md)
  y la matriz canónica de variables de entorno. Usar al explicar, explorar,
  diseñar, analizar, navegar, depurar o modificar cualquier aspecto del proyecto
  Smart Code Proxy — arquitectura, handlers, servicios, tipos de interacción,
  archivos de sesión, variables de entorno o comportamiento del proxy — tanto
  si la tarea implica leer artefactos en sessions/ como si solo implica discutir
  el proyecto a nivel conceptual.
---

# Smart Code Proxy — Referencia canónica del proyecto

Smart Code Proxy es un proxy de observabilidad (Fastify + TypeScript) diseñado específicamente para interceptar el tráfico entre **Claude Code** (el CLI oficial de Anthropic) y la API de Anthropic, redirigido vía la variable `ANTHROPIC_BASE_URL`. Cada interacción se vuelca en disco bajo `./sessions/`. La arquitectura es **PKA — Progressive Kernel Architecture** (5 capas implementadas de 6 en el modelo PKA; Capa 6 GUIs no aplica a este proyecto).

Esta skill es la referencia canónica del proyecto: cubre la arquitectura, el clasificador de requests (`agentic`, `client-preflight`, `side-request`, `continuation`), la reconstrucción SSE, subagentes anidados (herramienta `Agent`), la jerarquía de archivos de auditoría y la matriz de variables de entorno. Usar tanto para explicar el proyecto a nivel conceptual como para navegar artefactos concretos en `sessions/`.

## Principio rector del diseño

Smart Code Proxy busca **observabilidad inteligente para análisis humano**, no granularidad técnica por sí misma. El objetivo es presentar los flujos lógicos que el usuario orquesta (secuenciales y/o paralelos con subagentes) de forma natural y trazable, siguiendo el concepto de "Screaming Architecture".

**No todo lo que se puede registrar debe registrarse.** Las ejecuciones internas de built-in tools (WebFetch/WebSearch) por agentes/subagentes sí son relevantes: WebSearch se registra como step adicional del agente padre (no como sub-agente), y WebFetch se registra como sub-interacción anidada — ambas permiten entender qué información consumió cada agente. Las continuations de `Agent`/subagentes se coalescen en el step padre para preservar la unidad lógica delegación → consolidación.

## Relación con otras skills

| Skill | Uso |
|-------|-----|
| **smart-code-proxy** (esta) | Referencia canónica del proyecto Smart Code Proxy: arquitectura PKA, handlers, clasificador de turnos, reconstrucción SSE, estructura de `sessions/` y matriz de variables de entorno |
| **anthropic-api-cost-estimation** | API Anthropic Messages, `metadata.json` por proveedor, ecuación por categorías de caché, agregación sobre sesiones auditadas |
| **openrouter-api-cost-estimation** | OpenRouter Chat Completions, `ResponseUsage`, `usage.cost` (véase `docs/how-to-calculate-openrouter-api-costs.md` en el repo del proxy) |

## Enrutamiento: pregunta o tarea → destino

En esta skill, **destino** significa: **glob o ruta** bajo `sessions/`, **subsección** de este `SKILL.md`, o el archivo [`reference.md`](reference.md).

| Pregunta o tarea | Destino |
|------------------|---------|
| Explicar el proyecto Smart Code Proxy (qué es, qué hace, para qué cliente) | Encabezado de este `SKILL.md` + `README.md` del proyecto (§ introducción, § Diseño del Sistema PKA) |
| Arquitectura PKA, capas, servicios, handlers | `README.md` del proyecto (§ Diseño del Sistema PKA, § Capas de Responsabilidad) |
| Variable `ANTHROPIC_BASE_URL` y redirección Claude Code → proxy | `README.md` del proyecto (§ introducción) y `docs/how-to-start.md` |
| Reconstrucción SSE (por qué se reusa el SDK, rol de `REPLAY_MODEL`) | `docs/how-sse-reconstruction-works.md` del proyecto |
| Reconstrucción por fase en steps coalesced (delegation/continuation) | `docs/how-sse-reconstruction-works.md` del proyecto (§ Reconstrucción por Fase) |
| Listar todas las interacciones de una sesión | **Cómo navegar sesiones**, paso 1 (Glob) |
| Saber qué archivos existen para una interacción | **Cómo navegar sesiones**, paso 2 — leer `meta.json` primero |
| Qué tipo de interacción es (agentic vs preflight vs side-request) | **Cómo navegar sesiones**, paso 2 → `meta.json` → `interactionType` |
| Cuántos steps tiene un turno | **Cómo navegar sesiones**, paso 2 → `meta.json` → `stepCount` y `steps[]` |
| Tokens totales del turno | **Cómo navegar sesiones**, paso 2 → `meta.json` → `totals` |
| Herramientas usadas en el turno | **Cómo navegar sesiones**, paso 2 → `meta.json` → `steps[].toolCalls` |
| Respuesta SSE vs no-SSE, cuerpos reconstruidos | **Cómo navegar sesiones**, paso 2 (bullets `sse`, `output/body.json` reconstruido) |
| Orden de interacciones (`NN`) y `interaction-sequence.json` | **Cómo navegar sesiones**, paso 3 |
| Peticiones sin sesión identificada / `_unknown` | **Cómo navegar sesiones**, paso 4 |
| Tipos de clasificación de request (5 tipos) | **Clasificación de requests** (§ en este archivo) |
| Identificar side-requests (`"tools": []`) | **Side-Requests** (§ en este archivo); `interactionType: "side-request"` en InteractionMetadata |
| Campos completos de `meta.json` (InteractionMetadata), semántica de truncamiento | **Referencia de campos** → `reference.md` |
| Variables de entorno completas del proxy | **Referencia de campos** → `reference.md` (§ Variables de entorno) |
| Correlación de sesión, cabeceras, hash suffix | **Cómo navegar sesiones**, paso 4 y `reference.md` (§ Variables de entorno) |
| Correlar interacciones proxy con logs de Claude Code | **Correlación por message ID** — usa `steps[].anthropicMessageId` en `meta.json` vs `"id"` en log de Claude Code |
| Extended thinking, `thought/content.md` | **Jerarquía de directorios** — directorio `thought/` bajo `steps/NN/` |
| `MarkdownRenderContext`, encabezados contextuales en `body.parsed.md` | `reference.md` (§ `body.parsed.md`, § Tipos de auditoría); `src/1-domain/types/audit.types.ts` |
| Subagentes (Agent tool_use, Task), `parentContext`, anidamiento | **Subagentes** (§ en este archivo) y `reference.md` (§ `meta.json` — parentContext) |
| Detectar subagentes en SSE, `pendingAgentToolUses` | **Subagentes** (§ en este archivo) |
| Profundidad de subagentes, sub-agent-NN/ en disco | **Subagentes**, **Jerarquía de directorios** (main-agent/interactions/NN/steps/NN/sub-agent-NN/) |

## Jerarquía de directorios

La sesión se divide en dos árboles con contadores independientes:

```
sessions/
  <session-id>/                           # e.g. "claude-code-workflow-example", "_unknown"
    session-metrics.json                  # Métricas agregadas por modelo (O(1) para el statusline)
    main-agent/                           # Turnos agénticos (fresh + continuations)
      interactions/
        interaction-sequence.json         # Contador exclusivo de main-agent
        NN/                               # Secuencia 2 dígitos (01, 02, …); interactionType: "agentic"
          meta.json                       # InteractionMetadata: se escribe al cerrar el turno
          state.json                      # Marcador "in-progress" (solo mientras está abierto)
          input/                          # Prompt inicial del usuario (top-level)
            headers.json
            body.bin
            body.json                     # Body formateado (pretty print)
            body.parsed.md                # Vista markdown semántica
            body.omitted.txt              # Solo si supera MAX_AUDIT_REQUEST_BODY_BYTES
          output/                         # En agentic SSE completados (reconstrucción OK)
            body.json                     # Mensaje asistente reensamblado (pretty print)
            body.parsed.md                # Vista markdown semántica
            headers.json                  # Solo si body reconstruido
          steps/
            NN/                           # Step N (01, 02, …); siempre con request/
              request/                    # Petición del step
                headers.json
                body.bin
                body.json                 # Body formateado (pretty print)
                body.parsed.md            # Vista markdown semántica
              response/
                sse.jsonl                 # Solo SSE. FUENTE DE VERDAD para la reconstrucción
                # sse.txt solo para steps no-coalesced (raw dump debug)
                headers.json              # Solo SSE
                body.json                 # Mensaje SSE reconstruido (pretty print)
                body.parsed.md            # Vista markdown semántica del mensaje SSE
              thought/                    # Solo si el step contiene extended thinking
                content.md                # Texto completo del thinking (sin truncar)
              sub-agent-NN/               # Solo si el step emitió tool_use Agent
                meta.json                 # Incluye parentContext
                state.json
                input/
                  headers.json, body.bin, body.json, body.parsed.md
                output/
                  body.json, body.parsed.md, headers.json
                steps/
                  NN/ ...
    side-interactions/                    # Preflights y side-requests
      interaction-sequence.json           # Contador exclusivo de side-interactions
      NN/                                 # Secuencia 2 dígitos (01, 02, …)
        meta.json
        state.json
        input/                            # Solo en side-request (no en client-preflight)
          headers.json, body.bin, body.json, body.parsed.md
        steps/
          NN/
            request/
              headers.json, body.bin, body.json, body.parsed.md
            response/
              sse.jsonl / body.json / headers.json
```

**Side-Request** (`interactionType: "side-request"`, `"tools": []`, p. ej. `count_tokens`): Se aloja en `side-interactions/NN/` con `input/` top-level y `steps/NN/request/` + `steps/NN/response/`.

**Client Preflight** (`interactionType: "client-preflight"`, quota check + cache warm-up): Se aloja en `side-interactions/NN/` sin `input/` ni `output/` raíz; solo `steps/` con sus archivos individuales.

**Steps coalesced de Agent:** Para steps que invocan subagentes, el `response/sse.jsonl` es **multi-fase** — cada línea incluye `phase: "delegation"` (stream inicial que emitió tool_use Agent) o `phase: "continuation"` (stream terminal con tool_result). El `response/body.json` tiene estructura consolidada con `delegation.message`, `continuation.request.body`, `continuation.request.headers`, `continuation.response.message`, `toolUseIds` y `subagents` (resumen estructurado de subagentes ejecutados en Fase 2). El `response/body.parsed.md` muestra tres fases: **Fase 1: Delegación inicial**, **Fase 2: Ejecución de subagentes** (con tabla resumen de cada subagente) y **Fase 3: Respuesta final coalesced**. Los archivos `continuation.*` temporales ya no se crean; la request de continuation se almacena en memoria y se escribe directamente en `body.json`. Para steps coalesced, `sse.txt` se elimina al consolidar (solo `sse.jsonl` es canónico).

## Clasificación de requests (RequestClassification)

El `RequestClassifierService` (`src/1-domain/services/request-classifier.service.ts`) clasifica cada request por heurística sobre el body (sin parsear JSON):

| Tipo | Condición | `interactionType` en disco |
|------|----------|----------------------------|
| `preflight-warmup` | Body vacío, o sin `"tools"` en el body | `client-preflight` |
| `preflight-quota` | Body con `"quota"` y `"max_tokens":1` | `client-preflight` |
| `continuation` | Body con `"tool_result"` | `agentic` |
| `fresh` | Body con `"tools"` (array no vacío) | `agentic` |
| `side-request` | Body con `"tools": []` (array vacío) | `side-request` |

Prioridad: `continuation` > `preflight-quota` > `preflight-warmup` (sin tools) > `side-request` (`tools: []`) > `fresh`.

## Side-Requests

Las requests con `"tools": []` (array vacío) se clasifican como `side-request`:
- Se registran como interacciones independientes con su propio directorio `NNNNNN_<uuid>/`
- **NO reemplazan** el turno agéntico activo — usan `registerInteraction` (solo en interactionRegistry)
- En disco: `interactionType: "side-request"` en `meta.json`
- Estructura de archivos idéntica a un agentic: `request/` top-level + `steps/NNN/request,response/`
- Ejemplo típico: peticiones a `/v1/messages/count_tokens` que Claude Code envía en paralelo al turno principal

## Diferencias de diseño vs inconsistencias

Al comparar registros de Smart Code Proxy con el harness nativo de Claude Code, es fundamental distinguir:

### Diferencias de diseño intencionales (no son bugs)

Estas diferencias reflejan decisiones arquitectónicas deliberadas del proxy para facilitar la observabilidad humana:

| Aspecto | Harness Nativo | Smart Code Proxy | Justificación de diseño |
|---------|---------------|------------------|------------------------|
| **Built-in tools de agentes** | No visibles como entidades separadas | WebSearch: steps del padre; WebFetch: sub-interacciones anidadas | Permite trazabilidad de qué consultas/búsquedas realizó cada agente |
| **Preflights** | Eventos agrupados en log JSONL | Interacciones `client-preflight` separadas | Claridad en la secuencia de inicialización |
| **Formato de registro** | JSONL lineal | Estructura de directorios jerárquica | Navegación humana más intuitiva (árbol vs lista) |
| **Metadata por step** | Implícita en el flujo | Campos explícitos (`inputTokens`, `outputTokens`, `stopReason`) | Análisis de costes y comportamiento por step |
| **Correlación tool_use/subagente** | Implícita en el log | `parentContext` con `triggeringToolUseId` | Trazabilidad explícita de relaciones padre-hijo |

### Inconsistencias/bugs (requieren investigación/corrección)

Estas situaciones indican que el proxy no está capturando o interpretando correctamente el comportamiento del harness:

| Indicador | Interpretación | Acción recomendada |
|-----------|--------------|-------------------|
| Subagente en harness sin correspondiente en proxy | El proxy perdió el subagente (no detectó el `fresh` o falló el anidamiento) | Verificar `findInteractionWithPendingAgents` y `handleSubagent` |
| Tool_use IDs descorrelacionados | El `toolUseId` del harness no aparece en `parentContext` del proxy | Revisar lógica de correlación en `handleContinuation` |
| `state.json` presente sin `meta.json` | Interacción huérfana (crash del proxy a mitad de turno) | Investigar logs de error y estado del proceso |
| Subagente nivel 2+ sin `parentContext` correcto | Fallo en propagación de contexto padre | Verificar `parentContext` construction |

**Regla de oro:** Si el proxy registra **menos** subagentes que el harness, es una inconsistencia. Si registra **más profundidad** (built-in tools como sub-interacciones), es una diferencia de diseño intencional.

## Subagentes (herramienta Agent)

Cuando el turno principal emite un `tool_use` con `name: "Agent"` (Task de Claude Code), la siguiente petición `fresh` de la misma sesión se anida como **subagente** directamente bajo el step padre:

```
main-agent/interactions/NN/steps/NN/sub-agent-NN/
```

con la misma estructura interna (`meta.json`, `state.json`, `input/`, `output/`, `steps/`).

### Flujo de detección

1. **SSE handler** detecta `content_block_start` con `tool_use` named `"Agent"` y acumula `input_json_delta` para extraer `subagent_type`.
2. Registra `PendingAgentToolUse` en el session store del turn padre.
3. Al llegar el siguiente `fresh` de la misma sesión, `AuditInteractionHandler.handleSubagent` lo intercepta y lo anida bajo el step del padre.
4. En la `continuation` del padre, los `tool_result` se correlacionan con los pendings para consumirlos. Si corresponden a `Agent`, no se crea un nuevo step lógico: la request de continuation se almacena en memoria (no en archivos temporales), el SSE terminal se escribe en el mismo `sse.jsonl` con `phase: "continuation"`, y `steps/NN/response/body.json` pasa a ser un objeto `coalesced-agent-step-response` con estructura consolidada (`delegation.message`, `continuation.request.body`, `continuation.request.headers`, `continuation.response.message`, `toolUseIds`).

### WebSearch como step del agente padre

Cuando un agente o subagente emite un `tool_use` con `name: "web_search"`, el harness ejecuta una llamada interna a la API que el proxy captura como `fresh`. Esta llamada **no crea un sub-agente** — se registra como un step adicional dentro de la misma interacción que emitió el `tool_use`:

```
main-agent/interactions/NN/steps/
  01/ → Claude decide usar WebSearch (stop_reason: tool_use)
  02/ → Implementación WebSearch: request/response del harness
  03/ → Claude procesa resultado y responde (stop_reason: end_turn)
```

**Flujo de detección:**
1. **SSE handler** detecta `content_block_start` con `tool_use` named `"WebSearch"` y registra `PendingWebSearchToolUse` en el session store del padre.
2. Al llegar la siguiente `fresh` de la misma sesión, `AuditInteractionHandler` verifica `findInteractionWithPendingWebSearch` antes que `findInteractionWithPendingAgents`.
3. Si hay un pending web_search, `handleWebSearchStep` escribe el request del harness como step N del padre (no crea interacción independiente).

### parentContext en meta.json

El `meta.json` del subagente incluye:
```json
{
  "parentContext": {
    "parentInteractionDir": "<ruta absoluta del turno padre>",
    "parentStepIndex": 2,
    "triggeringToolUseId": "toolu_01ABC...",
    "subagentType": "general-purpose"
  }
}
```

- `triggeringToolUseId`: `null` cuando hubo varios `Agent` paralelos en el mismo step y la correlación fue ambigua al crear el subagente.
- `subagentType`: tipo declarado por el cliente (`general-purpose`, `Explore`, `Plan`, etc.). Opcional.
- **Profundidad acotada a 2 niveles**: un subagente no puede ser padre de otros subagentes (`parentContext` presente → no elegible como padre).

## Preflights

Los `client-preflight` exitosos (statusCode 2xx) se cierran inmediatamente al recibir su respuesta con `outcome: "completed"` y `durationMs` acotado a la duración real del request-response.

## Cómo navegar sesiones

1. **Listar turnos agénticos de una sesión:**
   ```
   Glob: sessions/<session-id>/main-agent/interactions/*/meta.json
   ```
   **Listar side-interactions (preflights + side-requests):**
   ```
   Glob: sessions/<session-id>/side-interactions/*/meta.json
   ```

2. **Leer `meta.json` primero** — es de tipo `InteractionMetadata`; determina qué archivos están presentes:
   - `"interactionType": "agentic"` → alojado en `main-agent/interactions/NN/`; existe `input/` top-level; `output/` top-level siempre que la reconstrucción SSE tenga éxito; `steps/` con las llamadas HTTP individuales
   - `"interactionType": "side-request"` → alojado en `side-interactions/NN/`; existe `input/` top-level y `steps/NN/`; si el stream SSE completa correctamente también se produce `output/` top-level (reconstrucción); no desplaza al turno agéntico activo
   - `"interactionType": "client-preflight"` → alojado en `side-interactions/NN/`; NO hay `input/` ni `output/` raíz; solo `steps/` con sus propios archivos. Se cierran inmediatamente con `outcome: "completed"`
   - `state.json` presente + `meta.json` ausente → interacción huérfana (crash del proxy a mitad del turno)
   - `"steps[]"` → cada entry tiene `stepIndex`, `sse`, `statusCode`, `stopReason`, `toolCalls` (si aplica), `anthropicMessageId` (ID de correlación con logs de Claude Code), `hasThinking` (si contiene extended thinking)
    - `"sse": true` en un step → `steps/NN/response/sse.jsonl` es la fuente de verdad (orden determinista); `sse.txt` también está presente pero es solo raw dump de depuración y puede estar truncado por `MAX_AUDIT_SSE_RAW_BYTES` sin afectar a la reconstrucción
      - Cada step SSE genera `steps/NN/response/body.json` y `body.parsed.md` (mensaje reconstruido del step). El `body.parsed.md` incluye encabezados contextuales (subagente, side-request, preflight), bloque blockquote con metadata (modelo, step N de M), y detección automática de contenido Skill en bloques colapsables
      - Para el mensaje final del turno completo: revisar `output/body.json` top-level
      - Si `hasThinking: true` → `steps/NN/thought/content.md` contiene el texto completo del extended thinking; en `body.parsed.md` los bloques de thinking se separan con `---` y cuando el thinking está truncado se referencia `thought/content.md`
   - `"sse": false` en un step → buscar `steps/NN/response/body.json`
   - `"outcome": "upstream-error"` → no hay archivos de respuesta en el step afectado
   - Para respuesta final reconstruida (agentic/side-request SSE completados): revisar si existe `output/body.json` top-level
   - **Correlación con logs de Claude Code**: usa `steps[].anthropicMessageId` para cruzar con `"message.id"` en el log oficial de Claude Code (`.jsonl`)

3. **Interpretar el número de secuencia:** el nombre del directorio (`NN`, 2 dígitos) es el orden de la interacción **dentro de su árbol** (`main-agent` o `side-interactions`). Cada árbol tiene su propio `interaction-sequence.json` (`{"last": N}`).

4. **`_unknown`** es la sesión reservada para peticiones sin cabecera de sesión identificada. La resolución sigue esta prioridad:
   1. `AUDIT_SESSION_OVERRIDE_HEADER` (cabecera primaria)
   2. `AUDIT_SESSION_FALLBACK_HEADER` (cabecera secundaria)
   3. `_unknown` (fallback final)

   Si `AUDIT_SESSION_HASH_SUFFIX=1`, se añade un sufijo `-<hash8>` (SHA-256, 8 chars) al nombre de carpeta para prevenir colisiones.

## Correlación por message ID

Cada step en `meta.json` ahora incluye `anthropicMessageId` — el `message.id` de la API de Anthropic — permitiendo correlacionar directamente con los logs oficiales de Claude Code.

### Estructura en meta.json

```json
{
  "interactionType": "agentic",
  "outcome": "completed",
  "stepCount": 2,
  "statusCode": 200,
  "sse": true,
  "steps": [
    {
      "stepIndex": 1,
      "anthropicMessageId": "msg_01SweCL7ReWWANWSRsPc8mfn",
      "sse": true,
      "statusCode": 200,
      "stopReason": "tool_use"
    },
    {
      "stepIndex": 2,
      "anthropicMessageId": "msg_01FFH3XNMU5J7A59Z1KqQhXi",
      "sse": true,
      "statusCode": 200,
      "stopReason": "end_turn"
    }
  ],
  "totals": null
}
```

### Flujo de correlación

| Log Claude Code (`.jsonl`) | Auditoría Proxy (`meta.json`) |
|---------------------------|------------------------------|
| `{ "type": "assistant", "message": { "id": "msg_01Swe..." } }` | `steps[].anthropicMessageId: "msg_01Swe..."` |

**Proceso de correlación:**
1. Extrae `"id"` del evento `assistant` en el log de Claude Code
2. Busca ese valor en `sessions/<session>/interactions/*/meta.json` bajo `steps[].anthropicMessageId`
3. El directorio contenedor es la interacción correspondiente

**Nota:** El `requestId` interno del SDK de Claude Code (`req_XXX`) no viaja por la red; la correlación se establece únicamente mediante el `message.id` de Anthropic.

## Referencia de campos

Para detalle completo de todos los campos de `meta.json`, estructura JSON de cada archivo, semántica de truncamiento y la matriz completa de variables de entorno, cargar:

```
${CLAUDE_SKILL_DIR}/reference.md
```

## Aviso de seguridad

`request/headers.json` contiene el **API key completo** en el campo `authorization` (las cabeceras se guardan tal como llegan; la redacción vía `RedactService` aplica solo a los logs de consola cuando `CONSOLE_REDACT=1`). Los cuerpos en `request/body.*`, `response/body.*` y las vistas `*.parsed.md` pueden contener el mismo contenido sensible que el JSON (conversaciones, datos de herramientas). No incluir tokens, claves ni texto privado en respuestas al usuario salvo que lo pida explícitamente.

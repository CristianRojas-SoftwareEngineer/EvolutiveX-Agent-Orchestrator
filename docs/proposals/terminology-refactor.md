# Modelo conceptual del registro de auditoría — Smart Code Proxy

Este documento describe el modelo de ejecución agéntico que subyace al sistema de auditoría de Smart Code Proxy. Parte de un modelo conceptual abstracto y lo ancla al diseño real: tipos en TypeScript, estructura de directorios en `sessions/`, y comportamiento observable del harness de Claude Code.

El objetivo es proveer una referencia terminológica compartida que permita razonar sobre el sistema sin depender de los detalles de implementación, pero sin perder precisión cuando éstos importan.

---

## Modelo conceptual (diagrama)

El modelo representa un **sistema agéntico jerárquico y recursivo** con profundidad acotada a dos niveles:

```text
Sesión
└─ Interacción Principal (agentic)
   ├─ Input (Prompt Inicial)                    → input/ top-level
   ├─ Pipeline de Steps
   │  ├─ Step 1 (Compute)                       → steps/01/
   │  ├─ Step 2 (Delegate → Subagente)          → steps/02/
   │  │  │                                         sub-agent-01/
   │  │  └─ Subagente (agentic anidado)
   │  │     ├─ Input (Prompt del Subagente)     → input/ top-level del subagente
   │  │     ├─ Pipeline de Steps
   │  │     │  ├─ Step 1 (Compute)              → steps/01/
   │  │     │  ├─ Step 2 (Compute)              → steps/02/
   │  │     │  └─ Step N (Compute)              → steps/NN/
   │  │     └─ Output (Response)                → output/ top-level del subagente
   │  └─ Step 3 (Compute — continuation)        → steps/03/
   └─ Output (Response reconstruida)            → output/ top-level
```

Este diagrama modela únicamente la interacción principal de tipo `agentic`. Los otros tipos (`client-preflight` y `side-request`) se describen en sus propias secciones.

---

## Los tres tipos de interacción

El clasificador de interacciones (`RequestClassifierService`) determina el tipo de cada request HTTP entrante. Este tipo se persiste en `meta.json` como `interactionType` y define qué archivos existen en el directorio de la interacción.

### 1. `agentic` — La interacción real del usuario

Es la interacción principal: el proxy recibió un prompt del usuario, lo forwardó a Anthropic, y audita la respuesta completa incluyendo todos los pasos de tool_use/continuation.

**Condiciones de clasificación:**
- `fresh`: body con `"tools"` (array no vacío) → nueva interacción raíz o subagente
- `continuation`: body con `"tool_result"` → step adicional de una interacción existente

**Estructura en disco:**
```
main-agent/interactions/NN/
  meta.json                     # InteractionMetadata — escrito al cerrar la interacción
  state.json                    # Marcador in-progress — eliminado al cerrar
  input/                        # Prompt inicial (solo en fresh/raíz; no en continuation)
    headers.json, body.bin, body.json, body.parsed.md
  output/                       # Mensaje final reconstruido del SSE (si completó sin error)
    body.json, body.parsed.md, headers.json
  steps/
    01/                         # Step 1: primera llamada HTTP (always present)
      request/
        headers.json, body.bin, body.json, body.parsed.md
      response/
        sse.jsonl               # FUENTE DE VERDAD para reconstrucción (orden determinista)
        sse.txt                 # Raw dump para depuración (puede estar truncado)
        body.json, body.parsed.md, headers.json
      thought/                  # Solo si el step contiene extended thinking
        content.md              # Texto completo del thinking (sin truncar)
      sub-agent-01/             # Solo si este step emitió tool_use Agent
        meta.json               # InteractionMetadata con parentContext
        state.json
        input/, output/, steps/
    02/                         # Step 2: continuation enviada por el harness
      request/, response/
```

---

### 2. `client-preflight` — Inicialización del harness

El harness de Claude Code ejecuta un par de peticiones de inicialización antes de la primera interacción real: un quota-check y un cache warm-up. Ambas se registran como un único `client-preflight` con dos steps.

**Condiciones de clasificación:**
- `preflight-quota`: body con `"quota"` y `max_tokens:1`
- `preflight-warmup`: body vacío o sin `"tools"`

**Diferencia clave respecto a `agentic`:** no existe `input/` ni `output/` en el directorio raíz. Solo existen los `steps/` con sus propios archivos. La interacción se cierra inmediatamente al recibir la respuesta con `outcome: "completed"`.

**Estructura en disco:**
```
side-interactions/NN/
  meta.json                     # InteractionMetadata — sin input/ ni output/ raíz
  state.json
  steps/
    01/                         # label: "quota-check" (non-SSE)
      request/, response/body.json, response/headers.json
    02/                         # label: "cache-warmup" (SSE)
      request/, response/sse.jsonl, response/sse.txt, response/body.json
```

---

### 3. `side-request` — Petición lateral del harness

Peticiones con `"tools": []` (array vacío) que el harness envía en paralelo a la interacción agéntica activa. El caso más frecuente es `/v1/messages/count_tokens`. **No reemplazan ni interrumpen la interacción activa.**

**Estructura en disco** (cuando se persiste):
```
side-interactions/NN/
  meta.json                     # interactionType: "side-request"
  state.json
  input/                        # Igual que agentic
    headers.json, body.bin, body.json, body.parsed.md
  steps/
    01/
      request/, response/
```

---

## Qué significa cada entidad conceptual

### Sesión

**Concepto:** el contenedor de más alto nivel. Identifica a un agente principal y agrupa todas sus interacciones.

**En implementación:** directorio `sessions/<session-id>/` donde `session-id` se resuelve desde cabeceras HTTP con la prioridad `AUDIT_SESSION_OVERRIDE_HEADER` → `AUDIT_SESSION_FALLBACK_HEADER` → `_unknown`.

**Persistencia:** `session-metrics.json` (métricas agregadas por modelo), `main-agent/interaction-sequence.json` (contador del árbol agéntico) y `side-interactions/interaction-sequence.json` (contador del árbol de preflights/side-requests).

**No confundir:** una sesión no es un ciclo de ejecución. Es el contexto persistente que contiene múltiples ciclos (interacciones) a lo largo del tiempo.

---

### Interacción (el "Ciclo" del modelo abstracto)

**Concepto:** una instancia concreta de ejecución. Tiene una entrada, una fase de procesamiento y una salida. Separa la identidad de la sesión de la ejecución particular que está ocurriendo.

**En implementación:**
- Interacciones agénticas: directorio `NN/` bajo `sessions/<session-id>/main-agent/interactions/`
- Preflights y side-requests: directorio `NN/` bajo `sessions/<session-id>/side-interactions/`

El prefijo `NN` (2 dígitos, 1-based) es el número de secuencia dentro del árbol correspondiente, gestionado por su propio `interaction-sequence.json`.

**Tipo en TypeScript:** `ActiveInteraction` (en memoria durante la ejecución) → `InteractionMetadata` en `meta.json` (persistido al cerrar).

**Campos clave de `InteractionMetadata`:**
- `interactionType`: `'agentic'` / `'client-preflight'` / `'side-request'`
- `outcome`: `'completed'` / `'upstream-error'` / `'client-error'` / `'truncated'` / `'orphaned'`
- `stepCount`: cantidad de steps HTTP completados
- `steps[]`: array de `StepMeta` con tokens, `stopReason`, tool calls, y `anthropicMessageId`
- `parentContext`: solo en subagentes (ver sección Subagentes)

---

### Input (Prompt Inicial)

**Concepto:** la entrada inicial del ciclo; la pregunta, tarea u objetivo que inicia el trabajo.

**En implementación:** directorio `input/` en la raíz de la interacción.

**Archivos:**
- `headers.json`: cabeceras HTTP recibidas (contiene el API key completo — no compartir)
- `body.bin`: cuerpo crudo en binario
- `body.json`: cuerpo formateado (pretty print)
- `body.parsed.md`: vista semántica en Markdown (extrae el array `messages[]` legiblemente)

**Ausente en:** `client-preflight` (no tiene `input/` raíz).

---

### Pipeline de Steps

**Concepto:** la secuencia ordenada de ejecución que transforma el Input en Output.

**En implementación:** directorio `steps/` con subdirectorios numerados `01/`, `02/`, `NN/` (2 dígitos, 1-based).

**Relación con HTTP:** cada step corresponde a **una llamada HTTP** entre el proxy y la API de Anthropic. No son etapas de procesamiento abstractas: son round-trips reales de red. El número de steps depende de cuántos ciclos tool_use/continuation ocurren:

| Escenario | Steps |
|-----------|-------|
| Respuesta directa sin herramientas | 1 step |
| Respuesta + 1 tool_use + 1 continuation | 2 steps |
| Respuesta + N tool_uses encadenados | N+1 steps |

---

### Step Compute

**Concepto:** un paso donde el agente procesa localmente, sin delegar a subagentes.

**En implementación:** un step cuya respuesta SSE no contiene ningún `tool_use` con `name: "Agent"`. Puede contener tool_uses de built-in tools (`web_search_*`, etc.) o ninguno.

**`stopReason` típico:** `"end_turn"` (paso final) o `"tool_use"` (con herramientas no-Agent).

---

### Step Delegate → Subagente

**Concepto:** el punto de transferencia de responsabilidad donde el agente principal delega trabajo a un subagente especializado.

**En implementación:** un step cuya respuesta SSE contiene uno o más `content_block_start` con `type: "tool_use"` y `name: "Agent"`. El SSE handler detecta estos bloques en tiempo real y registra un `PendingAgentToolUse` por cada uno en el `SessionStore`.

**Mecanismo de detección (SSE → disco):**
1. El SSE handler detecta `content_block_start` con `name: "Agent"`.
2. Acumula el JSON del bloque `input` vía `input_json_delta` (para extraer `subagent_type`, `description` y `prompt`).
3. Registra `PendingAgentToolUse { stepIndex, toolUseId, subagentType, description, prompt }` en el `ActiveInteraction`.
4. Al llegar la siguiente request `fresh` de la misma sesión, `AuditInteractionHandler` extrae el prompt del request del subagente y lo compara con los pendings para correlación determinística.
5. Si hay match exacto por prompt, se asigna el `triggeringToolUseId` correspondiente y se marca `correlationStatus: 'resolved'`.
6. Si no hay match determinístico, se anida el subagente con `triggeringToolId: null` y `correlationStatus: 'unresolved'`.

**Delegación paralela:** un solo step puede emitir múltiples `Agent` tool_uses simultáneos (Claude lanza varios subagentes en paralelo). La correlación se resuelve por match exacto del prompt del request con el `prompt` del tool_use Agent, eliminando la necesidad de inferir por orden.

---

### Output (Response)

**Concepto:** el resultado final del ciclo.

**En implementación:** directorio `output/` en la raíz de la interacción.

**Importante:** el contenido de `output/body.json` **no es la respuesta HTTP cruda**. Es el mensaje reconstruido por `SseReconstructService` a partir de `steps/<último>/response/sse.jsonl`. La reconstrucción lee el JSONL line a line y usa el SDK de Anthropic para reensamblar el mensaje completo, incluyendo todos los bloques de contenido. Si la reconstrucción falla, se escribe `body.reconstruct-error.txt` en su lugar.

---

### Subagente

**Concepto:** una entidad subordinada que resuelve una parte del problema con su propio ciclo completo. Tiene la misma forma estructural que el agente principal (recursividad homogénea).

**En implementación:** un `agentic` anidado directamente bajo `steps/NN/sub-agent-NN/`. Tiene exactamente la misma estructura interna que una interacción raíz (`meta.json`, `state.json`, `input/`, `output/`, `steps/`).

**`parentContext` en `meta.json`:**
```json
{
  "parentContext": {
    "parentInteractionDir": "<ruta absoluta de la interacción padre>",
    "parentStepIndex": 2,
    "triggeringToolUseId": "toolu_01ABC...",
    "correlationStatus": "resolved",
    "correlationMethod": "prompt",
    "subagentType": "general-purpose"
  }
}
```

**Profundidad máxima: 2 niveles.** Un subagente con `parentContext` no puede ser padre de otros subagentes. Esta limitación es intencional: evita complejidad de anidamiento arbitrario y es consistente con el comportamiento observable del harness de Claude Code.

---

## Lo que el modelo abstracto no captura

### 1. La continuation como mecanismo de multi-step

El modelo abstracto presenta el pipeline como una secuencia lineal que el agente ejecuta de forma autónoma. En realidad, el protocolo es un diálogo de petición-respuesta:

1. El harness envía el prompt → Anthropic responde con `stop_reason: "tool_use"`.
2. El harness ejecuta las herramientas localmente → envía los resultados como `tool_result` en una nueva request HTTP.
3. Anthropic procesa los resultados y responde nuevamente.
4. Este ciclo se repite hasta que Anthropic responde con `stop_reason: "end_turn"`.

Cada una de estas requests HTTP es un **step** en el proxy. La primera request es el step 1; cada `tool_result` enviado de vuelta es un step adicional. La interacción permanece abierta (con `awaitingContinuation: true`) entre steps.

### 2. Los tipos que el modelo no cubre

El modelo solo describe el camino feliz de un `agentic`. No modela:

- **`client-preflight`**: no tiene Input ni Output propios; existe para inicialización del harness.
- **`side-request`**: corre en paralelo a la interacción activa sin interferir con ella.

### 3. Subagentes paralelos

El modelo muestra delegación 1-a-1. En la práctica, un step puede delegar a múltiples subagentes simultáneamente. El proxy gestiona esto con una lista de `PendingAgentToolUse` y los correlaciona a medida que llegan los `tool_result`.

### 4. Extended thinking

Cuando la respuesta de un step incluye bloques de extended thinking (`type: "thinking"`), el proxy los captura y escribe el texto completo en `steps/NN/thought/content.md` (sin truncar). Si hay múltiples bloques de thinking en el mismo step, se concatenan con separadores `---`. Esta información también se refleja en `StepMeta` como `hasThinking: true` y `thinkingBlockCount`.

---

## Mapeo de términos: conceptual → implementación

| Término conceptual | Tipo TypeScript (runtime) | Archivo/directorio en disco | Campo clave |
|---|---|---|---|
| Sesión | `AuditSession` | `sessions/<session-id>/` | `sessionId` |
| Interacción agéntica | `ActiveInteraction` | `main-agent/interactions/NN/` | `interactionType: "agentic"` |
| Interacción de preflight/side | `ActiveInteraction` | `side-interactions/NN/` | `interactionType: "client-preflight"/"side-request"` |
| Input | — | `input/` | — |
| Pipeline | — | `steps/` | `stepCount` |
| Step | `StepMeta` | `steps/NN/` | `stepIndex`, `stopReason` |
| Step Compute | `StepMeta` (sin Agent pending) | `steps/NN/` | `stopReason: "end_turn"` |
| Step Delegate | `StepMeta` + `PendingAgentToolUse[]` | `steps/NN/` | `pendingAgentToolUses` |
| Output | — | `output/` | reconstruido de `sse.jsonl` |
| Subagente | `ActiveInteraction` con `parentContext` | `steps/NN/sub-agent-NN/` | `parentContext` |
| Delegación | — | — | SSE detecta `tool_use` `name: "Agent"` |
| Continuación | clasificación `continuation` | `steps/NN+1/` | `tool_result` en body |
| Extended thinking | — | `steps/NN/thought/content.md` | `hasThinking`, `thinkingBlockCount` |

---

## Principio de diseño subyacente

La estructura en disco **grita** la jerarquía de ejecución. Un observador humano puede navegar `sessions/<id>/main-agent/interactions/` y ver inmediatamente qué interacciones hubo, en qué orden, cuántos steps tomó cada uno, y qué subagentes fueron invocados, sin necesidad de parsear logs lineales.

Este principio ("Screaming Architecture") guía todas las decisiones sobre qué registrar, cómo nombrarlo, y dónde colocarlo. No es observabilidad técnica exhaustiva; es observabilidad **orientada al análisis humano** del flujo de trabajo agéntico.

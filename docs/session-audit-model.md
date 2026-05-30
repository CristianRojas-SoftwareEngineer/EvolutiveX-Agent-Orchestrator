# Session Audit Model — Smart Code Proxy

Este documento es la referencia canónica del modelo de auditoría en `sessions/`. Describe el modelo de ejecución agéntico que subyace al sistema de auditoría, lo ancla al diseño real (tipos en TypeScript, estructura de directorios, comportamiento observable del harness de Claude Code) y documenta el layout físico bajo `./sessions/<session-id>/`.

Permite razonar sobre el sistema sin depender exclusivamente del código fuente, pero sin perder precisión cuando los detalles de implementación importan.

---

## 1. Propósito y alcance

### Qué cubre este documento

- Modelo conceptual de ejecución agéntica (sesión, interacción, steps, subagentes).
- Estructura de directorios en `sessions/` y reglas de nomenclatura.
- Los tres tipos de interacción (`agentic`, `client-preflight`, `side-request`).
- Entidades del modelo y su mapeo a tipos TypeScript y rutas en disco.
- Comportamiento del protocolo HTTP (clasificación, continuations, delegación, correlación).
- Artefactos transversales (`meta.json`, `state.json`, secuencias, métricas de sesión).

### Qué delega a otros documentos

| Tema | Documento |
| ---- | --------- |
| Métricas agregadas por modelo (`session-metrics.json`) | [`session-metrics-system.md`](./session-metrics-system.md) |
| Reconstrucción SSE y formato de `sse.jsonl` | [`how-sse-reconstruction-works.md`](./how-sse-reconstruction-works.md) |
| Peticiones sin cabecera de sesión (pre-sesión) | [`health-check-handling.md`](./health-check-handling.md) |
| Variables de entorno, límites de bytes, configuración | [README § Configuración](../README.md#configuracion) |
| Onboarding y primer uso | [`how-to-start.md`](./how-to-start.md) |
| Riesgos de seguridad (API keys en disco) | [README § Riesgos](../README.md#riesgos-seguridad) |

---

## 2. Principio de diseño

La estructura en disco **grita** la jerarquía de ejecución. Un observador humano puede navegar `sessions/<id>/main-agent/interactions/` y ver inmediatamente qué interacciones hubo, en qué orden, cuántos steps tomó cada uno, y qué subagentes fueron invocados, sin necesidad de parsear logs lineales.

Este principio (*Screaming Architecture*) guía todas las decisiones sobre qué registrar, cómo nombrarlo, y dónde colocarlo. No es observabilidad técnica exhaustiva; es observabilidad **orientada al análisis humano** del flujo de trabajo agéntico.

### Semántica de `input/`/`output/` frente a `request/`/`response/`

| Nivel | Directorio | Significado |
| ----- | ---------- | ----------- |
| Top-level de interacción | `input/` | Entrada del **ciclo** (prompt inicial del usuario o subagente). No es una petición HTTP genérica. |
| Top-level de interacción | `output/` | Salida **reconstruida** del ciclo completo. No es la respuesta HTTP cruda. |
| Dentro de cada step | `request/` | Petición HTTP enviada a Anthropic en ese step concreto. |
| Dentro de cada step | `response/` | Respuesta HTTP recibida de Anthropic en ese step concreto. |

No existe un directorio `response/` en la raíz de la interacción: `request/` y `response/` solo viven bajo `steps/NN/`.

---

## 3. Vista general

### 3.1 Diagrama de ejecución (agentic)

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

Este diagrama modela únicamente la interacción principal de tipo `agentic`. Los otros tipos (`client-preflight` y `side-request`) se describen en la [sección 5](#5-tipos-de-interacción).

### 3.2 Diagrama de directorios

```text
sessions/
  {sessionID}/
    session-metrics.json
    main-agent/
    │ interactions/
    │   interaction-sequence.json
    │   01/                                                                        → /sessions/{sessionID}/main-agent/interactions/01/
    │   XX/                                                                        → /sessions/{sessionID}/main-agent/interactions/XX/
    │     meta.json, state.json
    │     input/                                                                   → .../XX/input/
    │     steps/                                                                   → .../XX/steps/
    │     │ 01/                                                                    → .../XX/steps/01/
    │     │   request/                                                             → .../XX/steps/01/request/
    │     │   thought/                                                             → .../XX/steps/01/thought/     (solo si hay extended thinking)
    │     │   response/                                                            → .../XX/steps/01/response/
    │     │ YY/                                                                    → .../XX/steps/YY/            (step con delegación a subagentes)
    │     │   request/                                                             → .../XX/steps/YY/request/
    │     │   thought/                                                             → .../XX/steps/YY/thought/     (solo si hay extended thinking)
    │     │   response/                                                            → .../XX/steps/YY/response/
    │     │   sub-agent-01/                                                        → .../XX/steps/YY/sub-agent-01/
    │     │   │ input/                                                             → .../sub-agent-01/input/
    │     │   │ steps/                                                             → .../sub-agent-01/steps/
    │     │   │ │ 01/                                                              → .../sub-agent-01/steps/01/
    │     │   │ │   request/                                                       → .../sub-agent-01/steps/01/request/
    │     │   │ │   thought/                                                       → .../sub-agent-01/steps/01/thought/
    │     │   │ │   response/                                                      → .../sub-agent-01/steps/01/response/
    │     │   │ │ ZZ/                                                              → .../sub-agent-01/steps/ZZ/
    │     │   │ │   request/, thought/, response/
    │     │   │ output/                                                            → .../sub-agent-01/output/
    │     │   sub-agent-02/                                                        → .../XX/steps/YY/sub-agent-02/
    │     │   │ input/, steps/, output/
    │     │   sub-agent-TT/                                                        → .../XX/steps/YY/sub-agent-TT/
    │     │     ...
    │     output/                                                                  → .../XX/output/
    │
    side-interactions/
      interaction-sequence.json
      01/                                                                          → /sessions/{sessionID}/side-interactions/01/
      MM/                                                                          → /sessions/{sessionID}/side-interactions/MM/
        meta.json, state.json
        input/                                                                     → .../MM/input/               (solo en side-request)
        steps/                                                                     → .../MM/steps/
        │ 01/                                                                      → .../MM/steps/01/
        │   request/, thought/, response/
        │ NN/                                                                      → .../MM/steps/NN/
        │   request/, thought/, response/
        output/                                                                    → .../MM/output/              (solo en side-request)
```

### 3.3 Contenedores de primer nivel

La sesión se divide en **dos árboles independientes** bajo `sessions/<session-id>/`:

| Contenedor | Tipos alojados | Archivo de secuencia | `input/` raíz | `output/` raíz |
| ---------- | -------------- | -------------------- | ------------- | -------------- |
| `main-agent/interactions/` | `agentic` | `main-agent/interactions/interaction-sequence.json` | Sí (fresh) | Sí (al cerrar) |
| `side-interactions/` | `client-preflight`, `side-request` | `side-interactions/interaction-sequence.json` | Solo `side-request` | Solo `side-request` |

**`main-agent/interactions/`** — Interacciones agénticas: el agente principal recibió un prompt del usuario, lo procesó a través de uno o más steps HTTP, y produjo una respuesta reconstruida.

Estructura fija por interacción agéntica:

- `input/` — prompt inicial del usuario (top-level)
- `steps/YY/` — cada llamada HTTP individual, con `request/`, `thought/` (opcional), `response/`, y `sub-agent-TT/` (opcional)
- `output/` — respuesta final reconstruida del pipeline completo

**`side-interactions/`** — Preflights y peticiones secundarias:

- **`client-preflight`**: quota-check y cache warm-up del harness. Sin `input/` ni `output/` raíz — solo `steps/`.
- **`side-request`**: peticiones auxiliares con `"tools": []` en paralelo al turno agéntico (p. ej. `/v1/messages/count_tokens`). Con `input/` y `output/` raíz.

Los contadores de numeración (`NN`) son **independientes** entre ambos árboles.

---

## 4. Nomenclatura e indexación

### Símbolos en diagramas

| Símbolo en diagrama | Dimensión | Formato | Ejemplo |
| ------------------- | --------- | ------- | ------- |
| `XX` | Índice de interacción en `main-agent/interactions/` | 2 dígitos, sin UUID | `01`, `12` |
| `MM` | Índice de interacción en `side-interactions/` | 2 dígitos, sin UUID | `01`, `06` |
| `YY` | Índice de step dentro de una interacción agéntica | 2 dígitos | `01`, `03` |
| `ZZ` | Índice de step dentro de un subagente | 2 dígitos | `01`, `02` |
| `NN` | Índice de step dentro de una side-interaction | 2 dígitos | `01`, `04` |
| `TT` | Índice de subagente (`sub-agent-TT`) | 2 dígitos | `01`, `02` |

### Reglas generales

- Índices **2 dígitos**, **1-based** (`01`, `02`, …).
- Sin UUID en nombres de carpeta de interacción.
- Cada árbol mantiene su propio contador en `interaction-sequence.json`.

### Archivos a nivel de sesión

| Archivo | Ubicación | Función |
| ------- | --------- | ------- |
| `session-metrics.json` | `sessions/<session-id>/` | Contadores acumulados de tokens por `modelId`. Ver [`session-metrics-system.md`](./session-metrics-system.md). |
| `interaction-sequence.json` | `main-agent/interactions/` | Contador del árbol agéntico |
| `interaction-sequence.json` | `side-interactions/` | Contador de preflights y side-requests |

---

## 5. Tipos de interacción

La función `classifyRequestBody` en `src/1-domain/services/request-classifier.service.ts` determina la clasificación de cada request HTTP entrante. El tipo resultante se persiste en `meta.json` como `interactionType` y define qué archivos existen en el directorio de la interacción.

### Tabla resumen

| `interactionType` | Origen | Contenedor | Cierre |
| ----------------- | ------ | ---------- | ------ |
| `agentic` | Prompt del usuario con `tools` no vacíos (fresh) + continuations | `main-agent/interactions/NN/` | `stop_reason` terminal (`end_turn`, `max_tokens`) |
| `client-preflight` | Quota check (`max_tokens:1`) o cache warm-up sin turno activo | `side-interactions/NN/` | Al recibir la respuesta (inmediato) |
| `side-request` | Peticiones con `tools: []` (ej. `count_tokens`, generación de títulos) | `side-interactions/NN/` | Respuesta terminal; no desplaza al turno activo |

### 5.1 `agentic` — La interacción real del usuario

**Definición:** interacción principal. El proxy recibió un prompt del usuario, lo forwardó a Anthropic, y audita la respuesta completa incluyendo todos los pasos de tool_use/continuation.

**Condiciones de clasificación:**

- `fresh`: body con `"tools"` (array no vacío) → nueva interacción raíz o subagente
- `continuation`: body con `"tool_result"` → step adicional de una interacción existente

**Contenedor y ruta base:** `sessions/<session-id>/main-agent/interactions/NN/`

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

**Presencia condicional:**

| Elemento | Presencia |
| -------- | --------- |
| `input/` raíz | Solo en request `fresh` (no en continuation) |
| `output/` raíz | Al cerrar turno con respuesta terminal reconstruida |
| `thought/` | Solo si el step contiene extended thinking |
| `sub-agent-TT/` | Solo si el step emitió `tool_use` con `name: "Agent"` |

**Cierre:** cuando Anthropic responde con `stop_reason` terminal (`end_turn` o `max_tokens`). Se escribe `meta.json` y se elimina `state.json`.

### 5.2 `client-preflight` — Inicialización del harness

**Definición:** el harness de Claude Code ejecuta un par de peticiones de inicialización antes de la primera interacción real: un quota-check y un cache warm-up. Ambas se registran como un único `client-preflight` con dos steps.

**Condiciones de clasificación:**

- `preflight-quota`: body con `"quota"` y `max_tokens:1`
- `preflight-warmup`: body vacío o sin `"tools"`

**Contenedor y ruta base:** `sessions/<session-id>/side-interactions/NN/`

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

**Presencia condicional:**

| Elemento | Presencia |
| -------- | --------- |
| `input/` raíz | No |
| `output/` raíz | No |
| `steps/` | Sí (siempre) |

**Diferencia clave respecto a `agentic`:** no existe `input/` ni `output/` en el directorio raíz. Solo existen los `steps/` con sus propios archivos.

**Cierre:** inmediato al recibir la respuesta con `outcome: "completed"`. Evita turnos zombie que bloqueen la sesión.

### 5.3 `side-request` — Petición lateral del harness

**Definición:** peticiones con `"tools": []` (array vacío) que el harness envía en paralelo a la interacción agéntica activa. El caso más frecuente es `/v1/messages/count_tokens`. **No reemplazan ni interrumpen la interacción activa.**

**Condiciones de clasificación:** body con `"tools": []` (array vacío explícito).

**Contenedor y ruta base:** `sessions/<session-id>/side-interactions/NN/`

**Estructura en disco:**

```
side-interactions/NN/
  meta.json                     # interactionType: "side-request"
  state.json
  input/                        # Igual que agentic
    headers.json, body.bin, body.json, body.parsed.md
  output/                       # Respuesta reconstruida al cerrar
    body.json, body.parsed.md, headers.json
  steps/
    01/
      request/, response/
```

**Presencia condicional:**

| Elemento | Presencia |
| -------- | --------- |
| `input/` raíz | Sí |
| `output/` raíz | Sí (al cerrar) |
| `steps/` | Sí |

**Cierre:** respuesta terminal. Se audita en su propia interacción sin desplazar al turno activo principal, evitando corrupción de metadata por race conditions.

---

## 6. Entidades del modelo

### 6.1 Sesión

**Concepto:** contenedor de más alto nivel. Identifica a un agente principal y agrupa todas sus interacciones.

**Implementación:** directorio `sessions/<session-id>/` donde `session-id` se resuelve desde cabeceras HTTP con la prioridad:

1. `x-cc-audit-session` (override)
2. `x-claude-code-session-id` (fallback Claude Code)
3. Fallback interno `_unknown` — **no genera archivos de auditoría**

**Persistencia en la raíz de sesión:**

- `session-metrics.json` — métricas agregadas por modelo
- `main-agent/interactions/interaction-sequence.json` — contador del árbol agéntico
- `side-interactions/interaction-sequence.json` — contador de preflights/side-requests

**No confundir:** una sesión no es un ciclo de ejecución. Es el contexto persistente que contiene múltiples ciclos (interacciones) a lo largo del tiempo.

**Peticiones pre-sesión:** las peticiones sin cabecera de sesión válida resuelven internamente a `_unknown` y **no generan archivos de auditoría**. El proxy las reenvía al upstream, pero `AuditInteractionHandler` retorna sin escribir bajo `sessions/`. No se crea `sessions/_unknown/`. Guía ampliada: [`health-check-handling.md`](./health-check-handling.md).

Ver también: [§7.1 Clasificación](#71-clasificación-de-requests).

### 6.2 Interacción

**Concepto:** instancia concreta de ejecución. Tiene una entrada, una fase de procesamiento y una salida. Separa la identidad de la sesión de la ejecución particular que está ocurriendo.

**Implementación:**

- Interacciones agénticas: `sessions/<session-id>/main-agent/interactions/NN/`
- Preflights y side-requests: `sessions/<session-id>/side-interactions/NN/`

El prefijo `NN` (2 dígitos, 1-based) es el número de secuencia dentro del árbol correspondiente, gestionado por su `interaction-sequence.json`.

**Tipos en TypeScript:** `ActiveInteraction` (en memoria durante la ejecución) → `InteractionMetadata` en `meta.json` (persistido al cerrar).

**Campos clave de `InteractionMetadata`:**

- `interactionType`: `'agentic'` / `'client-preflight'` / `'side-request'`
- `modelId`: modelo que procesó la interacción (presente en `agentic` y `side-request`)
- `outcome`: `'completed'` / `'upstream-error'` / `'client-error'` / `'truncated'` / `'orphaned'`
- `stepCount`: cantidad de steps HTTP completados
- `steps[]`: array de `StepMeta` con tokens, `stopReason`, tool calls, y `anthropicMessageId`
- `parentContext`: solo en subagentes (ver [§6.7](#67-subagente))

Ver también: [§5 Tipos de interacción](#5-tipos-de-interacción), [§7.4 Artefactos transversales](#74-artefactos-transversales).

### 6.3 Input

**Concepto:** entrada inicial del ciclo; la pregunta, tarea u objetivo que inicia el trabajo.

**Implementación:** directorio `input/` en la raíz de la interacción.

**Archivos:**

| Archivo | Contenido |
| ------- | --------- |
| `headers.json` | Cabeceras HTTP recibidas (contiene el API key completo — no compartir) |
| `body.bin` | Cuerpo crudo en binario |
| `body.json` | Cuerpo formateado (pretty print) |
| `body.parsed.md` | Vista semántica en Markdown (extrae el array `messages[]` legiblemente) |

**Ausente en:** `client-preflight` (no tiene `input/` raíz). En `agentic`, solo se escribe en request `fresh` (no en continuation).

### 6.4 Pipeline de steps

**Concepto:** secuencia ordenada de ejecución que transforma el Input en Output.

**Implementación:** directorio `steps/` con subdirectorios numerados `01/`, `02/`, `NN/` (2 dígitos, 1-based).

**Relación con HTTP:** cada step corresponde a **una llamada HTTP** entre el proxy y la API de Anthropic. No son etapas de procesamiento abstractas: son round-trips reales de red.

| Escenario | Steps |
| --------- | ----- |
| Respuesta directa sin herramientas | 1 step |
| Respuesta + 1 tool_use + 1 continuation | 2 steps |
| Respuesta + N tool_uses encadenados | N+1 steps |

Ver también: [§7.2 Continuations](#72-continuations-multi-step).

### 6.5 Step (Compute / Delegate)

**Concepto — Compute:** paso donde el agente procesa sin delegar a subagentes. Un step cuya respuesta SSE no contiene ningún `tool_use` con `name: "Agent"`. Puede contener tool_uses de built-in tools (`WebSearch`, `WebFetch`, etc.) o ninguno. `stopReason` típico: `"end_turn"` o `"tool_use"` (con herramientas no-Agent).

**Concepto — Delegate:** punto de transferencia donde el agente principal delega a un subagente. Un step cuya respuesta SSE contiene uno o más `content_block_start` con `type: "tool_use"` y `name: "Agent"`.

**Implementación:** directorio `steps/NN/` con subdirectorios:

| Directorio | Presencia | Contenido |
| ---------- | --------- | --------- |
| `request/` | Siempre | Petición HTTP enviada a Anthropic en este step |
| `thought/` | Solo si hay extended thinking | Bloques de extended thinking emitidos por el modelo |
| `response/` | Siempre | Respuesta HTTP recibida de Anthropic en este step |
| `sub-agent-TT/` | Solo en Delegate | Subagente anidado (ver [§6.7](#67-subagente)) |

Ver también: [§7.3 Delegación y correlación](#73-delegación-y-correlación-de-subagentes).

### 6.6 Output

**Concepto:** resultado final del ciclo.

**Implementación:** directorio `output/` en la raíz de la interacción.

**Importante:** el contenido de `output/body.json` **no es la respuesta HTTP cruda**. Es el mensaje reconstruido por `SseReconstructService` a partir de `steps/<último>/response/sse.jsonl`. La reconstrucción lee el JSONL línea a línea y usa el SDK de Anthropic para reensamblar el mensaje completo. Si la reconstrucción falla, se escribe `body.reconstruct-error.txt` en su lugar.

**Streaming (SSE) en disco** — rutas relativas a cada interacción:

| Momento | Ruta | Qué contiene |
| ------- | ---- | ------------ |
| Durante el stream | `steps/NN/response/sse.jsonl` | Eventos SSE línea a línea (**fuente de verdad**) |
| Durante el stream | `steps/NN/response/headers.json` | Cabeceras de la respuesta de ese step |
| Durante el stream | `steps/NN/response/sse.txt` | Volcado raw opcional (límite `MAX_AUDIT_BYTES`; no afecta reconstrucción) |
| Al cerrar cada step | `steps/NN/response/body.json`, `body.parsed.md` | Mensaje del asistente reconstruido **de ese step** |
| Al cerrar el turno (step terminal) | `output/body.json`, `output/body.parsed.md`, `output/headers.json` | Resumen **top-level** del turno |

Detalle técnico de reconstrucción: [`how-sse-reconstruction-works.md`](./how-sse-reconstruction-works.md).

### 6.7 Subagente

**Concepto:** entidad subordinada que resuelve una parte del problema con su propio ciclo completo. Tiene la misma forma estructural que el agente principal (recursividad homogénea).

**Implementación:** un `agentic` anidado directamente bajo `steps/NN/sub-agent-NN/`. Misma estructura interna que una interacción raíz (`meta.json`, `state.json`, `input/`, `output/`, `steps/`).

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

**Valores de `correlationMethod`** (ordenados por autoridad descendente, §21):

| Valor | Significado | Autoridad |
| ----- | ----------- | --------- |
| `agent-headers` | Correlación determinista por cabeceras `X-Claude-Code-Agent-Id` / `X-Claude-Code-Parent-Agent-Id` (plano A) | Mayor |
| `prompt` | Correlación por match exacto del prompt del request con el pending Agent | Media |
| `unique-pending` | Correlación por ser el único pending disponible | Media (legacy) |
| `fifo-pending` | Señal posicional: primer pending registrado (FIFO); último recurso determinista cuando hay N pendings sin match | Baja (legacy) |
| `none` | No se pudo resolver la correlación (0 pendings, sin cabeceras) | — |

Cuando `correlationMethod === 'agent-headers'`, el `parentContext` también incluye `wireAgentId` y `wireParentAgentId` con los valores de las cabeceras originales de la request del subagente.

El join `tool_use_id`↔subagente (plano B, §23) está centralizado en la función pura de dominio `joinToolUseToSubagent` con política única/prompt/FIFO/diferido. La ruta heurística (`prompt`, `unique-pending`, `fifo-pending`) se mantiene operativa como fallback para clientes Claude Code &lt; 2.1.139 u otros harnesses sin cabeceras de agente. Está marcada como `@deprecated-fallback` en el código (retirada planificada en G2).

**Profundidad máxima: 2 niveles.** Un subagente con `parentContext` no puede ser padre de otros subagentes. Limitación intencional, consistente con el comportamiento observable del harness de Claude Code.

La continuation que trae los `tool_result` de subagentes se coalesce en `steps/NN/response/body.*` del step padre (ver [§7.3](#73-delegación-y-correlación-de-subagentes)).

### 6.8 Extended thinking

Cuando la respuesta de un step incluye bloques de extended thinking (`type: "thinking"`), el proxy los captura y escribe el texto completo en `steps/NN/thought/content.md` (sin truncar). Si hay múltiples bloques de thinking en el mismo step, se concatenan con separadores `---`.

Esta información también se refleja en `StepMeta`:

- `hasThinking: true`
- `thinkingBlockCount`: número de bloques de thinking

La captura de contenido legible puede requerir `PROXY_UNREDACT_THINKING=true` (ver README § Configuración).

---

## 7. Comportamiento del protocolo

### 7.1 Clasificación de requests

La función `classifyRequestBody` (`src/1-domain/services/request-classifier.service.ts`) analiza el body de cada request entrante:

| Clasificación | Condición | Tipo de interacción resultante |
| ------------- | --------- | ------------------------------ |
| `fresh` | Body con `"tools"` (array no vacío) | `agentic` (raíz o subagente) |
| `continuation` | Body con `"tool_result"` | Step adicional de interacción existente |
| `preflight-quota` | Body con `"quota"` y `max_tokens:1` | `client-preflight` |
| `preflight-warmup` | Body vacío o sin `"tools"` | `client-preflight` |
| `side-request` | Body con `"tools": []` | `side-request` |

El handler `AuditInteractionHandler` enruta cada clasificación al flujo correspondiente. Ver tests en `tests/1-domain/request-classifier.test.ts`.

### 7.2 Continuations (multi-step)

El modelo abstracto presenta el pipeline como secuencia lineal. En realidad, el protocolo es un diálogo de petición-respuesta:

1. El harness envía el prompt → Anthropic responde con `stop_reason: "tool_use"`.
2. El harness ejecuta las herramientas localmente → envía los resultados como `tool_result` en una nueva request HTTP.
3. Anthropic procesa los resultados y responde nuevamente.
4. Este ciclo se repite hasta que Anthropic responde con `stop_reason: "end_turn"`.

Cada request HTTP es un **step** en el proxy. La primera request es el step 1; cada `tool_result` enviado de vuelta es un step adicional. La interacción permanece abierta entre steps.

Las continuaciones se rutean al turno padre mediante correlación por `tool_use_id`, eliminando la misatribución de steps. Cada step en `meta.json` puede incluir `toolUseIds: string[]` — los IDs de tool_use emitidos en ese step, usados para correlacionar con futuras continuaciones.

### 7.3 Delegación y correlación de subagentes

#### Detección SSE → disco

1. El SSE handler detecta `content_block_start` con `name: "Agent"`.
2. Acumula el JSON del bloque `input` vía `input_json_delta` (para extraer `subagent_type`, `description` y `prompt`).
3. Registra `PendingAgentToolUse { stepIndex, toolUseId, subagentType, description, prompt }` en el `ActiveInteraction`.
4. Al llegar la siguiente request `fresh` de la misma sesión, `AuditInteractionHandler` determina el método de correlación según las cabeceras presentes:

**Plano A — correlación por cabeceras (mayor autoridad, §21):**

Si la request trae `X-Claude-Code-Parent-Agent-Id` (Claude Code ≥ 2.1.139), el handler resuelve la correlación determinísticamente mediante `IWorkflowRepository.openSubagentFromWire()`. En este caso `correlationMethod === 'agent-headers'` y el `parentContext` incluye `wireAgentId` y `wireParentAgentId`.

**Fallback heurístico (clientes legacy):**

Si la request no trae cabeceras de agente, se aplica la ruta heurística original:

5. El handler extrae el prompt del request del subagente y lo compara con los pendings para correlación determinística.
6. Si hay match exacto por prompt, se asigna el `triggeringToolUseId` correspondiente y se marca `correlationStatus: 'resolved'`.
7. Si no hay match determinístico, se anida el subagente con `triggeringToolUseId: null` y `correlationStatus: 'unresolved'`.

#### Subagentes paralelos

Un solo step puede emitir múltiples `Agent` tool_uses simultáneos. El proxy gestiona una lista de `PendingAgentToolUse` y los correlaciona por match exacto del prompt del request con el `prompt` del tool_use Agent, eliminando la necesidad de inferir por orden.

#### Steps coalesced de Agent

Para steps que invocan subagentes, el `response/sse.jsonl` es **multi-fase** — cada línea incluye `phase: "delegation"` (stream inicial) o `phase: "continuation"` (stream terminal con tool_result).

El `response/body.json` tiene estructura consolidada con:

- `delegation.message`
- `continuation.request.body`
- `continuation.request.headers`
- `continuation.response.message`
- `toolUseIds`
- `subagents` (resumen estructurado de subagentes ejecutados en Fase 2)

El `response/body.parsed.md` muestra tres fases:

1. **Fase 1: Delegación inicial**
2. **Fase 2: Ejecución de subagentes** (con tabla resumen de cada subagente)
3. **Fase 3: Respuesta final coalesced**

Los archivos `continuation.*` temporales ya no se crean; la request de continuation se almacena en memoria y se escribe directamente en `body.json`. Para steps coalesced, `sse.txt` se elimina al consolidar (solo `sse.jsonl` es canónico).

Las continuaciones de `Agent`/subagentes se coalescen en el `response` del step que emitió los subagentes; las demás tools conservan steps separados.

### 7.4 Artefactos transversales

#### `state.json`

Archivo marcador escrito al iniciar la interacción:

```json
{
  "state": "in-progress",
  "startedAt": "<ISO8601>",
  "interactionType": "agentic",
  "parentContext": { ... }
}
```

Se elimina al cerrar el turno (cuando se escribe `meta.json`). Su presencia indica una interacción huérfana por crash del proceso.

#### `meta.json` — campo `outcome`

| `outcome` | Significado | `statusCode` típico |
| --------- | ----------- | ------------------- |
| `completed` | Turno completado exitosamente | 2xx |
| `client-error` | Error del cliente (request mal formada, autenticación fallida, etc.) | 4xx |
| `upstream-error` | Error del servidor upstream (fallo de conexión, timeout, error SSE) | 5xx o `null` |
| `truncated` | Respuesta truncada por `max_tokens` | 2xx |
| `orphaned` | Turno cerrado por cleanup (continuation nunca llegó, graceful shutdown) | `null` |

#### Campos forenses en `meta.json`

Cuando un turno se cierra con `upstream-error` o `orphaned` habiendo emitido tool_uses que no se correlacionaron:

| Campo | Tipo pendiente |
| ----- | -------------- |
| `lostPendingAgents` | `PendingAgentToolUse[]` — tool_uses `Agent` sin correlacionar |
| `lostPendingWebSearch` | `PendingWebSearchToolUse[]` |
| `lostPendingWebFetch` | `PendingWebFetchToolUse[]` |

Facilitan correlación offline cuando el cierre fue abrupto.

#### Correlación con logs de Claude Code

Cada step en `meta.json` incluye `anthropicMessageId` — el `message.id` de la API de Anthropic:

```json
{
  "steps": [
    {
      "stepIndex": 1,
      "anthropicMessageId": "msg_01SweCL7ReWWANWSRsPc8mfn",
      "stopReason": "tool_use"
    }
  ]
}
```

| Sistema | Ubicación del ID | Ejemplo |
| ------- | ---------------- | ------- |
| Log Claude Code (`.jsonl`) | `message.id` | `msg_01SweCL7ReWWANWSRsPc8mfn` |
| Auditoría Proxy (`meta.json`) | `steps[].anthropicMessageId` | `msg_01SweCL7ReWWANWSRsPc8mfn` |

**Proceso de correlación:**

1. Extrae `"id"` del evento `assistant` en el log de Claude Code.
2. Busca ese valor en `sessions/<session>/main-agent/interactions/*/meta.json` (y, si aplica, `side-interactions/*/meta.json`) bajo `steps[].anthropicMessageId`.
3. El directorio contenedor es la interacción correspondiente.

#### Subdirectorios dentro de cada step

| Directorio | Presencia | Contenido |
| ---------- | --------- | --------- |
| `request/` | Siempre | Petición HTTP enviada a Anthropic en este step |
| `thought/` | Solo si hay extended thinking | Bloques de extended thinking emitidos por el modelo |
| `response/` | Siempre | Respuesta HTTP recibida de Anthropic en este step |

### 7.5 Herramientas internas (WebSearch / WebFetch)

Además de subagentes (`Agent`), el proxy trackea herramientas internas del harness:

**`PendingWebSearchToolUse` / `PendingWebFetchToolUse`:** registrados cuando el SSE del padre emite `tool_use` con `name: "WebSearch"` o `"WebFetch"`. Se consumen al recibir el request fresh de implementación del harness.

**`ResolvedInternalTool`:** resolución observada de una herramienta interna, con modos:

- `internal_request`: se observó una request de implementación del harness
- `tool_result`: resolución vía `tool_result` en continuation

Estas herramientas no crean subagentes anidados; sus continuaciones se rutean al step padre correspondiente. Los pendings no consumidos al cierre aparecen en `lostPendingWebSearch` / `lostPendingWebFetch` del `meta.json` padre.

---

## 8. Mapeo conceptual → implementación

| Término conceptual | Tipo TypeScript (runtime) | Archivo/directorio en disco | Campo clave |
| ---------------- | ------------------------- | --------------------------- | ----------- |
| Sesión | `AuditSession` | `sessions/<session-id>/` | `sessionId` |
| Métricas de sesión | `ISessionMetrics` (G4) | `session-metrics.json` | `models[modelId]` + `session_totals` + `cache_efficiency` |
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
| Estado in-progress | `InteractionState` | `state.json` | `state: "in-progress"` |
| Secuencia agéntica | — | `main-agent/interactions/interaction-sequence.json` | contador numérico |
| Secuencia side | — | `side-interactions/interaction-sequence.json` | contador numérico |

### 8.1 Estado activo del correlador (G2)

A partir de G4, el correlador (`IWorkflowRepository`) es la fuente de verdad para cierre de turno; `ISessionStore`/`ActiveInteraction` siguen alimentando `StepMeta` forense y campos que aún no viven en `IWorkflowResult`.

**Entidades del correlador G2:**

| Entidad | Tipo TypeScript | Referencia |
| ------- | --------------- | ---------- |
| Workflow principal (por sesión) | `IWorkflow` con `kind: 'main'`, `id = sessionId` | `src/1-domain/interfaces/gateway/IWorkflow.ts` |
| Sub-workflow (por agente) | `IWorkflow` con `kind: 'subagent'`, `id = agentId` | — |
| Resultado de cierre | `IWorkflowResult` | `src/1-domain/interfaces/gateway/IWorkflowResult.ts` |
| Correlador en memoria | `WorkflowRepositoryService` | `src/2-services/workflow-repository.service.ts` |

**Lifecycle de cierre:**

```
UserPromptSubmit → openWorkflow(sessionId)     → IWorkflow { status: 'running' }
                 → registerStep / registerToolUse (G3/G4)
Stop/SubagentStop → readyToClose(workflowId, hook)
                     ├─ false si stopHookActive === true
                     ├─ false si backgroundTasks > 0
                     └─ true → close(workflowId, hook)
                                 → buildWorkflowResult(workflow, closedSteps, childResults, hook)
                                 → IWorkflowResult { outcome, finalText, usage, stepCount }
                                 → IWorkflow { status: 'completed' | 'failed' }
StopFailure      → close(workflowId, hook) directo (sin readyToClose — §15.4)
                 → AuditWorkflowClosureHandler → meta.json + session-metrics (main)
```

`close` es idempotente (§28): si `workflow.result != null`, devuelve el resultado existente sin mutar el estado.

### 8.3 Proyección a disco y métricas de sesión (G4)

Tras `close()`, `AuditHookEventHandler` delega en `AuditWorkflowClosureHandler` (`src/3-operations/audit-workflow-closure.handler.ts`):

1. `projectWorkflowResultToInteractionMetadata` (`src/2-services/workflow-result-projector.service.ts`) — `IWorkflowResult` + `ActiveInteraction` → shape legacy de `meta.json`.
2. `IAuditWriter.writeInteractionMeta` — layout flat sin cambios.
3. Si `workflow.kind === 'main'`, `SessionMetricsService` (`src/2-services/session-metrics.service.ts`) actualiza `session-metrics.json` (§33.2: `models`, `session_totals`, `cache_efficiency`; sin `duration_ms` ni `outcome`).

**Wire → correlador (G4):** `AuditSseResponseHandler` y `AuditStandardResponseHandler` llaman `registerStep`/`closeStep` al completar cada inferencia (`gateway-wire-step.util.ts`). Con `stop_reason: tool_use` el step queda abierto; con `end_turn` se cierra en el correlador.

**Cierre nominal vs fallback:** si el workflow está abierto en el correlador, el wire **no** escribe `meta.json` al terminar el stream (espera hook `Stop`). La ruta `@deprecated-fallback` conserva `writeInteractionMeta` inline cuando no hay workflow en memoria.

**Invariante G16:** solo workflows `kind: 'main'` escriben `session-metrics.json`; sub-workflows no duplican consumo (rollup en el padre vía `aggregateWorkflowUsage`).

### 8.2 StepAssembler y propagación de modelo (G3)

A partir de G3, el ensamblaje en RAM de cada respuesta de inferencia SSE vive en `StepAssemblerService` (`src/2-services/step-assembler.service.ts`, port `IStepAssembler`). Es efímero: el composition root inyecta una factory `() => new StepAssemblerService()` y `AuditSseResponseHandler` crea una instancia por stream.

**Responsabilidades separadas:**

| Componente | Qué hace |
| ---------- | -------- |
| `AuditSseResponseHandler` | Borde: `sse.txt`, `sse.jsonl`, side-effects legacy en `ISessionStore`, reconstrucción, `StepMeta` en disco |
| `StepAssembler` | Acumula `usage` (con fallback en `message_delta`), `stopReason`, `anthropicMessageId`, `model` (respuesta), bloques `thinking` y `tool_use` |

Por cada evento SSE parseado, el handler invoca `assembler.onEvent(evt)` en paralelo a los registros legacy. Al `stream.on('end')`, lee `assembler.result()` para construir `StepMeta` y escribir `thought/content.md`.

**Propagación de `languageModelId`:** al cerrar el stream, si la interacción activa tiene `modelId` (extraído del request), el handler llama `IWorkflowRepository.setWorkflowModel(workflowId, modelId)`:

- Workflow main: `workflowId = sessionId`
- Subagente: `workflowId = parentContext.wireAgentId` cuando existe

La operación es idempotente (primer modelo observado) y no-op si el workflow aún no fue abierto en el correlador (p. ej. hooks deshabilitados). G4 registra cada inferencia como `IStep` en el correlador y agrega métricas de sesión al cierre main vía `aggregateWorkflowUsageByModel`.

---

## 9. Documentación relacionada

- [`session-metrics-system.md`](./session-metrics-system.md) — agregación O(1) de tokens por modelo
- [`how-sse-reconstruction-works.md`](./how-sse-reconstruction-works.md) — reconstrucción desde `sse.jsonl`
- [`how-to-start.md`](./how-to-start.md) — onboarding y primer uso del proxy
- [`health-check-handling.md`](./health-check-handling.md) — peticiones pre-sesión sin auditoría
- [README § Archivos de Auditoría](../README.md#archivos-auditoria) — resumen operativo
- [README § Configuración](../README.md#configuracion) — variables de entorno y límites
- [README § Riesgos de seguridad](../README.md#riesgos-seguridad) — API keys y contenido sensible en disco

---

## Apéndice A — Estructura anterior (referencia histórica)

Esta tabla documenta la migración desde el layout anterior. **Solo aplica a sesiones generadas antes del refactor estructural**; el layout vigente es el descrito en las secciones 3–5.

| Estructura anterior | Estructura actual | Motivo |
| ------------------- | ----------------- | ------ |
| `interactions/NNNNNN_<uuid>/` (todos los tipos) | `main-agent/interactions/NN/` (solo agentic) | Separación física por tipo; legibilidad |
| `interactions/NNNNNN_<uuid>/` (side-request/preflight) | `side-interactions/NN/` | Separación física por tipo |
| `NNNNNN_<uuid>/` (6 dígitos + UUID) | `NN/` (2 dígitos, sin UUID) | Simplicidad; los UUIDs no aportan valor de navegación |
| `request/` (top-level de interacción) | `input/` | Claridad semántica: entrada del ciclo, no petición HTTP |
| `response/` (top-level de interacción) | `output/` | Claridad semántica: salida reconstruida del ciclo completo |
| `steps/NNN/` (3 dígitos) | `steps/NN/` (2 dígitos) | Consistencia con numeración de interacciones |
| `steps/NNN/sub-interactions/NNN_<uuid>/` | `steps/YY/sub-agent-TT/` | Nombre más expresivo; índice uniforme |
| _(ausente)_ | `steps/NN/thought/` | Soporte para extended thinking |

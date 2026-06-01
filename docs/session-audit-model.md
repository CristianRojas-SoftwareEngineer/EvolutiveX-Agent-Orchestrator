# Session Audit Model — Smart Code Proxy

Referencia canónica del modelo de auditoría en `sessions/` para sesiones **nuevas** (layout `causal-workflows-v1`, fase P1). Describe el modelo de ejecución agéntico, el árbol en disco, la correlación HTTP y el mapeo a tipos TypeScript del gateway.

Para el diseño objetivo completo del gateway (incl. artefactos P2), véase [`proposals/gateway-design.md`](./proposals/gateway-design.md) §29, §30, §33 y §46.4.

---

## 0. Layout vigente: `causal-workflows-v1`

Las sesiones nuevas persisten bajo un único árbol `workflows/` por sesión. No existe `main-agent/`, `side-interactions/` ni `state.json` separado.

```text
sessions/<session-id>/
├── session-metrics.json
└── workflows/
    └── NN/
        ├── meta.json                    # identidad + estado fusionado (sin state.json)
        ├── request/body.json            # opcional al abrir el workflow
        ├── output/
        │   ├── result.json              # IWorkflowResult al completar
        │   └── result.parsed.md
        └── steps/
            └── MM/
                ├── request/body.json
                ├── response/
                │   ├── body.json
                │   ├── headers.json
                │   ├── parsed.md
                │   ├── streaming/       # P2: NNNN-chunk.ndjson por stream_chunk
                │   ├── body.coalesced.json   # P2: step coalesced (sin sse.jsonl)
                │   └── body.coalesced.parsed.md
                # Pre-P2 (retirado en P2): sse.jsonl, sse.txt vía ISseAuditWriter
                └── tools/
                    └── KK-<slug>/
                        ├── meta.json
                        ├── input.json
                        ├── result.json
                        └── sub-agent/
                            └── workflow/    # sub-workflow anidado (misma forma recursiva)
```

### Tabla EventBus → persistencia

| Evento (`TelemetryEvent.type`) | Emisor típico | Rutas escritas por `SessionPersistence` |
| ------------------------------ | ------------- | ---------------------------------------- |
| `workflow_start` | Correlador (`openWorkflow`) | `workflows/NN/meta.json`; opcional `request/body.json` |
| `workflow_spawn` | Correlador (subagente) | `…/tools/KK-slug/sub-agent/workflow/meta.json` (+ request) |
| `step_request` | Handlers L3 / correlador | `steps/MM/request/body.json` |
| `step_response` | Handlers L3 | `steps/MM/response/body.json`, `headers.json`, `parsed.md` |
| `tool_call` | Correlador | `tools/KK-slug/input.json`, `meta.json` |
| `tool_result` | Correlador / hooks | `tools/KK-slug/result.json`; actualiza `meta.json` |
| `workflow_complete` | Cierre de workflow | `output/result.json`, `output/result.parsed.md`; `meta.json` final |
| `workflow_cancel` | Timeout / cancelación | `meta.json` con `status: cancelled` |
| `stream_chunk` | `AuditSseResponseHandler` | `steps/MM/response/streaming/NNNN-chunk.ndjson`; pings filtrados; tope 10 000 chunks |
| `step_response` (con `coalescedDelegationStepIndex`) | `AuditSseResponseHandler` | además: `body.coalesced.json` + `body.coalesced.parsed.md` en el step continuation |
| `*` (wildcard) | cualquier evento | `sessions/<id>/events.ndjson` (append-only) |
| `workflow_start` / `workflow_complete` / `workflow_cancel` (kind=main) | Correlador / cierre | `sessions/<id>/workflows/workflow-sequence.json` (array) |

### Componentes de persistencia

| Componente | Capa | Rol |
| ---------- | ---- | --- |
| `IEventBus` / `EventBus` | L1 / L2 | Pub/sub in-process; correlador y handlers publican telemetría |
| `SessionPersistence` | L2 | Suscriptor que materializa el árbol en disco |
| `IWorkflowRepository` / `WorkflowRepositoryService` | L1 / L2 | Estado en memoria; emite eventos en cada mutación |
| `SseReconstructService` | L2 | Lee `streaming/*.ndjson` para reconstrucción y vistas coalesced |

Índices `NN`, `MM`, `KK` usan zero-padding a 2 dígitos (`01`, `02`, …). El slug del tool se deriva de `slugifyToolName()` en `session-routing.ts`.

---

## 1. Propósito y alcance

### Qué cubre este documento

- Modelo conceptual: sesión → workflows → steps → tools → sub-workflows.
- Layout `causal-workflows-v1` y reglas de nomenclatura.
- Clasificación HTTP (`fresh`, `continuation`, preflights, `side-request`) y su apertura como **workflow**.
- Entidades gateway (`IWorkflow`, `IStep`, `IToolUse`, `IWorkflowResult`) y artefactos en disco.
- Correlación de subagentes, tools pendientes y hooks.

### Artefactos transversales (vigentes)

| Artefacto | Ubicación | Contenido |
| --------- | --------- | --------- |
| `session-metrics.json` | Raíz de sesión | Agregados por modelo (ver [`session-metrics-system.md`](./session-metrics-system.md)) |
| `meta.json` | Workflow, tool o sub-workflow | Estado fusionado (`status`, `workflowKind`, timestamps, outcome, …) — **no** hay `state.json` |
| `output/result.json` | Workflow | `IWorkflowResult` inmutable al cierre |

**P2 (pendiente de implementación; especificado en `gateway-p2-new-artifacts`):** `events.ndjson` (raíz de sesión), `workflows/workflow-sequence.json`, `streaming/` por step, vistas coalesced sin `sse.jsonl`.

### Qué delega a otros documentos

| Tema | Documento |
| ---- | --------- |
| Métricas de sesión | [`session-metrics-system.md`](./session-metrics-system.md) |
| Reconstrucción SSE | [`how-sse-reconstruction-works.md`](./how-sse-reconstruction-works.md) |
| Peticiones sin sesión | [`health-check-handling.md`](./health-check-handling.md) |
| Variables de entorno | [README § Configuración](../README.md#configuracion) |
| Onboarding | [`how-to-start.md`](./how-to-start.md) |

---

## 2. Principio de diseño

La estructura en disco refleja la **causalidad** del flujo: cada workflow es un ciclo E2E (prompt → steps → resultado); cada step agrupa un hop de inferencia; cada tool es una invocación correlacionable; los subagentes cuelgan del tool `Agent` que los disparó.

Navegación humana típica:

```text
sessions/<id>/workflows/01/          → turno principal
  steps/01/request|response/       → primer hop HTTP
  steps/02/tools/01-Agent/         → delegación
    sub-agent/workflow/            → ciclo del subagente
```

### Semántica `input/` / `output/` frente a `request/` / `response/`

| Nivel | Directorio | Significado |
| ----- | ---------- | ----------- |
| Workflow | `request/` | Cuerpo de la petición que **abrió** el workflow (fresh / side / preflight) |
| Workflow | `output/` | Resultado del ciclo (`IWorkflowResult`), no la respuesta HTTP cruda del último hop |
| Step | `request/` | Petición HTTP a Anthropic en ese step |
| Step | `response/` | Respuesta HTTP (o artefactos derivados: `parsed.md`, `sse.jsonl`) |

No hay `response/` en la raíz del workflow: la respuesta HTTP vive bajo `steps/MM/response/`.

---

## 3. Vista general

### 3.1 Diagrama de ejecución (agentic)

```text
Sesión
└─ Workflow principal (kind: main)
   ├─ request/body.json              → prompt inicial (fresh)
   ├─ steps/01/                      → compute
   ├─ steps/02/
   │  └─ tools/01-Agent/
   │     └─ sub-agent/workflow/      → sub-workflow (kind: subagent)
   │        ├─ steps/01/ …
   │        └─ output/result.json
   ├─ steps/03/                      → continuation (tool_result)
   └─ output/result.json             → cierre E2E
```

Preflights (`client-preflight`) y `side-request` son **workflows hermanos** bajo `workflows/NN/` (índice propio), no un árbol `side-interactions/` paralelo. El tipo semántico queda en `meta.json` / metadatos wire (`interactionType`).

### 3.2 Flujo de persistencia (P1)

```mermaid
flowchart LR
  L3[Handlers L3] -->|publish| Bus[EventBus]
  Corr[IWorkflowRepository] -->|publish| Bus
  Bus --> SP[SessionPersistence]
  SP --> Disk["workflows/NN/…"]
  SSE[audit-sse-response] -->|ISseAuditWriter| Disk
```

---

## 4. Protocolo HTTP y clasificación

La clasificación la realiza `RequestClassifierService` (dominio); `AuditInteractionHandler` abre o continúa workflows en `IWorkflowRepository` y publica eventos.

| Clasificación | Comportamiento resumido | Workflow en disco |
| ------------- | ------------------------ | ----------------- |
| `fresh` | Nuevo turno con `tools` no vacíos | Nuevo `workflows/NN/`, `kind: main` |
| `continuation` | `tool_result` hacia workflow activo | Mismo workflow; nuevo step o coalescing Agent |
| `preflight-quota` / `preflight-warmup` | `max_tokens:1` o warm-up | Nuevo workflow; cierra al responder |
| `side-request` | `tools: []` (p. ej. `count_tokens`) | Nuevo workflow; no desplaza el main activo |

**Sin sesión:** si `sessionId === '_unknown'`, el handler retorna sin escribir disco ([`health-check-handling.md`](./health-check-handling.md)).

### 4.1 Correlación de subagentes

- **Plano A (cabeceras):** `X-Claude-Code-Agent-Id` / `X-Claude-Code-Parent-Agent-Id` → correlación determinista (`correlationMethod: 'agent-headers'`).
- **Plano B (FIFO):** fallback cuando faltan cabeceras y hay varios `Agent` pendientes.
- **Plano C (hooks):** `POST /hooks`, evento `SubagentStart` → `confirmSubagentFromHook` en el correlador.

Los pendientes viven en `IToolUse` del workflow padre, no en `ActiveInteraction`.

### 4.2 Continuaciones y coalescing

- Continuaciones no coalesced: nuevo step bajo el mismo workflow.
- Continuaciones Agent coalesced: enriquecen el `response` del step que emitió el subagente (lógica en `audit-sse-response` + `gateway-wire-step`).
- WebSearch / WebFetch internos: steps adicionales bajo el workflow padre cuando hay pending correlacionado.

---

## 5. Tipos de interacción (semántica → workflow)

Los nombres `agentic`, `client-preflight` y `side-request` se conservan como **`interactionType`** en metadatos wire para compatibilidad con métricas y clasificación. En disco, todos son carpetas `workflows/NN/`.

| `interactionType` | Origen típico | Cierre del workflow |
| ----------------- | ------------- | ------------------- |
| `agentic` | Fresh + continuations | Hook de cierre / `workflow_complete` con `IWorkflowResult` |
| `client-preflight` | Quota o warm-up | Al recibir respuesta (inmediato) |
| `side-request` | `tools: []` | Respuesta terminal; workflow independiente del main |

`WorkflowKind` en tipos gateway: `main` | `subagent` (sub-workflows bajo `sub-agent/workflow/`).

---

## 6. Sesión e identificadores

Resolución de `sessionId` (prioridad):

1. `x-cc-audit-session`
2. `x-claude-code-session-id`
3. Ausente → `_unknown` (sin auditoría)

Cada workflow recibe `layoutIndex` (entero para `NN`) y `requestSequence` (contador lógico en el correlador). **P2:** índice global `workflow-sequence.json` en disco.

Al arranque, el proxy puede eliminar sesiones con layout flat legacy (**corte limpio** P1); no hay migración de datos en reposo.

---

## 7. Entidades y tipos TypeScript

| Concepto | Tipo / interfaz | Artefacto principal |
| -------- | --------------- | ------------------- |
| Workflow | `IWorkflow` | `workflows/NN/meta.json`, `output/result.json` |
| Step | `IStep` | `steps/MM/request|response/` |
| Tool use | `IToolUse` | `tools/KK-slug/input.json`, `result.json` |
| Resultado E2E | `IWorkflowResult` | `output/result.json` |
| Sesión (agregado) | `Session` (dominio) | `session-metrics.json` |

### `IWorkflowResult` (campos clave)

- `outcome`, `finalText?`, `usage?`, `stepCount`, `closedByEvent`, `sessionId`
- Construido en cierre vía `buildWorkflowResult()`; proyectado por `SessionPersistence` en `workflow_complete`

### Tipos legacy (`@deprecated-p2`)

`InteractionMetadata`, `InteractionState`, `StepMeta`, `InteractionType` y relacionados en `audit.types.ts` permanecen para el shim SSE y campos wire transitorios. **No** representan el modelo en memoria activo (sustituido por `IWorkflow` / `IStep` / `IToolUse`).

---

## 8. Persistencia y handlers

### Regla P1

Los handlers de capa 3 **no** llaman `fs.write*` para el árbol causal salvo:

- `AuditSseResponseHandler` → `ISseAuditWriter` (SSE hasta P2)
- Utilidades de arranque en composition root (`ensureAuditSessionsRoot`, corte limpio)

Todo lo demás: `eventBus.publish(...)` → `SessionPersistence`.

### Handlers relevantes

| Handler | Rol |
| ------- | --- |
| `AuditInteractionHandler` | Clasificación, apertura/continuación de workflows, wire steps |
| `AuditSseResponseHandler` | Stream SSE + reconstrucción; publica `step_response` / cierre |
| `AuditStandardResponseHandler` | Respuestas no-SSE |
| `AuditWorkflowClosureHandler` | Coordinación de cierre + métricas; delega proyección al bus |
| `AuditUpstreamErrorHandler` | Errores upstream |

### Cierre de workflow

1. Hook o condición terminal dispara `IWorkflowRepository.close()`.
2. Se emite `workflow_complete` con `IWorkflowResult`.
3. `SessionPersistence` escribe `output/result.json` y actualiza `meta.json`.
4. `SessionMetricsService` actualiza `session-metrics.json`.

---

## Apéndice A — Layout flat histórico (pre-P1)

> **No generado** en sesiones nuevas tras el corte limpio P1. Conservado solo para leer capturas antiguas o entender documentación histórica.

```text
sessions/<session-id>/
  session-metrics.json
  main-agent/interactions/NN/     # agentic
    meta.json, state.json       # state.json eliminado al cerrar
    input/, output/, steps/YY/
  side-interactions/MM/         # preflight + side-request
    interaction-sequence.json   # contadores separados
```

| Árbol legacy | Tipo semántico |
| ------------ | -------------- |
| `main-agent/interactions/` | `agentic` |
| `side-interactions/` | `client-preflight`, `side-request` |

En memoria, el modelo legacy usaba `ActiveInteraction` → `InteractionMetadata` en `meta.json` al cerrar, con `WorkflowResultProjector` proyectando `IWorkflowResult` al shape flat. P1 retiró `ISessionStore`, `IAuditWriter` y el projector; la proyección causal es exclusiva de `SessionPersistence`.

### Equivalencias aproximadas

| Legacy | Causal P1 |
| ------ | --------- |
| `main-agent/interactions/NN/` | `workflows/NN/` (`kind: main`) |
| `side-interactions/MM/` | `workflows/NN/` (otro índice; mismo árbol) |
| `steps/YY/sub-agent-01/` | `steps/MM/tools/KK-Agent/sub-agent/workflow/` |
| `state.json` | Estado en `meta.json` (`status: running` hasta cierre) |
| `interaction-sequence.json` | Secuencia en correlador; **P2:** `workflow-sequence.json` en disco |

---

## Referencias cruzadas

- Diseño gateway: [`proposals/gateway-design.md`](./proposals/gateway-design.md)
- OpenSpec: `openspec/specs/session-persistence/`, `event-bus/`, `session-routing/`, `gateway-audit-projection/`

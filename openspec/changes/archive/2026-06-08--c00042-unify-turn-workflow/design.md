## Context

El modelo documentado en [`docs/session-audit-model.md`](../../../docs/session-audit-model.md) §2 define un **workflow como ciclo E2E**: desde que el usuario (o agente) envía un prompt hasta que finaliza el loop agéntico con el hook `Stop` o `StopFailure`. Ese principio es coherente con la navegación humana esperada (`workflows/01/` = un turno completo con todos sus hops).

La implementación actual **desvía** de ese principio por acumulación de decisiones incrementales:

1. **`session-shell`** (`workflows/00`): abierto por `UserPromptSubmit`, cerrado por `Stop`, sin steps HTTP (`interactionType: session-shell`).
2. **`side-request`** (`workflows/01`): cada petición `tools: []` abre un workflow hermano vía `openWireWorkflow(..., forceNew: true)`.
3. **`agentic`** (`workflows/02`): cada `fresh` abre otro workflow hermano; `end_turn` en SSE cierra el wire con `closeWireWorkflowOnTerminalStop`, no el shell.

Evidencia: sesión `24b95025-9ef8-40c2-bf6d-13174c8f013f` — un único turno del harness nativo produce **tres** entradas en `workflow-sequence.json` y tres carpetas `workflows/NN/`.

```text
Estado actual (1 turno de usuario)
──────────────────────────────────
UserPromptSubmit ──► workflows/00  session-shell  (0 steps, sin finalText)
side-request HTTP  ──► workflows/01  side-request   (1 step, cierra al responder)
fresh agentic HTTP ──► workflows/02  agentic        (N steps, cierra en end_turn)
Stop hook          ──► cierra workflows/00
```

El usuario observa **un** turno; el proxy persiste **tres** workflows. La exploración concluyó que fusionar en un único workflow por turno es semánticamente correcto y alinea código con documentación, con refactor medio-grande en correlación y cierre.

### Drift de numeración (workflows y steps)

[`docs/session-audit-model.md`](../../../docs/session-audit-model.md) §0 documenta índices `NN`, `MM`, `KK` como `01`, `02`, … (enumeración **humana**, base 1). La implementación y el spec `session-routing` usan hoy contadores **base 0** que se pasan directamente a `pad()`:

| Capa | Comportamiento actual | Primer elemento en disco |
| ---- | --------------------- | ------------------------ |
| `WorkflowRepositoryService.allocLayoutIndex` | `next ?? 0`, luego incrementa | `layoutIndex: 0` |
| `SessionPersistence.allocWorkflowIndex` | contador independiente, mismo patrón | `workflows/00/` |
| `registerWireStepRequest` | `IStep.index = workflow.steps.length` | `steps/00/` |
| `workflow-sequence.json` | `workflowIndex` del evento sin offset | `workflowIndex: 0` |
| `audit-workflow.handler.workflowDirAbs` | `layoutIndex + 1` solo para rutas del handler | **inconsistente** con persistencia |

Hay **dos contadores de workflow por sesión** (`layoutIndices` en el repositorio y `nextWorkflowIndex` en persistencia) que solo coinciden cuando el evento `workflow_start` incluye `layoutIndex` del correlador. Los steps mezclan convenciones: `registerWireStepRequest` ignora el parámetro `stepIndex` y asigna índice 0-based, mientras `handleContinuation` / internal tools calculan `steps.length + 1` para `assignedStepIndex` en el resultado de auditoría.

**Objetivo de este change:** unificar en **índices de display base 1** en disco, eventos, dominio (`IStep.index`, `layoutIndex`) y `workflow-sequence.json`, eliminando el `+ 1` ad hoc de `workflowDirAbs`.

---

## Goals / Non-Goals

**Goals:**

- Un workflow por turno de usuario: apertura en `UserPromptSubmit`, cierre en `Stop` / `StopFailure`.
- Todos los hops HTTP del turno (agentic fresh, continuation, side-request) como **steps** bajo ese workflow.
- `interactionType` semántico en el **step** (`agentic`, `side-request`, …); el workflow del turno tiene `interactionType: agentic` y `workflowKind: main`.
- `IWorkflowResult` único por turno con `finalText`, `stepCount` agregado y `usage` consolidado.
- `workflow-sequence.json` con **una** entrada por turno (`workflowIndex` base 1, alineado con carpeta `workflows/01/`).
- Numeración en disco **desde `01`** para workflows, steps y tools (`NN`, `MM`, `KK`), coherente con la documentación canónica — **incluidos** los árboles bajo `tools/…/sub-agent/workflow/`.
- Eliminar el tipo de workflow `session-shell` del modelo activo.
- **Paridad de layout** entre workflow de turno principal y sub-workflow de subagente: misma forma `causal-workflows-v1` (`meta.json`, `request/`, `steps/MM/`, `output/result.json`), mismas reglas de numeración y de step vs workflow.
- Exclusión documentada de preflights del árbol `sessions/` (el proxy **sigue reenviando** a Anthropic; solo la capa de auditoría causal no persiste — ver R9).

**Non-Goals:**

- Promover sub-workflows al nivel `sessions/<id>/workflows/NN/` (siguen anidados bajo el tool `Agent` que los disparó; la ubicación en el árbol es la única diferencia estructural frente al main).
- Migrar sesiones ya persistidas con el layout de tres workflows por turno.
- Reescribir `RequestClassifierService` ni la heurística de clasificación HTTP.
- Auditar ni modelar en disco las peticiones `client-preflight` (`preflight-quota`, `preflight-warmup`): se ignoran de forma consciente (ver R9, D7). Sin roadmap v2 para reincorporarlas.
- Cambiar el contrato wire del proxy hacia Anthropic.

---

## Modelo objetivo

```text
Modelo fusionado (1 turno de usuario)
─────────────────────────────────────
UserPromptSubmit ──► workflows/01  agentic/main  (turno abierto, 0 steps)
  │
  ├─ side-request HTTP  ──► steps/01  (stepKind: side-request)
  ├─ fresh agentic HTTP ──► steps/02  (stepKind: agentic) + request/body.json del workflow
  ├─ continuation HTTP  ──► steps/03… (stepKind: agentic)
  └─ …
Stop hook          ──► workflows/01  workflow_complete + output/result.json
```

```text
Sesión (multi-turno)
└─ workflows/01/   ← turno 1 (UserPromptSubmit₁ → Stop₁)
   ├─ steps/01/ side-request
   ├─ steps/02/ agentic (fresh)
   └─ steps/03/ agentic (continuation)
└─ workflows/02/   ← turno 2 (UserPromptSubmit₂ → Stop₂)
   └─ steps/01/ …
```

### Paridad main / sub-workflow

Un sub-workflow **no es un layout distinto**: es el mismo ciclo E2E (`prompt → steps → output/result.json`) materializado por el subagente. La documentación canónica ya lo define como forma recursiva (`session-audit-model.md` §0: `sub-agent/workflow/` con la misma estructura).

```text
Workflow principal (turno)
└─ steps/02/tools/01-Agent/
   └─ sub-agent/workflow/              ← mismo layout que workflows/NN/
      ├─ meta.json                     workflowKind: subagent
      ├─ request/body.json
      ├─ steps/01/ … steps/NN/
      └─ output/result.json
```

| Aspecto | Workflow de turno (main) | Sub-workflow (subagente) |
| ------- | ------------------------ | ------------------------ |
| Forma en disco | `causal-workflows-v1` | **Idéntica** (recursiva) |
| Numeración steps/tools | Base 1 (`01`, `02`, …) | **Idéntica** dentro de su árbol |
| Delimitación E2E | `UserPromptSubmit` → `Stop` | `SubagentStart` / apertura wire → `SubagentStop` |
| Anclaje en sesión | `workflows/NN/` | `…/tools/KK-Agent/sub-agent/workflow/` |
| `workflow-sequence.json` | Sí (un registro por turno) | No (spawn vía `workflow_spawn`) |
| `interactionType` | `agentic` | `agentic` (es inferencia agéntica del subagente) |

Este change aplica las reglas de fusión y numeración (R2, R4, R10) **también** al sub-workflow: hops HTTP del subagente son steps bajo su workflow anidado; el cierre E2E lo marca `SubagentStop`, no `end_turn` en SSE.

---

## Reglas formales

### R1 — Delimitación del turno (workflow)

| Evento | Acción |
| ------ | ------ |
| `UserPromptSubmit` | Abrir workflow de turno: `id === sessionId`, `layoutIndex` siguiente, `interactionType: agentic`, `workflowKind: main`. Sin step HTTP aún. |
| `Stop` / `StopFailure` | Cerrar el workflow de turno abierto (`getWorkflowBySessionId`). Emitir `workflow_complete` con `IWorkflowResult`. |
| Segundo `UserPromptSubmit` con turno previo aún abierto | **Error de invariante** o cierre forzado del turno huérfano (ver R8). |

El workflow de turno **no** se cierra por `end_turn` en SSE.

### R2 — Clasificación HTTP → step, no → workflow hermano

Cuando existe un workflow de turno **abierto** (`status: running`, `id === sessionId`):

| Clasificación HTTP | Comportamiento |
| ------------------ | -------------- |
| `side-request` | Nuevo step bajo el turno. `stepKind: side-request`. Cierra el step al recibir respuesta terminal. **No** abre `workflows/NN+1`. |
| `fresh` (agentic) | Nuevo step bajo el turno. `stepKind: agentic`. Si es el primer hop agentic del turno, además materializa `workflows/NN/request/body.json`. |
| `continuation` | Nuevo step bajo el **mismo** workflow padre (regla actual de correlación por `toolUseId`; sin cambio de principio). |
| WebSearch / WebFetch interno | Step adicional bajo el workflow padre (precedente existente; sin cambio de principio). |

### R3 — `stepKind` en `IStep`

Nuevo campo opcional en dominio y proyección a disco (`meta.json` del step o campo en evento `step_request`):

```typescript
type StepKind = 'agentic' | 'side-request';
```

- `agentic`: hop de inferencia con `tools` no vacío o continuation.
- `side-request`: hop auxiliar `tools: []` (p. ej. `count_tokens`, session naming).

Las peticiones `client-preflight` no generan `stepKind` ni entradas en el árbol causal (R9).

`interactionType` en wire meta del **workflow** queda fijado en `agentic` para turnos principales. La semántica fina vive en `stepKind`.

### R4 — Cierre de step vs cierre de workflow

| Señal | Cierra step | Cierra workflow de turno |
| ----- | ----------- | ------------------------ |
| Respuesta HTTP terminal de side-request | Sí (step actual) | No |
| SSE `stop_reason: tool_use` | Sí (step actual) | No |
| SSE `stop_reason: end_turn` | Sí (step actual) | **No** (cambio respecto a hoy) |
| Hook `Stop` / `StopFailure` | — | Sí |

**Consecuencia:** `closeWireWorkflowOnTerminalStop` deja de invocar `forceClose` sobre el workflow de turno. Solo enriquece y cierra el step; el workflow permanece `running` hasta el hook.

### R5 — `IWorkflowResult` del turno

Construido en cierre por hook (`buildWorkflowResult`):

- `stepCount`: steps con `closedAt` del turno (incluye side-request y agentic).
- `finalText`: passthrough de `last_assistant_message` del hook `Stop` / `StopFailure` (`deriveFinalText`); si el hook no lo incluye → `undefined` (sin fallback desde steps; ver D10 y `gateway-architecture.md` §9.7).
- `usage`: agregación de todos los steps billables del turno.
- `closedByEvent`: evento hook (`Stop` / `StopFailure`).

Se **revierte** la regla D3 de `fix-proxy-audit-telemetry-gaps` que omitía `finalText` en el shell: ya no hay shell separado; hay un único resultado E2E.

### R6 — Identificadores y layout

| Concepto | Regla |
| -------- | ----- |
| `workflowId` del turno | `sessionId` (sin sufijo `-wire-N`) |
| `layoutIndex` | Uno por turno; **base 1**; incrementa en cada `UserPromptSubmit` |
| Carpeta workflow | `workflows/${pad(layoutIndex)}/` → primer turno = `workflows/01/` |
| Steps `MM` | Secuencia global **base 1** dentro del turno (side-request y agentic comparten numeración) |
| Tools `KK` | Secuencia **base 1** dentro del step (`01-Read`, `02-Agent`, …) |
| `workflow-sequence.json` | Una fila por turno; `workflowIndex` = `layoutIndex` (base 1) |

### R10 — Numeración base 1 en disco y dominio

| Regla | Detalle |
| ----- | ------- |
| R10.1 | Los segmentos de ruta `NN`, `MM`, `KK` SHALL ser **índices de display base 1** con zero-padding a 2 dígitos (`01`…`99`, `100` sin padding extra). |
| R10.2 | `layoutIndex`, `IStep.index`, `toolIndex` en eventos y memoria usan la **misma** convención que el disco (no hay offset oculto en `session-routing`). |
| R10.3 | El **primer** workflow de una sesión SHALL materializarse en `workflows/01/`, no `workflows/00/`. |
| R10.4 | El **primer** step de un workflow SHALL materializarse en `steps/01/`, no `steps/00/`. |
| R10.5 | Un único contador de workflow por sesión: el correlador es dueño (`allocLayoutIndex`); persistencia **no** mantiene contador paralelo salvo fallback defensivo que debe inicializarse en `1` y resincronizarse. |
| R10.6 | Sub-workflows usan la **misma** convención de layout y numeración base 1; el ámbito es el directorio `sub-agent/workflow/` (steps `01`…, tools `01`…). No existe un esquema alternativo para subagentes. |
| R10.8 | El correlador y `SessionPersistence` proyectan sub-workflows con los mismos tipos de evento (`step_request`, `step_response`, `workflow_complete`, …) que un workflow main; solo cambian `workflow_spawn` como apertura y la ruta base bajo el tool padre. |
| R10.7 | Las peticiones `client-preflight` **no** consumen `layoutIndex` ni crean `workflows/NN/`; el primer turno de usuario SHALL ocupar siempre `workflows/01/` (R10.3). |

### R7 — Side-request sin turno activo

Si llega un `side-request` **antes** de `UserPromptSubmit` (p. ej. session naming al arrancar sesión):

**Decisión preferida:** abrir workflow de turno implícito con el primer side-request (equivalente a lazy open), marcado `interactionType: agentic`, y cerrarlo cuando no haya actividad agentic pendiente **o** al siguiente `UserPromptSubmit` que confirme el turno.

**Alternativa descartada:** workflow hermano standalone para side-request huérfano — perpetúa el problema de fragmentación.

### R8 — Invariantes y recuperación

- Como máximo **un** workflow de turno `running` por `sessionId` con `id === sessionId`.
- Si `fresh` llega sin turno abierto: abrir turno (lazy) antes de registrar el step — mismo tratamiento que R7.
- `closeOrphanWorkflows` (hoy en `handleFresh`) debe reinterpretarse: cerrar workflows `-wire-N` legacy si quedan huérfanos tras el refactor, no el turno activo.

### R9 — Preflights (`client-preflight`): fuera del árbol causal

Las clasificaciones `preflight-quota` y `preflight-warmup` (`RequestClassifierService`) **siguen existiendo** para clasificar el tráfico, pero `AuditWorkflowHandler` SHALL **no** abrir workflow, step ni escribir bajo `sessions/` para ellas.

#### Aclaración: proxy activo vs capa de auditoría

**No** significa que el proxy deje de atender preflights. El flujo es:

```text
Preflight HTTP
  → RequestClassifier: preflight-quota | preflight-warmup
  → AuditWorkflowHandler.execute(): return null   ← sin correlador ni disco
  → Proxy upstream: reenvío normal a Anthropic    ← el cliente recibe respuesta
```

Es el mismo patrón que `sessionId === '_unknown'`: **omitir la proyección causal**, no interrumpir el wire. La petición se proxifica; solo no genera `workflows/`, `events.ndjson` ni métricas de sesión para ese hop.

| Regla | Detalle |
| ----- | ------- |
| R9.1 | Tras clasificar preflight, `execute()` retorna `null`; el orquestador del proxy continúa el reenvío upstream sin abrir correlador. |
| R9.2 | No se emite `workflow_start`, `step_request` ni ningún evento que `SessionPersistence` materialice en `sessions/`. |
| R9.3 | Decisión consciente de **exclusión del modelo de turnos** (sin `stepKind: client-preflight` ni roadmap v2 en este change). Documentar en specs y `session-audit-model.md`. |
| R9.4 | Eliminar `handlePreflightQuota` / `handlePreflightWarmup` y las ramas que invocaban `openWireWorkflow(..., 'client-preflight')`. |

**Rationale:** Los preflights (quota `max_tokens:1`, warm-up) no pertenecen al ciclo E2E usuario → agente → `Stop`. Persistirlos como workflows hermanos fragmentaba `workflows/NN/` y competía con la numeración del primer turno. Excluirlos del árbol causal simplifica el modelo sin afectar el comportamiento del proxy hacia Anthropic.

### R11 — Serialización de mutaciones HTTP por sesión

Toda mutación del correlador disparada desde `AuditWorkflowHandler` (apertura de step, registro de request, side-request, fresh, continuation) SHALL ejecutarse bajo `withSessionLock(sessionId)` para evitar carreras de índice cuando side-request y agentic SSE coinciden en el tiempo (evidencia: sesión `24b95025`, Δ 24 ms entre side-request y fresh).

---

## Decisions

### D1 — Un workflow por turno (fusión shell + agentic)

**Decisión:** `UserPromptSubmit` abre el workflow E2E del turno (`interactionType: agentic`). Se elimina `session-shell` como `WorkflowRequestKind` y como `interactionType` en meta.

**Rationale:** Alinea implementación con §2 de `session-audit-model.md` y con la vista del usuario. El hook ya delimitaba el ciclo; el shell era un contenedor vacío duplicado.

**Alternativa descartada:** Renumerar para que agentic sea siempre `workflows/00` manteniendo shell oculto — no resuelve la fragmentación ni el doble cierre.

### D2 — Side-request como step (no workflow hermano)

**Decisión:** `handleSideRequest` registra step en el turno activo vía `registerWireStepRequest` + cierre de step en respuesta, sin `openWireWorkflow(..., forceNew: true)`.

**Rationale:** WebSearch/WebFetch ya añaden steps al workflow padre; side-request es el mismo patrón causal.

### D3 — `end_turn` cierra step, no workflow

**Decisión:** Modificar `closeWireWorkflowOnTerminalStop` para que los workflows E2E de ciclo completo (turno main **y** sub-workflow subagente) solo cierren el step en SSE terminal y **no** llamen `forceClose`. El cierre del workflow queda para el hook de ciclo (`Stop` / `SubagentStop`).

**Rationale:** El cierre E2E pertenece al harness, no al último hop HTTP — misma regla para agente principal y subagente (D9).

### D4 — `fresh` adjunta al turno activo

**Decisión:** `handleFresh` deja de llamar `openWireWorkflow`; busca turno activo (`getWorkflowBySessionId`) y abre el primer step agentic. Materializa `request/body.json` del workflow en ese momento.

**Rationale:** El prompt del usuario vive en el body del fresh; es el `request/` canónico del ciclo E2E.

### D5 — `stepKind` en dominio y EventBus

**Decisión:** Extender `IStep` y el payload de `step_request` con `stepKind`. `SessionPersistence` lo persiste en meta del step.

**Rationale:** Sin `stepKind`, un auditor no puede distinguir side-request de agentic dentro del mismo workflow.

### D6 — Lazy open para side-request pre-prompt (confirmado)

**Decisión:** Si no hay turno abierto, el primer side-request o fresh abre el turno (R7). Si `UserPromptSubmit` llega después, `openWorkflow` sin `forceNew` reutiliza el mismo turno (idempotente).

**Evidencia:** Sesión `24b95025` — `UserPromptSubmit` (shell `01:51:27.886`) precede al fresh (`01:51:34.483`) en el camino feliz; lazy open cubre además session naming pre-hook y hooks caídos.

**Rationale:** El orden hook → HTTP es lo habitual pero no está garantizado por el protocolo.

### D7 — Preflights fuera del árbol causal (sin v2)

**Decisión:** Las peticiones `preflight-quota` y `preflight-warmup` no se proyectan al árbol `sessions/` (sin workflow, step ni eventos de persistencia). `AuditWorkflowHandler` retorna `null`; el **reenvío upstream del proxy no cambia**. No se planifica reincorporación en un change posterior (R9.3).

**Rationale:** Decisión consciente y documentada; evita arrastrar deuda a v2 y garantiza que `workflows/01` sea siempre el primer **turno** de usuario (R10.7).

**Alternativa descartada:** Workflow hermano efímero (comportamiento actual) — fragmenta numeración y `workflow-sequence.json`.

**Alternativa descartada:** Diferir diseño a v2 como steps o workflows efímeros — crea expectativa de implementación que el producto no requiere.

### D10 — `finalText` solo desde hook (sin fallback desde steps)

**Decisión:** `buildWorkflowResult` usa únicamente `deriveFinalText(hook)` (`last_assistant_message`). Si el hook no lo trae → `undefined`. No reconstruir desde `Step.assistantMessage` ni desde el último hop `end_turn`.

**Rationale:** Política normativa `gateway-architecture.md` §9.7. Si el último hop fue `tool_use`, el turno aún no ha terminado; `Stop` llega tras el mensaje final al usuario y el orquestador popula `last_assistant_message`. Detalle forense en `steps/MM/response/`.

**Alternativa descartada:** Fallback al último step `end_turn` — anti-patrón §9.7; duplica fuentes de verdad.

### D11 — `withSessionLock` en ingress HTTP del handler

**Decisión:** Envolver las ramas mutantes de `AuditWorkflowHandler.execute` (side-request, fresh, continuation, internal tools) en `workflowRepo.withSessionLock(auditSessionId, …)`.

**Rationale:** Tras fusionar side-request y agentic en un turno, la asignación de `IStep.index` debe ser secuencial. Evidencia de solapamiento en `24b95025`.

### D12 — Mantener `interactionType: agentic` en workflow (no renombrar a `turn`)

**Decisión:** El workflow de turno conserva `interactionType: agentic` y `workflowKind: main`. La distinción hop a hop queda en `stepKind` (`agentic` | `side-request`).

**Rationale:** Compatibilidad con specs, tipos y consumidores existentes; `agentic` sigue siendo semánticamente correcto para el contenedor del loop agéntico.

### D8 — Índices de display base 1 (workflows, steps, tools)

**Decisión:** Adoptar índices **base 1** de extremo a extremo. Los allocators arrancan en `1`. `session-routing.ts` formatea el entero recibido sin sumar ni restar. `IStep.index` y `layoutIndex` en wire meta coinciden con la carpeta en disco. Aplica al árbol de sesión **y** a cada `sub-agent/workflow/` anidado.

**Cambios concretos:**

1. **`allocLayoutIndex` / `allocWorkflowIndex`:** `const next = map.get(sessionId) ?? 1` (o pre-incremento equivalente); primer valor emitido = `1`.
2. **`session-routing.ts`:** sin cambio de firma; `getWorkflowDir(id, 1)` → `workflows/01/`. Actualizar spec y tests que hoy pasan `0` esperando `00`.
3. **`registerWireStepRequest`:** `index: workflow.steps.length + 1` (o helper `nextStepIndex(workflow)`); el parámetro `stepIndex` del método se elimina o se valida contra el calculado.
4. **`workflowDirAbs`:** reemplazar por `getWorkflowDir` / `path.join(auditBaseDir, getWorkflowDir(...))` **sin** `layoutIndex + 1`.
5. **`resolveOpenWireStepIndex`:** fallback coherente con índices base 1.
6. **`stepIndexForToolUse`:** dejar de sumar `+ 1` si `IStep.index` ya es base 1.
7. **`SessionPersistence`:** retirar `nextWorkflowIndex` duplicado o sincronizarlo solo como fallback inicializado en `1` tras `workflow_start` con `layoutIndex` explícito.
8. **`workflow-sequence.json`:** `workflowIndex: 1` para el primer turno.

**Rationale:** Alinea implementación con `session-audit-model.md` §0 y con la expectativa del usuario (`workflows/01` = primer turno). Elimina el drift handler (+1) vs persistencia (sin +1).

**Alternativa descartada:** Mantener memoria 0-based y sumar `+ 1` solo en `pad()` — oculta el contrato y ya falló (`workflowDirAbs` vs persistencia).

**Alternativa descartada:** Renumerar solo en el modelo fusionado sin tocar allocators — perpetúa `steps/00` y el doble contador.

### D9 — Paridad de layout main / sub-workflow

**Decisión:** Los sub-workflows de subagente SHALL seguir el mismo contrato de layout `causal-workflows-v1` y las mismas reglas de este change (steps como hops HTTP, cierre E2E por hook de ciclo, numeración base 1 de D8). La única excepción estructural es el **anclaje** bajo `tools/KK-Agent/sub-agent/workflow/` y la **no inclusión** en `workflow-sequence.json` de sesión.

**Rationale:** Un subagente es un agente con el mismo proceso de inferencia; diferenciar el esquema de persistencia introduciría deuda y contradice `session-audit-model.md` §0 («misma forma recursiva»). La redacción anterior en Non-Goals («no cambiar layout de sub-workflows») era incorrecta: no significa excluirlos del refactor, sino no **reubicarlos** al árbol `workflows/NN/` de sesión.

**Implicaciones en código:**

- `closeWireWorkflowOnTerminalStop`: turno main (`id === sessionId`) y sub-workflow (`kind === 'subagent'`) con la **misma** semántica (SSE cierra step; hook cierra workflow — `Stop` vs `SubagentStop`).
- `openSubagentWorkflow` / `handleSubagent`: adjuntar hops al sub-workflow activo (no crear workflows hermanos `-wire-N` en sesión).
- D8 aplica a `steps/` y `tools/` dentro de `sub-agent/workflow/`.
- Tests de regresión con subagente general-purpose: un solo árbol anidado, steps `01`…, cierre en `SubagentStop`.

**Alternativa descartada:** Mantener sub-workflows como mini-workflows wire `-wire-N` en el árbol de sesión — rompe causalidad y anidamiento bajo el tool `Agent`.

---

## Impacto en código (mapa de cambios)

| Área | Archivo(s) | Cambio principal |
| ---- | ---------- | ---------------- |
| Apertura turno | `audit-hook-event.handler.ts` | `UserPromptSubmit` → `openWorkflow` con `interactionType: agentic` (no `session-shell`) |
| Clasificación HTTP | `audit-workflow.handler.ts` | `handleSideRequest`, `handleFresh` → adjuntar steps al turno; `withSessionLock`; preflights → `return null` (R9); eliminar `handlePreflight*` |
| Cierre wire | `gateway-wire-step.util.ts` | `closeWireWorkflowOnTerminalStop`: turno main y sub-workflow con misma regla (step en SSE, workflow en hook) |
| Subagente | `audit-workflow.handler.ts`, `audit-hook-event.handler.ts` | Hops bajo `sub-agent/workflow/`; cierre en `SubagentStop`; paridad layout con main |
| Dominio | `IStep.ts`, `audit.types.ts` | `stepKind`; retirar `session-shell` del union |
| Resultado E2E | `build-workflow-result.ts` | `finalText` vía hook (D10); quitar omisión por session-shell; `stepCount` = todos los steps cerrados |
| Repositorio | `workflow-repository.service.ts` | `openWorkflow` sin reutilizar `sessionId` para wire forzado; posible `getActiveTurnWorkflow` |
| Métricas | `is-step-billable-for-session-metrics.ts`, `session-metrics.service.ts` | Side-request como step billable/no según reglas actuales |
| Persistencia | `session-persistence.service.ts` | Proyección `stepKind`; `workflow-sequence.json` una fila por turno; contador workflow unificado base 1 |
| Routing | `session-routing.ts` | Sin offset en `pad()`; contrato 1-based documentado en firma JSDoc |
| Tests | `session-routing.test.ts`, `audit-workflow.handler.test.ts`, `gateway-wire-step.util.test.ts`, `audit-hook-event.handler.test.ts`, `session-persistence.test.ts` | Rutas `01/`; escenarios multi-hop con side-request intercalado |
| OpenSpec | `openspec/specs/session-routing/spec.md` (delta) | Escenarios `getWorkflowDir('sess', 1)` → `workflows/01/` |
| Docs | `docs/session-audit-model.md` §3.1, §4, §5 | Tabla de clasificación, base 1, preflights excluidos del árbol causal (R9) |

---

## Risks / Trade-offs

| Riesgo | Mitigación |
| ------ | ---------- |
| Consumidores que filtran `interactionType === 'side-request'` a nivel workflow | Documentar migración a `stepKind`; período de compatibilidad en queries de statusline |
| `getWorkflowBySessionId` asumía shell vacío mientras wire corría | Tras fusión, es el workflow con steps activos; revisar todos los call sites (SSE, upstream error) |
| Carrera side-request + agentic SSE (mismo turno) | D11: `withSessionLock` en `AuditWorkflowHandler` |
| Carrera entre side-request y `UserPromptSubmit` | Lazy open idempotente (D6); lock de D11 serializa HTTP |
| Sin trazabilidad de preflights en `sessions/` | Aceptado por diseño (R9): no hay carpeta ni eventos; el proxy **sigue reenviando** a Anthropic. Documentar en `session-audit-model.md` |
| `stepCount` incluye side-request → cambia métricas históricas | Aceptable: refleja hops reales; documentar en changelog |
| Continuation sin padre sigue creando orphan wire | Mantener path orphan actual pero marcar `continuationOrphan`; no mezclar con turno |
| Subagentes: doble estándar (layout distinto al main) | D9 unifica reglas; solo difiere anclaje y hook de cierre (`SubagentStop`) |
| Regresión en subagentes general-purpose | Tests E2E anidados con steps base 1 y un único `output/result.json` por sub-workflow |
| Sesiones en disco con `workflows/00` | Sin migración; herramientas de lectura deben aceptar layout legacy 0-based |
| Tests y comandos (`analyze-session`) que asumen `workflows/01` = agentic | Tras fusión + base 1, `workflows/01` = primer **turno** (correcto); actualizar referencias que asumían `00` = shell |

---

## Migration Plan

1. Implementar tras `proposal.md` + delta specs (`gateway-workflow-lifecycle`, `session-persistence`, `session-routing`, `gateway-audit-projection`).
2. Tests unitarios: turno con side-request → agentic fresh → continuation → Stop = 1 workflow en `workflows/01/` con steps `01`…`03`.
3. Tests de routing: `getWorkflowDir(s, 1)` → `workflows/01/`; primer step → `steps/01/`.
4. Sesión live de regresión (repetir análisis de `24b95025-…`); verificar ausencia de `workflows/00` en sesiones nuevas.
5. Sin migración de sesiones en disco; layout 0-based anterior legible pero obsoleto.
6. Retirar `session-shell` de docs y tipos tras sync de specs.
7. Eliminar tests que esperan persistencia de `client-preflight`; añadir test de no-auditoría (R9).

---

## Resoluciones (Open Questions cerradas)

| # | Pregunta | Resolución | Artefacto |
| - | -------- | ---------- | --------- |
| 1 | ¿`UserPromptSubmit` siempre precede al fresh HTTP? | **No garantizado.** Camino feliz confirmado en `24b95025`; **lazy open (D6)** obligatorio para edge cases. | R7, R8, D6 |
| 2 | ¿`Stop` aporta `finalText` fiable tras hop `tool_use`? | **`Stop` no llega con último hop solo `tool_use`** (§9.7). `finalText` = passthrough hook; si ausente → `undefined`. Sin fallback desde steps. | R5, D10 |
| 3 | ¿Side-request concurrente con SSE agentic? | **Serializar** mutaciones HTTP con `withSessionLock` (D11, R11). | D11, R11 |
| 4 | ¿Preflights en v2? | **Fuera del árbol causal** (R9, D7): `AuditWorkflowHandler` retorna `null`; proxy reenvía upstream con normalidad; sin carpeta en `sessions/`. Sin roadmap v2 en este change. | R9, D7, Non-Goals |
| 5 | ¿`agentic` → `turn`? | **Mantener `agentic`** en workflow; `stepKind` para hops. | D12, R3 |
| 6 | ¿Preflights consumen `workflows/01`? | **No.** No tocan contador ni disco; primer turno = `workflows/01/`. | R10.7, D7 |

---

## Referencias

- Modelo conceptual: [`docs/session-audit-model.md`](../../../docs/session-audit-model.md) §2, §3.1, §4, §5
- Evidencia sesión: `sessions/24b95025-9ef8-40c2-bf6d-13174c8f013f/workflows/`
- Change previo (shell introducido): `openspec/changes/archive/2026-06-08--c00040-fix-proxy-audit-telemetry-gaps/`
- Exploración: conversación `openspec-explore` sobre fusión de workflows
